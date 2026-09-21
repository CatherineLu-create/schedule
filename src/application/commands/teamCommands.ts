import type { Project } from "../../domain/project/project";
import type { ProjectTeam } from "../../domain/team/team";
import {
	validateProjectTeam,
	type TeamImportProblem,
} from "../../domain/team/teamValidation";
import type { ValidationIssue } from "../../domain/validation/validationIssue";
import { countBlocking } from "../../domain/validation/validationIssue";

export interface SaveProjectTeamInput {
	readonly team: ProjectTeam;
	readonly importProblems?: readonly TeamImportProblem[];
}

export type SaveProjectTeamResult =
	| {
			readonly ok: true;
			readonly project: Project;
			readonly issues: readonly ValidationIssue[];
	  }
	| {
			readonly ok: false;
			readonly reason: "validation";
			readonly issues: readonly ValidationIssue[];
	  };

export function saveProjectTeam(
	project: Project,
	input: SaveProjectTeamInput,
): SaveProjectTeamResult {
	const issues = validateProjectTeam(input.team, {
		importProblems: input.importProblems,
	});

	if (countBlocking(issues) > 0) {
		return { ok: false, reason: "validation", issues };
	}

	return {
		ok: true,
		issues,
		project: {
			...project,
			team: input.team,
		},
	};
}
