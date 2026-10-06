import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { createPortfolioDashboardWorkbook } from "./portfolioDashboardExport";
import { createPortfolioVisibleSchema } from "./portfolioDashboardColumns";
import { selectPortfolioDashboardRows, type PortfolioDashboardRow, type PortfolioCurrentPublishedRead } from "./application/selectors/portfolioDashboardRows";
import { createInitialSelfServiceReferenceCatalogs } from "./application/reference-data/selfServiceCatalogs";
import { canonicalProjectFixtures } from "./fixtures/v2/canonicalProjectFixtures";
import { canonicalScheduleFixtures } from "./fixtures/v2/canonicalScheduleFixtures";
import { initialGovernanceContext } from "./test/governanceTestUtils";
import { toMilestoneDefinitionId, toMilestoneId } from "./domain/shared/ids";

const schema = createPortfolioVisibleSchema(initialGovernanceContext());
const rows = selectPortfolioDashboardRows({ projects: canonicalProjectFixtures, schedules: canonicalScheduleFixtures }, createInitialSelfServiceReferenceCatalogs(), initialGovernanceContext());
function grid(input: readonly PortfolioDashboardRow[], visibleSchema = schema) {
  const workbook = createPortfolioDashboardWorkbook(input, visibleSchema);
  expect(workbook.SheetNames).toEqual(["All Projects"]);
  return XLSX.utils.sheet_to_json<string[]>(workbook.Sheets["All Projects"]!, { header: 1, defval: "" });
}
function occurrence(id: string, applicability: "applicable" | "notApplicable", plan: string, actual: string) {
  return { milestoneId: toMilestoneId(id), applicability, plan, actual };
}

describe("schema-driven All Projects serialization", () => {
  it("retains all schema leaves and the caller's Project order without changing either input", () => {
    const input = [rows[4]!, rows[0]!];
    const before = structuredClone({ input, schema });
    const output = grid(input);
    expect(output[0]).toHaveLength(48);
    expect(output[0]).toEqual(schema.columns.map(column => column.label));
    expect(output.slice(1).map(row => row[2])).toEqual(["Marlin", "Manta"]);
    expect(output[2]!.slice(0, 11)).toEqual(["RFQ", "2027", "Manta", "ZMT", "Acer", "Aspire", "Aspire (Refresh ID)", "16\"", "Intel Novalake HX 28C/24C", "GN22-X2/X4", ""]);
    expect({ input, schema }).toEqual(before);
  });

  it("keeps 48 headers and no Project rows when results are empty", () => {
    const output = grid([]);
    expect(output).toHaveLength(1);
    expect(output[0]).toHaveLength(48);
    expect(output[0]!.slice(-7)).toEqual(["QCI PM", "QCI PjM", "Acer PM", "ME Owner", "EE Owner", "Thermal Owner", "BIOS Owner"]);
  });

  it("keeps duplicate human leaf labels as independent cells in their schema positions", () => {
    const renamed = { ...schema, columns: schema.columns.map(column => ({ ...column, label: "Same label" })) };
    const output = grid([rows[0]!], renamed);
    expect(output[0]).toEqual(Array(48).fill("Same label"));
    expect(output[1]).toHaveLength(48);
    expect(output[1]![0]).toBe("RFQ");
    expect(output[1]![1]).toBe("2027");
    expect(output[1]![11]).toBe("Applicable\nP: 2026/09/18\nA: 2026/09/19");
    expect(output[1]![41]).toBe("");
    expect(output[1]![47]).toBe("");
  });

  it("keeps repeated Schedule occurrences inside one cell in Published display order and masks N/A dates", () => {
    const schedule: PortfolioCurrentPublishedRead = { kind: "published", versionLabel: "Published v03", milestoneCount: 7, cells: [
      { milestoneDefinitionId: toMilestoneDefinitionId("milestone-c2-c-g-o"), occurrences: [
        occurrence("later-id", "notApplicable", "2026/10/05", "2026/10/06"),
        occurrence("earlier-id", "applicable", "-", "-"),
        occurrence("dated", "applicable", "2026/10/07", "2026/10/08"),
      ] },
      { milestoneDefinitionId: toMilestoneDefinitionId("milestone-mdrr"), occurrences: [
        occurrence("na", "notApplicable", "2099/01/01", "2099/01/02"),
        occurrence("undated", "applicable", "-", "-"),
        occurrence("plan-only", "applicable", "2099/02/01", "-"),
        occurrence("completed", "applicable", "2099/03/01", "2099/03/02"),
      ] },
    ] };
    const output = grid([{ ...rows[0]!, schedule }]);
    expect(output).toHaveLength(2);
    expect(output[1]![28]).toBe("N/A\n\nApplicable\nP: —\nA: —\n\nApplicable\nP: 2026/10/07\nA: 2026/10/08");
    expect(output[1]![40]).toBe("Applicable\nP: 2099/02/01\nA: —\n\nApplicable\nP: 2099/03/01\nA: 2099/03/02");
    expect(output[1]![22]).toBe("");
  });

  it.each([
    { occurrences: [] },
    { occurrences: [occurrence("na", "notApplicable", "2099/01/01", "2099/01/02")] },
    { occurrences: [occurrence("undated", "applicable", "-", "-")] },
  ])("leaves missing, N/A, or entirely undated MDRR blank ($occurrences)", ({ occurrences }) => {
    const schedule: PortfolioCurrentPublishedRead = { kind: "published", versionLabel: "Published v01", milestoneCount: 1, cells: [{ milestoneDefinitionId: toMilestoneDefinitionId("milestone-mdrr"), occurrences }] };
    expect(grid([{ ...rows[0]!, schedule }])[1]![40]).toBe("");
  });

  it.each<PortfolioCurrentPublishedRead>([
    { kind: "unavailable", issues: [] }, { kind: "noPublishedSchedule" },
    { kind: "published", versionLabel: "Published v01", milestoneCount: 0, cells: [] },
  ])("retains blank Schedule and Team columns for $kind reads", schedule => {
    const output = grid([{ ...rows[0]!, qciPm: null, schedule }]);
    expect(output[0]!.slice(39)).toEqual(["SSL/GL", "MDRR", "QCI PM", "QCI PjM", "Acer PM", "ME Owner", "EE Owner", "Thermal Owner", "BIOS Owner"]);
    expect(output[1]!.slice(11)).toEqual(Array(37).fill(""));
  });
});
