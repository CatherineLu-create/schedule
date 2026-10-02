import { describe, expect, it } from "vitest";
import { milestoneDefinitions, milestoneTypeCatalog, stageGroupCatalog } from "../../config/v2/referenceData";
import type { CommandResult } from "../../domain/governance/milestoneGovernance";
import { createEmptyCanonicalProjectSchedule, type CanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import type { ConfirmProjectLocalMilestoneDefinitionInput, ScheduleReviewFailureCode } from "../../domain/schedule/scheduleReview";
import { toCanonicalScheduleWorkingDraftId, toMilestoneDefinitionId, toMilestoneId, toMilestoneTypeId, toScheduleEvidenceId, toStageGroupId } from "../../domain/shared/ids";
import { devProject001, devProject003 } from "../../fixtures/v2/canonicalProjectFixtures";
import { devSchedule001 } from "../../fixtures/v2/canonicalScheduleFixtures";
import { initialGovernanceContext, publishedRetirementFixture } from "../../test/governanceTestUtils";
import { selectEffectiveMilestoneGovernanceContext } from "../governance/effectiveMilestoneGovernanceContext";
import { addScheduleWorkingDraftMilestone, cancelScheduleWorkingDraft, publishScheduleWorkingDraft, startScheduleWorkingDraft, updateScheduleWorkingDraftMilestone } from "./canonicalScheduleCommands";
import { confirmProjectLocalMilestoneDefinition, mapDraftLocalOccurrenceToPublic, previewDraftLocalOccurrenceToPublic } from "./scheduleReviewCommands";
import type { ConfirmMapDraftLocalOccurrenceToPublicInput, LocalToPublicEquivalenceAssertion } from "../../domain/schedule/scheduleReview";
import { createInitialMilestoneGovernanceRuntimeState } from "../governance/milestoneGovernanceInitializer";
import { startGovernanceDraft, updateGovernanceDraft, publishGovernanceDraft } from "../governance/milestoneGovernanceCommands";
import { selectEffectiveProjectMilestoneRequirements } from "../governance/projectMilestoneRequirements";
import { toGovernanceDraftId, toGovernanceReleaseId, toRequirementEnrollmentId, toRequirementWithdrawalId } from "../../domain/shared/ids";
import { toScheduleVersionNumber } from "../../domain/schedule/schedule";
import { collectSchedulePublishBlockingFindings, confirmScheduleImportDecision, loadBuiltInScheduleSimulation, previewScheduleImportDecision } from "./scheduleReviewCommands";
import { createScheduleImportCandidate, suggestScheduleImportActions, type ConfirmScheduleImportDecisionInput, type GovernanceSimulationPack, type ScheduleReviewIdBundle, type RawImportCell } from "../../domain/schedule/scheduleReview";
import { parseDateOnly, type DateOnly } from "../../domain/shared/dateOnly";
import { toScheduleImportCandidateId, toScheduleReviewSessionId, toScheduleReviewDecisionId, toProjectId } from "../../domain/shared/ids";
import type { CanonicalScheduleCommandContext } from "./canonicalScheduleCommands";
import { selectEffectiveRetiredDraftOccurrenceGrants } from "../governance/effectiveMilestoneGovernanceContext";
import { selectDashboardAttention } from "../selectors/dashboardAttention";
import { selectPortfolioDashboardRows } from "../selectors/portfolioDashboardRows";
import { createInitialSelfServiceReferenceCatalogs } from "../reference-data/selfServiceCatalogs";

function value<T>(result: CommandResult<T, string>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}

function input(overrides: Partial<ConfirmProjectLocalMilestoneDefinitionInput> = {}): ConfirmProjectLocalMilestoneDefinitionInput {
  return {
    definitionId: toMilestoneDefinitionId("local-acceptance"), name: "Local acceptance",
    stageGroupId: toStageGroupId("stage-a1"), milestoneTypeId: toMilestoneTypeId("type-test"),
    source: "manual", evidenceIds: [], ...overrides,
  };
}

function freeze<T>(object: T): T {
  if (object !== null && typeof object === "object") {
    for (const child of Object.values(object)) freeze(child);
    Object.freeze(object);
  }
  return object;
}

function expectOnlyRegistryChanged(before: CanonicalProjectSchedule, after: CanonicalProjectSchedule) {
  expect(after).not.toBe(before);
  for (const key of Object.keys(before) as (keyof CanonicalProjectSchedule)[]) {
    if (key !== "localDefinitions") expect(after[key]).toBe(before[key]);
  }
  expect(after.localDefinitions.slice(0, -1)).toEqual(before.localDefinitions);
}

function expectRejected(
  request: ConfirmProjectLocalMilestoneDefinitionInput,
  field: string,
  code: ScheduleReviewFailureCode = "invalid-local-classification",
  schedule = createEmptyCanonicalProjectSchedule(devProject001.id),
  governance = initialGovernanceContext(),
) {
  const before = structuredClone({ schedule, governance, request, milestoneDefinitions, milestoneTypeCatalog, stageGroupCatalog });
  freeze(schedule); freeze(governance); freeze(request);
  const result = confirmProjectLocalMilestoneDefinition(schedule, request, governance);
  expect(result).toMatchObject({ ok: false, code, issues: [expect.objectContaining({
    domain: "schedule", source: "data", severity: "blocking",
    target: { section: "schedule.localDefinitions", entityId: request.definitionId, field },
  })] });
  expect({ schedule, governance, request, milestoneDefinitions, milestoneTypeCatalog, stageGroupCatalog }).toEqual(before);
  return result;
}

describe("confirmProjectLocalMilestoneDefinition", () => {
  it("confirms_manual_local_definition_with_existing_stage_and_type", () => {
    const schedule = freeze(structuredClone(devSchedule001));
    const governance = freeze(initialGovernanceContext());
    const request = freeze(input());
    const untouched = structuredClone({ schedule, governance, request, devProject001, devProject003, milestoneDefinitions, stageGroupCatalog, milestoneTypeCatalog });
    const next = value(confirmProjectLocalMilestoneDefinition(schedule, request, governance));
    expect(next.localDefinitions).toEqual([{
      id: "local-acceptance", name: "Local acceptance", stageGroupId: "stage-a1", milestoneTypeId: "type-test",
      displayOrder: 370, source: "manual", confirmation: "confirmed", evidenceIds: [],
    }]);
    expectOnlyRegistryChanged(schedule, next);
    expect({ schedule, governance, request, devProject001, devProject003, milestoneDefinitions, stageGroupCatalog, milestoneTypeCatalog }).toEqual(untouched);
  });

  it("trims_local_definition_name_and_rejects_blank", () => {
    const schedule = createEmptyCanonicalProjectSchedule(devProject001.id);
    const next = value(confirmProjectLocalMilestoneDefinition(schedule, input({ name: " \t Local acceptance \n " }), initialGovernanceContext()));
    expect(next.localDefinitions[0].name).toBe("Local acceptance");
    expectRejected(input({ name: " \t\n " }), "name");
  });

  it("rejects_unknown_stage", () => {
    expectRejected(input({ stageGroupId: toStageGroupId("stage-new") }), "stageGroupId");
  });
  it("rejects_unknown_milestone_type", () => {
    expectRejected(input({ milestoneTypeId: toMilestoneTypeId("type-new") }), "milestoneTypeId");
  });
  it.each(["Other", "Misc", "Unclassified", "A1-stage", "G/O"])("rejects_catch_all_or_fabricated_classification: %s", label => {
    expectRejected(input({ stageGroupId: toStageGroupId(label) }), "stageGroupId");
    expectRejected(input({ milestoneTypeId: toMilestoneTypeId(label) }), "milestoneTypeId");
    expectRejected(input({ stageGroupId: toStageGroupId(`stage-${label.toLowerCase()}`) }), "stageGroupId");
    expectRejected(input({ milestoneTypeId: toMilestoneTypeId(`type-${label.toLowerCase()}`) }), "milestoneTypeId");
  });

  it("accepts_existing_classifications_used_by_compatibility_definitions", () => {
    const next = value(confirmProjectLocalMilestoneDefinition(createEmptyCanonicalProjectSchedule(devProject001.id),
      input({ stageGroupId: toStageGroupId("stage-a-a2"), milestoneTypeId: toMilestoneTypeId("type-bios-frozen") }), initialGovernanceContext()));
    expect(next.localDefinitions[0]).toMatchObject({ stageGroupId: "stage-a-a2", milestoneTypeId: "type-bios-frozen" });
  });

  it("rejects_local_definition_id_collision_with_same_project_local", () => {
    const schedule = value(confirmProjectLocalMilestoneDefinition(createEmptyCanonicalProjectSchedule(devProject001.id), input(), initialGovernanceContext()));
    expectRejected(input({ name: "Different work" }), "definitionId", "id-collision", schedule);
  });
  it.each(["milestone-a1-a-test", "milestone-c2-golden-run"])("rejects_local_definition_id_collision_with_public_historical_definition: %s", id => {
    expectRejected(input({ definitionId: toMilestoneDefinitionId(id) }), "definitionId", "id-collision");
  });
  it("does_not_accept_retired_public_definition_id_as_local_workaround", () => {
    const fixture = publishedRetirementFixture();
    const governance = value(selectEffectiveMilestoneGovernanceContext(fixture.state));
    expect(governance.addablePublicDefinitions.some(definition => definition.id === fixture.grant.milestoneDefinitionId)).toBe(false);
    expectRejected(input({ definitionId: fixture.grant.milestoneDefinitionId }), "definitionId", "id-collision", fixture.schedule, governance);
  });
  it("rejects_blank_definition_identity_without_generating_or_normalizing_one", () => {
    expectRejected(input({ definitionId: " \t " as ConfirmProjectLocalMilestoneDefinitionInput["definitionId"] }), "definitionId", "id-collision");
    const next = value(confirmProjectLocalMilestoneDefinition(createEmptyCanonicalProjectSchedule(devProject001.id),
      input({ definitionId: toMilestoneDefinitionId(" opaque exact ID ") }), initialGovernanceContext()));
    expect(next.localDefinitions[0].id).toBe(" opaque exact ID ");
  });

  it("does_not_make_local_definition_public_or_cross_project_addable", () => {
    const governance = initialGovernanceContext();
    const before = structuredClone(governance);
    const local = value(confirmProjectLocalMilestoneDefinition(createEmptyCanonicalProjectSchedule(devProject001.id), input(), governance));
    expect(local.localDefinitions.map(definition => definition.id)).toEqual(["local-acceptance"]);
    for (const schedule of [local, createEmptyCanonicalProjectSchedule(devProject003.id)]) {
      const context = { governance, localDefinitions: local.localDefinitions, retiredDraftOccurrenceGrants: [] };
      const started = startScheduleWorkingDraft(schedule, { workingDraftId: toCanonicalScheduleWorkingDraftId("public-only-add") }, context);
      if (!started.ok) throw new Error(JSON.stringify(started));
      const added = addScheduleWorkingDraftMilestone(started.schedule, { milestoneId: toMilestoneId("local-add"), milestoneDefinitionId: input().definitionId }, context);
      expect(added.ok).toBe(false);
      expect(started.schedule.workingDraft?.milestones).toEqual([]);
    }
    expect(governance).toEqual(before);
    for (const definitions of [governance.addablePublicDefinitions, governance.definitionsForHistoricalResolution, governance.portfolioColumnDefinitions]) {
      expect(definitions.some(definition => definition.id === input().definitionId)).toBe(false);
    }
  });

  it("manual_local_creation_requires_no_import_session_or_evidence", () => {
    const next = value(confirmProjectLocalMilestoneDefinition(createEmptyCanonicalProjectSchedule(devProject001.id), input(), initialGovernanceContext()));
    expect(next).toMatchObject({ workingDraft: null, publishedVersions: [], evidenceLedger: [], reviewSessions: [], reviewDecisions: [], reviewClosures: [] });
    expect(next.localDefinitions[0]).toMatchObject({ source: "manual", evidenceIds: [] });
  });

  it.each(["manual", "import"] as const)("supplied_evidence_ids_are_preserved_without_fabricating_new_evidence: %s", source => {
    const evidenceIds = [toScheduleEvidenceId("reference-b"), toScheduleEvidenceId("reference-a"), toScheduleEvidenceId("reference-b")];
    const next = value(confirmProjectLocalMilestoneDefinition(createEmptyCanonicalProjectSchedule(devProject001.id), input({ source, evidenceIds }), initialGovernanceContext()));
    expect(next.localDefinitions[0]).toMatchObject({ source, evidenceIds: ["reference-b", "reference-a", "reference-b"] });
    expect(next.localDefinitions[0].evidenceIds).not.toBe(evidenceIds);
    evidenceIds.push(toScheduleEvidenceId("later-caller-change"));
    expect(next.localDefinitions[0].evidenceIds).toEqual(["reference-b", "reference-a", "reference-b"]);
    expect(next.evidenceLedger).toEqual([]);
    expect(next.reviewSessions).toEqual([]);
    expect(next.reviewDecisions).toEqual([]);
  });
  it("rejects_unknown_source", () => {
    expectRejected({ ...input(), source: "guessed" } as unknown as ConfirmProjectLocalMilestoneDefinitionInput, "source");
  });

  it("command_failure_is_atomic_and_does_not_touch_published_or_draft_occurrences", () => {
    const context = { governance: initialGovernanceContext(), localDefinitions: [], retiredDraftOccurrenceGrants: [] };
    const started = startScheduleWorkingDraft(structuredClone(devSchedule001), { workingDraftId: toCanonicalScheduleWorkingDraftId("atomic-draft") }, context);
    if (!started.ok) throw new Error(JSON.stringify(started));
    expect(started.draft.milestones.length).toBeGreaterThan(0);
    expectRejected(input({ name: " " }), "name", "invalid-local-classification", started.schedule, context.governance);
  });

  it("confirmed_local_definition_does_not_create_occurrence_implicitly", () => {
    const context = { governance: initialGovernanceContext(), localDefinitions: [], retiredDraftOccurrenceGrants: [] };
    const started = startScheduleWorkingDraft(structuredClone(devSchedule001), { workingDraftId: toCanonicalScheduleWorkingDraftId("untouched-draft") }, context);
    if (!started.ok) throw new Error(JSON.stringify(started));
    const before = freeze(started.schedule);
    const next = value(confirmProjectLocalMilestoneDefinition(before, input(), context.governance));
    expectOnlyRegistryChanged(before, next);
    expect(next.workingDraft?.milestones.some(milestone => milestone.milestoneDefinitionId === input().definitionId)).toBe(false);
  });

  it("keeps_distinct_opaque_identity_namespaces_independent", () => {
    const id = devSchedule001.publishedVersions[0].milestones[0].milestoneId;
    const next = value(confirmProjectLocalMilestoneDefinition(devSchedule001,
      input({ definitionId: toMilestoneDefinitionId(id), evidenceIds: [toScheduleEvidenceId(id)] }), initialGovernanceContext()));
    expect(next.localDefinitions[0].id).toBe(id);
  });

  it("appends_deterministic_display_order_after_all_public_history_and_existing_locals", () => {
    const governance = initialGovernanceContext();
    const first = value(confirmProjectLocalMilestoneDefinition(createEmptyCanonicalProjectSchedule(devProject001.id), input(), governance));
    const second = value(confirmProjectLocalMilestoneDefinition(first, input({ definitionId: toMilestoneDefinitionId("local-second") }), governance));
    expect(second.localDefinitions.map(definition => definition.displayOrder)).toEqual([370, 380]);
    expect(second.localDefinitions[0]).toBe(first.localDefinitions[0]);
    expect(first.localDefinitions).toHaveLength(1);
    expect(value(confirmProjectLocalMilestoneDefinition(first, input({ definitionId: toMilestoneDefinitionId("local-second") }), governance))).toEqual(second);
  });

  it.each([Number.MAX_SAFE_INTEGER, Number.POSITIVE_INFINITY, Number.NaN])("rejects_unrepresentable_display_order_atomically: %s", order => {
    const governance = initialGovernanceContext();
    const local = value(confirmProjectLocalMilestoneDefinition(createEmptyCanonicalProjectSchedule(devProject001.id), input(), governance));
    const schedule = { ...local, localDefinitions: [{ ...local.localDefinitions[0], displayOrder: order }] };
    expectRejected(input({ definitionId: toMilestoneDefinitionId("local-overflow") }), "displayOrder", "invalid-local-classification", schedule, governance);
    expectRejected(input(), "displayOrder", "invalid-local-classification", createEmptyCanonicalProjectSchedule(devProject001.id), {
      ...governance, definitionsForHistoricalResolution: governance.definitionsForHistoricalResolution.map((definition, index) => index === 0 ? { ...definition, displayOrder: order } : definition),
    });
  });
});

function reviewIds(prefix = "review", count = 3): ScheduleReviewIdBundle {
  return { sessionId: toScheduleReviewSessionId(`${prefix}-session`), evidenceIds: Array.from({ length: count }, (_, i) => toScheduleEvidenceId(`${prefix}-e${i}`)),
    candidateIds: Array.from({ length: count }, (_, i) => toScheduleImportCandidateId(`${prefix}-c${i}`)) };
}
function reviewContext(schedule: CanonicalProjectSchedule, governance = initialGovernanceContext()): CanonicalScheduleCommandContext {
  return { governance, localDefinitions: schedule.localDefinitions, retiredDraftOccurrenceGrants: [] };
}
function reviewDraft(base = createEmptyCanonicalProjectSchedule(devProject001.id), context = reviewContext(base)) {
  const started = startScheduleWorkingDraft(base, { workingDraftId: toCanonicalScheduleWorkingDraftId("review-draft") }, context);
  if (!started.ok) throw new Error(JSON.stringify(started));
  return started.schedule;
}
function loadReview(schedule = reviewDraft(), pack: GovernanceSimulationPack = "fixable-validation", prefix = "review", context = reviewContext(schedule)) {
  return value(loadBuiltInScheduleSimulation(schedule, { pack, ids: reviewIds(prefix, pack.startsWith("retired") ? 1 : 3) }, context));
}
function requestFor(schedule: CanonicalProjectSchedule, index = 0): ConfirmScheduleImportDecisionInput {
  const candidate = schedule.workingDraft!.importCandidates[index];
  const definitionId = candidate.sourceDefinitionId!;
  const existing = schedule.workingDraft!.milestones.find(row => row.milestoneDefinitionId === definitionId);
  const local = schedule.localDefinitions.some(definition => definition.id === definitionId);
  const suggested = suggestScheduleImportActions(candidate, existing ?? null);
  return {
    candidateId: candidate.id, target: existing ? { kind: "updateExistingOccurrence", milestoneId: existing.milestoneId, expectedDefinitionId: definitionId }
      : local ? { kind: "createLocalOccurrence", localDefinitionId: definitionId, milestoneId: toMilestoneId(`review-row-${index}`) }
        : { kind: "createPublicOccurrence", definitionId, milestoneId: toMilestoneId(`review-row-${index}`) },
    plan: suggested.plan ?? { kind: "set", value: parseDateOnly("2026-11-10")! },
    actual: suggested.actual ?? { kind: "clear" }, applicability: suggested.applicability ?? { kind: "set", value: "applicable" },
  };
}
function confirmReview(schedule: CanonicalProjectSchedule, request = requestFor(schedule), context = reviewContext(schedule), id = "decision") {
  return confirmScheduleImportDecision(schedule, { ...request, decisionId: id as ReturnType<typeof toScheduleReviewDecisionId> }, context);
}
function rawCandidate(schedule: CanonicalProjectSchedule, plan: RawImportCell, applicability: RawImportCell = { presence: "present", raw: "Applicable" }) {
  const original = schedule.evidenceLedger[0];
  const evidence = { ...original, rawValues: { ...original.rawValues, plan, applicability } };
  const candidate = schedule.workingDraft!.importCandidates[0];
  return { ...schedule, evidenceLedger: [evidence, ...schedule.evidenceLedger.slice(1)], workingDraft: { ...schedule.workingDraft!,
    importCandidates: [{ ...createScheduleImportCandidate(evidence, candidate.id), sourceDefinitionId: candidate.sourceDefinitionId }, ...schedule.workingDraft!.importCandidates.slice(1)] } };
}

describe("GOV-07 candidate-scoped review commands", () => {
  it("historical pending candidate IDs remain reserved after starting a later Draft", () => {
    const first = loadReview();
    const later = reviewDraft({ ...first, workingDraft: null });
    const schedule = freeze({ ...later, workingDraft: { ...later.workingDraft!, workingDraftId: toCanonicalScheduleWorkingDraftId("later") } });
    const ids = { ...reviewIds("later"), candidateIds: [first.workingDraft!.importCandidates[0].id, ...reviewIds("later").candidateIds.slice(1)] };
    const before = structuredClone(schedule);
    expect(loadBuiltInScheduleSimulation(schedule, { pack: "fixable-validation", ids }, reviewContext(schedule))).toMatchObject({ ok: false, code: "id-collision" });
    expect(schedule).toEqual(before);
  });

  it("loader snapshots injected identity arrays and immutable raw cells", () => {
    const schedule = reviewDraft();
    const ids = reviewIds();
    const loaded = value(loadBuiltInScheduleSimulation(schedule, { pack: "fixable-validation", ids }, reviewContext(schedule)));
    const snapshot = structuredClone(loaded);
    Object.assign(ids.evidenceIds, { 0: toScheduleEvidenceId("mutated") });
    Object.assign(ids.candidateIds, { 0: toScheduleImportCandidateId("mutated") });
    expect(loaded).toEqual(snapshot);
    expect(Object.isFrozen(loaded.evidenceLedger[0].rawValues.plan)).toBe(true);
    expect(Object.isFrozen(loaded.evidenceLedger[0].rawValues)).toBe(true);
  });

  it("name mapping alone with an unresolved date action fails; explicit clear or legal keep resolves bad raw", () => {
    const original = loadReview(reviewDraft(devSchedule001));
    const row = original.workingDraft!.milestones[0];
    const bad = rawCandidate(original, { presence: "present", raw: "invalid raw" });
    const schedule = { ...bad, workingDraft: { ...bad.workingDraft!, importCandidates: [{ ...bad.workingDraft!.importCandidates[0], sourceDefinitionId: row.milestoneDefinitionId }, ...bad.workingDraft!.importCandidates.slice(1)] } };
    const request = requestFor(schedule);
    expect(confirmReview(schedule, { ...request, plan: null as unknown as ConfirmScheduleImportDecisionInput["plan"] })).toMatchObject({ ok: false, code: "invalid-date-or-applicability" });
    for (const requestOverride of [
      { ...request, plan: { kind: "keepExisting" as const } },
      { ...request, plan: { kind: "clear" as const }, actual: { kind: "clear" as const }, applicability: { kind: "set" as const, value: "notApplicable" as const } },
    ]) {
      const next = value(confirmReview(schedule, requestOverride));
      expect(next.evidenceLedger[0].rawValues.plan).toEqual({ presence: "present", raw: "invalid raw" });
      expect(next.workingDraft!.importCandidates[0].rawFindings.some(issue => issue.code === "schedule.import.invalid-date")).toBe(true);
      expect(collectSchedulePublishBlockingFindings(next, reviewContext(next)).some(issue => issue.target.entityId === request.candidateId)).toBe(false);
    }
  });

  it("confirm revalidates current public addability after preview", () => {
    const schedule = loadReview();
    const request = requestFor(schedule);
    expect(value(previewScheduleImportDecision(schedule, request, reviewContext(schedule))).operationBlockingFindings).toEqual([]);
    const context = reviewContext(schedule);
    const retiredContext = { ...context, governance: { ...context.governance, addablePublicDefinitions: context.governance.addablePublicDefinitions.filter(definition => definition.id !== schedule.workingDraft!.importCandidates[0].sourceDefinitionId) } };
    expect(confirmReview(schedule, request, retiredContext)).toMatchObject({ ok: false, code: "definition-not-addable" });
    expect(schedule.reviewDecisions).toEqual([]);
  });

  it("duplicate definition and historical MilestoneId guards are independent of source suggestions", () => {
    const first = value(confirmReview(loadReview()));
    const candidate = first.workingDraft!.importCandidates[1];
    const row = first.workingDraft!.milestones[0];
    const schedule = { ...first, workingDraft: { ...first.workingDraft!, importCandidates: first.workingDraft!.importCandidates.map(item => item.id === candidate.id ? { ...item, sourceDefinitionId: undefined, proposedDefinitionMatches: [row.milestoneDefinitionId] } : item) } };
    const request = { ...requestFor(first, 1), target: { kind: "createPublicOccurrence" as const, definitionId: row.milestoneDefinitionId, milestoneId: toMilestoneId("new-duplicate") } };
    expect(confirmReview(schedule, request, reviewContext(schedule), "second")).toMatchObject({ ok: false, code: "duplicate-target-definition" });
    const withoutRow = { ...schedule, workingDraft: { ...schedule.workingDraft!, milestones: [] } };
    expect(confirmReview(withoutRow, { ...request, target: { ...request.target, milestoneId: row.milestoneId } }, reviewContext(withoutRow), "second")).toMatchObject({ ok: false, code: "duplicate-milestone-id" });
  });

  it("same-name legitimate local identity remains importable for its own source", () => {
    const name = initialGovernanceContext().definitionsForHistoricalResolution.find(definition => !initialGovernanceContext().addablePublicDefinitions.some(addable => addable.id === definition.id))!.name;
    const registered = value(confirmProjectLocalMilestoneDefinition(reviewDraft(), input({ name }), initialGovernanceContext()));
    const schedule = loadReview(registered, "basic-success");
    expect(value(confirmReview(schedule, requestFor(schedule, 1))).workingDraft!.milestones[0].milestoneDefinitionId).toBe(registered.localDefinitions[0].id);
  });

  it("confirms_two_valid_candidates_while_third_remains_pending and explicit correction clears unresolved raw", () => {
    const loaded = freeze(loadReview());
    const raw = structuredClone(loaded.evidenceLedger);
    const firstPreview = value(previewScheduleImportDecision(loaded, requestFor(loaded), reviewContext(loaded)));
    expect(firstPreview.operationBlockingFindings).toEqual([]);
    expect(firstPreview.remainingPublishBlockingFindings.filter(issue => issue.code === "schedule.import.pending-decision")).toHaveLength(2);
    expect(firstPreview.remainingPublishBlockingFindings.some(issue => issue.code === "schedule.import.ambiguous-date")).toBe(true);
    const first = value(confirmReview(loaded));
    const second = value(confirmReview(first, requestFor(first, 1), reviewContext(first), "second"));
    expect(second.workingDraft!.importCandidates.map(candidate => candidate.status)).toEqual(["confirmed", "confirmed", "pending"]);
    expect(second.workingDraft!.milestones).toHaveLength(2);
    expect(collectSchedulePublishBlockingFindings(second, reviewContext(second)).some(issue => issue.code === "schedule.import.ambiguous-date")).toBe(true);
    const third = value(confirmReview(second, requestFor(second, 2), reviewContext(second), "third"));
    expect(collectSchedulePublishBlockingFindings(third, reviewContext(third))).toEqual([]);
    expect(third.evidenceLedger).toEqual(raw);
    expect(third.workingDraft!.importCandidates[2].rawFindings.some(issue => issue.code === "schedule.import.ambiguous-date")).toBe(true);
    expect(third.reviewDecisions[2]).toMatchObject({ sessionId: "review-session", candidateId: "review-c2", evidenceId: "review-e2", targetMilestoneId: "review-row-2", dateActions: { plan: { kind: "set", value: "2026-11-10" } } });
  });

  it("legal confirm leaves unrelated unfinished and invalid-reference rows unchanged and reports them", () => {
    const loaded = loadReview();
    const unrelated = { milestoneId: toMilestoneId("unfinished"), milestoneDefinitionId: toMilestoneDefinitionId("unknown-definition"), applicability: "applicable" as const, plan: null, actual: null };
    const schedule = freeze({ ...loaded, workingDraft: { ...loaded.workingDraft!, milestones: [unrelated] } });
    const preview = value(previewScheduleImportDecision(schedule, requestFor(schedule), reviewContext(schedule)));
    expect(preview.operationBlockingFindings).toEqual([]);
    expect(preview.remainingPublishBlockingFindings.some(issue => issue.target.entityId === unrelated.milestoneId && issue.code === "schedule.data.missing-plan-and-actual")).toBe(true);
    expect(preview.remainingPublishBlockingFindings.some(issue => issue.code.includes("unresolved-milestone-definition"))).toBe(true);
    const next = value(confirmReview(schedule));
    expect(next.workingDraft!.milestones[0]).toBe(unrelated);
    expect(next.workingDraft!.importCandidates[1]).toBe(schedule.workingDraft!.importCandidates[1]);
  });

  it("basic-success is usable after real GOV-06 local confirmation and creates no implicit local registry", () => {
    const draft = reviewDraft();
    expect(loadBuiltInScheduleSimulation(draft, { pack: "basic-success", ids: reviewIds() }, reviewContext(draft))).toMatchObject({ ok: false, code: "invalid-local-classification" });
    const registered = value(confirmProjectLocalMilestoneDefinition(draft, input(), initialGovernanceContext()));
    let schedule = loadReview(registered, "basic-success");
    expect(schedule.workingDraft!.milestones).toEqual([]);
    expect(schedule.localDefinitions).toBe(registered.localDefinitions);
    for (let i = 0; i < 3; i++) schedule = value(confirmReview(schedule, requestFor(schedule, i), reviewContext(schedule), `basic-${i}`));
    expect(schedule.workingDraft!.milestones).toHaveLength(3);
    expect(schedule.workingDraft!.milestones[1].milestoneDefinitionId).toBe("local-acceptance");
    expect(schedule.workingDraft!.milestones[2]).toMatchObject({ applicability: "notApplicable", plan: null, actual: null });
    expect(collectSchedulePublishBlockingFindings(schedule, reviewContext(schedule))).toEqual([]);
    expect(schedule.localDefinitions).toBe(registered.localDefinitions);
  });

  it("loader requires Draft, preserves edits/workingDraftId, and same scenario reload is no-op even after review", () => {
    expect(loadBuiltInScheduleSimulation(devSchedule001, { pack: "fixable-validation", ids: reviewIds() }, reviewContext(devSchedule001))).toMatchObject({ ok: false, code: "no-working-draft" });
    const started = reviewDraft(devSchedule001);
    const original = { ...started, workingDraft: { ...started.workingDraft!, milestones: started.workingDraft!.milestones.map((row, index) =>
      index === 0 ? { ...row, plan: parseDateOnly("2027-01-01") } : row) } };
    const loaded = loadReview(original);
    expect(loaded.workingDraft!.milestones).toBe(original.workingDraft!.milestones);
    expect(loaded.workingDraft!.milestones[0].plan).toBe("2027-01-01");
    expect(loaded.workingDraft!.workingDraftId).toBe(original.workingDraft!.workingDraftId);
    expect(loaded.publishedVersions).toBe(original.publishedVersions);
    expect(loadReview(loaded, "fixable-validation", "ignored-ids")).toBe(loaded);
    const confirmed = value(confirmReview(loaded));
    expect(loadReview(confirmed, "fixable-validation", "ignored-again")).toBe(confirmed);
    const later = reviewDraft({ ...confirmed, workingDraft: null });
    const newDraft = { ...later, workingDraft: { ...later.workingDraft!, workingDraftId: toCanonicalScheduleWorkingDraftId("later-draft") } };
    const reloaded = loadReview(newDraft, "fixable-validation", "later");
    expect(reloaded.reviewSessions).toHaveLength(2);
    expect(reloaded.workingDraft!.importCandidates.every(candidate => candidate.status === "pending")).toBe(true);
    expect(reloaded.reviewDecisions).toBe(confirmed.reviewDecisions);
  });

  it.each(["session", "evidence", "candidate", "duplicate-bundle", "blank", "wrong-count"])("load ID collision/count failure is atomic: %s", kind => {
    const loaded = freeze(loadReview());
    const ids = reviewIds("collision", 1);
    const bad = kind === "session" ? { ...ids, sessionId: loaded.reviewSessions[0].id }
      : kind === "evidence" ? { ...ids, evidenceIds: [loaded.evidenceLedger[0].id] }
        : kind === "candidate" ? { ...ids, candidateIds: [loaded.workingDraft!.importCandidates[0].id] }
          : kind === "blank" ? { ...ids, sessionId: " " as typeof ids.sessionId }
            : kind === "wrong-count" ? { ...ids, evidenceIds: [] } : { ...reviewIds("dup"), evidenceIds: [ids.evidenceIds[0], ids.evidenceIds[0], ids.evidenceIds[0]] };
    const before = structuredClone(loaded);
    const pack = kind === "duplicate-bundle" ? "basic-success" : "retired-no-reference-negative";
    const schedule = kind === "duplicate-bundle" ? value(confirmProjectLocalMilestoneDefinition(loaded, input(), initialGovernanceContext())) : loaded;
    expect(loadBuiltInScheduleSimulation(schedule, { pack, ids: bad }, reviewContext(schedule))).toMatchObject({ ok: false, code: "id-collision" });
    expect(loaded).toEqual(before);
  });

  it.each(["na-date", "invalid-date", "invalid-applicability", "milestone-collision", "definition-duplicate", "illegal-public", "missing-local", "foreign-local", "decision-collision", "blank-decision"])("failed_confirm_is_atomic: %s", kind => {
    let schedule = loadReview();
    const request = requestFor(schedule);
    let changed: ConfirmScheduleImportDecisionInput = request;
    let decisionId = "decision";
    if (kind === "na-date") changed = { ...request, applicability: { kind: "set", value: "notApplicable" } };
    if (kind === "invalid-date") changed = { ...request, plan: { kind: "set", value: "2026-02-30" as DateOnly } };
    if (kind === "invalid-applicability") changed = { ...request, applicability: { kind: "set", value: "guess" } as unknown as ConfirmScheduleImportDecisionInput["applicability"] };
    if (kind === "illegal-public") changed = { ...request, target: { kind: "createPublicOccurrence", milestoneId: toMilestoneId("bad"), definitionId: toMilestoneDefinitionId("unknown") } };
    if (kind === "missing-local" || kind === "foreign-local") changed = { ...request, target: { kind: "createLocalOccurrence", milestoneId: toMilestoneId("bad"), localDefinitionId: input().definitionId } };
    if (kind === "milestone-collision" || kind === "definition-duplicate" || kind === "decision-collision") {
      schedule = value(confirmReview(schedule));
      changed = requestFor(schedule, 1);
      if (kind === "milestone-collision") changed = { ...changed, target: { ...changed.target, milestoneId: schedule.workingDraft!.milestones[0].milestoneId } };
      if (kind === "definition-duplicate") changed = { ...request, candidateId: schedule.workingDraft!.importCandidates[1].id, target: { ...request.target, milestoneId: toMilestoneId("different-row") } };
      if (kind !== "decision-collision") decisionId = "second";
    }
    if (kind === "blank-decision") decisionId = " ";
    const foreign = value(confirmProjectLocalMilestoneDefinition(createEmptyCanonicalProjectSchedule(devProject003.id), input(), initialGovernanceContext()));
    const context = kind === "foreign-local" ? { ...reviewContext(schedule), localDefinitions: foreign.localDefinitions } : reviewContext(schedule);
    const before = structuredClone(schedule);
    freeze(schedule);
    expect(confirmReview(schedule, changed, context, decisionId).ok).toBe(false);
    expect(schedule).toEqual(before);
  });

  it("repeat confirm is already-confirmed, and saved actions do not alias caller input", () => {
    const schedule = loadReview();
    const request = requestFor(schedule);
    const next = value(confirmReview(schedule, request));
    const snapshot = structuredClone(next.reviewDecisions);
    Object.assign(request.plan, { kind: "clear" });
    expect(next.reviewDecisions).toEqual(snapshot);
    expect(confirmReview(next, request)).toMatchObject({ ok: false, code: "already-confirmed" });
    expect(next.reviewDecisions).toHaveLength(1);
  });

  it.each(["plan", "actual", "applicability"] as const)("new occurrence rejects keepExisting for %s", field => {
    const schedule = loadReview();
    const request = { ...requestFor(schedule), [field]: { kind: "keepExisting" as const } };
    expect(confirmReview(schedule, request)).toMatchObject({ ok: false, code: "invalid-action-for-new-occurrence" });
  });

  it("existing missing/blank keeps exact occurrence ID/dates until explicit clear; preview shows conflict", () => {
    let schedule = loadReview(reviewDraft(devSchedule001));
    const row = schedule.workingDraft!.milestones[0];
    schedule = rawCandidate(schedule, { presence: "present", raw: "" });
    const candidate = schedule.workingDraft!.importCandidates[0];
    const matching = { ...schedule, workingDraft: { ...schedule.workingDraft!, importCandidates: [{ ...candidate, sourceDefinitionId: row.milestoneDefinitionId }, ...schedule.workingDraft!.importCandidates.slice(1)] } };
    const request = requestFor(matching);
    expect(request.plan).toEqual({ kind: "keepExisting" });
    const preview = value(previewScheduleImportDecision(matching, { ...request, plan: { kind: "set", value: parseDateOnly("2026-10-15")! } }, reviewContext(matching)));
    expect(preview.beforeOccurrence).toBe(row);
    expect(preview.afterOccurrence).toMatchObject({ milestoneId: row.milestoneId, plan: "2026-10-15", actual: row.actual });
    const kept = value(confirmReview(matching, request));
    expect(kept.workingDraft!.milestones[0]).toEqual(row);
    const cleared = value(confirmReview(matching, { ...request, plan: { kind: "clear" }, actual: { kind: "clear" }, applicability: { kind: "set", value: "notApplicable" } }));
    expect(cleared.workingDraft!.milestones[0]).toMatchObject({ milestoneId: row.milestoneId, plan: null, actual: null, applicability: "notApplicable" });
    expect(confirmReview(matching, { ...request, target: { kind: "updateExistingOccurrence", milestoneId: row.milestoneId, expectedDefinitionId: toMilestoneDefinitionId("stale") } })).toMatchObject({ ok: false, code: "target-definition-mismatch" });
  });

  it("collector ignores old/discarded review and pending governance requirements", () => {
    const schedule = loadReview();
    const context = { ...reviewContext(schedule), governance: { ...initialGovernanceContext(), newProjectRequirementDefinitionIds: new Set(initialGovernanceContext().addablePublicDefinitions.map(definition => definition.id)) } };
    const old = { ...schedule, reviewSessions: schedule.reviewSessions.map(session => ({ ...session, workingDraftId: toCanonicalScheduleWorkingDraftId("old-draft") })) };
    expect(collectSchedulePublishBlockingFindings(old, context)).toEqual([]);
    const discarded = { ...schedule, reviewClosures: [{ sessionId: schedule.reviewSessions[0].id, kind: "discarded" as const }] };
    expect(collectSchedulePublishBlockingFindings(discarded, context)).toEqual([]);
    expect(collectSchedulePublishBlockingFindings(reviewDraft(), context)).toEqual([]);
  });

  it("Published-only Portfolio and Attention remain unchanged after candidate load and confirm", () => {
    const base = reviewDraft(devSchedule001);
    const catalogs = createInitialSelfServiceReferenceCatalogs();
    const beforeCatalogs = structuredClone(catalogs);
    const reads = (schedule: CanonicalProjectSchedule) => {
      const state = { projects: [devProject001], schedules: [schedule] };
      return { portfolio: selectPortfolioDashboardRows(state, catalogs, initialGovernanceContext()), attention: selectDashboardAttention(state, parseDateOnly("2026-10-01")!, initialGovernanceContext()) };
    };
    const before = reads(base);
    const loaded = loadReview(base);
    expect(reads(loaded)).toEqual(before);
    const confirmed = value(confirmReview(loaded));
    expect(reads(confirmed)).toEqual(before);
    expect(catalogs).toEqual(beforeCatalogs);
    expect(confirmed.publishedVersions).toBe(base.publishedVersions);
  });
});

describe("GOV-07 exact retired occurrence eligibility", () => {
  function retiredReview() {
    const fixture = publishedRetirementFixture();
    const context = { governance: value(selectEffectiveMilestoneGovernanceContext(fixture.state)), localDefinitions: [], retiredDraftOccurrenceGrants: value(selectEffectiveRetiredDraftOccurrenceGrants(fixture.state)) };
    return { fixture, context, schedule: loadReview(fixture.schedule, "retired-existing-update", "retired", context) };
  }
  it("requires an actual retired-existing prerequisite and never manufactures its occurrence", () => {
    const schedule = freeze(reviewDraft());
    expect(loadBuiltInScheduleSimulation(schedule, { pack: "retired-existing-update", ids: reviewIds("retired", 1) }, reviewContext(schedule))).toMatchObject({ ok: false, code: "retired-definition-not-retained" });
    expect(schedule.workingDraft!.milestones).toEqual([]);
    expect(schedule.evidenceLedger).toEqual([]);
  });
  it("absence of optional source identity or proposed matches never grants retired update eligibility", () => {
    const { schedule, context } = retiredReview();
    const request = requestFor(schedule);
    const candidate = schedule.workingDraft!.importCandidates[0];
    const unknownSource = { ...schedule, workingDraft: { ...schedule.workingDraft!, importCandidates: [{ ...candidate, sourceDefinitionId: undefined,
      proposedDefinitionMatches: [schedule.workingDraft!.milestones[0].milestoneDefinitionId] }] } };
    expect(confirmReview(unknownSource, request, { ...context, retiredDraftOccurrenceGrants: [] })).toMatchObject({ ok: false, code: "retired-definition-not-retained" });
    expect(unknownSource.reviewDecisions).toEqual([]);
    expect(unknownSource.workingDraft!.importCandidates[0].status).toBe("pending");
  });
  it("exact D1 grant permits only existing-row update and preserves its ID", () => {
    const { schedule, context } = retiredReview();
    const row = schedule.workingDraft!.milestones[0];
    const next = value(confirmReview(schedule, requestFor(schedule), context));
    expect(next.workingDraft!.milestones).toHaveLength(1);
    expect(next.workingDraft!.milestones[0]).toMatchObject({ milestoneId: row.milestoneId, milestoneDefinitionId: row.milestoneDefinitionId, plan: "2026-10-15" });
    expect(confirmReview(schedule, { ...requestFor(schedule), target: { kind: "createPublicOccurrence", definitionId: row.milestoneDefinitionId, milestoneId: toMilestoneId("recreated") } }, context).ok).toBe(false);
  });
  it.each(["removed", "recreated", "other-draft", "other-project", "wrong-definition"])("rejects invalid D1 scope atomically: %s", kind => {
    const { schedule, context } = retiredReview();
    const row = schedule.workingDraft!.milestones[0];
    const request = requestFor(schedule);
    const changed = kind === "removed" ? { ...schedule, workingDraft: { ...schedule.workingDraft!, milestones: [] } }
      : kind === "recreated" ? { ...schedule, workingDraft: { ...schedule.workingDraft!, milestones: [{ ...row, milestoneId: toMilestoneId("recreated") }] } } : schedule;
    const changedContext = { ...context, retiredDraftOccurrenceGrants: context.retiredDraftOccurrenceGrants.map(grant => kind === "other-draft" ? { ...grant, workingDraftId: toCanonicalScheduleWorkingDraftId("other") }
      : kind === "other-project" ? { ...grant, projectId: toProjectId("other") }
        : kind === "wrong-definition" ? { ...grant, milestoneDefinitionId: toMilestoneDefinitionId("other") } : grant) };
    const before = structuredClone(changed);
    expect(confirmReview(freeze(changed), kind === "recreated" ? { ...request, target: { kind: "updateExistingOccurrence", milestoneId: toMilestoneId("recreated") } } : request, changedContext).ok).toBe(false);
    expect(changed).toEqual(before);
  });
  it("current Published clone permits retired update and repeated historical occurrences are retained; older-only history does not", () => {
    const { fixture, context } = retiredReview();
    const rows = fixture.schedule.workingDraft!.milestones;
    const published = { ...fixture.schedule, workingDraft: null, publishedVersions: [{ versionNumber: 1 as CanonicalProjectSchedule["publishedVersions"][number]["versionNumber"], versionNote: null, publishedAt: "2026-10-01T00:00:00Z", milestones: [...rows, { ...rows[0], milestoneId: toMilestoneId("repeat-history") }] }] };
    const noGrant = { ...context, retiredDraftOccurrenceGrants: [] };
    const schedule = loadReview(reviewDraft(published, noGrant), "retired-existing-update", "clone", noGrant);
    const next = value(confirmReview(schedule, requestFor(schedule), noGrant));
    expect(next.workingDraft!.milestones).toHaveLength(2);
    expect(next.workingDraft!.milestones[1]).toBe(schedule.workingDraft!.milestones[1]);
    expect(collectSchedulePublishBlockingFindings(next, noGrant)).toEqual([]);
    const oldOnly = { ...schedule, publishedVersions: [...published.publishedVersions, { ...published.publishedVersions[0], versionNumber: 2 as typeof published.publishedVersions[0]["versionNumber"], milestones: [] }] };
    expect(confirmReview(oldOnly, requestFor(oldOnly), noGrant)).toMatchObject({ ok: false, code: "retired-definition-not-retained" });
  });
  it("retired no-reference remains pending after date correction and cannot bypass through distinct local identity", () => {
    const local = value(confirmProjectLocalMilestoneDefinition(reviewDraft(), input(), initialGovernanceContext()));
    const schedule = freeze(loadReview(local, "retired-no-reference-negative", "negative"));
    const request = requestFor(schedule);
    expect(confirmReview(schedule, request)).toMatchObject({ ok: false, code: "definition-not-addable" });
    expect(confirmReview(schedule, { ...request, target: { kind: "createLocalOccurrence", localDefinitionId: local.localDefinitions[0].id, milestoneId: toMilestoneId("bypass") } })).toMatchObject({ ok: false, code: "target-definition-mismatch" });
    expect(schedule.workingDraft!.importCandidates[0].status).toBe("pending");
    expect(schedule.workingDraft!.milestones).toEqual([]);
    expect(schedule.evidenceLedger[0].rawValues.plan).toEqual({ presence: "present", raw: "10/11/2026" });
  });
});

describe("GOV-08 real Publish gate and review closures", () => {
  const publish = (schedule: CanonicalProjectSchedule, context = reviewContext(schedule)) =>
    publishScheduleWorkingDraft(schedule, { publishedAt: "2026-10-01T03:00:00Z" }, context);
  function reviewed() {
    let schedule = loadReview();
    for (let i = 0; i < 3; i++) schedule = value(confirmReview(schedule, requestFor(schedule, i), reviewContext(schedule), `decision-${i}`));
    return schedule;
  }
  it("publish_blocks_until_remaining_candidate_is_resolved", () => {
    let schedule = loadReview();
    for (let i = 0; i < 2; i++) schedule = value(confirmReview(schedule, requestFor(schedule, i), reviewContext(schedule), `decision-${i}`));
    const before = structuredClone(schedule);
    freeze(schedule);
    const blocked = publish(schedule);
    expect(blocked).toMatchObject({ ok: false, reason: "validation-failed" });
    if (blocked.ok) throw new Error("Unresolved candidate must block actual Publish");
    expect(blocked.issues.map(issue => issue.code)).toContain("schedule.import.ambiguous-date");
    expect(schedule).toEqual(before);
    const corrected = value(confirmReview(schedule, requestFor(schedule, 2), reviewContext(schedule), "decision-2"));
    const edited = updateScheduleWorkingDraftMilestone(corrected, { milestoneId: toMilestoneId("review-row-2"), field: "plan", value: parseDateOnly("2026-11-20") }, reviewContext(corrected));
    if (!edited.ok) throw new Error(JSON.stringify(edited));
    const result = publish(edited.schedule);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.version.milestones[2].plan).toBe("2026-11-20");
    expect(result.schedule.evidenceLedger).toBe(schedule.evidenceLedger);
  });
  it("failed_publish_with_review_blocker_is_atomic_and_appends_no_closure", () => {
    const schedule = freeze(loadReview());
    const before = structuredClone(schedule);
    expect(publish(schedule)).toMatchObject({ ok: false, reason: "validation-failed" });
    expect(schedule).toEqual(before);
    expect(schedule.reviewClosures).toEqual([]);
    expect(schedule.publishedVersions).toEqual([]);
  });
  it("governance_follow_up_pending_is_not_schedule_publish_blocker", () => {
    const schedule = freeze(reviewDraft());
    const prototype = { projects: [devProject001], schedules: [schedule] };
    const initial = createInitialMilestoneGovernanceRuntimeState();
    const definitionId = initial.releases[0].addableDefinitionIds[0];
    const started = value(startGovernanceDraft(initial, toGovernanceDraftId("pending-follow-up-draft")));
    const assigned = value(updateGovernanceDraft(started, { kind: "replace-existing-project-assignments",
      assignments: [{ projectId: devProject001.id, milestoneDefinitionId: definitionId }] }));
    const governance = freeze(value(publishGovernanceDraft(assigned, prototype, {
      createReleaseId: () => toGovernanceReleaseId("pending-follow-up-release"),
      createEnrollmentId: () => toRequirementEnrollmentId("pending-follow-up-enrollment"),
      createWithdrawalId: () => toRequirementWithdrawalId("unused-follow-up-withdrawal"),
      nowIso: () => "2026-10-01T02:00:00Z",
    })));
    const before = structuredClone({ prototype, governance });
    const pending = [{ enrollmentId: "pending-follow-up-enrollment", projectId: devProject001.id,
      milestoneDefinitionId: definitionId, assignedByReleaseId: "pending-follow-up-release", status: "pending" }];
    expect(selectEffectiveProjectMilestoneRequirements(prototype, governance)).toEqual(pending);
    expect(schedule.workingDraft!.milestones).toEqual([]);
    const context = reviewContext(schedule, value(selectEffectiveMilestoneGovernanceContext(governance)));
    const result = publish(schedule, context);
    expect(result).toMatchObject({ ok: true, version: { versionNumber: 1, milestones: [] }, schedule: { workingDraft: null } });
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(selectEffectiveProjectMilestoneRequirements({ ...prototype, schedules: [result.schedule] }, governance)).toEqual(pending);
    expect({ prototype, governance }).toEqual(before);
  });
  it("immutable_raw_bad_text_does_not_block_after_explicit_legal_correction", () => {
    const schedule = freeze(reviewed());
    expect(schedule.evidenceLedger[2].rawValues.plan).toEqual({ presence: "present", raw: "10/11/2026" });
    const result = publish(schedule);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.schedule.evidenceLedger).toBe(schedule.evidenceLedger);
    expect(result.schedule.reviewDecisions).toBe(schedule.reviewDecisions);
  });
  it("publish_appends_closure_for_each_current_draft_review_session_only", () => {
    const base = reviewed();
    const current = { id: toScheduleReviewSessionId("manual-current"), workingDraftId: base.workingDraft!.workingDraftId, source: "manual-local-mapping" as const, evidenceIds: [] };
    const historical = { ...current, id: toScheduleReviewSessionId("historical-unrelated"), workingDraftId: toCanonicalScheduleWorkingDraftId("old-draft") };
    const schedule = freeze({ ...base, reviewSessions: [...base.reviewSessions, current, historical], workingDraft: { ...base.workingDraft!, reviewSessionIds: [...base.workingDraft!.reviewSessionIds, current.id] } });
    const result = publish(schedule);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.schedule.reviewClosures).toEqual([{ sessionId: "review-session", kind: "published", versionNumber: 1 }, { sessionId: "manual-current", kind: "published", versionNumber: 1 }]);
    expect(result.schedule.workingDraft).toBeNull();
    expect(result.schedule.reviewSessions).toBe(schedule.reviewSessions);
    expect(result.schedule.reviewDecisions).toBe(schedule.reviewDecisions);
    const discarded = cancelScheduleWorkingDraft(schedule);
    if (!discarded.ok) throw new Error(JSON.stringify(discarded));
    expect(discarded.schedule.reviewClosures).toEqual([{ sessionId: "review-session", kind: "discarded" }, { sessionId: "manual-current", kind: "discarded" }]);
  });
  it("discard_appends_discarded_closure_and_new_draft_does_not_replay_candidates_or_decisions", () => {
    const schedule = freeze(value(confirmReview(loadReview())));
    const discarded = cancelScheduleWorkingDraft(schedule);
    expect(discarded.ok).toBe(true);
    if (!discarded.ok) throw new Error(JSON.stringify(discarded));
    expect(discarded.schedule.reviewClosures).toEqual([{ sessionId: "review-session", kind: "discarded" }]);
    expect(discarded.schedule.workingDraft).toBeNull();
    expect(discarded.schedule.publishedVersions).toBe(schedule.publishedVersions);
    expect(discarded.schedule.reviewDecisions).toBe(schedule.reviewDecisions);
    expect(discarded.schedule.evidenceLedger).toBe(schedule.evidenceLedger);
    const started = startScheduleWorkingDraft(discarded.schedule, { workingDraftId: toCanonicalScheduleWorkingDraftId("next-draft") }, reviewContext(discarded.schedule));
    if (!started.ok) throw new Error(JSON.stringify(started));
    expect(started.draft).toMatchObject({ milestones: [], importCandidates: [], reviewSessionIds: [] });
    const result = publish(started.schedule);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.schedule.reviewClosures).toBe(discarded.schedule.reviewClosures);
    const reloaded = loadReview(started.schedule, "fixable-validation", "next");
    expect(reloaded.workingDraft!.importCandidates.every(candidate => candidate.status === "pending")).toBe(true);
    expect(reloaded.reviewDecisions).toBe(schedule.reviewDecisions);
  });
  it.each(["duplicate-link", "unresolved", "duplicate-session", "wrong-draft", "closed", "conflicting-closures"])("impossible attached closure state fails Publish and Discard atomically: %s", kind => {
    const base = reviewed();
    const session = base.reviewSessions[0];
    const schedule = freeze({ ...base,
      reviewSessions: kind === "unresolved" ? [] : kind === "duplicate-session" ? [session, { ...session }] : kind === "wrong-draft" ? [{ ...session, workingDraftId: toCanonicalScheduleWorkingDraftId("other-draft") }] : base.reviewSessions,
      reviewClosures: kind === "closed" || kind === "conflicting-closures" ? [{ sessionId: session.id, kind: "discarded" as const }, ...(kind === "conflicting-closures" ? [{ sessionId: session.id, kind: "discarded" as const }] : [])] : [],
      workingDraft: { ...base.workingDraft!, reviewSessionIds: kind === "duplicate-link" ? [session.id, session.id] : [session.id] },
    });
    const before = structuredClone(schedule);
    expect(publish(schedule)).toMatchObject({ ok: false, reason: "validation-failed" });
    expect(cancelScheduleWorkingDraft(schedule)).toMatchObject({ ok: false, reason: "validation-failed" });
    expect(schedule).toEqual(before);
  });
  it("discard closes current sessions even with invalid dates and unresolved Draft references", () => {
    const base = loadReview();
    const schedule = freeze({ ...base, workingDraft: { ...base.workingDraft!, milestones: [{ milestoneId: toMilestoneId("bad"), milestoneDefinitionId: toMilestoneDefinitionId("unknown"), plan: "invalid" as DateOnly, actual: null, applicability: "notApplicable" as const }] } });
    const result = cancelScheduleWorkingDraft(schedule);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.schedule.reviewClosures).toEqual([{ sessionId: "review-session", kind: "discarded" }]);
    expect(result.schedule.workingDraft).toBeNull();
  });
});

describe("GOV-08 explicit local to public mapping", () => {
  function mappingFixture(na = false) {
    const governance = initialGovernanceContext();
    const target = governance.addablePublicDefinitions[0];
    const local = value(confirmProjectLocalMilestoneDefinition(createEmptyCanonicalProjectSchedule(devProject001.id), input({ stageGroupId: target.stageGroupId, milestoneTypeId: target.milestoneTypeId }), governance));
    const row = { milestoneId: toMilestoneId("local-row"), milestoneDefinitionId: local.localDefinitions[0].id,
      plan: na ? null : parseDateOnly("2026-10-15"), actual: na ? null : parseDateOnly("2026-10-16"), applicability: na ? "notApplicable" as const : "applicable" as const };
    const historical = { ...local, publishedVersions: [{ versionNumber: toScheduleVersionNumber(1), versionNote: null, publishedAt: "2026-09-01T00:00:00Z", milestones: [row] }] };
    const schedule = reviewDraft(historical);
    const request: ConfirmMapDraftLocalOccurrenceToPublicInput = { milestoneId: row.milestoneId, localDefinitionId: row.milestoneDefinitionId, publicDefinitionId: target.id,
      sessionId: toScheduleReviewSessionId("mapping-session"), decisionId: toScheduleReviewDecisionId("mapping-decision"), assertion: { workContent: true, stage: true, type: true, completionCriteria: true } };
    return { schedule, request };
  }
  it.each([false, true])("maps_local_to_current_addable_public_preserving_occurrence_identity_and_values: N/A=%s", na => {
    const { schedule, request } = mappingFixture(na);
    const before = structuredClone(schedule);
    freeze(schedule);
    const preview = value(previewDraftLocalOccurrenceToPublic(schedule, request, reviewContext(schedule)));
    expect(preview.beforeOccurrence).toBe(schedule.workingDraft!.milestones[0]);
    expect(preview.afterOccurrence).toEqual({ ...schedule.workingDraft!.milestones[0], milestoneDefinitionId: request.publicDefinitionId });
    expect(schedule).toEqual(before);
    const next = value(mapDraftLocalOccurrenceToPublic(schedule, request, reviewContext(schedule)));
    expect(next.workingDraft!.milestones).toEqual([preview.afterOccurrence]);
    expect(next.workingDraft!.importCandidates).toBe(schedule.workingDraft!.importCandidates);
    expect(next.localDefinitions).toBe(schedule.localDefinitions);
    expect(next.publishedVersions).toBe(schedule.publishedVersions);
    expect(next.publishedVersions[0].milestones[0].milestoneDefinitionId).toBe(request.localDefinitionId);
    expect(next.evidenceLedger).toBe(schedule.evidenceLedger);
    expect(schedule).toEqual(before);
  });
  it("successful_manual_mapping_creates_manual_review_session_and_decision_without_import_or_evidence", () => {
    const { schedule, request } = mappingFixture();
    expect(schedule.reviewSessions).toEqual([]);
    const next = value(mapDraftLocalOccurrenceToPublic(schedule, request, reviewContext(schedule)));
    expect(next.reviewSessions).toEqual([{ id: "mapping-session", workingDraftId: "review-draft", source: "manual-local-mapping", evidenceIds: [] }]);
    expect(next.reviewDecisions).toEqual([{ id: "mapping-decision", sessionId: "mapping-session", targetMilestoneId: "local-row", fromLocalDefinitionId: "local-acceptance", toPublicDefinitionId: request.publicDefinitionId,
      assertion: { workContent: true, stage: true, type: true, completionCriteria: true } }]);
    expect(next.workingDraft!.reviewSessionIds).toEqual(["mapping-session"]);
    expect(next.evidenceLedger).toEqual([]);
    expect(mapDraftLocalOccurrenceToPublic(next, { ...request, sessionId: toScheduleReviewSessionId("second"), decisionId: toScheduleReviewDecisionId("second") }, reviewContext(next))).toMatchObject({ ok: false, code: "target-definition-mismatch" });
    expect(next.reviewSessions).toHaveLength(1);
    expect(next.reviewDecisions).toHaveLength(1);
  });
  it("mapping copies exactly the four supplied assertions and preserves unrelated rows and candidates", () => {
    const { schedule: base, request } = mappingFixture();
    const loaded = loadReview(base);
    const other = { ...base.workingDraft!.milestones[0], milestoneId: toMilestoneId("other-row"), milestoneDefinitionId: initialGovernanceContext().addablePublicDefinitions[1].id };
    const schedule = { ...loaded, workingDraft: { ...loaded.workingDraft!, milestones: [...loaded.workingDraft!.milestones, other] } };
    const supplied = { ...request.assertion, extra: "not audit" };
    const next = value(mapDraftLocalOccurrenceToPublic(freeze(schedule), { ...request, assertion: supplied }, reviewContext(schedule)));
    expect(next.workingDraft!.milestones[1]).toBe(other);
    expect(next.workingDraft!.importCandidates).toBe(schedule.workingDraft!.importCandidates);
    expect(next.workingDraft!.reviewSessionIds).toEqual(["review-session", "mapping-session"]);
    const decision = next.reviewDecisions[0];
    expect(decision).toHaveProperty("assertion", request.assertion);
    expect("assertion" in decision && decision.assertion).not.toBe(supplied);
    Object.assign(supplied, { workContent: false, extra: "changed" });
    expect(decision).toHaveProperty("assertion", { workContent: true, stage: true, type: true, completionCriteria: true });
  });
  it.each(["workContent", "stage", "type", "completionCriteria"] as const)("rejects_incomplete_or_false_equivalence_assertion_atomically: %s", field => {
    for (const invalid of [false, undefined, "true", 1, null]) {
      const { schedule, request } = mappingFixture();
      const before = structuredClone(schedule);
      freeze(schedule);
      const assertion = { ...request.assertion, [field]: invalid } as unknown as LocalToPublicEquivalenceAssertion;
      expect(mapDraftLocalOccurrenceToPublic(schedule, { ...request, assertion }, reviewContext(schedule))).toMatchObject({ ok: false, code: "invalid-equivalence-assertion" });
      expect(schedule).toEqual(before);
    }
  });
  it.each([
    { label: "null", assertion: null }, { label: "missing", assertion: undefined },
    { label: "boolean", assertion: true }, { label: "string", assertion: "true" }, { label: "array", assertion: [] },
  ])("rejects malformed whole equivalence assertion atomically: $label", ({ assertion }) => {
    const { schedule, request } = mappingFixture();
    const before = structuredClone(schedule);
    expect(mapDraftLocalOccurrenceToPublic(freeze(schedule), { ...request, assertion: assertion as unknown as LocalToPublicEquivalenceAssertion }, reviewContext(schedule))).toMatchObject({ ok: false, code: "invalid-equivalence-assertion" });
    expect(schedule).toEqual(before);
  });
  it.each(["missing-local", "foreign-local", "unconfirmed-local", "invalid-stage", "invalid-type", "wrong-row", "missing-row", "duplicate-row", "same-definition-id", "no-draft"])("local_to_public_requires_exact_same_project_legal_local_definition: %s", kind => {
    const { schedule: base, request: original } = mappingFixture();
    const local = base.localDefinitions[0];
    const localDefinitions = kind === "missing-local" || kind === "foreign-local" ? [] : kind === "unconfirmed-local" ? [{ ...local, confirmation: "pending" }] : kind === "invalid-stage" ? [{ ...local, stageGroupId: toStageGroupId("unknown") }] : kind === "invalid-type" ? [{ ...local, milestoneTypeId: toMilestoneTypeId("unknown") }] : base.localDefinitions;
    const request = kind === "wrong-row" ? { ...original, localDefinitionId: toMilestoneDefinitionId("other") } : kind === "missing-row" ? { ...original, milestoneId: toMilestoneId("missing") } : kind === "same-definition-id" ? { ...original, publicDefinitionId: original.localDefinitionId } : original;
    const schedule = { ...base, localDefinitions, workingDraft: kind === "no-draft" ? null : kind === "duplicate-row" ? { ...base.workingDraft!, milestones: [base.workingDraft!.milestones[0], base.workingDraft!.milestones[0]] } : base.workingDraft } as CanonicalProjectSchedule;
    const context = kind === "foreign-local" ? { ...reviewContext(schedule), localDefinitions: base.localDefinitions } : reviewContext(schedule);
    const before = structuredClone(schedule);
    freeze(schedule);
    expect(previewDraftLocalOccurrenceToPublic(schedule, request, context).ok).toBe(false);
    expect(mapDraftLocalOccurrenceToPublic(schedule, request, context).ok).toBe(false);
    expect(schedule).toEqual(before);
  });
  it("rejects_duplicate_target_definition_without_merge", () => {
    const { schedule: base, request } = mappingFixture();
    const schedule = freeze({ ...base, workingDraft: { ...base.workingDraft!, milestones: [...base.workingDraft!.milestones, { ...base.workingDraft!.milestones[0], milestoneId: toMilestoneId("public-existing"), milestoneDefinitionId: request.publicDefinitionId, plan: null, actual: null, applicability: "notApplicable" as const }] } });
    const before = structuredClone(schedule);
    expect(previewDraftLocalOccurrenceToPublic(schedule, request, reviewContext(schedule))).toMatchObject({ ok: false, code: "duplicate-target-definition" });
    expect(mapDraftLocalOccurrenceToPublic(schedule, request, reviewContext(schedule))).toMatchObject({ ok: false, code: "duplicate-target-definition" });
    expect(schedule).toEqual(before);
  });
  it.each(["unknown", "retired"])("rejects_non_addable_or_retired_public_target: %s", kind => {
    const { schedule, request } = mappingFixture();
    const governance = initialGovernanceContext();
    const id = kind === "unknown" ? toMilestoneDefinitionId("unknown") : governance.definitionsForHistoricalResolution.find(definition => !governance.addablePublicDefinitions.some(addable => addable.id === definition.id))!.id;
    const before = structuredClone(schedule);
    expect(mapDraftLocalOccurrenceToPublic(freeze(schedule), { ...request, publicDefinitionId: id }, reviewContext(schedule))).toMatchObject({ ok: false, code: "definition-not-addable" });
    expect(schedule).toEqual(before);
  });
  it.each(["session", "closure-reservation", "decision-session-reservation", "draft-link-reservation", "decision", "blank-session", "blank-decision"])("session_and_decision_id_collision_are_atomic: %s", kind => {
    const { schedule: base, request: original } = mappingFixture();
    const past = value(mapDraftLocalOccurrenceToPublic(base, original, reviewContext(base)));
    const schedule = freeze({ ...base, reviewSessions: kind === "session" ? past.reviewSessions : [], reviewClosures: kind === "closure-reservation" ? [{ sessionId: original.sessionId, kind: "discarded" as const }] : [],
      reviewDecisions: kind === "decision" || kind === "decision-session-reservation" ? past.reviewDecisions : [],
      workingDraft: { ...base.workingDraft!, reviewSessionIds: kind === "draft-link-reservation" ? [original.sessionId] : [] } });
    const request = { ...original, sessionId: kind === "blank-session" ? " " as typeof original.sessionId : kind === "decision" ? toScheduleReviewSessionId("new-session") : original.sessionId,
      decisionId: kind === "blank-decision" ? " " as typeof original.decisionId : kind === "decision-session-reservation" ? toScheduleReviewDecisionId("new-decision") : original.decisionId };
    const before = structuredClone(schedule);
    expect(mapDraftLocalOccurrenceToPublic(schedule, request, reviewContext(schedule))).toMatchObject({ ok: false, code: "id-collision" });
    expect(schedule).toEqual(before);
  });
  it("rejects_stale_local_to_public_preview_after_real_governance_retire", () => {
    const { schedule, request } = mappingFixture(true);
    expect(previewDraftLocalOccurrenceToPublic(schedule, request, reviewContext(schedule)).ok).toBe(true);
    const initial = createInitialMilestoneGovernanceRuntimeState();
    const started = value(startGovernanceDraft(initial, toGovernanceDraftId("retire-mapping-target")));
    const candidate = started.draft!.candidateRelease;
    const draft = value(updateGovernanceDraft(started, { kind: "replace-candidate-release", candidateRelease: { ...candidate, addableDefinitionIds: candidate.addableDefinitionIds.filter(id => id !== request.publicDefinitionId) } }));
    const retired = value(publishGovernanceDraft(draft, { projects: [devProject001], schedules: [schedule] }, {
      createReleaseId: () => toGovernanceReleaseId("retired-mapping-target"), createEnrollmentId: () => toRequirementEnrollmentId("unused"), createWithdrawalId: () => toRequirementWithdrawalId("unused"), nowIso: () => "2026-10-01T01:00:00Z",
    }));
    const current = reviewContext(schedule, value(selectEffectiveMilestoneGovernanceContext(retired)));
    const before = structuredClone(schedule);
    expect(mapDraftLocalOccurrenceToPublic(freeze(schedule), request, current)).toMatchObject({ ok: false, code: "definition-not-addable" });
    expect(schedule).toEqual(before);
  });
  it("mapping_then_publish_preserves_local_registry_and_older_published_and_discard_closes_manual_session", () => {
    const { schedule, request } = mappingFixture();
    const mapped = value(mapDraftLocalOccurrenceToPublic(schedule, request, reviewContext(schedule)));
    const published = publishScheduleWorkingDraft(mapped, { publishedAt: "2026-10-01T03:00:00Z" }, reviewContext(mapped));
    expect(published.ok).toBe(true);
    if (!published.ok) throw new Error(JSON.stringify(published));
    expect(published.schedule.reviewClosures).toEqual([{ sessionId: "mapping-session", kind: "published", versionNumber: 2 }]);
    expect(published.schedule.publishedVersions[0]).toBe(schedule.publishedVersions[0]);
    expect(published.version.milestones[0].milestoneDefinitionId).toBe(request.publicDefinitionId);
    expect(published.schedule.localDefinitions).toBe(schedule.localDefinitions);
    const discarded = cancelScheduleWorkingDraft(mapped);
    expect(discarded.ok).toBe(true);
    if (!discarded.ok) throw new Error(JSON.stringify(discarded));
    expect(discarded.schedule.reviewClosures).toEqual([{ sessionId: "mapping-session", kind: "discarded" }]);
    expect(discarded.schedule.localDefinitions).toBe(schedule.localDefinitions);
    expect(discarded.schedule.publishedVersions).toBe(schedule.publishedVersions);
  });
});
