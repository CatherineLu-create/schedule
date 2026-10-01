import { milestoneTypeCatalog, stageGroupCatalog } from "../../config/v2/referenceData";
import type { MilestoneDefinition } from "../../domain/schedule/milestoneCatalog";
import type { ProjectLocalMilestoneDefinition } from "../../domain/schedule/scheduleReview";
import type { EffectiveMilestoneGovernanceContext } from "./effectiveMilestoneGovernanceContext";

/** Local identities resolve only from the selected canonical Project Schedule. */
export function resolveScheduleDefinitions(
  governance: EffectiveMilestoneGovernanceContext,
  localDefinitions: readonly ProjectLocalMilestoneDefinition[],
): readonly MilestoneDefinition[] {
  const publicIds = new Set(governance.definitionsForHistoricalResolution.map(definition => definition.id));
  const legalLocals = localDefinitions.filter(definition =>
    !publicIds.has(definition.id)
    && localDefinitions.filter(candidate => candidate.id === definition.id).length === 1
    && definition.confirmation === "confirmed" && definition.id.trim() && definition.name.trim()
    && stageGroupCatalog.some(stage => stage.id === definition.stageGroupId)
    && milestoneTypeCatalog.some(type => type.id === definition.milestoneTypeId));
  return [...governance.definitionsForHistoricalResolution, ...legalLocals.map(definition => ({
    ...definition, active: true, reviewStatus: "reviewed" as const, aliases: [], showInPortfolio: false,
  }))];
}
