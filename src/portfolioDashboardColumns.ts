import { toMilestoneDefinitionId, type MilestoneDefinitionId } from "./domain/shared/ids";
import type { EffectiveMilestoneGovernanceContext } from "./application/governance/effectiveMilestoneGovernanceContext";
import { orderMilestoneDefinitions } from "./application/milestoneDefinitionOrdering";
import { milestoneDefinitionDisplayName } from "./application/milestoneDefinitionPresentation";

export type PortfolioColumnDomain = "project" | "schedule" | "team";
export interface PortfolioScheduleColumnMapping {
  readonly key: `schedule:${string}`;
  readonly groupKey: string;
  readonly groupLabel: string;
  readonly label: string;
  readonly milestoneDefinitionId: MilestoneDefinitionId;
  readonly portfolioVisible: boolean;
  readonly valueMode: "planActual" | "placeholder";
  readonly emptyWhenNotApplicableOrUndated?: boolean;
}
interface ScheduleMappingOptions {
  readonly portfolioVisible?: boolean;
  readonly valueMode?: PortfolioScheduleColumnMapping["valueMode"];
  readonly emptyWhenNotApplicableOrUndated?: boolean;
}
function scheduleMapping<const TKey extends `schedule:${string}`>(
  key: TKey,
  groupKey: string,
  groupLabel: string,
  label: string,
  idValue: string,
  options: ScheduleMappingOptions = {},
): Omit<PortfolioScheduleColumnMapping, "key"> & { readonly key: TKey } {
  const portfolioVisible = options.portfolioVisible ?? true;
  return {
    key,
    groupKey,
    groupLabel,
    label: milestoneDefinitionDisplayName({ id: toMilestoneDefinitionId(idValue), name: label }),
    milestoneDefinitionId: toMilestoneDefinitionId(idValue),
    portfolioVisible,
    valueMode: options.valueMode
      ?? (portfolioVisible ? "planActual" : "placeholder"),
    emptyWhenNotApplicableOrUndated:
      options.emptyWhenNotApplicableOrUndated,
  };
}

export const portfolioScheduleColumnMappings = [
  scheduleMapping("schedule:design:kickoff", "design", "Design", "Kickoff", "milestone-design-kickoff"),
  scheduleMapping("schedule:design:id-fix", "design", "Design", "ID fix", "milestone-design-id-fix"),
  scheduleMapping("schedule:me-portion:me-drawing", "me-portion", "ME Portion", "ME drawing", "milestone-me-portion-me-drawing"),
  scheduleMapping("schedule:me-portion:mockup-dfm", "me-portion", "ME Portion", "Mockup & DFM", "milestone-me-portion-mockup-dfm"),
  scheduleMapping("schedule:me-portion:tooling-start-t1", "me-portion", "ME Portion", "Tooling start + T1", "milestone-me-portion-tooling-start-t1"),
  scheduleMapping("schedule:me-portion:me-material-c", "me-portion", "ME Portion", "ME material for C", "milestone-me-portion-me-material-c"),
  scheduleMapping("schedule:thermal:thermal-module-c", "thermal", "Thermal", "Thermal module for C", "milestone-thermal-module-c"),
  scheduleMapping("schedule:a1-stage:a-g-o", "a1-stage", "A1", "A1 G/O", "milestone-a1-a-g-o"),
  scheduleMapping("schedule:a1-stage:a-smt", "a1-stage", "A1", "A1 SMT", "milestone-a1-a-smt"),
  scheduleMapping("schedule:a1-stage:a-test", "a1-stage", "A1", "A1 Test", "milestone-a1-a-test"),
  scheduleMapping("schedule:a1-stage:a-close", "a1-stage", "A1", "A1 Close", "milestone-a1-a-close"),
  scheduleMapping("schedule:c1-stage:c-g-o", "c1-stage", "C1-stage", "C1 G/O", "milestone-c1-c-g-o"),
  scheduleMapping("schedule:c1-stage:c-smt", "c1-stage", "C1-stage", "C1 SMT", "milestone-c1-c-smt"),
  scheduleMapping("schedule:c1-stage:c-pre-build", "c1-stage", "C1-stage", "C1 Pre-Build", "milestone-c1-c-pre-build"),
  scheduleMapping("schedule:c1-stage:c-main-build", "c1-stage", "C1-stage", "C1 System Build", "milestone-c1-c-main-build"),
  scheduleMapping("schedule:c1-stage:c-test", "c1-stage", "C1-stage", "C1 Test", "milestone-c1-c-test"),
  scheduleMapping("schedule:c1-stage:c1-close", "c1-stage", "C1-stage", "C1 Close", "milestone-c1-close"),
  scheduleMapping("schedule:c2-stage:c-g-o", "c2-stage", "C2-stage", "C2 G/O", "milestone-c2-c-g-o"),
  scheduleMapping("schedule:c2-stage:c-smt", "c2-stage", "C2-stage", "C2 SMT", "milestone-c2-c-smt"),
  scheduleMapping("schedule:c2-stage:c-pre-build", "c2-stage", "C2-stage", "C2 Pre-Build", "milestone-c2-c-pre-build"),
  scheduleMapping("schedule:c2-stage:c-main-build", "c2-stage", "C2-stage", "C2 System Build", "milestone-c2-c-main-build"),
  scheduleMapping("schedule:c2-stage:c-test", "c2-stage", "C2-stage", "C2 Test", "milestone-c2-c-test"),
  scheduleMapping("schedule:c2-stage:c-close", "c2-stage", "C2-stage", "C2 Close", "milestone-c2-c-close"),
  scheduleMapping("schedule:ramp-stage:ramp-g-o", "ramp-stage", "RAMP-stage", "RAMP G/O", "milestone-ramp-g-o"),
  scheduleMapping("schedule:ramp-stage:me-signoff", "ramp-stage", "RAMP-stage", "ME signoff", "milestone-ramp-me-signoff"),
  scheduleMapping("schedule:ramp-stage:ramp-smt", "ramp-stage", "RAMP-stage", "RAMP SMT", "milestone-ramp-smt"),
  scheduleMapping("schedule:ramp-stage:ramp-pre-build", "ramp-stage", "RAMP-stage", "RAMP Pre-build", "milestone-ramp-pre-build"),
  scheduleMapping("schedule:ramp-stage:ramp-main-build", "ramp-stage", "RAMP-stage", "RAMP Main build", "milestone-ramp-main-build"),
  scheduleMapping("schedule:ramp-stage:fcs", "ramp-stage", "RAMP-stage", "FCS", "milestone-ramp-fcs"),
  scheduleMapping(
    "schedule:mdrr:mdrr",
    "mdrr",
    "MDRR",
    "MDRR",
    "milestone-mdrr",
    {
      portfolioVisible: false,
      valueMode: "planActual",
      emptyWhenNotApplicableOrUndated: true,
    },
  ),
] as const satisfies readonly PortfolioScheduleColumnMapping[];
export type PortfolioScheduleColumnKey = `schedule:${string}`;
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
  const groups: { key: string; label: string; columns: PortfolioColumn[] }[] = [];
  for (const entry of mappings) {
    const previous = groups.at(-1);
    const group = previous?.columns[0]?.subgroup === entry.groupKey ? previous : {
      key: groups.some(candidate => candidate.key === entry.groupKey) ? `${entry.groupKey}:${groups.length}` : entry.groupKey,
      label: entry.groupLabel, columns: [],
    };
    if (group !== previous) groups.push(group);
    group.columns.push({ key: entry.key, label: entry.label, defaultWidth: 118, minWidth: 105, domain: "schedule", subgroup: entry.groupKey });
  }
  return groups;
}

const teamGroups = [
  { key: "project-roles", label: "Project Roles", columns: [["team:qciPm", "QCI PM"], ["team:qciPjm", "QCI PjM"], ["team:acerPm", "Acer PM"]] },
  { key: "standard-function-owners", label: "Standard Function Owners", columns: [["team:meOwner", "ME Owner"], ["team:eeOwner", "EE Owner"], ["team:thermalOwner", "Thermal Owner"], ["team:biosOwner", "BIOS Owner"]] },
] as const;
export const portfolioTeamColumnGroups: readonly PortfolioColumnGroup[] = teamGroups.map((group) => ({
  key: group.key, label: group.label, columns: group.columns.map(([key, label]) => ({ key, label, defaultWidth: 135, minWidth: 120, domain: "team", subgroup: group.key })),
}));
export const portfolioStickyColumnKeys: readonly PortfolioProjectInfoColumnKey[] = ["projectStatus", "year", "name", "qciProjectName"];
export type PortfolioColumnWidths = Partial<Record<PortfolioColumnKey, number>>;

export interface PortfolioVisibleSchema {
  readonly columns: readonly PortfolioColumn[];
  readonly domainGroups: readonly { key: PortfolioColumnDomain; label: string; colSpan: number }[];
  readonly scheduleMappings: readonly PortfolioScheduleColumnMapping[];
  readonly subgroups: readonly { key: string; label: string; domain: PortfolioColumnDomain; colSpan: number }[];
}

function newDefinitionColumnKey(definitionId: MilestoneDefinitionId): PortfolioScheduleColumnKey {
  const rawKey: PortfolioScheduleColumnKey = `schedule:${definitionId}`;
  // Reserve the escape namespace and every bundled key, even when its column is absent.
  return rawKey.startsWith("schedule:definition:")
    || portfolioScheduleColumnMappings.some(mapping => mapping.key === rawKey)
    ? `schedule:definition:${definitionId}`
    : rawKey;
}

export function createPortfolioVisibleSchema(
  context: EffectiveMilestoneGovernanceContext,
): PortfolioVisibleSchema {
  const scheduleMappings = orderMilestoneDefinitions(context.portfolioColumnDefinitions, context.stageGroupsForHistoricalResolution).map((definition): PortfolioScheduleColumnMapping => {
    const presentation = portfolioScheduleColumnMappings.find(entry => entry.milestoneDefinitionId === definition.id);
    if (presentation) return { ...presentation, label: milestoneDefinitionDisplayName(definition) };
    const stage = context.stageGroupsForHistoricalResolution.find(candidate => candidate.id === definition.stageGroupId)!;
    // Reuse the bundled presentation group for this exact Stage ID, even when
    // its bundled columns are absent from the current release.
    const stagePresentation = portfolioScheduleColumnMappings.find(mapping =>
      context.definitionsForHistoricalResolution.find(item => item.id === mapping.milestoneDefinitionId)?.stageGroupId === stage.id);
    return { key: newDefinitionColumnKey(definition.id), groupKey: stagePresentation?.groupKey ?? stage.id, groupLabel: stagePresentation?.groupLabel ?? stage.displayName,
      label: milestoneDefinitionDisplayName(definition), milestoneDefinitionId: definition.id, portfolioVisible: true, valueMode: "planActual" };
  });
  const scheduleGroups = scheduleColumnGroups(scheduleMappings);
  return {
    columns: [...portfolioProjectInfoColumns, ...scheduleGroups.flatMap(group => group.columns), ...portfolioTeamColumnGroups.flatMap(group => group.columns)],
    domainGroups: [
      { key: "project", label: "PROJECT INFORMATION", colSpan: portfolioProjectInfoColumns.length },
      ...(scheduleMappings.length ? [{ key: "schedule" as const, label: "SCHEDULE", colSpan: scheduleMappings.length }] : []),
      { key: "team", label: "TEAM MEMBER", colSpan: portfolioTeamColumnGroups.reduce((count, group) => count + group.columns.length, 0) },
    ],
    scheduleMappings,
    subgroups: [
      { key: "core-fields", label: "Core fields", domain: "project", colSpan: portfolioProjectInfoColumns.length },
      ...scheduleGroups.map(group => ({ key: group.key, label: group.label, domain: "schedule" as const, colSpan: group.columns.length })),
      ...portfolioTeamColumnGroups.map(group => ({ key: group.key, label: group.label, domain: "team" as const, colSpan: group.columns.length })),
    ],
  };
}
export function resizePortfolioColumnWidth(currentWidth: number, deltaX: number, minWidth: number): number {
  return Math.max(minWidth, currentWidth + deltaX);
}
