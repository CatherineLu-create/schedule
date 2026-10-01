import { createInitialMilestoneGovernanceRuntimeState } from "../application/governance/milestoneGovernanceInitializer";
import type { EffectiveMilestoneGovernanceContext } from "../application/governance/effectiveMilestoneGovernanceContext";
import { dashboardAttentionMilestoneTypeIds } from "../config/v2/referenceData";
import type { CanonicalScheduleCommandContext } from "../application/commands/canonicalScheduleCommands";
import { publishGovernanceDraft, startGovernanceDraft, updateGovernanceDraft } from "../application/governance/milestoneGovernanceCommands";
import { selectEffectiveMilestoneGovernanceContext } from "../application/governance/effectiveMilestoneGovernanceContext";
import type { CommandResult, MilestoneGovernanceRuntimeState } from "../domain/governance/milestoneGovernance";
import type { MilestoneDefinition } from "../domain/schedule/milestoneCatalog";
import { toCanonicalScheduleWorkingDraftId, toGovernanceDraftId, toGovernanceReleaseId, toMilestoneId, toRequirementEnrollmentId, toRequirementWithdrawalId, type MilestoneDefinitionId } from "../domain/shared/ids";
import { createEmptyCanonicalProjectSchedule, type CanonicalProjectSchedule } from "../domain/schedule/officialSchedule";
import { devProject001 } from "../fixtures/v2/canonicalProjectFixtures";
import { parseDateOnly } from "../domain/shared/dateOnly";

/** Explicit bundled baseline for old characterization fixtures; never a runtime fallback. */
export function initialGovernanceContext(): EffectiveMilestoneGovernanceContext {
  const release = createInitialMilestoneGovernanceRuntimeState().releases[0];
  return {
    releaseId: release.id,
    definitionsForHistoricalResolution: release.definitions,
    addablePublicDefinitions: release.addableDefinitionIds.map(id => release.definitions.find(d => d.id === id)!),
    portfolioColumnDefinitions: release.portfolioColumnDefinitionIds.map(id => release.definitions.find(d => d.id === id)!),
    automaticAttentionTypeIds: new Set(dashboardAttentionMilestoneTypeIds),
    additionalAttentionDefinitionIds: new Set(),
    newProjectRequirementDefinitionIds: new Set(),
  };
}

export function initialScheduleCommandContext(): CanonicalScheduleCommandContext {
  return { governance: initialGovernanceContext(), localDefinitions: [], retiredDraftOccurrenceGrants: [] };
}

/** Real D1 issuance, followed by non-retiring and future retirement releases. */
export function publishedRetirementFixture() {
  function value<T>(result: CommandResult<T, string>): T {
    if (!result.ok) throw new Error(JSON.stringify(result));
    return result.value;
  }
  const initial = createInitialMilestoneGovernanceRuntimeState();
  const definitionId = initial.releases[0].addableDefinitionIds[0];
  const schedule: CanonicalProjectSchedule = {
    ...createEmptyCanonicalProjectSchedule(devProject001.id),
    workingDraft: {
      workingDraftId: toCanonicalScheduleWorkingDraftId("release-backed-draft"),
      milestones: [{ milestoneId: toMilestoneId("release-backed-row"), milestoneDefinitionId: definitionId,
        applicability: "applicable", plan: parseDateOnly("2026-10-01"), actual: null }],
      reviewSessionIds: [], importCandidates: [],
    },
  };
  const prototype = { projects: [devProject001], schedules: [schedule] };
  function publish(state: MilestoneGovernanceRuntimeState, id: string, addable: boolean) {
    const started = value(startGovernanceDraft(state, toGovernanceDraftId(`${id}-draft`)));
    const candidate = started.draft!.candidateRelease;
    const draft = value(updateGovernanceDraft(started, { kind: "replace-candidate-release", candidateRelease: {
      ...candidate,
      addableDefinitionIds: addable ? [...candidate.addableDefinitionIds, definitionId] : candidate.addableDefinitionIds.filter(id => id !== definitionId),
    } }));
    return value(publishGovernanceDraft(draft, prototype, {
      createReleaseId: () => toGovernanceReleaseId(id),
      createEnrollmentId: () => toRequirementEnrollmentId("unused-retirement-enrollment"),
      createWithdrawalId: () => toRequirementWithdrawalId("unused-retirement-withdrawal"),
      nowIso: () => "2026-10-01T02:00:00.000Z",
    }));
  }
  const retired = publish(initial, "real-retirement", false);
  const current = publish(retired, "non-retiring-release", false);
  const readded = publish(current, "future-readd", true);
  const future = publish(readded, "future-retirement", false);
  return {
    // Retain future history to prove that the current-release cutoff matters.
    state: { ...current, releases: future.releases }, schedule, prototype,
    grant: retired.retiredDraftOccurrenceGrants[0],
    invalidIssuingReleaseIds: {
      unknown: toGovernanceReleaseId("unknown-release"),
      bundled: initial.currentReleaseId,
      future: future.currentReleaseId,
      nonRetiring: current.currentReleaseId,
    },
  };
}

/** Exercises real publication and context validation for presentation-identity regressions. */
export function publishPortfolioDefinitionsForTest(
  additions: readonly MilestoneDefinition[],
  portfolioColumnDefinitionIds: readonly MilestoneDefinitionId[],
): EffectiveMilestoneGovernanceContext {
  function value<T>(result: CommandResult<T, string>): T {
    if (!result.ok) throw new Error(JSON.stringify(result));
    return result.value;
  }
  const initial = createInitialMilestoneGovernanceRuntimeState();
  const started = value(startGovernanceDraft(initial, toGovernanceDraftId("portfolio-identity-draft")));
  const candidate = started.draft!.candidateRelease;
  const draft = value(updateGovernanceDraft(started, { kind: "replace-candidate-release", candidateRelease: {
    ...candidate,
    definitions: [...candidate.definitions, ...additions],
    addableDefinitionIds: [...candidate.addableDefinitionIds, ...additions.map(definition => definition.id)],
    portfolioColumnDefinitionIds,
  } }));
  const published = value(publishGovernanceDraft(draft, { projects: [], schedules: [] }, {
    createReleaseId: () => toGovernanceReleaseId("portfolio-identity-release"),
    createEnrollmentId: () => toRequirementEnrollmentId("unused-portfolio-enrollment"),
    createWithdrawalId: () => toRequirementWithdrawalId("unused-portfolio-withdrawal"),
    nowIso: () => "2026-10-01T01:00:00.000Z",
  }));
  return value(selectEffectiveMilestoneGovernanceContext(published));
}
