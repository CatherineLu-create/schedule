import { describe, expect, expectTypeOf, it } from "vitest";

import { parseDateOnly, type DateOnly } from "../shared/dateOnly";
import {
  toMilestoneDefinitionId,
  toMilestoneRowId,
  toMilestoneTypeId,
  toScheduleDraftId,
  toScheduleVersionId,
  toStageGroupId,
  type MilestoneDefinitionId,
} from "../shared/ids";
import type { MilestoneDefinition } from "./milestoneCatalog";
import {
  appendPublishedVersion,
  createWorkingDraftFromLatestPublished,
  discardWorkingDraft,
  getLatestPublishedVersion,
  getPublishedVersionById,
  replaceWorkingDraft,
  toScheduleVersionNumber,
  type MilestoneApplicability,
  type ProjectSchedule,
  type PublishedScheduleMilestone,
  type PublishedScheduleVersion,
  type ScheduleImportFinding,
  type ScheduleWorkingDraft,
  type WorkingDraftMilestone,
} from "./schedule";

function dateOnly(value: string): DateOnly {
  const parsed = parseDateOnly(value);

  if (parsed === null) {
    throw new Error(`Invalid test date: ${value}`);
  }

  return parsed;
}

const publishedMilestone: PublishedScheduleMilestone = {
  rowId: toMilestoneRowId("published-row-c-smt"),
  milestoneDefinitionId: toMilestoneDefinitionId("milestone-c-c-smt"),
  applicability: "applicable",
  plan: dateOnly("2026-09-15"),
  actual: null,
};

const publishedV1: PublishedScheduleVersion = {
  id: toScheduleVersionId("schedule-version-v1"),
  versionNumber: toScheduleVersionNumber(1),
  versionNote: "Initial schedule",
  publishedAt: "2026-09-01T08:00:00.000Z",
  milestones: [publishedMilestone],
};

const publishedV2: PublishedScheduleVersion = {
  id: toScheduleVersionId("schedule-version-v2"),
  versionNumber: toScheduleVersionNumber(2),
  versionNote: "C-stage dates updated",
  publishedAt: "2026-09-02T08:00:00.000Z",
  milestones: [
    {
      ...publishedMilestone,
      rowId: toMilestoneRowId("published-row-c-smt-v2"),
      plan: dateOnly("2026-09-18"),
    },
  ],
};

describe("Schedule domain values", () => {
  it("accepts only positive safe integers as schedule version numbers", () => {
    expect(toScheduleVersionNumber(1)).toBe(1);
    expect(toScheduleVersionNumber(12)).toBe(12);

    for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => toScheduleVersionNumber(invalid)).toThrow(
        "Schedule version number must be a positive safe integer",
      );
    }
  });

  it("represents an empty per-Project Schedule without view state", () => {
    const emptySchedule: ProjectSchedule = {
      publishedVersions: [],
      workingDraft: null,
    };

    expect(emptySchedule).toEqual({
      publishedVersions: [],
      workingDraft: null,
    });
    expectTypeOf<keyof ProjectSchedule>().toEqualTypeOf<
      "publishedVersions" | "workingDraft"
    >();
  });

  it("keeps mapped Published rows distinct from unresolved Draft rows", () => {
    const importFinding: ScheduleImportFinding = {
      code: "schedule.import.ambiguous-date",
      domain: "schedule",
      source: "import",
      severity: "blocking",
      message: "The imported milestone contains two possible dates.",
      target: {
        section: "workingDraft",
        entityId: "draft-row-unmapped",
        field: "plan",
      },
    };
    const draft: ScheduleWorkingDraft = {
      id: toScheduleDraftId("schedule-draft-first"),
      basePublishedVersionId: null,
      milestones: [
        {
          rowId: toMilestoneRowId("draft-row-unmapped"),
          milestoneDefinitionId: null,
          rawMilestoneIdentity: {
            name: "Raw C-SMT",
            stageGroupName: "Raw C Stage",
            milestoneTypeName: null,
          },
          applicability: "notApplicable",
          plan: dateOnly("2026-09-20"),
          actual: null,
        },
      ],
      importFindings: [importFinding],
    };

    expect(draft.milestones[0]).toMatchObject({
      milestoneDefinitionId: null,
      applicability: "notApplicable",
      plan: "2026-09-20",
    });
    expect(draft.importFindings).toEqual([importFinding]);
    expectTypeOf<
      PublishedScheduleMilestone["milestoneDefinitionId"]
    >().toEqualTypeOf<MilestoneDefinitionId>();
    expectTypeOf<
      WorkingDraftMilestone["milestoneDefinitionId"]
    >().toEqualTypeOf<MilestoneDefinitionId | null>();
    expectTypeOf<
      WorkingDraftMilestone["applicability"]
    >().toEqualTypeOf<MilestoneApplicability>();
    expectTypeOf<WorkingDraftMilestone["plan"]>().toEqualTypeOf<
      DateOnly | null
    >();
  });

  it("stores Version Note and immutable publication metadata with a version", () => {
    expect(publishedV1).toMatchObject({
      versionNumber: 1,
      versionNote: "Initial schedule",
      publishedAt: "2026-09-01T08:00:00.000Z",
    });
    expectTypeOf(publishedV1.publishedAt).toEqualTypeOf<string>();
  });

  it("keeps same-name definitions as distinct Published row identities", () => {
    const stageADefinition: MilestoneDefinition = {
      id: toMilestoneDefinitionId("milestone-a-c-smt"),
      name: "C-SMT",
      stageGroupId: toStageGroupId("stage-a"),
      milestoneTypeId: toMilestoneTypeId("type-smt"),
      displayOrder: 10,
      active: true,
      reviewStatus: "reviewed",
      aliases: [],
      showInPortfolio: true,
    };
    const stageCDefinition: MilestoneDefinition = {
      ...stageADefinition,
      id: toMilestoneDefinitionId("milestone-c-c-smt"),
      stageGroupId: toStageGroupId("stage-c"),
      displayOrder: 20,
    };
    const version: PublishedScheduleVersion = {
      id: toScheduleVersionId("schedule-version-same-name"),
      versionNumber: toScheduleVersionNumber(1),
      versionNote: null,
      publishedAt: "2026-09-03T08:00:00.000Z",
      milestones: [
        {
          ...publishedMilestone,
          rowId: toMilestoneRowId("published-row-stage-a-c-smt"),
          milestoneDefinitionId: stageADefinition.id,
        },
        {
          ...publishedMilestone,
          rowId: toMilestoneRowId("published-row-stage-c-c-smt"),
          milestoneDefinitionId: stageCDefinition.id,
        },
      ],
    };

    expect(stageADefinition.name).toBe(stageCDefinition.name);
    expect(version.milestones.map((row) => row.milestoneDefinitionId)).toEqual([
      "milestone-a-c-smt",
      "milestone-c-c-smt",
    ]);
  });
});

describe("Published Schedule history queries", () => {
  it("returns null when no Published version exists", () => {
    const emptySchedule: ProjectSchedule = {
      publishedVersions: [],
      workingDraft: null,
    };

    expect(getLatestPublishedVersion(emptySchedule)).toBeNull();
  });

  it("returns the last entry in canonical Published history without mutation", () => {
    const history = Object.freeze([publishedV1, publishedV2]);
    const schedule: ProjectSchedule = Object.freeze({
      publishedVersions: history,
      workingDraft: null,
    });

    expect(getLatestPublishedVersion(schedule)).toBe(publishedV2);
    expect(schedule.publishedVersions).toBe(history);
    expect(history).toEqual([publishedV1, publishedV2]);
  });

  it("retrieves an older Published version by stable version ID", () => {
    const schedule: ProjectSchedule = {
      publishedVersions: [publishedV1, publishedV2],
      workingDraft: null,
    };

    expect(getPublishedVersionById(schedule, publishedV1.id)).toBe(publishedV1);
    expect(
      getPublishedVersionById(
        schedule,
        toScheduleVersionId("schedule-version-missing"),
      ),
    ).toBeNull();
  });
});

describe("Published Schedule history append", () => {
  it("appends a version without rewriting history, notes, or Working Draft", () => {
    const workingDraft: ScheduleWorkingDraft = Object.freeze({
      id: toScheduleDraftId("schedule-draft-existing"),
      basePublishedVersionId: publishedV1.id,
      milestones: Object.freeze([]),
      importFindings: Object.freeze([]),
    });
    const originalHistory = Object.freeze([publishedV1]);
    const schedule: ProjectSchedule = Object.freeze({
      publishedVersions: originalHistory,
      workingDraft,
    });

    const appended = appendPublishedVersion(schedule, publishedV2);

    expect(appended).not.toBe(schedule);
    expect(appended.publishedVersions).not.toBe(originalHistory);
    expect(appended.publishedVersions).toEqual([publishedV1, publishedV2]);
    expect(appended.publishedVersions[0]).toBe(publishedV1);
    expect(appended.publishedVersions[1]).toBe(publishedV2);
    expect(appended.publishedVersions[0]?.versionNote).toBe(
      "Initial schedule",
    );
    expect(appended.publishedVersions[1]?.versionNote).toBe(
      "C-stage dates updated",
    );
    expect(appended.workingDraft).toBe(workingDraft);
    expect(schedule.publishedVersions).toBe(originalHistory);
    expect(schedule.publishedVersions).toEqual([publishedV1]);
  });

  it("preserves an explicit non-consecutive version number", () => {
    const publishedV5: PublishedScheduleVersion = {
      ...publishedV2,
      id: toScheduleVersionId("schedule-version-v5"),
      versionNumber: toScheduleVersionNumber(5),
      versionNote: null,
    };
    const schedule: ProjectSchedule = {
      publishedVersions: [publishedV1],
      workingDraft: null,
    };

    const appended = appendPublishedVersion(schedule, publishedV5);

    expect(appended.publishedVersions[1]?.versionNumber).toBe(5);
  });
});

describe("Working Draft creation", () => {
  it("creates a first-ever Draft with a null base and no fake Published v0", () => {
    const emptySchedule: ProjectSchedule = {
      publishedVersions: [],
      workingDraft: null,
    };
    let rowIdRequests = 0;

    const draft = createWorkingDraftFromLatestPublished(emptySchedule, {
      id: toScheduleDraftId("schedule-draft-first"),
      createRowId: () => {
        rowIdRequests += 1;
        return toMilestoneRowId("unexpected-row");
      },
    });

    expect(draft).toEqual({
      id: "schedule-draft-first",
      basePublishedVersionId: null,
      milestones: [],
      importFindings: [],
    });
    expect(rowIdRequests).toBe(0);
    expect(emptySchedule).toEqual({
      publishedVersions: [],
      workingDraft: null,
    });
  });

  it("copies only the latest Published values into independent Draft rows", () => {
    const oldDraft: ScheduleWorkingDraft = Object.freeze({
      id: toScheduleDraftId("schedule-draft-old"),
      basePublishedVersionId: publishedV1.id,
      milestones: Object.freeze([
        Object.freeze({
          rowId: toMilestoneRowId("draft-row-old"),
          milestoneDefinitionId: null,
          rawMilestoneIdentity: {
            name: "Unpublished Raw Milestone",
            stageGroupName: null,
            milestoneTypeName: null,
          },
          applicability: "applicable" as const,
          plan: dateOnly("2099-01-01"),
          actual: null,
        }),
      ]),
      importFindings: Object.freeze([]),
    });
    const schedule: ProjectSchedule = Object.freeze({
      publishedVersions: Object.freeze([publishedV1, publishedV2]),
      workingDraft: oldDraft,
    });
    const expectedDraftRowId = toMilestoneRowId("draft-row-from-v2");
    let rowIdRequests = 0;

    const draft = createWorkingDraftFromLatestPublished(schedule, {
      id: toScheduleDraftId("schedule-draft-from-v2"),
      createRowId: (source) => {
        rowIdRequests += 1;
        expect(source).toBe(publishedV2.milestones[0]);
        return expectedDraftRowId;
      },
    });

    expect(draft).toEqual({
      id: "schedule-draft-from-v2",
      basePublishedVersionId: publishedV2.id,
      milestones: [
        {
          rowId: expectedDraftRowId,
          milestoneDefinitionId: toMilestoneDefinitionId(
            "milestone-c-c-smt",
          ),
          rawMilestoneIdentity: null,
          applicability: "applicable",
          plan: dateOnly("2026-09-18"),
          actual: null,
        },
      ],
      importFindings: [],
    });
    expect(rowIdRequests).toBe(1);
    expect(draft.milestones).not.toBe(publishedV2.milestones);
    expect(draft.milestones[0]).not.toBe(publishedV2.milestones[0]);
    expect(schedule.workingDraft).toBe(oldDraft);
    expect(publishedV2.milestones[0]?.plan).toBe("2026-09-18");
  });
});

describe("Working Draft replacement", () => {
  it("replaces the entire Draft without merging or changing Published history", () => {
    const originalDraft: ScheduleWorkingDraft = {
      id: toScheduleDraftId("schedule-draft-original"),
      basePublishedVersionId: publishedV2.id,
      milestones: [
        {
          rowId: toMilestoneRowId("draft-row-original-only"),
          milestoneDefinitionId: toMilestoneDefinitionId(
            "milestone-original-only",
          ),
          rawMilestoneIdentity: null,
          applicability: "applicable",
          plan: dateOnly("2026-10-01"),
          actual: null,
        },
      ],
      importFindings: [],
    };
    const replacementDraft: ScheduleWorkingDraft = Object.freeze({
      id: toScheduleDraftId("schedule-draft-replacement"),
      basePublishedVersionId: publishedV2.id,
      milestones: Object.freeze([
        Object.freeze({
          rowId: toMilestoneRowId("draft-row-replacement-only"),
          milestoneDefinitionId: null,
          rawMilestoneIdentity: {
            name: "Replacement Raw Milestone",
            stageGroupName: "Replacement Stage",
            milestoneTypeName: null,
          },
          applicability: "applicable" as const,
          plan: null,
          actual: null,
        }),
      ]),
      importFindings: Object.freeze([]),
    });
    const history = Object.freeze([publishedV1, publishedV2]);
    const schedule: ProjectSchedule = Object.freeze({
      publishedVersions: history,
      workingDraft: originalDraft,
    });

    const replaced = replaceWorkingDraft(schedule, replacementDraft);

    expect(replaced).not.toBe(schedule);
    expect(replaced.workingDraft).toBe(replacementDraft);
    expect(replaced.workingDraft?.milestones).toEqual([
      replacementDraft.milestones[0],
    ]);
    expect(replaced.workingDraft?.milestones).not.toContain(
      originalDraft.milestones[0],
    );
    expect(replaced.publishedVersions).toBe(history);
    expect(replaced.publishedVersions[0]).toBe(publishedV1);
    expect(replaced.publishedVersions[1]).toBe(publishedV2);
    expect(schedule.workingDraft).toBe(originalDraft);
  });

  it("accepts a replacement with a null base before the first Publish", () => {
    const replacementDraft: ScheduleWorkingDraft = {
      id: toScheduleDraftId("schedule-draft-first-replacement"),
      basePublishedVersionId: null,
      milestones: [],
      importFindings: [],
    };
    const emptySchedule: ProjectSchedule = {
      publishedVersions: [],
      workingDraft: null,
    };

    expect(replaceWorkingDraft(emptySchedule, replacementDraft)).toEqual({
      publishedVersions: [],
      workingDraft: replacementDraft,
    });
  });

  it("rejects a stale or missing base when a latest Published version exists", () => {
    const schedule: ProjectSchedule = {
      publishedVersions: [publishedV1, publishedV2],
      workingDraft: null,
    };
    const staleReplacement: ScheduleWorkingDraft = {
      id: toScheduleDraftId("schedule-draft-stale"),
      basePublishedVersionId: publishedV1.id,
      milestones: [],
      importFindings: [],
    };
    const missingBaseReplacement: ScheduleWorkingDraft = {
      ...staleReplacement,
      id: toScheduleDraftId("schedule-draft-missing-base"),
      basePublishedVersionId: null,
    };

    expect(() => replaceWorkingDraft(schedule, staleReplacement)).toThrow();
    expect(() =>
      replaceWorkingDraft(schedule, missingBaseReplacement),
    ).toThrow();
    expect(schedule.workingDraft).toBeNull();
    expect(schedule.publishedVersions).toEqual([publishedV1, publishedV2]);
  });

  it("rejects a non-null base before any Published version exists", () => {
    const emptySchedule: ProjectSchedule = {
      publishedVersions: [],
      workingDraft: null,
    };
    const invalidReplacement: ScheduleWorkingDraft = {
      id: toScheduleDraftId("schedule-draft-invalid-first"),
      basePublishedVersionId: publishedV1.id,
      milestones: [],
      importFindings: [],
    };

    expect(() =>
      replaceWorkingDraft(emptySchedule, invalidReplacement),
    ).toThrow();
    expect(emptySchedule).toEqual({
      publishedVersions: [],
      workingDraft: null,
    });
  });
});

describe("Working Draft discard", () => {
  it("removes only the Draft and leaves Published history untouched", () => {
    const workingDraft: ScheduleWorkingDraft = Object.freeze({
      id: toScheduleDraftId("schedule-draft-discard"),
      basePublishedVersionId: publishedV2.id,
      milestones: Object.freeze([]),
      importFindings: Object.freeze([]),
    });
    const history = Object.freeze([publishedV1, publishedV2]);
    const schedule: ProjectSchedule = Object.freeze({
      publishedVersions: history,
      workingDraft,
    });

    const discarded = discardWorkingDraft(schedule);

    expect(discarded).not.toBe(schedule);
    expect(discarded.workingDraft).toBeNull();
    expect(discarded.publishedVersions).toBe(history);
    expect(discarded.publishedVersions[0]).toBe(publishedV1);
    expect(discarded.publishedVersions[1]).toBe(publishedV2);
    expect(schedule.workingDraft).toBe(workingDraft);
  });
});
