import { describe, expect, it } from "vitest";

import { statusCatalog } from "../../config/v2/referenceData";
import {
	devProject002,
	devProject003,
	devProject005,
} from "../../fixtures/v2/canonicalProjectFixtures";
import {
	customerReferenceFixtures,
	productLineReferenceFixtures,
} from "../../fixtures/v2/referenceFixtures";
import { devTeamTemplateV2 } from "../../fixtures/v2/teamTemplateFixtures";
import {
	toPersonAssignmentId,
	toProjectId,
} from "../../domain/shared/ids";
import type { ProjectRoleAssignment } from "../../domain/team/team";
import {
	createProject,
	type CreateProjectContext,
	type CreateProjectInput,
	updateProjectMaster,
} from "./projectCommands";

const acerCustomerId = customerReferenceFixtures[0]!.id;
const rfqStatusId = statusCatalog[0]!.id;
const productLineAlphaId = productLineReferenceFixtures[0]!.id;

const context: CreateProjectContext = {
	existingProjects: [],
	defaults: {
		customerId: acerCustomerId,
		statusId: rfqStatusId,
		teamTemplate: devTeamTemplateV2,
	},
};

const qciPm: ProjectRoleAssignment = {
	assignmentId: toPersonAssignmentId("create-project-qci-pm"),
	name: "DEV Create QCI PM",
	email: "create.qci.pm@example.test",
};

function validInput(overrides: Partial<CreateProjectInput> = {}): CreateProjectInput {
	return {
		projectId: toProjectId("create-project-unique-id"),
		year: 2027,
		productLineId: productLineAlphaId,
		stnProjectName: "DEV Created Project",
		qciPm,
		...overrides,
	};
}

describe("Create Project command", () => {
	it("rejects each missing Create-required field without inventing Master completeness", () => {
		const result = createProject(
			validInput({
				year: null,
				productLineId: null,
				stnProjectName: "   ",
			}),
			context,
		);

		expect(result).toEqual({
			status: "rejected",
			reason: "requiredFields",
			missingFields: ["year", "productLine", "stnProjectName"],
		});
	});

	it("uses injected Acer/RFQ defaults and keeps QCI PM in Team", () => {
		const result = createProject(validInput(), context);

		expect(result.status).toBe("created");
		if (result.status !== "created") return;

		expect(result.project.id).toBe("create-project-unique-id");
		expect(result.project.master.basicInformation).toMatchObject({
			year: 2027,
			productLine: productLineAlphaId,
			stnProjectName: "DEV Created Project",
			customer: acerCustomerId,
			status: rfqStatusId,
		});
		expect(result.project.team?.projectRoles).toEqual({
			qciPm,
			qciPjm: null,
			acerPm: null,
		});
		expect(result.project.team?.functions).toHaveLength(
			devTeamTemplateV2.functions.length,
		);
		expect(
			result.project.team?.functions.every(
				(functionTeam) =>
					functionTeam.applicability === "pending" &&
					functionTeam.assignments.length === 0,
			),
		).toBe(true);
		expect(result.project.schedule).toEqual({
			publishedVersions: [],
			workingDraft: null,
		});
		expect(result.project.identityAliases).toEqual([]);
	});

	it("allows explicit Customer and Status selections to override Create defaults", () => {
		const result = createProject(
			validInput({
				customerId: customerReferenceFixtures[1]!.id,
				statusId: statusCatalog[2]!.id,
			}),
			context,
		);

		expect(result.status).toBe("created");
		if (result.status !== "created") return;
		expect(result.project.master.basicInformation.customer).toBe(
			customerReferenceFixtures[1]!.id,
		);
		expect(result.project.master.basicInformation.status).toBe(
			statusCatalog[2]!.id,
		);
	});

	it("rejects duplicate ProjectId independently of business names", () => {
		const result = createProject(
			validInput({
				projectId: devProject002.id,
				stnProjectName: "Entirely Different Name",
			}),
			{ ...context, existingProjects: [devProject002] },
		);

		expect(result).toEqual({
			status: "rejected",
			reason: "duplicateProjectId",
		});
	});

	it("returns a reviewable Advisory for the Project 002/003 business duplicate key", () => {
		const result = createProject(
			validInput({
				projectId: devProject003.id,
				year: devProject003.master.basicInformation.year,
				productLineId:
					devProject003.master.basicInformation.productLine,
				stnProjectName: "  dev   PROJECT alpha ",
			}),
			{ ...context, existingProjects: [devProject002] },
		);

		expect(result.status).toBe("reviewRequired");
		if (result.status !== "reviewRequired") return;
		expect(result.matchingProjectIds).toEqual([devProject002.id]);
		expect(result.issues).toEqual([
			expect.objectContaining({
				code: "projectMaster.data.duplicate-business-identity",
				domain: "projectMaster",
				source: "data",
				severity: "advisory",
			}),
		]);
		expect(result.candidate.id).toBe(devProject003.id);
	});

	it("supports an explicit Create Anyway path without merging Projects", () => {
		const result = createProject(
			validInput({
				projectId: devProject003.id,
				year: devProject003.master.basicInformation.year,
				productLineId:
					devProject003.master.basicInformation.productLine,
				stnProjectName:
					devProject003.master.basicInformation.stnProjectName,
			}),
			{
				...context,
				existingProjects: [devProject002],
				allowBusinessIdentityDuplicate: true,
			},
		);

		expect(result.status).toBe("created");
		if (result.status !== "created") return;
		expect(result.project.id).toBe(devProject003.id);
		expect(result.project.id).not.toBe(devProject002.id);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "projectMaster.data.duplicate-business-identity",
				severity: "advisory",
			}),
		);
	});

	it("keeps underscore, dash, and punctuation significant for duplicate matching", () => {
		const base = devProject005.master.basicInformation;
		const nonDuplicate = createProject(
			validInput({
				projectId: toProjectId("create-project-signal-dash"),
				year: base.year,
				productLineId: base.productLine,
				stnProjectName: "Signal-A",
			}),
			{ ...context, existingProjects: [devProject005] },
		);
		const normalizedDuplicate = createProject(
			validInput({
				projectId: toProjectId("create-project-signal-underscore"),
				year: base.year,
				productLineId: base.productLine,
				stnProjectName: " signal_a ",
			}),
			{ ...context, existingProjects: [devProject005] },
		);

		expect(nonDuplicate.status).toBe("created");
		expect(normalizedDuplicate.status).toBe("reviewRequired");
		expect(devProject005.master.basicInformation.stnProjectName).toBe(
			"Signal_A",
		);
	});
});

describe("Project Master update command", () => {
	it("replaces current Master, preserves ProjectId, and captures both prior identity names", () => {
		const nextMaster = {
			...devProject002.master,
			basicInformation: {
				...devProject002.master.basicInformation,
				stnProjectName: "DEV Project Beta",
				qciModelName: "DEV-QCI-BETA-01",
			},
		};

		const result = updateProjectMaster(devProject002, {
			master: nextMaster,
			completenessFields: [],
		});

		expect(result.project.id).toBe(devProject002.id);
		expect(result.project.master).toBe(nextMaster);
		expect(result.project.identityAliases).toEqual([
			{
				kind: "stnProjectName",
				originalValue: "DEV Project Alpha",
				normalizedValue: "dev project alpha",
			},
			{
				kind: "qciModelName",
				originalValue: "DEV-QCI-ALPHA-01",
				normalizedValue: "dev-qci-alpha-01",
			},
		]);
		expect(result.project.schedule).toBe(devProject002.schedule);
		expect(result.project.team).toBe(devProject002.team);
		expect(devProject002.identityAliases).toEqual([]);
	});

	it("does not capture a meaningless alias for normalization-equivalent names", () => {
		const nextMaster = {
			...devProject002.master,
			basicInformation: {
				...devProject002.master.basicInformation,
				stnProjectName: "  dev   PROJECT alpha ",
			},
		};

		const result = updateProjectMaster(devProject002, {
			master: nextMaster,
			completenessFields: [],
		});

		expect(result.project.identityAliases).toEqual([]);
		expect(result.project.master.basicInformation.stnProjectName).toBe(
			"  dev   PROJECT alpha ",
		);
	});

	it("captures underscore-to-dash rename because punctuation remains significant", () => {
		const nextMaster = {
			...devProject005.master,
			basicInformation: {
				...devProject005.master.basicInformation,
				stnProjectName: "Signal-A",
			},
		};

		const result = updateProjectMaster(devProject005, {
			master: nextMaster,
			completenessFields: [],
		});

		expect(result.project.identityAliases).toContainEqual({
			kind: "stnProjectName",
			originalValue: "Signal_A",
			normalizedValue: "signal_a",
		});
	});

	it("returns configured completeness Advisories without blocking Master replacement", () => {
		const nextMaster = {
			...devProject002.master,
			basicInformation: {
				...devProject002.master.basicInformation,
				qciModelName: null,
			},
		};

		const result = updateProjectMaster(devProject002, {
			master: nextMaster,
			completenessFields: [
				{
					section: "basicInformation",
					field: "qciModelName",
					label: "QCI Model Name",
				},
			],
		});

		expect(result.project.master).toBe(nextMaster);
		expect(result.issues).toEqual([
			expect.objectContaining({
				code: "projectMaster.data.missing-field",
				severity: "advisory",
			}),
		]);
	});
});
