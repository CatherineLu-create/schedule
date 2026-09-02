import { describe, expect, expectTypeOf, it } from "vitest";

import type { CatalogReviewStatus } from "../reference-data/catalog";
import {
  toMilestoneDefinitionId,
  toMilestoneTypeId,
  toStageGroupId,
  type MilestoneDefinitionId,
  type MilestoneTypeId,
  type StageGroupId,
} from "../shared/ids";
import {
  renameMilestoneDefinition,
  type MilestoneDefinition,
} from "./milestoneCatalog";

const stageAMilestone: MilestoneDefinition = {
  id: toMilestoneDefinitionId("milestone-a-c-smt"),
  name: "C-SMT",
  stageGroupId: toStageGroupId("stage-a"),
  milestoneTypeId: toMilestoneTypeId("type-smt"),
  displayOrder: 10,
  active: true,
  reviewStatus: "reviewed",
  aliases: ["C_SMT", "C SMT"],
  showInPortfolio: true,
};

describe("MilestoneDefinition", () => {
  it("keeps same-name milestones in different stages as distinct identities", () => {
    const stageCMilestone: MilestoneDefinition = {
      ...stageAMilestone,
      id: toMilestoneDefinitionId("milestone-c-c-smt"),
      stageGroupId: toStageGroupId("stage-c"),
      displayOrder: 20,
    };

    const definitionsById = new Map([
      [stageAMilestone.id, stageAMilestone],
      [stageCMilestone.id, stageCMilestone],
    ]);

    expect(stageAMilestone.name).toBe(stageCMilestone.name);
    expect(stageAMilestone.stageGroupId).not.toBe(stageCMilestone.stageGroupId);
    expect(stageAMilestone.id).not.toBe(stageCMilestone.id);
    expect(definitionsById.size).toBe(2);
  });

  it("uses stable typed IDs for definition, stage, and milestone type", () => {
    expectTypeOf(stageAMilestone.id).toEqualTypeOf<MilestoneDefinitionId>();
    expectTypeOf(stageAMilestone.stageGroupId).toEqualTypeOf<StageGroupId>();
    expectTypeOf(stageAMilestone.milestoneTypeId).toEqualTypeOf<MilestoneTypeId>();
  });

  it("keeps aliases as lookup data rather than identity", () => {
    expect(stageAMilestone.aliases).toEqual(["C_SMT", "C SMT"]);
    expect(stageAMilestone.id).toBe("milestone-a-c-smt");
  });

  it("renames a definition without changing its stable ID or source value", () => {
    const renamed = renameMilestoneDefinition(
      stageAMilestone,
      "C-SMT Standard",
    );

    expect(renamed).toEqual({
      ...stageAMilestone,
      name: "C-SMT Standard",
    });
    expect(renamed.id).toBe(stageAMilestone.id);
    expect(stageAMilestone.name).toBe("C-SMT");
  });

  it("represents inactive, unreviewed, and portfolio visibility states", () => {
    const pmAddedDefinition: MilestoneDefinition = {
      ...stageAMilestone,
      id: toMilestoneDefinitionId("milestone-pm-added"),
      active: false,
      reviewStatus: "unreviewed",
      showInPortfolio: false,
    };

    expect(pmAddedDefinition.active).toBe(false);
    expect(pmAddedDefinition.reviewStatus).toBe("unreviewed");
    expect(pmAddedDefinition.showInPortfolio).toBe(false);
    expectTypeOf(pmAddedDefinition.reviewStatus).toEqualTypeOf<CatalogReviewStatus>();
  });
});
