import { dashboardAttentionMilestoneTypeIds, milestoneTypeCatalog, stageGroupCatalog } from "../../config/v2/referenceData";
import type { CommandResult, MilestoneGovernanceRuntimeState, RetiredDraftOccurrenceGrant } from "../../domain/governance/milestoneGovernance";
import type { MilestoneDefinition } from "../../domain/schedule/milestoneCatalog";
import type { GovernanceReleaseId, MilestoneDefinitionId, MilestoneTypeId } from "../../domain/shared/ids";

export interface EffectiveMilestoneGovernanceContext {
  readonly releaseId: GovernanceReleaseId;
  readonly definitionsForHistoricalResolution: readonly MilestoneDefinition[];
  readonly addablePublicDefinitions: readonly MilestoneDefinition[];
  readonly portfolioColumnDefinitions: readonly MilestoneDefinition[];
  readonly automaticAttentionTypeIds: ReadonlySet<MilestoneTypeId>;
  readonly additionalAttentionDefinitionIds: ReadonlySet<MilestoneDefinitionId>;
  readonly newProjectRequirementDefinitionIds: ReadonlySet<MilestoneDefinitionId>;
}

export function selectEffectiveMilestoneGovernanceContext(
  state: MilestoneGovernanceRuntimeState,
): CommandResult<EffectiveMilestoneGovernanceContext, "missing-current-release" | "invalid-release-reference"> {
  const matches = state.releases.filter(release => release.id === state.currentReleaseId);
  const failure = (code: "missing-current-release" | "invalid-release-reference") => ({
    ok: false as const, code, issues: [{
      code: `governance.${code}`, domain: "governance" as const, source: "data" as const,
      severity: "blocking" as const, message: "Current governance release must resolve unambiguously with valid definition references.",
      target: { section: "releases", entityId: state.currentReleaseId },
    }],
  });
  if (matches.length === 0) return failure("missing-current-release");
  if (matches.length !== 1) return failure("invalid-release-reference");
  const release = matches[0];
  const definitions = new Map(release.definitions.map(definition => [definition.id, definition]));
  if (definitions.size !== release.definitions.length || release.definitions.some(definition =>
    !definition.id.trim() || !definition.name.trim()
    || !stageGroupCatalog.some(stage => stage.id === definition.stageGroupId)
    || !milestoneTypeCatalog.some(type => type.id === definition.milestoneTypeId))) return failure("invalid-release-reference");
  for (const ids of [release.addableDefinitionIds, release.portfolioColumnDefinitionIds, release.additionalAttentionDefinitionIds, release.newProjectRequirementDefinitionIds]) {
    if (new Set(ids).size !== ids.length || ids.some(id => !definitions.has(id))) return failure("invalid-release-reference");
  }
  if (release.addableDefinitionIds.some(id => !definitions.get(id)!.active || definitions.get(id)!.reviewStatus !== "reviewed")) return failure("invalid-release-reference");
  if (release.newProjectRequirementDefinitionIds.some(id => !release.addableDefinitionIds.includes(id))) return failure("invalid-release-reference");
  return { ok: true, value: Object.freeze({
    releaseId: release.id,
    definitionsForHistoricalResolution: release.definitions,
    addablePublicDefinitions: Object.freeze(release.addableDefinitionIds.map(id => definitions.get(id)!)),
    portfolioColumnDefinitions: Object.freeze(release.portfolioColumnDefinitionIds.map(id => definitions.get(id)!)),
    automaticAttentionTypeIds: new Set(dashboardAttentionMilestoneTypeIds),
    additionalAttentionDefinitionIds: new Set(release.additionalAttentionDefinitionIds),
    newProjectRequirementDefinitionIds: new Set(release.newProjectRequirementDefinitionIds),
  }) };
}

/** Stored D1 tuples carry authority only after an actual retirement in current history. */
export function selectEffectiveRetiredDraftOccurrenceGrants(
  state: MilestoneGovernanceRuntimeState,
): CommandResult<readonly RetiredDraftOccurrenceGrant[], "missing-current-release" | "invalid-release-reference"> {
  const context = selectEffectiveMilestoneGovernanceContext(state);
  if (!context.ok) return context;
  const currentIndex = state.releases.findIndex(release => release.id === context.value.releaseId);
  const history = state.releases.slice(0, currentIndex + 1);
  const grants = state.retiredDraftOccurrenceGrants.filter(grant => {
    const index = history.findIndex(release => release.id === grant.retiredByReleaseId);
    return index > 0
      && history[index - 1].addableDefinitionIds.includes(grant.milestoneDefinitionId)
      && !history[index].addableDefinitionIds.includes(grant.milestoneDefinitionId);
  });
  return { ok: true, value: Object.freeze(grants) };
}
