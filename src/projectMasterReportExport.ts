import * as XLSX from "xlsx";
import type { PortfolioDashboardRow } from "./application/selectors/portfolioDashboardRows";
import type { PrototypeState } from "./application/state/prototypeState";
import { projectMasterReportCells, type ProjectMasterReportColumn } from "./projectMasterReportColumns";

export function createProjectMasterReportWorkbook(
  state: PrototypeState,
  rows: readonly PortfolioDashboardRow[],
  columns: readonly ProjectMasterReportColumn[],
): XLSX.WorkBook {
  const worksheet = XLSX.utils.aoa_to_sheet([
    columns.map(column => column.label),
    ...rows.map(row => [...projectMasterReportCells(state, row, columns)]),
  ]);
  worksheet["!autofilter"] = { ref: worksheet["!ref"]! };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Project Master Report");
  return workbook;
}

export function projectMasterReportFilename(date = new Date()): string {
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `PIP_Project_Master_Report_${stamp}.xlsx`;
}
