import { describe, expect, it } from "vitest";

import {
	devProject001,
	devProject002,
	devProject003,
	devProject004,
	devScenarioToday,
} from "../../fixtures/v2/canonicalProjectFixtures";
import { futureActualDraftCandidate } from "../../fixtures/v2/scheduleCandidateFixtures";
import type { Project } from "../../domain/project/project";
import {
	toMilestoneRowId,
	toScheduleDraftId,
	toScheduleVersionId,
} from "../../domain/shared/ids";
import type { ScheduleWorkingDraft } from "../../domain/schedule/schedule";
import {
	discardProjectScheduleWorkingDraft,
	publishProjectSchedule,
	replaceProjectScheduleWorkingDraft,
	startProjectScheduleWorkingDraft,
} from "./scheduleCommands";

describe("Schedule Working Draft commands", () => {
	it("starts a first-ever Draft with no fake v0", () => {
		const result = startProjectScheduleWorkingDraft(devProject001, {
			draftId: toScheduleDraftId("dev-project-001-first-draft"),
			createRowId: () => toMilestoneRowId("unexpected-row"),
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.draft.basePublishedVersionId).toBeNull();
		expect(result.project.schedule.publishedVersions).toEqual([]);
		expect(result.project.schedule.workingDraft).toBe(result.draft);
		expect(devProject001.schedule.workingDraft).toBeNull();
	});

	it("starts normal editing from the latest Published version", () => {
		const latest = devProject003.schedule.publishedVersions[1];
		const result = startProjectScheduleWorkingDraft(devProject003, {
			draftId: toScheduleDraftId("dev-project-003-new-draft"),
			createRowId: (row) =>
				toMilestoneRowId(`draft-copy-${String(row.rowId)}`),
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.draft.basePublishedVersionId).toBe(latest?.id);
		expect(result.draft.milestones).toHaveLength(latest?.milestones.length ?? 0);
		expect(result.draft.milestones).not.toBe(latest?.milestones);
	});

	it("does not overwrite an existing Working Draft implicitly", () => {
		const existing = devProject004.schedule.workingDraft;
		const result = startProjectScheduleWorkingDraft(devProject004, {
			draftId: toScheduleDraftId("replacement-without-confirmation"),
			createRowId: () => toMilestoneRowId("replacement-row"),
		});

		expect(result).toEqual({
			ok: false,
			reason: "workingDraftExists",
		});
		expect(devProject004.schedule.workingDraft).toBe(existing);
	});

	it("replaces the whole Draft only when its base matches latest Published", () => {
		const published = devProject004.schedule.publishedVersions[0];
		const replacement: ScheduleWorkingDraft = {
			id: toScheduleDraftId("dev-project-004-explicit-replacement"),
			basePublishedVersionId: published?.id ?? null,
			milestones: [],
			importFindings: [],
		};

		const result = replaceProjectScheduleWorkingDraft(
			devProject004,
			replacement,
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.project.schedule.workingDraft).toBe(replacement);
		expect(result.project.schedule.publishedVersions).toBe(
			devProject004.schedule.publishedVersions,
		);
		expect(result.project.schedule.workingDraft?.milestones).toEqual([]);
	});

	it("rejects a stale replacement as a normal command outcome", () => {
		const replacement: ScheduleWorkingDraft = {
			id: toScheduleDraftId("dev-project-004-stale-replacement"),
			basePublishedVersionId: null,
			milestones: [],
			importFindings: [],
		};

		expect(
			replaceProjectScheduleWorkingDraft(devProject004, replacement),
		).toEqual({ ok: false, reason: "staleBase" });
	});

	it("discards only the Working Draft through an explicit command", () => {
		const updated = discardProjectScheduleWorkingDraft(devProject004);

		expect(updated.schedule.workingDraft).toBeNull();
		expect(updated.schedule.publishedVersions).toBe(
			devProject004.schedule.publishedVersions,
		);
		expect(updated.master).toBe(devProject004.master);
		expect(updated.team).toBe(devProject004.team);
	});
});

describe("Schedule Publish command", () => {
	it("rejects canonical Project 004 and returns its Blocking issues", () => {
		const result = publishProjectSchedule(devProject004, {
			versionId: toScheduleVersionId("dev-project-004-rejected-v2"),
			versionNote: "Must not publish",
			publishedAt: "2026-09-15T08:00:00.000Z",
			referenceDate: devScenarioToday,
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe("validation");
		expect(result.issues.some((issue) => issue.severity === "blocking")).toBe(
			true,
		);
		expect(devProject004.schedule.publishedVersions).toHaveLength(1);
		expect(devProject004.schedule.workingDraft).not.toBeNull();
	});

	it("publishes an Advisory-only first Draft as v1, persists note, and clears Draft", () => {
		const project: Project = {
			...devProject001,
			schedule: {
				publishedVersions: [],
				workingDraft: futureActualDraftCandidate,
			},
		};

		const result = publishProjectSchedule(project, {
			versionId: toScheduleVersionId("dev-project-001-schedule-v1"),
			versionNote: "DEV first schedule",
			publishedAt: "2026-09-15T08:00:00.000Z",
			referenceDate: devScenarioToday,
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
			id: "dev-project-001-schedule-v1",
			versionNumber: 1,
			versionNote: "DEV first schedule",
			publishedAt: "2026-09-15T08:00:00.000Z",
		});
		expect(result.project.schedule.publishedVersions).toEqual([result.version]);
		expect(result.project.schedule.workingDraft).toBeNull();
		expect(result.project.id).toBe(project.id);
		expect(result.project.master).toBe(project.master);
		expect(result.project.team).toBe(project.team);
	});

	it("increments latest version and preserves append-only history objects", () => {
		const originalVersion = devProject002.schedule.publishedVersions[0];
		const started = startProjectScheduleWorkingDraft(devProject002, {
			draftId: toScheduleDraftId("dev-project-002-schedule-draft-v2"),
			createRowId: (row) =>
				toMilestoneRowId(`dev-project-002-v2-${String(row.rowId)}`),
		});
		expect(started.ok).toBe(true);
		if (!started.ok) return;

		const result = publishProjectSchedule(started.project, {
			versionId: toScheduleVersionId("dev-project-002-schedule-v2"),
			versionNote: "DEV schedule update",
			publishedAt: "2026-09-16T08:00:00.000Z",
			referenceDate: devScenarioToday,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.version.versionNumber).toBe(2);
		expect(result.version.versionNote).toBe("DEV schedule update");
		expect(result.project.schedule.publishedVersions).toHaveLength(2);
		expect(result.project.schedule.publishedVersions[0]).toBe(originalVersion);
		expect(result.project.schedule.workingDraft).toBeNull();
		expect(devProject002.schedule.publishedVersions).toEqual([originalVersion]);
	});

	it("rejects a stale Draft without merge or rebase", () => {
		const staleProject: Project = {
			...devProject002,
			schedule: {
				...devProject002.schedule,
				workingDraft: {
					...futureActualDraftCandidate,
					basePublishedVersionId: null,
				},
			},
		};

		const result = publishProjectSchedule(staleProject, {
			versionId: toScheduleVersionId("stale-must-not-publish"),
			versionNote: null,
			publishedAt: "2026-09-15T08:00:00.000Z",
			referenceDate: devScenarioToday,
		});

		expect(result).toEqual({ ok: false, reason: "staleBase", issues: [] });
		expect(staleProject.schedule.publishedVersions).toBe(
			devProject002.schedule.publishedVersions,
		);
	});

	it("rejects a duplicate Published Version ID without altering history", () => {
		const started = startProjectScheduleWorkingDraft(devProject002, {
			draftId: toScheduleDraftId("duplicate-version-id-draft"),
			createRowId: (row) =>
				toMilestoneRowId(`duplicate-version-id-${String(row.rowId)}`),
		});
		expect(started.ok).toBe(true);
		if (!started.ok) return;

		const existingVersionId = devProject002.schedule.publishedVersions[0]!.id;
		const result = publishProjectSchedule(started.project, {
			versionId: existingVersionId,
			versionNote: "Must not reuse stable ID",
			publishedAt: "2026-09-16T08:00:00.000Z",
			referenceDate: devScenarioToday,
		});

		expect(result).toEqual({
			ok: false,
			reason: "duplicateVersionId",
			issues: [],
		});
		expect(started.project.schedule.publishedVersions).toBe(
			devProject002.schedule.publishedVersions,
		);
		expect(started.project.schedule.workingDraft).not.toBeNull();
	});

	it("rejects Publish when no Working Draft exists", () => {
		expect(
			publishProjectSchedule(devProject002, {
				versionId: toScheduleVersionId("missing-draft-version"),
				versionNote: null,
				publishedAt: "2026-09-15T08:00:00.000Z",
				referenceDate: devScenarioToday,
			}),
		).toEqual({ ok: false, reason: "missingDraft", issues: [] });
	});
});
