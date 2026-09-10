import {
	appendPublishedVersion,
	createWorkingDraftFromLatestPublished,
	discardWorkingDraft,
	getLatestPublishedVersion,
	replaceWorkingDraft,
	toScheduleVersionNumber,
	type CreateWorkingDraftFromLatestPublishedInput,
	type PublishedScheduleMilestone,
	type PublishedScheduleVersion,
	type ProjectSchedule,
	type ScheduleWorkingDraft,
} from "../../domain/schedule/schedule";
import { validateScheduleWorkingDraft } from "../../domain/schedule/scheduleValidation";
import type { DateOnly } from "../../domain/shared/dateOnly";
import type {
	ScheduleDraftId,
	ScheduleVersionId,
} from "../../domain/shared/ids";
import type { ValidationIssue } from "../../domain/validation/validationIssue";
import { countBlocking } from "../../domain/validation/validationIssue";

export interface StartProjectScheduleWorkingDraftInput {
	readonly draftId: ScheduleDraftId;
	readonly createRowId: CreateWorkingDraftFromLatestPublishedInput["createRowId"];
}

export type StartProjectScheduleWorkingDraftResult =
	| {
			readonly ok: true;
			readonly schedule: ProjectSchedule;
			readonly draft: ScheduleWorkingDraft;
	  }
	| {
			readonly ok: false;
			readonly reason: "workingDraftExists";
	  };

export function startProjectScheduleWorkingDraft(
	schedule: ProjectSchedule,
	input: StartProjectScheduleWorkingDraftInput,
): StartProjectScheduleWorkingDraftResult {
	if (schedule.workingDraft !== null) {
		return { ok: false, reason: "workingDraftExists" };
	}

	const draft = createWorkingDraftFromLatestPublished(schedule, {
		id: input.draftId,
		createRowId: input.createRowId,
	});

	return {
		ok: true,
		draft,
		schedule: {
			...schedule,
			workingDraft: draft,
		},
	};
}

export type ReplaceProjectScheduleWorkingDraftResult =
	| { readonly ok: true; readonly schedule: ProjectSchedule }
	| { readonly ok: false; readonly reason: "staleBase" };

export function replaceProjectScheduleWorkingDraft(
	schedule: ProjectSchedule,
	replacement: ScheduleWorkingDraft,
): ReplaceProjectScheduleWorkingDraftResult {
	const expectedBase = getLatestPublishedVersion(schedule)?.id ?? null;

	if (replacement.basePublishedVersionId !== expectedBase) {
		return { ok: false, reason: "staleBase" };
	}

	return {
		ok: true,
		schedule: replaceWorkingDraft(schedule, replacement),
	};
}

export function discardProjectScheduleWorkingDraft(
	schedule: ProjectSchedule,
): ProjectSchedule {
	return discardWorkingDraft(schedule);
}

export interface PublishProjectScheduleInput {
	readonly versionId: ScheduleVersionId;
	readonly versionNote: string | null;
	readonly publishedAt: string;
	readonly referenceDate: DateOnly;
}

export type PublishProjectScheduleResult =
	| {
			readonly ok: true;
			readonly schedule: ProjectSchedule;
			readonly version: PublishedScheduleVersion;
			readonly issues: readonly ValidationIssue[];
	  }
	| {
			readonly ok: false;
			readonly reason:
				| "missingDraft"
				| "staleBase"
				| "duplicateVersionId"
				| "validation";
			readonly issues: readonly ValidationIssue[];
	  };

function toPublishedMilestone(
	row: ScheduleWorkingDraft["milestones"][number],
): PublishedScheduleMilestone {
	if (row.milestoneDefinitionId === null) {
		throw new Error("Validated Draft contains an unmapped milestone");
	}

	return {
		rowId: row.rowId,
		milestoneDefinitionId: row.milestoneDefinitionId,
		applicability: row.applicability,
		plan: row.plan,
		actual: row.actual,
	};
}

export function publishProjectSchedule(
	schedule: ProjectSchedule,
	input: PublishProjectScheduleInput,
): PublishProjectScheduleResult {
	const draft = schedule.workingDraft;

	if (draft === null) {
		return { ok: false, reason: "missingDraft", issues: [] };
	}

	const latest = getLatestPublishedVersion(schedule);
	if (draft.basePublishedVersionId !== (latest?.id ?? null)) {
		return { ok: false, reason: "staleBase", issues: [] };
	}

	if (
		schedule.publishedVersions.some(
			(version) => version.id === input.versionId,
		)
	) {
		return { ok: false, reason: "duplicateVersionId", issues: [] };
	}

	const issues = validateScheduleWorkingDraft(draft, {
		referenceDate: input.referenceDate,
	});

	if (countBlocking(issues) > 0) {
		return { ok: false, reason: "validation", issues };
	}

	const version: PublishedScheduleVersion = {
		id: input.versionId,
		versionNumber: toScheduleVersionNumber(
			(latest?.versionNumber ?? 0) + 1,
		),
		versionNote: input.versionNote,
		publishedAt: input.publishedAt,
		milestones: draft.milestones.map(toPublishedMilestone),
	};
	const appended = appendPublishedVersion(schedule, version);

	return {
		ok: true,
		version,
		issues,
		schedule: {
			...appended,
			workingDraft: null,
		},
	};
}
