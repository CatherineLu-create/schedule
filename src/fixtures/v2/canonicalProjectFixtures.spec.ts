import { describe, expect, it } from "vitest";

import { selectOfficialProjectSources } from "../../application/selectors/portfolioSources";
import {
	getLatestPublishedVersion,
	type PublishedScheduleVersion,
} from "../../domain/schedule/schedule";
import {
	toMilestoneDefinitionId,
	toProjectId,
	type MilestoneDefinitionId,
} from "../../domain/shared/ids";
import { getMissingStandardFunctions } from "../../domain/team/teamTemplate";
import {
	canonicalProjectFixtures,
	devProject001,
	devProject002,
	devProject003,
	devProject004,
	devProject005,
	devScenarioToday,
} from "./canonicalProjectFixtures";
import {
	actualWithoutPlanDraftCandidate,
	importAmbiguityDraftCandidate,
	notApplicableWithDateDraftCandidate,
	unmappedMilestoneDraftCandidate,
} from "./scheduleCandidateFixtures";
import {
	devBiosTeamFunctionDefinition,
	devEeTeamFunctionDefinition,
	devMeTeamFunctionDefinition,
	devTeamTemplateV1,
	devTeamTemplateV2,
	devThermalTeamFunctionDefinition,
	validSavedTeamFixture,
} from "./teamTemplateFixtures";

function getPublishedMilestone(
	version: PublishedScheduleVersion,
	definitionId: MilestoneDefinitionId,
) {
	const milestone = version.milestones.find(
		(candidate) => candidate.milestoneDefinitionId === definitionId,
	);

	if (milestone === undefined) {
		throw new Error(`Missing fixture milestone: ${definitionId}`);
	}

	return milestone;
}

function expectUniqueIds<T>(ids: readonly T[]): void {
	expect(new Set(ids).size).toBe(ids.length);
}

describe("canonical V2 Project fixtures", () => {
	it("uses a deterministic scenario reference date", () => {
		expect(devScenarioToday).toBe("2026-09-15");
	});

	it("represents Project 001 without fake Schedule or Team data", () => {
		expect(devProject001.id).toBe("dev-project-001");
		expect(devProject001.master.basicInformation).toMatchObject({
			year: 2027,
			stnProjectName: "DEV Empty Project",
		});
		expect(devProject001.identityAliases).toEqual([]);
		expect(devProject001.schedule).toEqual({
			publishedVersions: [],
			workingDraft: null,
		});
		expect(devProject001.team).toBeNull();
	});

	it("represents Project 002 as the normal Portfolio scenario", () => {
		expect(devProject002.id).toBe("dev-project-002");
		expect(devProject002.schedule.publishedVersions).toHaveLength(1);
		expect(devProject002.schedule.workingDraft).toBeNull();
		expect(devProject002.team).toBe(validSavedTeamFixture);

		const published = devProject002.schedule.publishedVersions[0];

		const completed = getPublishedMilestone(
			published,
			toMilestoneDefinitionId("milestone-design-kickoff"),
		);
		expect(completed).toMatchObject({
			applicability: "applicable",
			plan: "2026-08-15",
			actual: "2026-08-18",
		});

		const notApplicable = getPublishedMilestone(
			published,
			toMilestoneDefinitionId("milestone-design-id-fix"),
		);
		expect(notApplicable).toMatchObject({
			applicability: "notApplicable",
			plan: null,
			actual: null,
		});

		const coming = getPublishedMilestone(
			published,
			toMilestoneDefinitionId("milestone-a1-a-g-o"),
		);
		expect(coming).toMatchObject({
			applicability: "applicable",
			plan: "2026-09-20",
			actual: null,
		});

		const overdue = getPublishedMilestone(
			published,
			toMilestoneDefinitionId("milestone-a1-a-smt"),
		);
		expect(overdue).toMatchObject({
			applicability: "applicable",
			plan: "2026-09-01",
			actual: null,
		});

		const mdrr = getPublishedMilestone(
			published,
			toMilestoneDefinitionId("milestone-mdrr"),
		);
		expect(mdrr).toMatchObject({
			applicability: "applicable",
			plan: "2026-09-25",
			actual: null,
		});
	});

	it("represents Project 003 as a separate duplicate-key Project with v2 official", () => {
		expect(devProject003.id).toBe("dev-project-003");
		expect(devProject003.id).not.toBe(devProject002.id);
		expect(devProject003.master.basicInformation).toMatchObject({
			year: devProject002.master.basicInformation.year,
			productLine: devProject002.master.basicInformation.productLine,
			stnProjectName: devProject002.master.basicInformation.stnProjectName,
		});
		expect(
			devProject003.schedule.publishedVersions.map(
				(version) => version.versionNumber,
			),
		).toEqual([1, 2]);
		expect(devProject003.schedule.workingDraft).toBeNull();

		const latest = getLatestPublishedVersion(devProject003.schedule);
		expect(latest?.id).toBe("dev-project-003-schedule-v2");
		expect(
			getPublishedMilestone(
				latest!,
				toMilestoneDefinitionId("milestone-c1-c-g-o"),
			),
		).toMatchObject({
			plan: "2026-10-01",
			actual: "2026-12-01",
		});
	});

	it("keeps Project 003 on Template v1 until an explicit update", () => {
		const team = devProject003.team;
		expect(team).not.toBeNull();
		expect(team?.appliedTemplate).toEqual({
			templateId: devTeamTemplateV1.id,
			versionNumber: devTeamTemplateV1.versionNumber,
		});
		expect(
			getMissingStandardFunctions(team!, devTeamTemplateV2).map(
				(item) => item.functionId,
			),
		).toEqual([
			devThermalTeamFunctionDefinition.id,
			devBiosTeamFunctionDefinition.id,
		]);
	});

	it("preserves a previous Project 003 identity alias", () => {
		expect(devProject003.identityAliases).toEqual([
			{
				kind: "stnProjectName",
				originalValue: "DEV Project Alpha Legacy",
				normalizedValue: "dev project alpha legacy",
			},
		]);
	});

	it("bases Project 004 invalid Working Draft on its valid Published v1", () => {
		expect(devProject004.schedule.publishedVersions).toHaveLength(1);
		const published = devProject004.schedule.publishedVersions[0];
		const draft = devProject004.schedule.workingDraft;

		expect(draft).not.toBeNull();
		expect(draft?.basePublishedVersionId).toBe(published.id);
		expect(unmappedMilestoneDraftCandidate.basePublishedVersionId).toBeNull();
		expect(notApplicableWithDateDraftCandidate.basePublishedVersionId).toBeNull();
		expect(actualWithoutPlanDraftCandidate.basePublishedVersionId).toBeNull();
		expect(importAmbiguityDraftCandidate.basePublishedVersionId).toBeNull();

		expect(
			draft?.milestones.some(
				(milestone) => milestone.milestoneDefinitionId === null,
			),
		).toBe(true);
		expect(
			draft?.milestones.some(
				(milestone) =>
					milestone.applicability === "notApplicable" &&
					milestone.plan !== null,
			),
		).toBe(true);
		expect(
			draft?.milestones.some(
				(milestone) =>
					milestone.applicability === "applicable" &&
					milestone.plan === null &&
					milestone.actual !== null,
			),
		).toBe(true);
		expect(draft?.importFindings).toContainEqual(
			expect.objectContaining({
				code: "schedule.import.ambiguous-date",
				domain: "schedule",
				source: "import",
				severity: "blocking",
			}),
		);

		const mappedDefinitionIds =
			draft?.milestones.flatMap((milestone) =>
				milestone.milestoneDefinitionId === null
					? []
					: [milestone.milestoneDefinitionId],
			) ?? [];
		expect(new Set(mappedDefinitionIds).size).toBe(
			mappedDefinitionIds.length,
		);

		expect(
			published.milestones.every(
				(milestone) =>
					milestone.milestoneDefinitionId !== null &&
					!(
						milestone.applicability === "notApplicable" &&
						(milestone.plan !== null || milestone.actual !== null)
					) &&
					!(milestone.actual !== null && milestone.plan === null),
			),
		).toBe(true);
	});

	it("keeps Project 004 Working Draft values out of official Portfolio sources", () => {
		const official = selectOfficialProjectSources(
			{ projects: canonicalProjectFixtures },
			devProject004.id,
		);
		const published = devProject004.schedule.publishedVersions[0];
		const draftRowIds = new Set(
			devProject004.schedule.workingDraft?.milestones.map(
				(milestone) => milestone.rowId,
			),
		);

		expect(official?.latestPublishedSchedule).toBe(published);
		expect(
			official?.latestPublishedSchedule?.milestones.some((milestone) =>
				draftRowIds.has(milestone.rowId),
			),
		).toBe(false);
	});

	it("keeps Project 004 Saved Team valid on Template v2", () => {
		const team = devProject004.team;
		expect(team).not.toBeNull();
		expect(team?.appliedTemplate).toEqual({
			templateId: devTeamTemplateV2.id,
			versionNumber: devTeamTemplateV2.versionNumber,
		});
		expect(
			team?.functions.map((functionTeam) =>
				functionTeam.function.kind === "standard"
					? functionTeam.function.functionId
					: null,
			),
		).toEqual([
			devMeTeamFunctionDefinition.id,
			devEeTeamFunctionDefinition.id,
			devThermalTeamFunctionDefinition.id,
			devBiosTeamFunctionDefinition.id,
		]);

		for (const functionTeam of team?.functions ?? []) {
			if (functionTeam.applicability === "notApplicable") {
				expect(functionTeam.assignments).toEqual([]);
			} else {
				expect(
					functionTeam.assignments.filter(
						(assignment) => assignment.role === "owner",
					),
				).toHaveLength(1);
			}
		}
	});

	it("preserves Project 005 punctuation and MDRR overdue scenario data", () => {
		expect(devProject005.id).toBe("dev-project-005");
		expect(devProject005.master.basicInformation.stnProjectName).toBe(
			"Signal_A",
		);
		expect(devProject005.schedule.workingDraft).toBeNull();

		const latest = getLatestPublishedVersion(devProject005.schedule);
		expect(latest).not.toBeNull();
		expect(
			getPublishedMilestone(
				latest!,
				toMilestoneDefinitionId("milestone-mdrr"),
			),
		).toMatchObject({
			applicability: "applicable",
			plan: "2026-09-01",
			actual: null,
		});
	});

	it("keeps Project 005 Saved Team advisory-only and one custom Function", () => {
		const team = devProject005.team;
		expect(team).not.toBeNull();
		expect(team?.appliedTemplate).toEqual({
			templateId: devTeamTemplateV2.id,
			versionNumber: devTeamTemplateV2.versionNumber,
		});

		const missingOwnerFunction = team?.functions.find(
			(functionTeam) =>
				functionTeam.function.kind === "standard" &&
				functionTeam.function.functionId === devMeTeamFunctionDefinition.id,
		);
		expect(missingOwnerFunction?.applicability).toBe("applicable");
		expect(
			missingOwnerFunction?.assignments.filter(
				(assignment) => assignment.role === "owner",
			),
		).toEqual([]);

		const customFunctions =
			team?.functions.filter(
				(functionTeam) => functionTeam.function.kind === "custom",
			) ?? [];
		expect(customFunctions).toHaveLength(1);
		expect(customFunctions[0].function).toEqual({
			kind: "custom",
			functionId: "dev-project-005-custom-audio",
			displayName: "DEV Custom Audio",
		});
		expect(
			customFunctions[0].assignments.filter(
				(assignment) => assignment.role === "owner",
			),
		).toHaveLength(1);

		for (const functionTeam of team?.functions ?? []) {
			expect(
				functionTeam.assignments.filter(
					(assignment) => assignment.role === "owner",
				),
			).toHaveLength(
				functionTeam.assignments.some(
					(assignment) => assignment.role === "owner",
				)
					? 1
					: 0,
			);
			expect(
				functionTeam.assignments.filter(
					(assignment) => assignment.role === "leader",
				),
			).toHaveLength(
				functionTeam.assignments.some(
					(assignment) => assignment.role === "leader",
				)
					? 1
					: 0,
			);

			if (functionTeam.applicability === "notApplicable") {
				expect(functionTeam.assignments).toEqual([]);
			}
		}
	});

	it("contains exactly five unique Projects in stable Project ID order", () => {
		expect(canonicalProjectFixtures).toEqual([
			devProject001,
			devProject002,
			devProject003,
			devProject004,
			devProject005,
		]);
		expect(canonicalProjectFixtures.map((project) => project.id)).toEqual([
			toProjectId("dev-project-001"),
			toProjectId("dev-project-002"),
			toProjectId("dev-project-003"),
			toProjectId("dev-project-004"),
			toProjectId("dev-project-005"),
		]);
		expect(
			new Set(canonicalProjectFixtures.map((project) => project.id)).size,
		).toBe(5);
	});

	it("keeps Projects 002 and 003 business-identical but ID-distinct", () => {
		const project002Identity = devProject002.master.basicInformation;
		const project003Identity = devProject003.master.basicInformation;

		expect({
			year: project002Identity.year,
			productLine: project002Identity.productLine,
			stnProjectName: project002Identity.stnProjectName,
		}).toEqual({
			year: project003Identity.year,
			productLine: project003Identity.productLine,
			stnProjectName: project003Identity.stnProjectName,
		});
		expect(devProject002.id).not.toBe(devProject003.id);
	});

	it("uses explicit unique nested IDs without a fake Schedule v0", () => {
		const versionIds = canonicalProjectFixtures.flatMap((project) =>
			project.schedule.publishedVersions.map((version) => version.id),
		);
		const draftIds = canonicalProjectFixtures.flatMap((project) =>
			project.schedule.workingDraft === null
				? []
				: [project.schedule.workingDraft.id],
		);
		const milestoneRowIds = canonicalProjectFixtures.flatMap((project) => [
			...project.schedule.publishedVersions.flatMap((version) =>
				version.milestones.map((milestone) => milestone.rowId),
			),
			...(project.schedule.workingDraft?.milestones.map(
				(milestone) => milestone.rowId,
			) ?? []),
		]);
		const assignmentIds = canonicalProjectFixtures.flatMap((project) => {
			if (project.team === null) {
				return [];
			}

			return [
				project.team.projectRoles.qciPm?.assignmentId,
				project.team.projectRoles.qciPjm?.assignmentId,
				project.team.projectRoles.acerPm?.assignmentId,
				...project.team.functions.flatMap((functionTeam) =>
					functionTeam.assignments.map(
						(assignment) => assignment.assignmentId,
					),
				),
			].filter((id): id is NonNullable<typeof id> => id !== undefined);
		});

		expectUniqueIds(versionIds);
		expectUniqueIds(draftIds);
		expectUniqueIds(milestoneRowIds);
		expectUniqueIds(assignmentIds);

		expect(
			canonicalProjectFixtures.map((project) =>
				project.schedule.publishedVersions.map(
					(version) => version.versionNumber,
				),
			),
		).toEqual([[], [1], [1, 2], [1], [1]]);
	});
});
