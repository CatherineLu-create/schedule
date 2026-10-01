import { describe, expect, expectTypeOf, it } from "vitest";

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
import { parseScheduleImportDate, parseScheduleImportApplicability, createScheduleImportCandidate, suggestScheduleImportActions } from "./scheduleReview";
import type {
  ApplicabilityApplyAction,
  ConfirmProjectLocalMilestoneDefinitionInput,
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
  it("accepts_injected_local_identity_and_evidence_references_without_draft_or_order_input", () => {
    expectTypeOf<ConfirmProjectLocalMilestoneDefinitionInput>().toEqualTypeOf<{
      readonly definitionId: ProjectLocalMilestoneDefinition["id"];
      readonly name: string;
      readonly stageGroupId: ProjectLocalMilestoneDefinition["stageGroupId"];
      readonly milestoneTypeId: ProjectLocalMilestoneDefinition["milestoneTypeId"];
      readonly source: "manual" | "import";
      readonly evidenceIds: ProjectLocalMilestoneDefinition["evidenceIds"];
    }>();
  });

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

describe("immutable built-in import parsing and action suggestions", () => {
  const present = (raw: string): RawImportCell => ({ presence: "present", raw });
  const evidence = (plan: RawImportCell, applicability = present("Applicable")): ScheduleEvidenceRecord => ({
    id: toScheduleEvidenceId("raw-matrix"), sourceKind: "built-in-simulation", sourceDescriptor: "typed fixture",
    candidateFingerprint: "raw-matrix:1", rawValues: {
      milestoneName: present("Known fixture"), stage: { presence: "missing" }, milestoneType: { presence: "missing" },
      plan, actual: { presence: "missing" }, applicability,
    },
  });
  it.each([
    [{ presence: "missing" }, "missing"], [present(""), "blank"], [present("  "), "blank"],
    [present("-"), "invalid"], [present("*"), "invalid"], [present("2024-02-29"), "parsed"],
    [present("10/11/2026"), "ambiguous"], [present("2026-02-30"), "invalid"], [present("nonsense"), "invalid"],
  ] as const)("preserves raw cell %j while classifying %s", (cell, kind) => {
    const raw = evidence(cell);
    const before = structuredClone(raw);
    expect(parseScheduleImportDate(cell).kind).toBe(kind);
    const candidate = createScheduleImportCandidate(raw, toScheduleImportCandidateId("raw-candidate"));
    expect(candidate.parsedPlan.kind).toBe(kind);
    expect(raw).toEqual(before);
    if (kind === "parsed") expect(candidate.parsedPlan).toMatchObject({ value: "2024-02-29", raw: "2024-02-29" });
  });
  it.each([
    [{ presence: "missing" }, "missing"], [present(""), "blank"], [present("Applicable"), "explicitApplicable"],
    [present("N/A"), "explicitNotApplicable"], [present("-"), "unrecognized"], [present("*"), "unrecognized"],
    [present("unknown"), "unrecognized"],
  ] as const)("applicability distinguishes %j from N/A", (cell, kind) => {
    expect(parseScheduleImportApplicability(cell).kind).toBe(kind);
  });
  it.each(["-", "*"])("legacy sentinel %s never means N/A", raw => {
    const candidate = createScheduleImportCandidate(evidence(present(raw), present(raw)), toScheduleImportCandidateId("sentinel"));
    expect(candidate.rawFindings.filter(issue => issue.code === "schedule.import.legacy-sentinel")).toHaveLength(2);
    expect(suggestScheduleImportActions(candidate, null).applicability).toBeNull();
  });
  it("existing missing/blank recommend keep; new missing/blank recommend clear; valid source date is reusable", () => {
    const candidate = createScheduleImportCandidate(evidence(present("")), toScheduleImportCandidateId("defaults"));
    const existing = { milestoneId: toMilestoneId("existing"), milestoneDefinitionId: toMilestoneDefinitionId("definition"),
      applicability: "applicable" as const, plan: parseDateOnly("2026-10-01"), actual: parseDateOnly("2026-10-02") };
    expect(suggestScheduleImportActions(candidate, existing)).toMatchObject({ plan: { kind: "keepExisting" }, actual: { kind: "keepExisting" } });
    expect(suggestScheduleImportActions(candidate, null)).toMatchObject({ plan: { kind: "clear" }, actual: { kind: "clear" } });
    const valid = createScheduleImportCandidate(evidence(present("2026-10-15")), candidate.id);
    expect(suggestScheduleImportActions(valid, existing).plan).toEqual({ kind: "set", value: "2026-10-15" });
    const bad = createScheduleImportCandidate(evidence(present("10/11/2026")), candidate.id);
    expect(suggestScheduleImportActions(bad, null).plan).toBeNull();
    expect(suggestScheduleImportActions(bad, existing).plan).toBeNull();
  });
  it("explicit N/A recommends date clears but does not mutate the raw conflict", () => {
    const raw = evidence(present("2026-10-15"), present("N/A"));
    const candidate = createScheduleImportCandidate(raw, toScheduleImportCandidateId("na"));
    expect(suggestScheduleImportActions(candidate, null)).toEqual({
      applicability: { kind: "set", value: "notApplicable" }, plan: { kind: "clear" }, actual: { kind: "clear" },
    });
    expect(raw.rawValues.plan).toEqual(present("2026-10-15"));
  });
});
