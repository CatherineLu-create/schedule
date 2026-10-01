import { describe, expect, it } from "vitest";
import { governanceSimulationPacks, simulationSourceDescriptor } from "./governanceSimulationFixtures";

describe("PF-03 typed raw simulation groups", () => {
  it("has four independent scenarios with stable distinct scenario/candidate fingerprints", () => {
    expect(Object.keys(governanceSimulationPacks)).toEqual([
      "basic-success", "fixable-validation", "retired-existing-update", "retired-no-reference-negative",
    ]);
    const fingerprints = Object.values(governanceSimulationPacks).flatMap(pack => pack.map(record => record.candidateFingerprint));
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
    expect(governanceSimulationPacks["basic-success"].map(row => row.targetRole)).toEqual(["public", "local", "public"]);
    expect(governanceSimulationPacks["fixable-validation"].map(row => row.targetRole)).toEqual(["public", "public", "public"]);
    expect(governanceSimulationPacks["retired-existing-update"][0].targetRole).toBe("retired-existing");
    expect(governanceSimulationPacks["retired-no-reference-negative"][0].targetRole).toBe("retired-no-reference");
  });
  it("discloses simulation source and provides N/A with blank dates and fixable ambiguous raw", () => {
    expect(simulationSourceDescriptor).toBe("模擬匯入資料｜供 PIP 流程驗收，非 Kevin 正式 JSON 格式");
    expect(governanceSimulationPacks["basic-success"][2].rawValues).toMatchObject({
      applicability: { presence: "present", raw: "N/A" }, plan: { presence: "present", raw: "" }, actual: { presence: "present", raw: "" },
    });
    expect(governanceSimulationPacks["fixable-validation"][2].rawValues.plan).toEqual({ presence: "present", raw: "10/11/2026" });
    expect(Object.values(governanceSimulationPacks).flat().every(record => !('definitionId' in record))).toBe(true);
  });
});
