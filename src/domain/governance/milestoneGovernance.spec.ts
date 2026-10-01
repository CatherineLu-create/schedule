import { describe, expect, it } from "vitest";

import { toMilestoneTypeId, toStageGroupId } from "../shared/ids";
import type { MilestoneDefinition } from "../schedule/milestoneCatalog";
import type { GovernanceValidationIssue } from "./milestoneGovernance";
import {
  type MilestoneGovernanceRelease,
  validateMilestoneGovernanceReleaseContinuity,
} from "./milestoneGovernance";
import { createInitialMilestoneGovernanceRuntimeState } from "../../application/governance/milestoneGovernanceInitializer";

function firstRelease(): MilestoneGovernanceRelease {
  return createInitialMilestoneGovernanceRuntimeState().releases[0];
}

function replaceFirstDefinition(
  previous: MilestoneGovernanceRelease,
  changes: Partial<MilestoneDefinition>,
): MilestoneGovernanceRelease {
  return {
    ...previous,
    definitions: [{ ...previous.definitions[0], ...changes }, ...previous.definitions.slice(1)],
  };
}

describe("milestone governance release continuity", () => {
  it.each([
    ["name", { name: "A different milestone" }, "name"],
    ["Stage", { stageGroupId: toStageGroupId("stage-c2") }, "stageGroupId"],
    ["Type", { milestoneTypeId: toMilestoneTypeId("type-close") }, "milestoneTypeId"],
  ] as const)("blocks a changed %s under an existing public ID", (_field, changes, targetField) => {
    const previous = firstRelease();
    const candidate = replaceFirstDefinition(previous, changes);

    const issues = validateMilestoneGovernanceReleaseContinuity(previous, candidate);

    expect(issues).toEqual([
      expect.objectContaining({
        code: "governance.definition.semantic-identity-changed",
        domain: "governance",
        severity: "blocking",
        source: "data",
        target: expect.objectContaining({
          entityId: previous.definitions[0].id,
          field: targetField,
        }),
      }),
    ]);
  });

  it("blocks physical removal of an old definition needed for historical resolution", () => {
    const previous = firstRelease();
    const candidate: MilestoneGovernanceRelease = {
      ...previous,
      definitions: previous.definitions.slice(1),
    };

    const issues = validateMilestoneGovernanceReleaseContinuity(previous, candidate);

    expect(issues).toEqual([
      expect.objectContaining({
        code: "governance.definition.historical-resolution-dropped",
        domain: "governance",
        severity: "blocking",
        target: expect.objectContaining({ entityId: previous.definitions[0].id }),
      }),
    ]);
  });

  it("allows governance setting changes without changing the definition identity", () => {
    const previous = firstRelease();
    const candidate: MilestoneGovernanceRelease = {
      ...previous,
      addableDefinitionIds: previous.addableDefinitionIds.slice(1),
      portfolioColumnDefinitionIds: previous.portfolioColumnDefinitionIds.slice(1),
      additionalAttentionDefinitionIds: [previous.definitions[0].id],
      newProjectRequirementDefinitionIds: [previous.definitions[1].id],
    };

    const issues: readonly GovernanceValidationIssue[] =
      validateMilestoneGovernanceReleaseContinuity(previous, candidate);

    expect(issues).toEqual([]);
  });
});
