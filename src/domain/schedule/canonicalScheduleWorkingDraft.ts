import type { DateOnly } from "../shared/dateOnly";
import type {
  MilestoneDefinitionId,
  MilestoneId,
} from "../shared/ids";
import type { ValidationIssue } from "../validation/validationIssue";
import type { MilestoneDefinition } from "./milestoneCatalog";
import type { MilestoneApplicability } from "./schedule";

export interface CanonicalScheduleWorkingDraftMilestone {
  readonly milestoneId: MilestoneId;
  readonly milestoneDefinitionId: MilestoneDefinitionId;
  readonly applicability: MilestoneApplicability;
  readonly plan: DateOnly | null;
  readonly actual: DateOnly | null;
}

export interface CanonicalScheduleWorkingDraft {
  readonly milestones: readonly CanonicalScheduleWorkingDraftMilestone[];
}

type ScheduleDraftIntegrityIssueCode =
  | "schedule.draft.integrity.duplicate-milestone-id"
  | "schedule.draft.integrity.unresolved-milestone-definition";

function draftIssue(
  code: ScheduleDraftIntegrityIssueCode,
  message: string,
  entityId: MilestoneId,
  field: "milestoneId" | "milestoneDefinitionId",
): ValidationIssue {
  return {
    code,
    domain: "schedule",
    source: "data",
    severity: "blocking",
    message,
    target: {
      section: "schedule.workingDraft",
      entityId,
      field,
    },
  };
}

export function validateScheduleWorkingDraft(
  draft: CanonicalScheduleWorkingDraft,
  definitions: readonly MilestoneDefinition[],
): readonly ValidationIssue[] {
  const definitionIds = new Set(definitions.map(({ id }) => id));
  const milestoneIds = new Set<MilestoneId>();
  const issues: ValidationIssue[] = [];

  for (const milestone of draft.milestones) {
    if (milestoneIds.has(milestone.milestoneId)) {
      issues.push(draftIssue(
        "schedule.draft.integrity.duplicate-milestone-id",
        "Working Draft milestone ID must be unique within the Draft.",
        milestone.milestoneId,
        "milestoneId",
      ));
    } else {
      milestoneIds.add(milestone.milestoneId);
    }

    if (!definitionIds.has(milestone.milestoneDefinitionId)) {
      issues.push(draftIssue(
        "schedule.draft.integrity.unresolved-milestone-definition",
        "Working Draft milestone must reference an existing milestone definition.",
        milestone.milestoneId,
        "milestoneDefinitionId",
      ));
    }
  }

  return issues;
}

export function orderScheduleWorkingDraftMilestonesByDefinition(
  milestones: readonly CanonicalScheduleWorkingDraftMilestone[],
  definitions: readonly MilestoneDefinition[],
): readonly CanonicalScheduleWorkingDraftMilestone[] {
  const order = new Map(
    definitions.map(({ id, displayOrder }) => [id, displayOrder]),
  );

  return milestones
    .map((milestone, snapshotIndex) => ({ milestone, snapshotIndex }))
    .sort((left, right) =>
      (order.get(left.milestone.milestoneDefinitionId) ??
        Number.POSITIVE_INFINITY) -
        (order.get(right.milestone.milestoneDefinitionId) ??
          Number.POSITIVE_INFINITY) ||
      left.snapshotIndex - right.snapshotIndex)
    .map(({ milestone }) => milestone);
}
