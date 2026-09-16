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
import type { MilestoneDefinition } from "../../domain/schedule/milestoneCatalog";
import type { DateOnly } from "../../domain/shared/dateOnly";
import type {
  MilestoneDefinitionId,
  MilestoneId,
} from "../../domain/shared/ids";
import type { ValidationIssue } from "../../domain/validation/validationIssue";

export interface CanonicalScheduleCommandContext {
  readonly milestoneDefinitions: readonly MilestoneDefinition[];
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
  | CanonicalScheduleCommandFailure<"no-working-draft">;

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
    context.milestoneDefinitions,
  );
  if (issues.length > 0) {
    return { ok: false, reason: "validation-failed", issues };
  }
  const current = getCurrentPublishedVersion(schedule);
  const draft: CanonicalScheduleWorkingDraft = {
    milestones: current?.milestones.map((milestone) => ({ ...milestone })) ?? [],
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
  const issues = validateScheduleWorkingDraft(
    schedule.workingDraft,
    context.milestoneDefinitions,
  );
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
  const draft = { milestones };
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
    milestones: [...current.draft.milestones, milestone],
  };
  const issues = validateScheduleWorkingDraft(draft, context.milestoneDefinitions);
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
    milestones: current.draft.milestones.filter((_, candidateIndex) =>
      candidateIndex !== index),
  };
  return {
    ok: true,
    draft,
    schedule: { ...schedule, workingDraft: draft },
  };
}

export function cancelScheduleWorkingDraft(
  schedule: CanonicalProjectSchedule,
): CancelScheduleWorkingDraftResult {
  if (schedule.workingDraft === null) {
    return { ok: false, reason: "no-working-draft", issues: [] };
  }
  return {
    ok: true,
    schedule: { ...schedule, workingDraft: null },
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
    ...validateCanonicalProjectSchedule(schedule, context.milestoneDefinitions),
    ...validateScheduleWorkingDraft(draft, context.milestoneDefinitions),
  ];
  if (issues.length > 0) {
    return { ok: false, reason: "validation-failed", issues };
  }
  const next = getNextPublishedScheduleVersionNumber(schedule);
  if (!next.ok) {
    return { ok: false, reason: "next-version-unavailable", issues: [] };
  }
  const version: CanonicalPublishedScheduleVersion = {
    versionNumber: next.versionNumber,
    versionNote: null,
    publishedAt: input.publishedAt,
    milestones: draft.milestones.map((milestone) => ({ ...milestone })),
  };
  return {
    ok: true,
    version,
    schedule: {
      ...schedule,
      publishedVersions: [...schedule.publishedVersions, version],
      workingDraft: null,
    },
  };
}
