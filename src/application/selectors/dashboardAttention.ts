import {
  dashboardAttentionMilestoneTypeIds,
  milestoneDefinitions,
} from "../../config/v2/referenceData";
import {
  addDays,
  compareDateOnly,
  type DateOnly,
} from "../../domain/shared/dateOnly";
import type {
  MilestoneDefinitionId,
  MilestoneId,
  ProjectId,
} from "../../domain/shared/ids";
import type { ValidationIssue } from "../../domain/validation/validationIssue";
import type { PrototypeState } from "../state/prototypeState";
import { selectCurrentPublishedSchedule } from "./scheduleSelectors";

export interface DashboardAttentionMatch {
  readonly projectId: ProjectId;
  readonly milestoneId: MilestoneId;
  readonly milestoneDefinitionId: MilestoneDefinitionId;
  readonly plan: DateOnly;
}

export interface DashboardAttentionGroup {
  readonly projectIds: readonly ProjectId[];
  readonly projectCount: number;
  readonly matches: readonly DashboardAttentionMatch[];
}

export type DashboardAttentionRead =
  | {
      readonly kind: "available";
      readonly referenceDate: DateOnly;
      readonly due: DashboardAttentionGroup;
      readonly overdue: DashboardAttentionGroup;
    }
  | {
      readonly kind: "unavailable";
      readonly referenceDate: DateOnly;
      readonly issues: readonly ValidationIssue[];
    };

const definitionById = new Map(
  milestoneDefinitions.map((definition) => [definition.id, definition]),
);
const participatingTypeIds = new Set(dashboardAttentionMilestoneTypeIds);

export function selectDashboardAttention(
  state: PrototypeState,
  referenceDate: DateOnly,
): DashboardAttentionRead {
  const dueThrough = addDays(referenceDate, 14);
  const dueProjectIds: ProjectId[] = [];
  const overdueProjectIds: ProjectId[] = [];
  const dueMatches: DashboardAttentionMatch[] = [];
  const overdueMatches: DashboardAttentionMatch[] = [];
  const issues: ValidationIssue[] = [];

  for (const project of state.projects) {
    const publishedRead = selectCurrentPublishedSchedule(state, project.id);

    if (publishedRead.kind === "unavailable") {
      issues.push(...publishedRead.issues);
      continue;
    }
    if (publishedRead.kind === "noPublishedSchedule") continue;

    let projectHasDue = false;
    let projectHasOverdue = false;

    for (const milestone of publishedRead.version.milestones) {
      const definition = definitionById.get(milestone.milestoneDefinitionId);
      if (definition === undefined) {
        throw new Error(
          `Validated milestone definition is unavailable: ${milestone.milestoneDefinitionId}`,
        );
      }
      if (
        milestone.applicability !== "applicable"
        || milestone.plan === null
        || milestone.actual !== null
        || !participatingTypeIds.has(definition.milestoneTypeId)
      ) {
        continue;
      }

      const match: DashboardAttentionMatch = {
        projectId: project.id,
        milestoneId: milestone.milestoneId,
        milestoneDefinitionId: milestone.milestoneDefinitionId,
        plan: milestone.plan,
      };
      const relativeToReference = compareDateOnly(milestone.plan, referenceDate);

      if (
        relativeToReference >= 0
        && compareDateOnly(milestone.plan, dueThrough) <= 0
      ) {
        dueMatches.push(match);
        projectHasDue = true;
      } else if (relativeToReference < 0) {
        overdueMatches.push(match);
        projectHasOverdue = true;
      }
    }

    if (projectHasDue) dueProjectIds.push(project.id);
    if (projectHasOverdue) overdueProjectIds.push(project.id);
  }

  if (issues.length > 0) {
    return { kind: "unavailable", referenceDate, issues };
  }

  return {
    kind: "available",
    referenceDate,
    due: {
      projectIds: dueProjectIds,
      projectCount: dueProjectIds.length,
      matches: dueMatches,
    },
    overdue: {
      projectIds: overdueProjectIds,
      projectCount: overdueProjectIds.length,
      matches: overdueMatches,
    },
  };
}
