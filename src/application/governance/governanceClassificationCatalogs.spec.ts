import { describe, expect, it } from "vitest";
import { milestoneDefinitions, milestoneTypeCatalog } from "../../config/v2/referenceData";
import type { CommandResult, GovernanceDraftUpdate, MilestoneGovernanceRuntimeState } from "../../domain/governance/milestoneGovernance";
import { createEmptyCanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import { toGovernanceDraftId, toGovernanceReleaseId, toMilestoneDefinitionId, toMilestoneTypeId, toRequirementEnrollmentId, toRequirementWithdrawalId, toStageGroupId } from "../../domain/shared/ids";
import { devProject001 } from "../../fixtures/v2/canonicalProjectFixtures";
import { confirmProjectLocalMilestoneDefinition } from "../commands/scheduleReviewCommands";
import { createPortfolioVisibleSchema } from "../../portfolioDashboardColumns";
import { createInitialMilestoneGovernanceRuntimeState } from "./milestoneGovernanceInitializer";
import { selectEffectiveMilestoneGovernanceContext } from "./effectiveMilestoneGovernanceContext";
import { previewGovernancePublish, publishGovernanceDraft, startGovernanceDraft, updateGovernanceDraft } from "./milestoneGovernanceCommands";
import { resolveScheduleDefinitions } from "./scheduleDefinitionResolution";
import { orderMilestoneDefinitions } from "../milestoneDefinitionOrdering";
import { selectCurrentPublishedSchedule, selectScheduleWorkingDraft } from "../selectors/scheduleSelectors";
import { toMilestoneId } from "../../domain/shared/ids";
import { toScheduleVersionNumber } from "../../domain/schedule/schedule";
import { selectDashboardAttention } from "../selectors/dashboardAttention";
import { parseDateOnly } from "../../domain/shared/dateOnly";
import { addScheduleWorkingDraftMilestone, startScheduleWorkingDraft } from "../commands/canonicalScheduleCommands";
import { toCanonicalScheduleWorkingDraftId } from "../../domain/shared/ids";

function value<T>(result: CommandResult<T, string>): T {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}
const stageId = toStageGroupId("stage-certification");
const typeId = toMilestoneTypeId("type-reliability");
const prototype = { projects: [devProject001], schedules: [createEmptyCanonicalProjectSchedule(devProject001.id)] };
const initial = () => createInitialMilestoneGovernanceRuntimeState();
const context = (state = initial()) => value(selectEffectiveMilestoneGovernanceContext(state));
const draft = (state = initial()) => value(startGovernanceDraft(state, toGovernanceDraftId("classification-draft")));
const update = (state: MilestoneGovernanceRuntimeState, action: GovernanceDraftUpdate) => value(updateGovernanceDraft(state, action));
function publish(state: MilestoneGovernanceRuntimeState, suffix = "1") {
  return value(publishGovernanceDraft(state, prototype, {
    createReleaseId: () => toGovernanceReleaseId(`classification-${suffix}`),
    createEnrollmentId: () => toRequirementEnrollmentId("unused"), createWithdrawalId: () => toRequirementWithdrawalId("unused"),
    nowIso: () => "2026-10-05T00:00:00.000Z",
  }));
}

describe("UX05 one released classification authority", () => {
  it("keeps existing public and confirmed same-Project local Add legal after their Stage and ordinary Type retire", () => {
    const original = value(confirmProjectLocalMilestoneDefinition(prototype.schedules[0], {
      definitionId: toMilestoneDefinitionId("retained-local"), name: "Retained local", stageGroupId: toStageGroupId("stage-a1"),
      milestoneTypeId: toMilestoneTypeId("type-test"), source: "manual", evidenceIds: [],
    }, context()));
    const state = update(update(draft(), { kind: "retire-stage", id: toStageGroupId("stage-a1") }), { kind: "retire-type", id: toMilestoneTypeId("type-test") });
    const effective = context(publish(state));
    const commandContext = { governance: effective, localDefinitions: original.localDefinitions, retiredDraftOccurrenceGrants: [] };
    const started = startScheduleWorkingDraft(original, { workingDraftId: toCanonicalScheduleWorkingDraftId("retained-classification-draft") }, commandContext);
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("Expected Draft");
    const local = addScheduleWorkingDraftMilestone(started.schedule, { milestoneId: toMilestoneId("retained-local-row"), milestoneDefinitionId: original.localDefinitions[0].id }, commandContext);
    expect(local.ok).toBe(true);
    const publicRow = addScheduleWorkingDraftMilestone(started.schedule, { milestoneId: toMilestoneId("retained-public-row"), milestoneDefinitionId: toMilestoneDefinitionId("milestone-a1-a-test") }, commandContext);
    expect(publicRow.ok).toBe(true);
    expect(confirmProjectLocalMilestoneDefinition(original, { definitionId: toMilestoneDefinitionId("new-invalid-local"), name: "New work", stageGroupId: toStageGroupId("stage-a1"), milestoneTypeId: null, source: "manual", evidenceIds: [] }, effective)).toMatchObject({ ok: false });
  });

  it("Attention uses exact four Types and released additional null/MDRR IDs, never names, Draft changes or classification selectability", () => {
    const started = draft();
    const untyped = { ...milestoneDefinitions[0], id: toMilestoneDefinitionId("null-attention"), name: "SSL GL G/O SMT MDRR", milestoneTypeId: null };
    const first = publish(update(started, { kind: "replace-candidate-release", candidateRelease: { ...started.draft!.candidateRelease,
      definitions: [...milestoneDefinitions, untyped] } }));
    const ids = ["milestone-a1-a-g-o", "milestone-a1-a-smt", "milestone-c1-c-pre-build", "milestone-a1-a-close", "milestone-ramp-g-o", "milestone-ramp-smt", "milestone-mdrr", "milestone-design-id-fix", "milestone-design-kickoff", "milestone-a1-a-test", "null-attention"];
    const day = parseDateOnly("2026-10-05")!;
    const schedule = { ...prototype.schedules[0], publishedVersions: [{ versionNumber: toScheduleVersionNumber(1), publishedAt: "2026-10-05T00:00:00Z", versionNote: null,
      milestones: ids.map((id, index) => ({ milestoneId: toMilestoneId(`attention-${index}`), milestoneDefinitionId: toMilestoneDefinitionId(id), applicability: "applicable" as const, plan: day, actual: null })) }] };
    const attention = (state: MilestoneGovernanceRuntimeState) => selectDashboardAttention({ ...prototype, schedules: [schedule] }, day, context(state));
    expect(attention(first)).toMatchObject({ kind: "available", due: { projectCount: 1, matches: ids.slice(0, 6).map(milestoneDefinitionId => ({ milestoneDefinitionId })) } });
    let next = draft(first);
    next = update(next, { kind: "replace-candidate-release", candidateRelease: { ...next.draft!.candidateRelease, additionalAttentionDefinitionIds: [untyped.id, toMilestoneDefinitionId("milestone-mdrr")] } });
    next = update(next, { kind: "retire-stage", id: toStageGroupId("stage-a1") });
    expect(attention(next)).toEqual(attention(first));
    const second = publish(next, "2");
    const read = attention(second);
    expect(read.kind).toBe("available");
    if (read.kind !== "available") throw new Error("Expected attention");
    expect(read.due.matches.map(item => item.milestoneDefinitionId)).toEqual([...ids.slice(0, 6), "milestone-mdrr", "null-attention"]);
    expect(read.due.projectCount).toBe(1);
    expect(schedule.publishedVersions[0].milestones).toHaveLength(11);
  });

  it.each(["null-record", "missing-membership", "invalid-aliases"])("rejects malformed replacement catalog structure at the public boundary: %s", problem => {
    const state = draft();
    const candidate = state.draft!.candidateRelease;
    const malformed = problem === "null-record" ? { ...candidate, stageGroups: [null, ...candidate.stageGroups.slice(1)] }
      : problem === "missing-membership" ? { ...candidate, addableDefinitionIds: null }
        : { ...candidate, definitions: candidate.definitions.map((item, index) => index === 0 ? { ...item, aliases: null } : item) };
    const before = structuredClone(state);
    expect(updateGovernanceDraft(state, { kind: "replace-candidate-release", candidateRelease: malformed as never })).toMatchObject({ ok: false, code: "invalid-reference" });
    expect(state).toEqual(before);
  });
  it("uses the released full Stage catalog for ordering, Portfolio and Published labels including a retired new Stage", () => {
    const added = update(draft(), { kind: "add-stage", id: stageId, displayName: "Certification Stage" });
    const definition = { ...milestoneDefinitions[0], id: toMilestoneDefinitionId("public-new-stage"), stageGroupId: stageId, milestoneTypeId: null, displayOrder: -100 };
    const first = publish(update(added, { kind: "replace-candidate-release", candidateRelease: { ...added.draft!.candidateRelease,
      definitions: [...milestoneDefinitions, definition], portfolioColumnDefinitionIds: [...added.draft!.candidateRelease.portfolioColumnDefinitionIds, definition.id] } }));
    const released = publish(update(draft(first), { kind: "retire-stage", id: stageId }), "2");
    const effective = context(released);
    expect(orderMilestoneDefinitions([definition, milestoneDefinitions[0]], effective.stageGroupsForHistoricalResolution).map(item => item.id)).toEqual(["milestone-design-kickoff", "public-new-stage"]);
    const schema = createPortfolioVisibleSchema(effective);
    expect(schema.scheduleMappings.at(-1)).toMatchObject({ milestoneDefinitionId: definition.id, groupLabel: "Certification Stage" });
    const schedule = { ...prototype.schedules[0], publishedVersions: [{ versionNumber: toScheduleVersionNumber(1), publishedAt: "2026-10-05T00:00:00Z", versionNote: null,
      milestones: [definition, milestoneDefinitions[0]].map((item, index) => ({ milestoneId: toMilestoneId(`custom-stage-row-${index}`), milestoneDefinitionId: item.id, applicability: "notApplicable" as const, plan: null, actual: null })) }] };
    const before = structuredClone(schedule);
    expect(selectCurrentPublishedSchedule({ ...prototype, schedules: [schedule] }, devProject001.id, effective)).toMatchObject({ kind: "published", milestoneRows: [{ stage: "Design" }, { stage: "Certification Stage" }] });
    const working = startScheduleWorkingDraft(schedule, { workingDraftId: toCanonicalScheduleWorkingDraftId("stage-order-draft") }, { governance: effective, localDefinitions: [], retiredDraftOccurrenceGrants: [] });
    expect(working.ok).toBe(true);
    if (!working.ok) throw new Error("Expected Draft");
    expect(selectScheduleWorkingDraft({ ...prototype, schedules: [working.schedule] }, devProject001.id, effective)).toMatchObject({ kind: "workingDraft", milestoneRows: [{ stage: "Design" }, { stage: "Certification Stage" }] });
    expect(schedule).toEqual(before);
  });
  it("preserves all 36 definition identities and all 19 historical Types with exactly seven new-definition choices", () => {
    const effective = context();
    expect(effective.definitionsForHistoricalResolution).toEqual(milestoneDefinitions);
    expect(effective.definitionsForHistoricalResolution).toHaveLength(36);
    expect(effective.addablePublicDefinitions).toHaveLength(30);
    expect(effective.portfolioColumnDefinitions).toHaveLength(30);
    expect(effective.milestoneTypesForHistoricalResolution?.map(item => item.id)).toEqual(expect.arrayContaining(milestoneTypeCatalog.map(item => item.id)));
    expect(effective.selectableMilestoneTypes?.map(item => [item.id, item.displayName])).toEqual([
      ["type-g-o", "G/O"], ["type-smt", "SMT"], ["type-pre-build", "Pre-Build"], ["type-close", "Close"],
      ["type-test", "Test"], ["type-certification", "Certification"], ["type-preparation", "Preparation"],
    ]);
    for (const [id, stage, type] of [["milestone-mdrr", "stage-mdrr", "type-mdrr"], ["milestone-design-id-fix", "stage-design", "type-id-fix"], ["milestone-design-kickoff", "stage-design", "type-kickoff"]]) {
      expect(effective.definitionsForHistoricalResolution.find(item => item.id === id)).toMatchObject({ stageGroupId: stage, milestoneTypeId: type });
      expect(effective.selectableMilestoneTypes?.some(item => item.id === type)).toBe(false);
    }
    expect([...effective.automaticAttentionTypeIds]).toEqual(["type-g-o", "type-smt", "type-pre-build", "type-close"]);
    expect([...effective.additionalAttentionDefinitionIds]).toEqual([]);
  });

  it("adds trimmed catalogs in Draft only, publishes them atomically, and never rebuilds Portfolio membership", () => {
    const baseline = initial();
    const before = structuredClone(baseline);
    const stageResult = updateGovernanceDraft(draft(baseline), { kind: "add-stage", id: stageId, displayName: "  Certification Stage  " });
    expect(stageResult).toMatchObject({ ok: true });
    const state = update(value(stageResult), { kind: "add-type", id: typeId, displayName: " Reliability " });
    expect(state.draft!.candidateRelease.stageGroups.at(-1)?.displayName).toBe("Certification Stage");
    expect(context(state)).toEqual(context(baseline));
    expect(previewGovernancePublish(state, prototype).diff).toMatchObject({ addedStageGroupIds: [stageId], addedMilestoneTypeIds: [typeId] });
    const released = publish(state);
    expect(context(released).selectableStageGroups.at(-1)?.id).toBe(stageId);
    expect(context(released).selectableMilestoneTypes.at(-1)?.id).toBe(typeId);
    expect(createPortfolioVisibleSchema(context(released))).toEqual(createPortfolioVisibleSchema(context(baseline)));
    expect(released.releases[1].definitions).toEqual(baseline.releases[0].definitions);
    expect(Object.isFrozen(released.releases[1].stageGroups[0].aliases)).toBe(true);
    expect(Object.isFrozen(released.releases[1].selectableMilestoneTypeIds)).toBe(true);
    expect(baseline).toEqual(before);
    expect(initial()).toEqual(before);
  });

  it("retiring classification warns about dependencies but retains old definitions and historical local resolution", () => {
    const schedule = value(confirmProjectLocalMilestoneDefinition(prototype.schedules[0], {
      definitionId: toMilestoneDefinitionId("local-before-retirement"), name: "Inspection", stageGroupId: toStageGroupId("stage-a1"),
      milestoneTypeId: toMilestoneTypeId("type-test"), source: "manual", evidenceIds: [],
    }, context()));
    const result = updateGovernanceDraft(draft(), { kind: "retire-stage", id: toStageGroupId("stage-a1") });
    expect(result).toMatchObject({ ok: true });
    const state = update(value(result), { kind: "retire-type", id: toMilestoneTypeId("type-test") });
    const preview = previewGovernancePublish(state, { ...prototype, schedules: [schedule] });
    expect(preview.blockingIssues).toEqual([]);
    expect(preview.warnings.map(item => item.message)).toEqual(expect.arrayContaining([
      "此階段仍被既有里程碑使用；停用後僅停止新定義選用，不會停用既有里程碑。",
      "此類型仍被既有里程碑使用；停用後僅停止新定義選用，不會停用既有里程碑。",
    ]));
    const effective = context(publish(state));
    expect(effective.selectableStageGroups.some(item => item.id === "stage-a1")).toBe(false);
    expect(effective.selectableMilestoneTypes.some(item => item.id === "type-test")).toBe(false);
    expect(effective.stageGroupsForHistoricalResolution.some(item => item.id === "stage-a1")).toBe(true);
    expect(effective.milestoneTypesForHistoricalResolution.some(item => item.id === "type-test")).toBe(true);
    expect(effective.addablePublicDefinitions).toEqual(context().addablePublicDefinitions);
    expect(resolveScheduleDefinitions(effective, schedule.localDefinitions).at(-1)?.id).toBe("local-before-retirement");
    expect(confirmProjectLocalMilestoneDefinition(schedule, { ...schedule.localDefinitions[0], definitionId: toMilestoneDefinitionId("too-late") }, effective)).toMatchObject({ ok: false, code: "invalid-local-classification" });
  });

  it("allows null for a new public and local definition without inventing a Type record or an occurrence", () => {
    const started = draft();
    const definition = { ...milestoneDefinitions[0], id: toMilestoneDefinitionId("public-no-type"), name: "Untyped public work", milestoneTypeId: null };
    const state = update(started, { kind: "replace-candidate-release", candidateRelease: { ...started.draft!.candidateRelease,
      definitions: [...milestoneDefinitions, definition], addableDefinitionIds: [...started.draft!.candidateRelease.addableDefinitionIds, definition.id] } });
    expect(previewGovernancePublish(state, prototype).blockingIssues).toEqual([]);
    const effective = context(publish(state));
    expect(effective.definitionsForHistoricalResolution.at(-1)?.milestoneTypeId).toBeNull();
    const result = confirmProjectLocalMilestoneDefinition(prototype.schedules[0], {
      definitionId: toMilestoneDefinitionId("local-no-type"), name: "SSL / GL", stageGroupId: toStageGroupId("stage-a1"), milestoneTypeId: null, source: "manual", evidenceIds: [],
    }, effective);
    expect(result).toMatchObject({ ok: true });
    expect(value(result).localDefinitions[0].milestoneTypeId).toBeNull();
    expect(value(result).workingDraft).toBeNull();
    expect(effective.milestoneTypesForHistoricalResolution).toHaveLength(21);
    expect(resolveScheduleDefinitions(effective, value(result).localDefinitions).at(-1)?.milestoneTypeId).toBeNull();
  });

  it.each(["type-mdrr", "type-id-fix", "type-kickoff", "", "unknown"])("rejects new local use of nonselectable %s atomically", type => {
    const schedule = prototype.schedules[0];
    const before = structuredClone(schedule);
    expect(confirmProjectLocalMilestoneDefinition(schedule, { definitionId: toMilestoneDefinitionId("local-illegal"), name: "Work", stageGroupId: toStageGroupId("stage-a1"), milestoneTypeId: type as ReturnType<typeof toMilestoneTypeId>, source: "manual", evidenceIds: [] }, context())).toMatchObject({ ok: false, code: "invalid-local-classification" });
    expect(schedule).toEqual(before);
  });

  it.each(["type-g-o", "type-smt", "type-pre-build", "type-close"])("protects automatic Type %s at the command boundary", id => {
    const state = draft();
    expect(updateGovernanceDraft(state, { kind: "retire-type", id: toMilestoneTypeId(id) })).toMatchObject({ ok: false, code: "protected-classification" });
    const release = state.draft!.candidateRelease;
    expect(updateGovernanceDraft(state, { kind: "replace-candidate-release", candidateRelease: { ...release, automaticAttentionTypeIds: release.automaticAttentionTypeIds?.filter(type => type !== id) } })).toMatchObject({ ok: false });
  });

  it.each([
    { kind: "add-stage", id: stageId, displayName: " " },
    { kind: "add-stage", id: stageId, displayName: " design " },
    { kind: "add-type", id: typeId, displayName: " mdrr " },
    { kind: "add-type", id: toMilestoneTypeId("type-test"), displayName: "Collision" },
    { kind: "add-type", id: toMilestoneTypeId("stage-a1"), displayName: "Cross namespace" },
  ] as const)("rejects invalid catalog addition atomically: $displayName", action => {
    const state = draft();
    const before = structuredClone(state);
    expect(updateGovernanceDraft(state, action)).toMatchObject({ ok: false });
    expect(state).toEqual(before);
  });

  it("rejects replacement rename, hard delete, legacy activation and malformed catalogs without changing the draft", () => {
    const state = draft();
    const release = state.draft!.candidateRelease;
    expect(release.stageGroups).toBeDefined();
    const candidates = [
      { ...release, stageGroups: release.stageGroups.map((item, index) => index === 0 ? { ...item, displayName: "Renamed" } : item) },
      { ...release, milestoneTypes: release.milestoneTypes.filter(item => item.id !== "type-mdrr") },
      { ...release, selectableMilestoneTypeIds: [...release.selectableMilestoneTypeIds, toMilestoneTypeId("type-mdrr")] },
      { ...release, stageGroups: null },
    ];
    const before = structuredClone(state);
    for (const candidateRelease of candidates) expect(updateGovernanceDraft(state, { kind: "replace-candidate-release", candidateRelease: candidateRelease as never })).toMatchObject({ ok: false });
    expect(state).toEqual(before);
  });

  it("blocks a newly created public definition when its classification is historical or retired in the candidate", () => {
    const started = draft();
    const definition = { ...milestoneDefinitions[0], id: toMilestoneDefinitionId("new-legacy-classification") };
    const state = update(started, { kind: "replace-candidate-release", candidateRelease: { ...started.draft!.candidateRelease, definitions: [...milestoneDefinitions, definition] } });
    expect(previewGovernancePublish(state, prototype).blockingIssues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "invalid-reference" })]));
    expect(publishGovernanceDraft(state, prototype, {} as never)).toMatchObject({ ok: false, code: "invalid-reference" });
  });
});
