import type { ValidationIssue } from "../validation/validationIssue";
import type {
	FunctionPersonAssignment,
	ProjectFunctionTeam,
	ProjectRoleAssignment,
	ProjectTeam,
} from "./team";

export type TeamImportProblem =
	| {
			readonly kind: "unassignedPerson";
			readonly entityId: string;
			readonly message: string;
	  }
	| {
			readonly kind: "unknownFunction";
			readonly entityId: string;
			readonly message: string;
	  };

export interface TeamValidationContext {
	readonly importProblems?: readonly TeamImportProblem[];
}

function functionIssue(
	functionTeam: ProjectFunctionTeam,
	issue: Pick<ValidationIssue, "code" | "severity" | "message">,
): ValidationIssue {
	return {
		...issue,
		domain: "team",
		source: "data",
		target: {
			section: "team.functions",
			entityId: functionTeam.function.functionId,
		},
	};
}

function missingEmailIssue(
	assignment: ProjectRoleAssignment | FunctionPersonAssignment,
	section: string,
): ValidationIssue | null {
	if (
		assignment.name?.trim() === "" ||
		assignment.name === null ||
		assignment.email?.trim()
	) {
		return null;
	}

	return {
		code: "team.data.missing-email",
		domain: "team",
		source: "data",
		severity: "advisory",
		message: "Person has a name but no email address.",
		target: {
			section,
			entityId: assignment.assignmentId,
			field: "email",
		},
	};
}

function validateFunctionTeam(
	functionTeam: ProjectFunctionTeam,
): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const ownerCount = functionTeam.assignments.filter(
		(assignment) => assignment.role === "owner",
	).length;
	const leaderCount = functionTeam.assignments.filter(
		(assignment) => assignment.role === "leader",
	).length;

	if (ownerCount > 1) {
		issues.push(
			functionIssue(functionTeam, {
				code: "team.data.multiple-owners",
				severity: "blocking",
				message: "Function has more than one Owner.",
			}),
		);
	}

	if (leaderCount > 1) {
		issues.push(
			functionIssue(functionTeam, {
				code: "team.data.multiple-leaders",
				severity: "blocking",
				message: "Function has more than one Leader.",
			}),
		);
	}

	if (
		functionTeam.applicability === "notApplicable" &&
		functionTeam.assignments.length > 0
	) {
		issues.push(
			functionIssue(functionTeam, {
				code: "team.data.not-applicable-with-people",
				severity: "blocking",
				message: "Not Applicable Function cannot contain assignments.",
			}),
		);
	}

	if (functionTeam.applicability === "applicable" && ownerCount === 0) {
		issues.push(
			functionIssue(functionTeam, {
				code: "team.data.missing-owner",
				severity: "advisory",
				message: "Applicable Function has no Owner.",
			}),
		);
	}

	if (functionTeam.applicability === "pending") {
		issues.push(
			functionIssue(functionTeam, {
				code: "team.data.pending-applicability",
				severity: "advisory",
				message: "Function must be marked Applicable or Not Applicable.",
			}),
		);
	}

	for (const assignment of functionTeam.assignments) {
		const issue = missingEmailIssue(assignment, "team.functions");
		if (issue !== null) {
			issues.push(issue);
		}
	}

	return issues;
}

function importProblemIssue(problem: TeamImportProblem): ValidationIssue {
	return {
		code:
			problem.kind === "unassignedPerson"
				? "team.import.unassigned-person"
				: "team.import.unknown-function",
		domain: "team",
		source: "import",
		severity: problem.kind === "unassignedPerson" ? "blocking" : "advisory",
		message: problem.message,
		target: {
			section: "team.import",
			entityId: problem.entityId,
		},
	};
}

export function validateProjectTeam(
	team: ProjectTeam,
	context: TeamValidationContext = {},
): readonly ValidationIssue[] {
	const projectRoleIssues = Object.values(team.projectRoles).flatMap(
		(assignment) => {
			if (assignment === null) {
				return [];
			}

			const issue = missingEmailIssue(assignment, "team.projectRoles");
			return issue === null ? [] : [issue];
		},
	);

	return [
		...(context.importProblems ?? []).map(importProblemIssue),
		...projectRoleIssues,
		...team.functions.flatMap(validateFunctionTeam),
	];
}

function isExactMemberDuplicate(
	candidate: FunctionPersonAssignment,
	kept: readonly FunctionPersonAssignment[],
): boolean {
	return (
		candidate.role === "member" &&
		kept.some(
			(existing) =>
				existing.role === "member" &&
				existing.assignmentId === candidate.assignmentId &&
				existing.name === candidate.name &&
				existing.email === candidate.email,
		)
	);
}

export function deduplicateExactMemberAssignments(
	team: ProjectTeam,
): ProjectTeam {
	let changed = false;
	const functions = team.functions.map((functionTeam) => {
		const assignments: FunctionPersonAssignment[] = [];

		for (const assignment of functionTeam.assignments) {
			if (isExactMemberDuplicate(assignment, assignments)) {
				changed = true;
				continue;
			}

			assignments.push(assignment);
		}

		return assignments.length === functionTeam.assignments.length
			? functionTeam
			: { ...functionTeam, assignments };
	});

	return changed ? { ...team, functions } : team;
}
