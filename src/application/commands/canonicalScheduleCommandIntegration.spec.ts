import { expect, it } from "vitest";

import { milestoneDefinitions } from "../../config/v2/referenceData";
import {
  createEmptyCanonicalProjectSchedule,
  type CanonicalProjectSchedule,
} from "../../domain/schedule/officialSchedule";
import type { ScheduleImportCandidate } from "../../domain/schedule/scheduleReview";
import { toScheduleVersionNumber } from "../../domain/schedule/schedule";
import { parseDateOnly } from "../../domain/shared/dateOnly";
import {
  toCanonicalScheduleWorkingDraftId,
  toMilestoneDefinitionId,
  toMilestoneId,
  toScheduleEvidenceId,
  toScheduleImportCandidateId,
  toScheduleReviewSessionId,
  type ProjectId,
} from "../../domain/shared/ids";
import {
  devProject001,
  devProject003,
} from "../../fixtures/v2/canonicalProjectFixtures";
import { resolveCanonicalScheduleOwner } from "../selectors/scheduleSelectors";
import { prototypeReducer } from "../state/prototypeReducer";
import type { PrototypeState } from "../state/prototypeState";
import {
  addScheduleWorkingDraftMilestone,
  cancelScheduleWorkingDraft,
  publishScheduleWorkingDraft,
  removeScheduleWorkingDraftMilestone,
  startScheduleWorkingDraft,
  updateScheduleWorkingDraftMilestone,
  type CanonicalScheduleCommandContext,
} from "./canonicalScheduleCommands";

const context: CanonicalScheduleCommandContext = { milestoneDefinitions };
const draftIdentity = {
  workingDraftId: toCanonicalScheduleWorkingDraftId("integration-draft"),
  reviewSessionIds: [],
  importCandidates: [],
};
const integrationPlan = parseDateOnly("2026-10-05");
if (integrationPlan === null) throw new Error("Invalid integration DateOnly");

const integrationMilestone = Object.freeze({
  milestoneId: toMilestoneId("integration-current"),
  milestoneDefinitionId: toMilestoneDefinitionId("milestone-design-kickoff"),
  applicability: "applicable" as const,
  plan: integrationPlan,
  actual: null,
});

const publishedScheduleForIntegration: CanonicalProjectSchedule = Object.freeze({
  ...createEmptyCanonicalProjectSchedule(devProject003.id),
  projectId: devProject003.id,
  publishedVersions: Object.freeze([
    Object.freeze({
      versionNumber: toScheduleVersionNumber(3),
      versionNote: null,
      publishedAt: "2026-09-10T00:00:00Z",
      milestones: Object.freeze([integrationMilestone]),
    }),
    Object.freeze({
      versionNumber: toScheduleVersionNumber(1),
      versionNote: null,
      publishedAt: "2026-08-25T00:00:00Z",
      milestones: Object.freeze([{ ...integrationMilestone, plan: null }]),
    }),
  ]),
  workingDraft: null,
});

function applySuccessfulReplacement(
  state: PrototypeState,
  projectId: ProjectId,
  result: { readonly ok: true; readonly schedule: CanonicalProjectSchedule },
): PrototypeState {
  return prototypeReducer(state, {
    type: "scheduleReplaced",
    projectId,
    schedule: result.schedule,
  });
}

it("applies Start, Update, Add, and Remove through exact replacement", () => {
  const unrelated = createEmptyCanonicalProjectSchedule(devProject001.id);
  const initial: PrototypeState = {
    projects: [devProject003, devProject001],
    schedules: [publishedScheduleForIntegration, unrelated],
  };
  const started = startScheduleWorkingDraft(
    publishedScheduleForIntegration,
    { workingDraftId: draftIdentity.workingDraftId },
    context,
  );
  expect(started.ok).toBe(true);
  if (!started.ok) throw new Error("Expected Start success");
  const afterStart = applySuccessfulReplacement(initial, devProject003.id, started);
  const officialHistory = publishedScheduleForIntegration.publishedVersions;
  const currentOfficialVersion = officialHistory[0]!;
  const currentOfficialMilestone = currentOfficialVersion.milestones[0]!;
  expect(afterStart.schedules[0]?.workingDraft?.milestones.slice(0, 1))
    .toEqual(publishedScheduleForIntegration.publishedVersions[0]!.milestones);
  expect(afterStart.schedules[0]?.workingDraft?.milestones).toHaveLength(1);
  expect(afterStart.schedules[0]?.workingDraft?.milestones)
    .not.toBe(publishedScheduleForIntegration.publishedVersions[0]!.milestones);
  expect(afterStart.schedules[1]).toBe(unrelated);

  const plan = parseDateOnly("2030-01-15");
  if (plan === null) throw new Error("Invalid integration DateOnly");
  const targetId = afterStart.schedules[0]!.workingDraft!.milestones[0]!.milestoneId;
  const updated = updateScheduleWorkingDraftMilestone(
    afterStart.schedules[0]!,
    { milestoneId: targetId, field: "plan", value: plan },
    context,
  );
  expect(updated.ok).toBe(true);
  if (!updated.ok) throw new Error("Expected Update success");
  const afterUpdate = applySuccessfulReplacement(afterStart, devProject003.id, updated);
  expect(afterUpdate.schedules[0]!.workingDraft!.milestones[0]!.plan).toBe(plan);

  const added = addScheduleWorkingDraftMilestone(
    afterUpdate.schedules[0]!,
    {
      milestoneId: toMilestoneId("integration-added"),
      milestoneDefinitionId: toMilestoneDefinitionId("milestone-design-kickoff"),
    },
    context,
  );
  expect(added.ok).toBe(true);
  if (!added.ok) throw new Error("Expected Add success");
  const afterAdd = applySuccessfulReplacement(afterUpdate, devProject003.id, added);
  expect(afterAdd.schedules[0]!.workingDraft!.milestones.at(-1)?.milestoneId)
    .toBe(toMilestoneId("integration-added"));
  expect(afterAdd.schedules[0]!.publishedVersions).toBe(officialHistory);
  expect(afterAdd.schedules[0]!.publishedVersions[0]).toBe(currentOfficialVersion);
  expect(afterAdd.schedules[0]!.publishedVersions[0]!.milestones[0])
    .toBe(currentOfficialMilestone);

  const removed = removeScheduleWorkingDraftMilestone(
    afterAdd.schedules[0]!,
    { milestoneId: toMilestoneId("integration-added") },
    context,
  );
  expect(removed.ok).toBe(true);
  if (!removed.ok) throw new Error("Expected Remove success");
  const afterRemove = applySuccessfulReplacement(afterAdd, devProject003.id, removed);
  expect(afterRemove.schedules[0]!.publishedVersions).toBe(officialHistory);
  expect(afterRemove.schedules[0]!.publishedVersions[0]).toBe(currentOfficialVersion);
  expect(afterRemove.schedules[0]!.publishedVersions[0]!.milestones[0])
    .toBe(currentOfficialMilestone);
  expect(afterRemove.schedules[0]!.workingDraft!.milestones)
    .toHaveLength(afterUpdate.schedules[0]!.workingDraft!.milestones.length);
  expect(afterRemove.projects).toBe(initial.projects);
  expect(afterRemove.schedules[1]).toBe(unrelated);
});

it("preserves Draft review identity and import candidates through ordinary occurrence edits", () => {
  const started = startScheduleWorkingDraft(
    publishedScheduleForIntegration,
    { workingDraftId: toCanonicalScheduleWorkingDraftId("reviewed-draft") },
    context,
  );
  expect(started.ok).toBe(true);
  if (!started.ok) throw new Error("Expected Start success");

  const reviewSessionIds = [toScheduleReviewSessionId("review-session-1")];
  const candidate: ScheduleImportCandidate = {
    id: toScheduleImportCandidateId("candidate-design-kickoff"),
    evidenceId: toScheduleEvidenceId("evidence-design-kickoff"),
    parsedPlan: { kind: "parsed", raw: "2026-10-05", value: integrationPlan },
    parsedActual: { kind: "missing" },
    parsedApplicability: { kind: "explicitApplicable", raw: "Yes" },
    proposedDefinitionMatches: [toMilestoneDefinitionId("milestone-design-kickoff")],
    rawFindings: [],
    status: "pending",
  };
  const importCandidates = [candidate];
  const expectedReviewSessionIds = [...reviewSessionIds];
  const expectedImportCandidates = structuredClone(importCandidates);
  const reviewedSchedule: CanonicalProjectSchedule = {
    ...started.schedule,
    workingDraft: { ...started.draft, reviewSessionIds, importCandidates },
  };
  const expectReviewStatePreserved = (schedule: CanonicalProjectSchedule) => {
    expect(schedule.workingDraft?.workingDraftId).toBe(started.draft.workingDraftId);
    expect(schedule.workingDraft?.reviewSessionIds).toHaveLength(1);
    expect(schedule.workingDraft?.reviewSessionIds).toEqual(expectedReviewSessionIds);
    expect(schedule.workingDraft?.importCandidates).toHaveLength(1);
    expect(schedule.workingDraft?.importCandidates).toEqual(expectedImportCandidates);
    expect(schedule.publishedVersions).toBe(publishedScheduleForIntegration.publishedVersions);
  };

  const updatedPlan = parseDateOnly("2030-01-15");
  if (updatedPlan === null) throw new Error("Invalid updated DateOnly");
  const updated = updateScheduleWorkingDraftMilestone(
    reviewedSchedule,
    { milestoneId: integrationMilestone.milestoneId, field: "plan", value: updatedPlan },
    context,
  );
  expect(updated.ok).toBe(true);
  if (!updated.ok) throw new Error("Expected Update success");
  expect(updated.draft.milestones[0]?.plan).toBe(updatedPlan);
  expectReviewStatePreserved(updated.schedule);

  const addedMilestoneId = toMilestoneId("reviewed-draft-added");
  const added = addScheduleWorkingDraftMilestone(
    updated.schedule,
    {
      milestoneId: addedMilestoneId,
      milestoneDefinitionId: toMilestoneDefinitionId("milestone-design-kickoff"),
    },
    context,
  );
  expect(added.ok).toBe(true);
  if (!added.ok) throw new Error("Expected Add success");
  expect(added.draft.milestones).toHaveLength(2);
  expect(added.draft.milestones[1]?.milestoneId).toBe(addedMilestoneId);
  expectReviewStatePreserved(added.schedule);

  const removed = removeScheduleWorkingDraftMilestone(
    added.schedule,
    { milestoneId: addedMilestoneId },
    context,
  );
  expect(removed.ok).toBe(true);
  if (!removed.ok) throw new Error("Expected Remove success");
  expect(removed.draft.milestones).toHaveLength(1);
  expect(removed.draft.milestones[0]?.milestoneId).toBe(integrationMilestone.milestoneId);
  expect(removed.draft.milestones[0]?.plan).toBe(updatedPlan);
  expectReviewStatePreserved(removed.schedule);

  expect(reviewedSchedule.workingDraft?.milestones[0]?.plan).toBe(integrationPlan);
  expect(started.draft.reviewSessionIds).toEqual([]);
  expect(started.draft.importCandidates).toEqual([]);
  expect(publishedScheduleForIntegration.workingDraft).toBeNull();
});

it("applies Publish as one appended-version-plus-null-Draft state", () => {
  const initial: PrototypeState = {
    projects: [devProject003],
    schedules: [publishedScheduleForIntegration],
  };
  const started = startScheduleWorkingDraft(
    publishedScheduleForIntegration,
    { workingDraftId: draftIdentity.workingDraftId },
    context,
  );
  expect(started.ok).toBe(true);
  if (!started.ok) throw new Error("Expected Start success");
  const withDraft = applySuccessfulReplacement(initial, devProject003.id, started);
  const published = publishScheduleWorkingDraft(
    withDraft.schedules[0]!,
    { publishedAt: "2030-01-15T00:00:00Z" },
    context,
  );
  expect(published.ok).toBe(true);
  if (!published.ok) throw new Error("Expected Publish success");
  const next = applySuccessfulReplacement(withDraft, devProject003.id, published);
  expect(next.schedules[0]!.publishedVersions.map(({ versionNumber }) => versionNumber))
    .toEqual([3, 1, 4]);
  expect(next.schedules[0]!.publishedVersions[2]?.publishedAt)
    .toBe("2030-01-15T00:00:00Z");
  expect(next.schedules[0]!.workingDraft).toBeNull();
  expect(withDraft.schedules[0]!.publishedVersions).toEqual(
    publishedScheduleForIntegration.publishedVersions,
  );
  expect(withDraft.schedules[0]!.workingDraft).not.toBeNull();

  const beforeSecond = next;
  expect(publishScheduleWorkingDraft(
    next.schedules[0]!,
    { publishedAt: "2030-01-16T00:00:00Z" },
    context,
  )).toEqual({ ok: false, reason: "no-working-draft", issues: [] });
  expect(next).toBe(beforeSecond);
  expect(next.schedules[0]!.publishedVersions).toHaveLength(3);
});

it("applies Cancel once and leaves Published history untouched", () => {
  const started = startScheduleWorkingDraft(
    publishedScheduleForIntegration,
    { workingDraftId: draftIdentity.workingDraftId },
    context,
  );
  expect(started.ok).toBe(true);
  if (!started.ok) throw new Error("Expected Start success");
  const current: PrototypeState = {
    projects: [devProject003],
    schedules: [started.schedule],
  };
  const cancelled = cancelScheduleWorkingDraft(started.schedule);
  expect(cancelled.ok).toBe(true);
  if (!cancelled.ok) throw new Error("Expected Cancel success");
  const next = applySuccessfulReplacement(current, devProject003.id, cancelled);
  expect(next.schedules[0]!.workingDraft).toBeNull();
  expect(next.schedules[0]!.publishedVersions)
    .toBe(started.schedule.publishedVersions);
  expect(cancelScheduleWorkingDraft(next.schedules[0]!)).toEqual({
    ok: false,
    reason: "no-working-draft",
    issues: [],
  });
});

it("publishes an empty no-Published Draft as v1 through one replacement", () => {
  const empty = createEmptyCanonicalProjectSchedule(devProject003.id);
  const initial: PrototypeState = {
    projects: [devProject003],
    schedules: [empty],
  };
  const started = startScheduleWorkingDraft(empty, { workingDraftId: draftIdentity.workingDraftId }, context);
  expect(started.ok).toBe(true);
  if (!started.ok) throw new Error("Expected Start success");
  expect(started.draft.milestones).toEqual([]);
  const withDraft = applySuccessfulReplacement(initial, devProject003.id, started);
  const published = publishScheduleWorkingDraft(
    withDraft.schedules[0]!,
    { publishedAt: "first-publication" },
    context,
  );
  expect(published.ok).toBe(true);
  if (!published.ok) throw new Error("Expected Publish success");
  const next = applySuccessfulReplacement(withDraft, devProject003.id, published);
  expect(next.schedules[0]!.publishedVersions).toHaveLength(1);
  expect(next.schedules[0]!.publishedVersions[0]).toEqual({
    versionNumber: 1,
    versionNote: null,
    publishedAt: "first-publication",
    milestones: started.draft.milestones,
  });
  expect(next.schedules[0]!.workingDraft).toBeNull();
});

it("omits reducer work for existing Start and failed commands", () => {
  const withDraft = {
    ...publishedScheduleForIntegration,
    workingDraft: { ...draftIdentity, milestones: [] },
  };
  const current: PrototypeState = {
    projects: [devProject003],
    schedules: [withDraft],
  };
  const existing = startScheduleWorkingDraft(
    withDraft,
    { workingDraftId: toCanonicalScheduleWorkingDraftId("ignored") },
    context,
  );
  expect(existing.ok).toBe(true);
  if (!existing.ok) throw new Error("Expected existing Draft");
  expect(existing.status).toBe("existing");
  expect(existing.schedule).toBe(withDraft);
  expect(current.schedules[0]).toBe(withDraft);

  const failed = removeScheduleWorkingDraftMilestone(
    withDraft,
    { milestoneId: toMilestoneId("missing") },
    context,
  );
  expect(failed).toEqual({
    ok: false,
    reason: "milestone-not-found",
    issues: [],
  });
  expect(current.schedules).toEqual([withDraft]);
});

it("keeps invalid Publish results out of state and still discards malformed Draft", () => {
  const malformed: CanonicalProjectSchedule = {
    ...createEmptyCanonicalProjectSchedule(devProject003.id),
    workingDraft: {
      ...draftIdentity,
      milestones: [{
        milestoneId: toMilestoneId("malformed"),
        milestoneDefinitionId: toMilestoneDefinitionId("missing-definition"),
        applicability: "applicable",
        plan: null,
        actual: null,
      }],
    },
  };
  const current: PrototypeState = {
    projects: [devProject003],
    schedules: [malformed],
  };
  const failed = publishScheduleWorkingDraft(
    malformed,
    { publishedAt: "must-not-publish" },
    context,
  );
  expect(failed.ok).toBe(false);
  expect(current.schedules[0]).toBe(malformed);
  expect(current.schedules[0]!.workingDraft).toBe(malformed.workingDraft);

  const cancelled = cancelScheduleWorkingDraft(malformed);
  expect(cancelled.ok).toBe(true);
  if (!cancelled.ok) throw new Error("Expected Cancel success");
  const next = applySuccessfulReplacement(current, devProject003.id, cancelled);
  expect(next.schedules[0]!.workingDraft).toBeNull();
});

it("keeps overflow Publish failure out of state", () => {
  const overflow: CanonicalProjectSchedule = {
    ...createEmptyCanonicalProjectSchedule(devProject003.id),
    projectId: devProject003.id,
    publishedVersions: [{
      versionNumber: toScheduleVersionNumber(Number.MAX_SAFE_INTEGER),
      versionNote: null,
      publishedAt: "maximum",
      milestones: [],
    }],
    workingDraft: { ...draftIdentity, milestones: [] },
  };
  const current: PrototypeState = {
    projects: [devProject003],
    schedules: [overflow],
  };
  expect(publishScheduleWorkingDraft(
    overflow,
    { publishedAt: "overflow-attempt" },
    context,
  )).toEqual({ ok: false, reason: "next-version-unavailable", issues: [] });
  expect(current.schedules[0]).toBe(overflow);
  expect(current.schedules[0]!.workingDraft).toBe(overflow.workingDraft);
});

it("keeps same raw milestone IDs isolated by ProjectId across rename", () => {
  const sameRawId = toMilestoneId("shared-raw-id");
  const definitionId = toMilestoneDefinitionId("milestone-design-kickoff");
  const draftFor = (schedule: CanonicalProjectSchedule): CanonicalProjectSchedule => ({
    ...schedule,
    workingDraft: {
      ...draftIdentity,
      milestones: [{
        milestoneId: sameRawId,
        milestoneDefinitionId: definitionId,
        applicability: "applicable",
        plan: null,
        actual: null,
      }],
    },
  });
  const schedule1 = draftFor(createEmptyCanonicalProjectSchedule(devProject001.id));
  const schedule3 = draftFor(createEmptyCanonicalProjectSchedule(devProject003.id));
  const state: PrototypeState = {
    projects: [devProject001, devProject003],
    schedules: [schedule1, schedule3],
  };
  const renamed = {
    ...devProject001,
    master: {
      ...devProject001.master,
      basicInformation: {
        ...devProject001.master.basicInformation,
        stnProjectName: "Renamed without re-keying",
      },
    },
  };
  const next = prototypeReducer(state, { type: "projectReplaced", project: renamed });
  const firstOwner = resolveCanonicalScheduleOwner(next, devProject001.id);
  const thirdOwner = resolveCanonicalScheduleOwner(next, devProject003.id);
  expect(firstOwner.kind).toBe("available");
  expect(thirdOwner.kind).toBe("available");
  if (firstOwner.kind !== "available" || thirdOwner.kind !== "available") {
    throw new Error("Expected both exact Schedule owners");
  }
  expect(firstOwner.schedule).toBe(schedule1);
  expect(thirdOwner.schedule).toBe(schedule3);
});
