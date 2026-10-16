import * as XLSX from "xlsx";
import type { PortfolioDashboardRow } from "./application/selectors/portfolioDashboardRows";
import type { PortfolioColumn, PortfolioVisibleSchema } from "./portfolioDashboardColumns";
import { portfolioDashboardScheduleOccurrences, portfolioDashboardTextValue } from "./portfolioDashboardCells";

function exportCell(row: PortfolioDashboardRow, column: PortfolioColumn, schema: PortfolioVisibleSchema): string {
  if (column.domain === "schedule") {
    const mapping = schema.scheduleMappings.find(entry => entry.key === column.key);
    if (mapping === undefined) return "";
    return portfolioDashboardScheduleOccurrences(row.schedule, mapping).map(occurrence => occurrence.kind === "notApplicable"
      ? "N/A"
      : `Applicable\nP: ${occurrence.plan}\nA: ${occurrence.actual}`).join("\n\n");
  }
  const value = portfolioDashboardTextValue(row, column);
  return value === "-" ? "" : value;
}

export function createPortfolioDashboardWorkbook(
  rows: readonly PortfolioDashboardRow[],
  schema: PortfolioVisibleSchema,
): XLSX.WorkBook {
  // Remark is intentionally export-only; visible table columns and search stay unchanged.
  type ExportColumn = PortfolioColumn | { readonly key: "projectRemark"; readonly label: string };
  const columns = schema.columns.flatMap<ExportColumn>(column => column.key === "projectType"
    ? [column, { key: "projectRemark", label: "Project Remark" }]
    : [column]);
  const worksheet = XLSX.utils.aoa_to_sheet([
    columns.map(column => column.label),
    ...rows.map(row => columns.map(column => column.key === "projectRemark"
      ? row.projectRemark ?? ""
      : exportCell(row, column, schema))),
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "All Projects");
  return workbook;
}
