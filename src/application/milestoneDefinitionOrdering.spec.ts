import { expect, it } from "vitest";
import { milestoneDefinitions } from "../config/v2/referenceData";
import { toMilestoneDefinitionId } from "../domain/shared/ids";
import { insertionDisplayOrder, orderMilestoneDefinitions } from "./milestoneDefinitionOrdering";

it("orders_by_canonical_stage_then_display_order_then_stable_id_without_mutating_input", () => {
  const c1 = milestoneDefinitions.find(definition => definition.id === "milestone-c1-close")!;
  const c2 = milestoneDefinitions.find(definition => definition.id === "milestone-c2-c-g-o")!;
  const kickoff = milestoneDefinitions.find(definition => definition.id === "milestone-design-kickoff")!;
  const z = { ...c1, id: toMilestoneDefinitionId("runtime-z"), displayOrder: 9999, name: "A label" };
  const a = { ...c1, id: toMilestoneDefinitionId("runtime-a"), displayOrder: 9999, name: "Z label" };
  const input = Object.freeze([c2, z, c1, kickoff, a].map(definition => Object.freeze(definition)));
  const before = structuredClone(input);
  const ordered = orderMilestoneDefinitions(input);
  expect(ordered.map(definition => definition.id)).toEqual(["milestone-design-kickoff", "milestone-c1-close", "runtime-a", "runtime-z", "milestone-c2-c-g-o"]);
  expect(input).toEqual(before);
  expect(ordered[2]).toBe(a);
  expect(orderMilestoneDefinitions([...input].reverse())).toEqual(ordered);
});

it.each([["start", 0], ["end", 20], ["tied-b", 20], ["tied-a", null]] as const)("tied_orders_allow_representable_position_%s_without_renumbering", (position, expected) => {
  const base = milestoneDefinitions[0];
  const definitions = ["tied-b", "tied-a"].map(id => Object.freeze({ ...base, id: toMilestoneDefinitionId(id), displayOrder: 10 }));
  expect(insertionDisplayOrder(definitions, "stage-design", position)).toBe(expected);
  expect(definitions.map(item => item.displayOrder)).toEqual([10, 10]);
});
it("allocates_empty_stage_and_rejects_missing_anchor_nonfinite_and_unrepresentable_bounds", () => {
  const base = milestoneDefinitions[0];
  expect(insertionDisplayOrder([], "stage-design", "end")).toBe(10);
  expect(insertionDisplayOrder([], "stage-design", "start")).toBe(10);
  expect(insertionDisplayOrder([], "stage-design", "missing")).toBeNull();
  expect(insertionDisplayOrder([base], "stage-design", "missing")).toBeNull();
  expect(insertionDisplayOrder([{ ...base, displayOrder: Infinity }], "stage-design", "end")).toBeNull();
  expect(insertionDisplayOrder([{ ...base, displayOrder: Number.MAX_VALUE }], "stage-design", "end")).toBeNull();
});
