import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { App } from "./main";
import { createInitialMilestoneGovernanceRuntimeState } from "./application/governance/milestoneGovernanceInitializer";
import { publishGovernanceDraft, startGovernanceDraft, updateGovernanceDraft } from "./application/governance/milestoneGovernanceCommands";
import type { CommandResult } from "./domain/governance/milestoneGovernance";
import { toCanonicalScheduleWorkingDraftId, toGovernanceDraftId, toGovernanceReleaseId, toMilestoneDefinitionId, toRequirementEnrollmentId, toRequirementWithdrawalId } from "./domain/shared/ids";
import { parseDateOnly } from "./domain/shared/dateOnly";
import { toScheduleVersionNumber } from "./domain/schedule/schedule";
import { canonicalProjectFixtures } from "./fixtures/v2/canonicalProjectFixtures";
import { canonicalScheduleFixtures } from "./fixtures/v2/canonicalScheduleFixtures";

vi.mock("xlsx", async importOriginal => ({ ...await importOriginal<typeof import("xlsx")>(), writeFile: vi.fn() }));
vi.mock("./application/governance/milestoneGovernanceInitializer", async importOriginal => {
  const actual = await importOriginal<typeof import("./application/governance/milestoneGovernanceInitializer")>();
  return { ...actual, createInitialMilestoneGovernanceRuntimeState: vi.fn(actual.createInitialMilestoneGovernanceRuntimeState) };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const projectHeaders = ["Status", "Year", "STN Project Name", "QCI Model Name", "Customer", "Category", "Product Line", "Panel Size", "CPU", "GPU", "PCB#"];
const scheduleHeaders = ["Kickoff", "ID fix", "ME drawing", "Mockup & DFM", "Tooling start + T1", "ME material for C", "Thermal module for C", "A1 G/O", "A1 SMT", "A1 Test", "A1 Close", "C1 G/O", "C1 SMT", "C1 Pre-Build", "C1 System Build", "C1 Test", "C1 Close", "C2 G/O", "C2 SMT", "C2 Pre-Build", "C2 System Build", "C2 Test", "C2 Close", "RAMP G/O", "ME signoff", "RAMP SMT", "RAMP Pre-build", "RAMP Main build", "SSL/GL", "MDRR"];
const teamHeaders = ["QCI PM", "QCI PjM", "Acer PM", "ME Owner", "EE Owner", "Thermal Owner", "BIOS Owner"];
const allHeaders = [...projectHeaders, ...scheduleHeaders, ...teamHeaders];

function exportGrid() {
  fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
  const [workbook, filename] = vi.mocked(XLSX.writeFile).mock.calls.at(-1)!;
  expect(filename).toBe("Project_Portfolio_Summary.xlsx");
  expect.soft(workbook.SheetNames).toEqual(["All Projects"]);
  // A real XLSX round trip catches malformed/empty worksheet ranges too.
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const parsed = XLSX.read(bytes, { type: "array" });
  return XLSX.utils.sheet_to_json<string[]>(parsed.Sheets[parsed.SheetNames[0]!]!, { header: 1, defval: "" });
}
function value<T>(result: CommandResult<T, string>): T {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}

describe("All Projects workbook output from App", () => {
  it("exports every leaf in table order, including far-right blank Team fields, without scrolling", () => {
    render(<App />);
    const grid = exportGrid();
    expect(grid[0]).toEqual(allHeaders);
    expect(grid[0]).toEqual([...screen.getByRole("table", { name: "Projects" }).querySelectorAll('th[scope="col"] span')].map(leaf => leaf.textContent));
    expect(grid).toHaveLength(6);
    expect(grid.slice(1).map(row => row[2])).toEqual(["Manta", "Nautilus", "Orca", "Beluga", "Marlin"]);
    expect(grid[1]![41]).toBe("");
    expect(grid[2]![41]).toBe("DEV QCI PM");
    for (const row of grid.slice(1)) expect(row.slice(42)).toEqual(["", "", "", "", "", ""]);
    expect(grid[1]![18]).toContain("P: 2026/10/15");
    expect(grid[1]![18]).toContain("A: —");
  });

  it("exports the exact Search AND filters result and retains headers with zero matches", () => {
    render(<App />);
    fireEvent.change(screen.getByRole("combobox", { name: "Product Line" }), { target: { value: "Aspire (Refresh ID)" } });
    expect(exportGrid().slice(1).map(row => row[2])).toEqual(["Manta", "Marlin"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Manta" } });
    expect(exportGrid().slice(1).map(row => row[2])).toEqual(["Manta"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Nautilus" } });
    expect(exportGrid()).toEqual([allHeaders]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(exportGrid()).toHaveLength(6);
  });

  it("keeps workbook output identical after both table and bottom proxy scroll events and resizing", () => {
    render(<App />);
    const before = exportGrid();
    const tableScroll = screen.getByTestId("portfolio-table-scroll");
    const proxy = screen.getByTestId("portfolio-bottom-scroll");
    tableScroll.scrollLeft = 1234;
    fireEvent.scroll(tableScroll);
    expect(proxy.scrollLeft).toBe(1234);
    proxy.scrollLeft = 2345;
    fireEvent.scroll(proxy);
    expect(tableScroll.scrollLeft).toBe(2345);
    fireEvent.keyDown(screen.getByRole("button", { name: "Resize BIOS Owner column" }), { key: "ArrowRight" });
    expect(exportGrid()).toEqual(before);
  });

  it("uses the released membership after real Governance publish and excludes Draft-only columns", () => {
    const prototype = { projects: canonicalProjectFixtures, schedules: canonicalScheduleFixtures };
    const baseline = createInitialMilestoneGovernanceRuntimeState();
    const started = value(startGovernanceDraft(baseline, toGovernanceDraftId("export-draft")));
    const extra = { ...baseline.releases[0]!.definitions[0]!, id: toMilestoneDefinitionId("export-new"), name: "Export released column", milestoneTypeId: null };
    const draft = value(updateGovernanceDraft(started, { kind: "replace-candidate-release", candidateRelease: {
      ...started.draft!.candidateRelease, definitions: [...baseline.releases[0]!.definitions, extra],
      addableDefinitionIds: [...baseline.releases[0]!.addableDefinitionIds, extra.id], portfolioColumnDefinitionIds: [extra.id],
    } }));
    vi.mocked(createInitialMilestoneGovernanceRuntimeState).mockReturnValueOnce(draft);
    const first = render(<App initialState={prototype} />);
    expect(exportGrid()[0]).toEqual(allHeaders);
    expect(screen.queryByRole("columnheader", { name: "Export released column" })).not.toBeInTheDocument();
    first.unmount();
    const published = value(publishGovernanceDraft(draft, prototype, {
      createReleaseId: () => toGovernanceReleaseId("export-release"), createEnrollmentId: () => toRequirementEnrollmentId("unused"),
      createWithdrawalId: () => toRequirementWithdrawalId("unused"), nowIso: () => "2026-10-01T01:00:00.000Z",
    }));
    vi.mocked(createInitialMilestoneGovernanceRuntimeState).mockReturnValueOnce(published);
    render(<App initialState={prototype} />);
    expect(screen.getByRole("columnheader", { name: "Export released column" })).toBeInTheDocument();
    expect(exportGrid()[0]).toEqual([...projectHeaders, "Export released column", ...teamHeaders]);
    expect(screen.queryByRole("columnheader", { name: "Kickoff" })).not.toBeInTheDocument();
  });

  it("exports the same saved PM and latest Current Published dates as Table while Draft and roster placeholders remain absent", () => {
    const source = canonicalScheduleFixtures[0]!;
    const latest = { ...source.publishedVersions[0]!, versionNumber: toScheduleVersionNumber(2),
      milestones: source.publishedVersions[0]!.milestones.map((milestone, index) => index === 0
        ? { ...milestone, plan: parseDateOnly("2026-11-01"), actual: null } : milestone) };
    const schedule = { ...source, publishedVersions: [...source.publishedVersions, latest], workingDraft: {
      workingDraftId: toCanonicalScheduleWorkingDraftId("export-only-draft"), reviewSessionIds: [], importCandidates: [],
      milestones: latest.milestones.map(milestone => ({ ...milestone, plan: parseDateOnly("2099-12-31") })),
    } };
    const savedTeam = canonicalProjectFixtures[1]!.team!;
    const project = { ...canonicalProjectFixtures[0]!, team: { ...savedTeam,
      projectRoles: { ...savedTeam.projectRoles, qciPm: { ...savedTeam.projectRoles.qciPm!, name: "Saved export PM" } } } };
    render(<App initialState={{ projects: [project], schedules: [schedule] }} />);
    const table = screen.getByRole("table", { name: "Projects" });
    const kickoff = table.querySelector('tbody [data-column-key="schedule:design:kickoff"]');
    expect(kickoff).toHaveTextContent("P: 2026/11/01");
    expect(kickoff).toHaveTextContent("A: —");
    expect(table.querySelector('tbody [data-column-key="team:qciPm"]')).toHaveTextContent("Saved export PM");
    const output = exportGrid();
    expect(output[1]![11]).toBe("Applicable\nP: 2026/11/01\nA: —");
    expect(output[1]![41]).toBe("Saved export PM");
    expect(output[1]!.slice(42)).toEqual(["", "", "", "", "", ""]);
    expect(JSON.stringify(output)).not.toContain("2099/12/31");
    expect(JSON.stringify(output)).not.toContain("2026/09/18");
  });
});
