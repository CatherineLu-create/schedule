import { describe, expect, expectTypeOf, it } from "vitest";

import {
  toCanonicalScheduleWorkingDraftId,
  toGovernanceReleaseId,
  toGovernanceDraftId,
  toRequirementEnrollmentId,
  toRequirementWithdrawalId,
  toScheduleEvidenceId,
  toScheduleImportCandidateId,
  toScheduleReviewSessionId,
  toScheduleReviewDecisionId,
  toCatalogItemId,
  toMilestoneDefinitionId,
  toMilestoneId,
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
  type CanonicalScheduleWorkingDraftId,
  type MilestoneDefinitionId,
  type MilestoneId,
  type MilestoneRowId,
  type ProjectId,
  type ScheduleVersionId,
} from "./ids";

describe("opaque domain IDs", () => {
  it("constructs stable governance and review IDs with distinct opaque types", () => {
    const draftId = toCanonicalScheduleWorkingDraftId("draft-001");
    expectTypeOf(draftId).toEqualTypeOf<CanonicalScheduleWorkingDraftId>();
    expectTypeOf(draftId).not.toEqualTypeOf<ProjectId>();
    expect([
      draftId,
      toGovernanceReleaseId("release-001"),
      toGovernanceDraftId("governance-draft-001"),
      toRequirementEnrollmentId("enrollment-001"),
      toRequirementWithdrawalId("withdrawal-001"),
      toScheduleEvidenceId("evidence-001"),
      toScheduleImportCandidateId("candidate-001"),
      toScheduleReviewSessionId("session-001"),
      toScheduleReviewDecisionId("decision-001"),
    ]).toHaveLength(9);
  });
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
    ["MilestoneId", toMilestoneId],
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
    const milestoneId = toMilestoneId("dev-project-003-milestone-c1-go");

    expectTypeOf(projectId).toEqualTypeOf<ProjectId>();
    expectTypeOf(versionId).toEqualTypeOf<ScheduleVersionId>();
    expectTypeOf(projectId).not.toEqualTypeOf<ScheduleVersionId>();
    expectTypeOf(milestoneId).toEqualTypeOf<MilestoneId>();
    expectTypeOf(milestoneId).not.toEqualTypeOf<MilestoneDefinitionId>();
    expectTypeOf(milestoneId).not.toEqualTypeOf<MilestoneRowId>();
    expect(milestoneId).toBe("dev-project-003-milestone-c1-go");
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
