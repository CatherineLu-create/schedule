import type { MilestoneDefinition } from "../domain/schedule/milestoneCatalog";
import type { MilestoneDefinitionId, StageGroupId } from "../domain/shared/ids";

/** Shared presentation order; published identity and caller-owned arrays stay intact. */
export function orderMilestoneDefinitions<T extends MilestoneDefinition>(definitions: readonly T[], stages: readonly { readonly id: StageGroupId }[]): T[] {
  const stageOrder = new Map(stages.map((stage, index) => [stage.id, index]));
  return [...definitions].sort((left, right) =>
    (stageOrder.get(left.stageGroupId) ?? Number.MAX_SAFE_INTEGER) - (stageOrder.get(right.stageGroupId) ?? Number.MAX_SAFE_INTEGER)
    || left.displayOrder - right.displayOrder
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

/** Reorder a presentation copy without changing stored occurrence order or history. */
export function orderMilestoneOccurrences<T extends { readonly milestoneDefinitionId: MilestoneDefinitionId }>(
  occurrences: readonly T[], definitions: readonly MilestoneDefinition[], stages: readonly { readonly id: StageGroupId }[],
): T[] {
  const definitionOrder = new Map(orderMilestoneDefinitions(definitions, stages).map((definition, index) => [definition.id, index]));
  return [...occurrences].sort((left, right) =>
    (definitionOrder.get(left.milestoneDefinitionId) ?? Number.MAX_SAFE_INTEGER)
    - (definitionOrder.get(right.milestoneDefinitionId) ?? Number.MAX_SAFE_INTEGER));
}

/** Allocate only the new item's order; never renumber a published definition. */
export function insertionDisplayOrder(definitions: readonly MilestoneDefinition[], stageId: string, position: string): number | null {
  const stage = orderMilestoneDefinitions(definitions.filter(definition => definition.stageGroupId === stageId), []);
  if (stage.some(definition => !Number.isFinite(definition.displayOrder))) return null;
  if (stage.length === 0) return position === "start" || position === "end" ? 10 : null;
  const index = position === "end" ? stage.length - 1 : position === "start" ? -1 : stage.findIndex(definition => definition.id === position);
  if (index < 0 && position !== "start") return null;
  const before = index < 0 ? undefined : stage[index].displayOrder;
  const after = stage[index + 1]?.displayOrder;
  const order = before === undefined ? after! - 10 : after === undefined ? before + 10 : before / 2 + after / 2;
  return Number.isFinite(order) && (before === undefined || order > before) && (after === undefined || order < after) ? order : null;
}
