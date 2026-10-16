import type { FunctionAssignmentRole, ProjectRoleAssignment, ProjectTeam } from "./team";

export type RestrictedTeamRole =
	| "qciPm"
	| "qciPjm"
	| "acerPm"
	| "qciMeOwner"
	| "qciEeOwner"
	| "qciThermalOwner"
	| "qciBiosOwner";

export const formalTeamRoles = [
	{ key: "qciPm", label: "QCI PM", functionText: "QCI-PM-Owner" },
	{ key: "qciPjm", label: "QCI PjM", functionText: "QCI-PJM-Owner" },
	{ key: "acerPm", label: "Acer PM", functionText: "Acer PM" },
	{ key: "qciMeOwner", label: "ME Owner", functionText: "QCI-ME-Owner" },
	{ key: "qciEeOwner", label: "EE Owner", functionText: "QCI-EE-Owner" },
	{ key: "qciThermalOwner", label: "Thermal Owner", functionText: "QCI-Thermal-Owner" },
	{ key: "qciBiosOwner", label: "BIOS Owner", functionText: "QCI-BIOS-Owner" },
] as const;

// Engineering assignments retain their Function metadata in the roster. Do not
// reopen/count their saved project-role projection as a second person.
export function standaloneProjectRoleAssignments(team: ProjectTeam): readonly {
	readonly definition: (typeof formalTeamRoles)[number];
	readonly assignment: ProjectRoleAssignment;
}[] {
	return formalTeamRoles.flatMap((definition) => {
		const assignment = team.projectRoles[definition.key];
		if (assignment == null) return [];
		const representedInRoster = assignment.sourceFunctionId !== undefined &&
			team.functions.some(({ function: ref, assignments }) => ref.functionId === assignment.sourceFunctionId &&
				assignments.some((person) => person.assignmentId === assignment.assignmentId && person.role === "owner" &&
					person.name === assignment.name && person.email === assignment.email));
		return representedInRoster ? [] : [{ definition, assignment }];
	});
}

export type TeamLabelClassification =
	| { readonly kind: "restricted"; readonly key: RestrictedTeamRole }
	| { readonly kind: "functionRole"; readonly role: FunctionAssignmentRole }
	| { readonly kind: "unclassified"; readonly possibleRestricted: boolean };

const restrictedLabels = new Map<string, RestrictedTeamRole>(
	formalTeamRoles.map(({ key, functionText }) => [normalizeLabel(functionText), key]),
);

const restrictedOwnerFunctions = new Map<string, RestrictedTeamRole>([
	["QCI-ME", "qciMeOwner"],
	["QCI-EE", "qciEeOwner"],
	["QCI-THERMAL", "qciThermalOwner"],
	["QCI-BIOS", "qciBiosOwner"],
]);

function normalizeLabel(value: string): string {
	return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function isNotApplicableToken(value: string): boolean {
	const normalized = normalizeLabel(value);
	return normalized === "NA" || normalized === "N/A";
}

export function isInvalidApplicabilityFunctionLabel(value: string): boolean {
	const base = normalizeLabel(value).replace(/-(LEADER|OWNER|MEMBER)$/, "");
	return isNotApplicableToken(base);
}

export function isInvalidNotApplicableMemberName(value: string | null): boolean {
	return value !== null && isNotApplicableToken(value);
}

function labelTokens(value: string): readonly string[] {
	return normalizeLabel(value)
		.split(/[^A-Z0-9]+/)
		.filter((token) => token !== "");
}

function isPossibleRestrictedLabel(functionText: string): boolean {
	const tokens = new Set(labelTokens(functionText));
	const possibleAcerPm = tokens.has("ACER") && tokens.has("PM");
	const hasRestrictedSubject = ["PM", "PJM", "ME", "EE", "THERMAL", "BIOS"].some(
		(token) => tokens.has(token),
	);
	const hasKnownQualifier = ["ERD", "IQC", "CHROME", "WINDOWS"].some((token) =>
		tokens.has(token),
	);

	const possibleQciRole =
		tokens.has("QCI") &&
		tokens.has("OWNER") &&
		hasRestrictedSubject &&
		!hasKnownQualifier;

	return possibleAcerPm || possibleQciRole;
}

function explicitFunctionRole(
	functionText: string,
	roleText: string,
): FunctionAssignmentRole | null {
	const normalizedRole = normalizeLabel(roleText).toLowerCase();
	if (
		normalizedRole === "leader" ||
		normalizedRole === "owner" ||
		normalizedRole === "member"
	) {
		return normalizedRole;
	}

	const roleTokens = new Set(labelTokens(functionText));
	const present = (["leader", "owner", "member"] as const).filter((role) =>
		roleTokens.has(role.toUpperCase()),
	);
	return present.length === 1 ? present[0] : null;
}

export function classifyTeamLabel(
	functionText: string,
	roleText: string,
): TeamLabelClassification {
	const restricted = restrictedLabels.get(normalizeLabel(functionText));
	if (restricted !== undefined) {
		return { kind: "restricted", key: restricted };
	}
	if (normalizeLabel(roleText) === "OWNER") {
		const restrictedOwner = restrictedOwnerFunctions.get(normalizeLabel(functionText));
		if (restrictedOwner !== undefined) {
			return { kind: "restricted", key: restrictedOwner };
		}
	}

	if (isPossibleRestrictedLabel(functionText)) {
		return { kind: "unclassified", possibleRestricted: true };
	}

	const role = explicitFunctionRole(functionText, roleText);
	return role === null
		? { kind: "unclassified", possibleRestricted: false }
		: { kind: "functionRole", role };
}
