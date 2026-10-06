import type { GovernanceSimulationPack, RawScheduleImportValues } from "../../domain/schedule/scheduleReview";

export const simulationSourceDescriptor = "Simulated import data | For PIP workflow validation only; not Kevin's official JSON format.";

export interface GovernanceSimulationRecord {
  readonly candidateFingerprint: string;
  readonly targetRole: "public" | "local" | "retired-existing" | "retired-no-reference";
  readonly publicIndex?: number;
  readonly rawValues: RawScheduleImportValues;
}

function raw(plan: string, applicability = "Applicable", actual = ""): RawScheduleImportValues {
  return {
    milestoneName: { presence: "missing" }, stage: { presence: "missing" }, milestoneType: { presence: "missing" },
    plan: { presence: "present", raw: plan }, actual: { presence: "present", raw: actual }, applicability: { presence: "present", raw: applicability },
  };
}

/** Roles select existing canonical identities; raw labels never allocate or infer a definition ID. */
export const governanceSimulationPacks: Readonly<Record<GovernanceSimulationPack, readonly GovernanceSimulationRecord[]>> = {
  "basic-success": [
    { candidateFingerprint: "basic-success:public-dates:v1", targetRole: "public", publicIndex: 0, rawValues: raw("2026-10-15") },
    { candidateFingerprint: "basic-success:local-dates:v1", targetRole: "local", rawValues: raw("2026-10-16") },
    { candidateFingerprint: "basic-success:explicit-na:v1", targetRole: "public", publicIndex: 1, rawValues: raw("", "N/A") },
  ],
  "fixable-validation": [
    { candidateFingerprint: "fixable-validation:first-valid:v1", targetRole: "public", publicIndex: 0, rawValues: raw("2026-10-15") },
    { candidateFingerprint: "fixable-validation:second-valid:v1", targetRole: "public", publicIndex: 1, rawValues: raw("2026-10-16") },
    { candidateFingerprint: "fixable-validation:ambiguous-date:v1", targetRole: "public", publicIndex: 2, rawValues: raw("10/11/2026") },
  ],
  "retired-existing-update": [
    { candidateFingerprint: "retired-existing-update:exact-row:v1", targetRole: "retired-existing", rawValues: raw("2026-10-15") },
  ],
  "retired-no-reference-negative": [
    { candidateFingerprint: "retired-no-reference-negative:unretained:v1", targetRole: "retired-no-reference", rawValues: raw("10/11/2026") },
  ],
};
