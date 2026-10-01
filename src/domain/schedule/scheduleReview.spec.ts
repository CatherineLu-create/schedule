import { describe, expect, it } from "vitest";

import { parseDateOnly } from "../shared/dateOnly";
import {
  toCanonicalScheduleWorkingDraftId,
  toMilestoneDefinitionId,
  toMilestoneId,
  toMilestoneTypeId,
  toScheduleEvidenceId,
  toScheduleImportCandidateId,
  toScheduleReviewDecisionId,
  toScheduleReviewSessionId,
  toStageGroupId,
} from "../shared/ids";
import { toScheduleVersionNumber } from "./schedule";
import type {
  ApplicabilityApplyAction,
  DateApplyAction,
  ImportDecisionEvent,
  LocalToPublicEquivalenceAssertion,
  LocalToPublicEquivalenceDecisionEvent,
  ParsedApplicabilityValue,
  ParsedDateValue,
  ProjectLocalMilestoneDefinition,
  RawImportCell,
  RawScheduleImportValues,
  ScheduleEvidenceRecord,
  ScheduleImportCandidate,
  ScheduleReviewClosureEvent,
  ScheduleReviewDecisionEvent,
  ScheduleReviewSession,
} from "./scheduleReview";

describe("Schedule review compatibility contract", () => {
  it("constructs every ledger entry with exact identities and immutable raw values", () => {
    const plan = parseDateOnly("2026-10-15");
    if (plan === null) throw new Error("Expected valid test date");
    const evidenceId = toScheduleEvidenceId("evidence-1");
    const sessionId = toScheduleReviewSessionId("session-1");
    const candidateId = toScheduleImportCandidateId("candidate-1");
    const localId = toMilestoneDefinitionId("local-1");
    const publicId = toMilestoneDefinitionId("public-1");
    const rawCell: RawImportCell = { presence: "present", raw: "15 Oct 2026" };
    const rawValues: RawScheduleImportValues = {
      milestoneName: rawCell,
      stage: { presence: "present", raw: "A1" },
      milestoneType: { presence: "present", raw: "G/O" },
      plan: rawCell,
      actual: { presence: "missing" },
      applicability: { presence: "present", raw: "Applicable" },
    };
    const evidence: ScheduleEvidenceRecord = {
      id: evidenceId,
      sourceKind: "built-in-simulation",
      sourceDescriptor: "success pack row 1",
      rawValues,
      candidateFingerprint: "sha256:fixture-row-1",
    };
    const parsedPlan: ParsedDateValue = { kind: "parsed", raw: rawCell.raw, value: plan };
    const parsedActual: ParsedDateValue = { kind: "missing" };
    const parsedApplicability: ParsedApplicabilityValue = {
      kind: "explicitApplicable", raw: "Applicable",
    };
    const dateAction: DateApplyAction = { kind: "set", value: plan };
    const applicabilityAction: ApplicabilityApplyAction = {
      kind: "set", value: "applicable",
    };
    const local: ProjectLocalMilestoneDefinition = {
      id: localId,
      name: "Local milestone",
      stageGroupId: toStageGroupId("stage-a1"),
      milestoneTypeId: toMilestoneTypeId("type-go"),
      displayOrder: 7,
      source: "import",
      confirmation: "confirmed",
      evidenceIds: [evidenceId],
    };
    const candidate: ScheduleImportCandidate = {
      id: candidateId,
      evidenceId,
      parsedPlan,
      parsedActual,
      parsedApplicability,
      proposedDefinitionMatches: [localId],
      rawFindings: [],
      status: "pending",
    };
    const session: ScheduleReviewSession = {
      id: sessionId,
      workingDraftId: toCanonicalScheduleWorkingDraftId("draft-1"),
      source: "built-in-simulation",
      evidenceIds: [evidenceId],
    };
    const importDecision: ImportDecisionEvent = {
      id: toScheduleReviewDecisionId("decision-import-1"),
      sessionId,
      evidenceId,
      candidateId,
      targetMilestoneId: toMilestoneId("occurrence-1"),
      targetDefinitionId: localId,
      dateActions: { plan: dateAction, actual: { kind: "clear" } },
      applicabilityAction,
    };
    const assertion: LocalToPublicEquivalenceAssertion = {
      workContent: true,
      stage: true,
      type: true,
      completionCriteria: true,
    };
    const mappingDecision: LocalToPublicEquivalenceDecisionEvent = {
      id: toScheduleReviewDecisionId("decision-map-1"),
      sessionId,
      targetMilestoneId: toMilestoneId("occurrence-1"),
      fromLocalDefinitionId: localId,
      toPublicDefinitionId: publicId,
      assertion,
    };
    const decisions: readonly ScheduleReviewDecisionEvent[] = [importDecision, mappingDecision];
    const published: ScheduleReviewClosureEvent = {
      sessionId, kind: "published", versionNumber: toScheduleVersionNumber(2),
    };
    const discarded: ScheduleReviewClosureEvent = { sessionId, kind: "discarded" };
    expect(evidence.rawValues.plan).toEqual({ presence: "present", raw: "15 Oct 2026" });
    expect(local.evidenceIds).toEqual([evidenceId]);
    expect(candidate.proposedDefinitionMatches).toEqual([localId]);
    expect(session.workingDraftId).toBe("draft-1");
    expect(decisions.map((event) => event.id)).toEqual(["decision-import-1", "decision-map-1"]);
    expect([published.kind, discarded.kind]).toEqual(["published", "discarded"]);
  });
});
