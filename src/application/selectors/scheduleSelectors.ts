import {
  validateScheduleWorkingDraft,
  type CanonicalScheduleWorkingDraft,
} from "../../domain/schedule/canonicalScheduleWorkingDraft";
import {
  getCurrentPublishedVersion,
  validateCanonicalProjectSchedule,
  type CanonicalProjectSchedule,
  type CanonicalPublishedScheduleVersion,
} from "../../domain/schedule/officialSchedule";
import type { MilestoneApplicability, ScheduleVersionNumber } from "../../domain/schedule/schedule";
import { formatDateOnly, type DateOnly } from "../../domain/shared/dateOnly";
import type { MilestoneId, ProjectId } from "../../domain/shared/ids";
import type { ValidationIssue } from "../../domain/validation/validationIssue";
import type { PrototypeState } from "../state/prototypeState";
import type { EffectiveMilestoneGovernanceContext } from "../governance/effectiveMilestoneGovernanceContext";
import { milestoneDefinitionDisplayName, milestoneClassificationDisplayName } from "../milestoneDefinitionPresentation";
import { resolveScheduleDefinitions } from "../governance/scheduleDefinitionResolution";
import { orderMilestoneOccurrences } from "../milestoneDefinitionOrdering";

export interface PublishedScheduleMilestoneRow {
  readonly milestoneId: MilestoneId;
  readonly phase: string;
  readonly stage: string;
  readonly milestone: string;
  readonly applicability: MilestoneApplicability;
  readonly plan: string;
  readonly actual: string;
}

export type CurrentPublishedScheduleRead =
  | {
      readonly kind: "unavailable";
      readonly issues: readonly ValidationIssue[];
    }
  | {
      readonly kind: "noPublishedSchedule";
    }
  | {
      readonly kind: "published";
      readonly version: CanonicalPublishedScheduleVersion;
      readonly versionLabel: string;
      readonly milestoneRows: readonly PublishedScheduleMilestoneRow[];
    };

export interface ScheduleWorkingDraftMilestoneRow {
  readonly milestoneId: MilestoneId;
  readonly phase: string;
  readonly stage: string;
  readonly milestone: string;
  readonly applicability: MilestoneApplicability;
  readonly plan: DateOnly | null;
  readonly actual: DateOnly | null;
}

export type ScheduleWorkingDraftRead =
  | {
      readonly kind: "unavailable";
      readonly workingDraftExists: false;
      readonly issues: readonly ValidationIssue[];
    }
  | {
      readonly kind: "unavailable";
      readonly workingDraftExists: true;
      readonly issues: readonly ValidationIssue[];
    }
  | { readonly kind: "noWorkingDraft" }
  | {
      readonly kind: "workingDraft";
      readonly draft: CanonicalScheduleWorkingDraft;
      readonly milestoneRows: readonly ScheduleWorkingDraftMilestoneRow[];
    };

export type CanonicalScheduleOwnerResolution =
  | {
      readonly kind: "unavailable";
      readonly issues: readonly ValidationIssue[];
    }
  | {
      readonly kind: "available";
      readonly schedule: CanonicalProjectSchedule;
    };

type ScheduleOwnershipIssueCode =
  | "schedule.integrity.project-not-found"
  | "schedule.integrity.missing-schedule"
  | "schedule.integrity.duplicate-schedule"
  | "schedule.integrity.orphan-schedule";

function scheduleOwnershipIssue(
  code: ScheduleOwnershipIssueCode,
  message: string,
  projectId: ProjectId,
): ValidationIssue {
  return {
    code,
    domain: "schedule",
    source: "data",
    severity: "blocking",
    message,
    target: {
      section: "schedule",
      entityId: projectId,
      field: "projectId",
    },
  };
}

function displayDate(value: DateOnly | null): string {
  return value === null ? "-" : formatDateOnly(value);
}

export function resolveCanonicalScheduleOwner(
  state: PrototypeState,
  projectId: ProjectId,
): CanonicalScheduleOwnerResolution {
  if (!state.projects.some((project) => project.id === projectId)) {
    return {
      kind: "unavailable",
      issues: [scheduleOwnershipIssue(
        "schedule.integrity.project-not-found",
        "Selected Project does not exist.",
        projectId,
      )],
    };
  }
  const matches = state.schedules.filter(
    (schedule) => schedule.projectId === projectId,
  );
  if (matches.length === 0) {
    return {
      kind: "unavailable",
      issues: [scheduleOwnershipIssue(
        "schedule.integrity.missing-schedule",
        "Selected Project has no canonical Schedule.",
        projectId,
      )],
    };
  }
  if (matches.length > 1) {
    return {
      kind: "unavailable",
      issues: [scheduleOwnershipIssue(
        "schedule.integrity.duplicate-schedule",
        "Selected Project has duplicate canonical Schedules.",
        projectId,
      )],
    };
  }
  return { kind: "available", schedule: matches[0]! };
}

export function validateCanonicalScheduleState(
  state: PrototypeState,
  context: EffectiveMilestoneGovernanceContext,
): readonly ValidationIssue[] {
  const projectIds = new Set(state.projects.map((project) => project.id));
  const scheduleCountByProjectId = new Map<ProjectId, number>();
  const issues: ValidationIssue[] = [];

  for (const schedule of state.schedules) {
    scheduleCountByProjectId.set(
      schedule.projectId,
      (scheduleCountByProjectId.get(schedule.projectId) ?? 0) + 1,
    );
  }

  for (const project of state.projects) {
    if ((scheduleCountByProjectId.get(project.id) ?? 0) === 0) {
      issues.push(
        scheduleOwnershipIssue(
          "schedule.integrity.missing-schedule",
          "Existing Project must own exactly one canonical Schedule.",
          project.id,
        ),
      );
    }
  }

  for (const [projectId, count] of scheduleCountByProjectId) {
    if (count > 1) {
      issues.push(
        scheduleOwnershipIssue(
          "schedule.integrity.duplicate-schedule",
          "Project must not own more than one canonical Schedule.",
          projectId,
        ),
      );
    }
  }

  for (const schedule of state.schedules) {
    if (!projectIds.has(schedule.projectId)) {
      issues.push(
        scheduleOwnershipIssue(
          "schedule.integrity.orphan-schedule",
          "Canonical Schedule must belong to an existing Project.",
          schedule.projectId,
        ),
      );
    }

    const milestoneDefinitions = resolveScheduleDefinitions(context, schedule.localDefinitions);
    issues.push(
      ...validateCanonicalProjectSchedule(schedule, milestoneDefinitions),
    );
    if (schedule.workingDraft !== null) {
      issues.push(
        ...validateScheduleWorkingDraft(schedule.workingDraft, milestoneDefinitions),
      );
    }
  }

  return issues;
}

export type SelectedPublishedScheduleRead =
  | (Extract<CurrentPublishedScheduleRead, { kind: "published" }> & { readonly isCurrent: boolean })
  | Extract<CurrentPublishedScheduleRead, { kind: "unavailable" }>
  | { readonly kind: "versionNotFound" };

export type PublishedScheduleHistoryRead =
  | Extract<CurrentPublishedScheduleRead, { kind: "unavailable" }>
  | { readonly kind: "history"; readonly versions: readonly {
      readonly versionNumber: ScheduleVersionNumber;
      readonly versionNote: string | null;
      readonly publishedAt: string;
      readonly isCurrent: boolean;
    }[] };

export function selectPublishedScheduleHistory(
  state: PrototypeState, projectId: ProjectId, context: EffectiveMilestoneGovernanceContext,
): PublishedScheduleHistoryRead {
  const owner = resolveCanonicalScheduleOwner(state, projectId);
  if (owner.kind === "unavailable") return owner;
  const issues = validateCanonicalProjectSchedule(owner.schedule, resolveScheduleDefinitions(context, owner.schedule.localDefinitions));
  if (issues.length) return { kind: "unavailable", issues };
  const current = getCurrentPublishedVersion(owner.schedule);
  return { kind: "history", versions: [...owner.schedule.publishedVersions]
    .sort((a, b) => b.versionNumber - a.versionNumber)
    .map(version => ({ versionNumber: version.versionNumber, versionNote: version.versionNote ?? null,
      publishedAt: version.publishedAt, isCurrent: version === current })) };
}

export function selectPublishedScheduleVersion(
  state: PrototypeState, projectId: ProjectId, versionNumber: ScheduleVersionNumber,
  context: EffectiveMilestoneGovernanceContext,
): SelectedPublishedScheduleRead {
  const owner = resolveCanonicalScheduleOwner(state, projectId);
  if (owner.kind === "unavailable") return owner;
  const milestoneDefinitions = resolveScheduleDefinitions(context, owner.schedule.localDefinitions);
  const issues = validateCanonicalProjectSchedule(owner.schedule, milestoneDefinitions);
  if (issues.length) return { kind: "unavailable", issues };
  const version = owner.schedule.publishedVersions.find(item => item.versionNumber === versionNumber);
  if (!version) return { kind: "versionNotFound" };
  return { ...projectPublishedVersion(version, milestoneDefinitions, context), isCurrent: version === getCurrentPublishedVersion(owner.schedule) };
}

export function selectCurrentPublishedSchedule(
  state: PrototypeState, projectId: ProjectId, context: EffectiveMilestoneGovernanceContext,
): CurrentPublishedScheduleRead {
  const owner = resolveCanonicalScheduleOwner(state, projectId);
  if (owner.kind === "unavailable") return owner;
  const milestoneDefinitions = resolveScheduleDefinitions(context, owner.schedule.localDefinitions);
  const issues = validateCanonicalProjectSchedule(owner.schedule, milestoneDefinitions);
  if (issues.length) return { kind: "unavailable", issues };
  const version = getCurrentPublishedVersion(owner.schedule);
  return version ? projectPublishedVersion(version, milestoneDefinitions, context) : { kind: "noPublishedSchedule" };
}

function projectPublishedVersion(
  version: CanonicalPublishedScheduleVersion,
  milestoneDefinitions: ReturnType<typeof resolveScheduleDefinitions>,
  context: EffectiveMilestoneGovernanceContext,
): Extract<CurrentPublishedScheduleRead, { kind: "published" }> {
  const milestoneRows = orderMilestoneOccurrences(
    version.milestones,
    milestoneDefinitions,
    context.stageGroupsForHistoricalResolution,
  ).map((publishedMilestone): PublishedScheduleMilestoneRow => {
    const definition = milestoneDefinitions.find(
      (candidate) =>
        candidate.id === publishedMilestone.milestoneDefinitionId,
    );

    if (definition === undefined) {
      throw new Error(
        `Validated milestone definition is unavailable: ${publishedMilestone.milestoneDefinitionId}`,
      );
    }

    const stage = context.stageGroupsForHistoricalResolution.find(
      (candidate) => candidate.id === definition.stageGroupId,
    );

    return {
      milestoneId: publishedMilestone.milestoneId,
      phase: "-",
      stage: milestoneClassificationDisplayName(stage) ?? "-",
      milestone: milestoneDefinitionDisplayName(definition),
      applicability: publishedMilestone.applicability,
      plan: displayDate(publishedMilestone.plan),
      actual: displayDate(publishedMilestone.actual),
    };
  });

  return {
    kind: "published",
    version,
    versionLabel: `Published v${String(version.versionNumber).padStart(2, "0")}`,
    milestoneRows,
  };
}

export function selectScheduleWorkingDraft(
  state: PrototypeState,
  projectId: ProjectId,
  context: EffectiveMilestoneGovernanceContext,
): ScheduleWorkingDraftRead {
  const owner = resolveCanonicalScheduleOwner(state, projectId);
  if (owner.kind === "unavailable") {
    return { ...owner, workingDraftExists: false };
  }

  const draft = owner.schedule.workingDraft;
  if (draft === null) return { kind: "noWorkingDraft" };
  const milestoneDefinitions = resolveScheduleDefinitions(context, owner.schedule.localDefinitions);

  const issues = validateScheduleWorkingDraft(draft, milestoneDefinitions);
  if (issues.length > 0) {
    return { kind: "unavailable", workingDraftExists: true, issues };
  }

  const milestoneRows = orderMilestoneOccurrences(
    draft.milestones,
    milestoneDefinitions,
    context.stageGroupsForHistoricalResolution,
  ).map((draftMilestone): ScheduleWorkingDraftMilestoneRow => {
    const definition = milestoneDefinitions.find(
      ({ id }) => id === draftMilestone.milestoneDefinitionId,
    )!;
    const stage = context.stageGroupsForHistoricalResolution.find(
      ({ id }) => id === definition.stageGroupId,
    );
    return {
      milestoneId: draftMilestone.milestoneId,
      phase: "-",
      stage: milestoneClassificationDisplayName(stage) ?? "-",
      milestone: milestoneDefinitionDisplayName(definition),
      applicability: draftMilestone.applicability,
      plan: draftMilestone.plan,
      actual: draftMilestone.actual,
    };
  });

  return { kind: "workingDraft", draft, milestoneRows };
}
