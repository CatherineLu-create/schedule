import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
	toPersonAssignmentId,
	toProjectId,
	toTeamFunctionId,
} from "../../domain/shared/ids";
import type {
	ProjectTeam,
	TeamSourceCell,
	TeamSourceRow,
} from "../../domain/team/team";
import type { TeamFunctionDefinition } from "../../domain/team/teamTemplate";
import type { TeamParsedSheet } from "./teamImport";
import {
	addTeamCandidateRow,
	assignCandidateFunction,
	confirmNoncriticalRole,
	createEditCandidate,
	createImportCandidate,
	createCustomCandidateFunctionRef,
	editTeamCandidate,
	excludeImportSourceRow,
	removeTeamCandidateRow,
	renameCustomCandidateFunction,
	type TeamCandidateRow,
	type TeamCandidateEditablePatch,
	type TeamEditCandidate,
} from "./teamCandidate";

const projectId = toProjectId("synthetic-team-import-project");
const standardMeId = toTeamFunctionId("synthetic-standard-me");
const standardThermalId = toTeamFunctionId("synthetic-standard-thermal");
const standardDefinitions: readonly TeamFunctionDefinition[] = [
	{ id: standardMeId, displayName: "QCI-ME-Owner", active: true },
	{ id: standardThermalId, displayName: "Synthetic Thermal", active: true },
];

function sourceRow(
	rowNumber: number,
	functionText: string,
	name: string | null,
	email: string | null,
	extraCells: readonly TeamSourceCell[] = [],
): TeamSourceRow {
	const required: TeamSourceCell[] = [
		{ columnIndex: 1, headerText: "Function", rawType: "s", rawValue: functionText, formattedText: functionText, hidden: false },
		{ columnIndex: 2, headerText: "Member", rawType: name === null ? "z" : "s", rawValue: name, formattedText: name, hidden: false },
		{ columnIndex: 3, headerText: "email", rawType: email === null ? "z" : "s", rawValue: email, formattedText: email, hidden: false },
	];
	return { fileName: "synthetic.xlsx", sheetName: "Roster", rowNumber, cells: [...required, ...extraCells] };
}

function sheet(rows: readonly TeamSourceRow[]): TeamParsedSheet {
	return { fileName: "synthetic.xlsx", sheetName: "Roster", headerRowNumber: 1, rows };
}

function emptyTeam(): ProjectTeam {
	return {
		projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
		functions: [],
		preservedUnclassifiedEntries: [],
		appliedTemplate: null,
	};
}

function deterministicFactory(...values: string[]) {
	return vi.fn(() => {
		const value = values.shift();
		if (value === undefined) throw new Error("unexpected ID allocation");
		return toTeamFunctionId(value);
	});
}

function importCandidate(
	baseTeam: ProjectTeam | null,
	selectedSheet: TeamParsedSheet,
	createFunctionId: () => ReturnType<typeof toTeamFunctionId>,
	importSessionId = "default-import-session",
	definitions: readonly TeamFunctionDefinition[] = standardDefinitions,
): TeamEditCandidate {
	return createImportCandidate(
		projectId,
		baseTeam,
		selectedSheet,
		importSessionId,
		definitions,
		createFunctionId,
	);
}

describe("Team import candidate creation", () => {
	it("creates distinct row IDs for identical source coordinates in separate import sessions", () => {
		const selectedSheet = sheet([sourceRow(2, "QCI-PM-Owner", "Synthetic PM", "pm@example.test")]);
		const first = createImportCandidate(
			projectId, emptyTeam(), selectedSheet, "import-session-one", standardDefinitions, deterministicFactory(),
		);
		const second = createImportCandidate(
			projectId, emptyTeam(), selectedSheet, "import-session-two", standardDefinitions, deterministicFactory(),
		);

		expect(first.rows[0]?.rowId).not.toBe(second.rows[0]?.rowId);
		expect(first.rows[0]?.rowId).toContain("import-session-one");
		expect(second.rows[0]?.rowId).toContain("import-session-two");
	});

	it("maps an unassigned N/A standard Function by exact synthetic definition name", () => {
		const baseTeam: ProjectTeam = {
			...emptyTeam(),
			functions: [{
				function: { kind: "standard", functionId: standardThermalId },
				applicability: "notApplicable",
				assignments: [],
			}],
		};
		const definitions = Object.freeze(standardDefinitions.map((definition) => Object.freeze({ ...definition })));
		const createFunctionId = deterministicFactory();
		const candidate = createImportCandidate(
			projectId,
			baseTeam,
			sheet([sourceRow(2, "  synthetic   thermal ", "Synthetic Person", "person@example.test")]),
			"standard-import-session",
			definitions,
			createFunctionId,
		);

		expect(candidate.rows[0]).toMatchObject({
			functionRef: { kind: "standard", functionId: standardThermalId },
			applicability: "notApplicable",
		});
		expect(createFunctionId).not.toHaveBeenCalled();
		expect(definitions).toEqual(standardDefinitions);
		expect(candidate).not.toHaveProperty("standardFunctionDefinitions");
	});

	it("does not fuzzy-map an unknown label to a standard Function", () => {
		const createFunctionId = deterministicFactory("new-custom-function");
		const candidate = createImportCandidate(
			projectId,
			emptyTeam(),
			sheet([sourceRow(2, "Synthetic Thermal Extended", "Synthetic Person", "person@example.test")]),
			"unknown-import-session",
			standardDefinitions,
			createFunctionId,
		);

		expect(candidate.rows[0]?.functionRef).toEqual({
			kind: "custom",
			functionId: toTeamFunctionId("new-custom-function"),
			displayName: "Synthetic Thermal Extended",
		});
		expect(createFunctionId).toHaveBeenCalledTimes(1);
	});

	it("keeps a noncritical unknown role unclassified", () => {
		const candidate = importCandidate(
			emptyTeam(),
			sheet([sourceRow(2, "Custom Lab Coordinator", "Synthetic Person", "person@example.test")]),
			deterministicFactory("custom-function-one"),
		);

		expect(candidate.rows[0]).toMatchObject({
			functionText: "Custom Lab Coordinator",
			parsedRole: "unclassified",
			restrictedKey: null,
			possibleRestricted: false,
			restrictedRoleDecision: "unresolved",
		});
	});

	it("confirms only a possible restricted label without changing raw text", () => {
		const candidate = importCandidate(
			emptyTeam(),
			sheet([sourceRow(2, "QCI ME Owner", "Synthetic Person", "person@example.test")]),
			deterministicFactory(),
		);
		const confirmed = confirmNoncriticalRole(candidate, candidate.rows[0]!.rowId, standardDefinitions);

		expect(confirmed.rows[0]).toMatchObject({
			functionText: "QCI ME Owner",
			parsedRole: "unclassified",
			possibleRestricted: true,
			restrictedRoleDecision: "confirmedNoncritical",
		});
		expect(candidate.rows[0]?.restrictedRoleDecision).toBe("unresolved");
	});

	it("does not let confirmation override an exact restricted label", () => {
		const candidate = importCandidate(
			emptyTeam(),
			sheet([sourceRow(2, "QCI-ME-Owner", "Synthetic Owner", "owner@example.test")]),
			deterministicFactory("exact-restricted-function-id"),
		);

		expect(candidate.rows[0]).toMatchObject({
			parsedRole: "owner",
			restrictedKey: "qciMeOwner",
			possibleRestricted: false,
		});
		expect(() => confirmNoncriticalRole(candidate, candidate.rows[0]!.rowId, standardDefinitions)).toThrow(/exact restricted/i);
	});

	it("preserves same-name different-email and same-email conflicting-extra rows", () => {
		const telephone = (value: string): TeamSourceCell => ({
			columnIndex: 4, headerText: "Tel. No.", rawType: "s", rawValue: value, formattedText: value, hidden: true,
		});
		const candidate = importCandidate(
			emptyTeam(),
			sheet([
				sourceRow(2, "Custom Lab-Owner", "Synthetic Same Name", "one@example.test"),
				sourceRow(3, "Custom Lab-Owner", "Synthetic Same Name", "two@example.test"),
				sourceRow(4, "Custom Lab-Owner", "Synthetic Conflict", "conflict@example.test", [telephone("100")]),
				sourceRow(5, "Custom Lab-Owner", "Synthetic Conflict", "conflict@example.test", [telephone("200")]),
			]),
			deterministicFactory("custom-lab-id"),
		);

		expect(candidate.rows).toHaveLength(4);
		expect(candidate.rows.map(({ email }) => email)).toEqual([
			"one@example.test", "two@example.test", "conflict@example.test", "conflict@example.test",
		]);
		expect(candidate.rows.slice(2).map(({ extraCells }) => extraCells[0]?.rawValue)).toEqual(["100", "200"]);
	});

	it("retains every source reference for exact duplicate rows", () => {
		const candidate = importCandidate(
			emptyTeam(),
			sheet([
				sourceRow(2, "Custom Lab-Member", "Synthetic Duplicate", "duplicate@example.test"),
				sourceRow(9, "Custom Lab-Member", "Synthetic Duplicate", "duplicate@example.test"),
			]),
			deterministicFactory("duplicate-group-id"),
		);

		expect(candidate.rows).toHaveLength(2);
		expect(candidate.rows.map(({ sourceRows }) => sourceRows[0]?.rowNumber)).toEqual([2, 9]);
	});

	it("retains a partial row until explicit exclusion and records that exclusion", () => {
		const tel: TeamSourceCell = { columnIndex: 4, headerText: "Tel. No.", rawType: "n", rawValue: 24680, formattedText: "24680", hidden: true };
		const candidate = importCandidate(
			emptyTeam(),
			sheet([sourceRow(2, "Custom Partial-Owner", null, null, [tel])]),
			deterministicFactory("partial-function-id"),
		);
		const rowId = candidate.rows[0]!.rowId;
		const excluded = excludeImportSourceRow(candidate, rowId);

		expect(candidate.rows[0]?.extraCells).toEqual([tel]);
		expect(excluded.rows).toEqual([]);
		expect(excluded.excludedSourceRowIds).toEqual([rowId]);
		expect(candidate.excludedSourceRowIds).toEqual([]);
	});

	it("allocates separate injected IDs for distinct temporary label groups", () => {
		const createFunctionId = deterministicFactory("owner-custom-id", "member-custom-id");
		const candidate = importCandidate(
			emptyTeam(),
			sheet([
				sourceRow(2, "Custom Shared-Owner", "Synthetic Owner", "owner@example.test"),
				sourceRow(3, "Custom Shared-Member", "Synthetic Member", "member@example.test"),
			]),
			createFunctionId,
		);

		expect(createFunctionId).toHaveBeenCalledTimes(2);
		expect(candidate.rows[0]?.functionRef?.functionId).not.toBe(candidate.rows[1]?.functionRef?.functionId);
	});

	it("shares one injected ID when two rows have the same raw Function label", () => {
		const createFunctionId = deterministicFactory("shared-custom-id");
		const candidate = importCandidate(
			emptyTeam(),
			sheet([
				sourceRow(2, "Custom Shared-Owner", "Synthetic One", "one@example.test"),
				sourceRow(3, "Custom Shared-Owner", "Synthetic Two", "two@example.test"),
			]),
			createFunctionId,
		);

		expect(createFunctionId).toHaveBeenCalledTimes(1);
		expect(candidate.rows[0]?.functionRef?.functionId).toBe(toTeamFunctionId("shared-custom-id"));
		expect(candidate.rows[1]?.functionRef?.functionId).toBe(candidate.rows[0]?.functionRef?.functionId);
	});

	it("reuses an unambiguous existing custom Function ID", () => {
		const existingId = toTeamFunctionId("existing-custom-id");
		const baseTeam: ProjectTeam = {
			...emptyTeam(),
			functions: [{ function: { kind: "custom", functionId: existingId, displayName: "Existing Custom" }, applicability: "applicable", assignments: [] }],
		};
		const createFunctionId = deterministicFactory();
		const candidate = importCandidate(baseTeam, sheet([
			sourceRow(2, "Existing Custom", "Synthetic Existing", "existing@example.test"),
		]), createFunctionId);

		expect(candidate.rows[0]?.functionRef?.functionId).toBe(existingId);
		expect(createFunctionId).not.toHaveBeenCalled();
	});

	it("requires correction instead of guessing between same-label custom Functions", () => {
		const baseTeam: ProjectTeam = {
			...emptyTeam(),
			functions: ["one", "two"].map((suffix) => ({
				function: { kind: "custom" as const, functionId: toTeamFunctionId(`existing-${suffix}`), displayName: "Ambiguous Custom" },
				applicability: "applicable" as const,
				assignments: [],
			})),
		};
		const createFunctionId = deterministicFactory();
		const candidate = importCandidate(baseTeam, sheet([
			sourceRow(2, "Ambiguous Custom", "Synthetic Person", "person@example.test"),
		]), createFunctionId);

		expect(candidate.rows[0]?.functionRef).toBeNull();
		expect(createFunctionId).not.toHaveBeenCalled();
	});

	it("reuses a standard Function definition without allocating a custom ID", () => {
		const standardId = toTeamFunctionId("known-standard-id");
		const baseTeam: ProjectTeam = {
			...emptyTeam(),
			functions: [{
				function: { kind: "standard", functionId: standardId }, applicability: "applicable",
				assignments: [{ assignmentId: toPersonAssignmentId("saved-standard-owner"), role: "owner", functionText: "Known Standard-Owner", name: "Saved Synthetic", email: "saved@example.test" }],
			}],
		};
		const createFunctionId = deterministicFactory();
		const definitions: readonly TeamFunctionDefinition[] = [{
			id: standardId,
			displayName: "Known Standard-Owner",
			active: true,
		}];
		const candidate = importCandidate(baseTeam, sheet([
			sourceRow(2, "Known Standard-Owner", "Imported Synthetic", "imported@example.test"),
		]), createFunctionId, "known-standard-session", definitions);

		expect(candidate.rows[0]?.functionRef).toEqual({ kind: "standard", functionId: standardId });
		expect(createFunctionId).not.toHaveBeenCalled();
	});

	it("does not promote a historical standard assignment label without a matching definition", () => {
		const historicalStandardId = toTeamFunctionId("historical-standard-id");
		const baseTeam: ProjectTeam = {
			...emptyTeam(),
			functions: [{
				function: { kind: "standard", functionId: historicalStandardId },
				applicability: "applicable",
				assignments: [{
					assignmentId: toPersonAssignmentId("historical-standard-owner"),
					role: "owner",
					functionText: "Historical Raw Label",
					name: "Saved Synthetic",
					email: "saved@example.test",
				}],
			}],
		};
		const createFunctionId = deterministicFactory("historical-label-custom");
		const candidate = importCandidate(baseTeam, sheet([
			sourceRow(2, "Historical Raw Label", "Imported Synthetic", "imported@example.test"),
		]), createFunctionId, "historical-label-session", []);

		expect(candidate.rows[0]?.functionRef).toEqual({
			kind: "custom",
			functionId: toTeamFunctionId("historical-label-custom"),
			displayName: "Historical Raw Label",
		});
		expect(createFunctionId).toHaveBeenCalledTimes(1);
	});

	it("keeps Project Role rows in slots without inventing a Function ref", () => {
		const createFunctionId = deterministicFactory();
		const candidate = importCandidate(emptyTeam(), sheet([
			sourceRow(2, "QCI-PM-Owner", "Synthetic PM", "pm@example.test"),
		]), createFunctionId);

		expect(candidate.rows[0]).toMatchObject({ restrictedKey: "qciPm", functionRef: null });
		expect(createFunctionId).not.toHaveBeenCalled();
	});
});

describe("saved Team editing", () => {
	it("exposes roleText as the only editable role source", () => {
		expectTypeOf<TeamCandidateEditablePatch>().toEqualTypeOf<Partial<Pick<
			TeamCandidateRow,
			"roleText" | "name" | "email" | "extraCells" | "applicability"
		>>>();
	});

	it("reopens a standard Function with definition-derived classification and stable ID", () => {
		const team: ProjectTeam = {
			...emptyTeam(),
			functions: [{
				function: { kind: "standard", functionId: standardMeId },
				applicability: "applicable",
				assignments: [{
					assignmentId: toPersonAssignmentId("saved-standard-me-owner"),
					role: "owner",
					name: "Synthetic Owner",
					email: "owner@example.test",
				}],
			}],
		};
		const candidate = createEditCandidate(projectId, team, standardDefinitions);

		expect(candidate.rows[0]).toMatchObject({
			functionRef: { kind: "standard", functionId: standardMeId },
			parsedRole: "owner",
			restrictedKey: "qciMeOwner",
			functionText: "QCI-ME-Owner",
		});
	});

	it("uses the target Function applicability and definition on reassignment", () => {
		const functionA = toTeamFunctionId("function-a");
		const baseTeam: ProjectTeam = {
			...emptyTeam(),
			functions: [
				{ function: { kind: "custom", functionId: functionA, displayName: "Function A" }, applicability: "applicable", assignments: [] },
				{ function: { kind: "standard", functionId: standardMeId }, applicability: "notApplicable", assignments: [] },
			],
		};
		const row: TeamCandidateRow = {
			rowId: "reassign-standard-row", functionText: "Function A", functionRef: { kind: "custom", functionId: functionA, displayName: "Function A" },
			parsedRole: "member", restrictedKey: null, possibleRestricted: false, restrictedRoleDecision: "unresolved",
			roleText: "member", name: "Synthetic Person", email: null, extraCells: [], sourceRows: [], applicability: "applicable",
		};
		const candidate: TeamEditCandidate = { projectId, origin: "manual", fileName: null, baseTeam, rows: [row], excludedSourceRowIds: [] };
		const assigned = assignCandidateFunction(
			candidate,
			row.rowId,
			{ kind: "standard", functionId: standardMeId },
			standardDefinitions,
		);

		expect(assigned.rows[0]).toMatchObject({
			functionRef: { kind: "standard", functionId: standardMeId },
			applicability: "notApplicable",
			parsedRole: "owner",
			restrictedKey: "qciMeOwner",
		});
		expect(baseTeam.functions[1]?.applicability).toBe("notApplicable");
	});

	it("clears source applicability when reassigned to a new custom Function", () => {
		const oldFunctionId = toTeamFunctionId("old-function");
		const candidate: TeamEditCandidate = {
			projectId,
			origin: "manual",
			fileName: null,
			baseTeam: {
				...emptyTeam(),
				functions: [{ function: { kind: "custom", functionId: oldFunctionId, displayName: "Old Function" }, applicability: "pending", assignments: [] }],
			},
			rows: [{
				rowId: "new-custom-target-row", functionText: "Old Function", functionRef: { kind: "custom", functionId: oldFunctionId, displayName: "Old Function" },
				parsedRole: "member", restrictedKey: null, possibleRestricted: false, restrictedRoleDecision: "unresolved",
				roleText: "member", name: "Synthetic Person", email: null, extraCells: [], sourceRows: [], applicability: "pending",
			}],
			excludedSourceRowIds: [],
		};
		const newRef = createCustomCandidateFunctionRef(candidate, "New Function", deterministicFactory("new-function"));
		const assigned = assignCandidateFunction(candidate, candidate.rows[0]!.rowId, newRef, standardDefinitions);

		expect(assigned.rows[0]).toMatchObject({ functionRef: newRef, applicability: null });
		expect(candidate.rows[0]?.applicability).toBe("pending");
	});

	it("round-trips preserved rows source evidence exclusions and existing IDs", () => {
		const functionId = toTeamFunctionId("saved-custom-id");
		const source = sourceRow(7, "Original Label", "Synthetic Preserved", null);
		const team: ProjectTeam = {
			...emptyTeam(),
			functions: [{ function: { kind: "custom", functionId, displayName: "QCI ME Owner" }, applicability: "applicable", assignments: [] }],
			preservedUnclassifiedEntries: [{
				entryId: toPersonAssignmentId("saved-preserved-entry"),
				function: { kind: "custom", functionId, displayName: "QCI ME Owner" },
				functionText: "Original Label", roleText: "Coordinator", name: "Synthetic Preserved", email: null,
				extraCells: [], sourceRows: [source],
				restrictedRoleExclusion: { functionText: "QCI ME Owner", roleText: "Coordinator" },
			}],
		};
		const candidate = createEditCandidate(projectId, team, standardDefinitions);

		expect(candidate.rows[0]).toMatchObject({
			functionText: "Original Label",
			functionRef: { kind: "custom", functionId, displayName: "QCI ME Owner" },
			restrictedRoleDecision: "confirmedNoncritical",
		});
		expect(candidate.rows[0]?.sourceRows).toBe(source === undefined ? undefined : team.preservedUnclassifiedEntries?.[0]?.sourceRows);
		expect(candidate.baseTeam).toBe(team);
	});

	it("renames a custom Function without changing ID or original source text", () => {
		const functionId = toTeamFunctionId("stable-rename-id");
		const candidate = importCandidate(emptyTeam(), sheet([
			sourceRow(2, "Original Custom-Owner", "Synthetic One", "one@example.test"),
			sourceRow(3, "Original Custom-Owner", "Synthetic Two", "two@example.test"),
		]), deterministicFactory("stable-rename-id"));
		const renamed = renameCustomCandidateFunction(candidate, functionId, "Renamed Custom");

		expect(renamed.rows.every((row) => row.functionRef?.functionId === functionId)).toBe(true);
		expect(renamed.rows.every((row) => row.functionRef?.kind === "custom" && row.functionRef.displayName === "Renamed Custom")).toBe(true);
		expect(renamed.rows.every((row) => row.parsedRole === "owner")).toBe(true);
		expect(renamed.rows.map(({ functionText }) => functionText)).toEqual(["Original Custom-Owner", "Original Custom-Owner"]);
		expect(candidate.rows[0]?.functionRef).toMatchObject({ displayName: "Original Custom-Owner" });
	});

	it("resets a prior ambiguity confirmation after the effective label changes", () => {
		const functionId = toTeamFunctionId("ambiguity-function-id");
		const originalRow: TeamCandidateRow = {
			rowId: "ambiguity-row", functionText: "Original Source", functionRef: { kind: "custom", functionId, displayName: "QCI ME Owner" },
			parsedRole: "unclassified", restrictedKey: null, possibleRestricted: true, restrictedRoleDecision: "unresolved",
			roleText: "unclear", name: "Synthetic Person", email: null, extraCells: [], sourceRows: [], applicability: "applicable",
		};
		const candidate: TeamEditCandidate = { projectId, origin: "manual", fileName: null, baseTeam: emptyTeam(), rows: [originalRow], excludedSourceRowIds: [] };
		const confirmed = confirmNoncriticalRole(candidate, originalRow.rowId, standardDefinitions);
		const renamed = renameCustomCandidateFunction(confirmed, functionId, "Ordinary Custom");

		expect(confirmed.rows[0]?.restrictedRoleDecision).toBe("confirmedNoncritical");
		expect(renamed.rows[0]).toMatchObject({ possibleRestricted: false, restrictedKey: null, restrictedRoleDecision: "unresolved" });
		expect(renamed.rows[0]?.functionText).toBe("Original Source");
	});

	it("keeps an exact-label confirmation when only person data changes", () => {
		const editedExtraCell: TeamSourceCell = {
			columnIndex: 4,
			headerText: "Note",
			rawType: "s",
			rawValue: "Synthetic updated note",
			formattedText: "Synthetic updated note",
			hidden: false,
		};
		const row: TeamCandidateRow = {
			rowId: "confirmed-row", functionText: "QCI ME Owner", functionRef: null,
			parsedRole: "unclassified", restrictedKey: null, possibleRestricted: true,
			restrictedRoleDecision: "confirmedNoncritical", roleText: "", name: "Synthetic Before", email: null,
			extraCells: [], sourceRows: [], applicability: null,
		};
		const candidate: TeamEditCandidate = {
			projectId, origin: "manual", fileName: null, baseTeam: emptyTeam(), rows: [row], excludedSourceRowIds: [],
		};
		const edited = editTeamCandidate(candidate, row.rowId, {
			name: "Synthetic After",
			email: "after@example.test",
			extraCells: [editedExtraCell],
		}, standardDefinitions);

		expect(edited.rows[0]).toMatchObject({
			name: "Synthetic After",
			email: "after@example.test",
			extraCells: [editedExtraCell],
			restrictedRoleDecision: "confirmedNoncritical",
		});
		expect(candidate.rows[0]?.name).toBe("Synthetic Before");
	});

	it("preserves confirmation for normalization-equivalent classification edits", () => {
		const functionId = toTeamFunctionId("normalized-confirmation-id");
		const row: TeamCandidateRow = {
			rowId: "normalized-confirmation-row", functionText: "Original Source", functionRef: { kind: "custom", functionId, displayName: "QCI ME Owner" },
			parsedRole: "unclassified", restrictedKey: null, possibleRestricted: true, restrictedRoleDecision: "unresolved",
			roleText: " Coordinator ", name: "Synthetic Person", email: null, extraCells: [], sourceRows: [], applicability: "applicable",
		};
		const candidate: TeamEditCandidate = { projectId, origin: "manual", fileName: null, baseTeam: emptyTeam(), rows: [row], excludedSourceRowIds: [] };
		const confirmed = confirmNoncriticalRole(candidate, row.rowId, standardDefinitions);
		const renamed = renameCustomCandidateFunction(confirmed, functionId, "  qci   me owner ");
		const edited = editTeamCandidate(renamed, row.rowId, { roleText: "coordinator" }, standardDefinitions);

		expect(edited.rows[0]?.restrictedRoleDecision).toBe("confirmedNoncritical");
	});

	it("recomputes mapping after role-text edits", () => {
		const candidate = importCandidate(emptyTeam(), sheet([
			sourceRow(2, "Ordinary Custom", "Synthetic Person", "person@example.test"),
		]), deterministicFactory("edit-role-id"));
		const edited = editTeamCandidate(candidate, candidate.rows[0]!.rowId, { roleText: "owner" }, standardDefinitions);

		expect(edited.rows[0]).toMatchObject({ parsedRole: "owner", restrictedKey: null, possibleRestricted: false, restrictedRoleDecision: "unresolved" });
		expect(candidate.rows[0]?.roleText).not.toBe("owner");
	});

	it("keeps add remove assign and custom-ref helpers pure", () => {
		const base = emptyTeam();
		const candidate: TeamEditCandidate = Object.freeze({ projectId, origin: "manual", fileName: null, baseTeam: base, rows: Object.freeze([]), excludedSourceRowIds: Object.freeze([]) });
		const functionRef = createCustomCandidateFunctionRef(candidate, "Synthetic Added", deterministicFactory("added-function-id"));
		const row: TeamCandidateRow = {
			rowId: "added-row", functionText: "Synthetic Added", functionRef: null, parsedRole: "unclassified", restrictedKey: null,
			possibleRestricted: false, restrictedRoleDecision: "unresolved", roleText: "Coordinator", name: "Synthetic Added Person", email: null,
			extraCells: [], sourceRows: [], applicability: "applicable",
		};
		const added = addTeamCandidateRow(candidate, row);
		const assigned = assignCandidateFunction(added, row.rowId, functionRef, standardDefinitions);
		const removed = removeTeamCandidateRow(assigned, row.rowId);

		expect(functionRef).toEqual({ kind: "custom", functionId: toTeamFunctionId("added-function-id"), displayName: "Synthetic Added" });
		expect(candidate.rows).toEqual([]);
		expect(added.rows[0]?.functionRef).toBeNull();
		expect(assigned.rows[0]?.functionRef).toEqual(functionRef);
		expect(removed.rows).toEqual([]);
		expect(base).toEqual(emptyTeam());
	});
});
