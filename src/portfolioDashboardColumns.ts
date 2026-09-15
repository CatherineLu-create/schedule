import { toMilestoneDefinitionId, type MilestoneDefinitionId } from "./domain/shared/ids";
import type { PortfolioDashboardRow } from "./application/selectors/portfolioDashboardRows";

export type PortfolioColumnDomain = "project" | "schedule" | "team";
export interface PortfolioScheduleColumnMapping {
  readonly key: `schedule:${string}`;
  readonly groupKey: string;
  readonly groupLabel: string;
  readonly label: string;
  readonly milestoneDefinitionId: MilestoneDefinitionId;
  readonly portfolioVisible: boolean;
  readonly valueMode: "planActual" | "placeholder";
}
function scheduleMapping<const TKey extends `schedule:${string}`>(
  key: TKey, groupKey: string, groupLabel: string, label: string, idValue: string, portfolioVisible = true,
): Omit<PortfolioScheduleColumnMapping, "key"> & { readonly key: TKey } {
  return { key, groupKey, groupLabel, label, milestoneDefinitionId: toMilestoneDefinitionId(idValue), portfolioVisible, valueMode: portfolioVisible ? "planActual" : "placeholder" };
}

export const portfolioScheduleColumnMappings = [
  scheduleMapping("schedule:design:kickoff", "design", "Design", "Kickoff", "milestone-design-kickoff"),
  scheduleMapping("schedule:design:id-fix", "design", "Design", "ID fix", "milestone-design-id-fix"),
  scheduleMapping("schedule:me-portion:me-drawing", "me-portion", "ME Portion", "ME drawing", "milestone-me-portion-me-drawing"),
  scheduleMapping("schedule:me-portion:mockup-dfm", "me-portion", "ME Portion", "Mockup & DFM", "milestone-me-portion-mockup-dfm"),
  scheduleMapping("schedule:me-portion:tooling-start-t1", "me-portion", "ME Portion", "Tooling start + T1", "milestone-me-portion-tooling-start-t1"),
  scheduleMapping("schedule:me-portion:me-material-c", "me-portion", "ME Portion", "ME material for C", "milestone-me-portion-me-material-c"),
  scheduleMapping("schedule:thermal:thermal-module-c", "thermal", "Thermal", "Thermal module for C", "milestone-thermal-module-c"),
  scheduleMapping("schedule:a1-stage:a-g-o", "a1-stage", "A", "A G/O", "milestone-a1-a-g-o"),
  scheduleMapping("schedule:a1-stage:a-smt", "a1-stage", "A", "A-SMT", "milestone-a1-a-smt"),
  scheduleMapping("schedule:a1-stage:a-test", "a1-stage", "A", "A-Test", "milestone-a1-a-test"),
  scheduleMapping("schedule:a-a2-stage:a-g-o", "a2-stage", "A2", "A G/O", "milestone-a-a2-a-g-o"),
  scheduleMapping("schedule:a-a2-stage:a-smt", "a2-stage", "A2", "A-SMT", "milestone-a-a2-a-smt"),
  scheduleMapping("schedule:a-a2-stage:a-test", "a2-stage", "A2", "A-Test", "milestone-a-a2-a-test"),
  scheduleMapping("schedule:a-a2-stage:a-close", "a2-stage", "A2", "A-Close", "milestone-a-a2-a-close"),
  scheduleMapping("schedule:c1-stage:c-g-o", "c1-stage", "C1-stage", "C G/O", "milestone-c1-c-g-o"),
  scheduleMapping("schedule:c1-stage:c-smt", "c1-stage", "C1-stage", "C-SMT", "milestone-c1-c-smt"),
  scheduleMapping("schedule:c1-stage:c-pre-build", "c1-stage", "C1-stage", "C Pre-build", "milestone-c1-c-pre-build"),
  scheduleMapping("schedule:c1-stage:c-main-build", "c1-stage", "C1-stage", "C-Main Build", "milestone-c1-c-main-build"),
  scheduleMapping("schedule:c1-stage:c-test", "c1-stage", "C1-stage", "C-Test", "milestone-c1-c-test"),
  scheduleMapping("schedule:c1-stage:c1-close", "c1-stage", "C1-stage", "C1-close", "milestone-c1-close"),
  scheduleMapping("schedule:c2-stage:c-g-o", "c2-stage", "C2-stage", "C G/O", "milestone-c2-c-g-o"),
  scheduleMapping("schedule:c2-stage:c-smt", "c2-stage", "C2-stage", "C-SMT", "milestone-c2-c-smt"),
  scheduleMapping("schedule:c2-stage:c-pre-build", "c2-stage", "C2-stage", "C Pre-build", "milestone-c2-c-pre-build"),
  scheduleMapping("schedule:c2-stage:c-main-build", "c2-stage", "C2-stage", "C-Main Build", "milestone-c2-c-main-build"),
  scheduleMapping("schedule:c2-stage:c-test", "c2-stage", "C2-stage", "C-Test", "milestone-c2-c-test"),
  scheduleMapping("schedule:c2-stage:bios-frozen", "c2-stage", "C2-stage", "BIOS frozen", "milestone-c2-bios-frozen"),
  scheduleMapping("schedule:c2-stage:golden-run", "c2-stage", "C2-stage", "Golden Run", "milestone-c2-golden-run"),
  scheduleMapping("schedule:c2-stage:c-close", "c2-stage", "C2-stage", "C-close", "milestone-c2-c-close"),
  scheduleMapping("schedule:ramp-stage:ramp-g-o", "ramp-stage", "RAMP-stage", "RAMP G/O", "milestone-ramp-g-o"),
  scheduleMapping("schedule:ramp-stage:me-signoff", "ramp-stage", "RAMP-stage", "ME signoff", "milestone-ramp-me-signoff"),
  scheduleMapping("schedule:ramp-stage:ramp-smt", "ramp-stage", "RAMP-stage", "RAMP SMT", "milestone-ramp-smt"),
  scheduleMapping("schedule:ramp-stage:ramp-pre-build", "ramp-stage", "RAMP-stage", "RAMP Pre-build", "milestone-ramp-pre-build"),
  scheduleMapping("schedule:ramp-stage:ramp-main-build", "ramp-stage", "RAMP-stage", "RAMP Main build", "milestone-ramp-main-build"),
  scheduleMapping("schedule:ramp-stage:fcs", "ramp-stage", "RAMP-stage", "FCS", "milestone-ramp-fcs"),
  scheduleMapping("schedule:mdrr:mdrr", "mdrr", "MDRR", "MDRR", "milestone-mdrr", false),
] as const satisfies readonly PortfolioScheduleColumnMapping[];
export type PortfolioScheduleColumnKey = (typeof portfolioScheduleColumnMappings)[number]["key"];
export type PortfolioProjectInfoColumnKey = "projectStatus" | "year" | "name" | "qciProjectName" | "customer" | "category" | "productLine" | "size" | "cpu" | "gpu" | "pcbNumber";
export type PortfolioTeamColumnKey = "team:qciPm" | "team:qciPjm" | "team:acerPm" | "team:meOwner" | "team:eeOwner" | "team:thermalOwner" | "team:biosOwner";
export type PortfolioColumnKey = PortfolioProjectInfoColumnKey | PortfolioScheduleColumnKey | PortfolioTeamColumnKey;
export interface PortfolioColumn {
  readonly key: PortfolioColumnKey;
  readonly label: string;
  readonly minWidth: number;
  readonly defaultWidth: number;
  readonly domain: PortfolioColumnDomain;
  readonly subgroup: string;
}
export interface PortfolioColumnGroup {
  readonly key: string;
  readonly label: string;
  readonly columns: readonly PortfolioColumn[];
}
export const portfolioProjectInfoColumns: readonly PortfolioColumn[] = [
  ["projectStatus", "Status", 100, 92], ["year", "Year", 76, 68], ["name", "STN Project Name", 215, 190],
  ["qciProjectName", "QCI Model Name", 170, 150], ["customer", "Customer", 118, 105], ["category", "Category", 125, 110],
  ["productLine", "Product Line", 145, 130], ["size", "Panel Size", 90, 82], ["cpu", "CPU", 200, 175], ["gpu", "GPU", 135, 120], ["pcbNumber", "PCB#", 92, 82],
].map(([key, label, defaultWidth, minWidth]) => ({
  key: key as PortfolioProjectInfoColumnKey, label: String(label), defaultWidth: Number(defaultWidth), minWidth: Number(minWidth), domain: "project", subgroup: "core-fields",
}));

function scheduleColumnGroups(mappings: readonly PortfolioScheduleColumnMapping[]): readonly PortfolioColumnGroup[] {
  return [...new Set(mappings.map((entry) => entry.groupKey))].map((groupKey) => {
    const groupedMappings = mappings.filter((entry) => entry.groupKey === groupKey);
    return { key: groupKey, label: groupedMappings[0].groupLabel, columns: groupedMappings.map((entry) => ({ key: entry.key as PortfolioScheduleColumnKey, label: entry.label, defaultWidth: 118, minWidth: 105, domain: "schedule", subgroup: groupKey })) };
  });
}
export const portfolioScheduleColumnGroups: readonly PortfolioColumnGroup[] = scheduleColumnGroups(portfolioScheduleColumnMappings);

const teamGroups = [
  { key: "project-roles", label: "Project Roles", columns: [["team:qciPm", "QCI PM"], ["team:qciPjm", "QCI PjM"], ["team:acerPm", "Acer PM"]] },
  { key: "standard-function-owners", label: "Standard Function Owners", columns: [["team:meOwner", "ME Owner"], ["team:eeOwner", "EE Owner"], ["team:thermalOwner", "Thermal Owner"], ["team:biosOwner", "BIOS Owner"]] },
] as const;
export const portfolioTeamColumnGroups: readonly PortfolioColumnGroup[] = teamGroups.map((group) => ({
  key: group.key, label: group.label, columns: group.columns.map(([key, label]) => ({ key, label, defaultWidth: 135, minWidth: 120, domain: "team", subgroup: group.key })),
}));
export const portfolioColumns: readonly PortfolioColumn[] = [...portfolioProjectInfoColumns, ...portfolioScheduleColumnGroups.flatMap((group) => group.columns), ...portfolioTeamColumnGroups.flatMap((group) => group.columns)];
export const portfolioDomainGroups: readonly { key: PortfolioColumnDomain; label: string; colSpan: number }[] = [
  { key: "project", label: "PROJECT INFORMATION", colSpan: portfolioProjectInfoColumns.length },
  { key: "schedule", label: "SCHEDULE", colSpan: portfolioScheduleColumnMappings.length },
  { key: "team", label: "TEAM MEMBER", colSpan: portfolioTeamColumnGroups.reduce((count, group) => count + group.columns.length, 0) },
];
export const portfolioSubgroups: readonly { key: string; label: string; domain: PortfolioColumnDomain; colSpan: number }[] = [
  { key: "core-fields", label: "Core fields", domain: "project", colSpan: portfolioProjectInfoColumns.length },
  ...portfolioScheduleColumnGroups.map((group) => ({ key: group.key, label: group.label, domain: "schedule" as const, colSpan: group.columns.length })),
  ...portfolioTeamColumnGroups.map((group) => ({ key: group.key, label: group.label, domain: "team" as const, colSpan: group.columns.length })),
];
export const portfolioStickyColumnKeys: readonly PortfolioProjectInfoColumnKey[] = ["projectStatus", "year", "name", "qciProjectName"];
export type PortfolioColumnWidths = Record<PortfolioColumnKey, number>;
export const defaultPortfolioColumnWidths = Object.fromEntries(portfolioColumns.map((column) => [column.key, column.defaultWidth])) as PortfolioColumnWidths;

export interface PortfolioVisibleSchema {
  readonly columns: readonly PortfolioColumn[];
  readonly domainGroups: readonly { key: PortfolioColumnDomain; label: string; colSpan: number }[];
  readonly scheduleMappings: readonly PortfolioScheduleColumnMapping[];
  readonly subgroups: readonly { key: string; label: string; domain: PortfolioColumnDomain; colSpan: number }[];
}

const a2DefinitionIds = new Set(
  portfolioScheduleColumnMappings
    .filter((mapping) => mapping.groupKey === "a2-stage")
    .map((mapping) => mapping.milestoneDefinitionId),
);

function hasApplicableA2(rows: readonly PortfolioDashboardRow[]): boolean {
  return rows.some((row) => row.schedule.kind === "published" && row.schedule.cells.some(
    (cell) => a2DefinitionIds.has(cell.milestoneDefinitionId) &&
      cell.occurrences.some((occurrence) => occurrence.applicability === "applicable"),
  ));
}

export function getPortfolioVisibleSchema(
  rows: readonly PortfolioDashboardRow[],
): PortfolioVisibleSchema {
  const scheduleMappings = hasApplicableA2(rows)
    ? portfolioScheduleColumnMappings
    : portfolioScheduleColumnMappings.filter((mapping) => mapping.groupKey !== "a2-stage");
  const scheduleGroups = scheduleColumnGroups(scheduleMappings);
  const teamColumnCount = portfolioTeamColumnGroups.reduce((count, group) => count + group.columns.length, 0);
  const columns = [
    ...portfolioProjectInfoColumns,
    ...scheduleGroups.flatMap((group) => group.columns),
    ...portfolioTeamColumnGroups.flatMap((group) => group.columns),
  ];

  return {
    columns,
    domainGroups: [
      { key: "project", label: "PROJECT INFORMATION", colSpan: portfolioProjectInfoColumns.length },
      { key: "schedule", label: "SCHEDULE", colSpan: scheduleMappings.length },
      { key: "team", label: "TEAM MEMBER", colSpan: teamColumnCount },
    ],
    scheduleMappings,
    subgroups: [
      { key: "core-fields", label: "Core fields", domain: "project", colSpan: portfolioProjectInfoColumns.length },
      ...scheduleGroups.map((group) => ({ key: group.key, label: group.label, domain: "schedule" as const, colSpan: group.columns.length })),
      ...portfolioTeamColumnGroups.map((group) => ({ key: group.key, label: group.label, domain: "team" as const, colSpan: group.columns.length })),
    ],
  };
}
export function resizePortfolioColumnWidth(currentWidth: number, deltaX: number, minWidth: number): number {
  return Math.max(minWidth, currentWidth + deltaX);
}
