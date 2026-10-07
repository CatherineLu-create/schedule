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
    expect(columns).toHaveLength(32);
    expect(new Set(columns.map(column => column.key)).size).toBe(32);
    expect(columns.map(column => column.label)).not.toContain("Housing Number");
    expect(columns.map(column => column.label)).not.toContain("Remark");
    for (let mask = 0; mask < 8; mask++) {
      const selected = allGroups.filter((_, index) => mask & (1 << index));
      const schema = projectMasterReportColumns(selected);
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
    expect(sheet["!autofilter"]).toEqual({ ref: `A1:AF${rows.length + 1}` });
    expect(sheet["!merges"]).toBeUndefined();
    const archive = parsed as XLSX.WorkBook & { files: Record<string, { content: Uint8Array }> };
    const xml = new TextDecoder().decode(archive.files["xl/worksheets/sheet1.xml"].content);
    expect(xml).not.toMatch(/<pane\b|<mergeCells\b/);
    expect(grid(parsed)).toEqual(grid(book));
  });
});

describe("Reports selection parity", () => {
  it.each(portfolioDashboardFilterKeys)("uses Dashboard options and predicate for %s, with AND search, chips and Clear all", (key) => {
    const onExport = vi.fn();
    render(<ProjectMasterReportView state={state} rows={rows} onBack={vi.fn()} onExport={onExport} />);
    const keyIndex = portfolioDashboardFilterKeys.indexOf(key);
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
