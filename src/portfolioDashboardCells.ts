import type { PortfolioCurrentPublishedRead, PortfolioDashboardRow, PortfolioScheduleMilestoneOccurrence } from "./application/selectors/portfolioDashboardRows";
import type { PortfolioColumn, PortfolioProjectInfoColumnKey, PortfolioScheduleColumnMapping } from "./portfolioDashboardColumns";

export const displayPortfolioText = (value: string): string => value === "-" ? "—" : value;

const projectValues: Record<PortfolioProjectInfoColumnKey, (row: PortfolioDashboardRow) => string> = {
  projectStatus: row => row.project.projectStatus,
  year: row => row.project.year,
  name: row => row.project.projectName,
  qciProjectName: row => row.project.qciModelName,
  customer: row => row.project.customer,
  category: row => row.category,
  productLine: row => row.project.productLine,
  size: row => row.project.panelSize,
  cpu: row => row.project.cpu,
  gpu: row => row.project.gpu,
  pcbNumber: row => row.pcbNumber,
};

type PortfolioScheduleOccurrencePresentation = {
  readonly milestoneId: PortfolioScheduleMilestoneOccurrence["milestoneId"];
} & (
  | { readonly kind: "notApplicable" }
  | { readonly kind: "applicable"; readonly plan: string; readonly actual: string }
);

export function portfolioDashboardTextValue(row: PortfolioDashboardRow, column: PortfolioColumn): string {
  if (column.domain === "project") return projectValues[column.key as PortfolioProjectInfoColumnKey](row);
  return column.key === "team:qciPm" ? row.qciPm?.label ?? "-" : "-";
}

export function portfolioDashboardScheduleOccurrences(
  read: PortfolioCurrentPublishedRead,
  mapping: PortfolioScheduleColumnMapping,
): readonly PortfolioScheduleOccurrencePresentation[] {
  if (read.kind !== "published" || read.milestoneCount === 0 || mapping.valueMode === "placeholder") return [];
  const occurrences = read.cells.find(cell => cell.milestoneDefinitionId === mapping.milestoneDefinitionId)?.occurrences ?? [];
  const displayable = mapping.emptyWhenNotApplicableOrUndated
    ? occurrences.filter(occurrence => occurrence.applicability === "applicable" && (occurrence.plan !== "-" || occurrence.actual !== "-"))
    : occurrences;
  return displayable.map(occurrence => occurrence.applicability === "notApplicable"
    ? { milestoneId: occurrence.milestoneId, kind: "notApplicable" }
    : { milestoneId: occurrence.milestoneId, kind: "applicable", plan: displayPortfolioText(occurrence.plan), actual: displayPortfolioText(occurrence.actual) });
}
