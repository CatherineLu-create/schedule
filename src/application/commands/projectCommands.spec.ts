import { describe, expect, expectTypeOf, it } from "vitest";
import { confirmCreateProjectAnyway } from "../workflow/workflowInterpretation";

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
    projectType: "new",
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
				projectType: "new",
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
				projectType: "new",
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

	it("returns a reviewable Advisory for a local business duplicate key", () => {
		const result = createProject(
			validInput({
				projectId: devProject003.id,
				master: {
					...fullMasterInput,
					basicInformation: {
						...fullMasterInput.basicInformation,
						year: devProject002.master.basicInformation.year,
						productLine:
							devProject002.master.basicInformation.productLine,
						stnProjectName: "  NAUTILUS ",
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
		const duplicateProject003 = {
			...devProject003,
			master: {
				...devProject003.master,
				basicInformation: {
					...devProject003.master.basicInformation,
					year: devProject002.master.basicInformation.year,
					productLine: devProject002.master.basicInformation.productLine,
					stnProjectName: devProject002.master.basicInformation.stnProjectName,
				},
			},
		};
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
				existingProjects: [devProject002, duplicateProject003],
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
		const punctuationProject = {
			...devProject005,
			master: {
				...devProject005.master,
				basicInformation: {
					...devProject005.master.basicInformation,
					stnProjectName: "Signal_A",
				},
			},
		};
		const base = punctuationProject.master.basicInformation;
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
			{ ...context, existingProjects: [punctuationProject] },
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
			{ ...context, existingProjects: [punctuationProject] },
		);

		expect(nonDuplicate.status).toBe("created");
		expect(normalizedDuplicate.status).toBe("reviewRequired");
		expect(punctuationProject.master.basicInformation.stnProjectName).toBe(
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
		}, { existingProjects: [] });

		expect(result.project.id).toBe(devProject002.id);
		expect(result.project.master).toBe(nextMaster);
		expect(result.project.identityAliases).toEqual([
			{
				kind: "stnProjectName",
				originalValue: "Nautilus",
				normalizedValue: "nautilus",
			},
			{
				kind: "qciModelName",
				originalValue: "ZNT",
				normalizedValue: "znt",
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
				stnProjectName: "  NAUTILUS ",
			},
		};

		const result = updateProjectMaster(devProject002, {
			master: nextMaster,
			completenessFields: [],
		}, { existingProjects: [] });

		expect(result.project.identityAliases).toEqual([]);
		expect(result.project.master.basicInformation.stnProjectName).toBe(
			"  NAUTILUS ",
		);
	});

	it("captures underscore-to-dash rename because punctuation remains significant", () => {
		const punctuationProject = {
			...devProject005,
			master: {
				...devProject005.master,
				basicInformation: {
					...devProject005.master.basicInformation,
					stnProjectName: "Signal_A",
				},
			},
		};
		const nextMaster = {
			...punctuationProject.master,
			basicInformation: {
				...punctuationProject.master.basicInformation,
				stnProjectName: "Signal-A",
			},
		};

		const result = updateProjectMaster(punctuationProject, {
			master: nextMaster,
			completenessFields: [],
		}, { existingProjects: [] });

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
		}, { existingProjects: [] });

		expect(result.project.master).toBe(nextMaster);
		expect(result.issues).toEqual([
			expect.objectContaining({
				code: "projectMaster.data.missing-field",
				severity: "advisory",
			}),
		]);
	});
});


describe("Feedback Batch 2 Project Type", () => {
  function typedInput(projectType: "new" | "regression" | null | undefined, name = "Manta") {
    return validInput({ master: { ...fullMasterInput, basicInformation: { ...fullMasterInput.basicInformation, projectType, stnProjectName: name } } });
  }
  const existing = { ...devProject002, master: { ...devProject002.master, basicInformation: { ...devProject002.master.basicInformation, stnProjectName: "Manta", projectType: null } } };
  it.each([null, undefined])("requires explicit Type for new creation (%s)", projectType => {
    expect(createProject(typedInput(projectType), context)).toMatchObject({ status: "rejected", reason: "requiredFields", missingFields: ["projectType"] });
  });
  it("blocks Regression without another same-name Project even with Create Anyway", () => {
    expect(createProject(typedInput("regression"), { ...context, allowBusinessIdentityDuplicate: true })).toMatchObject({ status: "rejected", reason: "projectTypeValidation" });
  });
  it.each(["Manta", " manta ", "MANTA"])("allows Regression %s across years and product lines", name => {
    const result = createProject(typedInput("regression", name), { ...context, existingProjects: [existing] });
    expect(result.status).toBe("created");
  });
  it.each(["Manta 14", "Man", "Manta  14"])("does not fuzzy match Regression %s", name => {
    expect(createProject(typedInput("regression", name), { ...context, existingProjects: [existing] }).status).toBe("rejected");
  });
  it("warns for New across years, and explicit confirmation retains New", () => {
    const request = typedInput("new");
    expect(createProject(request, { ...context, existingProjects: [existing] })).toMatchObject({ status: "reviewRequired", matchingProjectIds: [existing.id] });
    expect(createProject(request, { ...context, existingProjects: [existing], allowBusinessIdentityDuplicate: true })).toMatchObject({ status: "created", project: { master: { basicInformation: { projectType: "new" } } } });
  });
  it("preserves prior composite duplicate review even when exact-name matching differs", () => {
    const request = typedInput("new", "Manta  14");
    const prior = { ...existing, master: { ...existing.master, basicInformation: { ...existing.master.basicInformation, ...request.master.basicInformation, stnProjectName: "Manta 14" } } };
    expect(createProject(request, { ...context, existingProjects: [prior] })).toMatchObject({ status: "reviewRequired", issues: expect.arrayContaining([expect.objectContaining({ code: "projectMaster.data.duplicate-business-identity" })]) });
  });
  it("keeps valid Regression eligibility separate from legacy duplicate review and acknowledgment", () => {
    const request = typedInput("regression");
    const counterpart = { ...existing, master: { ...existing.master, basicInformation: { ...existing.master.basicInformation, ...request.master.basicInformation } } };
    const current = { ...context, existingProjects: [counterpart] };
    expect(createProject(request, current)).toMatchObject({ status: "reviewRequired", issues: [expect.objectContaining({ code: "projectMaster.data.duplicate-business-identity", severity: "advisory" })] });
    expect(confirmCreateProjectAnyway(request, current)).toMatchObject({ kind: "completed", result: { project: { master: { basicInformation: { projectType: "regression" } } } } });
    const renamed = { ...counterpart, master: { ...counterpart.master, basicInformation: { ...counterpart.master.basicInformation, stnProjectName: "Renamed counterpart" } } };
    expect(confirmCreateProjectAnyway(request, { ...current, existingProjects: [renamed] })).toMatchObject({ kind: "rejected", result: { reason: "projectTypeValidation" } });
    expect(confirmCreateProjectAnyway(typedInput("regression", "Changed candidate"), current)).toMatchObject({ kind: "rejected", result: { reason: "projectTypeValidation" } });
  });
  it("rejects an invalid Edit enum without changing canonical data or aliases", () => {
    const before = structuredClone(existing);
    const master = { ...existing.master, basicInformation: { ...existing.master.basicInformation, projectType: "invalid" as "new", stnProjectName: "Changed" } };
    const result = updateProjectMaster(existing, { master }, { existingProjects: [existing] });
    expect(result.project).toBe(existing);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "projectMaster.data.invalid-project-type", severity: "blocking" }));
    expect(existing).toEqual(before);
  });
  it("does not cascade eligibility when a counterpart is renamed and allows unchanged Regression fields", () => {
    const regression = { ...existing, master: { ...existing.master, basicInformation: { ...existing.master.basicInformation, projectType: "regression" as const } } };
    const counterpart = { ...existing, id: toProjectId("counterpart") };
    const before = structuredClone(regression);
    const renamed = updateProjectMaster(counterpart, { master: { ...counterpart.master, basicInformation: { ...counterpart.master.basicInformation, stnProjectName: "Renamed" } } }, { existingProjects: [regression, counterpart] });
    expect(renamed.issues).toEqual([]);
    expect(regression).toEqual(before);
    const master = { ...regression.master, other: { remark: "Unrelated save after counterpart rename" } };
    expect(updateProjectMaster(regression, { master }, { existingProjects: [regression, renamed.project] })).toMatchObject({ issues: [], project: { master } });
  });
  it("excludes self and blocks relevant edits without mutating Project or aliases", () => {
    const master = { ...existing.master, basicInformation: { ...existing.master.basicInformation, projectType: "regression" as const } };
    const result = updateProjectMaster(existing, { master }, { existingProjects: [existing] });
    expect(result.project).toBe(existing);
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: "blocking", code: "projectMaster.data.regression-requires-same-name" }));
  });
  it("accepts a relevant Regression edit with another exact-name Project and preserves null legacy edits", () => {
    const other = { ...existing, id: toProjectId("other-counterpart") };
    const master = { ...existing.master, basicInformation: { ...existing.master.basicInformation, stnProjectName: " MANTA ", projectType: "regression" as const } };
    expect(updateProjectMaster(existing, { master }, { existingProjects: [existing, other] })).toMatchObject({ issues: [], project: { master } });
    expect(updateProjectMaster(existing, { master: existing.master }, { existingProjects: [existing] }).project.master.basicInformation.projectType).toBeNull();
  });
  it("rejects an unknown runtime enum without allowing duplicate acknowledgment to bypass it", () => {
    expect(createProject(typedInput("other" as "new"), { ...context, allowBusinessIdentityDuplicate: true })).toMatchObject({ status: "rejected", reason: "projectTypeValidation" });
  });
  it("allows unrelated edits to an orphaned Regression but rechecks its changed name", () => {
    const orphan = { ...existing, master: { ...existing.master, basicInformation: { ...existing.master.basicInformation, projectType: "regression" as const } } };
    const master = { ...orphan.master, other: { remark: "Unrelated edit" } };
    expect(updateProjectMaster(orphan, { master }, { existingProjects: [orphan] }).issues).toEqual([]);
    const renamed = { ...master, basicInformation: { ...master.basicInformation, stnProjectName: "New unmatched name" } };
    expect(updateProjectMaster(orphan, { master: renamed }, { existingProjects: [orphan] }).project).toBe(orphan);
  });
});
