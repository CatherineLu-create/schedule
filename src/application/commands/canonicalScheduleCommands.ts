import {
  validateScheduleWorkingDraft,
  type CanonicalScheduleWorkingDraft,
  type CanonicalScheduleWorkingDraftMilestone,
} from "../../domain/schedule/canonicalScheduleWorkingDraft";
import {
  getCurrentPublishedVersion,
  validateCanonicalProjectSchedule,
  type CanonicalProjectSchedule,
  type CanonicalPublishedScheduleVersion,
} from "../../domain/schedule/officialSchedule";
import {
  toScheduleVersionNumber,
  type MilestoneApplicability,
  type ScheduleVersionNumber,
} from "../../domain/schedule/schedule";
import type { ProjectLocalMilestoneDefinition } from "../../domain/schedule/scheduleReview";
import type { RetiredDraftOccurrenceGrant } from "../../domain/governance/milestoneGovernance";
import type { EffectiveMilestoneGovernanceContext } from "../governance/effectiveMilestoneGovernanceContext";
import { resolveScheduleDefinitions } from "../governance/scheduleDefinitionResolution";
import type { DateOnly } from "../../domain/shared/dateOnly";
import type {
  CanonicalScheduleWorkingDraftId,
  MilestoneDefinitionId,
  MilestoneId,
} from "../../domain/shared/ids";
import type { ValidationIssue } from "../../domain/validation/validationIssue";
import { collectSchedulePublishBlockingFindings } from "./scheduleReviewCommands";

export interface CanonicalScheduleCommandContext {
  readonly governance: EffectiveMilestoneGovernanceContext;
  readonly localDefinitions: readonly ProjectLocalMilestoneDefinition[];
  readonly retiredDraftOccurrenceGrants: readonly RetiredDraftOccurrenceGrant[];
}

function definitionsFor(schedule: CanonicalProjectSchedule, context: CanonicalScheduleCommandContext) {
  // A caller cannot supply another Project's registry to authorize a foreign local ID.
  return resolveScheduleDefinitions(context.governance, schedule.localDefinitions.filter(definition =>
    context.localDefinitions.some(candidate => candidate.id === definition.id
      && candidate.name === definition.name && candidate.stageGroupId === definition.stageGroupId
      && candidate.milestoneTypeId === definition.milestoneTypeId)));
}

function membershipIssue(milestoneId: MilestoneId, message: string): ValidationIssue {
  return { code: "schedule.draft.definition-not-addable-or-retained", domain: "schedule", source: "data", severity: "blocking", message, target: { section: "schedule.workingDraft", entityId: milestoneId, field: "milestoneDefinitionId" } };
}

function retainedDraftIssues(schedule: CanonicalProjectSchedule, context: CanonicalScheduleCommandContext): readonly ValidationIssue[] {
  const draft = schedule.workingDraft;
  if (draft === null) return [];
  const addable = new Set(context.governance.addablePublicDefinitions.map(definition => definition.id));
  const publicIds = new Set(context.governance.definitionsForHistoricalResolution.map(definition => definition.id));
  const current = getCurrentPublishedVersion(schedule);
  return draft.milestones.filter(milestone => publicIds.has(milestone.milestoneDefinitionId) && !addable.has(milestone.milestoneDefinitionId)
    && !current?.milestones.some(retained => retained.milestoneId === milestone.milestoneId && retained.milestoneDefinitionId === milestone.milestoneDefinitionId)
    && !context.retiredDraftOccurrenceGrants.some(grant => grant.projectId === schedule.projectId
      && grant.workingDraftId === draft.workingDraftId && grant.milestoneId === milestone.milestoneId
      && grant.milestoneDefinitionId === milestone.milestoneDefinitionId))
    .map(milestone => membershipIssue(milestone.milestoneId, "Nonaddable public definitions require exact Current Published lineage or a same-Draft retirement grant."));
}

export type CanonicalScheduleLifecycleFailureReason =
  | "no-working-draft"
  | "milestone-not-found"
  | "validation-failed"
  | "next-version-unavailable";

export interface CanonicalScheduleCommandFailure<
  TReason extends CanonicalScheduleLifecycleFailureReason,
> {
  readonly ok: false;
  readonly reason: TReason;
  readonly issues: readonly ValidationIssue[];
}

export type StartScheduleWorkingDraftResult =
  | {
      readonly ok: true;
      readonly status: "created" | "existing";
      readonly schedule: CanonicalProjectSchedule;
      readonly draft: CanonicalScheduleWorkingDraft;
    }
  | CanonicalScheduleCommandFailure<"validation-failed">;

export type UpdateScheduleWorkingDraftMilestoneInput =
  | {
      readonly milestoneId: MilestoneId;
      readonly field: "applicability";
      readonly value: MilestoneApplicability;
    }
  | {
      readonly milestoneId: MilestoneId;
      readonly field: "plan" | "actual";
      readonly value: DateOnly | null;
    };

export type UpdateScheduleWorkingDraftMilestoneResult =
  | {
      readonly ok: true;
      readonly schedule: CanonicalProjectSchedule;
      readonly draft: CanonicalScheduleWorkingDraft;
    }
  | CanonicalScheduleCommandFailure<
      "no-working-draft" | "milestone-not-found" | "validation-failed"
    >;

export interface AddScheduleWorkingDraftMilestoneInput {
  readonly milestoneId: MilestoneId;
  readonly milestoneDefinitionId: MilestoneDefinitionId;
}

export type AddScheduleWorkingDraftMilestoneResult =
  | {
      readonly ok: true;
      readonly schedule: CanonicalProjectSchedule;
      readonly draft: CanonicalScheduleWorkingDraft;
      readonly milestone: CanonicalScheduleWorkingDraftMilestone;
    }
  | CanonicalScheduleCommandFailure<
      "no-working-draft" | "validation-failed"
    >;

export interface RemoveScheduleWorkingDraftMilestoneInput {
  readonly milestoneId: MilestoneId;
}

export type RemoveScheduleWorkingDraftMilestoneResult =
  | {
      readonly ok: true;
      readonly schedule: CanonicalProjectSchedule;
      readonly draft: CanonicalScheduleWorkingDraft;
    }
  | CanonicalScheduleCommandFailure<
      "no-working-draft" | "milestone-not-found" | "validation-failed"
    >;

export type CancelScheduleWorkingDraftResult =
  | {
      readonly ok: true;
      readonly schedule: CanonicalProjectSchedule;
    }
  | CanonicalScheduleCommandFailure<"no-working-draft" | "validation-failed">;

export interface PublishScheduleWorkingDraftInput {
  readonly publishedAt: string;
}

export type NextPublishedScheduleVersionNumberResult =
  | {
      readonly ok: true;
      readonly versionNumber: ScheduleVersionNumber;
    }
  | {
      readonly ok: false;
      readonly reason: "next-version-unavailable";
    };

export type PublishScheduleWorkingDraftResult =
  | {
      readonly ok: true;
      readonly schedule: CanonicalProjectSchedule;
      readonly version: CanonicalPublishedScheduleVersion;
    }
  | CanonicalScheduleCommandFailure<
      | "no-working-draft"
      | "validation-failed"
      | "next-version-unavailable"
    >;

export function startScheduleWorkingDraft(
  schedule: CanonicalProjectSchedule,
  input: { readonly workingDraftId: CanonicalScheduleWorkingDraftId },
  context: CanonicalScheduleCommandContext,
): StartScheduleWorkingDraftResult {
  if (schedule.workingDraft !== null) {
    return {
      ok: true,
      status: "existing",
      schedule,
      draft: schedule.workingDraft,
    };
  }
  const issues = validateCanonicalProjectSchedule(
    schedule,
    definitionsFor(schedule, context),
  );
  if (issues.length > 0) {
    return { ok: false, reason: "validation-failed", issues };
  }
  const current = getCurrentPublishedVersion(schedule);
  const draft: CanonicalScheduleWorkingDraft = {
    workingDraftId: input.workingDraftId,
    milestones: current?.milestones.map((milestone) => ({ ...milestone })) ?? [],
    reviewSessionIds: [],
    importCandidates: [],
  };
  return {
    ok: true,
    status: "created",
    draft,
    schedule: { ...schedule, workingDraft: draft },
  };
}

type EditableDraftResolution =
  | { readonly ok: true; readonly draft: CanonicalScheduleWorkingDraft }
  | CanonicalScheduleCommandFailure<"no-working-draft" | "validation-failed">;

function resolveEditableDraft(
  schedule: CanonicalProjectSchedule,
  context: CanonicalScheduleCommandContext,
): EditableDraftResolution {
  if (schedule.workingDraft === null) {
    return { ok: false, reason: "no-working-draft", issues: [] };
  }
  const issues = [...validateScheduleWorkingDraft(
    schedule.workingDraft,
    definitionsFor(schedule, context),
  ), ...retainedDraftIssues(schedule, context)];
  return issues.length > 0
    ? { ok: false, reason: "validation-failed", issues }
    : { ok: true, draft: schedule.workingDraft };
}

export function updateScheduleWorkingDraftMilestone(
  schedule: CanonicalProjectSchedule,
  input: UpdateScheduleWorkingDraftMilestoneInput,
  context: CanonicalScheduleCommandContext,
): UpdateScheduleWorkingDraftMilestoneResult {
  const current = resolveEditableDraft(schedule, context);
  if (!current.ok) return current;
  const index = current.draft.milestones.findIndex(
    ({ milestoneId }) => milestoneId === input.milestoneId,
  );
  if (index < 0) {
    return { ok: false, reason: "milestone-not-found", issues: [] };
  }
  const milestones = current.draft.milestones.map((milestone, candidateIndex) => {
    if (candidateIndex !== index) return milestone;
    if (input.field === "applicability") {
      return { ...milestone, applicability: input.value };
    }
    return input.field === "plan"
      ? { ...milestone, plan: input.value }
      : { ...milestone, actual: input.value };
  });
  const draft = { ...current.draft, milestones };
  return {
    ok: true,
    draft,
    schedule: { ...schedule, workingDraft: draft },
  };
}

export function addScheduleWorkingDraftMilestone(
  schedule: CanonicalProjectSchedule,
  input: AddScheduleWorkingDraftMilestoneInput,
  context: CanonicalScheduleCommandContext,
): AddScheduleWorkingDraftMilestoneResult {
  const current = resolveEditableDraft(schedule, context);
  if (!current.ok) return current;
  const milestone: CanonicalScheduleWorkingDraftMilestone = {
    milestoneId: input.milestoneId,
    milestoneDefinitionId: input.milestoneDefinitionId,
    applicability: "applicable",
    plan: null,
    actual: null,
  };
  const draft = {
    ...current.draft,
    milestones: [...current.draft.milestones, milestone],
  };
  const definitions = definitionsFor(schedule, context);
  const issues = validateScheduleWorkingDraft(draft, definitions);
  const isAddablePublic = context.governance.addablePublicDefinitions.some(definition => definition.id === input.milestoneDefinitionId);
  const isConfirmedLocal = schedule.localDefinitions.filter(definition => definition.id === input.milestoneDefinitionId).length === 1
    && !context.governance.definitionsForHistoricalResolution.some(definition => definition.id === input.milestoneDefinitionId)
    && definitions.some(definition => definition.id === input.milestoneDefinitionId);
  if ((!isAddablePublic && !isConfirmedLocal)
    || current.draft.milestones.some(milestone => milestone.milestoneDefinitionId === input.milestoneDefinitionId)) {
    return { ok: false, reason: "validation-failed", issues: [...issues, membershipIssue(input.milestoneId, "Normal Add requires a current addable public definition or a legal confirmed same-Project local definition not already present in the Draft.")] };
  }
  if (issues.length > 0) {
    return { ok: false, reason: "validation-failed", issues };
  }
  return {
    ok: true,
    milestone,
    draft,
    schedule: { ...schedule, workingDraft: draft },
  };
}

export function removeScheduleWorkingDraftMilestone(
  schedule: CanonicalProjectSchedule,
  input: RemoveScheduleWorkingDraftMilestoneInput,
  context: CanonicalScheduleCommandContext,
): RemoveScheduleWorkingDraftMilestoneResult {
  const current = resolveEditableDraft(schedule, context);
  if (!current.ok) return current;
  const index = current.draft.milestones.findIndex(
    ({ milestoneId }) => milestoneId === input.milestoneId,
  );
  if (index < 0) {
    return { ok: false, reason: "milestone-not-found", issues: [] };
  }
  const draft = {
    ...current.draft,
    milestones: current.draft.milestones.filter((_, candidateIndex) =>
      candidateIndex !== index),
  };
  return {
    ok: true,
    draft,
    schedule: { ...schedule, workingDraft: draft },
  };
}

/** Only attached current-Draft sessions participate in this transition. */
function reviewClosureIssues(schedule: CanonicalProjectSchedule): readonly ValidationIssue[] {
  const draft = schedule.workingDraft;
  if (draft === null) return [];
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  for (const sessionId of draft.reviewSessionIds) {
    const matches = schedule.reviewSessions.filter(session => session.id === sessionId);
    if (typeof sessionId !== "string" || !sessionId.trim() || seen.has(sessionId)
      || matches.length !== 1 || matches[0].workingDraftId !== draft.workingDraftId
      || schedule.reviewClosures.some(closure => closure.sessionId === sessionId)) {
      issues.push({ code: "schedule.review.invalid-session-closure", domain: "schedule", source: "data", severity: "blocking",
        message: "Each attached session must resolve once to an open session belonging to this Working Draft.",
        target: { section: "schedule.workingDraft", entityId: sessionId, field: "reviewSessionIds" } });
    }
    seen.add(sessionId);
  }
  return issues;
}

export function cancelScheduleWorkingDraft(
  schedule: CanonicalProjectSchedule,
): CancelScheduleWorkingDraftResult {
  if (schedule.workingDraft === null) {
    return { ok: false, reason: "no-working-draft", issues: [] };
  }
  const issues = reviewClosureIssues(schedule);
  if (issues.length > 0) return { ok: false, reason: "validation-failed", issues };
  const closures = schedule.workingDraft.reviewSessionIds.map(sessionId => Object.freeze({ sessionId, kind: "discarded" as const }));
  return {
    ok: true,
    schedule: { ...schedule, reviewClosures: closures.length ? [...schedule.reviewClosures, ...closures] : schedule.reviewClosures, workingDraft: null },
  };
}

export function getNextPublishedScheduleVersionNumber(
  schedule: CanonicalProjectSchedule,
): NextPublishedScheduleVersionNumberResult {
  let maximum = 0;
  for (const version of schedule.publishedVersions) {
    if (!Number.isSafeInteger(version.versionNumber) || version.versionNumber <= 0) {
      return { ok: false, reason: "next-version-unavailable" };
    }
    if (version.versionNumber > maximum) maximum = version.versionNumber;
  }
  if (maximum === Number.MAX_SAFE_INTEGER) {
    return { ok: false, reason: "next-version-unavailable" };
  }
  return {
    ok: true,
    versionNumber: toScheduleVersionNumber(maximum + 1),
  };
}

export function publishScheduleWorkingDraft(
  schedule: CanonicalProjectSchedule,
  input: PublishScheduleWorkingDraftInput,
  context: CanonicalScheduleCommandContext,
): PublishScheduleWorkingDraftResult {
  if (schedule.workingDraft === null) {
    return { ok: false, reason: "no-working-draft", issues: [] };
  }
  const draft = schedule.workingDraft;
  const issues = [
    ...validateCanonicalProjectSchedule(schedule, definitionsFor(schedule, context)),
    ...collectSchedulePublishBlockingFindings(schedule, context),
    ...reviewClosureIssues(schedule),
  ];
  if (issues.length > 0) {
    return { ok: false, reason: "validation-failed", issues };
  }
  const next = getNextPublishedScheduleVersionNumber(schedule);
  if (!next.ok) {
    return { ok: false, reason: "next-version-unavailable", issues: [] };
  }
  const version: CanonicalPublishedScheduleVersion = Object.freeze({
    versionNumber: next.versionNumber,
    versionNote: null,
    publishedAt: input.publishedAt,
    milestones: Object.freeze(draft.milestones.map((milestone) => Object.freeze({ ...milestone }))),
  });
  const closures = draft.reviewSessionIds.map(sessionId => Object.freeze({ sessionId, kind: "published" as const, versionNumber: version.versionNumber }));
  return {
    ok: true,
    version,
    schedule: {
      ...schedule,
      publishedVersions: [...schedule.publishedVersions, version],
      reviewClosures: closures.length ? [...schedule.reviewClosures, ...closures] : schedule.reviewClosures,
      workingDraft: null,
    },
  };
}
