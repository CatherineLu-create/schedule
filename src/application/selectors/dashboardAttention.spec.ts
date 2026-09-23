import { describe, expect, it } from "vitest";

import {
  dashboardAttentionMilestoneTypeIds,
  milestoneDefinitions,
} from "../../config/v2/referenceData";
import type { Project } from "../../domain/project/project";
import type { ProjectMaster } from "../../domain/project/projectMaster";
import type { CanonicalScheduleWorkingDraftMilestone } from "../../domain/schedule/canonicalScheduleWorkingDraft";
import type {
  CanonicalProjectSchedule,
  CanonicalPublishedScheduleMilestone,
  CanonicalPublishedScheduleVersion,
} from "../../domain/schedule/officialSchedule";
import { toScheduleVersionNumber } from "../../domain/schedule/schedule";
import { parseDateOnly, type DateOnly } from "../../domain/shared/dateOnly";
import {
  toMilestoneDefinitionId,
  toMilestoneId,
  toProjectId,
  type ProjectId,
} from "../../domain/shared/ids";
import { publishScheduleWorkingDraft } from "../commands/canonicalScheduleCommands";
import type { PrototypeState } from "../state/prototypeState";
import {
  selectDashboardAttention,
  type DashboardAttentionRead,
} from "./dashboardAttention";

const REFERENCE_DATE = dateOnly("2026-09-23");

function dateOnly(value: string): DateOnly {
  const parsed = parseDateOnly(value);
  if (parsed === null) throw new Error(`Invalid test DateOnly: ${value}`);
  return parsed;
}

function project(id: string): Project {
  return {
    id: toProjectId(id),
    master: {
      basicInformation: { stnProjectName: id },
    } as ProjectMaster,
    identityAliases: [],
    team: null,
  };
}

function milestone(
  id: string,
  definitionId: string,
  plan: string | null,
  overrides: Partial<CanonicalPublishedScheduleMilestone> = {},
): CanonicalPublishedScheduleMilestone {
  return {
    milestoneId: toMilestoneId(id),
    milestoneDefinitionId: toMilestoneDefinitionId(definitionId),
    applicability: "applicable",
    plan: plan === null ? null : dateOnly(plan),
    actual: null,
    ...overrides,
  };
}

function draftMilestone(
  id: string,
  definitionId: string,
  plan: string | null,
  overrides: Partial<CanonicalScheduleWorkingDraftMilestone> = {},
): CanonicalScheduleWorkingDraftMilestone {
  return {
    milestoneId: toMilestoneId(id),
    milestoneDefinitionId: toMilestoneDefinitionId(definitionId),
    applicability: "applicable",
    plan: plan === null ? null : dateOnly(plan),
    actual: null,
    ...overrides,
  };
}

function version(
  versionNumber: number,
  milestones: readonly CanonicalPublishedScheduleMilestone[],
): CanonicalPublishedScheduleVersion {
  return {
    versionNumber: toScheduleVersionNumber(versionNumber),
    versionNote: null,
    publishedAt: `published-v${String(versionNumber)}`,
    milestones,
  };
}

function schedule(
  projectId: ProjectId,
  milestones: readonly CanonicalPublishedScheduleMilestone[] = [],
  workingDraft: CanonicalProjectSchedule["workingDraft"] = null,
): CanonicalProjectSchedule {
  return {
    projectId,
    publishedVersions: [version(1, milestones)],
    workingDraft,
  };
}

function state(
  projects: readonly Project[],
  schedules: readonly CanonicalProjectSchedule[],
): PrototypeState {
  return { projects, schedules };
}

function expectAvailable(
  read: DashboardAttentionRead,
): Extract<DashboardAttentionRead, { readonly kind: "available" }> {
  expect(read.kind).toBe("available");
  if (read.kind !== "available") {
    throw new Error("Expected available Dashboard attention");
  }
  return read;
}

describe("selectDashboardAttention", () => {
  it("classifies both inclusive Due boundaries, excludes +15, and classifies past Plan as Overdue", () => {
    const owner = project("attention-boundaries");
    const read = expectAvailable(selectDashboardAttention(state([owner], [
      schedule(owner.id, [
        milestone("due-start", "milestone-a1-a-g-o", "2026-09-23"),
        milestone("due-end", "milestone-a1-a-smt", "2026-10-07"),
        milestone("outside", "milestone-a-a2-a-close", "2026-10-08"),
        milestone("overdue", "milestone-mdrr", "2026-09-22"),
      ]),
    ]), REFERENCE_DATE));

    expect(read.referenceDate).toBe("2026-09-23");
    expect(read.due.matches.map(({ milestoneId }) => milestoneId)).toEqual([
      "due-start",
      "due-end",
    ]);
    expect(read.overdue.matches.map(({ milestoneId }) => milestoneId)).toEqual([
      "overdue",
    ]);
  });

  it("excludes completed, missing-Plan, Not Applicable, and non-participating milestones", () => {
    const owner = project("attention-exclusions");
    const read = expectAvailable(selectDashboardAttention(state([owner], [
      schedule(owner.id, [
        milestone("completed", "milestone-a1-a-g-o", "2026-09-22", {
          actual: dateOnly("2026-09-23"),
        }),
        milestone("missing-plan", "milestone-a1-a-smt", null),
        milestone("not-applicable", "milestone-a-a2-a-close", "2026-09-24", {
          applicability: "notApplicable",
        }),
        milestone("non-participating", "milestone-a1-a-test", "2026-09-24"),
      ]),
    ]), REFERENCE_DATE));

    expect(read.due).toMatchObject({ projectIds: [], projectCount: 0, matches: [] });
    expect(read.overdue).toMatchObject({ projectIds: [], projectCount: 0, matches: [] });
  });

  it("uses the exact four stable Milestone Type IDs including hidden MDRR", () => {
    expect(dashboardAttentionMilestoneTypeIds).toEqual([
      "type-g-o",
      "type-smt",
      "type-close",
      "type-mdrr",
    ]);
    const owner = project("attention-types");
    const read = expectAvailable(selectDashboardAttention(state([owner], [
      schedule(owner.id, [
        milestone("go", "milestone-a1-a-g-o", "2026-09-24"),
        milestone("smt", "milestone-a1-a-smt", "2026-09-25"),
        milestone("close", "milestone-a-a2-a-close", "2026-09-26"),
        milestone("mdrr", "milestone-mdrr", "2026-09-27"),
      ]),
    ]), REFERENCE_DATE));

    expect(read.due.matches.map(({ milestoneId }) => milestoneId)).toEqual([
      "go",
      "smt",
      "close",
      "mdrr",
    ]);
    expect(read.due.projectCount).toBe(1);
  });

  it("deduplicates Project IDs while retaining all matches in Project and Published snapshot order", () => {
    const first = project("attention-first");
    const second = project("attention-second");
    const read = expectAvailable(selectDashboardAttention(state(
      [second, first],
      [
        schedule(first.id, [
          milestone("first-mdrr", "milestone-mdrr", "2026-09-27"),
        ]),
        schedule(second.id, [
          milestone("second-smt", "milestone-a1-a-smt", "2026-09-25"),
          milestone("second-go", "milestone-a1-a-g-o", "2026-09-24"),
        ]),
      ],
    ), REFERENCE_DATE));

    expect(read.due.projectIds).toEqual([second.id, first.id]);
    expect(read.due.projectCount).toBe(2);
    expect(read.due.matches.map(({ milestoneId }) => milestoneId)).toEqual([
      "second-smt",
      "second-go",
      "first-mdrr",
    ]);
  });

  it("allows one Project to contribute once to both Due and Overdue", () => {
    const owner = project("attention-both");
    const read = expectAvailable(selectDashboardAttention(state([owner], [
      schedule(owner.id, [
        milestone("due", "milestone-mdrr", "2026-10-03"),
        milestone("overdue", "milestone-a1-a-smt", "2026-09-16"),
      ]),
    ]), REFERENCE_DATE));

    expect(read.due.projectIds).toEqual([owner.id]);
    expect(read.due.projectCount).toBe(1);
    expect(read.overdue.projectIds).toEqual([owner.id]);
    expect(read.overdue.projectCount).toBe(1);
  });

  it("uses maximum Published version number rather than array position", () => {
    const owner = project("attention-current-published");
    const ownerSchedule: CanonicalProjectSchedule = {
      projectId: owner.id,
      publishedVersions: [
        version(3, [milestone("current", "milestone-a1-a-g-o", "2026-09-28")]),
        version(1, [milestone("old", "milestone-a1-a-smt", "2026-09-16")]),
      ],
      workingDraft: null,
    };

    const read = expectAvailable(selectDashboardAttention(
      state([owner], [ownerSchedule]),
      REFERENCE_DATE,
    ));
    expect(read.due.matches.map(({ milestoneId }) => milestoneId)).toEqual(["current"]);
    expect(read.overdue.matches).toEqual([]);
  });

  it("ignores Working Draft changes in both qualification directions", () => {
    const draftWouldQualify = project("draft-would-qualify");
    const draftWouldHide = project("draft-would-hide");
    const read = expectAvailable(selectDashboardAttention(state(
      [draftWouldQualify, draftWouldHide],
      [
        schedule(
          draftWouldQualify.id,
          [milestone("published-outside", "milestone-a1-a-g-o", "2026-10-08")],
          { milestones: [draftMilestone("published-outside", "milestone-a1-a-g-o", "2026-09-28")] },
        ),
        schedule(
          draftWouldHide.id,
          [milestone("published-due", "milestone-a1-a-smt", "2026-09-28")],
          { milestones: [draftMilestone("published-due", "milestone-a1-a-smt", "2026-10-08")] },
        ),
      ],
    ), REFERENCE_DATE));

    expect(read.due.projectIds).toEqual([draftWouldHide.id]);
    expect(read.due.matches.map(({ milestoneId }) => milestoneId)).toEqual([
      "published-due",
    ]);
  });

  it("uses the newly Current Published version after successful Publish", () => {
    const owner = project("attention-publish");
    const before = schedule(
      owner.id,
      [milestone("publish-target", "milestone-a1-a-g-o", "2026-10-08")],
      { milestones: [draftMilestone("publish-target", "milestone-a1-a-g-o", "2026-09-28")] },
    );
    expect(expectAvailable(selectDashboardAttention(
      state([owner], [before]),
      REFERENCE_DATE,
    )).due.projectCount).toBe(0);

    const published = publishScheduleWorkingDraft(
      before,
      { publishedAt: "2026-09-23T00:00:00Z" },
      { milestoneDefinitions },
    );
    expect(published.ok).toBe(true);
    if (!published.ok) throw new Error("Expected Publish to succeed");

    const afterRead = expectAvailable(selectDashboardAttention(
      state([owner], [published.schedule]),
      REFERENCE_DATE,
    ));
    expect(afterRead.due.projectIds).toEqual([owner.id]);
    expect(afterRead.due.matches.map(({ plan }) => plan)).toEqual(["2026-09-28"]);
  });

  it("treats no-Published and empty-Published Schedules as available zero contribution", () => {
    const noPublished = project("attention-no-published");
    const emptyPublished = project("attention-empty-published");
    const read = expectAvailable(selectDashboardAttention(state(
      [noPublished, emptyPublished],
      [
        { projectId: noPublished.id, publishedVersions: [], workingDraft: null },
        schedule(emptyPublished.id),
      ],
    ), REFERENCE_DATE));

    expect(read.due).toEqual({ projectIds: [], projectCount: 0, matches: [] });
    expect(read.overdue).toEqual({ projectIds: [], projectCount: 0, matches: [] });
  });

  it.each([
    {
      name: "missing Schedule ownership",
      badSchedules: (badOwner: Project): readonly CanonicalProjectSchedule[] => [],
      code: "schedule.integrity.missing-schedule",
    },
    {
      name: "duplicate Schedule ownership",
      badSchedules: (badOwner: Project): readonly CanonicalProjectSchedule[] => [
        schedule(badOwner.id),
        schedule(badOwner.id),
      ],
      code: "schedule.integrity.duplicate-schedule",
    },
    {
      name: "malformed Published definition",
      badSchedules: (badOwner: Project): readonly CanonicalProjectSchedule[] => [
        schedule(badOwner.id, [
          milestone("malformed", "missing-definition", "2026-09-28"),
        ]),
      ],
      code: "schedule.integrity.unresolved-milestone-definition",
    },
  ])("returns unavailable instead of a partial count for $name", ({ badSchedules, code }) => {
    const healthy = project("attention-healthy");
    const bad = project(`attention-bad-${code}`);
    const read = selectDashboardAttention(state(
      [healthy, bad],
      [
        schedule(healthy.id, [
          milestone("healthy-due", "milestone-a1-a-g-o", "2026-09-28"),
        ]),
        ...badSchedules(bad),
      ],
    ), REFERENCE_DATE);

    expect(read.kind).toBe("unavailable");
    if (read.kind !== "unavailable") {
      throw new Error("Expected unavailable Dashboard attention");
    }
    expect(read.referenceDate).toBe(REFERENCE_DATE);
    expect(read.issues.map((issue) => issue.code)).toContain(code);
    expect("due" in read).toBe(false);
    expect("overdue" in read).toBe(false);
  });

  it("retains issues from every unavailable Project read without exposing partial counts", () => {
    const healthy = project("attention-healthy-multiple-unavailable");
    const missing = project("attention-missing");
    const duplicate = project("attention-duplicate");
    const read = selectDashboardAttention(state(
      [healthy, missing, duplicate],
      [
        schedule(healthy.id, [
          milestone("healthy-due", "milestone-a1-a-g-o", "2026-09-28"),
        ]),
        schedule(duplicate.id),
        schedule(duplicate.id),
      ],
    ), REFERENCE_DATE);

    expect(read.kind).toBe("unavailable");
    if (read.kind !== "unavailable") {
      throw new Error("Expected unavailable Dashboard attention");
    }
    expect(read.issues.map(({ code, target }) => [code, target.entityId])).toEqual([
      ["schedule.integrity.missing-schedule", missing.id],
      ["schedule.integrity.duplicate-schedule", duplicate.id],
    ]);
    expect("due" in read).toBe(false);
    expect("overdue" in read).toBe(false);
  });
});
