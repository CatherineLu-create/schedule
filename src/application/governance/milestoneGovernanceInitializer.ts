import {
  activeMilestoneDefinitions,
  milestoneDefinitions,
} from "../../config/v2/referenceData";
import type { MilestoneGovernanceRuntimeState } from "../../domain/governance/milestoneGovernance";
import { toGovernanceReleaseId } from "../../domain/shared/ids";
import { portfolioScheduleColumnMappings } from "../../portfolioDashboardColumns";

export function createInitialMilestoneGovernanceRuntimeState(): MilestoneGovernanceRuntimeState {
  const releaseId = toGovernanceReleaseId("governance-release-bundled-baseline");
  const definitions = Object.freeze(milestoneDefinitions.map((definition) =>
    Object.freeze({ ...definition, aliases: Object.freeze([...definition.aliases]) })));
  const release = Object.freeze({
    id: releaseId,
    publishedAt: null,
    definitions,
    addableDefinitionIds: Object.freeze(activeMilestoneDefinitions.map(({ id }) => id)),
    portfolioColumnDefinitionIds: Object.freeze(
      portfolioScheduleColumnMappings.map(({ milestoneDefinitionId }) => milestoneDefinitionId),
    ),
    additionalAttentionDefinitionIds: Object.freeze([]),
    newProjectRequirementDefinitionIds: Object.freeze([]),
  });

  return {
    releases: Object.freeze([release]),
    currentReleaseId: releaseId,
    draft: null,
    requirementEnrollments: [],
    requirementWithdrawals: [],
    retiredDraftOccurrenceGrants: [],
  };
}
