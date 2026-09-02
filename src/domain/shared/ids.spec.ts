import { describe, expect, expectTypeOf, it } from "vitest";

import {
  toCatalogItemId,
  toMilestoneDefinitionId,
  toMilestoneRowId,
  toMilestoneTypeId,
  toPersonAssignmentId,
  toProjectId,
  toScheduleDraftId,
  toScheduleVersionId,
  toStageGroupId,
  toTeamFunctionId,
  toTeamTemplateId,
  type CatalogItemId,
  type ProjectId,
  type ScheduleVersionId,
} from "./ids";

describe("opaque domain IDs", () => {
  it("accepts explicit stable IDs without deriving them from display data", () => {
    const projectId = toProjectId("dev-project-002");

    expect(projectId).toBe("dev-project-002");
    expect(typeof projectId).toBe("string");
    expect(JSON.stringify({ projectId })).toBe(
      '{"projectId":"dev-project-002"}',
    );
  });

  it.each([
    ["ProjectId", toProjectId],
    ["ScheduleVersionId", toScheduleVersionId],
    ["ScheduleDraftId", toScheduleDraftId],
    ["MilestoneDefinitionId", toMilestoneDefinitionId],
    ["MilestoneRowId", toMilestoneRowId],
    ["StageGroupId", toStageGroupId],
    ["MilestoneTypeId", toMilestoneTypeId],
    ["CatalogItemId", toCatalogItemId],
    ["TeamTemplateId", toTeamTemplateId],
    ["TeamFunctionId", toTeamFunctionId],
    ["PersonAssignmentId", toPersonAssignmentId],
  ])("rejects an empty %s", (_name, createId) => {
    expect(() => createId("")).toThrow("ID must not be blank");
    expect(() => createId(" \t\n ")).toThrow("ID must not be blank");
  });

  it("keeps logically different ID types distinct", () => {
    const projectId = toProjectId("dev-project-002");
    const versionId = toScheduleVersionId("dev-version-002-v1");

    expectTypeOf(projectId).toEqualTypeOf<ProjectId>();
    expectTypeOf(versionId).toEqualTypeOf<ScheduleVersionId>();
    expectTypeOf(projectId).not.toEqualTypeOf<ScheduleVersionId>();
  });

  it("allows equal display names to refer to different catalog identities", () => {
    const first: { id: CatalogItemId; displayName: string } = {
      id: toCatalogItemId("catalog-cpu-a"),
      displayName: "Fixture CPU",
    };
    const second: { id: CatalogItemId; displayName: string } = {
      id: toCatalogItemId("catalog-cpu-b"),
      displayName: "Fixture CPU",
    };

    expect(first.displayName).toBe(second.displayName);
    expect(first.id).not.toBe(second.id);
  });
});
