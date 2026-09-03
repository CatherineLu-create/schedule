import type { Project } from "../../domain/project/project";
import type { ProjectMaster } from "../../domain/project/projectMaster";
import {
	validateProjectMasterCompleteness,
	type ProjectMasterCompletenessField,
} from "../../domain/project/projectMasterValidation";
import type {
	CatalogItemId,
	ProjectId,
} from "../../domain/shared/ids";
import type {
	ProjectRoleAssignment,
	ProjectTeam,
} from "../../domain/team/team";
import {
	updateProjectTeamFromTemplate,
	type TeamTemplate,
} from "../../domain/team/teamTemplate";
import type { ValidationIssue } from "../../domain/validation/validationIssue";
import {
	capturePreviousIdentityAlias,
	projectIdentityNamesMatch,
} from "../identity/projectIdentity";

export type CreateProjectRequiredField =
	| "year"
	| "productLine"
	| "stnProjectName";

export interface CreateProjectInput {
	readonly projectId: ProjectId;
	readonly year: number | null;
	readonly productLineId: CatalogItemId | null;
	readonly stnProjectName: string | null;
	readonly customerId?: CatalogItemId;
	readonly statusId?: CatalogItemId;
	readonly qciPm: ProjectRoleAssignment | null;
}

export interface CreateProjectDefaults {
	readonly customerId: CatalogItemId;
	readonly statusId: CatalogItemId;
	readonly teamTemplate: TeamTemplate;
}

export interface CreateProjectContext {
	readonly existingProjects: readonly Project[];
	readonly defaults: CreateProjectDefaults;
	readonly allowBusinessIdentityDuplicate?: boolean;
}

export type CreateProjectResult =
	| {
			readonly status: "rejected";
			readonly reason: "requiredFields";
			readonly missingFields: readonly CreateProjectRequiredField[];
	  }
	| {
			readonly status: "rejected";
			readonly reason: "duplicateProjectId";
	  }
	| {
			readonly status: "reviewRequired";
			readonly candidate: Project;
			readonly matchingProjectIds: readonly ProjectId[];
			readonly issues: readonly ValidationIssue[];
	  }
	| {
			readonly status: "created";
			readonly project: Project;
			readonly issues: readonly ValidationIssue[];
	  };

function missingCreateFields(
	input: CreateProjectInput,
): CreateProjectRequiredField[] {
	const missing: CreateProjectRequiredField[] = [];

	if (input.year === null) missing.push("year");
	if (input.productLineId === null) missing.push("productLine");
	if (input.stnProjectName?.trim().length === 0 || input.stnProjectName === null) {
		missing.push("stnProjectName");
	}

	return missing;
}

function createInitialProjectMaster(
	input: CreateProjectInput,
	defaults: CreateProjectDefaults,
): ProjectMaster {
	return {
		basicInformation: {
			status: input.statusId ?? defaults.statusId,
			year: input.year,
			customer: input.customerId ?? defaults.customerId,
			category: null,
			productLine: input.productLineId,
			panelSize: null,
			stnProjectName: input.stnProjectName,
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
}

function createInitialProjectTeam(
	qciPm: ProjectRoleAssignment | null,
	template: TeamTemplate,
): ProjectTeam {
	return updateProjectTeamFromTemplate(
		{
			projectRoles: { qciPm, qciPjm: null, acerPm: null },
			functions: [],
			appliedTemplate: null,
		},
		template,
	);
}

function matchesBusinessIdentity(
	project: Project,
	input: CreateProjectInput,
): boolean {
	const basic = project.master.basicInformation;

	return (
		basic.year === input.year &&
		basic.productLine === input.productLineId &&
		projectIdentityNamesMatch(basic.stnProjectName, input.stnProjectName)
	);
}

function duplicateBusinessIdentityIssue(projectId: ProjectId): ValidationIssue {
	return {
		code: "projectMaster.data.duplicate-business-identity",
		domain: "projectMaster",
		source: "data",
		severity: "advisory",
		message: "A Project with the same Year, Product Line, and STN Project Name exists.",
		target: {
			section: "projectMaster.basicInformation",
			entityId: projectId,
			field: "stnProjectName",
		},
	};
}

export function createProject(
	input: CreateProjectInput,
	context: CreateProjectContext,
): CreateProjectResult {
	const missingFields = missingCreateFields(input);
	if (missingFields.length > 0) {
		return { status: "rejected", reason: "requiredFields", missingFields };
	}

	if (context.existingProjects.some((project) => project.id === input.projectId)) {
		return { status: "rejected", reason: "duplicateProjectId" };
	}

	const project: Project = {
		id: input.projectId,
		master: createInitialProjectMaster(input, context.defaults),
		identityAliases: [],
		schedule: { publishedVersions: [], workingDraft: null },
		team: createInitialProjectTeam(input.qciPm, context.defaults.teamTemplate),
	};
	const matchingProjectIds = context.existingProjects
		.filter((existing) => matchesBusinessIdentity(existing, input))
		.map((existing) => existing.id);
	const issues = matchingProjectIds.map(duplicateBusinessIdentityIssue);

	if (
		matchingProjectIds.length > 0 &&
		context.allowBusinessIdentityDuplicate !== true
	) {
		return {
			status: "reviewRequired",
			candidate: project,
			matchingProjectIds,
			issues,
		};
	}

	return { status: "created", project, issues };
}

export interface UpdateProjectMasterInput {
	readonly master: ProjectMaster;
	readonly completenessFields?: readonly ProjectMasterCompletenessField[];
}

export interface UpdateProjectMasterResult {
	readonly project: Project;
	readonly issues: readonly ValidationIssue[];
}

export function updateProjectMaster(
	project: Project,
	input: UpdateProjectMasterInput,
): UpdateProjectMasterResult {
	const previousBasic = project.master.basicInformation;
	const nextBasic = input.master.basicInformation;
	let aliases = capturePreviousIdentityAlias({
		aliases: project.identityAliases,
		kind: "stnProjectName",
		previousValue: previousBasic.stnProjectName,
		nextValue: nextBasic.stnProjectName,
	});

	aliases = capturePreviousIdentityAlias({
		aliases,
		kind: "qciModelName",
		previousValue: previousBasic.qciModelName,
		nextValue: nextBasic.qciModelName,
	});

	const issues = validateProjectMasterCompleteness(
		input.master,
		input.completenessFields ?? [],
	).map((issue) => ({
		...issue,
		target: { ...issue.target, entityId: project.id },
	}));

	return {
		issues,
		project: {
			...project,
			master: input.master,
			identityAliases: aliases,
		},
	};
}
