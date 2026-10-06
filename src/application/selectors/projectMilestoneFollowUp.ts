import type { MilestoneGovernanceRuntimeState } from "../../domain/governance/milestoneGovernance";
import type { MilestoneDefinitionId, ProjectId } from "../../domain/shared/ids";
import type { EffectiveMilestoneGovernanceContext } from "../governance/effectiveMilestoneGovernanceContext";
import { selectEffectiveProjectMilestoneRequirements } from "../governance/projectMilestoneRequirements";
import { orderMilestoneDefinitions } from "../milestoneDefinitionOrdering";
import { milestoneDefinitionDisplayName } from "../milestoneDefinitionPresentation";
import type { PrototypeState } from "../state/prototypeState";

export interface ProjectMilestoneFollowUpGroup {
  readonly projectId: ProjectId;
  readonly projectName: string;
  readonly qciPmDisplay: string;
  readonly pendingDefinitions: readonly {
    readonly milestoneDefinitionId: MilestoneDefinitionId;
    readonly displayName: string;
  }[];
}

export function selectProjectMilestoneFollowUp(
  prototype: PrototypeState,
  governance: MilestoneGovernanceRuntimeState,
  context: EffectiveMilestoneGovernanceContext,
): readonly ProjectMilestoneFollowUpGroup[] {
  const pending = selectEffectiveProjectMilestoneRequirements(prototype, governance)
    .filter(requirement => requirement.status === "pending");
  const publicDefinitions = new Map(context.definitionsForHistoricalResolution.map(definition => [definition.id, definition]));
  return prototype.projects.flatMap(project => {
    const definitions = pending.filter(requirement => requirement.projectId === project.id).map(requirement => {
      const definition = publicDefinitions.get(requirement.milestoneDefinitionId);
      if (!definition) throw new Error("Pending public milestone is unavailable in the current release.");
      return definition;
    });
    if (definitions.length === 0) return [];
    return [{
      projectId: project.id,
      projectName: project.master.basicInformation.stnProjectName?.trim() || "Unnamed Project",
      qciPmDisplay: project.team?.projectRoles.qciPm?.name?.trim() || "Unassigned",
      pendingDefinitions: orderMilestoneDefinitions(definitions, context.stageGroupsForHistoricalResolution).map(definition => ({
        milestoneDefinitionId: definition.id,
        displayName: milestoneDefinitionDisplayName(definition),
      })),
    }];
  });
}
