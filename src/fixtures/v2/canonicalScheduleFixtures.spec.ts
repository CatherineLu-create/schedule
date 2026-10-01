import { initialScheduleCommandContext } from "../../test/governanceTestUtils";
import { describe, expect, it } from "vitest";

import { startScheduleWorkingDraft } from "../../application/commands/canonicalScheduleCommands";
import { milestoneDefinitions } from "../../config/v2/referenceData";
import { toCanonicalScheduleWorkingDraftId } from "../../domain/shared/ids";
import {
  validateCanonicalProjectSchedule,
} from "../../domain/schedule/officialSchedule";
import { canonicalProjectFixtures } from "./canonicalProjectFixtures";
import {
  canonicalScheduleFixtures,
  devSchedule001,
  devSchedule002,
  devSchedule003,
  devSchedule004,
  devSchedule005,
} from "./canonicalScheduleFixtures";

describe("canonical Schedule fixtures", () => {
  it("legacy_published_fixtures_keep_exact_occurrences_after_compatibility_initialization", () => {
    const before = JSON.stringify(devSchedule001.publishedVersions);
    const started = startScheduleWorkingDraft(
      devSchedule001,
      { workingDraftId: toCanonicalScheduleWorkingDraftId("fixture-review-draft") },
      initialScheduleCommandContext(),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("Expected fixture Draft creation");
    expect(JSON.stringify(devSchedule001.publishedVersions)).toBe(before);
    expect(JSON.stringify(started.schedule.publishedVersions)).toBe(before);
    expect(started.schedule.publishedVersions[0]?.milestones.map((row) => row.milestoneId)).toEqual([
      "dev-project-001-milestone-design-kickoff",
      "dev-project-001-milestone-design-id-fix",
      "dev-project-001-milestone-me-drawing",
      "dev-project-001-milestone-a-go",
    ]);
  });
  it("seeds no canonical Working Draft", () => {
    for (const value of canonicalScheduleFixtures) {
      expect(Object.hasOwn(value, "workingDraft")).toBe(true);
      expect(Reflect.get(value, "workingDraft")).toBeNull();
    }
  });

  it("owns exactly one Schedule for every canonical Project in Project order", () => {
    const projectIds = canonicalProjectFixtures.map((project) => project.id);
    const scheduleIds = canonicalScheduleFixtures.map(
      (schedule) => schedule.projectId,
    );

    expect(canonicalScheduleFixtures).toEqual([
      devSchedule001,
      devSchedule002,
      devSchedule003,
      devSchedule004,
      devSchedule005,
    ]);
    expect(canonicalScheduleFixtures).toHaveLength(5);
    expect(scheduleIds).toEqual(projectIds);
    expect(new Set(scheduleIds).size).toBe(5);

    for (const projectId of projectIds) {
      expect(scheduleIds.filter((candidate) => candidate === projectId)).toHaveLength(
        1,
      );
    }

    for (const scheduleId of scheduleIds) {
      expect(projectIds).toContain(scheduleId);
    }
  });

  it("gives only Manta meaningful Published demo data and keeps four empty owners", () => {
    const publishedOwners = canonicalScheduleFixtures.filter(
      (schedule) => schedule.publishedVersions.length > 0,
    );

    expect(publishedOwners).toEqual([devSchedule001]);
    expect(devSchedule001.projectId).toBe(canonicalProjectFixtures[0]?.id);
    expect(devSchedule001.publishedVersions).toHaveLength(1);
    expect(devSchedule001.publishedVersions[0]?.versionNumber).toBe(1);
    expect(devSchedule001.publishedVersions[0]?.milestones.length).toBeGreaterThan(0);
    expect(devSchedule001.publishedVersions[0]?.milestones.length).toBeLessThanOrEqual(5);
    for (const schedule of [devSchedule002, devSchedule003, devSchedule004, devSchedule005]) {
      expect(schedule.publishedVersions).toEqual([]);
    }
  });

  it("passes canonical Schedule read-integrity validation", () => {
    for (const schedule of canonicalScheduleFixtures) {
      expect(
        validateCanonicalProjectSchedule(schedule, milestoneDefinitions),
      ).toEqual([]);
    }
  });

  it("keeps sparse Published fixtures unchanged while first Draft clones only Published rows", () => {
    const originalPublished = devSchedule001.publishedVersions;
    const originalMilestones = originalPublished[0]!.milestones;
    const result = startScheduleWorkingDraft(devSchedule001, { workingDraftId: toCanonicalScheduleWorkingDraftId("fixture-clone") }, initialScheduleCommandContext());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected fixture Draft creation");
    expect(devSchedule001.publishedVersions).toBe(originalPublished);
    expect(devSchedule001.publishedVersions[0]!.milestones).toBe(originalMilestones);
    expect(devSchedule001.workingDraft).toBeNull();
    expect(result.draft.milestones).toEqual(originalMilestones);
    expect(result.draft.milestones).toHaveLength(4);
    expect(result.draft.milestones.filter(({ milestoneDefinitionId }) =>
      milestoneDefinitionId === "milestone-a1-a-g-o")).toHaveLength(1);
  });
});
