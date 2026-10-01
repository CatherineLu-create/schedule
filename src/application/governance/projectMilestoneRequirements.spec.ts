import { describe, expect, it } from "vitest";
import type { CommandResult, MilestoneGovernanceRuntimeState } from "../../domain/governance/milestoneGovernance";
import { createEmptyCanonicalProjectSchedule, type CanonicalProjectSchedule, type CanonicalPublishedScheduleMilestone } from "../../domain/schedule/officialSchedule";
import { toScheduleVersionNumber } from "../../domain/schedule/schedule";
import { parseDateOnly } from "../../domain/shared/dateOnly";
import { toCanonicalScheduleWorkingDraftId, toGovernanceDraftId, toGovernanceReleaseId, toMilestoneDefinitionId, toMilestoneId, toRequirementEnrollmentId, toRequirementWithdrawalId } from "../../domain/shared/ids";
import { devProject001 } from "../../fixtures/v2/canonicalProjectFixtures";
import { publishScheduleWorkingDraft, startScheduleWorkingDraft } from "../commands/canonicalScheduleCommands";
import { selectDashboardAttention } from "../selectors/dashboardAttention";
import { selectEffectiveMilestoneGovernanceContext } from "./effectiveMilestoneGovernanceContext";
import { createInitialMilestoneGovernanceRuntimeState } from "./milestoneGovernanceInitializer";
import { publishGovernanceDraft, startGovernanceDraft, updateGovernanceDraft } from "./milestoneGovernanceCommands";
import { selectEffectiveProjectMilestoneRequirements } from "./projectMilestoneRequirements";

const initial = createInitialMilestoneGovernanceRuntimeState();
const x = initial.releases[0].addableDefinitionIds[0];
const y = initial.releases[0].addableDefinitionIds[1];
const enrollment = { id: toRequirementEnrollmentId("assigned-x"), projectId: devProject001.id,
  milestoneDefinitionId: x, assignedByReleaseId: initial.currentReleaseId, source: "explicit-existing-project" as const };
const assigned = { ...initial, requirementEnrollments: [enrollment] };
const empty = createEmptyCanonicalProjectSchedule(devProject001.id);
const prototype = (schedule = empty) => ({ projects: [devProject001], schedules: [schedule] });
function row(applicability: "applicable" | "notApplicable" = "applicable", id = "row-x", definitionId = x): CanonicalPublishedScheduleMilestone {
  return { milestoneId: toMilestoneId(id), milestoneDefinitionId: definitionId, applicability, plan: null, actual: null };
}
function version(number: number, milestones: readonly CanonicalPublishedScheduleMilestone[]) {
  return { versionNumber: toScheduleVersionNumber(number), versionNote: null, publishedAt: "2026-10-01T00:00:00Z", milestones };
}
const draft = (milestones: readonly CanonicalPublishedScheduleMilestone[]) => ({
  workingDraftId: toCanonicalScheduleWorkingDraftId("working"), milestones, reviewSessionIds: [], importCandidates: [],
});
function value<T>(result: CommandResult<T, string>): T {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}
function publish(state: MilestoneGovernanceRuntimeState, id: string, schedule = empty) {
  return value(publishGovernanceDraft(state, prototype(schedule), {
    createReleaseId: () => toGovernanceReleaseId(id),
    createEnrollmentId: () => toRequirementEnrollmentId(`${id}-enrollment`),
    createWithdrawalId: () => toRequirementWithdrawalId(`${id}-withdrawal`),
    nowIso: () => "2026-10-01T00:00:00Z",
  }));
}

describe("effective Project requirements from release history and Current Published", () => {
  // Mutations: use Draft/history/array order instead of exact latest Published, or cache completion.
  it.each([
    ["latest exact applicable", [version(1, []), version(3, [row()]), version(2, [])], null, "adopted"],
    ["latest explicit N/A", [version(2, [row("notApplicable")]), version(1, [row()])], null, "notApplicable"],
    ["missing exact definition", [version(2, [row("applicable", "other", y)])], null, "pending"],
    ["Draft-only", [], draft([row()]), "pending"],
    ["latest Published removal reopens", [version(3, []), version(2, [row()])], null, "pending"],
    ["Draft removal preserves official adoption", [version(2, [row()])], draft([]), "adopted"],
    ["Draft adoption does not override official N/A", [version(2, [row("notApplicable")])], draft([row()]), "notApplicable"],
    ["repeated rows with any applicable", [version(2, [row("notApplicable"), row("applicable", "repeat")])], null, "adopted"],
    ["repeated explicit N/A rows", [version(2, [row("notApplicable"), row("notApplicable", "repeat")])], null, "notApplicable"],
  ] as const)("%s", (_name, publishedVersions, workingDraft, status) => {
    const input = prototype({ ...empty, publishedVersions, workingDraft });
    const before = structuredClone({ input, assigned });
    expect(selectEffectiveProjectMilestoneRequirements(input, assigned)).toEqual([{
      enrollmentId: enrollment.id, projectId: devProject001.id, milestoneDefinitionId: x,
      assignedByReleaseId: initial.currentReleaseId, status,
    }]);
    expect({ input, assigned }).toEqual(before);
  });

  it.each([false, true])("same-name local-only never completes a public requirement (invalid local target: %s)", invalidTarget => {
    const localId = toMilestoneDefinitionId("same-name-local");
    const definition = initial.releases[0].definitions.find(item => item.id === x)!;
    const schedule: CanonicalProjectSchedule = { ...empty, publishedVersions: [version(1, [row("applicable", "local", localId)])],
      localDefinitions: [{ id: localId, name: definition.name, stageGroupId: definition.stageGroupId,
        milestoneTypeId: definition.milestoneTypeId, displayOrder: 1, source: "manual", confirmation: "confirmed", evidenceIds: [] }] };
    const state = invalidTarget ? { ...assigned, requirementEnrollments: [{ ...enrollment, milestoneDefinitionId: localId }] } : assigned;
    expect(selectEffectiveProjectMilestoneRequirements(prototype(schedule), state)[0].status).toBe("pending");
  });

  it("does not infer assignments from existing Projects, missing rows, Year, Stage or governance Draft", () => {
    const started = value(startGovernanceDraft(initial, toGovernanceDraftId("unpublished")));
    const edited = value(updateGovernanceDraft(started, { kind: "replace-existing-project-assignments",
      assignments: [{ projectId: devProject001.id, milestoneDefinitionId: x }] }));
    expect(selectEffectiveProjectMilestoneRequirements(prototype(), edited)).toEqual([]);
    expect(selectEffectiveProjectMilestoneRequirements(prototype(), publish(edited, "assigned"))).toEqual([
      expect.objectContaining({ projectId: devProject001.id, milestoneDefinitionId: x, status: "pending" }),
    ]);
  });

  it("cuts off assignment and withdrawal history at currentReleaseId and ignores unknown releases and Draft withdrawals", () => {
    const current = { ...initial.releases[0], id: toGovernanceReleaseId("current") };
    const future = { ...current, id: toGovernanceReleaseId("future") };
    const unknown = toGovernanceReleaseId("unknown");
    const kept = { ...enrollment, id: toRequirementEnrollmentId("kept"), milestoneDefinitionId: y, assignedByReleaseId: current.id };
    const state: MilestoneGovernanceRuntimeState = { ...assigned, releases: [...initial.releases, current, future], currentReleaseId: current.id,
      requirementEnrollments: [enrollment, kept,
        { ...enrollment, id: toRequirementEnrollmentId("future"), assignedByReleaseId: future.id },
        { ...enrollment, id: toRequirementEnrollmentId("unknown"), assignedByReleaseId: unknown }],
      requirementWithdrawals: [
        { id: toRequirementWithdrawalId("effective"), enrollmentId: enrollment.id, withdrawnByReleaseId: current.id },
        { id: toRequirementWithdrawalId("future"), enrollmentId: kept.id, withdrawnByReleaseId: future.id },
        { id: toRequirementWithdrawalId("unknown"), enrollmentId: kept.id, withdrawnByReleaseId: unknown },
      ] };
    const withDraft = value(updateGovernanceDraft(value(startGovernanceDraft(state, toGovernanceDraftId("draft"))), {
      kind: "replace-withdrawals", enrollmentIds: [kept.id],
    }));
    const before = structuredClone(withDraft);
    expect(selectEffectiveProjectMilestoneRequirements(prototype(), withDraft).map(item => item.enrollmentId)).toEqual([kept.id]);
    expect(selectEffectiveProjectMilestoneRequirements(prototype(), { ...withDraft, currentReleaseId: initial.currentReleaseId })
      .map(item => item.enrollmentId)).toEqual([enrollment.id]);
    expect(withDraft).toEqual(before);
  });

  it.each(["applicable", "notApplicable"] as const)("retarget after withdrawal derives current %s without PM redo", applicability => {
    const schedule = { ...empty, publishedVersions: [version(2, [row(applicability)])] };
    const withdrawing = value(updateGovernanceDraft(value(startGovernanceDraft(assigned, toGovernanceDraftId("withdraw"))), {
      kind: "replace-withdrawals", enrollmentIds: [enrollment.id],
    }));
    const withdrawn = publish(withdrawing, "withdrawn", schedule);
    expect(selectEffectiveProjectMilestoneRequirements(prototype(schedule), withdrawn)).toEqual([]);
    const assigning = value(updateGovernanceDraft(value(startGovernanceDraft(withdrawn, toGovernanceDraftId("retarget"))), {
      kind: "replace-existing-project-assignments", assignments: [{ projectId: devProject001.id, milestoneDefinitionId: x }],
    }));
    const next = publish(assigning, "retargeted", schedule);
    expect(next.requirementEnrollments).toHaveLength(2);
    expect(next.requirementEnrollments[0]).toEqual(enrollment);
    expect(selectEffectiveProjectMilestoneRequirements(prototype(schedule), next)).toEqual([
      { enrollmentId: "retargeted-enrollment", projectId: devProject001.id, milestoneDefinitionId: x,
        assignedByReleaseId: "retargeted", status: applicability === "applicable" ? "adopted" : "notApplicable" },
    ]);
  });

  it("withdrawal removes only the requirement and preserves Schedule and Attention", () => {
    const scheduledRow = { ...row(), plan: parseDateOnly("2026-09-30") };
    const schedule = { ...empty, publishedVersions: [version(2, [scheduledRow])] };
    const input = prototype(schedule);
    const monitored = { ...assigned, releases: [{ ...initial.releases[0], additionalAttentionDefinitionIds: [x] }] };
    const before = structuredClone(input);
    const attention = selectDashboardAttention(input, parseDateOnly("2026-10-01")!, value(selectEffectiveMilestoneGovernanceContext(monitored)));
    expect(attention).toMatchObject({ kind: "available", overdue: { projectCount: 1 } });
    const withdrawing = value(updateGovernanceDraft(value(startGovernanceDraft(monitored, toGovernanceDraftId("withdraw"))), {
      kind: "replace-withdrawals", enrollmentIds: [enrollment.id],
    }));
    const next = publish(withdrawing, "withdrawn", schedule);
    expect(selectEffectiveProjectMilestoneRequirements(input, next)).toEqual([]);
    expect(selectDashboardAttention(input, parseDateOnly("2026-10-01")!, value(selectEffectiveMilestoneGovernanceContext(next)))).toEqual(attention);
    expect(input).toEqual(before);
  });

  it("reopened pending adds no Attention, occurrence, N/A or Publish blocker", () => {
    const schedule = { ...empty, publishedVersions: [version(2, [row()]), version(3, [])] };
    const input = prototype(schedule);
    const before = structuredClone(input);
    expect(selectEffectiveProjectMilestoneRequirements(input, assigned)[0].status).toBe("pending");
    const context = value(selectEffectiveMilestoneGovernanceContext(assigned));
    expect(selectDashboardAttention(input, parseDateOnly("2026-10-01")!, context)).toMatchObject({
      kind: "available", due: { projectCount: 0, matches: [] }, overdue: { projectCount: 0, matches: [] },
    });
    const commandContext = { governance: context, localDefinitions: [], retiredDraftOccurrenceGrants: [] };
    const started = startScheduleWorkingDraft(schedule, { workingDraftId: toCanonicalScheduleWorkingDraftId("next") }, commandContext);
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error(JSON.stringify(started));
    const published = publishScheduleWorkingDraft(started.schedule, { publishedAt: "2026-10-01T00:00:00Z" }, commandContext);
    expect(published).toMatchObject({ ok: true, version: { versionNumber: 4, milestones: [] } });
    expect(input).toEqual(before);
  });

  it("pending survives missing saved QCI PM and adds no PM or completion authority", () => {
    const input = { ...prototype(), projects: [{ ...devProject001, team: null }] };
    const before = structuredClone(input);
    expect(selectEffectiveProjectMilestoneRequirements(input, assigned)).toEqual([{
      enrollmentId: enrollment.id, projectId: devProject001.id, milestoneDefinitionId: x,
      assignedByReleaseId: initial.currentReleaseId, status: "pending",
    }]);
    expect(input).toEqual(before);
  });

  it("fails explicitly for duplicate effective Project/Definition without repairing history", () => {
    const state = { ...assigned, requirementEnrollments: [enrollment, { ...enrollment, id: toRequirementEnrollmentId("duplicate-pair") }] };
    const before = structuredClone(state);
    expect(() => selectEffectiveProjectMilestoneRequirements(prototype(), state)).toThrow(/effective requirement/i);
    expect(state).toEqual(before);
  });
});
