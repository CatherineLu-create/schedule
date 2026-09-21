import type { Project } from "../../domain/project/project";
import type { TeamFunctionDefinition } from "../../domain/team/teamTemplate";
import { validateProjectTeam } from "../../domain/team/teamValidation";
import type { ValidationIssue } from "../../domain/validation/validationIssue";
import { countBlocking } from "../../domain/validation/validationIssue";
import {
	materializeProjectTeam,
	validateTeamEditCandidate,
	type TeamEditCandidate,
} from "../teamImport/teamCandidate";

export interface SaveProjectTeamInput {
	readonly candidate: TeamEditCandidate;
	readonly standardFunctionDefinitions: readonly TeamFunctionDefinition[];
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

function validationIssueKey(issue: ValidationIssue): string {
	return [
		issue.code,
		issue.severity,
		issue.target.section,
		issue.target.entityId ?? "",
		issue.target.field ?? "",
	].join("\u0000");
}

function candidateIssueCoversCanonicalIssue(
	candidate: TeamEditCandidate,
	candidateIssue: ValidationIssue,
	canonicalIssue: ValidationIssue,
): boolean {
	if (
		candidateIssue.code !== canonicalIssue.code ||
		candidateIssue.severity !== canonicalIssue.severity ||
		candidateIssue.target.field !== canonicalIssue.target.field
	) {
		return false;
	}
	if (candidateIssue.target.entityId === canonicalIssue.target.entityId) return true;
	const row = candidate.rows.find(({ rowId }) =>
		rowId === candidateIssue.target.entityId,
	);
	return row !== undefined && (
		row.assignmentId === canonicalIssue.target.entityId ||
		row.functionRef?.functionId === canonicalIssue.target.entityId ||
		row.restrictedKey === canonicalIssue.target.entityId
	);
}

function mergeValidationIssues(
	candidate: TeamEditCandidate,
	candidateIssues: readonly ValidationIssue[],
	canonicalIssues: readonly ValidationIssue[],
): readonly ValidationIssue[] {
	const seen = new Set<string>();
	const result: ValidationIssue[] = [];
	for (const issue of candidateIssues) {
		const key = validationIssueKey(issue);
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(issue);
	}
	for (const issue of canonicalIssues) {
		if (candidateIssues.some((candidateIssue) =>
			candidateIssueCoversCanonicalIssue(candidate, candidateIssue, issue)
		)) {
			continue;
		}
		const key = validationIssueKey(issue);
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(issue);
	}
	return result;
}

export function saveProjectTeam(
	project: Project,
	input: SaveProjectTeamInput,
): SaveProjectTeamResult {
	if (input.candidate.projectId !== project.id) {
		return {
			ok: false,
			reason: "validation",
			issues: [{
				code: "team.data.project-mismatch",
				domain: "team",
				source: "data",
				severity: "blocking",
				message: "Team candidate belongs to a different Project.",
				target: { section: "team", entityId: input.candidate.projectId },
			}],
		};
	}
	const candidateIssues = validateTeamEditCandidate(
		input.candidate,
		input.standardFunctionDefinitions,
	);
	if (countBlocking(candidateIssues) > 0) {
		return { ok: false, reason: "validation", issues: candidateIssues };
	}
	const materialized = materializeProjectTeam(
		input.candidate,
		input.standardFunctionDefinitions,
	);
	if (!materialized.ok) {
		return {
			ok: false,
			reason: "validation",
			issues: mergeValidationIssues(
				input.candidate,
				candidateIssues,
				materialized.issues,
			),
		};
	}
	const canonicalIssues = validateProjectTeam(
		materialized.team,
		input.standardFunctionDefinitions,
	);
	const issues = mergeValidationIssues(
		input.candidate,
		candidateIssues,
		canonicalIssues,
	);

	if (countBlocking(issues) > 0) {
		return { ok: false, reason: "validation", issues };
	}

	return {
		ok: true,
		issues,
		project: {
			...project,
			team: materialized.team,
		},
	};
}
