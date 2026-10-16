import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { createInitialSelfServiceReferenceCatalogs } from "./application/reference-data/selfServiceCatalogs";
import { selectPortfolioDashboardRows } from "./application/selectors/portfolioDashboardRows";
import { selectProjectLeverageDisplay } from "./application/selectors/projectReferenceOptions";
import type { PrototypeState } from "./application/state/prototypeState";
import { canonicalProjectFixtures } from "./fixtures/v2/canonicalProjectFixtures";
import { toCatalogItemId, toProjectId } from "./domain/shared/ids";
import { coverCatalog } from "./config/v2/referenceData";
import { initialGovernanceContext } from "./test/governanceTestUtils";
import { emptyPortfolioDashboardFilters, filterPortfolioDashboardRows, portfolioDashboardFilterKeys, portfolioDashboardFilterOptions } from "./portfolioDashboardFilters";
import { projectMasterReportColumns, projectMasterReportCells, projectMasterReportGroups } from "./projectMasterReportColumns";
import { createProjectMasterReportWorkbook, projectMasterReportFilename } from "./projectMasterReportExport";
import { ProjectMasterReportView } from "./projectMasterReportView";

afterEach(cleanup);
const catalogs = createInitialSelfServiceReferenceCatalogs();
const state: PrototypeState = { projects: canonicalProjectFixtures, schedules: [] };
const context = initialGovernanceContext();
const rows = selectPortfolioDashboardRows(state, catalogs, context);
const allGroups = projectMasterReportGroups.map(group => group.key);
const columns = projectMasterReportColumns(allGroups);
const grid = (book: XLSX.WorkBook) => XLSX.utils.sheet_to_json<string[]>(book.Sheets["Project Master Report"], { header: 1 });

describe("Project Master Report canonical values and workbook", () => {
  it("includes the complete approved inventory exactly once for every group combination", () => {
    expect(columns).toHaveLength(34);
    expect(new Set(columns.map(column => column.key)).size).toBe(34);
    expect(columns.filter(column => column.group === "projectMaster").slice(-3).map(column => column.label)).toEqual(["Project Status", "Project Type", "Project Remark"]);
    expect(columns.map(column => column.label)).not.toContain("Housing Number");
    expect(columns.map(column => column.label)).not.toContain("Remark");
    for (let mask = 0; mask < 8; mask++) {
      const selected = allGroups.filter((_, index) => mask & (1 << index));
      const schema = projectMasterReportColumns(selected);
      expect(schema.some(column => column.key === "projectType")).toBe(selected.includes("projectMaster"));
      expect(schema.slice(0, 3).map(column => column.label)).toEqual(["Year", "STN Project Name", "QCI Model Name"]);
      expect(schema.slice(3).every(column => selected.includes(column.group as typeof selected[number]))).toBe(true);
      expect(grid(createProjectMasterReportWorkbook(state, rows, schema))).toEqual([
        schema.map(column => column.label), ...rows.map(row => projectMasterReportCells(state, row, schema)),
      ]);
      expect(grid(createProjectMasterReportWorkbook(state, [], schema))).toEqual([schema.map(column => column.label)]);
    }
    expect(projectMasterReportFilename(new Date(2026, 0, 2))).toBe("PIP_Project_Master_Report_20260102.xlsx");
  });

  it("resolves current catalog labels, exact text, units and direct leverage from all current projects without mutation", () => {
    const source = canonicalProjectFixtures[0]!;
    const shark = { ...source, id: toProjectId("report-shark"), master: { ...source.master, basicInformation: { ...source.master.basicInformation, stnProjectName: "Shark" } } };
    const falcon = { ...source, id: toProjectId("report-falcon"), master: { ...source.master, basicInformation: { ...source.master.basicInformation, year: 2028, stnProjectName: "Falcon renamed", qciModelName: "Current QCI" }, leverage: { ...source.master.leverage, pcbLeverage: shark.id } } };
    const manta = { ...source, master: { ...source.master,
      modelRegulatory: { ...source.master.modelRegulatory, acerModelName: "  exact text  ", ssid: "", rmn: "  " },
      mechanical: { product: { productLengthMm: 0, productWidthMm: 123.45, productHeightMm: null, productWeightG: 5 }, package: { packageLengthMm: 10, packageWidthMm: 20, packageHeightMm: 30, grossWeightG: 40 } },
      cover: { aCover: coverCatalog[0]!.id, bCover: null, cCover: toCatalogItemId("missing-cover"), dCover: coverCatalog[1]!.id },
      leverage: { pcbLeverage: falcon.id, aLeverage: source.id, bLeverage: null, cLeverage: toProjectId("dangling-project"), dLeverage: falcon.id },
    } };
    const current = { projects: [manta, falcon, shark], schedules: [] };
    const currentCatalogs = { ...catalogs, cpu: catalogs.cpu.map(item => ({ ...item, displayName: `Current ${item.displayName}` })) };
    const before = JSON.stringify(current);
    const selectedRow = selectPortfolioDashboardRows(current, currentCatalogs, context)[0]!;
    const values = Object.fromEntries(columns.map((column, index) => [column.key, projectMasterReportCells(current, selectedRow, columns)[index]]));
    expect(values.cpu).toBe(selectedRow.project.cpu);
    expect(values.cpu).toMatch(/^Current /);
    expect(values.acerModelName).toBe("  exact text  ");
    expect(values.ssid).toBe("-");
    expect(values.rmn).toBe("-");
    expect(values.productLengthMm).toBe("0 mm");
    expect(values.productWidthMm).toBe("123.45 mm");
    expect(values.productHeightMm).toBe("—");
    expect(values.productWeightG).toBe("5 g");
    expect(values.grossWeightG).toBe("40 g");
    expect(values.aCover).toBe(coverCatalog[0]!.displayName);
    expect(values.bCover).toBe("—");
    expect(values.cCover).toBe("—");
    expect(values.pcbLeverage).toBe("2028 | Falcon renamed | Current QCI");
    expect(values.aLeverage).toBe("New Design");
    expect(values.bLeverage).toBe("—");
    expect(values.cLeverage).toBe("Unavailable Project");
    for (const [key, display] of Object.entries(selectProjectLeverageDisplay(current, manta.id)!)) expect(values[key]).toBe(display);
    const output = grid(createProjectMasterReportWorkbook(current, [selectedRow], columns));
    expect(output).toHaveLength(2);
    expect(JSON.stringify(output)).not.toContain("Shark");
    expect(JSON.stringify(output)).not.toContain("dangling-project");
    expect(JSON.stringify(output)).not.toContain(manta.id);
    expect(JSON.stringify(current)).toBe(before);
    const renamed = { ...current, projects: current.projects.map(project => project.id === falcon.id ? { ...project, master: { ...project.master, basicInformation: { ...project.master.basicInformation, stnProjectName: "Falcon latest" } } } : project) };
    expect(projectMasterReportCells(renamed, selectedRow, columns)).toContain("2028 | Falcon latest | Current QCI");
  });

  it("writes one unmerged worksheet with Auto Filter and no pane even in serialized XLSX", () => {
    const book = createProjectMasterReportWorkbook(state, rows, columns);
    const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" });
    const parsed = XLSX.read(bytes, { type: "array", bookFiles: true });
    expect(parsed.SheetNames).toEqual(["Project Master Report"]);
    const sheet = parsed.Sheets["Project Master Report"];
    expect(sheet["!autofilter"]).toEqual({ ref: `A1:AH${rows.length + 1}` });
    expect(sheet["!merges"]).toBeUndefined();
    const archive = parsed as XLSX.WorkBook & { files: Record<string, { content: Uint8Array }> };
    const xml = new TextDecoder().decode(archive.files["xl/worksheets/sheet1.xml"].content);
    expect(xml).not.toMatch(/<pane\b|<mergeCells\b/);
    expect(grid(parsed)).toEqual(grid(book));
  });
});

describe("Reports selection parity", () => {
  it.each(portfolioDashboardFilterKeys.filter(key => key !== "projectType"))("uses Dashboard options and predicate for %s, with AND search, chips and Clear all", (key) => {
    const onExport = vi.fn();
    render(<ProjectMasterReportView state={state} rows={rows} onBack={vi.fn()} onExport={onExport} />);
    expect(screen.queryByRole("combobox", { name: "Project Type" })).toBeNull();
    const keyIndex = portfolioDashboardFilterKeys.filter(key => key !== "projectType").indexOf(key);
    const select = screen.getAllByRole("combobox")[keyIndex];
    const expectedOptions = portfolioDashboardFilterOptions(rows)[key];
    expect(within(select).getAllByRole("option").map(option => option.textContent)).toEqual(["All", ...expectedOptions.map(option => option.label)]);
    for (const option of expectedOptions) {
      fireEvent.change(select, { target: { value: option.value } });
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "m" } });
      const expected = filterPortfolioDashboardRows(rows, "m", { ...emptyPortfolioDashboardFilters, [key]: option.value });
      const actualIds = [...screen.getByRole("table").querySelectorAll("tbody tr[data-project-id]")].map(row => row.getAttribute("data-project-id"));
      expect(actualIds).toEqual(expected.map(row => row.projectId));
      expect(screen.getByText(`${expected.length} ${expected.length === 1 ? "Project" : "Projects"}`)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
      expect(onExport.mock.calls.at(-1)![0]).toEqual(expected);
    }
    if (expectedOptions.length) {
      fireEvent.click(screen.getByRole("button", { name: /^Remove / }));
      expect(select).toHaveValue("");
      fireEvent.change(select, { target: { value: expectedOptions[0]!.value } });
      fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
      expect(select).toHaveValue("");
      expect(screen.getByRole("searchbox")).toHaveValue("m");
    }
  });
});


it("adds only the formal Remark to Project Master for all group combinations without expanding search", () => {
  const withRemark = { ...state, projects: state.projects.map(project => ({ ...project, master: { ...project.master,
    basicInformation: { ...project.master.basicInformation, remark: "Customer requested BIOS update" },
    other: { remark: "DEV fixture annotation" } } })) };
  const notedRows = selectPortfolioDashboardRows(withRemark, catalogs, context);
  expect(filterPortfolioDashboardRows(notedRows, "DEV fixture annotation", emptyPortfolioDashboardFilters)).toEqual([]);
  expect(filterPortfolioDashboardRows(notedRows, "Customer requested BIOS update", emptyPortfolioDashboardFilters)).toEqual([]);
  for (let mask = 0; mask < 8; mask++) {
    const selected = allGroups.filter((_, index) => mask & (1 << index));
    const schema = projectMasterReportColumns(selected);
    const remarkIndex = schema.findIndex(column => column.key === "projectRemark");
    expect(remarkIndex >= 0).toBe(selected.includes("projectMaster"));
    const book = createProjectMasterReportWorkbook(withRemark, notedRows, schema);
    expect(book.SheetNames).toEqual(["Project Master Report"]);
    const output = grid(book);
    if (remarkIndex >= 0) {
      expect(output[0][remarkIndex]).toBe("Project Remark");
      expect(output.slice(1).map(row => row[remarkIndex])).toEqual(Array(rows.length).fill("Customer requested BIOS update"));
    }
    // Every pre-existing column and value remains unchanged.
    const existingColumns = schema.filter(column => column.key !== "projectRemark");
    expect(output.map(row => row.filter((_, index) => index !== remarkIndex))).toEqual(
      grid(createProjectMasterReportWorkbook(state, rows, existingColumns)));
    expect(JSON.stringify(output)).not.toContain("DEV fixture annotation");
  }
});

it.each([
  { name: "missing", remark: undefined, preview: "\u2014", exported: "" },
  { name: "null", remark: null, preview: "\u2014", exported: "" },
  { name: "empty", remark: "", preview: "\u2014", exported: "" },
  { name: "formal text", remark: "Customer requested BIOS update", preview: "Customer requested BIOS update", exported: "Customer requested BIOS update" },
  { name: "literal dash text", remark: "-", preview: "-", exported: "-" },
])("uses only the formal $name Remark in preview and Excel", ({ remark, preview, exported }) => {
  const source = state.projects[0]!;
  const current = { ...state, projects: [{ ...source, master: { ...source.master,
    basicInformation: { ...source.master.basicInformation, remark },
    other: { remark: "User Trial demo seed: Example" } } }] };
  const currentRows = selectPortfolioDashboardRows(current, catalogs, context);
  const before = JSON.stringify(current);
  render(<ProjectMasterReportView state={current} rows={currentRows} onBack={vi.fn()} onExport={vi.fn()} />);
  expect(screen.getByRole("columnheader", { name: "Project Remark" })).toHaveAttribute("data-group", "projectMaster");
  const cell = screen.getByRole("table").querySelector('tbody td[data-column-key="projectRemark"]');
  expect(cell?.textContent).toBe(preview);
  expect(cell).toHaveClass("whitespace-pre-wrap", "break-words");
  expect(screen.queryByText(/User Trial demo seed:/)).not.toBeInTheDocument();
  const output = grid(createProjectMasterReportWorkbook(current, currentRows, columns));
  expect(output[1][output[0].indexOf("Project Remark")]).toBe(exported);
  expect(JSON.stringify(output)).not.toContain("User Trial demo seed:");
  fireEvent.click(screen.getByRole("checkbox", { name: "Project Master" }));
  expect(screen.queryByRole("columnheader", { name: "Project Remark" })).not.toBeInTheDocument();
  expect(screen.getByRole("table").querySelector('[data-column-key="projectRemark"]')).toBeNull();
  expect(JSON.stringify(current)).toBe(before);
});


it.each([
  { projectType: "new" as const, preview: "New", exported: "New" },
  { projectType: "regression" as const, preview: "Regression", exported: "Regression" },
  { projectType: null, preview: "\u2014", exported: "" },
  { projectType: undefined, preview: "\u2014", exported: "" },
])("presents saved canonical Project Type $projectType without inference or backfill", ({ projectType, preview, exported }) => {
  const source = state.projects[0]!;
  const current = { ...state, projects: [{ ...source, master: { ...source.master,
    basicInformation: { ...source.master.basicInformation, ...(projectType === undefined ? {} : { projectType }) },
  } }] };
  if (projectType === undefined) expect(current.projects[0].master.basicInformation).not.toHaveProperty("projectType");
  const before = JSON.stringify(current);
  // Keep the old row projection: the saved canonical Project remains the report authority.
  const sourceRows = rows.filter(row => row.projectId === source.id);
  render(<ProjectMasterReportView state={current} rows={sourceRows} onBack={vi.fn()} onExport={vi.fn()} />);
  expect(screen.getByRole("columnheader", { name: "Project Type" })).toHaveAttribute("data-group", "projectMaster");
  expect(screen.getByRole("table").querySelector('tbody td[data-column-key="projectType"]')?.textContent).toBe(preview);
  expect(screen.queryByRole("combobox", { name: "Project Type" })).not.toBeInTheDocument();
  const output = grid(createProjectMasterReportWorkbook(current, sourceRows, columns));
  expect(output[1][output[0].indexOf("Project Type")]).toBe(exported);
  fireEvent.click(screen.getByRole("checkbox", { name: "Project Master" }));
  expect(screen.queryByRole("columnheader", { name: "Project Type" })).not.toBeInTheDocument();
  expect(screen.getByRole("table").querySelector('[data-column-key="projectType"]')).toBeNull();
  expect(JSON.stringify(current)).toBe(before);
});
