import { mdrrMilestoneDefinition } from "../../config/v2/referenceData";
import type { ScheduleWorkingDraft } from "../../domain/schedule/schedule";
import { parseDateOnly, type DateOnly } from "../../domain/shared/dateOnly";
import {
	toMilestoneRowId,
	toScheduleDraftId,
} from "../../domain/shared/ids";

function fixtureDate(value: string): DateOnly {
	const parsed = parseDateOnly(value);

	if (parsed === null) {
		throw new Error(`Invalid V2 fixture DateOnly: ${value}`);
	}

	return parsed;
}

export const unmappedMilestoneDraftCandidate: ScheduleWorkingDraft = {
	id: toScheduleDraftId("candidate-schedule-unmapped"),
	basePublishedVersionId: null,
	milestones: [
		{
			rowId: toMilestoneRowId("candidate-schedule-unmapped-row"),
			milestoneDefinitionId: null,
			rawMilestoneIdentity: {
				name: "DEV Unmapped Milestone",
				stageGroupName: "DEV Candidate Stage",
				milestoneTypeName: null,
			},
			applicability: "applicable",
			plan: fixtureDate("2026-09-10"),
			actual: null,
		},
	],
	importFindings: [],
};

export const notApplicableWithDateDraftCandidate: ScheduleWorkingDraft = {
	id: toScheduleDraftId("candidate-schedule-not-applicable-with-date"),
	basePublishedVersionId: null,
	milestones: [
		{
			rowId: toMilestoneRowId(
				"candidate-schedule-not-applicable-with-date-row",
			),
			milestoneDefinitionId: mdrrMilestoneDefinition.id,
			rawMilestoneIdentity: null,
			applicability: "notApplicable",
			plan: fixtureDate("2026-10-01"),
			actual: null,
		},
	],
	importFindings: [],
};

export const actualWithoutPlanDraftCandidate: ScheduleWorkingDraft = {
	id: toScheduleDraftId("candidate-schedule-actual-without-plan"),
	basePublishedVersionId: null,
	milestones: [
		{
			rowId: toMilestoneRowId(
				"candidate-schedule-actual-without-plan-row",
			),
			milestoneDefinitionId: mdrrMilestoneDefinition.id,
			rawMilestoneIdentity: null,
			applicability: "applicable",
			plan: null,
			actual: fixtureDate("2026-10-15"),
		},
	],
	importFindings: [],
};

export const futureActualDraftCandidate: ScheduleWorkingDraft = {
	id: toScheduleDraftId("candidate-schedule-future-actual"),
	basePublishedVersionId: null,
	milestones: [
		{
			rowId: toMilestoneRowId("candidate-schedule-future-actual-row"),
			milestoneDefinitionId: mdrrMilestoneDefinition.id,
			rawMilestoneIdentity: null,
			applicability: "applicable",
			plan: fixtureDate("2026-10-01"),
			actual: fixtureDate("2026-12-01"),
		},
	],
	importFindings: [],
};

export const importAmbiguityDraftCandidate: ScheduleWorkingDraft = {
	id: toScheduleDraftId("candidate-schedule-import-ambiguity"),
	basePublishedVersionId: null,
	milestones: [
		{
			rowId: toMilestoneRowId(
				"candidate-schedule-import-ambiguity-row",
			),
			milestoneDefinitionId: mdrrMilestoneDefinition.id,
			rawMilestoneIdentity: null,
			applicability: "applicable",
			plan: fixtureDate("2026-10-01"),
			actual: null,
		},
	],
	importFindings: [
		{
			code: "schedule.import.ambiguous-date",
			domain: "schedule",
			source: "import",
			severity: "blocking",
			message: "DEV import candidate contains two possible dates.",
			target: {
				section: "schedule",
				entityId: "candidate-schedule-import-ambiguity-row",
				field: "plan",
			},
		},
	],
};

export const rawApplicabilityTokenCandidates = {
	recognizedNotApplicable: ["NA", "N/A"],
	legacyUnrecognized: ["-/*"],
} as const;
