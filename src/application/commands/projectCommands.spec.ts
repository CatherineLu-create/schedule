import { describe, expect, expectTypeOf, it } from "vitest";

import { coverCatalog, statusCatalog } from "../../config/v2/referenceData";
import {
	devProject002,
	devProject003,
	devProject005,
} from "../../fixtures/v2/canonicalProjectFixtures";
import {
	categoryReferenceFixtures,
	cpuReferenceFixtures,
	customerReferenceFixtures,
	gpuReferenceFixtures,
	panelSizeReferenceFixtures,
	productLineReferenceFixtures,
} from "../../fixtures/v2/referenceFixtures";
import { devTeamTemplateV2 } from "../../fixtures/v2/teamTemplateFixtures";
import {
	toPersonAssignmentId,
	toProjectId,
	type ProjectId,
} from "../../domain/shared/ids";
import type { ProjectRoleAssignment } from "../../domain/team/team";
import {
	createProject,
	type CreateProjectContext,
	type CreateProjectInput,
	type CreateProjectMasterInput,
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

const fullMasterInput: CreateProjectMasterInput = {
	basicInformation: {
		status: statusCatalog[2]!.id,
		year: 2029,
		customer: customerReferenceFixtures[1]!.id,
		category: categoryReferenceFixtures[0]!.id,
		productLine: productLineAlphaId,
		panelSize: panelSizeReferenceFixtures[0]!.id,
		stnProjectName: "DEV Full Master Create",
		qciModelName: "DEV-QCI-FULL-CREATE",
	},
	platformHardware: {
		cpu: cpuReferenceFixtures[0]!.id,
		gpu: gpuReferenceFixtures[1]!.id,
		pcbNumber: "DEV-PCB-FULL-CREATE",
		housingNumber: "DEV-HOUSING-FULL-CREATE",
	},
	leverage: {
		pcbLeverage: devProject002.id,
		aLeverage: devProject003.id,
		bLeverage: null,
		cLeverage: null,
		dLeverage: null,
	},
	cover: {
		aCover: coverCatalog[0]!.id,
		bCover: coverCatalog[1]!.id,
		cCover: coverCatalog[2]!.id,
		dCover: coverCatalog[3]!.id,
	},
	modelRegulatory: {
		acerModelName: "DEV Acer Full Model",
		acerMarketingName: "DEV Acer Full Marketing",
		ssid: "DEV-SSID-FULL",
		rmn: "DEV-RMN-FULL",
	},
	mechanical: {
		product: {
			productLengthMm: 320.5,
			productWidthMm: 220.25,
			productHeightMm: 18.75,
			productWeightG: 1500,
		},
		package: {
			packageLengthMm: 450,
			packageWidthMm: 330,
			packageHeightMm: 90,
			grossWeightG: 2800,
		},
	},
	other: { remark: "DEV full Master Create candidate" },
};

const {
	customer: ignoredCustomer,
	status: ignoredStatus,
	...basicWithoutCreateDefaults
} = fullMasterInput.basicInformation;
void ignoredCustomer;
void ignoredStatus;

const masterWithoutCreateDefaults: CreateProjectMasterInput = {
	...fullMasterInput,
	basicInformation: basicWithoutCreateDefaults,
};

const masterWithNullCreateDefaults: CreateProjectMasterInput = {
	...fullMasterInput,
	basicInformation: {
		...fullMasterInput.basicInformation,
		customer: null,
		status: null,
	},
};

function validInput(overrides: Partial<CreateProjectInput> = {}): CreateProjectInput {
	return {
		projectId: toProjectId("create-project-unique-id"),
		master: fullMasterInput,
		qciPm,
		...overrides,
	};
}

describe("Create Project command", () => {
	it("creates every canonical Master section from the full pre-create input", () => {
		const result = createProject(
			{
				projectId: toProjectId("create-project-full-master"),
				master: fullMasterInput,
				qciPm,
			},
			context,
		);

		expect(result.status).toBe("created");
		if (result.status !== "created") return;
		expect(result.project.master).toEqual(fullMasterInput);
		expect(Object.hasOwn(result.project, "schedule")).toBe(false);
	});

	it("exposes only the single Master-shaped Create input contract", () => {
		expectTypeOf<CreateProjectInput>().toEqualTypeOf<{
			readonly projectId: ProjectId;
			readonly master: CreateProjectMasterInput;
			readonly qciPm: ProjectRoleAssignment | null;
		}>();
	});

	it("rejects each missing Create-required field without inventing Master completeness", () => {
		const result = createProject(
			validInput({
				master: {
					...fullMasterInput,
					basicInformation: {
						...fullMasterInput.basicInformation,
						year: null,
						productLine: null,
						stnProjectName: "   ",
					},
				},
			}),
			context,
		);

		expect(result).toEqual({
			status: "rejected",
			reason: "requiredFields",
			missingFields: ["year", "productLine", "stnProjectName"],
		});
	});

	it("creates when only Year, Product Line, and STN Project Name have business values", () => {
		const minimalMaster: CreateProjectMasterInput = {
			basicInformation: {
				year: 2030,
				category: null,
				productLine: productLineAlphaId,
				panelSize: null,
				stnProjectName: "DEV Minimal Master",
				qciModelName: null,
			},
			platformHardware: {
				cpu: null,
				gpu: null,
				pcbNumber: null,
				housingNumber: null,
			},
			leverage: {
				pcbLeverage: null,
				aLeverage: null,
				bLeverage: null,
				cLeverage: null,
				dLeverage: null,
			},
			cover: {
				aCover: null,
				bCover: null,
				cCover: null,
				dCover: null,
			},
			modelRegulatory: {
				acerModelName: null,
				acerMarketingName: null,
				ssid: null,
				rmn: null,
			},
			mechanical: {
				product: {
					productLengthMm: null,
					productWidthMm: null,
					productHeightMm: null,
					productWeightG: null,
				},
				package: {
					packageLengthMm: null,
					packageWidthMm: null,
					packageHeightMm: null,
					grossWeightG: null,
				},
			},
			other: { remark: null },
		};

		const result = createProject(
			{
				projectId: toProjectId("create-project-minimal-master"),
				master: minimalMaster,
				qciPm: null,
			},
			context,
		);

		expect(result.status).toBe("created");
		if (result.status !== "created") return;
		expect(result.project.master).toEqual({
			basicInformation: {
				status: rfqStatusId,
				year: 2030,
				customer: acerCustomerId,
				category: null,
				productLine: productLineAlphaId,
				panelSize: null,
				stnProjectName: "DEV Minimal Master",
				qciModelName: null,
			},
			platformHardware: {
				cpu: null,
				gpu: null,
				pcbNumber: null,
				housingNumber: null,
			},
			leverage: {
				pcbLeverage: null,
				aLeverage: null,
				bLeverage: null,
				cLeverage: null,
				dLeverage: null,
			},
			cover: {
				aCover: null,
				bCover: null,
				cCover: null,
				dCover: null,
			},
			modelRegulatory: {
				acerModelName: null,
				acerMarketingName: null,
				ssid: null,
				rmn: null,
			},
			mechanical: {
				product: {
					productLengthMm: null,
					productWidthMm: null,
					productHeightMm: null,
					productWeightG: null,
				},
				package: {
					packageLengthMm: null,
					packageWidthMm: null,
					packageHeightMm: null,
					grossWeightG: null,
				},
			},
			other: { remark: null },
		});
	});

	it.each([
		["omitted", masterWithoutCreateDefaults],
		["canonical null", masterWithNullCreateDefaults],
	] as const)(
		"uses injected Acer/RFQ defaults for %s Customer/Status and keeps QCI PM in Team",
		(_inputKind, master) => {
			const result = createProject(validInput({ master }), context);

			expect(result.status).toBe("created");
			if (result.status !== "created") return;

			expect(result.project.id).toBe("create-project-unique-id");
			expect(result.project.master.basicInformation).toMatchObject({
				year: 2029,
				productLine: productLineAlphaId,
				stnProjectName: "DEV Full Master Create",
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
			expect(Object.hasOwn(result.project, "schedule")).toBe(false);
			expect(result.project.identityAliases).toEqual([]);
		},
	);

	it("allows explicit Customer and Status selections to override Create defaults", () => {
		const result = createProject(
			validInput({
				master: {
					...fullMasterInput,
					basicInformation: {
						...fullMasterInput.basicInformation,
						customer: customerReferenceFixtures[1]!.id,
						status: statusCatalog[2]!.id,
					},
				},
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
				master: {
					...fullMasterInput,
					basicInformation: {
						...fullMasterInput.basicInformation,
						stnProjectName: "Entirely Different Name",
					},
				},
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
				master: {
					...fullMasterInput,
					basicInformation: {
						...fullMasterInput.basicInformation,
						year: devProject003.master.basicInformation.year,
						productLine:
							devProject003.master.basicInformation.productLine,
						stnProjectName: "  dev   PROJECT alpha ",
					},
				},
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
		expect(Object.hasOwn(result.candidate, "schedule")).toBe(false);
	});

	it("returns every ProjectId matching a duplicate business identity", () => {
		const result = createProject(
			validInput({
				projectId: toProjectId("create-project-multiple-business-matches"),
				master: {
					...fullMasterInput,
					basicInformation: {
						...fullMasterInput.basicInformation,
						year: devProject002.master.basicInformation.year,
						productLine:
							devProject002.master.basicInformation.productLine,
						stnProjectName:
							devProject002.master.basicInformation.stnProjectName,
					},
				},
			}),
			{
				...context,
				existingProjects: [devProject002, devProject003],
			},
		);

		expect(result.status).toBe("reviewRequired");
		if (result.status !== "reviewRequired") return;
		expect(result.matchingProjectIds).toHaveLength(2);
		expect(result.matchingProjectIds).toEqual(
			expect.arrayContaining([devProject002.id, devProject003.id]),
		);
		expect(result.issues).toHaveLength(2);
		expect(result.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "projectMaster.data.duplicate-business-identity",
					severity: "advisory",
					target: expect.objectContaining({ entityId: devProject002.id }),
				}),
				expect.objectContaining({
					code: "projectMaster.data.duplicate-business-identity",
					severity: "advisory",
					target: expect.objectContaining({ entityId: devProject003.id }),
				}),
			]),
		);
	});

	it("supports an explicit Create Anyway path without merging Projects", () => {
		const result = createProject(
			validInput({
				projectId: devProject003.id,
				master: {
					...fullMasterInput,
					basicInformation: {
						...fullMasterInput.basicInformation,
						year: devProject003.master.basicInformation.year,
						productLine:
							devProject003.master.basicInformation.productLine,
						stnProjectName:
							devProject003.master.basicInformation.stnProjectName,
					},
				},
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
				master: {
					...fullMasterInput,
					basicInformation: {
						...fullMasterInput.basicInformation,
						year: base.year,
						productLine: base.productLine,
						stnProjectName: "Signal-A",
					},
				},
			}),
			{ ...context, existingProjects: [devProject005] },
		);
		const normalizedDuplicate = createProject(
			validInput({
				projectId: toProjectId("create-project-signal-underscore"),
				master: {
					...fullMasterInput,
					basicInformation: {
						...fullMasterInput.basicInformation,
						year: base.year,
						productLine: base.productLine,
						stnProjectName: " signal_a ",
					},
				},
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
