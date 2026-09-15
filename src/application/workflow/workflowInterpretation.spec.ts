import { describe, expect, it } from "vitest";

import { statusCatalog } from "../../config/v2/referenceData";
import {
	devProject001,
	devProject002,
	devProject003,
	devProject005,
} from "../../fixtures/v2/canonicalProjectFixtures";
import { unmappedMilestoneDraftCandidate } from "../../fixtures/v2/scheduleCandidateFixtures";
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
import { parseDateOnly } from "../../domain/shared/dateOnly";
import {
	toScheduleVersionNumber,
	type ProjectSchedule,
} from "../../domain/schedule/schedule";
import {
	createProject,
	type CreateProjectContext,
	type CreateProjectInput,
	type UpdateProjectMasterResult,
} from "../commands/projectCommands";
import {
	publishProjectSchedule,
	replaceProjectScheduleWorkingDraft,
	startProjectScheduleWorkingDraft,
} from "../commands/scheduleCommands";
import { saveProjectTeam } from "../commands/teamCommands";
import type { ValidationIssue } from "../../domain/validation/validationIssue";
import {
	confirmCreateProjectAnyway,
	interpretCreateProjectResult,
	interpretPublishProjectScheduleResult,
	interpretReplaceWorkingDraftResult,
	interpretSaveProjectTeamResult,
	interpretUpdateProjectMasterResult,
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

const workflowReferenceDate = parseDateOnly("2026-09-15")!;
const workflowPublishedV1 = {
	id: toScheduleVersionId("workflow-predecessor-v1"),
	versionNumber: toScheduleVersionNumber(1),
	versionNote: "Workflow predecessor version",
	publishedAt: "2026-09-01T00:00:00Z",
	milestones: [],
};
const workflowExistingDraft = {
	...unmappedMilestoneDraftCandidate,
	id: toScheduleDraftId("workflow-existing-draft"),
	basePublishedVersionId: workflowPublishedV1.id,
};
const workflowScheduleWithDraft: ProjectSchedule = {
	publishedVersions: [workflowPublishedV1],
	workingDraft: workflowExistingDraft,
};

function projectMasterIssue(
	severity: ValidationIssue["severity"],
): ValidationIssue {
	return {
		code: `projectMaster.data.${severity}-test`,
		domain: "projectMaster",
		source: "data",
		severity,
		message: `${severity} Project Master test issue`,
		target: {
			section: "projectMaster.basicInformation",
			entityId: devProject002.id,
			field: "stnProjectName",
		},
	};
}

describe("ActionDisposition", () => {
	describe("Project Master Update", () => {
		it("interprets Blocking issues as blocked and preserves the original result", () => {
			const issues = [projectMasterIssue("blocking")];
			const result: UpdateProjectMasterResult = {
				project: devProject002,
				issues,
			};

			const interpretation = interpretUpdateProjectMasterResult(result);

			expect(interpretation).toEqual({ kind: "blocked", result });
			expect(interpretation.result).toBe(result);
			expect(interpretation.result.project).toBe(result.project);
			expect(interpretation.result.issues).toBe(result.issues);
			expect(interpretation).not.toHaveProperty("actions");
		});

		it("interprets Advisory-only issues as completed and preserves feedback", () => {
			const issues = [projectMasterIssue("advisory")];
			const result: UpdateProjectMasterResult = {
				project: devProject002,
				issues,
			};

			const interpretation = interpretUpdateProjectMasterResult(result);

			expect(interpretation).toEqual({ kind: "completed", result });
			expect(interpretation.result).toBe(result);
			expect(interpretation.result.issues).toBe(result.issues);
		});

		it("interprets a no-issue update as completed and preserves the original result", () => {
			const result: UpdateProjectMasterResult = {
				project: devProject002,
				issues: [],
			};

			const interpretation = interpretUpdateProjectMasterResult(result);

			expect(interpretation).toEqual({ kind: "completed", result });
			expect(interpretation.result).toBe(result);
		});
	});

	describe("Schedule Publish", () => {
		it("interprets success as completed", () => {
			const started = startProjectScheduleWorkingDraft(
				{ publishedVersions: [], workingDraft: null },
				{
				draftId: toScheduleDraftId("workflow-first-draft"),
				createRowId: () => toMilestoneRowId("workflow-unexpected-row"),
				},
			);
			expect(started.ok).toBe(true);
			if (!started.ok) return;

			const result = publishProjectSchedule(started.schedule, {
				versionId: toScheduleVersionId("workflow-first-version"),
				versionNote: "Workflow publish",
				publishedAt: "2026-09-15T08:00:00.000Z",
				referenceDate: workflowReferenceDate,
			});

			expect(interpretPublishProjectScheduleResult(result)).toEqual({
				kind: "completed",
				result,
			});
		});

		it("interprets validation failure as blocked", () => {
			const result = publishProjectSchedule(workflowScheduleWithDraft, {
				versionId: toScheduleVersionId("workflow-project-004-v2"),
				versionNote: "Must remain blocked",
				publishedAt: "2026-09-15T08:00:00.000Z",
				referenceDate: workflowReferenceDate,
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
			const duplicateProject002 = {
				...devProject002,
				master: {
					...devProject002.master,
					basicInformation: {
						...devProject002.master.basicInformation,
						year: devProject003.master.basicInformation.year,
						productLine: devProject003.master.basicInformation.productLine,
						stnProjectName:
							devProject003.master.basicInformation.stnProjectName,
					},
				},
			};
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
				{ ...createContext, existingProjects: [duplicateProject002] },
			);
			const interpretation = interpretCreateProjectResult(result);

			expect(result.status).toBe("reviewRequired");
			if (result.status !== "reviewRequired") return;
			expect(interpretation.kind).toBe("duplicateProject");
			if (interpretation.kind !== "duplicateProject") return;
			expect(interpretation.matchingProjectIds).toEqual([
				duplicateProject002.id,
			]);
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
	it("does not request replacement when the Schedule has no Working Draft", () => {
		expect(
			requestReplaceWorkingDraftDecision(devProject002.id, {
				publishedVersions: [],
				workingDraft: null,
			}),
		).toBeNull();
	});

	it("requests explicit replacement without modifying the Schedule", () => {
		const decision = requestReplaceWorkingDraftDecision(
			devProject002.id,
			workflowScheduleWithDraft,
		);

		expect(decision).toEqual({
			kind: "replaceWorkingDraft",
			projectId: devProject002.id,
			workingDraftId: workflowExistingDraft.id,
			actions: [
				{ id: "cancel", direction: "backward" },
				{ id: "replaceAndImport", direction: "forward" },
			],
		});
		expect(workflowScheduleWithDraft.workingDraft).toBe(workflowExistingDraft);
	});

	it("keeps stale-base replacement as rejected rather than a decision", () => {
		const result = replaceProjectScheduleWorkingDraft(
			workflowScheduleWithDraft,
			{
			...workflowExistingDraft,
			id: toScheduleDraftId("workflow-stale-replacement"),
			basePublishedVersionId: null,
			},
		);

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
		const decision = requestUnsavedNavigationDecision(false);

		expect(decision).toBeNull();
		expect(workflowScheduleWithDraft.workingDraft).toBe(workflowExistingDraft);
	});
});
