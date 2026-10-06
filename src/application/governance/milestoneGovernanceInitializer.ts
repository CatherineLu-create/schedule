import {
  activeMilestoneDefinitions,
  milestoneDefinitions,
  stageGroupCatalog,
  milestoneTypeCatalog,
  dashboardAttentionMilestoneTypeIds,
} from "../../config/v2/referenceData";
import type { MilestoneGovernanceRuntimeState } from "../../domain/governance/milestoneGovernance";
import { toGovernanceReleaseId, toMilestoneTypeId } from "../../domain/shared/ids";
import { portfolioScheduleColumnMappings } from "../../portfolioDashboardColumns";

export function createInitialMilestoneGovernanceRuntimeState(): MilestoneGovernanceRuntimeState {
  const selectableMilestoneTypeIds = Object.freeze([
    ...dashboardAttentionMilestoneTypeIds, toMilestoneTypeId("type-test"),
    toMilestoneTypeId("type-certification"), toMilestoneTypeId("type-preparation"),
  ]);
  const milestoneTypes = Object.freeze([
    ...milestoneTypeCatalog.map(item => ({ ...item, displayName: item.id === "type-pre-build" ? "Pre-Build" : item.displayName, active: selectableMilestoneTypeIds.includes(item.id) })),
    ...[["type-certification", "Certification"], ["type-preparation", "Preparation"]].map(([id, displayName]) => ({
      id: toMilestoneTypeId(id), displayName, aliases: [], active: true, reviewStatus: "reviewed" as const,
    })),
  ].map(item => Object.freeze({ ...item, aliases: Object.freeze([...item.aliases]) })));
  const releaseId = toGovernanceReleaseId("governance-release-bundled-baseline");
  const definitions = Object.freeze(milestoneDefinitions.map((definition) =>
    Object.freeze({ ...definition, aliases: Object.freeze([...definition.aliases]) })));
  const release = Object.freeze({
    id: releaseId,
    publishedAt: null,
    definitions,
    stageGroups: Object.freeze(stageGroupCatalog.map(item => Object.freeze({ ...item, aliases: Object.freeze([...item.aliases]) }))),
    milestoneTypes,
    selectableStageGroupIds: Object.freeze(stageGroupCatalog.filter(item => item.active && item.reviewStatus === "reviewed").map(item => item.id)),
    selectableMilestoneTypeIds,
    automaticAttentionTypeIds: Object.freeze([...dashboardAttentionMilestoneTypeIds]),
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
