import { describe, expect, it } from "vitest";

import { mdrrMilestoneDefinition } from "../../config/v2/referenceData";
import { parseDateOnly } from "../../domain/shared/dateOnly";
import {
  toMilestoneRowId,
  toScheduleDraftId,
  toScheduleVersionId,
} from "../../domain/shared/ids";
import {
  toScheduleVersionNumber,
  type ProjectSchedule,
  type PublishedScheduleVersion,
  type ScheduleWorkingDraft,
} from "../../domain/schedule/schedule";
import {
  futureActualDraftCandidate,
  unmappedMilestoneDraftCandidate,
} from "../../fixtures/v2/scheduleCandidateFixtures";
import {
  discardProjectScheduleWorkingDraft,
  publishProjectSchedule,
  replaceProjectScheduleWorkingDraft,
  startProjectScheduleWorkingDraft,
} from "./scheduleCommands";

const referenceDate = parseDateOnly("2026-09-15")!;

function makeVersion(
  id: string,
  versionNumber: number,
): PublishedScheduleVersion {
  return {
    id: toScheduleVersionId(id),
    versionNumber: toScheduleVersionNumber(versionNumber),
    versionNote: `Version ${versionNumber}`,
    publishedAt: `2026-09-0${versionNumber}T00:00:00Z`,
    milestones: [
      {
        rowId: toMilestoneRowId(`${id}-row`),
        milestoneDefinitionId: mdrrMilestoneDefinition.id,
        applicability: "applicable",
        plan: parseDateOnly("2026-09-20"),
        actual: null,
      },
    ],
  };
}

const version1 = makeVersion("predecessor-schedule-v1", 1);
const version2 = makeVersion("predecessor-schedule-v2", 2);

function emptySchedule(): ProjectSchedule {
  return { publishedVersions: [], workingDraft: null };
}

function scheduleWithDraft(
  publishedVersions: readonly PublishedScheduleVersion[],
  draft: ScheduleWorkingDraft,
): ProjectSchedule {
  return { publishedVersions, workingDraft: draft };
}

describe("Schedule Working Draft predecessor commands", () => {
  it("starts a first-ever Draft with no fake v0", () => {
    const schedule = emptySchedule();
    const result = startProjectScheduleWorkingDraft(schedule, {
      draftId: toScheduleDraftId("predecessor-first-draft"),
      createRowId: () => toMilestoneRowId("unexpected-row"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.basePublishedVersionId).toBeNull();
    expect(result.schedule.publishedVersions).toEqual([]);
    expect(result.schedule.workingDraft).toBe(result.draft);
    expect(schedule.workingDraft).toBeNull();
  });

  it("starts normal editing from the latest Published version", () => {
    const schedule: ProjectSchedule = {
      publishedVersions: [version1, version2],
      workingDraft: null,
    };
    const result = startProjectScheduleWorkingDraft(schedule, {
      draftId: toScheduleDraftId("predecessor-new-draft"),
      createRowId: (row) =>
        toMilestoneRowId(`draft-copy-${String(row.rowId)}`),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.basePublishedVersionId).toBe(version2.id);
    expect(result.draft.milestones).toHaveLength(version2.milestones.length);
    expect(result.draft.milestones).not.toBe(version2.milestones);
  });

  it("does not overwrite an existing Working Draft implicitly", () => {
    const existing = {
      ...futureActualDraftCandidate,
      id: toScheduleDraftId("predecessor-existing-draft"),
      basePublishedVersionId: version1.id,
    };
    const schedule = scheduleWithDraft([version1], existing);

    expect(
      startProjectScheduleWorkingDraft(schedule, {
        draftId: toScheduleDraftId("replacement-without-confirmation"),
        createRowId: () => toMilestoneRowId("replacement-row"),
      }),
    ).toEqual({ ok: false, reason: "workingDraftExists" });
    expect(schedule.workingDraft).toBe(existing);
  });

  it("replaces the whole Draft only when its base matches latest Published", () => {
    const replacement: ScheduleWorkingDraft = {
      id: toScheduleDraftId("predecessor-explicit-replacement"),
      basePublishedVersionId: version1.id,
      milestones: [],
      importFindings: [],
    };
    const schedule = scheduleWithDraft([version1], {
      ...replacement,
      id: toScheduleDraftId("predecessor-old-draft"),
    });

    const result = replaceProjectScheduleWorkingDraft(schedule, replacement);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schedule.workingDraft).toBe(replacement);
    expect(result.schedule.publishedVersions).toBe(schedule.publishedVersions);
  });

  it("rejects a stale replacement as a normal command outcome", () => {
    const replacement: ScheduleWorkingDraft = {
      id: toScheduleDraftId("predecessor-stale-replacement"),
      basePublishedVersionId: null,
      milestones: [],
      importFindings: [],
    };

    expect(
      replaceProjectScheduleWorkingDraft(
        { publishedVersions: [version1], workingDraft: null },
        replacement,
      ),
    ).toEqual({ ok: false, reason: "staleBase" });
  });

  it("discards only the Working Draft through an explicit command", () => {
    const draft = {
      ...futureActualDraftCandidate,
      basePublishedVersionId: version1.id,
    };
    const schedule = scheduleWithDraft([version1], draft);

    const updated = discardProjectScheduleWorkingDraft(schedule);

    expect(updated.workingDraft).toBeNull();
    expect(updated.publishedVersions).toBe(schedule.publishedVersions);
    expect(schedule.workingDraft).toBe(draft);
  });
});

describe("Schedule Publish predecessor command", () => {
  it("returns Blocking validation issues without changing the Schedule", () => {
    const blockedDraft = {
      ...unmappedMilestoneDraftCandidate,
      id: toScheduleDraftId("predecessor-blocked-draft"),
      basePublishedVersionId: version1.id,
    };
    const schedule = scheduleWithDraft([version1], blockedDraft);

    const result = publishProjectSchedule(schedule, {
      versionId: toScheduleVersionId("predecessor-rejected-v2"),
      versionNote: "Must not publish",
      publishedAt: "2026-09-15T08:00:00.000Z",
      referenceDate,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("validation");
    expect(result.issues.some(({ severity }) => severity === "blocking")).toBe(
      true,
    );
    expect(schedule.publishedVersions).toEqual([version1]);
    expect(schedule.workingDraft).toBe(blockedDraft);
  });

  it("publishes an Advisory-only first Draft as v1 and clears Draft", () => {
    const schedule = scheduleWithDraft([], futureActualDraftCandidate);

    const result = publishProjectSchedule(schedule, {
      versionId: toScheduleVersionId("predecessor-first-version"),
      versionNote: "DEV first schedule",
      publishedAt: "2026-09-15T08:00:00.000Z",
      referenceDate,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "schedule.data.future-actual",
        severity: "advisory",
      }),
    );
    expect(result.version).toMatchObject({
      id: "predecessor-first-version",
      versionNumber: 1,
      versionNote: "DEV first schedule",
    });
    expect(result.schedule.publishedVersions).toEqual([result.version]);
    expect(result.schedule.workingDraft).toBeNull();
    expect(schedule.workingDraft).toBe(futureActualDraftCandidate);
  });

  it("increments latest version and preserves append-only history objects", () => {
    const original: ProjectSchedule = {
      publishedVersions: [version1],
      workingDraft: null,
    };
    const started = startProjectScheduleWorkingDraft(original, {
      draftId: toScheduleDraftId("predecessor-draft-v2"),
      createRowId: (row) =>
        toMilestoneRowId(`predecessor-v2-${String(row.rowId)}`),
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const result = publishProjectSchedule(started.schedule, {
      versionId: toScheduleVersionId("predecessor-published-v2"),
      versionNote: "DEV schedule update",
      publishedAt: "2026-09-16T08:00:00.000Z",
      referenceDate,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.version.versionNumber).toBe(2);
    expect(result.schedule.publishedVersions).toHaveLength(2);
    expect(result.schedule.publishedVersions[0]).toBe(version1);
    expect(result.schedule.workingDraft).toBeNull();
    expect(original.publishedVersions).toEqual([version1]);
  });

  it("rejects a stale Draft without merge or rebase", () => {
    const staleSchedule = scheduleWithDraft([version1], {
      ...futureActualDraftCandidate,
      basePublishedVersionId: null,
    });

    const result = publishProjectSchedule(staleSchedule, {
      versionId: toScheduleVersionId("stale-must-not-publish"),
      versionNote: null,
      publishedAt: "2026-09-15T08:00:00.000Z",
      referenceDate,
    });

    expect(result).toEqual({ ok: false, reason: "staleBase", issues: [] });
    expect(staleSchedule.publishedVersions).toEqual([version1]);
  });

  it("rejects a duplicate Published Version ID without altering history", () => {
    const started = startProjectScheduleWorkingDraft(
      { publishedVersions: [version1], workingDraft: null },
      {
        draftId: toScheduleDraftId("duplicate-version-id-draft"),
        createRowId: (row) =>
          toMilestoneRowId(`duplicate-version-id-${String(row.rowId)}`),
      },
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const result = publishProjectSchedule(started.schedule, {
      versionId: version1.id,
      versionNote: "Must not reuse stable ID",
      publishedAt: "2026-09-16T08:00:00.000Z",
      referenceDate,
    });

    expect(result).toEqual({
      ok: false,
      reason: "duplicateVersionId",
      issues: [],
    });
    expect(started.schedule.publishedVersions).toEqual([version1]);
    expect(started.schedule.workingDraft).not.toBeNull();
  });

  it("rejects Publish when no Working Draft exists", () => {
    expect(
      publishProjectSchedule(
        { publishedVersions: [version1], workingDraft: null },
        {
          versionId: toScheduleVersionId("missing-draft-version"),
          versionNote: null,
          publishedAt: "2026-09-15T08:00:00.000Z",
          referenceDate,
        },
      ),
    ).toEqual({ ok: false, reason: "missingDraft", issues: [] });
  });
});
