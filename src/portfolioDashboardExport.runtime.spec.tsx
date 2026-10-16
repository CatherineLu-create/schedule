import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { App } from "./main";
import { createInitialMilestoneGovernanceRuntimeState } from "./application/governance/milestoneGovernanceInitializer";
import { publishGovernanceDraft, startGovernanceDraft, updateGovernanceDraft } from "./application/governance/milestoneGovernanceCommands";
import type { CommandResult } from "./domain/governance/milestoneGovernance";
import { toCanonicalScheduleWorkingDraftId, toGovernanceDraftId, toGovernanceReleaseId, toMilestoneDefinitionId, toPersonAssignmentId, toRequirementEnrollmentId, toRequirementWithdrawalId } from "./domain/shared/ids";
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

const projectHeaders = ["Status", "Year", "STN Project Name", "QCI Model Name", "Project Type", "Project Remark", "Customer", "Category", "Product Line", "Panel Size", "CPU", "GPU", "PCB#"];
const scheduleHeaders = ["Kickoff", "ID fix", "ME drawing", "Mockup & DFM", "Tooling start + T1", "ME material for C", "Thermal module for C", "A1 G/O", "A1 SMT", "A1 Test", "A1 Close", "C1 G/O", "C1 SMT", "C1 Pre-Build", "C1 System Build", "C1 Test", "C1 Close", "C2 G/O", "C2 SMT", "C2 Pre-Build", "C2 System Build", "C2 Test", "C2 Close", "RAMP G/O", "ME signoff", "RAMP SMT", "RAMP Pre-build", "RAMP Main build", "SSL/GL", "MDRR"];
const teamHeaders = ["QCI PM", "QCI PjM", "Acer PM", "ME Owner", "EE Owner", "Thermal Owner", "BIOS Owner"];
const allHeaders = [...projectHeaders, ...scheduleHeaders, ...teamHeaders];
const savedRoleNames = ["Synthetic Project Lead", "Synthetic Project Manager", "Synthetic Acer PM", "Synthetic Mechanical Owner", "Synthetic Electrical Owner", "Synthetic Thermal Owner", "Synthetic BIOS Owner"];
function savedAssignment(name: string) {
  return { assignmentId: toPersonAssignmentId(`export-${name}`), name, email: null };
}
const savedTeamWithoutRoster = {
  functions: [], appliedTemplate: null,
  projectRoles: {
    qciPm: savedAssignment("Synthetic Project Lead"), qciPjm: savedAssignment("Synthetic Project Manager"),
    acerPm: savedAssignment("Synthetic Acer PM"), qciMeOwner: savedAssignment("Synthetic Mechanical Owner"),
    qciEeOwner: savedAssignment("Synthetic Electrical Owner"), qciThermalOwner: savedAssignment("Synthetic Thermal Owner"),
    qciBiosOwner: savedAssignment("Synthetic BIOS Owner"),
  },
};

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
  it("exports every leaf in table order with the same saved Team values, without scrolling", () => {
    render(<App />);
    const grid = exportGrid();
    expect(grid[0]).toEqual(allHeaders);
    expect(grid[0]!.filter((_, index) => index !== 5)).toEqual([...screen.getByRole("table", { name: "Projects" }).querySelectorAll('th[scope="col"] span')].map(leaf => leaf.textContent));
    expect(grid).toHaveLength(6);
    expect(grid.slice(1).map(row => row[2])).toEqual(["Manta", "Nautilus", "Orca", "Beluga", "Marlin"]);
    expect(grid[1]![43]).toBe("");
    expect(grid[2]![43]).toBe("DEV QCI PM");
    expect(grid[1]!.slice(43)).toEqual(["", "", "", "", "", "", ""]);
    expect(grid[2]!.slice(43)).toEqual(["DEV QCI PM", "DEV QCI PjM", "DEV Acer PM", "", "", "", ""]);
    const tableRows = screen.getByRole("table", { name: "Projects" }).querySelectorAll("tbody tr");
    grid.slice(1).forEach((row, index) => {
      const displayed = [...tableRows[index]!.querySelectorAll('[data-column-key^="team:"]')].map(cell => cell.textContent === "—" ? "" : cell.textContent);
      expect(row.slice(43)).toEqual(displayed);
    });
    expect(grid[1]![20]).toContain("P: 2026/10/15");
    expect(grid[1]![20]).toContain("A: —");
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
    const source = canonicalProjectFixtures[0]!;
    const remark = "First line\n" + "x".repeat(489);
    render(<App initialState={{ projects: [{ ...source, master: { ...source.master, basicInformation: { ...source.master.basicInformation, remark } }, team: savedTeamWithoutRoster }], schedules: canonicalScheduleFixtures }} />);
    const before = exportGrid();
    expect(before[0]).toEqual(allHeaders);
    expect(before[1]![5]).toBe(remark);
    expect(screen.queryByRole("columnheader", { name: "Project Remark" })).toBeNull();
    expect(before[1]!.slice(43)).toEqual(savedRoleNames);
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
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "First line" } });
    expect(exportGrid()).toEqual([allHeaders]);
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

  it("exports the same seven saved roles, Project Type and latest Current Published dates as Table without roster rows", () => {
    const source = canonicalScheduleFixtures[0]!;
    const latest = { ...source.publishedVersions[0]!, versionNumber: toScheduleVersionNumber(2),
      milestones: source.publishedVersions[0]!.milestones.map((milestone, index) => index === 0
        ? { ...milestone, plan: parseDateOnly("2026-11-01"), actual: null } : milestone) };
    const schedule = { ...source, publishedVersions: [...source.publishedVersions, latest], workingDraft: {
      workingDraftId: toCanonicalScheduleWorkingDraftId("export-only-draft"), reviewSessionIds: [], importCandidates: [],
      milestones: latest.milestones.map(milestone => ({ ...milestone, plan: parseDateOnly("2099-12-31") })),
    } };
    const sourceProject = canonicalProjectFixtures[0]!;
    const project = { ...sourceProject, team: savedTeamWithoutRoster, master: {
      ...sourceProject.master, basicInformation: { ...sourceProject.master.basicInformation, projectType: "regression" as const },
    } };
    render(<App initialState={{ projects: [project], schedules: [schedule] }} />);
    const table = screen.getByRole("table", { name: "Projects" });
    const kickoff = table.querySelector('tbody [data-column-key="schedule:design:kickoff"]');
    expect(kickoff).toHaveTextContent("P: 2026/11/01");
    expect(kickoff).toHaveTextContent("A: —");
    expect(table.querySelector('tbody [data-column-key="projectType"]')).toHaveTextContent("Regression");
    const displayedRoles = [...table.querySelectorAll('tbody [data-column-key^="team:"]')].map(cell => cell.textContent);
    expect(displayedRoles).toEqual(savedRoleNames);
    const output = exportGrid();
    expect(output[1]![13]).toBe("Applicable\nP: 2026/11/01\nA: —");
    expect(output[1]![4]).toBe("Regression");
    expect(output[1]!.slice(43)).toEqual(savedRoleNames);
    expect(output[1]!.slice(43)).toEqual(displayedRoles);
    expect(JSON.stringify(output)).not.toContain("2099/12/31");
    expect(JSON.stringify(output)).not.toContain("2026/09/18");
  });
});
