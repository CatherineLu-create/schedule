import {
  milestoneDefinitions,
  stageGroupCatalog,
} from "../../config/v2/referenceData";
import {
  getCurrentPublishedVersion,
  orderPublishedMilestonesByDefinition,
  validateCanonicalProjectSchedule,
  type CanonicalPublishedScheduleVersion,
} from "../../domain/schedule/officialSchedule";
import type { MilestoneApplicability } from "../../domain/schedule/schedule";
import { formatDateOnly, type DateOnly } from "../../domain/shared/dateOnly";
import type { MilestoneId, ProjectId } from "../../domain/shared/ids";
import type { ValidationIssue } from "../../domain/validation/validationIssue";
import type { PrototypeState } from "../state/prototypeState";

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

export function validateCanonicalScheduleState(
  state: PrototypeState,
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

    issues.push(
      ...validateCanonicalProjectSchedule(schedule, milestoneDefinitions),
    );
  }

  return issues;
}

export function selectCurrentPublishedSchedule(
  state: PrototypeState,
  projectId: ProjectId,
): CurrentPublishedScheduleRead {
  if (!state.projects.some((project) => project.id === projectId)) {
    return {
      kind: "unavailable",
      issues: [
        scheduleOwnershipIssue(
          "schedule.integrity.project-not-found",
          "Selected Project does not exist.",
          projectId,
        ),
      ],
    };
  }

  const matchingSchedules = state.schedules.filter(
    (schedule) => schedule.projectId === projectId,
  );

  if (matchingSchedules.length === 0) {
    return {
      kind: "unavailable",
      issues: [
        scheduleOwnershipIssue(
          "schedule.integrity.missing-schedule",
          "Selected Project has no canonical Schedule.",
          projectId,
        ),
      ],
    };
  }

  if (matchingSchedules.length > 1) {
    return {
      kind: "unavailable",
      issues: [
        scheduleOwnershipIssue(
          "schedule.integrity.duplicate-schedule",
          "Selected Project has duplicate canonical Schedules.",
          projectId,
        ),
      ],
    };
  }

  const selectedSchedule = matchingSchedules[0]!;
  const localIssues = validateCanonicalProjectSchedule(
    selectedSchedule,
    milestoneDefinitions,
  );

  if (localIssues.length > 0) {
    return {
      kind: "unavailable",
      issues: localIssues,
    };
  }

  if (selectedSchedule.publishedVersions.length === 0) {
    return { kind: "noPublishedSchedule" };
  }

  const version = getCurrentPublishedVersion(selectedSchedule);

  if (version === null) {
    throw new Error("Validated non-empty Schedule has no Published version");
  }

  const milestoneRows = orderPublishedMilestonesByDefinition(
    version.milestones,
    milestoneDefinitions,
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

    const stage = stageGroupCatalog.find(
      (candidate) => candidate.id === definition.stageGroupId,
    );

    return {
      milestoneId: publishedMilestone.milestoneId,
      phase: "-",
      stage: stage?.displayName ?? "-",
      milestone: definition.name,
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
