import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { createPortfolioDashboardWorkbook } from "./portfolioDashboardExport";
import { createPortfolioVisibleSchema } from "./portfolioDashboardColumns";
import { selectPortfolioDashboardRows, type PortfolioDashboardRow, type PortfolioCurrentPublishedRead } from "./application/selectors/portfolioDashboardRows";
import { createInitialSelfServiceReferenceCatalogs } from "./application/reference-data/selfServiceCatalogs";
import { canonicalProjectFixtures } from "./fixtures/v2/canonicalProjectFixtures";
import { canonicalScheduleFixtures } from "./fixtures/v2/canonicalScheduleFixtures";
import { initialGovernanceContext } from "./test/governanceTestUtils";
import { toMilestoneDefinitionId, toMilestoneId, toPersonAssignmentId } from "./domain/shared/ids";
import type { ProjectRoles } from "./domain/team/team";

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
function savedAssignment(name: string) {
  return { assignmentId: toPersonAssignmentId(`export-${name}`), name, email: null };
}
function savedRoleGrid(projectRoles: ProjectRoles) {
  const project = { ...canonicalProjectFixtures[0]!, team: { projectRoles, functions: [], appliedTemplate: null } };
  const projected = selectPortfolioDashboardRows({ projects: [project], schedules: canonicalScheduleFixtures }, createInitialSelfServiceReferenceCatalogs(), initialGovernanceContext());
  return grid(projected);
}

describe("schema-driven All Projects serialization", () => {
  it("exports saved PM, ME and EE assignments without roster rows and leaves unassigned roles blank", () => {
    const output = savedRoleGrid({
      qciPm: savedAssignment("Synthetic Project Lead"), qciPjm: null, acerPm: null,
      qciMeOwner: savedAssignment("Synthetic Mechanical Owner"),
      qciEeOwner: savedAssignment("Synthetic Electrical Owner"),
    });
    expect(output[1]!.slice(-7)).toEqual([
      "Synthetic Project Lead", "", "", "Synthetic Mechanical Owner", "Synthetic Electrical Owner", "", "",
    ]);
  });

  it("exports all seven saved formal roles in their approved column positions without roster rows", () => {
    const output = savedRoleGrid({
      qciPm: savedAssignment("Synthetic Project Lead"),
      qciPjm: savedAssignment("Synthetic Project Manager"),
      acerPm: savedAssignment("Synthetic Acer PM"),
      qciMeOwner: savedAssignment("Synthetic Mechanical Owner"),
      qciEeOwner: savedAssignment("Synthetic Electrical Owner"),
      qciThermalOwner: savedAssignment("Synthetic Thermal Owner"),
      qciBiosOwner: savedAssignment("Synthetic BIOS Owner"),
    });
    expect(output[1]!.slice(-7)).toEqual([
      "Synthetic Project Lead", "Synthetic Project Manager", "Synthetic Acer PM", "Synthetic Mechanical Owner",
      "Synthetic Electrical Owner", "Synthetic Thermal Owner", "Synthetic BIOS Owner",
    ]);
  });

  it("uses the UI's trimmed name and email fallback while blank saved assignments stay blank", () => {
    const output = savedRoleGrid({
      qciPm: null, qciPjm: null, acerPm: null,
      qciMeOwner: { ...savedAssignment("  Saved Mechanical Owner  "), email: "unused@example.test" },
      qciEeOwner: { ...savedAssignment("  "), email: "  electrical@example.test  " },
      qciThermalOwner: savedAssignment("  "), qciBiosOwner: null,
    });
    expect(output[1]!.slice(-7)).toEqual(["", "", "", "Saved Mechanical Owner", "electrical@example.test", "", ""]);
  });

  it("preserves the blank workbook value for the QCI PM display placeholder", () => {
    expect(grid([{ ...rows[0]!, qciPm: { value: "placeholder", label: "-" } }])[1]![43]).toBe("");
  });
  it("retains all schema leaves and the caller's Project order without changing either input", () => {
    const input = [rows[4]!, rows[0]!];
    const before = structuredClone({ input, schema });
    const output = grid(input);
    expect(output[0]).toHaveLength(50);
    expect(output[0]![5]).toBe("Project Remark");
    expect(output[0]!.filter((_, index) => index !== 5)).toEqual(schema.columns.map(column => column.label));
    expect(output.slice(1).map(row => row[2])).toEqual(["Marlin", "Manta"]);
    expect(output[2]!.slice(0, 13)).toEqual(["RFQ", "2027", "Manta", "ZMT", "", "", "Acer", "Aspire", "Aspire (Refresh ID)", "16\"", "Intel Novalake HX 28C/24C", "GN22-X2/X4", ""]);
    expect({ input, schema }).toEqual(before);
  });

  it("keeps 50 headers and no Project rows when results are empty", () => {
    const output = grid([]);
    expect(output).toHaveLength(1);
    expect(output[0]).toHaveLength(50);
    expect(output[0]!.slice(-7)).toEqual(["QCI PM", "QCI PjM", "Acer PM", "ME Owner", "EE Owner", "Thermal Owner", "BIOS Owner"]);
  });

  it("keeps duplicate human leaf labels as independent cells in their schema positions", () => {
    const renamed = { ...schema, columns: schema.columns.map(column => ({ ...column, label: "Same label" })) };
    const output = grid([rows[0]!], renamed);
    expect(output[0]).toEqual([...Array(5).fill("Same label"), "Project Remark", ...Array(44).fill("Same label")]);
    expect(output[1]).toHaveLength(50);
    expect(output[1]![0]).toBe("RFQ");
    expect(output[1]![1]).toBe("2027");
    expect(output[1]![13]).toBe("Applicable\nP: 2026/09/18\nA: 2026/09/19");
    expect(output[1]![43]).toBe("");
    expect(output[1]![49]).toBe("");
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
    expect(output[1]![30]).toBe("N/A\n\nApplicable\nP: —\nA: —\n\nApplicable\nP: 2026/10/07\nA: 2026/10/08");
    expect(output[1]![42]).toBe("Applicable\nP: 2099/02/01\nA: —\n\nApplicable\nP: 2099/03/01\nA: 2099/03/02");
    expect(output[1]![24]).toBe("");
  });

  it.each([
    { occurrences: [] },
    { occurrences: [occurrence("na", "notApplicable", "2099/01/01", "2099/01/02")] },
    { occurrences: [occurrence("undated", "applicable", "-", "-")] },
  ])("leaves missing, N/A, or entirely undated MDRR blank ($occurrences)", ({ occurrences }) => {
    const schedule: PortfolioCurrentPublishedRead = { kind: "published", versionLabel: "Published v01", milestoneCount: 1, cells: [{ milestoneDefinitionId: toMilestoneDefinitionId("milestone-mdrr"), occurrences }] };
    expect(grid([{ ...rows[0]!, schedule }])[1]![42]).toBe("");
  });

  it.each<PortfolioCurrentPublishedRead>([
    { kind: "unavailable", issues: [] }, { kind: "noPublishedSchedule" },
    { kind: "published", versionLabel: "Published v01", milestoneCount: 0, cells: [] },
  ])("retains blank Schedule and Team columns for $kind reads", schedule => {
    const output = grid([{ ...rows[0]!, qciPm: null, schedule }]);
    expect(output[0]!.slice(41)).toEqual(["SSL/GL", "MDRR", "QCI PM", "QCI PjM", "Acer PM", "ME Owner", "EE Owner", "Thermal Owner", "BIOS Owner"]);
    expect(output[1]!.slice(13)).toEqual(Array(37).fill(""));
  });
});


it.each([undefined, null, "First line\nSecond line", "x".repeat(500), "-"])("exports the full saved Basic Information Remark %s in one cell", remark => {
  const source = canonicalProjectFixtures[0]!;
  const project = { ...source, master: { ...source.master,
    basicInformation: { ...source.master.basicInformation, remark }, other: { remark: "User Trial demo seed: DEMO - G/O Due Soon" } } };
  const projected = selectPortfolioDashboardRows({ projects: [project], schedules: canonicalScheduleFixtures }, createInitialSelfServiceReferenceCatalogs(), initialGovernanceContext());
  const output = grid(projected);
  expect(output[0]!.slice(4, 6)).toEqual(["Project Type", "Project Remark"]);
  expect(output[1]![5]).toBe(remark ?? "");
  expect(JSON.stringify(output)).not.toContain(project.master.other.remark);
  expect(output[1]).toHaveLength(50);
  expect(schema.columns.map(column => column.label)).not.toContain("Project Remark");
});
