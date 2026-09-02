import type { CatalogReviewStatus } from "../reference-data/catalog";
import type {
  MilestoneDefinitionId,
  MilestoneTypeId,
  StageGroupId,
} from "../shared/ids";

export interface MilestoneDefinition {
  readonly id: MilestoneDefinitionId;
  readonly name: string;
  readonly stageGroupId: StageGroupId;
  readonly milestoneTypeId: MilestoneTypeId;
  readonly displayOrder: number;
  readonly active: boolean;
  readonly reviewStatus: CatalogReviewStatus;
  readonly aliases: readonly string[];
  readonly showInPortfolio: boolean;
}

export function renameMilestoneDefinition(
  definition: MilestoneDefinition,
  name: string,
): MilestoneDefinition {
  return { ...definition, name };
}
