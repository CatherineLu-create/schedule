import { describe, expect, it } from "vitest";
import { milestoneDefinitionDisplayName, milestoneClassificationDisplayName } from "./milestoneDefinitionPresentation";
import { milestoneTypeCatalog } from "../config/v2/referenceData";
import { toMilestoneDefinitionId } from "../domain/shared/ids";
describe("SSL/GL presentation only", () => {
 it.each(["milestone-ramp-fcs", "project-local-fcs"])("presents %s without changing identity", id => {
  const definition = { id: toMilestoneDefinitionId(id), name: "FCS" };
  expect(milestoneDefinitionDisplayName(definition)).toBe("SSL/GL");
  expect(definition).toEqual({ id, name: "FCS" });
 });
 it("does not replace substrings or source content", () => {
  expect(milestoneDefinitionDisplayName({ id: toMilestoneDefinitionId("local"), name: "FCS evidence review" })).toBe("FCS evidence review");
 });
 it("resolves historical Type labels and retains historical input compatibility", () => {
  const type = milestoneTypeCatalog.find(item => item.id === "type-fcs")!;
  expect(milestoneClassificationDisplayName(type)).toBe("SSL/GL");
  expect(type.displayName).toBe("FCS"); expect(type.aliases).toContain("SSL/GL");
  expect(milestoneTypeCatalog.some(item => item.id === "type-ssl-gl")).toBe(false);
 });
});
