import { describe, expect, it } from "vitest";

import { statusCatalog } from "../../config/v2/referenceData";
import {
	devProject001,
	devProject002,
	devProject003,
	devProject004,
	devProject005,
	devScenarioToday,
} from "../../fixtures/v2/canonicalProjectFixtures";
import {
	customerReferenceFixtures,
	productLineReferenceFixtures,
} from "../../fixtures/v2/referenceFixtures";
import { multipleOwnerTeamCandidate } from "../../fixtures/v2/teamCandidateFixtures";
import { devTeamTemplateV2 } from "../../fixtures/v2/teamTemplateFixtures";
import {
	toMilestoneRowId,
	toProjectId,
	toScheduleDraftId,
	toScheduleVersionId,
} from "../../domain/shared/ids";
import {
	createProject,
	type CreateProjectContext,
	type CreateProjectInput,
} from "../commands/projectCommands";
import {
	publishProjectSchedule,
	replaceProjectScheduleWorkingDraft,
	startProjectScheduleWorkingDraft,
} from "../commands/scheduleCommands";
import { saveProjectTeam } from "../commands/teamCommands";
import {
	confirmCreateProjectAnyway,
	interpretCreateProjectResult,
	interpretPublishProjectScheduleResult,
	interpretReplaceWorkingDraftResult,
	interpretSaveProjectTeamResult,
	requestReplaceWorkingDraftDecision,
	requestUnsavedNavigationDecision,
} from "./workflowInterpretation";

const createInput: CreateProjectInput = {
	projectId: toProjectId("workflow-new-project"),
	master: {
		...devProject001.master,
		basicInformation: {
			...devProject001.master.basicInformation,
			year: 2028,
			productLine: productLineReferenceFixtures[0]!.id,
			stnProjectName: "DEV Workflow Project",
		},
	},
	qciPm: null,
};

const createContext: CreateProjectContext = {
	existingProjects: [],
	defaults: {
		customerId: customerReferenceFixtures[0]!.id,
		statusId: statusCatalog[0]!.id,
		teamTemplate: devTeamTemplateV2,
	},
};

describe("ActionDisposition", () => {
	describe("Schedule Publish", () => {
		it("interprets success as completed", () => {
			const started = startProjectScheduleWorkingDraft(devProject001, {
				draftId: toScheduleDraftId("workflow-first-draft"),
				createRowId: () => toMilestoneRowId("workflow-unexpected-row"),
			});
			expect(started.ok).toBe(true);
			if (!started.ok) return;

			const result = publishProjectSchedule(started.project, {
				versionId: toScheduleVersionId("workflow-first-version"),
				versionNote: "Workflow publish",
				publishedAt: "2026-09-15T08:00:00.000Z",
				referenceDate: devScenarioToday,
			});

			expect(interpretPublishProjectScheduleResult(result)).toEqual({
				kind: "completed",
				result,
			});
		});

		it("interprets validation failure as blocked", () => {
			const result = publishProjectSchedule(devProject004, {
				versionId: toScheduleVersionId("workflow-project-004-v2"),
				versionNote: "Must remain blocked",
				publishedAt: "2026-09-15T08:00:00.000Z",
				referenceDate: devScenarioToday,
			});

			expect(interpretPublishProjectScheduleResult(result)).toEqual({
				kind: "blocked",
				result,
			});
		});

		it.each(["missingDraft", "staleBase", "duplicateVersionId"] as const)(
			"interprets %s as rejected",
			(reason) => {
				const result = {
					ok: false as const,
					reason,
					issues: [],
				};

				expect(interpretPublishProjectScheduleResult(result)).toEqual({
					kind: "rejected",
					result,
				});
			},
		);
	});

	describe("Team Save", () => {
		it("interprets Advisory-only success as completed", () => {
			expect(devProject005.team).not.toBeNull();
			const result = saveProjectTeam(devProject005, {
				team: devProject005.team!,
			});

			expect(interpretSaveProjectTeamResult(result)).toEqual({
				kind: "completed",
				result,
			});
		});

		it("interprets Blocking validation failure as blocked", () => {
			const result = saveProjectTeam(devProject002, {
				team: multipleOwnerTeamCandidate,
			});

			expect(interpretSaveProjectTeamResult(result)).toEqual({
				kind: "blocked",
				result,
			});
		});
	});

	describe("Create Project", () => {
		it("interprets created as completed", () => {
			const result = createProject(createInput, createContext);

			expect(interpretCreateProjectResult(result)).toEqual({
				kind: "completed",
				result,
			});
		});

		it("interprets missing required fields as rejected", () => {
			const missingYearInput: CreateProjectInput = {
				...createInput,
				master: {
					...createInput.master,
					basicInformation: {
						...createInput.master.basicInformation,
						year: null,
					},
				},
			};
			const result = createProject(
				missingYearInput,
				createContext,
			);

			expect(interpretCreateProjectResult(result)).toEqual({
				kind: "rejected",
				result,
			});
		});

		it("interprets duplicate ProjectId as rejected", () => {
			const result = createProject(
				{ ...createInput, projectId: devProject002.id },
				{ ...createContext, existingProjects: [devProject002] },
			);

			expect(interpretCreateProjectResult(result)).toEqual({
				kind: "rejected",
				result,
			});
		});

		it("interprets duplicate business identity as an explicit decision", () => {
			const result = createProject(
				{
					...createInput,
					projectId: toProjectId("workflow-duplicate-business-project"),
					master: {
						...createInput.master,
						basicInformation: {
							...createInput.master.basicInformation,
							year: devProject003.master.basicInformation.year,
							productLine:
								devProject003.master.basicInformation.productLine,
							stnProjectName:
								devProject003.master.basicInformation.stnProjectName,
						},
					},
				},
				{ ...createContext, existingProjects: [devProject002] },
			);
			const interpretation = interpretCreateProjectResult(result);

			expect(result.status).toBe("reviewRequired");
			if (result.status !== "reviewRequired") return;
			expect(interpretation.kind).toBe("duplicateProject");
			if (interpretation.kind !== "duplicateProject") return;
			expect(interpretation.matchingProjectIds).toEqual([devProject002.id]);
			expect(interpretation.issues).toBe(result.issues);
		});
	});
});

describe("duplicate Project workflow decision", () => {
	const duplicateInput: CreateProjectInput = {
		...createInput,
		projectId: toProjectId("workflow-confirmed-duplicate-project"),
		master: {
			...createInput.master,
			basicInformation: {
				...createInput.master.basicInformation,
				year: devProject002.master.basicInformation.year,
				productLine: devProject002.master.basicInformation.productLine,
				stnProjectName:
					devProject002.master.basicInformation.stnProjectName,
			},
		},
	};
	const duplicateContext: CreateProjectContext = {
		...createContext,
		existingProjects: [devProject002],
	};

	it("preserves matching IDs and exposes the approved semantic action directions", () => {
		const firstResult = createProject(duplicateInput, duplicateContext);
		const decision = interpretCreateProjectResult(firstResult);

		expect(firstResult.status).toBe("reviewRequired");
		expect(decision).toEqual({
			kind: "duplicateProject",
			matchingProjectIds: [devProject002.id],
			issues:
				firstResult.status === "reviewRequired" ? firstResult.issues : [],
			actions: [
				{ id: "reviewExisting", direction: "backward" },
				{ id: "createAnyway", direction: "forward" },
			],
		});
		expect(decision).not.toHaveProperty("candidate");
	});

	it("performs Create Anyway as a second command call with explicit override", () => {
		const firstResult = createProject(duplicateInput, duplicateContext);
		const firstInterpretation = interpretCreateProjectResult(firstResult);
		const confirmedInterpretation = confirmCreateProjectAnyway(
			duplicateInput,
			duplicateContext,
		);

		expect(firstResult.status).toBe("reviewRequired");
		if (firstResult.status !== "reviewRequired") return;
		expect(firstInterpretation.kind).toBe("duplicateProject");
		expect(confirmedInterpretation.kind).toBe("completed");
		if (confirmedInterpretation.kind !== "completed") return;
		expect(confirmedInterpretation.result.status).toBe("created");
		if (confirmedInterpretation.result.status !== "created") return;
		expect(firstResult.candidate.id).toBe(duplicateInput.projectId);
		expect(firstResult.candidate.master).toEqual(duplicateInput.master);
		expect(confirmedInterpretation.result.project.id).toBe(
			duplicateInput.projectId,
		);
		expect(confirmedInterpretation.result.project.master).toEqual(
			duplicateInput.master,
		);
		expect(duplicateContext.allowBusinessIdentityDuplicate).toBeUndefined();
	});
});

describe("replace Working Draft workflow decision", () => {
	it("does not request replacement when the Project has no Working Draft", () => {
		expect(requestReplaceWorkingDraftDecision(devProject002)).toBeNull();
	});

	it("requests explicit replacement without modifying the Project", () => {
		const existingDraft = devProject004.schedule.workingDraft;
		expect(existingDraft).not.toBeNull();

		const decision = requestReplaceWorkingDraftDecision(devProject004);

		expect(decision).toEqual({
			kind: "replaceWorkingDraft",
			projectId: devProject004.id,
			workingDraftId: existingDraft?.id,
			actions: [
				{ id: "cancel", direction: "backward" },
				{ id: "replaceAndImport", direction: "forward" },
			],
		});
		expect(devProject004.schedule.workingDraft).toBe(existingDraft);
	});

	it("keeps stale-base replacement as rejected rather than a decision", () => {
		const existingDraft = devProject004.schedule.workingDraft;
		expect(existingDraft).not.toBeNull();
		if (existingDraft === null) return;

		const result = replaceProjectScheduleWorkingDraft(devProject004, {
			...existingDraft,
			id: toScheduleDraftId("workflow-stale-replacement"),
			basePublishedVersionId: null,
		});

		expect(interpretReplaceWorkingDraftResult(result)).toEqual({
			kind: "rejected",
			result,
		});
	});
});

describe("unsaved navigation workflow decision", () => {
	it("returns no decision when navigation will not discard unsaved changes", () => {
		expect(requestUnsavedNavigationDecision(false)).toBeNull();
	});

	it("uses the approved Stay and Discard & Leave semantic directions", () => {
		expect(requestUnsavedNavigationDecision(true)).toEqual({
			kind: "discardUnsavedChanges",
			actions: [
				{ id: "stay", direction: "backward" },
				{ id: "discardAndLeave", direction: "forward" },
			],
		});
	});

	it("does not infer unsaved navigation from an existing Schedule Working Draft", () => {
		const state = Object.freeze({
			projects: Object.freeze([devProject004]),
		});
		const existingDraft = devProject004.schedule.workingDraft;
		expect(existingDraft).not.toBeNull();

		const decision = requestUnsavedNavigationDecision(false);

		expect(decision).toBeNull();
		expect(state.projects[0]).toBe(devProject004);
		expect(devProject004.schedule.workingDraft).toBe(existingDraft);
	});
});
