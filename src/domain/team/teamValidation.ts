import type { ValidationIssue } from "../validation/validationIssue";
import type {
	FunctionPersonAssignment,
	ProjectFunctionTeam,
	ProjectTeam,
	TeamSourceCell,
	TeamSourceRow,
} from "./team";
import {
	classifyTeamLabel,
	type RestrictedTeamRole,
} from "./teamRoleMapping";

export interface RestrictedCountRow {
	readonly rowId: string;
	readonly functionText: string;
	readonly roleText: string;
	readonly key: RestrictedTeamRole | null;
	readonly possibleRestricted: boolean;
	readonly name: string | null;
	readonly normalizedEmail: string | null;
	readonly extraCells: readonly TeamSourceCell[];
	readonly sourceRows: readonly TeamSourceRow[];
}

const restrictedTeamRoles: readonly RestrictedTeamRole[] = [
	"qciPm",
	"qciPjm",
	"acerPm",
	"qciMeOwner",
	"qciEeOwner",
	"qciThermalOwner",
	"qciBiosOwner",
];

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
	assignment: {
		readonly rowId: string;
		readonly name: string | null;
		readonly email: string | null;
	},
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
			entityId: assignment.rowId,
			field: "email",
		},
	};
}

function sameCell(left: TeamSourceCell, right: TeamSourceCell): boolean {
	return (
		left.columnIndex === right.columnIndex &&
		left.headerText === right.headerText &&
		left.rawType === right.rawType &&
		left.rawValue === right.rawValue &&
		left.formattedText === right.formattedText &&
		left.hidden === right.hidden
	);
}

function sameExtraCells(
	left: readonly TeamSourceCell[],
	right: readonly TeamSourceCell[],
): boolean {
	return (
		left.length === right.length &&
		left.every((cell, index) => sameCell(cell, right[index]!))
	);
}

function sameCountIdentity(
	left: RestrictedCountRow,
	right: RestrictedCountRow,
): boolean {
	return (
		left.normalizedEmail !== null &&
		left.normalizedEmail !== "" &&
		left.normalizedEmail === right.normalizedEmail &&
		left.functionText === right.functionText &&
		left.roleText === right.roleText &&
		left.name === right.name &&
		sameExtraCells(left.extraCells, right.extraCells)
	);
}

function sameUnresolvedBlankEmailIdentity(
	left: RestrictedCountRow,
	right: RestrictedCountRow,
): boolean {
	return (
		left.normalizedEmail === null &&
		right.normalizedEmail === null &&
		left.functionText === right.functionText &&
		left.roleText === right.roleText &&
		left.name === right.name &&
		sameExtraCells(left.extraCells, right.extraCells)
	);
}

function restrictedIssue(
	code: string,
	severity: ValidationIssue["severity"],
	message: string,
	entityId: string,
): ValidationIssue {
	return {
		code,
		domain: "team",
		source: "data",
		severity,
		message,
		target: { section: "team.restrictedRoles", entityId },
	};
}

function validateIdentityConflicts(
	rows: readonly RestrictedCountRow[],
): readonly ValidationIssue[] {
	return rows
		.filter(
			(row, index) =>
				row.normalizedEmail !== null &&
				rows.some(
					(other, otherIndex) =>
						otherIndex !== index &&
						other.normalizedEmail === row.normalizedEmail &&
						(other.name !== row.name ||
							!sameExtraCells(other.extraCells, row.extraCells)),
				),
		)
		.map((row) => ({
			code: "team.data.identity-conflict",
			domain: "team",
			source: "data",
			severity: "advisory",
			message: "Rows with the same email contain conflicting person data.",
			target: {
				section: "team.roster",
				entityId: row.rowId,
			},
		}));
}

export function validateRestrictedRoleRows(
	rows: readonly RestrictedCountRow[],
): readonly ValidationIssue[] {
	const issues: ValidationIssue[] = rows
		.filter((row) => row.key === null && row.possibleRestricted)
		.map((row) =>
			restrictedIssue(
				"team.data.restricted-role-ambiguous",
				"blocking",
				"Role label may identify a restricted Team role and must be resolved.",
				row.rowId,
			),
		);

	for (const key of restrictedTeamRoles) {
		const keyedRows = rows.filter((row) => row.key === key);
		const distinctRows: RestrictedCountRow[] = [];
		for (const row of keyedRows) {
			if (!distinctRows.some((existing) => sameCountIdentity(row, existing))) {
				distinctRows.push(row);
			}
		}

		if (distinctRows.length === 0) {
			issues.push(
				restrictedIssue(
					"team.data.restricted-role-missing",
					"advisory",
					"Restricted Team role has no assigned person.",
					key,
				),
			);
		} else if (distinctRows.length > 1) {
			issues.push(
				...distinctRows.map((row) =>
					restrictedIssue(
						"team.data.restricted-role-multiple",
						"blocking",
						"Restricted Team role has more than one distinct person.",
						row.rowId,
					),
				),
			);
		}

		const unresolvedBlankEmailRows = keyedRows.filter(
			(row, index) =>
				row.normalizedEmail === null &&
				keyedRows.some(
					(other, otherIndex) =>
						otherIndex !== index && sameUnresolvedBlankEmailIdentity(row, other),
				),
		);
		issues.push(
			...unresolvedBlankEmailRows.map((row) =>
				restrictedIssue(
					"team.data.restricted-role-identity-unresolved",
					"blocking",
					"Restricted Team role rows without email cannot be safely identified as one or multiple people.",
					row.rowId,
				),
			),
		);
	}

	return issues;
}

function validateFunctionTeam(
	functionTeam: ProjectFunctionTeam,
	hasPreservedPerson: boolean,
): ValidationIssue[] {
	const issues: ValidationIssue[] = [];

	if (
		functionTeam.applicability === "notApplicable" &&
		(functionTeam.assignments.length > 0 || hasPreservedPerson)
	) {
		issues.push(
			functionIssue(functionTeam, {
				code: "team.data.not-applicable-with-people",
				severity: "blocking",
				message: "Not Applicable Function cannot contain assignments.",
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
		const issue = missingEmailIssue(
			{ ...assignment, rowId: assignment.assignmentId },
			"team.functions",
		);
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

			const issue = missingEmailIssue(
				{ ...assignment, rowId: assignment.assignmentId },
				"team.projectRoles",
			);
			return issue === null ? [] : [issue];
		},
	);
	const projectRoleRows: RestrictedCountRow[] = (
		[
			["qciPm", team.projectRoles.qciPm, "QCI-PM-Owner"],
			["qciPjm", team.projectRoles.qciPjm, "QCI-PJM-Owner"],
			["acerPm", team.projectRoles.acerPm, "Acer PM"],
		] as const
	).flatMap(([key, assignment, defaultLabel]) =>
		assignment === null
			? []
			: [
					{
						rowId: assignment.assignmentId,
						functionText: assignment.functionText ?? defaultLabel,
						roleText: defaultLabel,
						key,
						possibleRestricted: false,
						name: assignment.name,
						normalizedEmail: assignment.email?.trim().toLowerCase() || null,
						extraCells: assignment.extraCells ?? [],
						sourceRows: assignment.sourceRows ?? [],
					},
				],
	);
	const functionRows: RestrictedCountRow[] = team.functions.flatMap(
		(functionTeam) =>
			functionTeam.assignments.map((assignment) => {
				const functionText =
					functionTeam.function.kind === "custom"
						? functionTeam.function.displayName
						: (assignment.functionText ?? "");
				const classification = classifyTeamLabel(functionText, assignment.role);
				return {
					rowId: assignment.assignmentId,
					functionText,
					roleText: assignment.role,
					key: classification.kind === "restricted" ? classification.key : null,
					possibleRestricted:
						classification.kind === "unclassified" &&
						classification.possibleRestricted,
					name: assignment.name,
					normalizedEmail: assignment.email?.trim().toLowerCase() || null,
					extraCells: assignment.extraCells ?? [],
					sourceRows: assignment.sourceRows ?? [],
				};
			}),
	);
	const preservedRows: RestrictedCountRow[] = (
		team.preservedUnclassifiedEntries ?? []
	).map((entry) => {
		const functionText =
			entry.function.kind === "custom"
				? entry.function.displayName
				: entry.functionText;
		const classification = classifyTeamLabel(functionText, entry.roleText);
		const exclusionMatches =
			entry.restrictedRoleExclusion?.functionText === functionText &&
			entry.restrictedRoleExclusion.roleText === entry.roleText;
		return {
			rowId: entry.entryId,
			functionText,
			roleText: entry.roleText,
			key: classification.kind === "restricted" ? classification.key : null,
			possibleRestricted:
				classification.kind === "unclassified" &&
				classification.possibleRestricted &&
				!exclusionMatches,
			name: entry.name,
			normalizedEmail: entry.email?.trim().toLowerCase() || null,
			extraCells: entry.extraCells,
			sourceRows: entry.sourceRows,
		};
	});
	const preservedEmailIssues = (team.preservedUnclassifiedEntries ?? []).flatMap(
		(entry) => {
			const issue = missingEmailIssue(
				{ rowId: entry.entryId, name: entry.name, email: entry.email },
				"team.preservedUnclassifiedEntries",
			);
			return issue === null ? [] : [issue];
		},
	);

	return [
		...(context.importProblems ?? []).map(importProblemIssue),
		...projectRoleIssues,
		...preservedEmailIssues,
		...team.functions.flatMap((functionTeam) =>
			validateFunctionTeam(
				functionTeam,
				(team.preservedUnclassifiedEntries ?? []).some(
					(entry) =>
						entry.function.functionId === functionTeam.function.functionId,
				),
			),
		),
		...validateIdentityConflicts([
			...projectRoleRows,
			...functionRows,
			...preservedRows,
		]),
		...validateRestrictedRoleRows([
			...projectRoleRows,
			...functionRows,
			...preservedRows,
		]),
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
