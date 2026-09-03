import { describe, expect, expectTypeOf, it } from "vitest";
import { mdrrMilestoneDefinition } from "../../config/v2/referenceData";
import type { ScheduleWorkingDraft } from "../../domain/schedule/schedule";
import * as scheduleFixtures from "./scheduleCandidateFixtures";
import {
	actualWithoutPlanDraftCandidate,
	futureActualDraftCandidate,
	importAmbiguityDraftCandidate,
	notApplicableWithDateDraftCandidate,
	rawApplicabilityTokenCandidates,
	unmappedMilestoneDraftCandidate,
} from "./scheduleCandidateFixtures";

describe("Schedule Working Draft candidate fixtures", () => {
	it("represents an applicable unmapped milestone with raw identity", () => {
		const [row] = unmappedMilestoneDraftCandidate.milestones;

		expect(unmappedMilestoneDraftCandidate.id).toBe(
			"candidate-schedule-unmapped",
		);
		expect(unmappedMilestoneDraftCandidate.basePublishedVersionId).toBeNull();
		expect(row).toEqual({
			rowId: "candidate-schedule-unmapped-row",
			milestoneDefinitionId: null,
			rawMilestoneIdentity: {
				name: "DEV Unmapped Milestone",
				stageGroupName: "DEV Candidate Stage",
				milestoneTypeName: null,
			},
			applicability: "applicable",
			plan: "2026-09-10",
			actual: null,
		});
	});

	it("represents notApplicable with a deterministic Plan for later validation", () => {
		const [row] = notApplicableWithDateDraftCandidate.milestones;

		expect(row?.milestoneDefinitionId).toBe(mdrrMilestoneDefinition.id);
		expect(row?.applicability).toBe("notApplicable");
		expect(row?.plan).toBe("2026-10-01");
		expect(row?.actual).toBeNull();
	});

	it("represents an applicable mapped milestone with Actual but no Plan", () => {
		const [row] = actualWithoutPlanDraftCandidate.milestones;

		expect(row?.milestoneDefinitionId).toBe(mdrrMilestoneDefinition.id);
		expect(row?.applicability).toBe("applicable");
		expect(row?.plan).toBeNull();
		expect(row?.actual).toBe("2026-10-15");
	});

	it("uses explicit deterministic Plan and later Actual values without a clock", () => {
		const [row] = futureActualDraftCandidate.milestones;

		expect(row?.plan).toBe("2026-10-01");
		expect(row?.actual).toBe("2026-12-01");
	});

	it("retains a non-recomputable blocking import ambiguity finding", () => {
		const [finding] = importAmbiguityDraftCandidate.importFindings;

		expect(importAmbiguityDraftCandidate.milestones[0]?.milestoneDefinitionId).toBe(
			mdrrMilestoneDefinition.id,
		);
		expect(finding).toEqual({
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
		});
	});

	it("keeps candidate IDs explicit and does not redefine Milestone Definitions", () => {
		const candidates = [
			unmappedMilestoneDraftCandidate,
			notApplicableWithDateDraftCandidate,
			actualWithoutPlanDraftCandidate,
			futureActualDraftCandidate,
			importAmbiguityDraftCandidate,
		];

		expect(new Set(candidates.map(({ id }) => id)).size).toBe(5);
		expectTypeOf(candidates).toMatchTypeOf<
			readonly ScheduleWorkingDraft[]
		>();
		expect(scheduleFixtures).not.toHaveProperty("milestoneDefinitions");
	});
});

describe("raw applicability token candidates", () => {
	it("separates explicit NA tokens from an unresolved legacy token", () => {
		expect(rawApplicabilityTokenCandidates).toEqual({
			recognizedNotApplicable: ["NA", "N/A"],
			legacyUnrecognized: ["-/*"],
		});
		expect(
			rawApplicabilityTokenCandidates.recognizedNotApplicable,
		).not.toContain("-/*");
	});
});
