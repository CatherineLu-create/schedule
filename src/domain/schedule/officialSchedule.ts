import type { DateOnly } from "../shared/dateOnly";
import type {
  MilestoneDefinitionId,
  MilestoneId,
  ProjectId,
} from "../shared/ids";
import type { ValidationIssue } from "../validation/validationIssue";
import type { MilestoneDefinition } from "./milestoneCatalog";
import type {
  MilestoneApplicability,
  ScheduleVersionNumber,
} from "./schedule";

export interface CanonicalPublishedScheduleMilestone {
  readonly milestoneId: MilestoneId;
  readonly milestoneDefinitionId: MilestoneDefinitionId;
  readonly applicability: MilestoneApplicability;
  readonly plan: DateOnly | null;
  readonly actual: DateOnly | null;
}

export interface CanonicalPublishedScheduleVersion {
  readonly versionNumber: ScheduleVersionNumber;
  readonly versionNote: string | null;
  readonly publishedAt: string;
  readonly milestones: readonly CanonicalPublishedScheduleMilestone[];
}

export interface CanonicalProjectSchedule {
  readonly projectId: ProjectId;
  readonly publishedVersions: readonly CanonicalPublishedScheduleVersion[];
}

export function createEmptyCanonicalProjectSchedule(
  projectId: ProjectId,
): CanonicalProjectSchedule {
  return {
    projectId,
    publishedVersions: [],
  };
}

export function getCurrentPublishedVersion(
  schedule: CanonicalProjectSchedule,
): CanonicalPublishedScheduleVersion | null {
  let current: CanonicalPublishedScheduleVersion | null = null;

  for (const version of schedule.publishedVersions) {
    if (current === null || version.versionNumber > current.versionNumber) {
      current = version;
    }
  }

  return current;
}

export function orderPublishedMilestonesByDefinition(
  milestones: readonly CanonicalPublishedScheduleMilestone[],
  definitions: readonly MilestoneDefinition[],
): readonly CanonicalPublishedScheduleMilestone[] {
  const displayOrderByDefinitionId = new Map(
    definitions.map((definition) => [definition.id, definition.displayOrder]),
  );

  return milestones
    .map((milestone, snapshotIndex) => ({ milestone, snapshotIndex }))
    .sort((left, right) => {
      const leftOrder =
        displayOrderByDefinitionId.get(left.milestone.milestoneDefinitionId) ??
        Number.POSITIVE_INFINITY;
      const rightOrder =
        displayOrderByDefinitionId.get(right.milestone.milestoneDefinitionId) ??
        Number.POSITIVE_INFINITY;

      return leftOrder - rightOrder || left.snapshotIndex - right.snapshotIndex;
    })
    .map(({ milestone }) => milestone);
}

type ScheduleIntegrityIssueCode =
  | "schedule.integrity.invalid-version-number"
  | "schedule.integrity.duplicate-version-number"
  | "schedule.integrity.duplicate-milestone-id"
  | "schedule.integrity.unresolved-milestone-definition";

function scheduleIntegrityIssue(
  code: ScheduleIntegrityIssueCode,
  message: string,
  entityId: string,
  field: string,
): ValidationIssue {
  return {
    code,
    domain: "schedule",
    source: "data",
    severity: "blocking",
    message,
    target: {
      section: "schedule",
      entityId,
      field,
    },
  };
}

export function validateCanonicalProjectSchedule(
  schedule: CanonicalProjectSchedule,
  definitions: readonly MilestoneDefinition[],
): readonly ValidationIssue[] {
  const definitionIds = new Set(definitions.map((definition) => definition.id));
  const versionNumbers = new Set<number>();
  const issues: ValidationIssue[] = [];

  for (const version of schedule.publishedVersions) {
    const versionEntityId = `${schedule.projectId}:v${String(version.versionNumber)}`;

    if (
      !Number.isSafeInteger(version.versionNumber) ||
      version.versionNumber <= 0
    ) {
      issues.push(
        scheduleIntegrityIssue(
          "schedule.integrity.invalid-version-number",
          "Published Schedule version number must be a positive safe integer.",
          versionEntityId,
          "versionNumber",
        ),
      );
    }

    if (versionNumbers.has(version.versionNumber)) {
      issues.push(
        scheduleIntegrityIssue(
          "schedule.integrity.duplicate-version-number",
          "Published Schedule version number must be unique within a Project.",
          versionEntityId,
          "versionNumber",
        ),
      );
    } else {
      versionNumbers.add(version.versionNumber);
    }

    const milestoneIds = new Set<string>();

    for (const milestone of version.milestones) {
      if (milestoneIds.has(milestone.milestoneId)) {
        issues.push(
          scheduleIntegrityIssue(
            "schedule.integrity.duplicate-milestone-id",
            "Milestone ID must be unique within a Published Schedule version.",
            milestone.milestoneId,
            "milestoneId",
          ),
        );
      } else {
        milestoneIds.add(milestone.milestoneId);
      }

      if (!definitionIds.has(milestone.milestoneDefinitionId)) {
        issues.push(
          scheduleIntegrityIssue(
            "schedule.integrity.unresolved-milestone-definition",
            "Published milestone must reference an existing milestone definition.",
            milestone.milestoneId,
            "milestoneDefinitionId",
          ),
        );
      }
    }
  }

  return issues;
}
