import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import * as XLSX from "xlsx";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  updateProjectMaster,
  type UpdateProjectMasterInput,
  type UpdateProjectMasterResult,
} from "../../application/commands/projectCommands";
import { selectDashboardProjectRow } from "../../application/selectors/dashboardProjectRows";
import { selectCurrentPublishedSchedule } from "../../application/selectors/scheduleSelectors";
import type { PrototypeState } from "../../application/state/prototypeState";
import type { Project } from "../../domain/project/project";
import type { CanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import type { ScheduleVersionNumber } from "../../domain/schedule/schedule";
import { devProject003 } from "../../fixtures/v2/canonicalProjectFixtures";
import {
  App,
  ProjectWorkspace,
  type WorkspaceResource,
} from "../../main";

vi.mock("../../application/commands/projectCommands", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../application/commands/projectCommands")>();
  return { ...actual, updateProjectMaster: vi.fn(actual.updateProjectMaster) };
});

vi.mock("xlsx", () => ({
  utils: {
    json_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
    sheet_to_json: vi.fn(() => []),
  },
  writeFile: vi.fn(),
  read: vi.fn(),
}));

const fixedUuid = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function dashboardTable(): HTMLTableElement {
  return screen.getByRole("table");
}

function dashboardRows(): HTMLElement[] {
  return Array.from(dashboardTable().querySelectorAll<HTMLElement>("tbody [data-project-id]"));
}

function dashboardRow(projectId: string): HTMLElement {
  const row = dashboardRows().find((candidate) => candidate.dataset.projectId === projectId);
  if (row === undefined) throw new Error(`Missing canonical Dashboard row for ${projectId}`);
  return row;
}

function openProjectByQci(qciModelName: string): void {
  const qciCell = within(dashboardTable()).getByText(qciModelName);
  const row = qciCell.closest("tr");
  if (row === null) throw new Error(`Missing Dashboard row for ${qciModelName}`);
  fireEvent.click(row);
}

function openProjectByName(projectName: string): void {
  const nameCell = within(dashboardTable()).getByText(projectName);
  const row = nameCell.closest("tr");
  if (row === null) throw new Error(`Missing Dashboard row for ${projectName}`);
  fireEvent.click(row);
}

function openCreateDialog(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
  return screen.getByRole("dialog", { name: "Create Project" });
}

function fillCreateIdentity(
  dialog: HTMLElement,
  values: {
    readonly year: string;
    readonly productLineId: string;
    readonly stnProjectName: string;
    readonly qciModelName?: string;
  },
): void {
  fireEvent.change(within(dialog).getByLabelText("Year"), { target: { value: values.year } });
  fireEvent.change(within(dialog).getByLabelText("Product Line"), {
    target: { value: values.productLineId },
  });
  fireEvent.change(within(dialog).getByLabelText("STN Project Name"), {
    target: { value: values.stnProjectName },
  });
  if (values.qciModelName !== undefined) {
    fireEvent.change(within(dialog).getByLabelText("QCI Model Name"), {
      target: { value: values.qciModelName },
    });
  }
}

function projectHeader(): HTMLElement {
  return screen.getByRole("region", { name: "Project Header" });
}

function LocalScheduleWorkspaceHarness({ schedule }: { schedule: CanonicalProjectSchedule }) {
  const [activeResource, setActiveResource] =
    React.useState<WorkspaceResource>("projectMaster");
  const localState: PrototypeState = {
    projects: [devProject003],
    schedules: [schedule],
  };
  const row = selectDashboardProjectRow(localState, devProject003.id);

  if (row === null) {
    throw new Error("Missing canonical Dashboard row for malformed Schedule harness");
  }

  return (
    <ProjectWorkspace
      activeResource={activeResource}
      feedback={[]}
      onBack={() => undefined}
      onEditProject={() => undefined}
      onOpenResource={setActiveResource}
      project={devProject003}
      row={row}
      scheduleRead={selectCurrentPublishedSchedule(
        localState,
        devProject003.id,
      )}
    />
  );
}

const zeroMilestoneSchedule: CanonicalProjectSchedule = {
  projectId: devProject003.id,
  publishedVersions: [{
    versionNumber: 1 as ScheduleVersionNumber,
    versionNote: null,
    publishedAt: "2026-09-12T00:00:00Z",
    milestones: [],
  }],
  workingDraft: null,
};

const malformedSchedule: CanonicalProjectSchedule = {
  ...zeroMilestoneSchedule,
  publishedVersions: [{
    ...zeroMilestoneSchedule.publishedVersions[0]!,
    versionNumber: 0 as ScheduleVersionNumber,
  }],
};

const currentScheduleWithIgnoredDraft = {
  projectId: devProject003.id,
  publishedVersions: [
    { ...zeroMilestoneSchedule.publishedVersions[0]!, versionNumber: 1 as ScheduleVersionNumber },
    { ...zeroMilestoneSchedule.publishedVersions[0]!, versionNumber: 4 as ScheduleVersionNumber },
    { ...zeroMilestoneSchedule.publishedVersions[0]!, versionNumber: 2 as ScheduleVersionNumber },
  ],
  workingDraft: { sentinel: "must not become Current Schedule" },
} as unknown as CanonicalProjectSchedule;

describe("canonical Portfolio, Project/Master and Schedule runtime", () => {
  it("integrates the canonical Portfolio shell, Current Published grouped table, search, and seven filters", () => {
    render(<App />);

    // Detects the obsolete inline Dashboard and invented attention calculations.
    expect(screen.getByRole("heading", { name: "Project Information", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Portfolio overview")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Project" })).toHaveTextContent("+ Create Project");
    expect(screen.getByRole("button", { name: "Export to Excel" })).toBeVisible();
    const attention = screen.getByRole("region", { name: "Needs Attention" });
    for (const [title, supporting] of [
      ["Blocking Issues", "Calculation not active"],
      ["Milestone Due", "Next 14 days · calculation not active"],
      ["Overdue", "Past due · calculation not active"],
    ]) {
      const card = within(attention).getByRole("group", { name: title });
      expect(within(card).getByText("—")).toBeVisible();
      expect(within(card).getByText(supporting)).toBeVisible();
      expect(within(card).queryByText(/^\d+$/)).not.toBeInTheDocument();
    }
    expect(screen.queryByText("No items requiring attention.")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Projects", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Showing 5 of 5 projects")).toBeInTheDocument();

    // Detects flat headers, wrong 11/35/7 structure, or a diagnostic status leaf.
    const headerRows = dashboardTable().querySelectorAll("thead tr");
    expect(headerRows).toHaveLength(3);
    expect(Array.from(headerRows[0]!.querySelectorAll("th"), (header) => [header.textContent, header.colSpan])).toEqual([
      ["PROJECT INFORMATION", 11], ["SCHEDULE", 31], ["TEAM MEMBER", 7],
    ]);
    expect(Array.from(headerRows[1]!.querySelectorAll("th"), (header) => header.textContent)).toEqual([
      "Core fields", "Design", "ME Portion", "Thermal", "A", "C1-stage", "C2-stage", "RAMP-stage", "MDRR", "Project Roles", "Standard Function Owners",
    ]);
    const leaves = Array.from(headerRows[2]!.querySelectorAll("th"));
    expect(leaves.slice(0, 11).map((header) => header.querySelector("span")?.textContent)).toEqual([
      "Status", "Year", "STN Project Name", "QCI Model Name", "Customer", "Category", "Product Line", "Panel Size", "CPU", "GPU", "PCB#",
    ]);
    expect(leaves.filter((header) => header.dataset.columnKey?.startsWith("schedule:"))).toHaveLength(31);
    expect(leaves.some((header) => header.dataset.columnKey?.startsWith("schedule:a-a2-stage:"))).toBe(false);
    expect(leaves.filter((header) => header.dataset.columnKey?.startsWith("team:")).map((header) => header.querySelector("span")?.textContent)).toEqual([
      "QCI PM", "QCI PjM", "Acer PM", "ME Owner", "EE Owner", "Thermal Owner", "BIOS Owner",
    ]);
    expect(leaves).toHaveLength(49);
    expect(within(dashboardTable()).queryByRole("columnheader", { name: /Current Published|Schedule Status|Diagnostic/ })).not.toBeInTheDocument();
    expect(dashboardRows()).toHaveLength(5);
    expect(dashboardRows().map((row) => row.dataset.projectId)).toEqual([
      "dev-project-001", "dev-project-002", "dev-project-003", "dev-project-004", "dev-project-005",
    ]);
    for (const name of ["Manta", "Nautilus", "Orca", "Beluga", "Marlin"]) {
      expect(within(dashboardTable()).getAllByText(name).length).toBeGreaterThan(0);
    }

    // Detects last-array v1 reads, collapsed empty states, and Team fixture leakage.
    const kickoffCell = dashboardRow("dev-project-001").querySelector('[data-column-key="schedule:design:kickoff"]')!;
    expect(kickoffCell).toHaveAttribute("title", "Published v01 · Kickoff");
    expect(kickoffCell).toHaveTextContent("P: 2026/09/18");
    for (const id of ["dev-project-002", "dev-project-003", "dev-project-004", "dev-project-005"]) {
      const cells = dashboardRow(id).querySelectorAll('[data-domain="schedule"]');
      expect(cells).toHaveLength(31);
      for (const cell of cells) { expect(cell).toHaveAttribute("title", "No published schedule"); expect(cell).toHaveTextContent(/^—$/); }
    }
    for (const row of dashboardRows()) {
      const cells = row.querySelectorAll('[data-domain="team"]');
      expect(cells).toHaveLength(7);
      for (const cell of cells) { expect(cell).toHaveTextContent(/^—$/); expect(cell).toHaveAttribute("title", "Migration pending"); }
    }
    expect(screen.queryByText("DEV Project 003 QCI PM")).not.toBeInTheDocument();

    // Detects missing canonical predicates or accidentally enabled unsupported fields.
    const filterPanel = screen.getByRole("region", { name: "Search / Filters" });
    const labels = ["Year", "Customer", "Status", "Category", "Product Line", "Panel Size", "CPU", "GPU", "QCI PM"];
    const controls = within(filterPanel).getAllByRole("combobox");
    expect(controls).toHaveLength(9);
    labels.forEach((label, index) => {
      expect(controls[index]).toHaveAccessibleName(label);
      if (label === "Category" || label === "QCI PM") {
        expect(controls[index]).toBeDisabled();
        expect(controls[index]).toHaveAccessibleDescription(/Not available in V2.2|Migration pending/);
        expect(within(controls[index]).getAllByRole("option")).toHaveLength(1);
      } else expect(controls[index]).toBeEnabled();
    });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "DEV-QCI-DRAFT-04" } });
    expect(dashboardRows()).toHaveLength(1);
    expect(within(dashboardTable()).getByText("Beluga")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    const productLineFilter = screen.getByLabelText("Product Line");
    expect(within(productLineFilter).getByRole("option", { name: "Aspire (Refresh ID)" })).toBeInTheDocument();
    expect(within(productLineFilter).queryByRole("option", { name: "Deep Sea" })).not.toBeInTheDocument();
    fireEvent.change(productLineFilter, { target: { value: "Aspire (Refresh ID)" } });

    expect(dashboardRows()).toHaveLength(2);
    expect(within(dashboardTable()).getByText("Manta")).toBeInTheDocument();
    expect(within(dashboardTable()).getByText("Marlin")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "MP" } });
    expect(dashboardRows().map((row) => row.dataset.projectId)).toEqual(["dev-project-005"]);
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("GPU"), { target: { value: "GN20-X6" } });
    expect(dashboardRows()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Customer"), { target: { value: "DEV Customer B" } });
    expect(dashboardRows()).toHaveLength(0);
    expect(screen.getByText("Showing 0 of 5 projects")).toBeInTheDocument();
    expect(screen.getByText("No projects match the current search and filters")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(dashboardRows()).toHaveLength(5);
    // Detects name-based selection of the other identically named Project.
    fireEvent.click(within(dashboardRow("dev-project-003")).getByRole("button", { name: "Open Project Orca" }));
    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-003");
    expect(screen.getByRole("heading", { name: "Project Master" })).toBeInTheDocument();
  }, 10_000);

  it("opens Manta's canonical Current Published Schedule by ProjectId while keeping Team Member gated", () => {
    render(<App />);
    openProjectByName("Manta");

    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-001");
    expect(within(projectHeader()).getByText("Project Name: Manta")).toBeInTheDocument();
    const resources = screen.getByRole("region", { name: "Resources" });
    expect(within(resources).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Schedule", "Team Member", "Weekly Report", "AVL",
    ]);
    expect(within(resources).queryByText("Project Master")).not.toBeInTheDocument();
    expect(within(resources).getAllByText("Migration pending")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Open Schedule" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Open Team Member" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open Weekly Report" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open AVL" })).toBeDisabled();
    expect(screen.getByText("Official read-only")).toBeInTheDocument();
    expect(screen.getAllByText("Migration pending")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Open Schedule" }));
    expect(screen.getByRole("button", { name: "Open Schedule" })).toHaveAttribute("aria-pressed", "true");
    const scheduleView = screen.getByRole("region", { name: "Current Schedule" });
    expect(within(scheduleView).getByText("Published v01")).toBeInTheDocument();
    expect(within(scheduleView).getByText("Kickoff")).toBeInTheDocument();
    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-001");

    fireEvent.click(screen.getByRole("button", { name: "Open Team Member" }));
    expect(screen.getByRole("button", { name: "Open Schedule" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("heading", { name: "Team Members" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "← Dashboard" }));
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    openProjectByName("Nautilus");

    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-002");
    expect(screen.queryByRole("region", { name: "Current Schedule" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Schedule" }));
    const nextScheduleView = screen.getByRole("region", { name: "Current Schedule" });
    expect(within(nextScheduleView).getByText("-")).toBeInTheDocument();
    expect(within(nextScheduleView).queryByText("No published schedule")).not.toBeInTheDocument();
    expect(within(nextScheduleView).queryByText(/^Published v/)).not.toBeInTheDocument();
  });

  it("shows the valid no-Published Schedule state", () => {
    render(<App />);
    openProjectByName("Nautilus");

    fireEvent.click(screen.getByRole("button", { name: "Open Schedule" }));

    const scheduleView = screen.getByRole("region", { name: "Current Schedule" });
    expect(within(scheduleView).getByText("-")).toBeInTheDocument();
    expect(within(scheduleView).queryByText("No published schedule")).not.toBeInTheDocument();
    expect(within(scheduleView).queryByText(/^Published v/)).not.toBeInTheDocument();
  });

  it("renders the maximum Published version as Current Schedule and ignores Draft-like data", () => {
    expect(Object.hasOwn(zeroMilestoneSchedule, "workingDraft")).toBe(true);
    expect(Reflect.get(zeroMilestoneSchedule, "workingDraft")).toBeNull();
    render(<LocalScheduleWorkspaceHarness schedule={currentScheduleWithIgnoredDraft} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Schedule" }));

    const currentSchedule = screen.getByRole("region", { name: "Current Schedule" });
    expect(within(currentSchedule).getByText("Published v04")).toBeInTheDocument();
    expect(within(currentSchedule).queryByText(/must not become Current Schedule/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Working Draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start Draft|Edit Draft|Publish|Cancel Draft/ })).not.toBeInTheDocument();
  });

  it("shows a Published version with zero milestones distinctly", () => {
    render(<LocalScheduleWorkspaceHarness schedule={zeroMilestoneSchedule} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Schedule" }));

    const scheduleView = screen.getByRole("region", { name: "Current Schedule" });
    expect(within(scheduleView).getByText("Published v01")).toBeInTheDocument();
    expect(within(scheduleView).getByText("No milestones")).toBeInTheDocument();
    expect(within(scheduleView).queryByText("No published schedule")).not.toBeInTheDocument();
  });

  it("isolates malformed Schedule data from the canonical Project Master", () => {
    render(<LocalScheduleWorkspaceHarness schedule={malformedSchedule} />);

    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-003");
    expect(within(projectHeader()).getByText("Project Name: Orca")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Schedule" }));
    expect(screen.getByText("Schedule data unavailable")).toBeInTheDocument();

    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-003");
    expect(within(projectHeader()).getByText("Project Name: Orca")).toBeInTheDocument();
    expect(within(projectHeader()).getByRole("button", { name: "Edit Project" })).toBeEnabled();
  });

  it("shows canonical-safe attention and exports all canonical rows despite active filters", () => {
    render(<App />);
    expect(screen.queryByText("No items requiring attention.")).not.toBeInTheDocument();
    for (const legacyName of [
      "Valour_ARX", "Macan S_ARX", "Mufasa_FRX", "Sportswagon_PNH", "GLS_Ni", "Sorento_PTZ",
    ]) {
      expect(screen.queryByText(legacyName)).not.toBeInTheDocument();
    }

    fireEvent.change(screen.getByLabelText("Product Line"), { target: { value: "Aspire (Refresh ID)" } });
    expect(dashboardRows()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));

    const exportedRows = vi.mocked(XLSX.utils.json_to_sheet).mock.calls[0]![0] as Array<Record<string, string>>;
    expect(exportedRows).toHaveLength(5);
    expect(exportedRows.map((row) => row["Project Name"])).toEqual([
      "Manta", "Nautilus", "Orca", "Beluga", "Marlin",
    ]);
    expect(vi.mocked(XLSX.writeFile)).toHaveBeenCalledWith(
      expect.anything(),
      "Project_Portfolio_Summary.xlsx",
    );
    expect(exportedRows.every((row) => row["Current Stage"] === "-" && row.MDRR === "-")).toBe(true);
    // Detects widening the export to Schedule/Team or dropping reviewed Master fields.
    for (const row of exportedRows) expect(Object.keys(row)).toEqual([
      "Year", "Customer", "Product Line", "Project Name", "QCI Model Name", "Acer Model Name", "Acer Marketing Name", "Panel Size", "CPU", "GPU", "SSID", "RMN", "Project Status", "Current Stage", "MDRR",
    ]);
  });

  it("rejects missing Create fields without adding a Project", () => {
    render(<App />);
    const dialog = openCreateDialog();
    for (const label of [
      "STN Project Name", "QCI Model Name", "Acer Model Name", "Acer Marketing Name", "Year",
      "Customer", "Product Line", "Panel Size", "CPU", "GPU", "SSID", "RMN", "Project Status",
    ]) {
      expect(within(dialog).getByLabelText(label)).toBeInTheDocument();
    }
    expect(within(dialog).queryByLabelText("Project Name")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(within(dialog).getByText("Year is required.")).toBeInTheDocument();
    expect(within(dialog).getByText("Product Line is required.")).toBeInTheDocument();
    expect(within(dialog).getByText("STN Project Name is required.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Create Project" })).toBeInTheDocument();
    expect(dashboardRows()).toHaveLength(5);
  });

  it("creates an ordinary canonical Project with one UUID and opens Project Master", () => {
    const randomUuid = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(fixedUuid);
    render(<App />);
    const dialog = openCreateDialog();
    fillCreateIdentity(dialog, {
      year: "2030", productLineId: "dev-product-line-beta", stnProjectName: "Runtime Created Project",
      qciModelName: "RUNTIME-CREATED-QCI",
    });
    expect(within(dialog).getByLabelText("Customer")).toHaveValue("");
    expect(within(dialog).getByLabelText("Project Status")).toHaveValue("");
    fireEvent.change(within(dialog).getByLabelText("Acer Model Name"), { target: { value: "Runtime Acer" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(projectHeader()).toHaveAttribute("data-project-id", fixedUuid);
    expect(within(projectHeader()).getByText("Project Name: Runtime Created Project")).toBeInTheDocument();
    expect(within(projectHeader()).getByText("Customer: Acer")).toBeInTheDocument();
    expect(within(projectHeader()).getByText("RFQ")).toBeInTheDocument();
    expect(randomUuid).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Open Schedule" }));
    expect(within(screen.getByRole("region", { name: "Current Schedule" })).getByText("-")).toBeInTheDocument();
    expect(projectHeader()).toHaveAttribute("data-project-id", fixedUuid);
    fireEvent.click(screen.getByRole("button", { name: "← Dashboard" }));
    expect(dashboardRows()).toHaveLength(6);
    expect(within(dashboardTable()).getByText("Runtime Created Project")).toBeInTheDocument();
  });

  it("opens the sole duplicate match directly after Review Existing", () => {
    render(<App />);
    const dialog = openCreateDialog();
    fillCreateIdentity(dialog, {
      year: "2027", productLineId: "demo-product-line-aspire-refresh-id", stnProjectName: "Manta",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const reviewDialog = screen.getByRole("dialog", { name: "Create Project" });
    fireEvent.click(within(reviewDialog).getByRole("button", { name: "Review Existing" }));

    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-001");
    expect(screen.queryByRole("dialog", { name: "Create Project" })).not.toBeInTheDocument();
  });

  it("lists all duplicate matches and opens only the explicitly chosen ProjectId", () => {
    const firstId = "22222222-2222-4222-8222-222222222222";
    const secondId = "33333333-3333-4333-8333-333333333333";
    const thirdCandidateId = "44444444-4444-4444-8444-444444444444";
    vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce(firstId)
      .mockReturnValueOnce(secondId)
      .mockReturnValueOnce(thirdCandidateId);
    render(<App />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Local Multiple Match" },
    });
    let dialog = openCreateDialog();
    fillCreateIdentity(dialog, {
      year: "2032", productLineId: "dev-product-line-alpha", stnProjectName: "Local Multiple Match",
      qciModelName: "MULTI-QCI-01",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(projectHeader()).toHaveAttribute("data-project-id", firstId);
    fireEvent.click(screen.getByRole("button", { name: "← Dashboard" }));

    dialog = openCreateDialog();
    fillCreateIdentity(dialog, {
      year: "2032", productLineId: "dev-product-line-alpha", stnProjectName: "Local Multiple Match",
      qciModelName: "MULTI-QCI-02",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    let reviewDialog = screen.getByRole("dialog", { name: "Create Project" });
    fireEvent.click(within(reviewDialog).getByRole("button", { name: "Create Anyway" }));
    expect(projectHeader()).toHaveAttribute("data-project-id", secondId);
    fireEvent.click(screen.getByRole("button", { name: "← Dashboard" }));

    dialog = openCreateDialog();
    fillCreateIdentity(dialog, {
      year: "2032", productLineId: "dev-product-line-alpha", stnProjectName: "Local Multiple Match",
      qciModelName: "MULTI-QCI-03",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    reviewDialog = screen.getByRole("dialog", { name: "Create Project" });
    fireEvent.click(within(reviewDialog).getByRole("button", { name: "Review Existing" }));

    expect(screen.queryByRole("region", { name: "Project Header" })).not.toBeInTheDocument();
    expect(within(reviewDialog).getByRole("button", { name: /MULTI-QCI-01/ })).toBeInTheDocument();
    fireEvent.click(within(reviewDialog).getByRole("button", { name: /MULTI-QCI-02/ }));
    expect(projectHeader()).toHaveAttribute("data-project-id", secondId);
  }, 10_000);

  it("creates a duplicate anyway with the UUID allocated for the original attempt", () => {
    const randomUuid = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(fixedUuid);
    render(<App />);
    const dialog = openCreateDialog();
    fillCreateIdentity(dialog, {
      year: "2027", productLineId: "demo-product-line-game-pad", stnProjectName: "Nautilus",
      qciModelName: "NEW-DUPLICATE-QCI",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const reviewDialog = screen.getByRole("dialog", { name: "Create Project" });
    fireEvent.click(within(reviewDialog).getByRole("button", { name: "Create Anyway" }));

    expect(projectHeader()).toHaveAttribute("data-project-id", fixedUuid);
    expect(within(projectHeader()).getByText("QCI Model Name: NEW-DUPLICATE-QCI")).toBeInTheDocument();
    expect(randomUuid).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Open Schedule" }));
    expect(within(screen.getByRole("region", { name: "Current Schedule" })).getByText("-")).toBeInTheDocument();
    expect(screen.queryByText("Schedule data unavailable")).not.toBeInTheDocument();
    expect(projectHeader()).toHaveAttribute("data-project-id", fixedUuid);
  });

  it("edits through the Master command, preserves hidden fields, and retains ProjectId", () => {
    render(<App />);
    openProjectByQci("DEV-QCI-ALPHA-02");
    fireEvent.click(within(projectHeader()).getByRole("button", { name: "Edit Project" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Project" });

    const textChanges: Record<string, string> = {
      "STN Project Name": "Orca Revised", "QCI Model Name": "DEV-QCI-ALPHA-REVISED",
      "Acer Model Name": "Revised Acer Model", "Acer Marketing Name": "Revised Marketing",
      Year: "2031", SSID: "REVISED-SSID", RMN: "REVISED-RMN",
    };
    for (const [label, value] of Object.entries(textChanges)) {
      fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
    }
    for (const [label, value] of [
      ["Customer", "dev-customer-acer"], ["Product Line", "dev-product-line-beta"],
      ["Panel Size", "dev-panel-size-18"], ["CPU", "dev-cpu-beta"], ["GPU", "dev-gpu-beta"],
      ["Project Status", "status-mp"],
    ]) {
      fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
    }
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    const commandCall = vi.mocked(updateProjectMaster).mock.calls.at(-1);
    expect(commandCall).toBeDefined();
    const candidate = commandCall![1].master;
    expect(candidate.basicInformation.category).toBe(devProject003.master.basicInformation.category);
    expect(candidate.platformHardware.pcbNumber).toBe(devProject003.master.platformHardware.pcbNumber);
    expect(candidate.platformHardware.housingNumber).toBe(devProject003.master.platformHardware.housingNumber);
    expect(candidate.leverage).toEqual(devProject003.master.leverage);
    expect(candidate.cover).toEqual(devProject003.master.cover);
    expect(candidate.mechanical).toEqual(devProject003.master.mechanical);
    expect(candidate.other).toEqual(devProject003.master.other);
    const commandResult = vi.mocked(updateProjectMaster).mock.results.at(-1)?.value as UpdateProjectMasterResult;
    expect(commandResult.project.identityAliases).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "stnProjectName", originalValue: "Orca" }),
      expect.objectContaining({ kind: "qciModelName", originalValue: "DEV-QCI-ALPHA-02" }),
    ]));
    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-003");
    expect(within(projectHeader()).getByText("Project Name: Orca Revised")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Schedule" }));
    expect(within(screen.getByRole("region", { name: "Current Schedule" })).getByText("-")).toBeInTheDocument();
    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-003");
    fireEvent.click(screen.getByRole("button", { name: "← Dashboard" }));
    expect(within(dashboardTable()).getByText("Orca Revised")).toBeInTheDocument();
  });

  it("keeps a blocked Edit open without replacement and completes an Advisory-only Edit", () => {
    vi.mocked(updateProjectMaster)
      .mockImplementationOnce((project: Project, input: UpdateProjectMasterInput) => ({
        project: { ...project, master: input.master },
        issues: [{
          code: "projectMaster.completeness.blocked", domain: "projectMaster", source: "data",
          severity: "blocking", message: "Blocked for correction.",
          target: { section: "projectMaster.basicInformation", entityId: project.id },
        }],
      }))
      .mockImplementationOnce((project: Project, input: UpdateProjectMasterInput) => ({
        project: { ...project, master: input.master },
        issues: [{
          code: "projectMaster.data.advisory", domain: "projectMaster", source: "data",
          severity: "advisory", message: "Advisory saved.",
          target: { section: "projectMaster.basicInformation", entityId: project.id },
        }],
      }));
    render(<App />);
    openProjectByQci("DEV-QCI-ALPHA-02");
    fireEvent.click(within(projectHeader()).getByRole("button", { name: "Edit Project" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Project" });
    fireEvent.change(within(dialog).getByLabelText("STN Project Name"), { target: { value: "Blocked Candidate" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    expect(screen.getByRole("dialog", { name: "Edit Project" })).toBeInTheDocument();
    expect(within(dialog).getByText("Blocked for correction.")).toBeInTheDocument();
    expect(within(projectHeader()).getByText("Project Name: Orca")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("STN Project Name"), { target: { value: "Advisory Candidate" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));
    expect(screen.queryByRole("dialog", { name: "Edit Project" })).not.toBeInTheDocument();
    expect(within(projectHeader()).getByText("Project Name: Advisory Candidate")).toBeInTheDocument();
    expect(screen.getByText("Advisory saved.")).toBeInTheDocument();
  });

  it("cancels Edit and discards only transient form changes", () => {
    render(<App />);
    openProjectByQci("DEV-QCI-ALPHA-02");
    fireEvent.click(within(projectHeader()).getByRole("button", { name: "Edit Project" }));
    let dialog = screen.getByRole("dialog", { name: "Edit Project" });
    fireEvent.change(within(dialog).getByLabelText("STN Project Name"), { target: { value: "Discard Me" } });
    fireEvent.change(within(dialog).getByLabelText("QCI Model Name"), { target: { value: "DISCARD-QCI" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(within(projectHeader()).getByText("Project Name: Orca")).toBeInTheDocument();
    fireEvent.click(within(projectHeader()).getByRole("button", { name: "Edit Project" }));
    dialog = screen.getByRole("dialog", { name: "Edit Project" });
    expect(within(dialog).getByLabelText("STN Project Name")).toHaveValue("Orca");
    expect(within(dialog).getByLabelText("QCI Model Name")).toHaveValue("DEV-QCI-ALPHA-02");
  });
});
