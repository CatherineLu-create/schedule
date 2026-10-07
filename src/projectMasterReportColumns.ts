import type { PortfolioDashboardRow } from "./application/selectors/portfolioDashboardRows";
import { getProjectById } from "./application/selectors/projectSelectors";
import { selectProjectLeverageDisplay, type ProjectLeverageDisplay } from "./application/selectors/projectReferenceOptions";
import type { PrototypeState } from "./application/state/prototypeState";
import type { Project } from "./domain/project/project";
import { displayPortfolioText } from "./portfolioDashboardCells";
import { projectMasterCoverDisplay, projectMasterMeasurement } from "./projectMasterDisplay";

interface ReportCellContext {
  readonly project: Project;
  readonly row: PortfolioDashboardRow;
  readonly leverage: ProjectLeverageDisplay;
}

export interface ProjectMasterReportColumn {
  readonly key: string;
  readonly label: string;
  readonly group: "identity" | ProjectMasterReportGroupKey;
  readonly width: number;
  readonly value: (context: ReportCellContext) => string;
}

type GroupColumn = Omit<ProjectMasterReportColumn, "group" | "width"> & { readonly width?: number };

// Explicit user-facing allowlist, in Detail order. Hidden canonical fields,
// persistence metadata, Schedule and Team fields are not report columns.
export const projectMasterReportGroups = [
  { key: "projectMaster", label: "Project Master", columns: [
    { key: "acerModelName", label: "Acer Model Name", value: ({ row }) => row.project.acerModelName },
    { key: "acerMarketingName", label: "Acer Marketing Name", value: ({ row }) => row.project.acerMarketingName },
    { key: "customer", label: "Customer", value: ({ row }) => row.project.customer },
    { key: "category", label: "Category", value: ({ row }) => displayPortfolioText(row.category) },
    { key: "productLine", label: "Product Line", value: ({ row }) => row.project.productLine },
    { key: "panelSize", label: "Panel Size", value: ({ row }) => row.project.panelSize },
    { key: "cpu", label: "CPU", value: ({ row }) => row.project.cpu },
    { key: "gpu", label: "GPU", value: ({ row }) => row.project.gpu },
    { key: "pcbNumber", label: "PCB#", value: ({ row }) => displayPortfolioText(row.pcbNumber) },
    { key: "ssid", label: "SSID", value: ({ row }) => row.project.ssid },
    { key: "rmn", label: "RMN", value: ({ row }) => row.project.rmn },
    { key: "projectStatus", label: "Project Status", value: ({ row }) => row.project.projectStatus },
  ] },
  { key: "mechanical", label: "Mechanical", columns: [
    { key: "productLengthMm", label: "Product Length (mm)", value: ({ project }) => projectMasterMeasurement(project.master.mechanical.product.productLengthMm, "mm") },
    { key: "productWidthMm", label: "Product Width (mm)", value: ({ project }) => projectMasterMeasurement(project.master.mechanical.product.productWidthMm, "mm") },
    { key: "productHeightMm", label: "Product Height (mm)", value: ({ project }) => projectMasterMeasurement(project.master.mechanical.product.productHeightMm, "mm") },
    { key: "productWeightG", label: "Product Weight (g)", value: ({ project }) => projectMasterMeasurement(project.master.mechanical.product.productWeightG, "g") },
    { key: "packageLengthMm", label: "Package Length (mm)", value: ({ project }) => projectMasterMeasurement(project.master.mechanical.package.packageLengthMm, "mm") },
    { key: "packageWidthMm", label: "Package Width (mm)", value: ({ project }) => projectMasterMeasurement(project.master.mechanical.package.packageWidthMm, "mm") },
    { key: "packageHeightMm", label: "Package Height (mm)", value: ({ project }) => projectMasterMeasurement(project.master.mechanical.package.packageHeightMm, "mm") },
    { key: "grossWeightG", label: "Gross Weight (g)", value: ({ project }) => projectMasterMeasurement(project.master.mechanical.package.grossWeightG, "g") },
  ] },
  { key: "coverLeverage", label: "Cover & Leverage", columns: [
    { key: "pcbLeverage", label: "PCB Leverage Project", width: 300, value: ({ leverage }) => leverage.pcbLeverage },
    { key: "aCover", label: "A Cover Material", value: ({ project }) => projectMasterCoverDisplay(project.master.cover.aCover) },
    { key: "aLeverage", label: "A Cover Leverage Project", width: 300, value: ({ leverage }) => leverage.aLeverage },
    { key: "bCover", label: "B Cover Material", value: ({ project }) => projectMasterCoverDisplay(project.master.cover.bCover) },
    { key: "bLeverage", label: "B Cover Leverage Project", width: 300, value: ({ leverage }) => leverage.bLeverage },
    { key: "cCover", label: "C Cover Material", value: ({ project }) => projectMasterCoverDisplay(project.master.cover.cCover) },
    { key: "cLeverage", label: "C Cover Leverage Project", width: 300, value: ({ leverage }) => leverage.cLeverage },
    { key: "dCover", label: "D Cover Material", value: ({ project }) => projectMasterCoverDisplay(project.master.cover.dCover) },
    { key: "dLeverage", label: "D Cover Leverage Project", width: 300, value: ({ leverage }) => leverage.dLeverage },
  ] },
] as const satisfies readonly { readonly key: string; readonly label: string; readonly columns: readonly GroupColumn[] }[];

export type ProjectMasterReportGroupKey = (typeof projectMasterReportGroups)[number]["key"];

const identityColumns: readonly ProjectMasterReportColumn[] = [
  { key: "year", label: "Year", group: "identity", width: 80, value: ({ row }) => row.project.year },
  { key: "stnProjectName", label: "STN Project Name", group: "identity", width: 180, value: ({ row }) => row.project.projectName },
  { key: "qciModelName", label: "QCI Model Name", group: "identity", width: 180, value: ({ row }) => row.project.qciModelName },
];

export function projectMasterReportColumns(selected: readonly ProjectMasterReportGroupKey[]): readonly ProjectMasterReportColumn[] {
  return [
    ...identityColumns,
    ...projectMasterReportGroups.filter(group => selected.includes(group.key)).flatMap(group =>
      group.columns.map((column: GroupColumn) => ({ ...column, group: group.key, width: column.width ?? 180 }))),
  ];
}

export function projectMasterReportCells(
  state: PrototypeState,
  row: PortfolioDashboardRow,
  columns: readonly ProjectMasterReportColumn[],
): readonly string[] {
  const project = getProjectById(state, row.projectId);
  const leverage = selectProjectLeverageDisplay(state, row.projectId);
  if (project === null || leverage === null) throw new Error(`Report Project is absent: ${row.projectId}`);
  return columns.map(column => column.value({ project, row, leverage }));
}
