import {
	type PersonAssignmentId,
	type ProjectId,
	type TeamFunctionId,
} from "../../domain/shared/ids";
import type {
	CustomProjectFunctionRef,
	FunctionApplicability,
	FunctionAssignmentRole,
	FunctionPersonAssignment,
	PreservedUnclassifiedEntry,
	ProjectFunctionRef,
	ProjectFunctionTeam,
	ProjectRoleAssignment,
	ProjectTeam,
	TeamSourceCell,
	TeamSourceRow,
} from "../../domain/team/team";
import type { TeamFunctionDefinition } from "../../domain/team/teamTemplate";
import {
	validateProjectTeam,
	validateRestrictedRoleRows,
	type RestrictedCountRow,
} from "../../domain/team/teamValidation";
import {
	classifyTeamLabel,
	isInvalidApplicabilityFunctionLabel,
	type RestrictedTeamRole,
} from "../../domain/team/teamRoleMapping";
import {
	countBlocking,
	type ValidationIssue,
} from "../../domain/validation/validationIssue";
import type { TeamParsedSheet } from "./teamImport";

export interface TeamCandidateRow {
	readonly rowId: string;
	readonly assignmentId: PersonAssignmentId;
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
type ProjectRoleKey = "qciPm" | "qciPjm" | "acerPm";

const projectRoleLabels: Readonly<Record<ProjectRoleKey, string>> = {
	qciPm: "QCI-PM-Owner",
	qciPjm: "QCI-PJM-Owner",
	acerPm: "Acer PM",
};

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
	createAssignmentId: () => PersonAssignmentId,
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
		const isInvalidApplicabilityFunction =
			isInvalidApplicabilityFunctionLabel(functionText);
		let functionRef: ProjectFunctionRef | null = null;
		if (
			!isProjectRole &&
			!isPossibleRestricted &&
			!isInvalidApplicabilityFunction &&
			functionText.trim() !== ""
		) {
			const key = normalizedLabel(functionText);
			const directStandardMatches = standardAssociations.get(key) ?? [];
			const roleBaseKey = key.replace(/-(LEADER|OWNER|MEMBER)$/, "");
			const standardMatches = directStandardMatches.length > 0
				? directStandardMatches
				: standardAssociations.get(roleBaseKey) ?? [];
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
			assignmentId: createAssignmentId(),
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
			rowId: `manual::projectRole::${key}`,
			assignmentId: assignment.assignmentId,
			functionText: label,
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
	const functionRows: TeamCandidateRow[] = team.functions.flatMap((functionTeam, functionIndex) => {
		const effectiveFunctionText = functionTeam.function.kind === "custom"
			? functionTeam.function.displayName
			: definitionFor(functionTeam.function.functionId, standardFunctionDefinitions)?.displayName ?? functionTeam.function.functionId;
		return functionTeam.assignments.map((assignment, assignmentIndex) => deriveRow({
			rowId: `manual::function::${functionTeam.function.functionId}::${functionIndex}::${assignment.role}::${assignmentIndex}`,
			assignmentId: assignment.assignmentId,
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
	const preservedRows: TeamCandidateRow[] = (team.preservedUnclassifiedEntries ?? []).map((entry, entryIndex) => {
		const base = deriveRow({
			rowId: `manual::preserved::${entryIndex}`,
			assignmentId: entry.entryId,
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
	rowId: string | null,
	functionRef: ProjectFunctionRef,
): FunctionApplicability | null {
	const bufferedValues = new Set<FunctionApplicability>(
		candidate.rows
			.filter((row) => row.rowId !== rowId && row.functionRef !== null && sameFunctionRef(row.functionRef, functionRef))
			.flatMap(({ applicability }) => applicability === null ? [] : [applicability]),
	);
	if (bufferedValues.size === 1) return [...bufferedValues][0]!;
	if (bufferedValues.size > 1) return null;
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

export type NewTeamCandidateRow = Omit<TeamCandidateRow, "rowId" | "assignmentId">;

export function addTeamCandidateRow(
	candidate: TeamEditCandidate,
	row: NewTeamCandidateRow,
	createAssignmentId: () => PersonAssignmentId,
): TeamEditCandidate {
	const assignmentId = createAssignmentId();
	const rowIdBase = `manual::${assignmentId}`;
	let rowId = rowIdBase;
	let suffix = 2;
	while (candidate.rows.some((candidateRow) => candidateRow.rowId === rowId)) {
		rowId = `${rowIdBase}::${suffix}`;
		suffix += 1;
	}
	const applicability = row.functionRef === null
		? row.applicability
		: targetApplicability(candidate, null, row.functionRef);
	return {
		...candidate,
		rows: [...candidate.rows, { ...row, applicability, rowId, assignmentId }],
	};
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

function candidateIssue(
	code: string,
	severity: ValidationIssue["severity"],
	message: string,
	rowId: string,
): ValidationIssue {
	return {
		code,
		domain: "team",
		source: "data",
		severity,
		message,
		target: { section: "team.candidate", entityId: rowId },
	};
}

function sameSourceCell(left: TeamSourceCell, right: TeamSourceCell): boolean {
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
		left.every((cell, index) => sameSourceCell(cell, right[index]!))
	);
}

function effectiveFunctionIdentity(row: TeamCandidateRow): string {
	if (row.restrictedKey !== null && projectRoleKeys.has(row.restrictedKey)) {
		return `project:${row.restrictedKey}`;
	}
	if (row.functionRef === null) return "unresolved";
	return `${row.functionRef.kind}:${row.functionRef.functionId}`;
}

function isExactCandidateDuplicate(
	left: TeamCandidateRow,
	right: TeamCandidateRow,
): boolean {
	const normalizedEmail = left.email?.trim().toLowerCase() ?? "";
	const sameProjectRole =
		left.restrictedKey !== null &&
		left.restrictedKey === right.restrictedKey &&
		projectRoleKeys.has(left.restrictedKey);
	return (
		normalizedEmail !== "" &&
		normalizedEmail === (right.email?.trim().toLowerCase() ?? "") &&
		effectiveFunctionIdentity(left) === effectiveFunctionIdentity(right) &&
		left.parsedRole === right.parsedRole &&
		left.restrictedKey === right.restrictedKey &&
		(sameProjectRole || (
			left.functionText === right.functionText &&
			left.roleText === right.roleText &&
			left.applicability === right.applicability
		)) &&
		left.name === right.name &&
		sameExtraCells(left.extraCells, right.extraCells)
	);
}

function foldExactCandidateDuplicates(
	rows: readonly TeamCandidateRow[],
): readonly TeamCandidateRow[] {
	const kept: TeamCandidateRow[] = [];
	for (const row of rows) {
		const duplicateIndex = kept.findIndex((existing) =>
			isExactCandidateDuplicate(row, existing),
		);
		if (duplicateIndex < 0) {
			kept.push(row);
			continue;
		}
		const existing = kept[duplicateIndex]!;
		kept[duplicateIndex] = {
			...existing,
			sourceRows: [...existing.sourceRows, ...row.sourceRows],
		};
	}
	return kept;
}

function restrictedCountRow(
	row: TeamCandidateRow,
	standardFunctionDefinitions: readonly TeamFunctionDefinition[],
): RestrictedCountRow {
	const classification = classifyTeamLabel(
		currentLabel(row, standardFunctionDefinitions),
		row.roleText,
	);
	return {
		rowId: row.rowId,
		functionText: currentLabel(row, standardFunctionDefinitions),
		roleText: row.roleText,
		key: classification.kind === "restricted" ? classification.key : null,
		possibleRestricted:
			classification.kind === "unclassified" &&
			classification.possibleRestricted &&
			row.restrictedRoleDecision !== "confirmedNoncritical",
		name: row.name,
		normalizedEmail: row.email?.trim().toLowerCase() || null,
		extraCells: row.extraCells,
		sourceRows: row.sourceRows,
	};
}

function isProjectRoleRow(row: TeamCandidateRow): boolean {
	return row.restrictedKey !== null && projectRoleKeys.has(row.restrictedKey);
}

function hasPersonData(row: TeamCandidateRow): boolean {
	return (
		(row.name?.trim() ?? "") !== "" ||
		(row.email?.trim() ?? "") !== "" ||
		row.extraCells.some((cell) => cell.rawValue !== null || (cell.formattedText?.trim() ?? "") !== "")
	);
}

function hasFreshDerivedClassification(
	row: TeamCandidateRow,
	standardFunctionDefinitions: readonly TeamFunctionDefinition[],
): boolean {
	const classification = classifyTeamLabel(
		currentLabel(row, standardFunctionDefinitions),
		row.roleText,
	);
	if (classification.kind === "restricted") {
		return (
			row.restrictedKey === classification.key &&
			row.parsedRole === restrictedRoleToParsedRole(classification.key) &&
			!row.possibleRestricted &&
			row.restrictedRoleDecision === "unresolved"
		);
	}
	if (classification.kind === "functionRole") {
		return (
			row.parsedRole === classification.role &&
			row.restrictedKey === null &&
			!row.possibleRestricted &&
			row.restrictedRoleDecision === "unresolved"
		);
	}
	return (
		row.parsedRole === "unclassified" &&
		row.restrictedKey === null &&
		row.possibleRestricted === classification.possibleRestricted &&
		(!row.restrictedRoleDecision.startsWith("confirmed") ||
			classification.possibleRestricted)
	);
}

export function validateTeamEditCandidate(
	candidate: TeamEditCandidate,
	standardFunctionDefinitions: readonly TeamFunctionDefinition[],
): readonly ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const standardIds = new Set(standardFunctionDefinitions.map(({ id }) => id));
	const refById = new Map<TeamFunctionId, ProjectFunctionRef>();
	const applicabilityById = new Map<TeamFunctionId, Set<FunctionApplicability>>();
	const rowsById = new Map<string, TeamCandidateRow[]>();

	for (const row of candidate.rows) {
		const existingRows = rowsById.get(row.rowId) ?? [];
		if (existingRows.some((existingRow) =>
			effectiveFunctionIdentity(existingRow) === effectiveFunctionIdentity(row) &&
			!isExactCandidateDuplicate(row, existingRow),
		)) {
			issues.push(candidateIssue(
				"team.data.row-identity-conflict",
				"blocking",
				"Candidate rows reuse one identity with conflicting person data.",
				row.rowId,
			));
		}
		rowsById.set(row.rowId, [...existingRows, row]);
		if (!hasFreshDerivedClassification(row, standardFunctionDefinitions)) {
			issues.push(candidateIssue(
				"team.data.classification-stale",
				"blocking",
				"Team row classification must be recomputed before Save.",
				row.rowId,
			));
		}
		if (!isProjectRoleRow(row) && row.functionRef === null) {
			issues.push(candidateIssue(
				"team.data.function-unresolved",
				"blocking",
				"Team row must be assigned to one Function before Save.",
				row.rowId,
			));
		}
		if (row.functionRef?.kind === "standard" && !standardIds.has(row.functionRef.functionId)) {
			issues.push(candidateIssue(
				"team.data.standard-function-unknown",
				"blocking",
				"Standard Function reference is absent from the supplied definitions.",
				row.rowId,
			));
		}
		if (row.functionRef !== null) {
			const existingRef = refById.get(row.functionRef.functionId);
			if (
				existingRef !== undefined &&
				(existingRef.kind !== row.functionRef.kind ||
					(existingRef.kind === "custom" && row.functionRef.kind === "custom" &&
						existingRef.displayName !== row.functionRef.displayName))
			) {
				issues.push(candidateIssue(
					"team.data.function-identity-conflict",
					"blocking",
					"Rows sharing a Function ID contain conflicting Function identities.",
					row.rowId,
				));
			} else if (existingRef === undefined) {
				refById.set(row.functionRef.functionId, row.functionRef);
			}
			if (row.applicability !== null) {
				const values = applicabilityById.get(row.functionRef.functionId) ?? new Set();
				values.add(row.applicability);
				applicabilityById.set(row.functionRef.functionId, values);
			}
		}
		if ((row.name?.trim() ?? "") === "" && hasPersonData(row)) {
			issues.push(candidateIssue(
				"team.data.partial-person",
				"advisory",
				"Team row contains person data but has no name.",
				row.rowId,
			));
		}
		if ((row.name?.trim() ?? "") !== "" && (row.email?.trim() ?? "") === "") {
			issues.push({
				...candidateIssue(
					"team.data.missing-email",
					"advisory",
					"Person has a name but no email address.",
					row.rowId,
				),
				target: { section: "team.candidate", entityId: row.rowId, field: "email" },
			});
		}
		if (row.applicability === "notApplicable" && hasPersonData(row)) {
			issues.push(candidateIssue(
				"team.data.not-applicable-with-people",
				"blocking",
				"Not Applicable Function cannot contain assignments.",
				row.rowId,
			));
		}
		if (row.applicability === "pending") {
			issues.push(candidateIssue(
				"team.data.pending-applicability",
				"advisory",
				"Function must be marked Applicable or Not Applicable.",
				row.rowId,
			));
		}
		if (
			row.parsedRole === "unclassified" &&
			!isProjectRoleRow(row) &&
			(!row.possibleRestricted || row.restrictedRoleDecision === "confirmedNoncritical")
		) {
			issues.push(candidateIssue(
				"team.data.unclassified-role",
				"advisory",
				"Unclassified noncritical Team row will be preserved without changing its role.",
				row.rowId,
			));
		}
	}

	for (const [index, row] of candidate.rows.entries()) {
		const normalizedEmail = row.email?.trim().toLowerCase() ?? "";
		if (
			normalizedEmail !== "" &&
			candidate.rows.some((other, otherIndex) =>
				otherIndex !== index &&
				(other.email?.trim().toLowerCase() ?? "") === normalizedEmail &&
				(other.name !== row.name || !sameExtraCells(other.extraCells, row.extraCells)),
			)
		) {
			issues.push(candidateIssue(
				"team.data.identity-conflict",
				"advisory",
				"Rows with the same email contain conflicting person data.",
				row.rowId,
			));
		}
	}

	for (const [functionId, values] of applicabilityById) {
		if (values.size > 1) {
			issues.push(candidateIssue(
				"team.data.applicability-conflict",
				"blocking",
				"Rows for one Function contain conflicting applicability values.",
				functionId,
			));
		}
	}

	return [
		...issues,
		...validateRestrictedRoleRows(
			candidate.rows.map((row) =>
				restrictedCountRow(row, standardFunctionDefinitions),
			),
		),
	];
}

export type MaterializeProjectTeamResult =
	| { readonly ok: true; readonly team: ProjectTeam }
	| { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export function materializeProjectTeam(
	candidate: TeamEditCandidate,
	standardFunctionDefinitions: readonly TeamFunctionDefinition[],
): MaterializeProjectTeamResult {
	const candidateIssues = validateTeamEditCandidate(
		candidate,
		standardFunctionDefinitions,
	);
	if (countBlocking(candidateIssues) > 0) {
		return { ok: false, issues: candidateIssues };
	}
	const retainedFunctionIdentityIssues = candidate.baseTeam === null
		? []
		: validateProjectTeam(
				candidate.baseTeam,
				standardFunctionDefinitions,
			).filter(({ code }) =>
				code === "team.data.standard-function-definition-missing" ||
				code === "team.data.standard-function-definition-duplicate" ||
				code === "team.data.function-identity-conflict",
			);
	if (countBlocking(retainedFunctionIdentityIssues) > 0) {
		return {
			ok: false,
			issues: [...candidateIssues, ...retainedFunctionIdentityIssues],
		};
	}

	const rows = foldExactCandidateDuplicates(candidate.rows);
	const projectRoleRows = new Map<RestrictedTeamRole, TeamCandidateRow>();
	const functions = new Map<TeamFunctionId, {
		function: ProjectFunctionRef;
		applicability: FunctionApplicability;
		assignments: FunctionPersonAssignment[];
	}>();
	for (const functionTeam of candidate.baseTeam?.functions ?? []) {
		if (
			functionTeam.function.kind === "custom" &&
			isInvalidApplicabilityFunctionLabel(functionTeam.function.displayName)
		) {
			continue;
		}
		functions.set(functionTeam.function.functionId, {
			function: functionTeam.function,
			applicability: functionTeam.applicability,
			assignments: [],
		});
	}
	const preservedUnclassifiedEntries: PreservedUnclassifiedEntry[] = [];

	for (const row of rows) {
		if (isProjectRoleRow(row)) {
			if (projectRoleRows.has(row.restrictedKey!)) {
				return {
					ok: false,
					issues: [
						...candidateIssues,
						candidateIssue(
							"team.data.restricted-role-multiple",
							"blocking",
							"Restricted Project role contains conflicting candidate rows.",
							row.rowId,
						),
					],
				};
			}
			projectRoleRows.set(row.restrictedKey!, row);
			continue;
		}
		if (row.functionRef === null) continue;
		const existingFunction = functions.get(row.functionRef.functionId);
		const functionTeam = existingFunction ?? {
			function: row.functionRef,
			applicability: row.applicability ?? "pending",
			assignments: [],
		};
		functionTeam.function = row.functionRef;
		if (row.applicability !== null) functionTeam.applicability = row.applicability;
		functions.set(row.functionRef.functionId, functionTeam);

		if (row.parsedRole === "unclassified") {
			preservedUnclassifiedEntries.push({
				entryId: row.assignmentId,
				function: row.functionRef,
				functionText: row.functionText,
				roleText: row.roleText,
				name: row.name,
				email: row.email,
				extraCells: row.extraCells,
				sourceRows: row.sourceRows,
				restrictedRoleExclusion:
					row.possibleRestricted &&
					row.restrictedRoleDecision === "confirmedNoncritical"
						? {
								functionText: currentLabel(row, standardFunctionDefinitions),
								roleText: row.roleText,
							}
						: null,
			});
			continue;
		}
		functionTeam.assignments.push({
			assignmentId: row.assignmentId,
			role: row.parsedRole,
			functionText: row.functionText,
			name: row.name,
			email: row.email,
			extraCells: row.extraCells,
			sourceRows: row.sourceRows,
		});
	}

	const projectRoleAssignment = (
		key: ProjectRoleKey,
	): ProjectRoleAssignment | null => {
		const row = projectRoleRows.get(key);
		return row === undefined
			? null
			: {
					assignmentId: row.assignmentId,
					name: row.name,
					email: row.email,
					functionText: projectRoleLabels[key],
					extraCells: row.extraCells,
					sourceRows: row.sourceRows,
				};
	};
	const team: ProjectTeam = {
		projectRoles: {
			qciPm: projectRoleAssignment("qciPm"),
			qciPjm: projectRoleAssignment("qciPjm"),
			acerPm: projectRoleAssignment("acerPm"),
		},
		functions: [...functions.values()].map((functionTeam): ProjectFunctionTeam => ({
			function: functionTeam.function,
			applicability: functionTeam.applicability,
			assignments: functionTeam.assignments,
		})),
		preservedUnclassifiedEntries,
		appliedTemplate: candidate.baseTeam?.appliedTemplate ?? null,
	};
	const canonicalIssues = validateProjectTeam(team, standardFunctionDefinitions);
	const allIssues = [...candidateIssues, ...canonicalIssues];
	return countBlocking(allIssues) > 0
		? { ok: false, issues: allIssues }
		: { ok: true, team };
}
