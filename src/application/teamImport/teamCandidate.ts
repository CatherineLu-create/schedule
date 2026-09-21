import type { ProjectId, TeamFunctionId } from "../../domain/shared/ids";
import type {
	CustomProjectFunctionRef,
	FunctionApplicability,
	FunctionAssignmentRole,
	ProjectFunctionRef,
	ProjectTeam,
	TeamSourceCell,
	TeamSourceRow,
} from "../../domain/team/team";
import type { TeamFunctionDefinition } from "../../domain/team/teamTemplate";
import {
	classifyTeamLabel,
	type RestrictedTeamRole,
} from "../../domain/team/teamRoleMapping";
import type { TeamParsedSheet } from "./teamImport";

export interface TeamCandidateRow {
	readonly rowId: string;
	readonly functionText: string;
	readonly functionRef: ProjectFunctionRef | null;
	readonly parsedRole: FunctionAssignmentRole | "unclassified";
	readonly restrictedKey: RestrictedTeamRole | null;
	readonly possibleRestricted: boolean;
	readonly restrictedRoleDecision: "unresolved" | "confirmedNoncritical";
	readonly roleText: string;
	readonly name: string | null;
	readonly email: string | null;
	readonly extraCells: readonly TeamSourceCell[];
	readonly sourceRows: readonly TeamSourceRow[];
	readonly applicability: FunctionApplicability | null;
}

export interface TeamEditCandidate {
	readonly projectId: ProjectId;
	readonly origin: "manual" | "import";
	readonly fileName: string | null;
	readonly baseTeam: ProjectTeam | null;
	readonly rows: readonly TeamCandidateRow[];
	readonly excludedSourceRowIds: readonly string[];
}

export type TeamCandidateEditablePatch = Partial<Pick<
	TeamCandidateRow,
	"roleText" | "name" | "email" | "extraCells" | "applicability"
>>;

const projectRoleKeys = new Set<RestrictedTeamRole>(["qciPm", "qciPjm", "acerPm"]);

function normalizedLabel(value: string): string {
	return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function valueFromHeader(row: TeamSourceRow, header: string): string | null {
	const cell = row.cells.find(
		(value) => value.headerText?.trim().toLowerCase() === header,
	);
	if (cell === undefined || cell.rawValue === null) return null;
	return String(cell.rawValue);
}

function definitionFor(
	functionId: TeamFunctionId,
	standardFunctionDefinitions: readonly TeamFunctionDefinition[],
): TeamFunctionDefinition | null {
	return standardFunctionDefinitions.find(({ id }) => id === functionId) ?? null;
}

function currentLabel(
	row: Pick<TeamCandidateRow, "functionText" | "functionRef">,
	standardFunctionDefinitions: readonly TeamFunctionDefinition[],
): string {
	if (row.functionRef?.kind === "custom") return row.functionRef.displayName;
	if (row.functionRef?.kind === "standard") {
		return definitionFor(row.functionRef.functionId, standardFunctionDefinitions)?.displayName ?? row.functionText;
	}
	return row.functionText;
}

function restrictedRoleToParsedRole(
	key: RestrictedTeamRole,
): FunctionAssignmentRole | "unclassified" {
	return projectRoleKeys.has(key) ? "unclassified" : "owner";
}

function deriveRow(
	row: TeamCandidateRow,
	standardFunctionDefinitions: readonly TeamFunctionDefinition[],
	previousRow?: TeamCandidateRow,
): TeamCandidateRow {
	const label = currentLabel(row, standardFunctionDefinitions);
	const classification = classifyTeamLabel(label, row.roleText);
	const classificationIdentity = `${normalizedLabel(label)}\u0000${normalizedLabel(row.roleText)}`;
	const previousIdentity = previousRow === undefined
		? null
		: `${normalizedLabel(currentLabel(previousRow, standardFunctionDefinitions))}\u0000${normalizedLabel(previousRow.roleText)}`;
	const preservedDecision =
		classification.kind === "unclassified" &&
		classification.possibleRestricted &&
		previousRow?.restrictedRoleDecision === "confirmedNoncritical" &&
		previousIdentity === classificationIdentity
			? "confirmedNoncritical"
			: "unresolved";
	if (classification.kind === "restricted") {
		return {
			...row,
			parsedRole: restrictedRoleToParsedRole(classification.key),
			restrictedKey: classification.key,
			possibleRestricted: false,
			restrictedRoleDecision: "unresolved",
		};
	}
	if (classification.kind === "functionRole") {
		return {
			...row,
			parsedRole: classification.role,
			restrictedKey: null,
			possibleRestricted: false,
			restrictedRoleDecision: "unresolved",
		};
	}
	return {
		...row,
		parsedRole: "unclassified",
		restrictedKey: null,
		possibleRestricted: classification.possibleRestricted,
		restrictedRoleDecision: preservedDecision,
	};
}

function sameFunctionRef(left: ProjectFunctionRef, right: ProjectFunctionRef): boolean {
	return left.functionId === right.functionId && left.kind === right.kind;
}

function functionAssociations(team: ProjectTeam | null): Map<string, readonly ProjectFunctionRef[]> {
	const associations = new Map<string, ProjectFunctionRef[]>();
	if (team === null) return associations;
	const add = (label: string, ref: ProjectFunctionRef) => {
		const key = normalizedLabel(label);
		if (key === "") return;
		const existing = associations.get(key) ?? [];
		if (!existing.some((candidate) => sameFunctionRef(candidate, ref))) {
			associations.set(key, [...existing, ref]);
		}
	};
	for (const functionTeam of team.functions) {
		if (functionTeam.function.kind !== "custom") continue;
		add(functionTeam.function.functionId, functionTeam.function);
		add(functionTeam.function.displayName, functionTeam.function);
		for (const assignment of functionTeam.assignments) {
			if (assignment.functionText !== undefined) {
				add(assignment.functionText, functionTeam.function);
			}
		}
	}
	for (const entry of team.preservedUnclassifiedEntries ?? []) {
		if (entry.function.kind !== "custom") continue;
		add(entry.functionText, entry.function);
		add(entry.function.displayName, entry.function);
	}
	return associations;
}

function standardFunctionAssociations(
	standardFunctionDefinitions: readonly TeamFunctionDefinition[],
): Map<string, readonly TeamFunctionDefinition[]> {
	const associations = new Map<string, TeamFunctionDefinition[]>();
	const add = (label: string, definition: TeamFunctionDefinition) => {
		const key = normalizedLabel(label);
		if (key === "") return;
		const existing = associations.get(key) ?? [];
		if (!existing.some(({ id }) => id === definition.id)) {
			associations.set(key, [...existing, definition]);
		}
	};
	for (const definition of standardFunctionDefinitions) {
		add(definition.id, definition);
		add(definition.displayName, definition);
	}
	return associations;
}

function applicabilityFor(
	team: ProjectTeam | null,
	ref: ProjectFunctionRef | null,
): FunctionApplicability | null {
	if (team === null || ref === null) return null;
	return (
		team.functions.find(
			(functionTeam) => functionTeam.function.functionId === ref.functionId,
		)?.applicability ?? null
	);
}

function parsedRowId(importSessionId: string, row: TeamSourceRow): string {
	const functionColumn = row.cells.find(
		(cell) => cell.headerText?.trim().toLowerCase() === "function",
	)?.columnIndex ?? 0;
	return `${importSessionId}::${row.sheetName}::R${row.rowNumber}C${functionColumn}`;
}

export function createImportCandidate(
	projectId: ProjectId,
	baseTeam: ProjectTeam | null,
	selectedSheet: TeamParsedSheet,
	importSessionId: string,
	standardFunctionDefinitions: readonly TeamFunctionDefinition[],
	createFunctionId: () => TeamFunctionId,
): TeamEditCandidate {
	if (importSessionId.trim() === "") {
		throw new Error("Import session ID must not be blank");
	}
	const associations = functionAssociations(baseTeam);
	const standardAssociations = standardFunctionAssociations(standardFunctionDefinitions);
	const newCustomRefs = new Map<string, CustomProjectFunctionRef>();
	const rows = selectedSheet.rows.map((source): TeamCandidateRow => {
		const functionText = valueFromHeader(source, "function") ?? "";
		const name = valueFromHeader(source, "member");
		const email = valueFromHeader(source, "email");
		const extraCells = source.cells.filter((cell) => {
			const header = cell.headerText?.trim().toLowerCase();
			return header !== "function" && header !== "member" && header !== "email";
		});
		const classification = classifyTeamLabel(functionText, "");
		const isProjectRole =
			classification.kind === "restricted" && projectRoleKeys.has(classification.key);
		const isPossibleRestricted =
			classification.kind === "unclassified" && classification.possibleRestricted;
		let functionRef: ProjectFunctionRef | null = null;
		if (!isProjectRole && !isPossibleRestricted && functionText.trim() !== "") {
			const key = normalizedLabel(functionText);
			const standardMatches = standardAssociations.get(key) ?? [];
			const savedMatches = associations.get(key) ?? [];
			if (standardMatches.length === 1) {
				functionRef = { kind: "standard", functionId: standardMatches[0]!.id };
			} else if (standardMatches.length === 0 && savedMatches.length === 1) {
				functionRef = savedMatches[0]!;
			} else if (standardMatches.length === 0 && savedMatches.length === 0) {
				const existing = newCustomRefs.get(key);
				functionRef = existing ?? {
					kind: "custom",
					functionId: createFunctionId(),
					displayName: functionText.trim(),
				};
				if (existing === undefined) newCustomRefs.set(key, functionRef as CustomProjectFunctionRef);
			}
		}
		const base: TeamCandidateRow = {
			rowId: parsedRowId(importSessionId, source),
			functionText,
			functionRef,
			parsedRole: "unclassified",
			restrictedKey: null,
			possibleRestricted: false,
			restrictedRoleDecision: "unresolved",
			roleText:
				classification.kind === "functionRole"
					? classification.role
					: classification.kind === "restricted" &&
						!projectRoleKeys.has(classification.key)
						? "owner"
						: "",
			name,
			email,
			extraCells,
			sourceRows: [source],
			applicability: applicabilityFor(baseTeam, functionRef),
		};
		return deriveRow(base, standardFunctionDefinitions);
	});
	return {
		projectId,
		origin: "import",
		fileName: selectedSheet.fileName,
		baseTeam,
		rows,
		excludedSourceRowIds: [],
	};
}

export function createEditCandidate(
	projectId: ProjectId,
	team: ProjectTeam | null,
	standardFunctionDefinitions: readonly TeamFunctionDefinition[],
): TeamEditCandidate {
	if (team === null) {
		return { projectId, origin: "manual", fileName: null, baseTeam: null, rows: [], excludedSourceRowIds: [] };
	}
	const projectRows: TeamCandidateRow[] = (
		[
			["qciPm", "QCI-PM-Owner", team.projectRoles.qciPm],
			["qciPjm", "QCI-PJM-Owner", team.projectRoles.qciPjm],
			["acerPm", "Acer PM", team.projectRoles.acerPm],
		] as const
	).flatMap(([key, label, assignment]) =>
		assignment === null ? [] : [{
			rowId: assignment.assignmentId,
			functionText: assignment.functionText ?? label,
			functionRef: null,
			parsedRole: "unclassified",
			restrictedKey: key,
			possibleRestricted: false,
			restrictedRoleDecision: "unresolved",
			roleText: label,
			name: assignment.name,
			email: assignment.email,
			extraCells: assignment.extraCells ?? [],
			sourceRows: assignment.sourceRows ?? [],
			applicability: null,
		}],
	);
	const functionRows: TeamCandidateRow[] = team.functions.flatMap((functionTeam) => {
		const effectiveFunctionText = functionTeam.function.kind === "custom"
			? functionTeam.function.displayName
			: definitionFor(functionTeam.function.functionId, standardFunctionDefinitions)?.displayName ?? functionTeam.function.functionId;
		return functionTeam.assignments.map((assignment) => deriveRow({
			rowId: assignment.assignmentId,
			functionText: assignment.functionText ?? effectiveFunctionText,
			functionRef: functionTeam.function,
			parsedRole: assignment.role,
			restrictedKey: null,
			possibleRestricted: false,
			restrictedRoleDecision: "unresolved",
			roleText: assignment.role,
			name: assignment.name,
			email: assignment.email,
			extraCells: assignment.extraCells ?? [],
			sourceRows: assignment.sourceRows ?? [],
			applicability: functionTeam.applicability,
		}, standardFunctionDefinitions));
	});
	const preservedRows: TeamCandidateRow[] = (team.preservedUnclassifiedEntries ?? []).map((entry) => {
		const base = deriveRow({
			rowId: entry.entryId,
			functionText: entry.functionText,
			functionRef: entry.function,
			parsedRole: "unclassified",
			restrictedKey: null,
			possibleRestricted: false,
			restrictedRoleDecision: "unresolved",
			roleText: entry.roleText,
			name: entry.name,
			email: entry.email,
			extraCells: entry.extraCells,
			sourceRows: entry.sourceRows,
			applicability: applicabilityFor(team, entry.function),
		}, standardFunctionDefinitions);
		const exclusionMatches =
			entry.restrictedRoleExclusion?.functionText === currentLabel(base, standardFunctionDefinitions) &&
			entry.restrictedRoleExclusion.roleText === base.roleText &&
			base.parsedRole === "unclassified" &&
			base.possibleRestricted;
		return exclusionMatches
			? { ...base, restrictedRoleDecision: "confirmedNoncritical" }
			: base;
	});
	return {
		projectId,
		origin: "manual",
		fileName: null,
		baseTeam: team,
		rows: [...projectRows, ...functionRows, ...preservedRows],
		excludedSourceRowIds: [],
	};
}

export function editTeamCandidate(
	candidate: TeamEditCandidate,
	rowId: string,
	patch: TeamCandidateEditablePatch,
	standardFunctionDefinitions: readonly TeamFunctionDefinition[],
): TeamEditCandidate {
	return {
		...candidate,
		rows: candidate.rows.map((row) => {
			if (row.rowId !== rowId) return row;
			const updated = { ...row, ...patch };
			return patch.roleText !== undefined
				? deriveRow(updated, standardFunctionDefinitions, row)
				: updated;
		}),
	};
}

export function renameCustomCandidateFunction(
	candidate: TeamEditCandidate,
	functionId: TeamFunctionId,
	displayName: string,
): TeamEditCandidate {
	return {
		...candidate,
		rows: candidate.rows.map((row) => {
			if (row.functionRef?.kind !== "custom" || row.functionRef.functionId !== functionId) return row;
			return deriveRow({
				...row,
				functionRef: { ...row.functionRef, displayName },
			}, [], row);
		}),
	};
}

function targetApplicability(
	candidate: TeamEditCandidate,
	rowId: string,
	functionRef: ProjectFunctionRef,
): FunctionApplicability | null {
	const bufferedValues = new Set(
		candidate.rows
			.filter((row) => row.rowId !== rowId && row.functionRef !== null && sameFunctionRef(row.functionRef, functionRef))
			.map(({ applicability }) => applicability),
	);
	if (bufferedValues.size === 1) return [...bufferedValues][0]!;
	return applicabilityFor(candidate.baseTeam, functionRef);
}

export function assignCandidateFunction(
	candidate: TeamEditCandidate,
	rowId: string,
	functionRef: ProjectFunctionRef,
	standardFunctionDefinitions: readonly TeamFunctionDefinition[],
): TeamEditCandidate {
	return {
		...candidate,
		rows: candidate.rows.map((row) => {
			if (row.rowId !== rowId) return row;
			const identityChanged = row.functionRef === null || !sameFunctionRef(row.functionRef, functionRef);
			return deriveRow({
				...row,
				functionRef,
				applicability: identityChanged
					? targetApplicability(candidate, rowId, functionRef)
					: row.applicability,
			}, standardFunctionDefinitions, row);
		}),
	};
}

export function createCustomCandidateFunctionRef(
	_candidate: TeamEditCandidate,
	displayName: string,
	createFunctionId: () => TeamFunctionId,
): CustomProjectFunctionRef {
	return { kind: "custom", functionId: createFunctionId(), displayName };
}

export function confirmNoncriticalRole(
	candidate: TeamEditCandidate,
	rowId: string,
	standardFunctionDefinitions: readonly TeamFunctionDefinition[],
): TeamEditCandidate {
	const row = candidate.rows.find((value) => value.rowId === rowId);
	if (row === undefined) throw new Error("Team candidate row was not found");
	const classification = classifyTeamLabel(
		currentLabel(row, standardFunctionDefinitions),
		row.roleText,
	);
	if (classification.kind === "restricted") {
		throw new Error("An exact restricted Team role cannot be confirmed as noncritical");
	}
	if (
		classification.kind !== "unclassified" ||
		!classification.possibleRestricted ||
		row.parsedRole !== "unclassified"
	) {
		throw new Error("Only a possible restricted unclassified role can be confirmed noncritical");
	}
	return {
		...candidate,
		rows: candidate.rows.map((value) =>
			value.rowId === rowId
				? { ...value, restrictedRoleDecision: "confirmedNoncritical" }
				: value,
		),
	};
}

export function addTeamCandidateRow(
	candidate: TeamEditCandidate,
	row: TeamCandidateRow,
): TeamEditCandidate {
	return { ...candidate, rows: [...candidate.rows, row] };
}

export function removeTeamCandidateRow(
	candidate: TeamEditCandidate,
	rowId: string,
): TeamEditCandidate {
	return { ...candidate, rows: candidate.rows.filter((row) => row.rowId !== rowId) };
}

export function excludeImportSourceRow(
	candidate: TeamEditCandidate,
	rowId: string,
): TeamEditCandidate {
	if (!candidate.rows.some((row) => row.rowId === rowId)) return candidate;
	return {
		...candidate,
		rows: candidate.rows.filter((row) => row.rowId !== rowId),
		excludedSourceRowIds: candidate.excludedSourceRowIds.includes(rowId)
			? candidate.excludedSourceRowIds
			: [...candidate.excludedSourceRowIds, rowId],
	};
}
