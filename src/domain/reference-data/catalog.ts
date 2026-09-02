import type {
  CatalogItemId,
  MilestoneDefinitionId,
  MilestoneTypeId,
  StageGroupId,
  TeamFunctionId,
} from "../shared/ids";

export type CatalogReviewStatus = "reviewed" | "unreviewed";

export type CatalogRecordId =
  | CatalogItemId
  | MilestoneDefinitionId
  | MilestoneTypeId
  | StageGroupId
  | TeamFunctionId;

export interface CatalogItem<
  TId extends CatalogRecordId = CatalogItemId,
> {
  readonly id: TId;
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly active: boolean;
  readonly reviewStatus: CatalogReviewStatus;
}

export function renameCatalogItem<TId extends CatalogRecordId>(
  item: CatalogItem<TId>,
  displayName: string,
): CatalogItem<TId> {
  return { ...item, displayName };
}
