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
import { validateProjectTeam } from "../../domain/team/teamValidation";
import { countBlocking } from "../../domain/validation/validationIssue";
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
	materializeProjectTeam,
	removeTeamCandidateRow,
	renameCustomCandidateFunction,
	validateTeamEditCandidate,
	type TeamCandidateRow,
	type TeamCandidateEditablePatch,
	type TeamEditCandidate,
	type NewTeamCandidateRow,
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

function deterministicAssignmentFactory(...values: string[]) {
	let index = 0;
	return vi.fn(() =>
		toPersonAssignmentId(values.shift() ?? `synthetic-assignment-${index++}`),
	);
}

function importCandidate(
	baseTeam: ProjectTeam | null,
	selectedSheet: TeamParsedSheet,
	createFunctionId: () => ReturnType<typeof toTeamFunctionId>,
	importSessionId = "default-import-session",
	definitions: readonly TeamFunctionDefinition[] = standardDefinitions,
	createAssignmentId = deterministicAssignmentFactory(),
): TeamEditCandidate {
	return createImportCandidate(
		projectId,
		baseTeam,
		selectedSheet,
		importSessionId,
		definitions,
		createFunctionId,
		createAssignmentId,
	);
}

describe("Team import candidate creation", () => {
	it("creates distinct row IDs for identical source coordinates in separate import sessions", () => {
		const selectedSheet = sheet([sourceRow(2, "QCI-PM-Owner", "Synthetic PM", "pm@example.test")]);
		const first = createImportCandidate(
			projectId, emptyTeam(), selectedSheet, "import-session-one", standardDefinitions, deterministicFactory(), deterministicAssignmentFactory(),
		);
		const second = createImportCandidate(
			projectId, emptyTeam(), selectedSheet, "import-session-two", standardDefinitions, deterministicFactory(), deterministicAssignmentFactory(),
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
			deterministicAssignmentFactory(),
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
			deterministicAssignmentFactory(),
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

describe("Team candidate materialization", () => {
	it("saves and reopens a lossless confirmed noncritical row without reblocking", () => {
		const functionId = toTeamFunctionId("preserved-custom-id");
		const rawSource = sourceRow(8, "Original QCI ME wording", "Synthetic Preserved", null, [{
			columnIndex: 4,
			headerText: "Tel. No.",
			rawType: "n",
			rawValue: 24680,
			formattedText: "24680",
			hidden: true,
		}]);
		const candidate: TeamEditCandidate = {
			projectId,
			origin: "import",
			fileName: "synthetic.xlsx",
			baseTeam: emptyTeam(),
			rows: [{
				rowId: "preserved-row",
				assignmentId: toPersonAssignmentId("preserved-row"),
				functionText: "Original QCI ME wording",
				functionRef: { kind: "custom", functionId, displayName: "QCI ME Owner" },
				parsedRole: "unclassified",
				restrictedKey: null,
				possibleRestricted: true,
				restrictedRoleDecision: "confirmedNoncritical",
				roleText: "Coordinator",
				name: "Synthetic Preserved",
				email: null,
				extraCells: rawSource.cells.slice(3),
				sourceRows: [rawSource],
				applicability: "applicable",
			}],
			excludedSourceRowIds: [],
		};

		const issues = validateTeamEditCandidate(candidate, standardDefinitions);
		expect(countBlocking(issues)).toBe(0);
		expect(issues).toContainEqual(expect.objectContaining({
			code: "team.data.unclassified-role",
			severity: "advisory",
		}));
		const result = materializeProjectTeam(candidate, standardDefinitions);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.team.preservedUnclassifiedEntries).toEqual([
			expect.objectContaining({
				entryId: toPersonAssignmentId("preserved-row"),
				function: { kind: "custom", functionId, displayName: "QCI ME Owner" },
				functionText: "Original QCI ME wording",
				restrictedRoleExclusion: {
					functionText: "QCI ME Owner",
					roleText: "Coordinator",
				},
				extraCells: rawSource.cells.slice(3),
				sourceRows: [rawSource],
			}),
		]);
		const reopened = createEditCandidate(projectId, result.team, standardDefinitions);
		expect(reopened.rows).toHaveLength(1);
		expect(reopened.rows[0]).toMatchObject({
			parsedRole: "unclassified",
			restrictedRoleDecision: "confirmedNoncritical",
		});
		expect(countBlocking(validateTeamEditCandidate(reopened, standardDefinitions))).toBe(0);
	});

	it("folds exact duplicates while preserving every source row and hidden numeric cell", () => {
		const hiddenPhone: TeamSourceCell = {
			columnIndex: 4, headerText: "Tel. No.", rawType: "n", rawValue: 13579,
			formattedText: "13579", hidden: true,
		};
		const candidate = importCandidate(emptyTeam(), sheet([
			sourceRow(2, "Synthetic Lab-Owner", "Synthetic Exact", "exact@example.test", [hiddenPhone]),
			sourceRow(9, "Synthetic Lab-Owner", "Synthetic Exact", "exact@example.test", [hiddenPhone]),
		]), deterministicFactory("materialized-custom-id"));

		const result = materializeProjectTeam(candidate, standardDefinitions);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.team.functions).toHaveLength(1);
		expect(result.team.functions[0]?.assignments).toHaveLength(1);
		expect(result.team.functions[0]?.assignments[0]).toMatchObject({
			extraCells: [hiddenPhone],
			sourceRows: [expect.objectContaining({ rowNumber: 2 }), expect.objectContaining({ rowNumber: 9 })],
		});
		const reopened = createEditCandidate(projectId, result.team, standardDefinitions);
		expect(reopened.rows[0]?.extraCells).toEqual([hiddenPhone]);
		expect(reopened.rows[0]?.sourceRows).toHaveLength(2);
	});

	it("does not merge same-name different-email or same-email conflicting-extra rows", () => {
		const note = (value: string): TeamSourceCell => ({
			columnIndex: 4, headerText: "Note", rawType: "s", rawValue: value,
			formattedText: value, hidden: false,
		});
		const candidate = importCandidate(emptyTeam(), sheet([
			sourceRow(2, "Synthetic Lab-Member", "Synthetic Same", "one@example.test"),
			sourceRow(3, "Synthetic Lab-Member", "Synthetic Same", "two@example.test"),
			sourceRow(4, "Synthetic Lab-Member", "Synthetic Conflict", "conflict@example.test", [note("A")]),
			sourceRow(5, "Synthetic Lab-Member", "Synthetic Conflict", "conflict@example.test", [note("B")]),
		]), deterministicFactory("conflict-custom-id"));

		const result = materializeProjectTeam(candidate, standardDefinitions);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.team.functions[0]?.assignments).toHaveLength(4);
		expect(validateProjectTeam(result.team, standardDefinitions)).toEqual(expect.arrayContaining([
			expect.objectContaining({ code: "team.data.identity-conflict", severity: "advisory" }),
		]));
	});

	it("blocks restricted ambiguity blank-email uncertainty and unresolved Function refs", () => {
		const ambiguous = importCandidate(emptyTeam(), sheet([
			sourceRow(2, "QCI ME Owner", "Synthetic Ambiguous", "ambiguous@example.test"),
		]), deterministicFactory());
		const blankEmail = importCandidate(emptyTeam(), sheet([
			sourceRow(2, "QCI-ME-Owner", "Synthetic Unknown", null),
			sourceRow(3, "QCI-ME-Owner", "Synthetic Unknown", null),
		]), deterministicFactory("restricted-custom-id"));
		const unresolved: TeamEditCandidate = {
			...ambiguous,
			rows: [{ ...ambiguous.rows[0]!, possibleRestricted: false, functionRef: null }],
		};

		expect(validateTeamEditCandidate(ambiguous, standardDefinitions)).toContainEqual(
			expect.objectContaining({ code: "team.data.restricted-role-ambiguous", severity: "blocking" }),
		);
		expect(validateTeamEditCandidate(blankEmail, standardDefinitions)).toContainEqual(
			expect.objectContaining({ code: "team.data.restricted-role-identity-unresolved", severity: "blocking" }),
		);
		expect(validateTeamEditCandidate(unresolved, standardDefinitions)).toContainEqual(
			expect.objectContaining({ code: "team.data.function-unresolved", severity: "blocking" }),
		);
		expect(materializeProjectTeam(unresolved, standardDefinitions)).toMatchObject({ ok: false });
	});

	it("keeps Project Role slots and one shared preallocated custom Function identity", () => {
		const customId = toTeamFunctionId("shared-save-custom-id");
		const candidate: TeamEditCandidate = {
			projectId,
			origin: "import",
			fileName: "synthetic.xlsx",
			baseTeam: emptyTeam(),
			rows: [
				{
					rowId: "saved-qci-pm", functionText: "QCI-PM-Owner", functionRef: null,
					assignmentId: toPersonAssignmentId("saved-qci-pm"),
					parsedRole: "unclassified", restrictedKey: "qciPm", possibleRestricted: false,
					restrictedRoleDecision: "unresolved", roleText: "QCI-PM-Owner",
					name: "Synthetic PM", email: "pm@example.test", extraCells: [], sourceRows: [], applicability: null,
				},
				...(["One", "Two"] as const).map((suffix) => ({
					rowId: `saved-custom-${suffix}`, functionText: "Original Shared-Owner",
					assignmentId: toPersonAssignmentId(`saved-custom-${suffix}`),
					functionRef: { kind: "custom" as const, functionId: customId, displayName: "Renamed Shared" },
					parsedRole: "owner" as const, restrictedKey: null, possibleRestricted: false,
					restrictedRoleDecision: "unresolved" as const, roleText: "owner",
					name: `Synthetic ${suffix}`, email: `${suffix.toLowerCase()}@example.test`,
					extraCells: [], sourceRows: [], applicability: "applicable" as const,
				})),
			],
			excludedSourceRowIds: [],
		};

		const result = materializeProjectTeam(candidate, standardDefinitions);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.team.projectRoles.qciPm).toMatchObject({
			assignmentId: toPersonAssignmentId("saved-qci-pm"),
			name: "Synthetic PM",
		});
		expect(result.team.functions).toEqual([
			expect.objectContaining({
				function: { kind: "custom", functionId: customId, displayName: "Renamed Shared" },
				assignments: [
					expect.objectContaining({ functionText: "Original Shared-Owner" }),
					expect.objectContaining({ functionText: "Original Shared-Owner" }),
				],
			}),
		]);
		const reopened = createEditCandidate(projectId, result.team, standardDefinitions);
		expect(reopened.rows.filter(({ functionRef }) => functionRef?.functionId === customId)).toHaveLength(2);
		expect(reopened.rows.find(({ restrictedKey }) => restrictedKey === "qciPm")?.functionRef).toBeNull();
	});

	it("rejects an unknown standard ref and blocks people under explicit N/A until applicability changes", () => {
		const unknownId = toTeamFunctionId("unknown-standard-id");
		const row: TeamCandidateRow = {
			rowId: "unknown-standard-row", functionText: "Unknown Standard", functionRef: { kind: "standard", functionId: unknownId },
			assignmentId: toPersonAssignmentId("unknown-standard-assignment"),
			parsedRole: "member", restrictedKey: null, possibleRestricted: false, restrictedRoleDecision: "unresolved",
			roleText: "member", name: "Synthetic Person", email: "person@example.test", extraCells: [], sourceRows: [], applicability: "notApplicable",
		};
		const unknownCandidate: TeamEditCandidate = {
			projectId, origin: "manual", fileName: null, baseTeam: emptyTeam(), rows: [row], excludedSourceRowIds: [],
		};
		expect(validateTeamEditCandidate(unknownCandidate, standardDefinitions)).toContainEqual(
			expect.objectContaining({ code: "team.data.standard-function-unknown", severity: "blocking" }),
		);

		const nAId = standardThermalId;
		const nABase: ProjectTeam = {
			...emptyTeam(),
			functions: [{ function: { kind: "standard", functionId: nAId }, applicability: "notApplicable", assignments: [] }],
		};
		const nACandidate: TeamEditCandidate = {
			...unknownCandidate,
			baseTeam: nABase,
			rows: [{ ...row, rowId: "n-a-row", functionText: "Synthetic Thermal", functionRef: { kind: "standard", functionId: nAId } }],
		};
		const blocked = materializeProjectTeam(nACandidate, standardDefinitions);
		expect(blocked).toMatchObject({ ok: false });
		if (blocked.ok) return;
		expect(blocked.issues).toContainEqual(expect.objectContaining({ code: "team.data.not-applicable-with-people" }));
		const applicable = editTeamCandidate(nACandidate, "n-a-row", { applicability: "applicable" }, standardDefinitions);
		const saved = materializeProjectTeam(applicable, standardDefinitions);
		expect(saved.ok).toBe(true);
		if (!saved.ok) return;
		expect(saved.team.functions[0]).toMatchObject({
			function: { kind: "standard", functionId: nAId },
			applicability: "applicable",
		});
	});

	it("blocks stale derived classification instead of trusting a manipulated candidate", () => {
		const stale: TeamEditCandidate = {
			projectId,
			origin: "manual",
			fileName: null,
			baseTeam: emptyTeam(),
			rows: [{
				rowId: "stale-classification-row",
				assignmentId: toPersonAssignmentId("stale-classification-assignment"),
				functionText: "QCI-ME-Owner",
				functionRef: { kind: "standard", functionId: standardMeId },
				parsedRole: "unclassified",
				restrictedKey: null,
				possibleRestricted: false,
				restrictedRoleDecision: "confirmedNoncritical",
				roleText: "",
				name: "Synthetic Stale",
				email: "stale@example.test",
				extraCells: [],
				sourceRows: [],
				applicability: "applicable",
			}],
			excludedSourceRowIds: [],
		};

		expect(validateTeamEditCandidate(stale, standardDefinitions)).toContainEqual(
			expect.objectContaining({ code: "team.data.classification-stale", severity: "blocking" }),
		);
		expect(materializeProjectTeam(stale, standardDefinitions)).toMatchObject({ ok: false });
	});

	it("blocks conflicting rows that reuse one candidate identity", () => {
		const functionRef = {
			kind: "custom" as const,
			functionId: toTeamFunctionId("identity-conflict-function"),
			displayName: "Synthetic Conflict-Member",
		};
		const baseRow: TeamCandidateRow = {
			rowId: "reused-row-id", functionText: "Synthetic Conflict-Member", functionRef,
			assignmentId: toPersonAssignmentId("reused-assignment-id"),
			parsedRole: "member", restrictedKey: null, possibleRestricted: false,
			restrictedRoleDecision: "unresolved", roleText: "member", name: "Synthetic One",
			email: "one@example.test", extraCells: [], sourceRows: [], applicability: "applicable",
		};
		const candidate: TeamEditCandidate = {
			projectId, origin: "manual", fileName: null, baseTeam: emptyTeam(),
			rows: [baseRow, { ...baseRow, name: "Synthetic Two", email: "two@example.test" }],
			excludedSourceRowIds: [],
		};

		expect(validateTeamEditCandidate(candidate, standardDefinitions)).toContainEqual(
			expect.objectContaining({ code: "team.data.row-identity-conflict", severity: "blocking" }),
		);
	});

	it("moves a corrected preserved row into one formal assignment with its evidence", () => {
		const functionId = toTeamFunctionId("corrected-preserved-function");
		const evidence = sourceRow(12, "Synthetic Unit", "Synthetic Corrected", "corrected@example.test");
		const savedTeam: ProjectTeam = {
			...emptyTeam(),
			functions: [{
				function: { kind: "custom", functionId, displayName: "Synthetic Unit" },
				applicability: "applicable",
				assignments: [],
			}],
			preservedUnclassifiedEntries: [{
				entryId: toPersonAssignmentId("corrected-preserved-row"),
				function: { kind: "custom", functionId, displayName: "Synthetic Unit" },
				functionText: "Synthetic Unit",
				roleText: "Coordinator",
				name: "Synthetic Corrected",
				email: "corrected@example.test",
				extraCells: [],
				sourceRows: [evidence],
				restrictedRoleExclusion: null,
			}],
		};
		const opened = createEditCandidate(projectId, savedTeam, standardDefinitions);
		const corrected = editTeamCandidate(
			opened,
			opened.rows[0]!.rowId,
			{ roleText: "member" },
			standardDefinitions,
		);
		const result = materializeProjectTeam(corrected, standardDefinitions);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.team.preservedUnclassifiedEntries).toEqual([]);
		expect(result.team.functions[0]?.assignments).toEqual([
			expect.objectContaining({
				assignmentId: toPersonAssignmentId("corrected-preserved-row"),
				role: "member",
				sourceRows: [evidence],
			}),
		]);
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
			assignmentId: toPersonAssignmentId("reassign-standard-assignment"),
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

	it("keeps a buffered Mark Applicable decision through Add and reassignment", () => {
		const targetId = toTeamFunctionId("buffered-applicability-target");
		const sourceId = toTeamFunctionId("buffered-applicability-source");
		const targetRef = { kind: "custom" as const, functionId: targetId, displayName: "Target Function" };
		const baseTeam: ProjectTeam = {
			...emptyTeam(),
			functions: [
				{
					function: targetRef,
					applicability: "notApplicable",
					assignments: [{
						assignmentId: toPersonAssignmentId("buffered-target-person"),
						role: "member",
						name: "Synthetic Target",
						email: "target@example.test",
					}],
				},
				{
					function: { kind: "custom", functionId: sourceId, displayName: "Source Function" },
					applicability: "applicable",
					assignments: [{
						assignmentId: toPersonAssignmentId("buffered-source-person"),
						role: "member",
						name: "Synthetic Source",
						email: "source@example.test",
					}],
				},
			],
		};
		const opened = createEditCandidate(projectId, baseTeam, standardDefinitions);
		const targetRow = opened.rows.find(({ functionRef }) => functionRef?.functionId === targetId)!;
		const sourceRow = opened.rows.find(({ functionRef }) => functionRef?.functionId === sourceId)!;
		const markedApplicable = editTeamCandidate(
			opened,
			targetRow.rowId,
			{ applicability: "applicable" },
			standardDefinitions,
		);
		const { rowId: _rowId, assignmentId: _assignmentId, ...newRow } = targetRow;
		const added = addTeamCandidateRow(
			markedApplicable,
			{
				...newRow,
				name: "Synthetic Added",
				email: "added@example.test",
				applicability: "notApplicable",
			},
			deterministicAssignmentFactory("buffered-added-person"),
		);
		const reassigned = assignCandidateFunction(
			added,
			sourceRow.rowId,
			targetRef,
			standardDefinitions,
		);

		expect(
			reassigned.rows
				.filter(({ functionRef }) => functionRef?.functionId === targetId)
				.map(({ applicability }) => applicability),
		).toEqual(["applicable", "applicable", "applicable"]);
		expect(baseTeam.functions[0]?.applicability).toBe("notApplicable");
	});

	it("uses the one candidate-current non-null applicability instead of stale base metadata", () => {
		const targetId = toTeamFunctionId("mixed-current-applicability-target");
		const sourceId = toTeamFunctionId("mixed-current-applicability-source");
		const targetRef = { kind: "custom" as const, functionId: targetId, displayName: "Mixed Target" };
		const makeRow = (
			rowId: string,
			functionRef: TeamCandidateRow["functionRef"],
			applicability: TeamCandidateRow["applicability"],
		): TeamCandidateRow => ({
			rowId,
			assignmentId: toPersonAssignmentId(`${rowId}-assignment`),
			functionText: functionRef?.kind === "custom" ? functionRef.displayName : "",
			functionRef,
			parsedRole: "member",
			restrictedKey: null,
			possibleRestricted: false,
			restrictedRoleDecision: "unresolved",
			roleText: "member",
			name: rowId,
			email: `${rowId}@example.test`,
			extraCells: [],
			sourceRows: [],
			applicability,
		});
		const sourceRef = { kind: "custom" as const, functionId: sourceId, displayName: "Mixed Source" };
		const candidate: TeamEditCandidate = {
			projectId,
			origin: "manual",
			fileName: null,
			baseTeam: {
				...emptyTeam(),
				functions: [{ function: targetRef, applicability: "notApplicable", assignments: [] }],
			},
			rows: [
				makeRow("mixed-current-applicable", targetRef, "applicable"),
				makeRow("mixed-current-null", targetRef, null),
				makeRow("mixed-current-source", sourceRef, "applicable"),
			],
			excludedSourceRowIds: [],
		};

		const assigned = assignCandidateFunction(
			candidate,
			"mixed-current-source",
			targetRef,
			standardDefinitions,
		);

		expect(assigned.rows.find(({ rowId }) => rowId === "mixed-current-source")?.applicability).toBe("applicable");
	});

	it("keeps conflicting candidate-current applicability Blocking without falling back to base", () => {
		const targetId = toTeamFunctionId("conflicting-current-applicability-target");
		const sourceId = toTeamFunctionId("conflicting-current-applicability-source");
		const targetRef = { kind: "custom" as const, functionId: targetId, displayName: "Conflict Target" };
		const sourceRef = { kind: "custom" as const, functionId: sourceId, displayName: "Conflict Source" };
		const row = (rowId: string, functionRef: typeof targetRef, applicability: "applicable" | "notApplicable"): TeamCandidateRow => ({
			rowId,
			assignmentId: toPersonAssignmentId(`${rowId}-assignment`),
			functionText: functionRef.displayName,
			functionRef,
			parsedRole: "member",
			restrictedKey: null,
			possibleRestricted: false,
			restrictedRoleDecision: "unresolved",
			roleText: "member",
			name: rowId,
			email: `${rowId}@example.test`,
			extraCells: [],
			sourceRows: [],
			applicability,
		});
		const candidate: TeamEditCandidate = {
			projectId,
			origin: "manual",
			fileName: null,
			baseTeam: {
				...emptyTeam(),
				functions: [{ function: targetRef, applicability: "notApplicable", assignments: [] }],
			},
			rows: [
				row("conflicting-current-applicable", targetRef, "applicable"),
				row("conflicting-current-not-applicable", targetRef, "notApplicable"),
				row("conflicting-current-source", sourceRef, "applicable"),
			],
			excludedSourceRowIds: [],
		};

		const assigned = assignCandidateFunction(
			candidate,
			"conflicting-current-source",
			targetRef,
			standardDefinitions,
		);

		expect(assigned.rows.find(({ rowId }) => rowId === "conflicting-current-source")?.applicability).toBeNull();
		expect(validateTeamEditCandidate(assigned, standardDefinitions)).toContainEqual(
			expect.objectContaining({ code: "team.data.applicability-conflict", severity: "blocking" }),
		);
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
				assignmentId: toPersonAssignmentId("new-custom-target-assignment"),
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
			assignmentId: toPersonAssignmentId("ambiguity-assignment"),
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
			assignmentId: toPersonAssignmentId("confirmed-assignment"),
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
			assignmentId: toPersonAssignmentId("normalized-confirmation-assignment"),
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
		const row: NewTeamCandidateRow = {
			functionText: "Synthetic Added", functionRef: null, parsedRole: "unclassified", restrictedKey: null,
			possibleRestricted: false, restrictedRoleDecision: "unresolved", roleText: "Coordinator", name: "Synthetic Added Person", email: null,
			extraCells: [], sourceRows: [], applicability: "applicable",
		};
		const createAssignmentId = deterministicAssignmentFactory("added-assignment-id");
		const added = addTeamCandidateRow(candidate, row, createAssignmentId);
		const addedRow = added.rows[0]!;
		const assigned = assignCandidateFunction(added, addedRow.rowId, functionRef, standardDefinitions);
		const removed = removeTeamCandidateRow(assigned, addedRow.rowId);

		expect(functionRef).toEqual({ kind: "custom", functionId: toTeamFunctionId("added-function-id"), displayName: "Synthetic Added" });
		expect(candidate.rows).toEqual([]);
		expect(addedRow.assignmentId).toBe(toPersonAssignmentId("added-assignment-id"));
		expect(addedRow.rowId).not.toBe(addedRow.assignmentId);
		expect(createAssignmentId).toHaveBeenCalledTimes(1);
		expect(added.rows[0]?.functionRef).toBeNull();
		expect(assigned.rows[0]?.functionRef).toEqual(functionRef);
		expect(removed.rows).toEqual([]);
		expect(base).toEqual(emptyTeam());
	});
});


describe("Slice 4 corrected identity regressions", () => {
	it("folds exact duplicate Project Role rows without losing evidence or survivor identity", () => {
		const firstId = toPersonAssignmentId("project-role-survivor");
		const secondId = toPersonAssignmentId("project-role-duplicate");
		const createAssignmentId = vi.fn()
			.mockReturnValueOnce(firstId)
			.mockReturnValueOnce(secondId);
		const candidate = createImportCandidate(
			projectId,
			emptyTeam(),
			sheet([
				sourceRow(2, "QCI-PM-Owner", "Synthetic PM", "pm@example.test"),
				sourceRow(9, "QCI-PM-Owner", "Synthetic PM", "pm@example.test"),
			]),
			"project-role-duplicates",
			standardDefinitions,
			deterministicFactory(),
			createAssignmentId,
		);

		expect(candidate.rows.map(({ assignmentId }) => assignmentId)).toEqual([firstId, secondId]);
		const result = materializeProjectTeam(candidate, standardDefinitions);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.team.projectRoles.qciPm).toMatchObject({
			assignmentId: firstId,
			sourceRows: [
				expect.objectContaining({ rowNumber: 2 }),
				expect.objectContaining({ rowNumber: 9 }),
			],
		});
		const reopened = createEditCandidate(projectId, result.team, standardDefinitions);
		expect(reopened.rows).toHaveLength(1);
		expect(reopened.rows[0]).toMatchObject({ assignmentId: firstId, restrictedKey: "qciPm" });
		expect(reopened.rows[0]?.sourceRows).toHaveLength(2);

		const conflicting = {
			...candidate,
			rows: [candidate.rows[0]!, { ...candidate.rows[1]!, name: "Synthetic Other PM" }],
		};
		expect(materializeProjectTeam(conflicting, standardDefinitions)).toMatchObject({ ok: false });
	});

	it("folds a saved Project Role and reassigned Function duplicate despite applicability metadata", () => {
		const functionId = toTeamFunctionId("reassigned-qci-pm-function");
		const definitions: readonly TeamFunctionDefinition[] = [
			{ id: functionId, displayName: "QCI-PM-Owner", active: true },
		];
		const firstId = toPersonAssignmentId("saved-project-role-first");
		const secondId = toPersonAssignmentId("reassigned-function-second");
		const firstSource = sourceRow(2, "QCI-PM-Owner", "Synthetic PM", "pm@example.test");
		const secondSource = sourceRow(9, "Historical Function", "Synthetic PM", "pm@example.test");
		const savedTeam: ProjectTeam = {
			...emptyTeam(),
			projectRoles: {
				qciPm: {
					assignmentId: firstId,
					name: "Synthetic PM",
					email: "pm@example.test",
					functionText: "QCI-PM-Owner",
					extraCells: [],
					sourceRows: [firstSource],
				},
				qciPjm: null,
				acerPm: null,
			},
			functions: [{
				function: { kind: "standard", functionId },
				applicability: "applicable",
				assignments: [{
					assignmentId: secondId,
					role: "owner",
					functionText: "Historical Function",
					name: "Synthetic PM",
					email: "pm@example.test",
					extraCells: [],
					sourceRows: [secondSource],
				}],
			}],
		};

		const candidate = createEditCandidate(projectId, savedTeam, definitions);
		expect(countBlocking(validateTeamEditCandidate(candidate, definitions))).toBe(0);
		const result = materializeProjectTeam(candidate, definitions);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.team.projectRoles.qciPm).toMatchObject({
			assignmentId: firstId,
			sourceRows: [firstSource, secondSource],
		});
	});

	it("blocks retained empty Function identity conflicts before grouping", () => {
		const conflictingCustomId = toTeamFunctionId("empty-conflicting-custom");
		const collidingId = toTeamFunctionId("empty-standard-custom-collision");
		const definitions: readonly TeamFunctionDefinition[] = [
			{ id: collidingId, displayName: "Synthetic Standard", active: true },
		];
		const customFirst = { kind: "custom" as const, functionId: conflictingCustomId, displayName: "Synthetic First" };
		const customSecond = { kind: "custom" as const, functionId: conflictingCustomId, displayName: "Synthetic Second" };
		const standardRef = { kind: "standard" as const, functionId: collidingId };
		const collidingCustomRef = { kind: "custom" as const, functionId: collidingId, displayName: "Synthetic Collision" };
		const functionTeam = (functionRef: typeof customFirst | typeof standardRef) => ({
			function: functionRef,
			applicability: "notApplicable" as const,
			assignments: [],
		});
		const teams: readonly ProjectTeam[] = [
			{ ...emptyTeam(), functions: [functionTeam(customFirst), functionTeam(customSecond)] },
			{ ...emptyTeam(), functions: [functionTeam(standardRef), functionTeam(collidingCustomRef)] },
			{ ...emptyTeam(), functions: [functionTeam(collidingCustomRef), functionTeam(standardRef)] },
		];

		for (const team of teams) {
			const candidate = createEditCandidate(projectId, team, definitions);
			const result = materializeProjectTeam(candidate, definitions);
			expect(result.ok).toBe(false);
			if (result.ok) continue;
			expect(result.issues).toContainEqual(expect.objectContaining({
				code: "team.data.function-identity-conflict",
				severity: "blocking",
			}));
		}
	});

	it("keeps candidate row identity separate when canonical assignment IDs repeat across Functions", () => {
		const sharedAssignmentId = toPersonAssignmentId("shared-cross-function-assignment");
		const firstFunctionId = toTeamFunctionId("cross-function-a");
		const secondFunctionId = toTeamFunctionId("cross-function-b");
		const savedTeam: ProjectTeam = {
			...emptyTeam(),
			functions: [
				{
					function: { kind: "custom", functionId: firstFunctionId, displayName: "Synthetic A-Member" },
					applicability: "applicable",
					assignments: [{ assignmentId: sharedAssignmentId, role: "member", name: "Synthetic A", email: "a@example.test" }],
				},
				{
					function: { kind: "custom", functionId: secondFunctionId, displayName: "Synthetic B-Member" },
					applicability: "applicable",
					assignments: [{ assignmentId: sharedAssignmentId, role: "member", name: "Synthetic B", email: "b@example.test" }],
				},
			],
		};

		const opened = createEditCandidate(projectId, savedTeam, standardDefinitions);
		expect(opened.rows.map(({ assignmentId }) => assignmentId)).toEqual([
			sharedAssignmentId,
			sharedAssignmentId,
		]);
		expect(new Set(opened.rows.map(({ rowId }) => rowId)).size).toBe(2);
		expect(opened.rows.every(({ rowId }) => rowId !== sharedAssignmentId)).toBe(true);

		const edited = editTeamCandidate(opened, opened.rows[0]!.rowId, { name: "Synthetic A Edited" }, standardDefinitions);
		expect(edited.rows.map(({ name }) => name)).toEqual(["Synthetic A Edited", "Synthetic B"]);
		const removed = removeTeamCandidateRow(opened, opened.rows[0]!.rowId);
		expect(removed.rows).toHaveLength(1);
		expect(removed.rows[0]?.functionRef?.functionId).toBe(secondFunctionId);

		const saved = materializeProjectTeam(opened, standardDefinitions);
		expect(saved.ok).toBe(true);
		if (!saved.ok) return;
		expect(saved.team.functions.flatMap(({ assignments }) => assignments.map(({ assignmentId }) => assignmentId))).toEqual([
			sharedAssignmentId,
			sharedAssignmentId,
		]);
		const reopened = createEditCandidate(projectId, saved.team, standardDefinitions);
		expect(new Set(reopened.rows.map(({ rowId }) => rowId)).size).toBe(2);
		expect(reopened.rows.every(({ assignmentId }) => assignmentId === sharedAssignmentId)).toBe(true);
	});

	it("reopens a definition-derived Project Role without reviving its historical Function label", () => {
		const functionId = toTeamFunctionId("synthetic-qci-pm-standard");
		const assignmentId = toPersonAssignmentId("reassigned-project-role");
		const definitions: readonly TeamFunctionDefinition[] = [
			{ id: functionId, displayName: "QCI-PM-Owner", active: true },
		];
		const historicalSource = sourceRow(14, "Historical Lab-Owner", "Synthetic PM", "pm@example.test");
		const savedTeam: ProjectTeam = {
			...emptyTeam(),
			functions: [{
				function: { kind: "standard", functionId },
				applicability: "applicable",
				assignments: [{
					assignmentId,
					role: "owner",
					functionText: "Historical Lab-Owner",
					name: "Synthetic PM",
					email: "pm@example.test",
					extraCells: [],
					sourceRows: [historicalSource],
				}],
			}],
		};

		const reassigned = createEditCandidate(projectId, savedTeam, definitions);
		expect(reassigned.rows[0]?.restrictedKey).toBe("qciPm");
		const result = materializeProjectTeam(reassigned, definitions);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.team.projectRoles.qciPm).toMatchObject({
			assignmentId,
			functionText: "QCI-PM-Owner",
			sourceRows: [historicalSource],
		});
		const reopened = createEditCandidate(projectId, result.team, definitions);
		expect(reopened.rows[0]).toMatchObject({
			assignmentId,
			functionText: "QCI-PM-Owner",
			restrictedKey: "qciPm",
		});
		expect(reopened.rows[0]?.rowId).not.toBe(assignmentId);
		expect(validateTeamEditCandidate(reopened, definitions)).not.toContainEqual(
			expect.objectContaining({ code: "team.data.classification-stale" }),
		);
	});

	it("reports partial missing-email N/A and pending diagnostics without dropping rows", () => {
		const phone: TeamSourceCell = {
			columnIndex: 4,
			headerText: "Tel. No.",
			rawType: "n",
			rawValue: 24680,
			formattedText: "24680",
			hidden: true,
		};
		const makeRow = (
			rowId: string,
			name: string | null,
			email: string | null,
			applicability: "applicable" | "notApplicable" | "pending",
			extraCells: readonly TeamSourceCell[] = [],
		): TeamCandidateRow => ({
			rowId,
			assignmentId: toPersonAssignmentId(`${rowId}-assignment`),
			functionText: `${rowId}-Member`,
			functionRef: { kind: "custom", functionId: toTeamFunctionId(`${rowId}-function`), displayName: `${rowId}-Member` },
			parsedRole: "member",
			restrictedKey: null,
			possibleRestricted: false,
			restrictedRoleDecision: "unresolved",
			roleText: "member",
			name,
			email,
			extraCells,
			sourceRows: [],
			applicability,
		});
		const partial = makeRow("partial-row", null, "partial@example.test", "applicable", [phone]);
		const missingEmail = makeRow("missing-email-row", "Synthetic Missing", null, "applicable");
		const notApplicable = makeRow("not-applicable-row", "Synthetic N/A", "na@example.test", "notApplicable");
		const pending = makeRow("pending-row", "Synthetic Pending", "pending@example.test", "pending");
		const candidate: TeamEditCandidate = {
			projectId,
			origin: "manual",
			fileName: null,
			baseTeam: emptyTeam(),
			rows: [partial, missingEmail, notApplicable, pending],
			excludedSourceRowIds: [],
		};

		const issues = validateTeamEditCandidate(candidate, standardDefinitions);
		expect(issues).toEqual(expect.arrayContaining([
			expect.objectContaining({ code: "team.data.partial-person", severity: "advisory", target: expect.objectContaining({ entityId: partial.rowId }) }),
			expect.objectContaining({ code: "team.data.missing-email", severity: "advisory", target: expect.objectContaining({ entityId: missingEmail.rowId, field: "email" }) }),
			expect.objectContaining({ code: "team.data.not-applicable-with-people", severity: "blocking", target: expect.objectContaining({ entityId: notApplicable.rowId }) }),
			expect.objectContaining({ code: "team.data.pending-applicability", severity: "advisory", target: expect.objectContaining({ entityId: pending.rowId }) }),
		]));
		expect(candidate.rows).toHaveLength(4);

		const excluded = excludeImportSourceRow(candidate, partial.rowId);
		expect(excluded.excludedSourceRowIds).toContain(partial.rowId);
		expect(excluded.rows).not.toContainEqual(expect.objectContaining({ rowId: partial.rowId }));
		expect(validateTeamEditCandidate(excluded, standardDefinitions)).not.toContainEqual(
			expect.objectContaining({ target: expect.objectContaining({ entityId: partial.rowId }) }),
		);
	});

	it("does not emit an unclassified Advisory for an exact Project Role", () => {
		const candidate = createImportCandidate(
			projectId,
			emptyTeam(),
			sheet([sourceRow(2, "QCI-PM-Owner", "Synthetic PM", "pm@example.test")]),
			"exact-project-role",
			standardDefinitions,
			deterministicFactory(),
			vi.fn(() => toPersonAssignmentId("exact-project-role-assignment")),
		);

		expect(candidate.rows[0]).toMatchObject({ parsedRole: "unclassified", restrictedKey: "qciPm" });
		expect(validateTeamEditCandidate(candidate, standardDefinitions)).not.toContainEqual(
			expect.objectContaining({ code: "team.data.unclassified-role", target: expect.objectContaining({ entityId: candidate.rows[0]!.rowId }) }),
		);
	});
});
