import { compareDateOnly, type DateOnly } from "../shared/dateOnly";
import type { ValidationIssue } from "../validation/validationIssue";
import type {
	PublishedScheduleMilestone,
	PublishedScheduleVersion,
	ScheduleWorkingDraft,
	WorkingDraftMilestone,
} from "./schedule";

export interface ScheduleValidationContext {
	readonly referenceDate: DateOnly;
}

type ScheduleMilestoneDates = Pick<
	PublishedScheduleMilestone,
	"rowId" | "applicability" | "plan" | "actual"
>;

function scheduleIssue(
	row: ScheduleMilestoneDates,
	issue: Pick<ValidationIssue, "code" | "source" | "severity" | "message"> & {
		readonly field?: string;
	},
): ValidationIssue {
	return {
		code: issue.code,
		domain: "schedule",
		source: issue.source,
		severity: issue.severity,
		message: issue.message,
		target: {
			section: "schedule",
			entityId: row.rowId,
			...(issue.field === undefined ? {} : { field: issue.field }),
		},
	};
}

function validateScheduleMilestoneData(
	row: ScheduleMilestoneDates,
	context: ScheduleValidationContext,
): ValidationIssue[] {
	if (row.applicability === "notApplicable") {
		return [];
	}

	const issues: ValidationIssue[] = [];

	if (row.plan === null && row.actual === null) {
		issues.push(
			scheduleIssue(row, {
				code: "schedule.data.missing-plan-and-actual",
				source: "data",
				severity: "blocking",
				message: "Applicable milestone requires a Plan date.",
				field: "plan",
			}),
		);
	} else if (row.actual !== null && row.plan === null) {
		issues.push(
			scheduleIssue(row, {
				code: "schedule.data.actual-without-plan",
				source: "data",
				severity: "blocking",
				message: "Actual date requires a Plan date.",
				field: "plan",
			}),
		);
	}

	if (
		row.actual !== null &&
		compareDateOnly(row.actual, context.referenceDate) > 0
	) {
		issues.push(
			scheduleIssue(row, {
				code: "schedule.data.future-actual",
				source: "data",
				severity: "advisory",
				message: "Actual date is later than the validation reference date.",
				field: "actual",
			}),
		);
	}

	return issues;
}

function validateDraftMilestoneImportState(
	row: WorkingDraftMilestone,
): ValidationIssue[] {
	const issues: ValidationIssue[] = [];

	if (row.milestoneDefinitionId === null) {
		issues.push(
			scheduleIssue(row, {
				code: "schedule.import.unmapped-milestone",
				source: "import",
				severity: "blocking",
				message: "Milestone must be mapped to a catalog definition.",
				field: "milestoneDefinitionId",
			}),
		);
	}

	if (
		row.applicability === "notApplicable" &&
		(row.plan !== null || row.actual !== null)
	) {
		issues.push(
			scheduleIssue(row, {
				code: "schedule.import.not-applicable-with-date",
				source: "import",
				severity: "blocking",
				message: "Not Applicable milestone cannot contain Plan or Actual dates.",
				field: row.plan !== null ? "plan" : "actual",
			}),
		);
	}

	return issues;
}

function duplicateMilestoneIssues(
	rows: readonly WorkingDraftMilestone[],
): ValidationIssue[] {
	const seen = new Set<string>();
	const issues: ValidationIssue[] = [];

	for (const row of rows) {
		if (row.milestoneDefinitionId === null) {
			continue;
		}

		if (seen.has(row.milestoneDefinitionId)) {
			issues.push(
				scheduleIssue(row, {
					code: "schedule.import.duplicate-milestone",
					source: "import",
					severity: "blocking",
					message: "Milestone appears more than once in the Working Draft.",
					field: "milestoneDefinitionId",
				}),
			);
			continue;
		}

		seen.add(row.milestoneDefinitionId);
	}

	return issues;
}

export function validateScheduleWorkingDraft(
	draft: ScheduleWorkingDraft,
	context: ScheduleValidationContext,
): readonly ValidationIssue[] {
	return [
		...draft.importFindings,
		...draft.milestones.flatMap(validateDraftMilestoneImportState),
		...duplicateMilestoneIssues(draft.milestones),
		...draft.milestones.flatMap((row) =>
			validateScheduleMilestoneData(row, context),
		),
	];
}

export function validatePublishedScheduleVersion(
	version: PublishedScheduleVersion,
	context: ScheduleValidationContext,
): readonly ValidationIssue[] {
	return version.milestones.flatMap((row) =>
		validateScheduleMilestoneData(row, context),
	);
}
