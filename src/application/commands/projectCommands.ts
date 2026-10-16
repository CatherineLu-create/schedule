import { findSameNameProjects } from "../identity/projectNameMatches";
import type { Project } from "../../domain/project/project";
import { normalizeProjectRemark, type ProjectMaster } from "../../domain/project/projectMaster";
import {
	validateProjectMasterCompleteness,
	validateProjectRemark,
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
	| "projectType"
	| "year"
	| "productLine"
	| "stnProjectName";

export interface CreateProjectMasterInput {
	readonly basicInformation: Omit<
		ProjectMaster["basicInformation"],
		"customer" | "status"
	> & {
		readonly customer?: CatalogItemId | null;
		readonly status?: CatalogItemId | null;
	};
	readonly platformHardware: ProjectMaster["platformHardware"];
	readonly leverage: ProjectMaster["leverage"];
	readonly cover: ProjectMaster["cover"];
	readonly modelRegulatory: ProjectMaster["modelRegulatory"];
	readonly mechanical: ProjectMaster["mechanical"];
	readonly other: ProjectMaster["other"];
}

export interface CreateProjectInput {
	readonly projectId: ProjectId;
	readonly master: CreateProjectMasterInput;
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
	| { readonly status: "rejected"; readonly reason: "fieldValidation"; readonly fieldErrors: { readonly remark: string } }
  | { readonly status: "rejected"; readonly reason: "projectTypeValidation"; readonly issues: readonly ValidationIssue[] }
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
	const basic = input.master.basicInformation;

	if (basic.projectType == null) missing.push("projectType");
	if (basic.year === null) missing.push("year");
	if (basic.productLine === null) missing.push("productLine");
	if (basic.stnProjectName?.trim().length === 0 || basic.stnProjectName === null) {
		missing.push("stnProjectName");
	}

	return missing;
}

function createInitialProjectMaster(
	input: CreateProjectMasterInput,
	defaults: CreateProjectDefaults,
): ProjectMaster {
	return {
		basicInformation: {
			...input.basicInformation,
			...(input.basicInformation.remark === undefined ? {} : { remark: normalizeProjectRemark(input.basicInformation.remark) }),
			status: input.basicInformation.status ?? defaults.statusId,
			customer: input.basicInformation.customer ?? defaults.customerId,
		},
		platformHardware: { ...input.platformHardware },
		leverage: { ...input.leverage },
		cover: { ...input.cover },
		modelRegulatory: { ...input.modelRegulatory },
		mechanical: {
			product: { ...input.mechanical.product },
			package: { ...input.mechanical.package },
		},
		other: { ...input.other },
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
	const candidateBasic = input.master.basicInformation;

	return (
		basic.year === candidateBasic.year &&
		basic.productLine === candidateBasic.productLine &&
		projectIdentityNamesMatch(
			basic.stnProjectName,
			candidateBasic.stnProjectName,
		)
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
	const remarkError = validateProjectRemark(input.master.basicInformation.remark);
	if (remarkError !== undefined) return { status: "rejected", reason: "fieldValidation", fieldErrors: { remark: remarkError } };
	const missingFields = missingCreateFields(input);
	if (missingFields.length > 0) {
		return { status: "rejected", reason: "requiredFields", missingFields };
	}

	if (context.existingProjects.some((project) => project.id === input.projectId)) {
		return { status: "rejected", reason: "duplicateProjectId" };
	}

  const basic = input.master.basicInformation;
  const typeIssues = projectTypeIssues(basic.projectType, basic.stnProjectName, context.existingProjects, input.projectId);
  if (typeIssues.length) return { status: "rejected", reason: "projectTypeValidation", issues: typeIssues };
	const project: Project = {
		id: input.projectId,
		master: createInitialProjectMaster(input.master, context.defaults),
		identityAliases: [],
		team: createInitialProjectTeam(input.qciPm, context.defaults.teamTemplate),
	};
  const sameNameIds = new Set(basic.projectType === "new"
    ? findSameNameProjects(context.existingProjects, basic.stnProjectName).map(item => item.id) : []);
  // Preserve the existing composite duplicate review as well as the new exact-name warning.
  const matchingProjects = context.existingProjects.filter(existing => matchesBusinessIdentity(existing, input) || sameNameIds.has(existing.id));
  const matchingProjectIds = matchingProjects.map(existing => existing.id);
  const issues = matchingProjects.map(existing => matchesBusinessIdentity(existing, input)
    ? duplicateBusinessIdentityIssue(existing.id)
    : { ...duplicateBusinessIdentityIssue(existing.id), code: "projectMaster.data.duplicate-stn-project-name",
        message: "A Project with the same STN Project Name exists. You may continue creating this Project as New." });

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
	readonly fieldErrors?: { readonly remark?: string };
	readonly project: Project;
	readonly issues: readonly ValidationIssue[];
}

export function updateProjectMaster(
	project: Project,
	input: UpdateProjectMasterInput,
  context: { readonly existingProjects: readonly Project[] },
): UpdateProjectMasterResult {
	const remarkError = validateProjectRemark(input.master.basicInformation.remark);
	if (remarkError !== undefined) return { project, issues: [], fieldErrors: { remark: remarkError } };
	const previousBasic = project.master.basicInformation;
	const nextBasic = input.master.basicInformation;
  const relevantChange = (previousBasic.projectType ?? null) !== (nextBasic.projectType ?? null)
    || previousBasic.stnProjectName !== nextBasic.stnProjectName;
  const typeIssues = projectTypeIssues(nextBasic.projectType, nextBasic.stnProjectName, context.existingProjects, project.id, relevantChange);
  if (typeIssues.length) return { project, issues: typeIssues };
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
			master: nextBasic.remark === undefined ? input.master : {
				...input.master,
				basicInformation: { ...nextBasic, remark: normalizeProjectRemark(nextBasic.remark) },
			},
			identityAliases: aliases,
		},
	};
}

function projectTypeIssues(
  type: ProjectMaster["basicInformation"]["projectType"], name: string | null,
  projects: readonly Project[], projectId: ProjectId, checkRegression = true,
): readonly ValidationIssue[] {
  const invalid = type != null && type !== "new" && type !== "regression";
  const missingCounterpart = checkRegression && type === "regression" && findSameNameProjects(projects, name, projectId).length === 0;
  if (!invalid && !missingCounterpart) return [];
  return [{ code: invalid ? "projectMaster.data.invalid-project-type" : "projectMaster.data.regression-requires-same-name",
    domain: "projectMaster", source: "data", severity: "blocking",
    message: invalid ? "Select New or Regression." : "Regression requires another Project with the same STN Project Name.",
    target: { section: "projectMaster.basicInformation", entityId: projectId, field: "projectType" } }];
}
