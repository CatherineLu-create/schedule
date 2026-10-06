import { describe, expect, it } from "vitest";
import type { MilestoneGovernanceDraft, MilestoneGovernanceRuntimeState, RetiredDraftOccurrenceGrant } from "../../domain/governance/milestoneGovernance";
import { dashboardAttentionMilestoneTypeIds, milestoneTypeCatalog, stageGroupCatalog } from "../../config/v2/referenceData";
import { devProject001, devProject002 } from "../../fixtures/v2/canonicalProjectFixtures";
import { cpuReferenceFixtures, gpuReferenceFixtures, panelSizeReferenceFixtures, productLineReferenceFixtures } from "../../fixtures/v2/referenceFixtures";
import { createEmptyCanonicalProjectSchedule, type CanonicalProjectSchedule, type CanonicalPublishedScheduleMilestone } from "../../domain/schedule/officialSchedule";
import type { ProjectLocalMilestoneDefinition } from "../../domain/schedule/scheduleReview";
import { parseDateOnly } from "../../domain/shared/dateOnly";
import { toScheduleVersionNumber } from "../../domain/schedule/schedule";
import { toCanonicalScheduleWorkingDraftId, toGovernanceDraftId, toGovernanceReleaseId, toMilestoneDefinitionId, toMilestoneId, toMilestoneTypeId, toProjectId, toRequirementEnrollmentId, toRequirementWithdrawalId, toScheduleEvidenceId, toScheduleImportCandidateId, toStageGroupId } from "../../domain/shared/ids";
import type { PrototypeState } from "../state/prototypeState";
import { createInitialMilestoneGovernanceRuntimeState } from "./milestoneGovernanceInitializer";
import { discardGovernanceDraft, previewGovernancePublish, publishGovernanceDraft, startGovernanceDraft, updateGovernanceDraft, type GovernanceCommandFactories } from "./milestoneGovernanceCommands";
import { selectEffectiveMilestoneGovernanceContext } from "./effectiveMilestoneGovernanceContext";
import { resolveScheduleDefinitions } from "./scheduleDefinitionResolution";
import { selectCurrentPublishedSchedule } from "../selectors/scheduleSelectors";
import { selectDashboardAttention } from "../selectors/dashboardAttention";

type State = MilestoneGovernanceRuntimeState;
type Candidate = MilestoneGovernanceDraft["candidateRelease"];
const projectId = devProject001.id;
const secondProjectId = devProject002.id;
const baseline = createInitialMilestoneGovernanceRuntimeState();
const x = baseline.releases[0].addableDefinitionIds[0];
const y = baseline.releases[0].addableDefinitionIds[1];
const draftId = toCanonicalScheduleWorkingDraftId("schedule-draft-1");
const emptyPrototype: PrototypeState = { projects: [devProject001, devProject002], schedules: [] };

function factories(prefix = "next"): GovernanceCommandFactories {
  let enrollment = 0;
  let withdrawal = 0;
  return {
    createReleaseId: () => toGovernanceReleaseId(`${prefix}-release`),
    createEnrollmentId: () => toRequirementEnrollmentId(`${prefix}-enrollment-${++enrollment}`),
    createWithdrawalId: () => toRequirementWithdrawalId(`${prefix}-withdrawal-${++withdrawal}`),
    nowIso: () => "2026-10-01T01:02:03.000Z",
  };
}
function value(result: ReturnType<typeof startGovernanceDraft>): State {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}
function drafting(state: State = baseline): State {
  return value(startGovernanceDraft(state, toGovernanceDraftId("governance-draft")));
}
function candidate(state: State, patch: Partial<Candidate>): State {
  return value(updateGovernanceDraft(state, { kind: "replace-candidate-release", candidateRelease: { ...state.draft!.candidateRelease, ...patch } }));
}
function retire(state = drafting()): State {
  return candidate(state, { addableDefinitionIds: state.draft!.candidateRelease.addableDefinitionIds.filter(id => id !== x) });
}
function assign(state: State, assignments = [{ projectId, milestoneDefinitionId: x }]): State {
  return value(updateGovernanceDraft(state, { kind: "replace-existing-project-assignments", assignments }));
}
function enrolled(): State {
  return value(publishGovernanceDraft(assign(drafting()), emptyPrototype, factories("initial")));
}
function withdraw(state: State, ids = [state.requirementEnrollments[0].id]): State {
  return value(updateGovernanceDraft(state, { kind: "replace-withdrawals", enrollmentIds: ids }));
}
function occurrence(id = "occurrence-1", definitionId = x): CanonicalPublishedScheduleMilestone {
  return { milestoneId: toMilestoneId(id), milestoneDefinitionId: definitionId, applicability: "applicable", plan: null, actual: null };
}
function schedule(rows = [occurrence()]): CanonicalProjectSchedule {
  return { ...createEmptyCanonicalProjectSchedule(projectId), workingDraft: { workingDraftId: draftId, milestones: rows, importCandidates: [], reviewSessionIds: [] } };
}
function published(rows = [occurrence()], versionNumber = 1) {
  return { versionNumber: toScheduleVersionNumber(versionNumber), versionNote: null, publishedAt: "2026-09-30T00:00:00.000Z", milestones: rows };
}
function prototype(item: CanonicalProjectSchedule): PrototypeState {
  return { ...emptyPrototype, schedules: [item] };
}
function rejection(state: State, code: string, input = emptyPrototype, injected = factories()) {
  const before = structuredClone({ state, input });
  const preview = previewGovernancePublish(state, input);
  expect(preview.blockingIssues.length).toBeGreaterThan(0);
  expect(publishGovernanceDraft(state, input, injected)).toMatchObject({ ok: false, code });
  expect({ state, input }).toEqual(before);
}

describe("governance draft and atomic publication", () => {
  it("governance_draft_does_not_change_current_release", () => {
    const state = candidate(drafting(), { portfolioColumnDefinitionIds: [], additionalAttentionDefinitionIds: [x] });
    expect(state.currentReleaseId).toBe(baseline.currentReleaseId);
    expect(state.releases).toBe(baseline.releases);
    expect(baseline.draft).toBeNull();
    expect(previewGovernancePublish(state, emptyPrototype).diff).toMatchObject({ portfolioDefinitionIdsAfter: [], additionalAttentionIdsAfter: [x] });
  });
  it("publishes_immutable_release_and_clears_draft_atomically", () => {
    const state = assign(retire(), [{ projectId, milestoneDefinitionId: y }]);
    const input = prototype(schedule([occurrence(), occurrence("repeat")]));
    const before = structuredClone({ state, input });
    const preview = previewGovernancePublish(state, input);
    expect(preview.blockingIssues).toEqual([]);
    expect(preview.proposedRetiredDraftOccurrenceGrants).toEqual([
      { projectId, workingDraftId: draftId, milestoneId: toMilestoneId("occurrence-1"), milestoneDefinitionId: x },
      { projectId, workingDraftId: draftId, milestoneId: toMilestoneId("repeat"), milestoneDefinitionId: x },
    ]);
    const next = value(publishGovernanceDraft(state, input, factories()));
    expect(next.currentReleaseId).toBe("next-release");
    expect(next.releases).toHaveLength(2);
    expect(next.releases[0]).toBe(state.releases[0]);
    expect(next.releases[1].publishedAt).toBe("2026-10-01T01:02:03.000Z");
    expect(next.draft).toBeNull();
    expect(next.retiredDraftOccurrenceGrants.map(g => g.retiredByReleaseId)).toEqual(["next-release", "next-release"]);
    expect(next.requirementEnrollments[0]).toMatchObject({ id: "next-enrollment-1", assignedByReleaseId: "next-release", source: "explicit-existing-project" });
    expect({ state, input }).toEqual(before);
    expect(next.releases[1].definitions).not.toBe(state.draft!.candidateRelease.definitions);
    expect(next.releases[1].definitions[0].aliases).not.toBe(state.draft!.candidateRelease.definitions[0].aliases);
    expect(Object.isFrozen(next.releases[1])).toBe(true);
  });
  it("rejects_stale_base_release_without_mutation", () => {
    const state = drafting();
    const stale = { ...state, draft: { ...state.draft!, baseReleaseId: toGovernanceReleaseId("stale") } };
    rejection(stale, "stale-base-release");
    expect(updateGovernanceDraft(stale, { kind: "replace-withdrawals", enrollmentIds: [] })).toMatchObject({ ok: false, code: "stale-base-release" });
  });
  it("discard preserves release/history and is a no-op without draft", () => {
    expect(discardGovernanceDraft(baseline)).toBe(baseline);
    expect(discardGovernanceDraft(drafting())).toEqual(baseline);
    expect(startGovernanceDraft(drafting(), toGovernanceDraftId("second"))).toMatchObject({ ok: false, code: "draft-already-exists" });
    rejection(baseline, "no-draft");
    expect(updateGovernanceDraft(baseline, { kind: "replace-withdrawals", enrollmentIds: [] })).toMatchObject({ ok: false, code: "no-draft" });
  });
  it("preview consumes no factories and publish re-evaluates current Schedule input", () => {
    const state = assign(retire());
    expect(previewGovernancePublish(state, prototype(schedule())).blockingIssues).toEqual([]);
    rejection(state, "no-legal-fulfillment-path");
  });
  it("does not alias caller-owned candidate arrays into preview or release", () => {
    const state = drafting();
    const mutable = structuredClone(state.draft!.candidateRelease) as {
      -readonly [K in keyof Candidate]: Candidate[K] extends readonly (infer T)[] ? T[] : Candidate[K]
    };
    const direct: State = { ...state, draft: { ...state.draft!, candidateRelease: mutable } };
    const preview = previewGovernancePublish(direct, emptyPrototype);
    const next = value(publishGovernanceDraft(direct, emptyPrototype, factories()));
    mutable.addableDefinitionIds.length = 0;
    (mutable.definitions[0].aliases as string[]).push("caller mutation");
    expect(preview.candidateRelease!.addableDefinitionIds).toHaveLength(30);
    expect(next.releases[1].addableDefinitionIds).toHaveLength(30);
    expect(next.releases[1].definitions[0].aliases).not.toContain("caller mutation");
  });
  it("rejects missing current release and blank draft ID", () => {
    expect(startGovernanceDraft(baseline, "" as never)).toMatchObject({ ok: false, code: "invalid-reference" });
    const missing = { ...baseline, currentReleaseId: toGovernanceReleaseId("missing") };
    expect(startGovernanceDraft(missing, toGovernanceDraftId("draft"))).toMatchObject({ ok: false, code: "invalid-reference" });
    rejection({ ...drafting(), currentReleaseId: missing.currentReleaseId, draft: { ...drafting().draft!, baseReleaseId: missing.currentReleaseId } }, "invalid-reference");
  });
});

describe("P1 enrollments and withdrawals", () => {
  it("withdrawal_appends_record_without_rewriting_enrollment_or_schedule", () => {
    const original = enrolled();
    const state = withdraw(retire(drafting(original)));
    const input = prototype(schedule());
    const before = structuredClone({ original, state, input });
    const next = value(publishGovernanceDraft(state, input, factories()));
    expect(next.requirementEnrollments).toEqual(original.requirementEnrollments);
    expect(next.requirementWithdrawals).toEqual([{ id: "next-withdrawal-1", enrollmentId: "initial-enrollment-1", withdrawnByReleaseId: "next-release" }]);
    expect({ original, state, input }).toEqual(before);
  });
  it("retarget_after_withdrawal_creates_new_enrollment_id", () => {
    const original = enrolled();
    const withdrawn = value(publishGovernanceDraft(withdraw(drafting(original)), emptyPrototype, factories("withdraw")));
    const next = value(publishGovernanceDraft(assign(drafting(withdrawn)), emptyPrototype, factories()));
    expect(next.requirementEnrollments.map(e => e.id)).toEqual(["initial-enrollment-1", "next-enrollment-1"]);
    expect(next.requirementWithdrawals).toEqual(withdrawn.requirementWithdrawals);
  });
  it("allows withdrawal and re-target in one release", () => {
    const next = value(publishGovernanceDraft(assign(withdraw(drafting(enrolled()))), emptyPrototype, factories()));
    expect(next.requirementEnrollments).toHaveLength(2);
    expect(next.requirementWithdrawals).toHaveLength(1);
  });
  it("allows_at_most_one_effective_enrollment_per_project_definition", () => {
    rejection(assign(drafting(enrolled())), "duplicate-id");
    rejection(assign(drafting(), [{ projectId, milestoneDefinitionId: x }, { projectId, milestoneDefinitionId: x }]), "duplicate-id");
  });
  it("explicit same-release withdrawal resolves otherwise-blocking Retire conflict", () => {
    const state = retire(drafting(enrolled()));
    rejection(state, "retire-requirement-conflict");
    expect(publishGovernanceDraft(withdraw(state), emptyPrototype, factories()).ok).toBe(true);
  });
  it.each(["applicable", "notApplicable"] as const)("retained Current Published %s permits re-target and warns for future P2", applicability => {
    const state = assign(withdraw(retire(drafting(enrolled()))));
    const input = prototype({ ...schedule([]), publishedVersions: [published([{ ...occurrence(), applicability }])] });
    expect(previewGovernancePublish(state, input).warnings).toHaveLength(1);
    expect(publishGovernanceDraft(state, input, factories()).ok).toBe(true);
  });
  it("validates withdrawal references and rejects repeated or already withdrawn IDs", () => {
    rejection(withdraw(drafting(enrolled()), [toRequirementEnrollmentId("unknown")]), "invalid-reference");
    const state = drafting(enrolled());
    const id = state.requirementEnrollments[0].id;
    rejection(withdraw(state, [id, id]), "duplicate-id");
    const withdrawn = value(publishGovernanceDraft(withdraw(state), emptyPrototype, factories()));
    rejection(withdraw(drafting(withdrawn)), "invalid-reference");
  });
  it("only assignment and withdrawal releases in current history affect effective pairs", () => {
    const initial = enrolled();
    const future = { ...initial.releases[1], id: toGovernanceReleaseId("future") };
    const withFuture = initial;
    const futureWithdrawal = { id: toRequirementWithdrawalId("future-withdrawal"), enrollmentId: initial.requirementEnrollments[0].id, withdrawnByReleaseId: future.id };
    rejection(assign(drafting({ ...withFuture, requirementWithdrawals: [futureWithdrawal] })), "duplicate-id");
    const futureEnrollment = { ...initial.requirementEnrollments[0], assignedByReleaseId: future.id };
    expect(publishGovernanceDraft(assign(drafting({ ...withFuture, requirementEnrollments: [futureEnrollment] })), emptyPrototype, factories()).ok).toBe(true);
    rejection(withdraw(drafting({ ...withFuture, requirementEnrollments: [futureEnrollment] })), "invalid-reference");
  });
});

describe("F2 and D1 exact fulfillment paths", () => {
  it("rejects_retired_definition_reintroduced_as_new_project_requirement", () => {
    const r1 = value(publishGovernanceDraft(retire(), emptyPrototype, factories("retire")));
    rejection(candidate(drafting(r1), { newProjectRequirementDefinitionIds: [x] }), "retire-requirement-conflict");
    rejection(candidate(retire(), { newProjectRequirementDefinitionIds: [x] }), "retire-requirement-conflict");
  });
  it("every candidate release requires new requirements subset of post-release addable", () => {
    expect(publishGovernanceDraft(candidate(drafting(), { newProjectRequirementDefinitionIds: [x] }), emptyPrototype, factories()).ok).toBe(true);
    const id = toMilestoneDefinitionId("new-definition");
    const state = candidate(drafting(), { definitions: [...baseline.releases[0].definitions, { ...baseline.releases[0].definitions[0], id, milestoneTypeId: null }], newProjectRequirementDefinitionIds: [id] });
    rejection(state, "retire-requirement-conflict");
  });
  it("rejects_existing_project_assignment_without_legal_fulfillment_path", () => {
    rejection(assign(retire()), "no-legal-fulfillment-path");
    const r1 = value(publishGovernanceDraft(retire(), emptyPrototype, factories("r1")));
    rejection(assign(drafting(r1)), "no-legal-fulfillment-path");
  });
  it.each(["project", "draft", "occurrence", "definition", "removed", "restart", "unknown-release"])("rejects prior D1 grant mismatch: %s", mismatch => {
    const input = prototype(schedule());
    const retired = value(publishGovernanceDraft(retire(), input, factories("retire")));
    const grant = retired.retiredDraftOccurrenceGrants[0];
    const patch: Partial<RetiredDraftOccurrenceGrant> = mismatch === "project" ? { projectId: secondProjectId }
      : mismatch === "draft" ? { workingDraftId: toCanonicalScheduleWorkingDraftId("other") }
      : mismatch === "occurrence" ? { milestoneId: toMilestoneId("other") }
      : mismatch === "definition" ? { milestoneDefinitionId: y }
      : mismatch === "unknown-release" ? { retiredByReleaseId: toGovernanceReleaseId("unknown") } : {};
    const state = assign(drafting({ ...retired, retiredDraftOccurrenceGrants: [{ ...grant, ...patch }] }));
    const current = mismatch === "removed" ? schedule([]) : mismatch === "restart" ? { ...schedule(), workingDraft: { ...schedule().workingDraft!, workingDraftId: toCanonicalScheduleWorkingDraftId("restarted") } } : schedule();
    rejection(state, "no-legal-fulfillment-path", prototype(current));
  });
  it("prior D1 grant matches only the present exact tuple and is not reissued", () => {
    const input = prototype(schedule());
    const retired = value(publishGovernanceDraft(retire(), input, factories("retire")));
    const state = assign(drafting(retired));
    expect(previewGovernancePublish(state, input).proposedRetiredDraftOccurrenceGrants).toEqual([]);
    expect(value(publishGovernanceDraft(state, input, factories())).retiredDraftOccurrenceGrants).toEqual(retired.retiredDraftOccurrenceGrants);
  });
  it.each(["old-history", "candidate-only", "same-label-local", "other-project"])("does not grant legal lineage from %s", source => {
    let item = schedule([]);
    if (source === "old-history") item = { ...item, publishedVersions: [published([occurrence()]), published([], 2)] };
    if (source === "candidate-only") item = { ...item, workingDraft: { ...item.workingDraft!, importCandidates: [{ id: toScheduleImportCandidateId("candidate"), evidenceId: toScheduleEvidenceId("evidence"), parsedPlan: { kind: "missing" }, parsedActual: { kind: "missing" }, parsedApplicability: { kind: "missing" }, proposedDefinitionMatches: [x], rawFindings: [], status: "pending" }] } };
    if (source === "same-label-local") item = { ...schedule([occurrence("local", toMilestoneDefinitionId("local-x"))]), localDefinitions: [{ ...baseline.releases[0].definitions[0], id: toMilestoneDefinitionId("local-x"), source: "manual", confirmation: "confirmed", evidenceIds: [] }] };
    if (source === "other-project") item = { ...schedule(), projectId: secondProjectId };
    rejection(assign(retire()), "no-legal-fulfillment-path", prototype(item));
  });
  it("retained Published clone permits assignment after original grant Draft ended", () => {
    const retired = value(publishGovernanceDraft(retire(), prototype(schedule()), factories("retire")));
    const item = { ...schedule(), workingDraft: { ...schedule().workingDraft!, workingDraftId: toCanonicalScheduleWorkingDraftId("clone") }, publishedVersions: [published()] };
    expect(publishGovernanceDraft(assign(drafting(retired)), prototype(item), factories()).ok).toBe(true);
  });
  it("issues separate grants for repeated definitions and Projects without merging occurrences", () => {
    const input = { ...emptyPrototype, schedules: [schedule([occurrence(), occurrence("repeat"), occurrence("different", y)]), { ...schedule(), projectId: secondProjectId }] };
    const grants = previewGovernancePublish(retire(), input).proposedRetiredDraftOccurrenceGrants;
    expect(grants.map(g => [g.projectId, g.milestoneId, g.milestoneDefinitionId])).toEqual([[projectId, "occurrence-1", x], [projectId, "repeat", x], [secondProjectId, "occurrence-1", x]]);
  });
});

describe("complete release integrity and immutable historical meaning", () => {
  it.each(["remove", "name", "stage", "type"])("PF06 preview and publish reject historical identity change: %s", change => {
    const definitions = baseline.releases[0].definitions.map(d => ({ ...d }));
    if (change === "remove") definitions.shift();
    else if (change === "name") definitions[0] = { ...definitions[0], name: "Renamed" };
    else if (change === "stage") definitions[0] = { ...definitions[0], stageGroupId: stageGroupCatalog.find(s => s.id !== definitions[0].stageGroupId)!.id };
    else definitions[0] = { ...definitions[0], milestoneTypeId: milestoneTypeCatalog.find(t => t.id !== definitions[0].milestoneTypeId)!.id };
    rejection(candidate(drafting(), { definitions }), "invalid-reference");
  });
  it("PF06 compares authoritative older history even if current release lost an ID", () => {
    const broken = { ...baseline.releases[0], id: toGovernanceReleaseId("broken"), definitions: baseline.releases[0].definitions.slice(1), addableDefinitionIds: [], portfolioColumnDefinitionIds: [] };
    const state = drafting({ ...baseline, releases: [...baseline.releases, broken], currentReleaseId: broken.id });
    rejection(state, "invalid-reference");
  });
  it("membership-only changes succeed and automatic Attention remains four", () => {
    const before = structuredClone([cpuReferenceFixtures, gpuReferenceFixtures, panelSizeReferenceFixtures, productLineReferenceFixtures]);
    const next = value(publishGovernanceDraft(candidate(drafting(), { addableDefinitionIds: [], portfolioColumnDefinitionIds: [], additionalAttentionDefinitionIds: [] }), emptyPrototype, factories()));
    expect(next.releases[1].definitions).toEqual(baseline.releases[0].definitions);
    expect(dashboardAttentionMilestoneTypeIds).toEqual(["type-g-o", "type-smt", "type-pre-build", "type-close"]);
    expect([cpuReferenceFixtures, gpuReferenceFixtures, panelSizeReferenceFixtures, productLineReferenceFixtures]).toEqual(before);
  });
  it.each(["addableDefinitionIds", "portfolioColumnDefinitionIds", "additionalAttentionDefinitionIds", "newProjectRequirementDefinitionIds"] as const)("rejects duplicate and unresolved membership: %s", field => {
    rejection(candidate(drafting(), { [field]: [x, x] }), "duplicate-id");
    rejection(candidate(drafting(), { [field]: [toMilestoneDefinitionId("unknown")] }), "invalid-reference");
  });
  it.each(["duplicate", "inactive", "unreviewed", "invalid-stage", "invalid-type", "blank-id"])("rejects invalid definition: %s", problem => {
    const first = baseline.releases[0].definitions[0];
    const definition = problem === "inactive" ? { ...first, active: false } : problem === "unreviewed" ? { ...first, reviewStatus: "unreviewed" as const }
      : problem === "invalid-stage" ? { ...first, stageGroupId: toStageGroupId("unknown") } : problem === "invalid-type" ? { ...first, milestoneTypeId: toMilestoneTypeId("unknown") }
      : problem === "blank-id" ? { ...first, id: "" as typeof x } : first;
    const definitions = problem === "duplicate" ? [...baseline.releases[0].definitions, first] : [definition, ...baseline.releases[0].definitions.slice(1)];
    rejection(candidate(drafting(), { definitions }), problem === "duplicate" ? "duplicate-id" : "invalid-reference");
  });
  it("rejects unknown Project and definition assignment", () => {
    rejection(assign(drafting(), [{ projectId: toProjectId("unknown"), milestoneDefinitionId: x }]), "invalid-reference");
    rejection(assign(drafting(), [{ projectId, milestoneDefinitionId: toMilestoneDefinitionId("unknown") }]), "invalid-reference");
  });
  it("reports added, changed and retired definitions with ordered membership diff", () => {
    const definitions = baseline.releases[0].definitions;
    const added = { ...definitions[0], id: toMilestoneDefinitionId("new"), name: "New", milestoneTypeId: null };
    const state = candidate(retire(), { definitions: [{ ...definitions[0], active: false }, ...definitions.slice(1), added], portfolioColumnDefinitionIds: [y, x], additionalAttentionDefinitionIds: [y] });
    expect(previewGovernancePublish(state, emptyPrototype).diff).toEqual({ addedStageGroupIds: [], retiredStageGroupIds: [], addedMilestoneTypeIds: [], retiredMilestoneTypeIds: [], addedDefinitionIds: [added.id], changedDefinitionIds: [x], retiredDefinitionIds: [x], addableDefinitionIdsBefore: baseline.releases[0].addableDefinitionIds, addableDefinitionIdsAfter: baseline.releases[0].addableDefinitionIds.filter(id => id !== x), portfolioDefinitionIdsBefore: baseline.releases[0].portfolioColumnDefinitionIds, portfolioDefinitionIdsAfter: [y, x], additionalAttentionIdsBefore: [], additionalAttentionIdsAfter: [y] });
    expect(publishGovernanceDraft(state, emptyPrototype, factories()).ok).toBe(true);
  });
  it.each(["stage", "type"])("new definition must use a legal %s independently of PF06 continuity", classification => {
    const definition = { ...baseline.releases[0].definitions[0], id: toMilestoneDefinitionId("new-definition"), ...(classification === "stage" ? { stageGroupId: toStageGroupId("unknown") } : { milestoneTypeId: toMilestoneTypeId("unknown") }) };
    rejection(candidate(drafting(), { definitions: [...baseline.releases[0].definitions, definition], addableDefinitionIds: [...baseline.releases[0].addableDefinitionIds, definition.id] }), "invalid-reference");
  });
  it("adds a new reviewed public definition using existing Stage and Type", () => {
    const definition = { ...baseline.releases[0].definitions[0], id: toMilestoneDefinitionId("new-definition"), name: "New work", milestoneTypeId: toMilestoneTypeId("type-test") };
    const state = assign(candidate(drafting(), { definitions: [...baseline.releases[0].definitions, definition], addableDefinitionIds: [...baseline.releases[0].addableDefinitionIds, definition.id], newProjectRequirementDefinitionIds: [definition.id] }), [{ projectId, milestoneDefinitionId: definition.id }]);
    const next = value(publishGovernanceDraft(state, emptyPrototype, factories()));
    expect(next.releases[1].definitions.at(-1)).toEqual(definition);
    expect(next.requirementEnrollments[0].milestoneDefinitionId).toBe(definition.id);
  });
});

describe("public and Project-local definition identity boundary", () => {
  // Root contracts predate GOV-06: these fixtures deliberately do not call its uncommitted command.
  const local: ProjectLocalMilestoneDefinition = {
    id: toMilestoneDefinitionId("local-fix-boundary"), name: "Local acceptance",
    stageGroupId: toStageGroupId("stage-a1"), milestoneTypeId: toMilestoneTypeId("type-test"),
    displayOrder: 370, source: "manual", confirmation: "confirmed", evidenceIds: [],
  };
  const referenceDate = parseDateOnly("2026-10-01")!;
  function localSchedule(definition = local): CanonicalProjectSchedule {
    return { ...createEmptyCanonicalProjectSchedule(projectId), localDefinitions: [definition] };
  }
  function localPublished(definition = local): CanonicalProjectSchedule {
    return { ...localSchedule(definition), publishedVersions: [published([
      { ...occurrence("local-published-row", definition.id), plan: referenceDate },
    ])] };
  }
  function completePrototype(item = localSchedule()): PrototypeState {
    return { ...emptyPrototype, schedules: [item, createEmptyCanonicalProjectSchedule(secondProjectId)] };
  }
  function publicDefinition(id = local.id, name = "Public replacement") {
    return { ...baseline.releases[0].definitions[0], id, name,
      stageGroupId: toStageGroupId("stage-c1"), milestoneTypeId: toMilestoneTypeId("type-smt") };
  }
  function publicDraft(definition = publicDefinition(), state = drafting()): State {
    return candidate(state, { definitions: [...state.draft!.candidateRelease.definitions, definition] });
  }
  function effective(state: State) {
    const result = selectEffectiveMilestoneGovernanceContext(state);
    if (!result.ok) throw new Error(JSON.stringify(result));
    return result.value;
  }
  function expectCollision(state: State, input: PrototypeState, definitionId = local.id) {
    const before = structuredClone({ state, input });
    const preview = previewGovernancePublish(state, input);
    const result = publishGovernanceDraft(state, input, factories());
    expect(preview.blockingIssues).toEqual([expect.objectContaining({
      code: "duplicate-id", domain: "governance", source: "data", severity: "blocking",
      target: { section: "definitions", entityId: definitionId },
    })]);
    expect(result).toEqual({ ok: false, code: "duplicate-id", issues: preview.blockingIssues });
    expect({ state, input }).toEqual(before);
  }

  it("rejects_new_public_definition_id_that_collides_with_project_local_definition", () => {
    expect(baseline.releases[0].definitions.some(definition => definition.id === local.id)).toBe(false);
    expectCollision(publicDraft(), completePrototype(localPublished()));
  });

  it("rejects_collision_with_local_definition_from_another_project", () => {
    const state = assign(publicDraft(), [{ projectId, milestoneDefinitionId: y }]);
    const input = { ...emptyPrototype, schedules: [
      createEmptyCanonicalProjectSchedule(projectId),
      { ...localSchedule(), projectId: secondProjectId },
    ] };
    expectCollision(state, input);
  });

  it.each(["older-only", "no-occurrence"])("rejects_collision_with_historical_unused_local_definition: %s", usage => {
    const item = usage === "older-only"
      ? { ...localPublished(), publishedVersions: [...localPublished().publishedVersions, published([], 2)], workingDraft: schedule([]).workingDraft }
      : localSchedule();
    expectCollision(publicDraft(), completePrototype(item));
  });

  it("rejected_collision_does_not_reinterpret_existing_published_local_occurrence", () => {
    const state = publicDraft();
    const item = localPublished();
    const input = completePrototype(item);
    const before = structuredClone({ state, input });
    const beforeRead = selectCurrentPublishedSchedule(input, projectId, effective(state));
    expect(beforeRead).toMatchObject({ kind: "published", milestoneRows: [{ milestone: "Local acceptance", stage: "A1-stage" }] });
    const result = publishGovernanceDraft(state, input, factories());
    const afterContext = effective(result.ok ? result.value : state);
    expect(resolveScheduleDefinitions(afterContext, item.localDefinitions).find(definition => definition.id === local.id))
      .toMatchObject({ id: local.id, name: "Local acceptance", stageGroupId: "stage-a1", milestoneTypeId: "type-test" });
    expect(selectCurrentPublishedSchedule(input, projectId, afterContext)).toEqual(beforeRead);
    expect(result).toMatchObject({ ok: false, code: "duplicate-id" });
    expect({ state, input }).toEqual(before);
  });

  it("rejected_collision_preserves_attention_semantics", () => {
    const monitored = { ...local, name: "Local monitored SMT", milestoneTypeId: toMilestoneTypeId("type-smt") };
    const item = localPublished(monitored);
    const input = completePrototype(item);
    const state = publicDraft({ ...publicDefinition(), milestoneTypeId: toMilestoneTypeId("type-test") });
    const before = selectDashboardAttention(input, referenceDate, effective(state));
    expect(before).toMatchObject({ kind: "available", due: { projectCount: 1, matches: [{
      projectId, milestoneId: "local-published-row", milestoneDefinitionId: local.id, milestoneName: "Local monitored SMT", plan: "2026-10-01",
    }] }, overdue: { projectCount: 0, matches: [] } });
    const result = publishGovernanceDraft(state, input, factories());
    const afterContext = effective(result.ok ? result.value : state);
    expect(selectDashboardAttention(input, referenceDate, afterContext)).toEqual(before);
    expect(resolveScheduleDefinitions(afterContext, item.localDefinitions).find(definition => definition.id === local.id)?.milestoneTypeId).toBe("type-smt");
    expect(result).toMatchObject({ ok: false, code: "duplicate-id" });
  });

  it("allows_same_name_with_distinct_definition_ids", () => {
    const definition = publicDefinition(toMilestoneDefinitionId("public-distinct-identity"), local.name);
    const state = publicDraft(definition);
    const input = completePrototype(localPublished());
    const before = structuredClone({ state, input });
    expect(previewGovernancePublish(state, input).blockingIssues).toEqual([]);
    const next = value(publishGovernanceDraft(state, input, factories()));
    const definitions = resolveScheduleDefinitions(effective(next), input.schedules[0].localDefinitions);
    expect(definitions.filter(item => item.name === "Local acceptance").map(item => [item.id, item.milestoneTypeId])).toEqual([
      ["public-distinct-identity", "type-smt"], ["local-fix-boundary", "type-test"],
    ]);
    expect(next.releases[1].definitions.at(-1)).toEqual(definition);
    expect({ state, input }).toEqual(before);
  });

  it("allows_existing_public_membership_setting_changes_without_local_collision", () => {
    const state = candidate(retire(), {
      portfolioColumnDefinitionIds: [y], additionalAttentionDefinitionIds: [y], newProjectRequirementDefinitionIds: [y],
    });
    const input = completePrototype();
    const before = structuredClone({ state, input });
    expect(previewGovernancePublish(state, input).blockingIssues).toEqual([]);
    const next = value(publishGovernanceDraft(state, input, factories()));
    expect(next.releases[1]).toMatchObject({
      definitions: baseline.releases[0].definitions,
      portfolioColumnDefinitionIds: [y], additionalAttentionDefinitionIds: [y], newProjectRequirementDefinitionIds: [y],
    });
    expect(next.releases[1].addableDefinitionIds).not.toContain(x);
    expect(next.releases[1].addableDefinitionIds).toContain(y);
    expect({ state, input }).toEqual(before);
  });

  it("preview_and_publish_share_the_same_collision_validation", () => {
    const prior = value(publishGovernanceDraft(withdraw(retire(drafting(enrolled()))), prototype(schedule()), factories("prior")));
    const state = assign(publicDraft(publicDefinition(), drafting(prior)), [{ projectId, milestoneDefinitionId: y }]);
    const input = completePrototype();
    const before = structuredClone({ state, input });
    expect(state.requirementEnrollments).toHaveLength(1);
    expect(state.requirementWithdrawals).toHaveLength(1);
    expect(state.retiredDraftOccurrenceGrants).toHaveLength(1);
    let allocations = 0;
    const ids = factories();
    const injected: GovernanceCommandFactories = {
      createReleaseId: () => { allocations++; return ids.createReleaseId(); },
      createEnrollmentId: () => { allocations++; return ids.createEnrollmentId(); },
      createWithdrawalId: () => { allocations++; return ids.createWithdrawalId(); },
      nowIso: () => { allocations++; return ids.nowIso(); },
    };
    const preview = previewGovernancePublish(state, input);
    const result = publishGovernanceDraft(state, input, injected);
    expect(result).toEqual({ ok: false, code: "duplicate-id", issues: preview.blockingIssues });
    expect(preview.blockingIssues).toEqual([expect.objectContaining({ code: "duplicate-id", target: { section: "definitions", entityId: local.id } })]);
    expect(allocations).toBe(0);
    expect({ state, input }).toEqual(before);
  });

  it("rejects_existing_public_local_collision_across_the_full_candidate_set", () => {
    const state = candidate(drafting(), { portfolioColumnDefinitionIds: [y] });
    const input = completePrototype(localSchedule({ ...local, id: x }));
    expect(previewGovernancePublish(state, input).diff?.addedDefinitionIds).toEqual([]);
    expectCollision(state, input, x);
  });
});

describe("injected identifiers and timestamp fail atomically", () => {
  function expectReferenceCollision(state: State, input: PrototypeState, injected: GovernanceCommandFactories) {
    const before = structuredClone({ state, input });
    expect(previewGovernancePublish(state, input).blockingIssues).toEqual([]);
    expect(publishGovernanceDraft(state, input, injected)).toMatchObject({ ok: false, code: "duplicate-id" });
    expect({ state, input }).toEqual(before);
  }

  it("rejects release ID collision with a dormant enrollment assignment reference", () => {
    const initial = enrolled();
    const dormantReleaseId = toGovernanceReleaseId("future");
    const state = assign(drafting({ ...initial, requirementEnrollments: [
      { ...initial.requirementEnrollments[0], assignedByReleaseId: dormantReleaseId },
    ] }));
    expectReferenceCollision(state, prototype(schedule()), { ...factories(), createReleaseId: () => dormantReleaseId });
  });

  it("rejects release ID collision with a dormant withdrawal issuing reference", () => {
    const initial = enrolled();
    const dormantReleaseId = toGovernanceReleaseId("future");
    const state = drafting({ ...initial, requirementWithdrawals: [{
      id: toRequirementWithdrawalId("dormant-withdrawal"),
      enrollmentId: initial.requirementEnrollments[0].id,
      withdrawnByReleaseId: dormantReleaseId,
    }] });
    const input = prototype(schedule());
    expect(previewGovernancePublish(state, input).proposedWithdrawalEnrollmentIds).toEqual([]);
    expectReferenceCollision(state, input, { ...factories(), createReleaseId: () => dormantReleaseId });
  });

  it("rejects enrollment ID collision with a retained dangling withdrawal target", () => {
    const targetId = toRequirementEnrollmentId("new-enrollment");
    const state = assign(drafting({ ...baseline, requirementWithdrawals: [{
      id: toRequirementWithdrawalId("retained-withdrawal"),
      enrollmentId: targetId,
      withdrawnByReleaseId: baseline.currentReleaseId,
    }] }));
    expectReferenceCollision(state, prototype(schedule()), { ...factories(), createEnrollmentId: () => targetId });
  });

  it("rejects release ID collision with a dormant D1 grant issuing reference", () => {
    const dormantReleaseId = toGovernanceReleaseId("future");
    const state = retire(drafting({ ...baseline, retiredDraftOccurrenceGrants: [{
      projectId,
      workingDraftId: draftId,
      milestoneId: occurrence().milestoneId,
      milestoneDefinitionId: x,
      retiredByReleaseId: dormantReleaseId,
    }] }));
    const input = prototype(createEmptyCanonicalProjectSchedule(projectId));
    expect(previewGovernancePublish(state, input).proposedRetiredDraftOccurrenceGrants).toEqual([]);
    expectReferenceCollision(state, input, { ...factories(), createReleaseId: () => dormantReleaseId });
  });

  it.each(["release", "enrollment-stored", "enrollment-batch", "withdrawal-stored", "withdrawal-batch", "blank-release", "blank-enrollment", "blank-withdrawal", "invalid-time", "impossible-time"])("rejects %s", problem => {
    const two = value(publishGovernanceDraft(assign(drafting(), [{ projectId, milestoneDefinitionId: x }, { projectId: secondProjectId, milestoneDefinitionId: x }]), emptyPrototype, factories("stored")));
    let state = assign(withdraw(drafting(two), two.requirementEnrollments.map(e => e.id)), [{ projectId, milestoneDefinitionId: x }, { projectId: secondProjectId, milestoneDefinitionId: x }]);
    let injected = factories();
    if (problem === "release") injected = { ...injected, createReleaseId: () => two.currentReleaseId };
    if (problem === "enrollment-stored") injected = { ...injected, createEnrollmentId: () => two.requirementEnrollments[0].id };
    if (problem === "enrollment-batch") injected = { ...injected, createEnrollmentId: () => toRequirementEnrollmentId("repeated") };
    if (problem === "withdrawal-batch") injected = { ...injected, createWithdrawalId: () => toRequirementWithdrawalId("repeated") };
    if (problem === "withdrawal-stored") {
      state = { ...state, requirementWithdrawals: [{ id: toRequirementWithdrawalId("stored-withdrawal"), enrollmentId: toRequirementEnrollmentId("historical"), withdrawnByReleaseId: baseline.currentReleaseId }], requirementEnrollments: [...state.requirementEnrollments, { ...state.requirementEnrollments[0], id: toRequirementEnrollmentId("historical") }] };
      injected = { ...injected, createWithdrawalId: () => toRequirementWithdrawalId("stored-withdrawal") };
    }
    if (problem === "blank-release") injected = { ...injected, createReleaseId: () => "" as never };
    if (problem === "blank-enrollment") injected = { ...injected, createEnrollmentId: () => "" as never };
    if (problem === "blank-withdrawal") injected = { ...injected, createWithdrawalId: () => "" as never };
    if (problem === "invalid-time") injected = { ...injected, nowIso: () => "yesterday" };
    if (problem === "impossible-time") injected = { ...injected, nowIso: () => "2026-02-30T01:02:03.000Z" };
    const before = structuredClone({ state, input: emptyPrototype });
    expect(previewGovernancePublish(state, emptyPrototype).blockingIssues).toEqual([]);
    expect(publishGovernanceDraft(state, emptyPrototype, injected)).toMatchObject({ ok: false, code: problem.startsWith("blank") || problem.endsWith("time") ? "invalid-reference" : "duplicate-id" });
    expect({ state, input: emptyPrototype }).toEqual(before);
  });
});
