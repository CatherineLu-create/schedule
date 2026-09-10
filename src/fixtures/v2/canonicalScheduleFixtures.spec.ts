import { describe, expect, it } from "vitest";

import { milestoneDefinitions } from "../../config/v2/referenceData";
import {
  getCurrentPublishedVersion,
  validateCanonicalProjectSchedule,
} from "../../domain/schedule/officialSchedule";
import { toMilestoneId } from "../../domain/shared/ids";
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

  it("represents no Published Schedule without fabricating version zero", () => {
    expect(devSchedule001.publishedVersions).toEqual([]);
    expect(devSchedule005.publishedVersions).toEqual([]);
    expect(
      canonicalScheduleFixtures.filter(
        (schedule) => schedule.publishedVersions.length === 0,
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("gives devSchedule002 exactly one canonical Published version", () => {
    expect(devSchedule002.publishedVersions).toHaveLength(1);
    expect(devSchedule002.publishedVersions[0]?.versionNumber).toBe(1);
    expect(devSchedule002.publishedVersions[0]?.milestones.length).toBeGreaterThan(
      0,
    );
  });

  it("stores devSchedule003 as [v3, v1] while selecting v3 as Current", () => {
    expect(
      devSchedule003.publishedVersions.map((version) => version.versionNumber),
    ).toEqual([3, 1]);

    const current = getCurrentPublishedVersion(devSchedule003);

    expect(current).toBe(devSchedule003.publishedVersions[0]);
    expect(current?.versionNumber).toBe(3);
    expect(current).not.toBe(
      devSchedule003.publishedVersions[
        devSchedule003.publishedVersions.length - 1
      ],
    );
  });

  it("retains milestone lineage across versions without duplicates within one version", () => {
    const lineageId = toMilestoneId("dev-project-003-milestone-c1-go");
    const milestoneIdsByVersion = devSchedule003.publishedVersions.map(
      (version) => version.milestones.map((milestone) => milestone.milestoneId),
    );

    expect(milestoneIdsByVersion[0] ?? []).toContain(lineageId);
    expect(milestoneIdsByVersion[1] ?? []).toContain(lineageId);

    for (const milestoneIds of milestoneIdsByVersion) {
      expect(new Set(milestoneIds).size).toBe(milestoneIds.length);
    }
  });

  it("distinguishes a Published zero-milestone snapshot from no history", () => {
    expect(devSchedule004.publishedVersions).toHaveLength(1);
    expect(devSchedule004.publishedVersions[0]?.versionNumber).toBe(1);
    expect(devSchedule004.publishedVersions[0]?.milestones).toEqual([]);
  });

  it("passes canonical Schedule read-integrity validation", () => {
    for (const schedule of canonicalScheduleFixtures) {
      expect(
        validateCanonicalProjectSchedule(schedule, milestoneDefinitions),
      ).toEqual([]);
    }
  });
});
