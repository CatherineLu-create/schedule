export type ProjectListColumnKey =
  | "year"
  | "customer"
  | "productLine"
  | "name"
  | "qciProjectName"
  | "size"
  | "cpu"
  | "gpu"
  | "projectStatus"
  | "currentStage"
  | "mdrr";

export type ProjectListColumn = {
  key: ProjectListColumnKey;
  label: string;
  minWidth: number;
  defaultWidth: number;
};

export const projectListColumns: ProjectListColumn[] = [
  { key: "year", label: "Year", minWidth: 90, defaultWidth: 100 },
  { key: "customer", label: "Customer", minWidth: 110, defaultWidth: 120 },
  { key: "productLine", label: "Product Line", minWidth: 150, defaultWidth: 170 },
  { key: "name", label: "Project Name", minWidth: 160, defaultWidth: 180 },
  { key: "qciProjectName", label: "QCI Model Name", minWidth: 150, defaultWidth: 170 },
  { key: "size", label: "Panel Size", minWidth: 90, defaultWidth: 100 },
  { key: "cpu", label: "CPU", minWidth: 220, defaultWidth: 260 },
  { key: "gpu", label: "GPU", minWidth: 120, defaultWidth: 140 },
  { key: "projectStatus", label: "Project Status", minWidth: 140, defaultWidth: 150 },
  { key: "currentStage", label: "Current Stage", minWidth: 140, defaultWidth: 150 },
  { key: "mdrr", label: "MDRR", minWidth: 120, defaultWidth: 130 },
];

export type ColumnWidths = Record<ProjectListColumnKey, number>;

export const defaultProjectListColumnWidths = Object.fromEntries(
  projectListColumns.map((column) => [column.key, column.defaultWidth]),
) as ColumnWidths;

export function resizeColumnWidth(currentWidth: number, deltaX: number, minWidth: number) {
  return Math.max(minWidth, currentWidth + deltaX);
}
