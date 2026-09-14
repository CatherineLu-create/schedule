import { describe, expect, it } from "vitest";
import { mdrrMilestoneDefinition, milestoneDefinitions, portfolioMilestoneDefinitions } from "./config/v2/referenceData";
import {
  defaultPortfolioColumnWidths, portfolioColumns, portfolioDomainGroups,
  portfolioProjectInfoColumns, portfolioScheduleColumnGroups, portfolioScheduleColumnMappings,
  portfolioStickyColumnKeys, portfolioSubgroups, portfolioTeamColumnGroups, resizePortfolioColumnWidth,
} from "./portfolioDashboardColumns";

describe("Portfolio visual schema", () => {
  // Mutation: dropping/reordering a stage or using same-name definition matching.
  it("maps the 35 ordered visual leaves to all 34 Portfolio definitions and inactive MDRR", () => {
    expect(portfolioScheduleColumnMappings.map((entry) => entry.key)).toEqual([
      "schedule:design:kickoff", "schedule:design:id-fix",
      "schedule:me-portion:me-drawing", "schedule:me-portion:mockup-dfm", "schedule:me-portion:tooling-start-t1", "schedule:me-portion:me-material-c",
      "schedule:thermal:thermal-module-c", "schedule:a1-stage:a-g-o", "schedule:a1-stage:a-smt", "schedule:a1-stage:a-test",
      "schedule:a-a2-stage:a-g-o", "schedule:a-a2-stage:a-smt", "schedule:a-a2-stage:a-test", "schedule:a-a2-stage:a-close",
      "schedule:c1-stage:c-g-o", "schedule:c1-stage:c-smt", "schedule:c1-stage:c-pre-build", "schedule:c1-stage:c-main-build", "schedule:c1-stage:c-test", "schedule:c1-stage:c1-close",
      "schedule:c2-stage:c-g-o", "schedule:c2-stage:c-smt", "schedule:c2-stage:c-pre-build", "schedule:c2-stage:c-main-build", "schedule:c2-stage:c-test", "schedule:c2-stage:bios-frozen", "schedule:c2-stage:golden-run", "schedule:c2-stage:c-close",
      "schedule:ramp-stage:ramp-g-o", "schedule:ramp-stage:me-signoff", "schedule:ramp-stage:ramp-smt", "schedule:ramp-stage:ramp-pre-build", "schedule:ramp-stage:ramp-main-build", "schedule:ramp-stage:fcs", "schedule:mdrr:mdrr",
    ]);
    const active = portfolioScheduleColumnMappings.slice(0, 34);
    expect(active.map((entry) => entry.milestoneDefinitionId)).toEqual(portfolioMilestoneDefinitions.map((definition) => definition.id));
    expect(new Set(active.map((entry) => entry.milestoneDefinitionId)).size).toBe(34);
    for (const entry of active) {
      expect(milestoneDefinitions.find((definition) => definition.id === entry.milestoneDefinitionId)?.showInPortfolio).toBe(true);
      expect(entry.portfolioVisible).toBe(true);
      expect(entry.valueMode).toBe("planActual");
    }
    expect(portfolioScheduleColumnMappings[34]).toMatchObject({ milestoneDefinitionId: mdrrMilestoneDefinition.id, portfolioVisible: false, valueMode: "placeholder" });
    // Mutation: the visual placeholder outlives a removed, duplicated, or Portfolio-enabled canonical MDRR definition.
    const mappedMdrrDefinitions = milestoneDefinitions.filter((definition) => definition.id === portfolioScheduleColumnMappings[34].milestoneDefinitionId);
    expect(mappedMdrrDefinitions).toHaveLength(1);
    expect(mappedMdrrDefinitions[0]).toEqual(mdrrMilestoneDefinition);
    expect(mappedMdrrDefinitions[0].showInPortfolio).toBe(false);
  });

  // Mutation: flattening domains, wrong colspans or adding a diagnostic leaf.
  it("keeps the 11/35/7 schema and subgroup hierarchy without diagnostics", () => {
    expect(portfolioProjectInfoColumns.map(({ key, label }) => [key, label])).toEqual([
      ["projectStatus", "Status"], ["year", "Year"], ["name", "STN Project Name"], ["qciProjectName", "QCI Model Name"],
      ["customer", "Customer"], ["category", "Category"], ["productLine", "Product Line"], ["size", "Panel Size"], ["cpu", "CPU"], ["gpu", "GPU"], ["pcbNumber", "PCB#"],
    ]);
    expect(portfolioScheduleColumnGroups.flatMap((group) => group.columns.map((column) => column.key))).toEqual(portfolioScheduleColumnMappings.map((entry) => entry.key));
    expect(portfolioTeamColumnGroups.flatMap((group) => group.columns.map(({ key, label }) => [key, label]))).toEqual([
      ["team:qciPm", "QCI PM"], ["team:qciPjm", "QCI PjM"], ["team:acerPm", "Acer PM"],
      ["team:meOwner", "ME Owner"], ["team:eeOwner", "EE Owner"], ["team:thermalOwner", "Thermal Owner"], ["team:biosOwner", "BIOS Owner"],
    ]);
    expect(portfolioColumns).toHaveLength(53);
    expect(new Set(portfolioColumns.map((column) => column.key)).size).toBe(53);
    expect(portfolioDomainGroups).toEqual([
      { key: "project", label: "PROJECT INFORMATION", colSpan: 11 },
      { key: "schedule", label: "SCHEDULE", colSpan: 35 },
      { key: "team", label: "TEAM", colSpan: 7 },
    ]);
    expect(portfolioSubgroups.map(({ label, colSpan }) => [label, colSpan])).toEqual([
      ["Core fields", 11], ["Design", 2], ["ME Portion", 4], ["Thermal", 1], ["A1-stage", 3], ["A/A2-stage", 4], ["C1-stage", 6], ["C2-stage", 8], ["RAMP-stage", 6], ["MDRR", 1], ["Project Roles", 3], ["Standard Function Owners", 4],
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
      expect(defaultPortfolioColumnWidths[column.key]).toBe(column.defaultWidth);
      expect(column.defaultWidth).toBeGreaterThanOrEqual(column.minWidth);
    }
    expect(resizePortfolioColumnWidth(118, 20, 105)).toBe(138);
    expect(resizePortfolioColumnWidth(118, -10, 105)).toBe(108);
    expect(resizePortfolioColumnWidth(118, -100, 105)).toBe(105);
  });
});
