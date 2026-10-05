import { stageGroupCatalog } from "../config/v2/referenceData";
import type { MilestoneDefinition } from "../domain/schedule/milestoneCatalog";

const stageOrder = new Map(stageGroupCatalog.filter(stage => stage.active && stage.reviewStatus === "reviewed").map((stage, index) => [stage.id, index]));

/** Shared presentation order; published identity and caller-owned arrays stay intact. */
export function orderMilestoneDefinitions<T extends MilestoneDefinition>(definitions: readonly T[]): T[] {
  return [...definitions].sort((left, right) =>
    (stageOrder.get(left.stageGroupId) ?? Number.MAX_SAFE_INTEGER) - (stageOrder.get(right.stageGroupId) ?? Number.MAX_SAFE_INTEGER)
    || left.displayOrder - right.displayOrder
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

/** Allocate only the new item's order; never renumber a published definition. */
export function insertionDisplayOrder(definitions: readonly MilestoneDefinition[], stageId: string, position: string): number | null {
  const stage = orderMilestoneDefinitions(definitions.filter(definition => definition.stageGroupId === stageId));
  if (stage.some(definition => !Number.isFinite(definition.displayOrder))) return null;
  if (stage.length === 0) return position === "start" || position === "end" ? 10 : null;
  const index = position === "end" ? stage.length - 1 : position === "start" ? -1 : stage.findIndex(definition => definition.id === position);
  if (index < 0 && position !== "start") return null;
  const before = index < 0 ? undefined : stage[index].displayOrder;
  const after = stage[index + 1]?.displayOrder;
  const order = before === undefined ? after! - 10 : after === undefined ? before + 10 : before / 2 + after / 2;
  return Number.isFinite(order) && (before === undefined || order > before) && (after === undefined || order < after) ? order : null;
}
