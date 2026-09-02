import { describe, expect, it } from "vitest";
import type { Project } from "../../domain/project/project";
import type { ProjectMaster } from "../../domain/project/projectMaster";
import type {
	PublishedScheduleVersion,
	ScheduleWorkingDraft,
} from "../../domain/schedule/schedule";
import { toScheduleVersionNumber } from "../../domain/schedule/schedule";
import { parseDateOnly } from "../../domain/shared/dateOnly";
import {
	toMilestoneDefinitionId,
	toMilestoneRowId,
	toPersonAssignmentId,
	toProjectId,
	toScheduleDraftId,
	toScheduleVersionId,
} from "../../domain/shared/ids";
import type { ProjectTeam } from "../../domain/team/team";
import { prototypeReducer } from "../state/prototypeReducer";
import type { PrototypeState } from "../state/prototypeState";
import { selectOfficialProjectSources } from "./portfolioSources";

function date(value: string) {
	const parsed = parseDateOnly(value);

	if (parsed === null) {
		throw new Error(`Invalid test DateOnly: ${value}`);
	}

	return parsed;
}

function makeMaster(stnProjectName: string): ProjectMaster {
	return {
		basicInformation: { stnProjectName },
	} as ProjectMaster;
}

function makeTeam(label: string): ProjectTeam {
	return {
		projectRoles: {
			qciPm: {
				assignmentId: toPersonAssignmentId(`${label}-qci-pm`),
				name: `${label} PM`,
				email: `${label.toLowerCase()}@example.test`,
			},
			qciPjm: null,
			acerPm: null,
		},
		functions: [],
		appliedTemplate: null,
	};
}

function makeVersion(
	key: string,
	versionNumber: number,
	milestoneDefinitionKey: string,
	plan: string,
	versionNote: string,
): PublishedScheduleVersion {
	return {
		id: toScheduleVersionId(key),
		versionNumber: toScheduleVersionNumber(versionNumber),
		versionNote,
		publishedAt: `2026-09-0${versionNumber}T00:00:00.000Z`,
		milestones: [
			{
				rowId: toMilestoneRowId(`${key}-row`),
				milestoneDefinitionId: toMilestoneDefinitionId(
					milestoneDefinitionKey,
				),
				applicability: "applicable",
				plan: date(plan),
				actual: null,
			},
		],
	};
}

function makeDraft(
	key: string,
	baseVersion: PublishedScheduleVersion | null,
	milestoneDefinitionKey: string,
	plan: string,
): ScheduleWorkingDraft {
	return {
		id: toScheduleDraftId(key),
		basePublishedVersionId: baseVersion?.id ?? null,
		milestones: [
			{
				rowId: toMilestoneRowId(`${key}-row`),
				milestoneDefinitionId: toMilestoneDefinitionId(
					milestoneDefinitionKey,
				),
				rawMilestoneIdentity: null,
				applicability: "applicable",
				plan: date(plan),
				actual: null,
			},
		],
		importFindings: [],
	};
}

function makeProject(
	id: string,
	master: ProjectMaster,
	publishedVersions: readonly PublishedScheduleVersion[],
	workingDraft: ScheduleWorkingDraft | null,
	team: ProjectTeam | null,
): Project {
	return {
		id: toProjectId(id),
		master,
		identityAliases: [],
		schedule: { publishedVersions, workingDraft },
		team,
	};
}

describe("selectOfficialProjectSources", () => {
	it("uses current Master and Team plus only the latest Published Schedule", () => {
		const milestoneDefinitionKey = "milestone-a-close";
		const version1 = makeVersion(
			"schedule-a-v1",
			1,
			milestoneDefinitionKey,
			"2026-09-15",
			"Initial schedule",
		);
		const version2 = makeVersion(
			"schedule-a-v2",
			2,
			milestoneDefinitionKey,
			"2026-10-01",
			"A-stage dates updated",
		);
		const draft = makeDraft(
			"draft-a",
			version2,
			milestoneDefinitionKey,
			"2026-12-01",
		);
		const master = makeMaster("Fixture Project Alpha");
		const team = makeTeam("Alpha");
		const project = makeProject(
			"dev-project-001",
			master,
			[version1, version2],
			draft,
			team,
		);
		const state: PrototypeState = { projects: [project] };

		const source = selectOfficialProjectSources(
			state,
			toProjectId("dev-project-001"),
		);

		expect(source).not.toBeNull();
		expect(source?.master).toBe(master);
		expect(source?.team).toBe(team);
		expect(source?.latestPublishedSchedule).toBe(version2);
		expect(source?.latestPublishedSchedule?.milestones[0]?.plan).toBe(
			date("2026-10-01"),
		);
		expect(source?.latestPublishedSchedule?.milestones[0]?.plan).not.toBe(
			date("2026-12-01"),
		);
		expect(source).not.toHaveProperty("workingDraft");
		expect(project.schedule.publishedVersions).toEqual([version1, version2]);
		expect(project.schedule.workingDraft).toBe(draft);
	});

	it("returns no official Schedule for a Draft-only Project", () => {
		const draft = makeDraft(
			"first-draft",
			null,
			"milestone-first-draft",
			"2026-11-01",
		);
		const project = makeProject(
			"dev-project-001",
			makeMaster("Draft-only Fixture Project"),
			[],
			draft,
			null,
		);
		const state: PrototypeState = { projects: [project] };

		const source = selectOfficialProjectSources(
			state,
			toProjectId("dev-project-001"),
		);

		expect(source?.latestPublishedSchedule).toBeNull();
		expect(source?.team).toBeNull();
		expect(project.schedule.workingDraft).toBe(draft);
	});

	it("returns no official Schedule when both history and Draft are empty", () => {
		const project = makeProject(
			"dev-project-001",
			makeMaster("Empty Schedule Fixture Project"),
			[],
			null,
			null,
		);
		const state: PrototypeState = { projects: [project] };

		const source = selectOfficialProjectSources(state, project.id);

		expect(source?.latestPublishedSchedule).toBeNull();
	});

	it("keeps two Projects isolated and derives replacement changes immediately", () => {
		const milestoneA = "milestone-project-a";
		const milestoneB = "milestone-project-b";
		const aVersion1 = makeVersion(
			"schedule-a-v1",
			1,
			milestoneA,
			"2026-10-01",
			"Project A initial",
		);
		const bVersion1 = makeVersion(
			"schedule-b-v1",
			1,
			milestoneB,
			"2026-09-01",
			"Project B initial",
		);
		const bVersion2 = makeVersion(
			"schedule-b-v2",
			2,
			milestoneB,
			"2026-11-01",
			"Project B updated",
		);
		const teamA = makeTeam("Alpha");
		const teamB = makeTeam("Beta");
		const projectA = makeProject(
			"dev-project-001",
			makeMaster("Fixture Project Alpha"),
			[aVersion1],
			makeDraft("draft-a", aVersion1, milestoneA, "2026-12-01"),
			teamA,
		);
		const projectB = makeProject(
			"dev-project-002",
			makeMaster("Fixture Project Beta"),
			[bVersion1, bVersion2],
			makeDraft("draft-b", bVersion2, milestoneB, "2027-01-01"),
			teamB,
		);
		const originalState: PrototypeState = Object.freeze({
			projects: Object.freeze([projectA, projectB]),
		});

		const sourceA = selectOfficialProjectSources(
			originalState,
			projectA.id,
		);
		const sourceB = selectOfficialProjectSources(
			originalState,
			projectB.id,
		);

		expect(sourceA?.latestPublishedSchedule).toBe(aVersion1);
		expect(sourceA?.team).toBe(teamA);
		expect(sourceB?.latestPublishedSchedule).toBe(bVersion2);
		expect(sourceB?.team).toBe(teamB);
		expect(sourceA?.latestPublishedSchedule?.milestones[0]?.plan).toBe(
			date("2026-10-01"),
		);
		expect(sourceB?.latestPublishedSchedule?.milestones[0]?.plan).toBe(
			date("2026-11-01"),
		);

		const aVersion2 = makeVersion(
			"schedule-a-v2",
			2,
			milestoneA,
			"2026-10-15",
			"Project A updated",
		);
		const replacementA = makeProject(
			"dev-project-001",
			makeMaster("Fixture Project Alpha Renamed"),
			[aVersion1, aVersion2],
			makeDraft("draft-a-2", aVersion2, milestoneA, "2027-02-01"),
			teamA,
		);
		const nextState = prototypeReducer(originalState, {
			type: "projectReplaced",
			project: replacementA,
		});

		const updatedSourceA = selectOfficialProjectSources(
			nextState,
			projectA.id,
		);
		const unchangedSourceB = selectOfficialProjectSources(
			nextState,
			projectB.id,
		);

		expect(nextState.projects[1]).toBe(projectB);
		expect(originalState.projects).toEqual([projectA, projectB]);
		expect(updatedSourceA?.master).toBe(replacementA.master);
		expect(updatedSourceA?.latestPublishedSchedule).toBe(aVersion2);
		expect(unchangedSourceB?.master).toBe(projectB.master);
		expect(unchangedSourceB?.latestPublishedSchedule).toBe(bVersion2);
	});

	it("returns null when the requested Project does not exist", () => {
		const state: PrototypeState = { projects: [] };

		expect(
			selectOfficialProjectSources(state, toProjectId("dev-project-999")),
		).toBeNull();
	});
});
