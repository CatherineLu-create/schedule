import { describe, expect, it } from "vitest";

import {
	actualWithoutPlanDraftCandidate,
	futureActualDraftCandidate,
	importAmbiguityDraftCandidate,
	notApplicableWithDateDraftCandidate,
	unmappedMilestoneDraftCandidate,
} from "../../fixtures/v2/scheduleCandidateFixtures";
import { mdrrMilestoneDefinition } from "../../config/v2/referenceData";
import { parseDateOnly, type DateOnly } from "../shared/dateOnly";
import {
	toMilestoneDefinitionId,
	toMilestoneRowId,
	toScheduleDraftId,
	toScheduleVersionId,
} from "../shared/ids";
import {
	toScheduleVersionNumber,
	type PublishedScheduleVersion,
	type ScheduleWorkingDraft,
} from "./schedule";
import {
	validatePublishedScheduleVersion,
	validateScheduleWorkingDraft,
} from "./scheduleValidation";

function dateOnly(value: string): DateOnly {
	const parsed = parseDateOnly(value);

	if (parsed === null) {
		throw new Error(`Invalid test DateOnly: ${value}`);
	}

	return parsed;
}

function issueSummary(draft: ScheduleWorkingDraft) {
	return validateScheduleWorkingDraft(draft, {
		referenceDate: devScenarioToday,
	}).map(({ code, source, severity }) => ({ code, source, severity }));
}

const devScenarioToday = dateOnly("2026-09-15");

const combinedInvalidDraft: ScheduleWorkingDraft = {
	id: toScheduleDraftId("validation-combined-invalid-draft"),
	basePublishedVersionId: null,
	milestones: [
		{
			...unmappedMilestoneDraftCandidate.milestones[0]!,
			rowId: toMilestoneRowId("validation-combined-unmapped"),
		},
		{
			...notApplicableWithDateDraftCandidate.milestones[0]!,
			rowId: toMilestoneRowId("validation-combined-not-applicable"),
			milestoneDefinitionId: toMilestoneDefinitionId(
				"milestone-design-id-fix",
			),
		},
		{
			...actualWithoutPlanDraftCandidate.milestones[0]!,
			rowId: toMilestoneRowId("validation-combined-actual-without-plan"),
			milestoneDefinitionId: toMilestoneDefinitionId("milestone-c1-c-test"),
		},
		{
			...importAmbiguityDraftCandidate.milestones[0]!,
			rowId: toMilestoneRowId("validation-combined-import-ambiguity"),
			milestoneDefinitionId: toMilestoneDefinitionId("milestone-c2-c-smt"),
		},
	],
	importFindings: importAmbiguityDraftCandidate.importFindings,
};

const publishedFutureActualVersion: PublishedScheduleVersion = {
	id: toScheduleVersionId("validation-published-v2"),
	versionNumber: toScheduleVersionNumber(2),
	versionNote: "Validation fixture",
	publishedAt: "2026-09-10T00:00:00Z",
	milestones: [
		{
			rowId: toMilestoneRowId("validation-published-future-actual"),
			milestoneDefinitionId: mdrrMilestoneDefinition.id,
			applicability: "applicable",
			plan: dateOnly("2026-09-01"),
			actual: dateOnly("2026-12-01"),
		},
	],
};

describe("Schedule Working Draft validation", () => {
	it("classifies an unmapped milestone as Blocking Import", () => {
		expect(issueSummary(unmappedMilestoneDraftCandidate)).toContainEqual({
			code: "schedule.import.unmapped-milestone",
			source: "import",
			severity: "blocking",
		});
	});

	it("classifies Not Applicable with a date as Blocking Import", () => {
		expect(issueSummary(notApplicableWithDateDraftCandidate)).toContainEqual({
			code: "schedule.import.not-applicable-with-date",
			source: "import",
			severity: "blocking",
		});
	});

	it("classifies Actual without Plan as Blocking Data", () => {
		expect(issueSummary(actualWithoutPlanDraftCandidate)).toContainEqual({
			code: "schedule.data.actual-without-plan",
			source: "data",
			severity: "blocking",
		});
	});

	it("classifies an Applicable milestone without Plan or Actual as Blocking Data", () => {
		const draft: ScheduleWorkingDraft = {
			id: toScheduleDraftId("validation-draft-missing-dates"),
			basePublishedVersionId: null,
			milestones: [
				{
					rowId: toMilestoneRowId("validation-row-missing-dates"),
					milestoneDefinitionId: mdrrMilestoneDefinition.id,
					rawMilestoneIdentity: null,
					applicability: "applicable",
					plan: null,
					actual: null,
				},
			],
			importFindings: [],
		};

		expect(issueSummary(draft)).toEqual([
			{
				code: "schedule.data.missing-plan-and-actual",
				source: "data",
				severity: "blocking",
			},
		]);
	});

	it("keeps non-recomputable Blocking Import findings", () => {
		expect(issueSummary(importAmbiguityDraftCandidate)).toContainEqual({
			code: "schedule.import.ambiguous-date",
			source: "import",
			severity: "blocking",
		});
	});

	it("blocks duplicate mapped milestone identity even when dates match", () => {
		const row = notApplicableWithDateDraftCandidate.milestones[0];
		const draft: ScheduleWorkingDraft = {
			id: toScheduleDraftId("validation-draft-duplicate"),
			basePublishedVersionId: null,
			milestones: [
				{
					...row,
					rowId: toMilestoneRowId("validation-row-duplicate-1"),
					applicability: "applicable",
				},
				{
					...row,
					rowId: toMilestoneRowId("validation-row-duplicate-2"),
					applicability: "applicable",
				},
			],
			importFindings: [],
		};

		expect(issueSummary(draft)).toContainEqual({
			code: "schedule.import.duplicate-milestone",
			source: "import",
			severity: "blocking",
		});
	});

	it("classifies Actual after the reference date as Advisory Data", () => {
		expect(issueSummary(futureActualDraftCandidate)).toEqual([
			{
				code: "schedule.data.future-actual",
				source: "data",
				severity: "advisory",
			},
		]);
	});

	it("does not warn solely because Actual differs from Plan", () => {
		const baseRow = futureActualDraftCandidate.milestones[0];
		const draft: ScheduleWorkingDraft = {
			id: toScheduleDraftId("validation-draft-plan-variance"),
			basePublishedVersionId: null,
			milestones: [
				{
					...baseRow,
					rowId: toMilestoneRowId("validation-row-late-actual"),
					plan: dateOnly("2026-09-01"),
					actual: dateOnly("2026-09-10"),
				},
				{
					...baseRow,
					rowId: toMilestoneRowId("validation-row-early-actual"),
					milestoneDefinitionId: null,
					rawMilestoneIdentity: {
						name: "DEV mapped separately after review",
						stageGroupName: null,
						milestoneTypeName: null,
					},
					plan: dateOnly("2026-09-10"),
					actual: dateOnly("2026-09-01"),
				},
			],
			importFindings: [],
		};

		const issues = validateScheduleWorkingDraft(draft, {
			referenceDate: dateOnly("2026-09-15"),
		});

		// The unresolved second row is an import issue; neither row produces variance issues.
		expect(issues.map((issue) => issue.code)).toEqual([
			"schedule.import.unmapped-milestone",
		]);
	});

	it("finds all approved predecessor Draft blockers without mutating the Draft", () => {
		const issues = validateScheduleWorkingDraft(combinedInvalidDraft, {
			referenceDate: devScenarioToday,
		});

		expect(issues.filter((issue) => issue.severity === "blocking").length).toBe(
			4,
		);
		expect(new Set(issues.map((issue) => issue.code))).toEqual(
			new Set([
				"schedule.import.ambiguous-date",
				"schedule.import.unmapped-milestone",
				"schedule.import.not-applicable-with-date",
				"schedule.data.actual-without-plan",
				"schedule.data.future-actual",
			]),
		);
		expect(combinedInvalidDraft.milestones).toHaveLength(4);
	});
});

describe("Published Schedule inspection", () => {
	it("derives future Actual as Advisory without changing the Published snapshot", () => {
		const originalMilestones = publishedFutureActualVersion.milestones;
		const issues = validatePublishedScheduleVersion(publishedFutureActualVersion, {
			referenceDate: devScenarioToday,
		});

		expect(issues).toContainEqual(
			expect.objectContaining({
				code: "schedule.data.future-actual",
				domain: "schedule",
				source: "data",
				severity: "advisory",
			}),
		);
		expect(publishedFutureActualVersion.milestones).toBe(originalMilestones);
		expect(publishedFutureActualVersion.id).toBe(
			toScheduleVersionId("validation-published-v2"),
		);
		expect(publishedFutureActualVersion.versionNumber).toBe(
			toScheduleVersionNumber(2),
		);
	});
});
