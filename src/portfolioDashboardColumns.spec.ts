import { describe, expect, it } from "vitest";
import { mdrrMilestoneDefinition, milestoneDefinitions, portfolioMilestoneDefinitions } from "./config/v2/referenceData";
import {
  createPortfolioVisibleSchema,
  portfolioProjectInfoColumns,
  portfolioStickyColumnKeys, portfolioTeamColumnGroups, resizePortfolioColumnWidth,
} from "./portfolioDashboardColumns";
import { initialGovernanceContext, publishPortfolioDefinitionsForTest } from "./test/governanceTestUtils";
import { toMilestoneDefinitionId } from "./domain/shared/ids";

const { columns: portfolioColumns, domainGroups: portfolioDomainGroups, subgroups: portfolioSubgroups, scheduleMappings: portfolioScheduleColumnMappings } = createPortfolioVisibleSchema(initialGovernanceContext());
const portfolioScheduleColumnGroups = portfolioSubgroups.filter(group => group.domain === "schedule").map(group => ({ ...group, columns: portfolioColumns.filter(column => column.subgroup === group.key) }));

describe("Portfolio visual schema", () => {
  it("escapes published ID collisions against the full legacy registry and keeps prefix-shaped IDs distinct", () => {
    const legacy = initialGovernanceContext().definitionsForHistoricalResolution.find(definition => definition.id === "milestone-design-kickoff")!;
    const additions = ["design:kickoff", "definition:design:kickoff", "definition:definition:design:kickoff", "ordinary-extra"].map((id, index) => ({ ...legacy, id: toMilestoneDefinitionId(id), name: `Separate kickoff ${index + 1}` }));
    const context = publishPortfolioDefinitionsForTest(additions, [legacy.id, ...additions.map(definition => definition.id)]);
    const schema = createPortfolioVisibleSchema(context);
    expect(schema.scheduleMappings.map(mapping => [mapping.milestoneDefinitionId, mapping.key])).toEqual([
      ["milestone-design-kickoff", "schedule:design:kickoff"],
      ["design:kickoff", "schedule:definition:design:kickoff"],
      ["definition:design:kickoff", "schedule:definition:definition:design:kickoff"],
      ["definition:definition:design:kickoff", "schedule:definition:definition:definition:design:kickoff"],
      ["ordinary-extra", "schedule:ordinary-extra"],
    ]);
    expect(new Set(schema.scheduleMappings.map(mapping => mapping.key)).size).toBe(5);
    for (const membership of [
      additions.map(definition => definition.id),
      [...additions].reverse().map(definition => definition.id).concat(legacy.id),
    ]) {
      const changed = createPortfolioVisibleSchema(publishPortfolioDefinitionsForTest(additions, membership));
      for (const mapping of changed.scheduleMappings) {
        expect(mapping.key).toBe(schema.scheduleMappings.find(original => original.milestoneDefinitionId === mapping.milestoneDefinitionId)!.key);
      }
    }
    const renamed = createPortfolioVisibleSchema({ ...context, portfolioColumnDefinitions: context.portfolioColumnDefinitions.map(definition => ({ ...definition, name: "Same display name" })) });
    expect(renamed.scheduleMappings.map(mapping => mapping.key)).toEqual(schema.scheduleMappings.map(mapping => mapping.key));
  });
  // Mutation: dropping/reordering a stage or using same-name definition matching.
  it("maps the 30 ordered visual leaves to 29 Portfolio definitions and the active MDRR projection", () => {
    expect(portfolioScheduleColumnMappings.map(({ key, label, milestoneDefinitionId }) => [key, label, milestoneDefinitionId])).toEqual([
      ["schedule:design:kickoff", "Kickoff", "milestone-design-kickoff"],
      ["schedule:design:id-fix", "ID fix", "milestone-design-id-fix"],
      ["schedule:me-portion:me-drawing", "ME drawing", "milestone-me-portion-me-drawing"],
      ["schedule:me-portion:mockup-dfm", "Mockup & DFM", "milestone-me-portion-mockup-dfm"],
      ["schedule:me-portion:tooling-start-t1", "Tooling start + T1", "milestone-me-portion-tooling-start-t1"],
      ["schedule:me-portion:me-material-c", "ME material for C", "milestone-me-portion-me-material-c"],
      ["schedule:thermal:thermal-module-c", "Thermal module for C", "milestone-thermal-module-c"],
      ["schedule:a1-stage:a-g-o", "A1 G/O", "milestone-a1-a-g-o"],
      ["schedule:a1-stage:a-smt", "A1 SMT", "milestone-a1-a-smt"],
      ["schedule:a1-stage:a-test", "A1 Test", "milestone-a1-a-test"],
      ["schedule:a1-stage:a-close", "A1 Close", "milestone-a1-a-close"],
      ["schedule:c1-stage:c-g-o", "C1 G/O", "milestone-c1-c-g-o"],
      ["schedule:c1-stage:c-smt", "C1 SMT", "milestone-c1-c-smt"],
      ["schedule:c1-stage:c-pre-build", "C1 Pre-Build", "milestone-c1-c-pre-build"],
      ["schedule:c1-stage:c-main-build", "C1 System Build", "milestone-c1-c-main-build"],
      ["schedule:c1-stage:c-test", "C1 Test", "milestone-c1-c-test"],
      ["schedule:c1-stage:c1-close", "C1 Close", "milestone-c1-close"],
      ["schedule:c2-stage:c-g-o", "C2 G/O", "milestone-c2-c-g-o"],
      ["schedule:c2-stage:c-smt", "C2 SMT", "milestone-c2-c-smt"],
      ["schedule:c2-stage:c-pre-build", "C2 Pre-Build", "milestone-c2-c-pre-build"],
      ["schedule:c2-stage:c-main-build", "C2 System Build", "milestone-c2-c-main-build"],
      ["schedule:c2-stage:c-test", "C2 Test", "milestone-c2-c-test"],
      ["schedule:c2-stage:c-close", "C2 Close", "milestone-c2-c-close"],
      ["schedule:ramp-stage:ramp-g-o", "RAMP G/O", "milestone-ramp-g-o"],
      ["schedule:ramp-stage:me-signoff", "ME signoff", "milestone-ramp-me-signoff"],
      ["schedule:ramp-stage:ramp-smt", "RAMP SMT", "milestone-ramp-smt"],
      ["schedule:ramp-stage:ramp-pre-build", "RAMP Pre-build", "milestone-ramp-pre-build"],
      ["schedule:ramp-stage:ramp-main-build", "RAMP Main build", "milestone-ramp-main-build"],
      ["schedule:ramp-stage:fcs", "FCS", "milestone-ramp-fcs"],
      ["schedule:mdrr:mdrr", "MDRR", "milestone-mdrr"],
    ]);
    const active = portfolioScheduleColumnMappings.slice(0, 29);
    expect(active.map((entry) => entry.milestoneDefinitionId)).toEqual(portfolioMilestoneDefinitions.map((definition) => definition.id));
    expect(new Set(active.map((entry) => entry.milestoneDefinitionId)).size).toBe(29);
    for (const entry of active) {
      expect(milestoneDefinitions.find((definition) => definition.id === entry.milestoneDefinitionId)?.showInPortfolio).toBe(true);
      expect(entry.portfolioVisible).toBe(true);
      expect(entry.valueMode).toBe("planActual");
    }
    expect(portfolioScheduleColumnMappings[29]).toMatchObject({
      milestoneDefinitionId: mdrrMilestoneDefinition.id,
      portfolioVisible: false,
      valueMode: "planActual",
      emptyWhenNotApplicableOrUndated: true,
    });
    // Mutation: the active visual projection changes the catalog flag or loses its exact definition.
    const mappedMdrrDefinitions = milestoneDefinitions.filter((definition) => definition.id === portfolioScheduleColumnMappings[29].milestoneDefinitionId);
    expect(mappedMdrrDefinitions).toHaveLength(1);
    expect(mappedMdrrDefinitions[0]).toEqual(mdrrMilestoneDefinition);
    expect(mappedMdrrDefinitions[0].showInPortfolio).toBe(false);
  });

  // Mutation: flattening domains, wrong colspans or adding a diagnostic leaf.
  it("keeps the fixed 11/30/7 schema and subgroup hierarchy without diagnostics", () => {
    expect(portfolioProjectInfoColumns.map(({ key, label }) => [key, label])).toEqual([
      ["projectStatus", "Status"], ["year", "Year"], ["name", "STN Project Name"], ["qciProjectName", "QCI Model Name"],
      ["customer", "Customer"], ["category", "Category"], ["productLine", "Product Line"], ["size", "Panel Size"], ["cpu", "CPU"], ["gpu", "GPU"], ["pcbNumber", "PCB#"],
    ]);
    expect(portfolioScheduleColumnGroups.flatMap((group) => group.columns.map((column) => column.key))).toEqual(portfolioScheduleColumnMappings.map((entry) => entry.key));
    expect(portfolioTeamColumnGroups.flatMap((group) => group.columns.map(({ key, label }) => [key, label]))).toEqual([
      ["team:qciPm", "QCI PM"], ["team:qciPjm", "QCI PjM"], ["team:acerPm", "Acer PM"],
      ["team:meOwner", "ME Owner"], ["team:eeOwner", "EE Owner"], ["team:thermalOwner", "Thermal Owner"], ["team:biosOwner", "BIOS Owner"],
    ]);
    expect(portfolioColumns).toHaveLength(48);
    expect(new Set(portfolioColumns.map((column) => column.key)).size).toBe(48);
    expect(portfolioDomainGroups).toEqual([
      { key: "project", label: "PROJECT INFORMATION", colSpan: 11 },
      { key: "schedule", label: "SCHEDULE", colSpan: 30 },
      { key: "team", label: "TEAM MEMBER", colSpan: 7 },
    ]);
    expect(portfolioSubgroups.map(({ label, colSpan }) => [label, colSpan])).toEqual([
      ["Core fields", 11], ["Design", 2], ["ME Portion", 4], ["Thermal", 1], ["A1", 4], ["C1-stage", 6], ["C2-stage", 6], ["RAMP-stage", 6], ["MDRR", 1], ["Project Roles", 3], ["Standard Function Owners", 4],
    ]);
    expect(portfolioColumns.some(({ key, label }) => /Current Published|Official|Schedule Status|Diagnostic/i.test(`${key} ${label}`))).toBe(false);
  });

  // Mutation: losing sticky identity context or allowing resize below readable widths.
  it("preserves four Project context columns and enforces column minimum widths", () => {
    expect(portfolioStickyColumnKeys).toEqual(["projectStatus", "year", "name", "qciProjectName"]);
    expect(portfolioProjectInfoColumns.map(({ defaultWidth, minWidth }) => [defaultWidth, minWidth])).toEqual([
      [100, 92], [76, 68], [215, 190], [170, 150], [118, 105], [125, 110], [145, 130], [90, 82], [200, 175], [135, 120], [92, 82],
    ]);
    for (const column of portfolioColumns) {
      expect(column.defaultWidth).toBeGreaterThanOrEqual(column.minWidth);
    }
    expect(portfolioColumns.filter(column => column.domain === "schedule").map(column => [column.defaultWidth, column.minWidth])).toEqual(Array.from({ length: 30 }, () => [118, 105]));
    expect(portfolioColumns.filter(column => column.domain === "team").map(column => [column.defaultWidth, column.minWidth])).toEqual(Array.from({ length: 7 }, () => [135, 120]));
    expect(resizePortfolioColumnWidth(118, 20, 105)).toBe(138);
    expect(resizePortfolioColumnWidth(118, -10, 105)).toBe(108);
    expect(resizePortfolioColumnWidth(118, -100, 105)).toBe(105);
  });
});
