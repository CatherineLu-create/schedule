import { describe, expect, it } from "vitest";

import { statusCatalog } from "../../config/v2/referenceData";
import {
	canonicalProjectFixtures,
	devProject001,
	devProject002,
	devProject003,
	devProject004,
	devScenarioToday,
} from "../../fixtures/v2/canonicalProjectFixtures";
import {
	customerReferenceFixtures,
	productLineReferenceFixtures,
} from "../../fixtures/v2/referenceFixtures";
import { devTeamTemplateV2 } from "../../fixtures/v2/teamTemplateFixtures";
import {
	toMilestoneRowId,
	toProjectId,
	toScheduleDraftId,
	toScheduleVersionId,
} from "../../domain/shared/ids";
import { selectOfficialProjectSources } from "../selectors/portfolioSources";
import { prototypeReducer } from "../state/prototypeReducer";
import type { PrototypeState } from "../state/prototypeState";
import { createProject, updateProjectMaster } from "./projectCommands";
import {
	publishProjectSchedule,
	startProjectScheduleWorkingDraft,
} from "./scheduleCommands";

const canonicalState: PrototypeState = {
	projects: canonicalProjectFixtures,
};

describe("whole-Project command integration", () => {
	it("replaces a published Project, preserves order/unrelated Projects, and derives latest official Schedule", () => {
		const started = startProjectScheduleWorkingDraft(devProject002, {
			draftId: toScheduleDraftId("integration-project-002-draft-v2"),
			createRowId: (row) =>
				toMilestoneRowId(`integration-v2-${String(row.rowId)}`),
		});
		expect(started.ok).toBe(true);
		if (!started.ok) return;

		const published = publishProjectSchedule(started.project, {
			versionId: toScheduleVersionId("integration-project-002-v2"),
			versionNote: "Integration publish",
			publishedAt: "2026-09-16T08:00:00.000Z",
			referenceDate: devScenarioToday,
		});
		expect(published.ok).toBe(true);
		if (!published.ok) return;

		const nextState = prototypeReducer(canonicalState, {
			type: "projectReplaced",
			project: published.project,
		});
		const official = selectOfficialProjectSources(
			nextState,
			devProject002.id,
		);

		expect(nextState.projects.map((project) => project.id)).toEqual(
			canonicalProjectFixtures.map((project) => project.id),
		);
		expect(nextState.projects[2]).toBe(devProject003);
		expect(official?.latestPublishedSchedule).toBe(published.version);
		expect(official?.latestPublishedSchedule?.versionNumber).toBe(2);
		expect(published.project.schedule.workingDraft).toBeNull();
		expect(canonicalState.projects[1]).toBe(devProject002);
	});

	it("keeps Project 002 and 003 separate despite their duplicate business identity", () => {
		expect(devProject002.id).not.toBe(devProject003.id);
		expect(devProject002.master.basicInformation.year).toBe(
			devProject003.master.basicInformation.year,
		);
		expect(devProject002.master.basicInformation.productLine).toBe(
			devProject003.master.basicInformation.productLine,
		);
		expect(devProject002.master.basicInformation.stnProjectName).toBe(
			devProject003.master.basicInformation.stnProjectName,
		);
		expect(selectOfficialProjectSources(canonicalState, devProject002.id)?.projectId).toBe(
			devProject002.id,
		);
		expect(selectOfficialProjectSources(canonicalState, devProject003.id)?.projectId).toBe(
			devProject003.id,
		);
	});

	it("keeps Project 004 Draft data unofficial when Publish is rejected", () => {
		const before = selectOfficialProjectSources(
			canonicalState,
			devProject004.id,
		);
		const result = publishProjectSchedule(devProject004, {
			versionId: toScheduleVersionId("integration-project-004-rejected-v2"),
			versionNote: "Rejected",
			publishedAt: "2026-09-16T08:00:00.000Z",
			referenceDate: devScenarioToday,
		});
		const after = selectOfficialProjectSources(
			canonicalState,
			devProject004.id,
		);

		expect(result.ok).toBe(false);
		expect(before?.latestPublishedSchedule).toBe(
			devProject004.schedule.publishedVersions[0],
		);
		expect(after?.latestPublishedSchedule).toBe(before?.latestPublishedSchedule);
		expect(after?.latestPublishedSchedule?.milestones).not.toBe(
			devProject004.schedule.workingDraft?.milestones,
		);
	});

	it("adds a command-created Project and derives Master without a Dashboard dataset", () => {
		const created = createProject(
			{
				projectId: toProjectId("integration-created-project"),
				master: {
					...devProject001.master,
					basicInformation: {
						...devProject001.master.basicInformation,
						year: 2028,
						productLine: productLineReferenceFixtures[1]!.id,
						stnProjectName: "DEV Integration Project",
					},
				},
				qciPm: null,
			},
			{
				existingProjects: canonicalState.projects,
				defaults: {
					customerId: customerReferenceFixtures[0]!.id,
					statusId: statusCatalog[0]!.id,
					teamTemplate: devTeamTemplateV2,
				},
			},
		);
		expect(created.status).toBe("created");
		if (created.status !== "created") return;

		const nextState = prototypeReducer(canonicalState, {
			type: "projectAdded",
			project: created.project,
		});
		const official = selectOfficialProjectSources(
			nextState,
			created.project.id,
		);

		expect(nextState.projects.slice(0, 5)).toEqual(canonicalProjectFixtures);
		expect(official?.master).toBe(created.project.master);
		expect(official?.latestPublishedSchedule).toBeNull();
	});

	it("reflects a Master command replacement immediately without changing unrelated Projects", () => {
		const master = {
			...devProject001.master,
			basicInformation: {
				...devProject001.master.basicInformation,
				stnProjectName: "DEV Empty Project Renamed",
			},
		};
		const updated = updateProjectMaster(devProject001, {
			master,
			completenessFields: [],
		});
		const nextState = prototypeReducer(canonicalState, {
			type: "projectReplaced",
			project: updated.project,
		});

		expect(
			selectOfficialProjectSources(nextState, devProject001.id)?.master,
		).toBe(master);
		expect(nextState.projects[1]).toBe(devProject002);
		expect(nextState.projects[2]).toBe(devProject003);
	});
});
