import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import * as XLSX from "xlsx";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  updateProjectMaster,
  type UpdateProjectMasterInput,
  type UpdateProjectMasterResult,
} from "../../application/commands/projectCommands";
import type { Project } from "../../domain/project/project";
import { devProject003 } from "../../fixtures/v2/canonicalProjectFixtures";
import { App } from "../../main";

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
  return within(dashboardTable()).getAllByRole("row").slice(1);
}

function openProjectByQci(qciModelName: string): void {
  const qciCell = within(dashboardTable()).getByText(qciModelName);
  const row = qciCell.closest("tr");
  if (row === null) throw new Error(`Missing Dashboard row for ${qciModelName}`);
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

describe("Task 2.1 canonical Project/Master runtime", () => {
  it("renders exactly five canonical Dashboard rows with preserved columns, search, and filters", () => {
    render(<App />);

    expect(within(dashboardTable()).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Year", "Customer", "Product Line", "Project Name", "QCI Model Name", "Panel Size",
      "CPU", "GPU", "Project Status", "Current Stage", "MDRR",
    ]);
    expect(dashboardRows()).toHaveLength(5);
    for (const name of ["DEV Empty Project", "DEV Project Alpha", "DEV Draft Review Project", "Signal_A"]) {
      expect(within(dashboardTable()).getAllByText(name).length).toBeGreaterThan(0);
    }

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "DEV-QCI-DRAFT-04" } });
    expect(dashboardRows()).toHaveLength(1);
    expect(within(dashboardTable()).getByText("DEV Draft Review Project")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    const productLineFilter = screen.getByLabelText("Product Line");
    expect(within(productLineFilter).getByRole("option", { name: "DEV Line Alpha" })).toBeInTheDocument();
    expect(within(productLineFilter).queryByRole("option", { name: "Deep Sea" })).not.toBeInTheDocument();
    fireEvent.change(productLineFilter, { target: { value: "DEV Line Alpha" } });

    expect(dashboardRows()).toHaveLength(2);
    expect(within(dashboardTable()).getByText("DEV-QCI-ALPHA-01")).toBeInTheDocument();
    expect(within(dashboardTable()).getByText("DEV-QCI-ALPHA-02")).toBeInTheDocument();
  });

  it("opens the selected canonical Project Master by ProjectId and gates Schedule and Team", () => {
    render(<App />);
    openProjectByQci("DEV-QCI-ALPHA-02");

    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-003");
    expect(within(projectHeader()).getByText("Project Name: DEV Project Alpha")).toBeInTheDocument();
    expect(within(projectHeader()).getByText("QCI Model Name: DEV-QCI-ALPHA-02")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Project Master" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Open Schedule" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open Team" })).toBeDisabled();
    expect(screen.getAllByText("Migration pending")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Open Schedule" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Team" }));
    expect(screen.getByRole("button", { name: "Open Project Master" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("heading", { name: "Current Schedule" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Team Members" })).not.toBeInTheDocument();
  });

  it("shows canonical-safe attention and exports all canonical rows despite active filters", () => {
    render(<App />);
    expect(screen.getByText("No items requiring attention.")).toBeInTheDocument();
    for (const legacyName of [
      "Valour_ARX", "Macan S_ARX", "Mufasa_FRX", "Sportswagon_PNH", "GLS_Ni", "Sorento_PTZ",
    ]) {
      expect(screen.queryByText(legacyName)).not.toBeInTheDocument();
    }

    fireEvent.change(screen.getByLabelText("Product Line"), { target: { value: "DEV Line Alpha" } });
    expect(dashboardRows()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));

    const exportedRows = vi.mocked(XLSX.utils.json_to_sheet).mock.calls[0]![0] as Array<Record<string, string>>;
    expect(exportedRows).toHaveLength(5);
    expect(exportedRows.map((row) => row["Project Name"])).toEqual([
      "DEV Empty Project", "DEV Project Alpha", "DEV Project Alpha", "DEV Draft Review Project", "Signal_A",
    ]);
    expect(exportedRows.every((row) => row["Current Stage"] === "-" && row.MDRR === "-")).toBe(true);
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
    fireEvent.click(screen.getByRole("button", { name: "Back to Dashboard" }));
    expect(dashboardRows()).toHaveLength(6);
    expect(within(dashboardTable()).getByText("Runtime Created Project")).toBeInTheDocument();
  });

  it("opens the sole duplicate match directly after Review Existing", () => {
    render(<App />);
    const dialog = openCreateDialog();
    fillCreateIdentity(dialog, {
      year: "2027", productLineId: "dev-product-line-beta", stnProjectName: "DEV Empty Project",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const reviewDialog = screen.getByRole("dialog", { name: "Create Project" });
    fireEvent.click(within(reviewDialog).getByRole("button", { name: "Review Existing" }));

    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-001");
    expect(screen.queryByRole("dialog", { name: "Create Project" })).not.toBeInTheDocument();
  });

  it("lists all duplicate matches and opens only the explicitly chosen ProjectId", () => {
    render(<App />);
    const dialog = openCreateDialog();
    fillCreateIdentity(dialog, {
      year: "2027", productLineId: "dev-product-line-alpha", stnProjectName: "DEV Project Alpha",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const reviewDialog = screen.getByRole("dialog", { name: "Create Project" });
    fireEvent.click(within(reviewDialog).getByRole("button", { name: "Review Existing" }));

    expect(screen.queryByRole("region", { name: "Project Header" })).not.toBeInTheDocument();
    expect(within(reviewDialog).getByRole("button", { name: /DEV-QCI-ALPHA-01/ })).toBeInTheDocument();
    fireEvent.click(within(reviewDialog).getByRole("button", { name: /DEV-QCI-ALPHA-02/ }));
    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-003");
  });

  it("creates a duplicate anyway with the UUID allocated for the original attempt", () => {
    const randomUuid = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(fixedUuid);
    render(<App />);
    const dialog = openCreateDialog();
    fillCreateIdentity(dialog, {
      year: "2027", productLineId: "dev-product-line-alpha", stnProjectName: "DEV Project Alpha",
      qciModelName: "NEW-DUPLICATE-QCI",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const reviewDialog = screen.getByRole("dialog", { name: "Create Project" });
    fireEvent.click(within(reviewDialog).getByRole("button", { name: "Create Anyway" }));

    expect(projectHeader()).toHaveAttribute("data-project-id", fixedUuid);
    expect(within(projectHeader()).getByText("QCI Model Name: NEW-DUPLICATE-QCI")).toBeInTheDocument();
    expect(randomUuid).toHaveBeenCalledTimes(1);
  });

  it("edits through the Master command, preserves hidden fields, and retains ProjectId", () => {
    render(<App />);
    openProjectByQci("DEV-QCI-ALPHA-02");
    fireEvent.click(within(projectHeader()).getByRole("button", { name: "Edit Project" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Project" });

    const textChanges: Record<string, string> = {
      "STN Project Name": "DEV Project Alpha Revised", "QCI Model Name": "DEV-QCI-ALPHA-REVISED",
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
      expect.objectContaining({ kind: "stnProjectName", originalValue: "DEV Project Alpha" }),
      expect.objectContaining({ kind: "qciModelName", originalValue: "DEV-QCI-ALPHA-02" }),
    ]));
    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-003");
    expect(within(projectHeader()).getByText("Project Name: DEV Project Alpha Revised")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to Dashboard" }));
    expect(within(dashboardTable()).getByText("DEV Project Alpha Revised")).toBeInTheDocument();
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
    expect(within(projectHeader()).getByText("Project Name: DEV Project Alpha")).toBeInTheDocument();

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

    expect(within(projectHeader()).getByText("Project Name: DEV Project Alpha")).toBeInTheDocument();
    fireEvent.click(within(projectHeader()).getByRole("button", { name: "Edit Project" }));
    dialog = screen.getByRole("dialog", { name: "Edit Project" });
    expect(within(dialog).getByLabelText("STN Project Name")).toHaveValue("DEV Project Alpha");
    expect(within(dialog).getByLabelText("QCI Model Name")).toHaveValue("DEV-QCI-ALPHA-02");
  });
});
