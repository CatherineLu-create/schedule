import type { MilestoneGovernanceRuntimeState } from "../../domain/governance/milestoneGovernance";
import { getCurrentPublishedVersion } from "../../domain/schedule/officialSchedule";
import type { GovernanceReleaseId, MilestoneDefinitionId, ProjectId, RequirementEnrollmentId } from "../../domain/shared/ids";
import type { PrototypeState } from "../state/prototypeState";

export type ProjectMilestoneRequirementStatus = "pending" | "adopted" | "notApplicable";

export interface ProjectMilestoneRequirementReadModel {
  readonly enrollmentId: RequirementEnrollmentId;
  readonly projectId: ProjectId;
  readonly milestoneDefinitionId: MilestoneDefinitionId;
  readonly assignedByReleaseId: GovernanceReleaseId;
  readonly status: ProjectMilestoneRequirementStatus;
}

export function selectEffectiveProjectMilestoneRequirements(
  prototype: PrototypeState,
  governance: MilestoneGovernanceRuntimeState,
): readonly ProjectMilestoneRequirementReadModel[] {
  const currentIndex = governance.releases.findIndex(release => release.id === governance.currentReleaseId);
  const history = governance.releases.slice(0, currentIndex + 1);
  const releaseIds = new Set(history.map(release => release.id));
  const withdrawn = new Set(governance.requirementWithdrawals
    .filter(withdrawal => releaseIds.has(withdrawal.withdrawnByReleaseId))
    .map(withdrawal => withdrawal.enrollmentId));
  const effective = governance.requirementEnrollments.filter(enrollment =>
    releaseIds.has(enrollment.assignedByReleaseId) && !withdrawn.has(enrollment.id));
  const publicIds = new Set(history.flatMap(release => release.definitions.map(definition => definition.id)));
  const pairs = new Set<string>();

  return effective.map(enrollment => {
    const pair = JSON.stringify([enrollment.projectId, enrollment.milestoneDefinitionId]);
    if (pairs.has(pair)) throw new Error("At most one effective requirement is allowed per Project and definition.");
    pairs.add(pair);
    const schedule = prototype.schedules.find(item => item.projectId === enrollment.projectId);
    const occurrences = schedule && publicIds.has(enrollment.milestoneDefinitionId)
      ? getCurrentPublishedVersion(schedule)?.milestones.filter(row => row.milestoneDefinitionId === enrollment.milestoneDefinitionId) ?? []
      : [];
    // Historical repeated occurrences remain intact; any exact applicable row satisfies adoption.
    const status = occurrences.some(row => row.applicability === "applicable") ? "adopted"
      : occurrences.some(row => row.applicability === "notApplicable") ? "notApplicable" : "pending";
    return {
      enrollmentId: enrollment.id,
      projectId: enrollment.projectId,
      milestoneDefinitionId: enrollment.milestoneDefinitionId,
      assignedByReleaseId: enrollment.assignedByReleaseId,
      status,
    };
  });
}
