import type { ProjectId } from "../../domain/shared/ids";
import type { TeamFunctionDefinition } from "../../domain/team/teamTemplate";
import type { ValidationIssue } from "../../domain/validation/validationIssue";
import type { PrototypeState } from "../state/prototypeState";
import type { TeamEditCandidate } from "../teamImport/teamCandidate";
import {
	saveProjectTeam,
	type SaveProjectTeamResult,
} from "./teamCommands";

export interface ProjectMismatchResult {
	readonly ok: false;
	readonly reason: "projectMismatch" | "projectMissing";
	readonly issues: readonly ValidationIssue[];
}

function ownershipIssue(
	reason: ProjectMismatchResult["reason"],
	projectId: ProjectId,
): ValidationIssue {
	return {
		code: reason === "projectMissing"
			? "team.data.project-missing"
			: "team.data.project-mismatch",
		domain: "team",
		source: "data",
		severity: "blocking",
		message: reason === "projectMissing"
			? "Requested Project was not found."
			: "Team candidate belongs to a different Project.",
		target: { section: "team", entityId: projectId },
	};
}

export function saveProjectTeamForState(
	state: PrototypeState,
	projectId: ProjectId,
	candidate: TeamEditCandidate,
	standardFunctionDefinitions: readonly TeamFunctionDefinition[],
): SaveProjectTeamResult | ProjectMismatchResult {
	const project = state.projects.find(({ id }) => id === projectId);
	if (project === undefined) {
		return {
			ok: false,
			reason: "projectMissing",
			issues: [ownershipIssue("projectMissing", projectId)],
		};
	}
	if (candidate.projectId !== projectId || candidate.projectId !== project.id) {
		return {
			ok: false,
			reason: "projectMismatch",
			issues: [ownershipIssue("projectMismatch", projectId)],
		};
	}
	return saveProjectTeam(project, {
		candidate,
		standardFunctionDefinitions,
	});
}
