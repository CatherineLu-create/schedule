import { describe, expect, it } from "vitest";
import type { CommandResult, MilestoneGovernanceRuntimeState } from "../../domain/governance/milestoneGovernance";
import { createEmptyCanonicalProjectSchedule, type CanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import { toScheduleVersionNumber } from "../../domain/schedule/schedule";
import { toCanonicalScheduleWorkingDraftId, toGovernanceDraftId, toGovernanceReleaseId, toMilestoneDefinitionId, toRequirementEnrollmentId, toRequirementWithdrawalId, toScheduleEvidenceId, toScheduleReviewSessionId, type RequirementEnrollmentId } from "../../domain/shared/ids";
import { devProject001, devProject002 } from "../../fixtures/v2/canonicalProjectFixtures";
import { prototypeReducer } from "../state/prototypeReducer";
import type { PrototypeState } from "../state/prototypeState";
import { selectEffectiveMilestoneGovernanceContext } from "./effectiveMilestoneGovernanceContext";
import { createInitialMilestoneGovernanceRuntimeState } from "./milestoneGovernanceInitializer";
import { publishGovernanceDraft, startGovernanceDraft, updateGovernanceDraft } from "./milestoneGovernanceCommands";
import { prepareProjectCreationCommit } from "./projectCreationGovernance";
import { selectEffectiveProjectMilestoneRequirements } from "./projectMilestoneRequirements";

const baseline = createInitialMilestoneGovernanceRuntimeState();
const [x, y] = baseline.releases[0].addableDefinitionIds;
const input = { project: devProject002, schedule: createEmptyCanonicalProjectSchedule(devProject002.id) };
const prototype: PrototypeState = { projects: [devProject001], schedules: [createEmptyCanonicalProjectSchedule(devProject001.id)] };
function value<T>(result: CommandResult<T, string>): T {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}
function release(state = baseline, requirements = [x], id = "creation-release") {
  const started = value(startGovernanceDraft(state, toGovernanceDraftId(`${id}-draft`)));
  const edited = value(updateGovernanceDraft(started, { kind: "replace-candidate-release", candidateRelease: {
    ...started.draft!.candidateRelease, newProjectRequirementDefinitionIds: requirements,
  } }));
  return value(publishGovernanceDraft(edited, prototype, {
    createReleaseId: () => toGovernanceReleaseId(id), createEnrollmentId: () => toRequirementEnrollmentId("unused"),
    createWithdrawalId: () => toRequirementWithdrawalId("unused"), nowIso: () => "2026-10-01T00:00:00Z",
  }));
}
function ids(...values: string[]): () => RequirementEnrollmentId {
  let index = 0;
  return () => toRequirementEnrollmentId(values[index++] ?? "unexpected-extra-allocation");
}
function rejects(state: MilestoneGovernanceRuntimeState, code: string, current = prototype, next = input, allocate = ids("one", "two")) {
  const before = structuredClone({ current, state, next });
  const result = prepareProjectCreationCommit(current, state, next, allocate);
  expect(result).toMatchObject({ ok: false, code, issues: [expect.objectContaining({ severity: "blocking" })] });
  expect(result).not.toHaveProperty("value");
  expect({ current, state, next }).toEqual(before);
}

describe("failure-atomic Project creation governance preparation", () => {
  // Mutations: use bundled/Draft/future requirements, recompute existing Projects, omit one prepared transition.
  it("new_project_enrolls_requirements_from_release_effective_at_successful_creation", () => {
    const creation = release(baseline, [x, y]);
    const future = release(creation, [], "future");
    const state = { ...creation, releases: future.releases };
    const drafted = value(updateGovernanceDraft(value(startGovernanceDraft(state, toGovernanceDraftId("unpublished"))), {
      kind: "replace-candidate-release", candidateRelease: { ...creation.releases[1], newProjectRequirementDefinitionIds: [] },
    }));
    const before = structuredClone({ prototype, drafted, input });
    const prepared = value(prepareProjectCreationCommit(prototype, drafted, input, ids("create-x", "create-y")));
    expect(prepared.prototypeAction).toEqual({ type: "projectAdded", ...input });
    expect(prepared.governanceState.requirementEnrollments).toEqual([
      { id: "create-x", projectId: devProject002.id, milestoneDefinitionId: x, assignedByReleaseId: "creation-release", source: "new-project-at-creation" },
      { id: "create-y", projectId: devProject002.id, milestoneDefinitionId: y, assignedByReleaseId: "creation-release", source: "new-project-at-creation" },
    ]);
    const committed = prototypeReducer(prototype, prepared.prototypeAction);
    expect(committed.projects).toHaveLength(2);
    expect(committed.schedules[1]).toEqual(input.schedule);
    expect(selectEffectiveProjectMilestoneRequirements(committed, prepared.governanceState).map(item => item.status)).toEqual(["pending", "pending"]);
    expect(prepared.governanceState.draft).toBe(drafted.draft);
    expect({ prototype, drafted, input }).toEqual(before);
    expect(input.project).not.toHaveProperty("createdAt");
  });

  it("later releases change Select but neither retroactively enroll existing Projects nor change creation source", () => {
    const creation = release();
    const prepared = value(prepareProjectCreationCommit(prototype, creation, input, ids("created")));
    const committed = prototypeReducer(prototype, prepared.prototypeAction);
    const started = value(startGovernanceDraft(prepared.governanceState, toGovernanceDraftId("later")));
    const edited = value(updateGovernanceDraft(started, { kind: "replace-candidate-release", candidateRelease: {
      ...started.draft!.candidateRelease, addableDefinitionIds: [y], newProjectRequirementDefinitionIds: [y],
    } }));
    // Preserve X Add eligibility while pending; change Select by dropping other released choices.
    const legal = value(updateGovernanceDraft(edited, { kind: "replace-candidate-release", candidateRelease: {
      ...edited.draft!.candidateRelease, addableDefinitionIds: [x, y],
    } }));
    const later = value(publishGovernanceDraft(legal, committed, {
      createReleaseId: () => toGovernanceReleaseId("later"), createEnrollmentId: ids("must-not-enroll"),
      createWithdrawalId: () => toRequirementWithdrawalId("unused"), nowIso: () => "2026-10-01T01:00:00Z",
    }));
    expect(later.requirementEnrollments).toEqual(prepared.governanceState.requirementEnrollments);
    expect(selectEffectiveProjectMilestoneRequirements(committed, later)).toEqual([
      { enrollmentId: "created", projectId: devProject002.id, milestoneDefinitionId: x, assignedByReleaseId: "creation-release", status: "pending" },
    ]);
    expect(value(selectEffectiveMilestoneGovernanceContext(later)).addablePublicDefinitions.map(item => item.id)).toEqual([x, y]);
    expect(value(selectEffectiveMilestoneGovernanceContext(later)).newProjectRequirementDefinitionIds).toEqual(new Set([y]));
  });

  it("zero requirements creates the empty Schedule and no enrollment", () => {
    const prepared = value(prepareProjectCreationCommit(prototype, baseline, input, () => { throw new Error("No enrollment should be allocated"); }));
    expect(prototypeReducer(prototype, prepared.prototypeAction).schedules[1]).toEqual(input.schedule);
    expect(prepared.governanceState.requirementEnrollments).toEqual([]);
    expect(selectEffectiveProjectMilestoneRequirements(prototype, prepared.governanceState)).toEqual([]);
  });

  it("project ID collision returns no transition", () => rejects(release(), "project-already-exists", { ...prototype, projects: [...prototype.projects, input.project] }));
  it("Schedule owner collision returns no transition", () => rejects(release(), "schedule-owner-already-exists", { ...prototype, schedules: [...prototype.schedules, input.schedule] }));
  it("Schedule owner mismatch returns no transition", () => rejects(release(), "invalid-empty-schedule", prototype,
    { ...input, schedule: createEmptyCanonicalProjectSchedule(devProject001.id) }));
  it("embedded Schedule cannot reach the reducer", () => rejects(release(), "invalid-empty-schedule", prototype,
    { ...input, project: Object.assign({}, input.project, { schedule: input.schedule }) }));

  const scheduleCases: ReadonlyArray<readonly [string, Partial<CanonicalProjectSchedule>]> = [
    ["Published", { publishedVersions: [{ versionNumber: toScheduleVersionNumber(1), versionNote: null, publishedAt: "2026-10-01T00:00:00Z", milestones: [] }] }],
    ["Draft", { workingDraft: { workingDraftId: toCanonicalScheduleWorkingDraftId("not-empty"), milestones: [], reviewSessionIds: [], importCandidates: [] } }],
    ["local definitions", { localDefinitions: [{ ...baseline.releases[0].definitions[0], source: "manual", confirmation: "confirmed", evidenceIds: [] }] }],
    ["evidence", { evidenceLedger: [{ id: toScheduleEvidenceId("evidence"), sourceKind: "built-in-simulation", sourceDescriptor: "test", candidateFingerprint: "test",
      rawValues: { milestoneName: { presence: "missing" }, stage: { presence: "missing" }, milestoneType: { presence: "missing" }, plan: { presence: "missing" }, actual: { presence: "missing" }, applicability: { presence: "missing" } } }] }],
    ["sessions", { reviewSessions: [{ id: toScheduleReviewSessionId("session"), workingDraftId: toCanonicalScheduleWorkingDraftId("draft"), source: "manual-local-mapping", evidenceIds: [] }] }],
    ["closures", { reviewClosures: [{ sessionId: toScheduleReviewSessionId("session"), kind: "discarded" }] }],
  ];
  it.each(scheduleCases)("rejects nonempty %s", (_name, patch) => rejects(release(), "invalid-empty-schedule", prototype, { ...input, schedule: { ...input.schedule, ...patch } }));

  it.each(["missing", "duplicate-current", "invalid-current-reference"])("rejects %s release without state changes", kind => {
    const current = release();
    const state = kind === "missing" ? { ...current, currentReleaseId: toGovernanceReleaseId("absent") }
      : kind === "duplicate-current" ? { ...current, releases: [...current.releases, current.releases[1]] }
      : { ...current, releases: [current.releases[0], { ...current.releases[1], portfolioColumnDefinitionIds: [toMilestoneDefinitionId("absent")] }] };
    rejects(state, "missing-current-release");
  });
  it.each(["unknown", "not-addable", "duplicate", "unreviewed", "inactive"])("rejects %s new-project requirement before allocating", kind => {
    const current = release();
    const active = current.releases[1];
    const changed = kind === "unknown" ? { ...active, newProjectRequirementDefinitionIds: [toMilestoneDefinitionId("unknown")] }
      : kind === "not-addable" ? { ...active, addableDefinitionIds: active.addableDefinitionIds.filter(id => id !== x) }
      : kind === "duplicate" ? { ...active, newProjectRequirementDefinitionIds: [x, x] }
      : { ...active, definitions: active.definitions.map(definition => definition.id !== x ? definition : {
        ...definition, ...(kind === "inactive" ? { active: false } : { reviewStatus: "unreviewed" as const }),
      }) };
    rejects({ ...current, releases: [current.releases[0], changed] }, "invalid-new-project-requirement", prototype, input,
      () => { throw new Error("Invalid requirements must be rejected before ID allocation"); });
  });

  it.each(["stored-enrollment", "unknown-release-enrollment", "stored-withdrawal", "unknown-release-withdrawal", "draft-withdrawal", "batch", "blank"])(
    "one valid ID followed by %s collision leaves all inputs untouched", kind => {
      const current = release(baseline, [x, y]);
      const reserved = toRequirementEnrollmentId("reserved");
      const unknownRelease = toGovernanceReleaseId("unknown");
      const state = kind.endsWith("enrollment") ? { ...current, requirementEnrollments: [{
        id: reserved, projectId: devProject001.id, milestoneDefinitionId: x, source: "explicit-existing-project" as const,
        assignedByReleaseId: kind === "stored-enrollment" ? current.currentReleaseId : unknownRelease,
      }] } : kind.endsWith("withdrawal") && kind !== "draft-withdrawal" ? { ...current, requirementWithdrawals: [{
        id: toRequirementWithdrawalId("withdrawal"), enrollmentId: reserved,
        withdrawnByReleaseId: kind === "stored-withdrawal" ? current.currentReleaseId : unknownRelease,
      }] } : kind === "draft-withdrawal" ? value(updateGovernanceDraft(value(startGovernanceDraft(current, toGovernanceDraftId("draft"))), {
        kind: "replace-withdrawals", enrollmentIds: [reserved],
      })) : current;
      const allocate = ids("first-valid", kind === "batch" ? "first-valid" : reserved);
      let allocated = 0;
      // Intentionally malformed factory output; the normal opaque-ID boundary rejects blanks itself.
      rejects(state, "duplicate-enrollment-id", prototype, input, () =>
        kind === "blank" && allocated++ > 0 ? " " as RequirementEnrollmentId : allocate());
    },
  );

  it("opaque ID namespaces are independent", () => {
    const state = release();
    const prepared = value(prepareProjectCreationCommit(prototype, state, input, ids(input.project.id)));
    expect(prepared.governanceState.requirementEnrollments[0].id).toBe(input.project.id);
  });
});
