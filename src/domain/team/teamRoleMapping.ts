import type { FunctionAssignmentRole } from "./team";

export type RestrictedTeamRole =
	| "qciPm"
	| "qciPjm"
	| "acerPm"
	| "qciMeOwner"
	| "qciEeOwner"
	| "qciThermalOwner"
	| "qciBiosOwner";

export type TeamLabelClassification =
	| { readonly kind: "restricted"; readonly key: RestrictedTeamRole }
	| { readonly kind: "functionRole"; readonly role: FunctionAssignmentRole }
	| { readonly kind: "unclassified"; readonly possibleRestricted: boolean };

const restrictedLabels = new Map<string, RestrictedTeamRole>([
	["QCI-PM-OWNER", "qciPm"],
	["QCI-PJM-OWNER", "qciPjm"],
	["ACER PM", "acerPm"],
	["QCI-ME-OWNER", "qciMeOwner"],
	["QCI-EE-OWNER", "qciEeOwner"],
	["QCI-THERMAL-OWNER", "qciThermalOwner"],
	["QCI-BIOS-OWNER", "qciBiosOwner"],
]);

function normalizeLabel(value: string): string {
	return value.trim().replace(/\s+/g, " ").toUpperCase();
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

	if (isPossibleRestrictedLabel(functionText)) {
		return { kind: "unclassified", possibleRestricted: true };
	}

	const role = explicitFunctionRole(functionText, roleText);
	return role === null
		? { kind: "unclassified", possibleRestricted: false }
		: { kind: "functionRole", role };
}
