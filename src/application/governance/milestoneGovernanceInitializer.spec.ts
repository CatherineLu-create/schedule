import { describe, expect, it } from "vitest";

import {
  activeMilestoneDefinitions,
  compatibilityOnlyMilestoneDefinitions,
  dashboardAttentionMilestoneTypeIds,
  milestoneDefinitions,
} from "../../config/v2/referenceData";
import {
  cpuReferenceFixtures,
  gpuReferenceFixtures,
  panelSizeReferenceFixtures,
  productLineReferenceFixtures,
} from "../../fixtures/v2/referenceFixtures";
import { portfolioScheduleColumnMappings } from "../../portfolioDashboardColumns";
import type { MilestoneGovernanceRuntimeState } from "../../domain/governance/milestoneGovernance";
import { createInitialMilestoneGovernanceRuntimeState } from "./milestoneGovernanceInitializer";

describe("initial milestone governance runtime", () => {
  it("creates_bundled_release_with_36_resolvable_30_addable_and_30_portfolio_definitions", () => {
    const state = createInitialMilestoneGovernanceRuntimeState();
    const release = state.releases[0];

    expect(state.releases).toHaveLength(1);
    expect(release.id).toBe("governance-release-bundled-baseline");
    expect(state.currentReleaseId).toBe(release.id);
    expect(release.publishedAt).toBeNull();
    expect(release.definitions).toHaveLength(36);
    expect(release.addableDefinitionIds).toHaveLength(30);
    expect(release.portfolioColumnDefinitionIds).toHaveLength(30);
    expect(release.definitions.map(({ id }) => id)).toEqual(milestoneDefinitions.map(({ id }) => id));
    expect(release.addableDefinitionIds).toEqual(activeMilestoneDefinitions.map(({ id }) => id));
    expect(release.portfolioColumnDefinitionIds).toEqual(
      portfolioScheduleColumnMappings.map(({ milestoneDefinitionId }) => milestoneDefinitionId),
    );
    expect(state.draft).toBeNull();
    expect(state.requirementEnrollments).toEqual([]);
    expect(state.requirementWithdrawals).toEqual([]);
    expect(state.retiredDraftOccurrenceGrants).toEqual([]);
  });

  it("retains six compatibility definitions only for historical resolution", () => {
    const release = createInitialMilestoneGovernanceRuntimeState().releases[0];
    const resolvable = new Set(release.definitions.map(({ id }) => id));
    const addable = new Set(release.addableDefinitionIds);
    const portfolio = new Set(release.portfolioColumnDefinitionIds);

    expect(compatibilityOnlyMilestoneDefinitions.map(({ id }) => id)).toEqual([
      "milestone-a-a2-a-g-o",
      "milestone-a-a2-a-smt",
      "milestone-a-a2-a-test",
      "milestone-a-a2-a-close",
      "milestone-c2-bios-frozen",
      "milestone-c2-golden-run",
    ]);
    for (const definition of compatibilityOnlyMilestoneDefinitions) {
      expect(resolvable.has(definition.id)).toBe(true);
      expect(addable.has(definition.id)).toBe(false);
      expect(portfolio.has(definition.id)).toBe(false);
    }
  });

  it("keeps_four_automatic_attention_types_outside_admin_toggle", () => {
    const release = createInitialMilestoneGovernanceRuntimeState().releases[0];

    expect(dashboardAttentionMilestoneTypeIds).toEqual([
      "type-g-o", "type-smt", "type-close", "type-mdrr",
    ]);
    expect(release.additionalAttentionDefinitionIds).toEqual([]);
    expect(release.newProjectRequirementDefinitionIds).toEqual([]);
  });

  it("preserves the canonical MDRR Portfolio presentation source", () => {
    const release = createInitialMilestoneGovernanceRuntimeState().releases[0];
    const mdrr = portfolioScheduleColumnMappings.at(-1);

    expect(release.portfolioColumnDefinitionIds.at(-1)).toBe("milestone-mdrr");
    expect(mdrr).toMatchObject({
      milestoneDefinitionId: "milestone-mdrr",
      portfolioVisible: false,
      valueMode: "planActual",
      emptyWhenNotApplicableOrUndated: true,
    });
  });

  it("initializes_governance_without_touching_self_service_catalogs", () => {
    const initializer: () => MilestoneGovernanceRuntimeState =
      createInitialMilestoneGovernanceRuntimeState;
    const catalogs = [
      productLineReferenceFixtures,
      panelSizeReferenceFixtures,
      cpuReferenceFixtures,
      gpuReferenceFixtures,
    ];
    const before = catalogs.map((items) => items.map((item) => ({ ...item, aliases: [...item.aliases] })));

    initializer();

    expect(catalogs.map((items) => items.map((item) => ({ ...item, aliases: [...item.aliases] })))).toEqual(before);
    expect(catalogs[0]).toBe(productLineReferenceFixtures);
    expect(catalogs[1]).toBe(panelSizeReferenceFixtures);
    expect(catalogs[2]).toBe(cpuReferenceFixtures);
    expect(catalogs[3]).toBe(gpuReferenceFixtures);
  });

  it("copies release arrays and definition objects instead of aliasing source fixtures", () => {
    const first = createInitialMilestoneGovernanceRuntimeState();
    const second = createInitialMilestoneGovernanceRuntimeState();

    expect(first).not.toBe(second);
    expect(first.releases).not.toBe(second.releases);
    expect(first.releases[0].definitions).not.toBe(milestoneDefinitions);
    expect(first.releases[0].definitions[0]).not.toBe(milestoneDefinitions[0]);
    expect(first.releases[0].definitions[0].aliases).not.toBe(milestoneDefinitions[0].aliases);
    expect(first.releases[0].addableDefinitionIds).not.toBe(second.releases[0].addableDefinitionIds);
    expect(first.releases[0].portfolioColumnDefinitionIds).not.toBe(second.releases[0].portfolioColumnDefinitionIds);
    expect(first.releases[0].definitions).toEqual(milestoneDefinitions);
  });
});
