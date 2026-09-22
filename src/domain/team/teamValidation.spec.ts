import { describe, expect, it } from "vitest";

import { devProject005 } from "../../fixtures/v2/canonicalProjectFixtures";
import {
	applicableWithoutOwnerTeamCandidate,
	missingEmailTeamCandidate,
	multipleLeaderTeamCandidate,
	notApplicableWithPeopleTeamCandidate,
} from "../../fixtures/v2/teamCandidateFixtures";
import {
	devMeTeamFunctionDefinition,
	devTeamFunctionDefinitions,
	devTeamTemplateV2,
} from "../../fixtures/v2/teamTemplateFixtures";
import {
	toPersonAssignmentId,
	toTeamFunctionId,
} from "../shared/ids";
import type { ProjectTeam } from "./team";
import {
	deduplicateExactMemberAssignments,
	validateProjectTeam,
	validateRestrictedRoleRows,
	type RestrictedCountRow,
	type TeamImportProblem,
} from "./teamValidation";

function summaries(team: ProjectTeam) {
	return validateProjectTeam(team, devTeamFunctionDefinitions).map(({ code, source, severity }) => ({
		code,
		source,
		severity,
	}));
}

describe("Project Team validation", () => {
	it("does not emit a count issue for multiple nonrestricted Owners", () => {
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [{
				function: {
					kind: "custom",
					functionId: toTeamFunctionId("validation-nonrestricted-owner"),
					displayName: "Synthetic Support",
				},
				applicability: "applicable",
				assignments: [
					{
						assignmentId: toPersonAssignmentId("validation-nonrestricted-owner-one"),
						role: "owner",
						name: "Synthetic Owner One",
						email: "validation.owner.one@example.test",
					},
					{
						assignmentId: toPersonAssignmentId("validation-nonrestricted-owner-two"),
						role: "owner",
						name: "Synthetic Owner Two",
						email: "validation.owner.two@example.test",
					},
				],
			}],
			preservedUnclassifiedEntries: [],
			appliedTemplate: null,
		};
		const issues = summaries(team);
		expect(issues).not.toContainEqual(
			expect.objectContaining({ code: "team.data.multiple-owners" }),
		);
		expect(issues).not.toContainEqual(
			expect.objectContaining({ code: "team.data.restricted-role-multiple" }),
		);
	});

	it("does not emit a count issue for multiple Leaders", () => {
		const issues = summaries(multipleLeaderTeamCandidate);
		expect(issues).not.toContainEqual(
			expect.objectContaining({ code: "team.data.multiple-leaders" }),
		);
		expect(issues).not.toContainEqual(
			expect.objectContaining({ code: "team.data.restricted-role-multiple" }),
		);
	});

	it("classifies Not Applicable with people as Blocking Data", () => {
		expect(summaries(notApplicableWithPeopleTeamCandidate)).toContainEqual({
			code: "team.data.not-applicable-with-people",
			source: "data",
			severity: "blocking",
		});
	});

	it("does not emit the generic missing-Owner Advisory", () => {
		expect(summaries(applicableWithoutOwnerTeamCandidate)).not.toContainEqual(
			expect.objectContaining({ code: "team.data.missing-owner" }),
		);
	});

	it("classifies a meaningful person name without email as Advisory Data", () => {
		expect(summaries(missingEmailTeamCandidate)).toContainEqual({
			code: "team.data.missing-email",
			source: "data",
			severity: "advisory",
		});
	});

	it("classifies each newly added pending Template Function as Advisory Data", () => {
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [
				{
					function: {
						kind: "standard",
						functionId: devMeTeamFunctionDefinition.id,
					},
					applicability: "pending",
					assignments: [],
				},
			],
			appliedTemplate: {
				templateId: devTeamTemplateV2.id,
				versionNumber: devTeamTemplateV2.versionNumber,
			},
		};

		const issues = summaries(team);
		expect(issues).toContainEqual({
			code: "team.data.pending-applicability",
			source: "data",
			severity: "advisory",
		});
		expect(
			issues.filter(({ code }) => code === "team.data.restricted-role-missing"),
		).toHaveLength(7);
		expect(issues.every(({ severity }) => severity === "advisory")).toBe(true);
	});

	it("treats imported unassigned people as Blocking and unknown imported Functions as Advisory", () => {
		const importProblems: readonly TeamImportProblem[] = [
			{
				kind: "unassignedPerson",
				entityId: "import-row-12",
				message: "Imported person has no resolvable Function.",
			},
			{
				kind: "unknownFunction",
				entityId: "dev-imported-custom-function",
				message: "Imported Function was preserved as a custom Function.",
			},
		];

		const issues = validateProjectTeam(
			{
				projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
				functions: [
					{
						function: {
							kind: "custom",
							functionId: toTeamFunctionId(
								"dev-imported-custom-function",
							),
							displayName: "DEV Imported Function",
						},
						applicability: "notApplicable",
						assignments: [],
					},
				],
				appliedTemplate: null,
			},
			devTeamFunctionDefinitions,
			{ importProblems },
		);

		expect(issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "team.import.unassigned-person",
					source: "import",
					severity: "blocking",
				}),
				expect.objectContaining({
					code: "team.import.unknown-function",
					source: "import",
					severity: "advisory",
				}),
			]),
		);
	});

	it("allows the same person to occupy different roles without a warning", () => {
		const samePerson = {
			name: "DEV Alice",
			email: "alice@example.test",
		};
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [
				{
					function: {
						kind: "standard",
						functionId: devMeTeamFunctionDefinition.id,
					},
					applicability: "applicable",
					assignments: [
						{
							assignmentId: toPersonAssignmentId("same-person-leader"),
							role: "leader",
							...samePerson,
						},
						{
							assignmentId: toPersonAssignmentId("same-person-owner"),
							role: "owner",
							...samePerson,
						},
						{
							assignmentId: toPersonAssignmentId("same-person-member"),
							role: "member",
							...samePerson,
						},
					],
				},
			],
			appliedTemplate: null,
		};

		expect(
			validateProjectTeam(team, devTeamFunctionDefinitions).filter((issue) => issue.severity === "blocking"),
		).toEqual([]);
	});

	it("returns only Advisories for canonical Project 005", () => {
		expect(devProject005.team).not.toBeNull();
		const issues = validateProjectTeam(devProject005.team!, devTeamFunctionDefinitions);

		expect(issues).toContainEqual(
			expect.objectContaining({
				code: "team.data.restricted-role-missing",
				severity: "advisory",
			}),
		);
		expect(issues.every((issue) => issue.severity === "advisory")).toBe(true);
	});

	it("keeps N/A with a preserved person Blocking", () => {
		const preserved = {
			entryId: toPersonAssignmentId("preserved-na-person"),
			function: {
				kind: "custom" as const,
				functionId: toTeamFunctionId("preserved-na-function"),
				displayName: "Synthetic Preserved Function",
			},
			functionText: "Synthetic Preserved Function",
			roleText: "Coordinator",
			name: "Synthetic Preserved Person",
			email: null,
			extraCells: [],
			sourceRows: [],
			restrictedRoleExclusion: null,
		};
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [
				{
					function: preserved.function,
					applicability: "notApplicable",
					assignments: [],
				},
			],
			preservedUnclassifiedEntries: [preserved],
			appliedTemplate: null,
		};

		expect(validateProjectTeam(team, devTeamFunctionDefinitions)).toContainEqual(
			expect.objectContaining({
				code: "team.data.not-applicable-with-people",
				severity: "blocking",
			}),
		);
	});

	it("uses the current custom Function name for restricted-role safety", () => {
		const functionId = toTeamFunctionId("renamed-restricted-function");
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [
				{
					function: {
						kind: "custom",
						functionId,
						displayName: "QCI-EE-Owner",
					},
					applicability: "applicable",
					assignments: [
						{
							assignmentId: toPersonAssignmentId("renamed-owner-one"),
							role: "owner",
							functionText: "Original Custom Lab",
							name: "Synthetic Owner One",
							email: "renamed.one@example.test",
						},
						{
							assignmentId: toPersonAssignmentId("renamed-owner-two"),
							role: "owner",
							functionText: "Original Custom Lab",
							name: "Synthetic Owner Two",
							email: "renamed.two@example.test",
						},
					],
				},
			],
			appliedTemplate: null,
		};

		expect(validateProjectTeam(team, devTeamFunctionDefinitions)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "team.data.restricted-role-multiple",
					severity: "blocking",
				}),
			]),
		);
	});

	it("does not retain a restricted classification after a custom Function rename", () => {
		const functionRef = {
			kind: "custom" as const,
			functionId: toTeamFunctionId("renamed-away-function"),
			displayName: "Current Custom Lab",
		};
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [
				{
					function: functionRef,
					applicability: "applicable",
					assignments: [
						{
							assignmentId: toPersonAssignmentId("renamed-away-owner"),
							role: "owner",
							functionText: "QCI-EE-Owner",
							name: "Synthetic Renamed Owner",
							email: "renamed.away@example.test",
						},
					],
				},
			],
			appliedTemplate: null,
		};

		expect(validateProjectTeam(team, devTeamFunctionDefinitions)).toContainEqual(
			expect.objectContaining({
				code: "team.data.restricted-role-missing",
				target: expect.objectContaining({ entityId: "qciEeOwner" }),
			}),
		);
	});

	it("blocks a current Acer near match in a preserved row", () => {
		const functionRef = {
			kind: "custom" as const,
			functionId: toTeamFunctionId("acer-near-match-function"),
			displayName: "Acer-PM",
		};
		const team: ProjectTeam = {
			projectRoles: {
				qciPm: null,
				qciPjm: null,
				acerPm: {
					assignmentId: toPersonAssignmentId("canonical-acer-pm"),
					name: "Synthetic Acer PM",
					email: "acer.pm@example.test",
				},
			},
			functions: [
				{
					function: functionRef,
					applicability: "applicable",
					assignments: [],
				},
			],
			preservedUnclassifiedEntries: [
				{
					entryId: toPersonAssignmentId("acer-near-match-row"),
					function: functionRef,
					functionText: "Original Custom Lab",
					roleText: "unclear",
					name: "Synthetic Possible Acer PM",
					email: "possible.acer@example.test",
					extraCells: [],
					sourceRows: [],
					restrictedRoleExclusion: {
						functionText: "Original Custom Lab",
						roleText: "unclear",
					},
				},
			],
			appliedTemplate: null,
		};

		expect(validateProjectTeam(team, devTeamFunctionDefinitions)).toContainEqual(
			expect.objectContaining({
				code: "team.data.restricted-role-ambiguous",
				severity: "blocking",
				target: expect.objectContaining({ entityId: "acer-near-match-row" }),
			}),
		);
	});

	it("advises on a losslessly preserved nonrestricted same-email field conflict", () => {
		const extraCell = {
			columnIndex: 4,
			headerText: "Tel. No.",
			rawType: "s",
			rawValue: "100",
			formattedText: "100",
			hidden: true,
		};
		const functionRef = {
			kind: "custom" as const,
			functionId: toTeamFunctionId("qcmc-ee-iqc-function"),
			displayName: "QCMC-EE IQC-Owner",
		};
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [
				{
					function: functionRef,
					applicability: "applicable",
					assignments: [
						{
							assignmentId: toPersonAssignmentId("qcmc-conflict-one"),
							role: "owner",
							name: "Synthetic Conflict Person",
							email: "qcmc.conflict@example.test",
							extraCells: [extraCell],
						},
						{
							assignmentId: toPersonAssignmentId("qcmc-conflict-two"),
							role: "owner",
							name: "Synthetic Conflict Person",
							email: "qcmc.conflict@example.test",
							extraCells: [
								{ ...extraCell, rawValue: "200", formattedText: "200" },
							],
						},
					],
				},
			],
			appliedTemplate: null,
		};

		expect(validateProjectTeam(team, devTeamFunctionDefinitions)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "team.data.identity-conflict",
					severity: "advisory",
					target: expect.objectContaining({ entityId: "qcmc-conflict-one" }),
				}),
				expect.objectContaining({
					code: "team.data.identity-conflict",
					severity: "advisory",
					target: expect.objectContaining({ entityId: "qcmc-conflict-two" }),
				}),
			]),
		);
	});
});

describe("restricted Team role counting", () => {
	const restrictedKeys = [
		"qciPm",
		"qciPjm",
		"acerPm",
		"qciMeOwner",
		"qciEeOwner",
		"qciThermalOwner",
		"qciBiosOwner",
	] as const;
	const row = (
		rowId: string,
		key: RestrictedCountRow["key"],
		patch: Partial<RestrictedCountRow> = {},
	): RestrictedCountRow => ({
		rowId,
		functionText: key ?? "QCI PM Owner",
		roleText: key === null ? "unclear" : "owner",
		key,
		possibleRestricted: key === null,
		name: `Synthetic ${rowId}`,
		normalizedEmail: `${rowId}@example.test`,
		extraCells: [],
		sourceRows: [],
		...patch,
	});

	it.each(restrictedKeys)("applies 0/1/2 distinct-person rules to %s", (key) => {
		const missing = validateRestrictedRoleRows([]).filter(
			(issue) => issue.target.entityId === key,
		);
		const oneRow = row(`${key}-one`, key);
		const one = validateRestrictedRoleRows([oneRow]);
		const twoRows = [row(`${key}-one`, key), row(`${key}-two`, key)];
		const two = validateRestrictedRoleRows(twoRows);

		expect(missing).toEqual([
			expect.objectContaining({
				code: "team.data.restricted-role-missing",
				severity: "advisory",
			}),
		]);
		expect(one).not.toContainEqual(
			expect.objectContaining({
				code: "team.data.restricted-role-missing",
				target: expect.objectContaining({ entityId: key }),
			}),
		);
		expect(one).not.toContainEqual(
			expect.objectContaining({
				code: "team.data.restricted-role-multiple",
				target: expect.objectContaining({ entityId: oneRow.rowId }),
			}),
		);
		expect(
			one.filter(({ code }) => code === "team.data.restricted-role-missing"),
		).toHaveLength(6);
		expect(two).toEqual(
			expect.arrayContaining(
				twoRows.map(({ rowId }) =>
					expect.objectContaining({
						code: "team.data.restricted-role-multiple",
						severity: "blocking",
						target: expect.objectContaining({ entityId: rowId }),
					}),
				),
			),
		);
	});

	it("blocks a possible restricted-role ambiguity at its row", () => {
		expect(validateRestrictedRoleRows([row("ambiguous-row", null)])).toContainEqual(
			expect.objectContaining({
				code: "team.data.restricted-role-ambiguous",
				severity: "blocking",
				target: expect.objectContaining({ entityId: "ambiguous-row" }),
			}),
		);
	});

	it("blocks unresolved no-email restricted duplicates", () => {
		const rows = [
			row("blank-email-one", "qciMeOwner", {
				name: "Synthetic Same Name",
				normalizedEmail: null,
			}),
			row("blank-email-two", "qciMeOwner", {
				name: "Synthetic Same Name",
				normalizedEmail: null,
			}),
		];

		expect(validateRestrictedRoleRows(rows)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "team.data.restricted-role-identity-unresolved",
					severity: "blocking",
				}),
			]),
		);
	});

	it("does not count identical sourced duplicates twice and preserves their evidence", () => {
		const shared = {
			functionText: "QCI-ME-Owner",
			roleText: "owner",
			key: "qciMeOwner" as const,
			possibleRestricted: false,
			name: "Synthetic Exact Person",
			normalizedEmail: "exact.person@example.test",
			extraCells: [
				{
					columnIndex: 4,
					headerText: "Tel. No.",
					rawType: "n",
					rawValue: 123456,
					formattedText: "123456",
					hidden: true,
				},
			],
		};
		const rows: readonly RestrictedCountRow[] = [
			{
				...shared,
				rowId: "source-one",
				sourceRows: [{ fileName: "one.xlsx", sheetName: "Roster", rowNumber: 4, cells: [] }],
			},
			{
				...shared,
				rowId: "source-two",
				sourceRows: [{ fileName: "two.xlsx", sheetName: "Roster", rowNumber: 9, cells: [] }],
			},
		];

		const issues = validateRestrictedRoleRows(rows);

		expect(issues).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: "team.data.restricted-role-multiple" }),
			]),
		);
		expect(rows.map(({ sourceRows }) => sourceRows[0]?.rowNumber)).toEqual([4, 9]);
	});

	it("keeps same-email rows distinct when current extra cell values conflict", () => {
		const base = row("conflict-one", "qciEeOwner", {
			name: "Synthetic Conflict Person",
			normalizedEmail: "conflict@example.test",
			extraCells: [
				{
					columnIndex: 4,
					headerText: "Tel. No.",
					rawType: "s",
					rawValue: "100",
					formattedText: "100",
					hidden: true,
				},
			],
		});
		const conflict = {
			...base,
			rowId: "conflict-two",
			extraCells: [{ ...base.extraCells[0]!, rawValue: "200", formattedText: "200" }],
		};

		expect(validateRestrictedRoleRows([base, conflict])).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "team.data.restricted-role-multiple",
					severity: "blocking",
				}),
			]),
		);
	});
});

describe("exact duplicate Member normalization", () => {
	it("deduplicates only an exact Member record within its Function", () => {
		const exactMember = {
			assignmentId: toPersonAssignmentId("exact-member-record"),
			role: "member" as const,
			name: "DEV Exact Member",
			email: "exact.member@example.test",
		};
		const samePersonDifferentAssignment = {
			...exactMember,
			assignmentId: toPersonAssignmentId("different-member-record"),
		};
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [
				{
					function: {
						kind: "custom",
						functionId: toTeamFunctionId("exact-member-function"),
						displayName: "DEV Exact Member Function",
					},
					applicability: "applicable",
					assignments: [
						{
							assignmentId: toPersonAssignmentId("exact-member-owner"),
							role: "owner",
							name: "DEV Owner",
							email: "owner@example.test",
						},
						exactMember,
						exactMember,
						samePersonDifferentAssignment,
					],
				},
			],
			appliedTemplate: null,
		};

		const normalized = deduplicateExactMemberAssignments(team);

		expect(normalized).not.toBe(team);
		expect(normalized.functions[0]?.assignments).toEqual([
			team.functions[0]?.assignments[0],
			exactMember,
			samePersonDifferentAssignment,
		]);
		expect(team.functions[0]?.assignments).toHaveLength(4);
		expect(
			validateProjectTeam(normalized, devTeamFunctionDefinitions).filter((issue) => issue.severity === "blocking"),
		).toEqual([]);
	});

	it("does not deduplicate equal people across different roles", () => {
		const assignmentId = toPersonAssignmentId("multi-role-record");
		const shared = {
			assignmentId,
			name: "DEV Multi Role",
			email: "multi.role@example.test",
		};
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [
				{
					function: {
						kind: "standard",
						functionId: devMeTeamFunctionDefinition.id,
					},
					applicability: "applicable",
					assignments: [
						{ ...shared, role: "leader" },
						{ ...shared, role: "owner" },
						{ ...shared, role: "member" },
					],
				},
			],
			appliedTemplate: null,
		};

		expect(deduplicateExactMemberAssignments(team).functions[0]?.assignments).toHaveLength(
			3,
		);
	});
});


describe("Slice 4 canonical Function identity validation", () => {
	it("classifies a standard Function from its current definition instead of historical evidence", () => {
		const functionId = toTeamFunctionId("current-definition-function");
		const definition = { id: functionId, displayName: "Synthetic Neutral-Member", active: true } as const;
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [{
				function: { kind: "standard", functionId },
				applicability: "applicable",
				assignments: [{
					assignmentId: toPersonAssignmentId("historical-restricted-label"),
					role: "member",
					functionText: "QCI-EE-Owner",
					name: "Synthetic Member",
					email: "member@example.test",
				}],
			}],
			appliedTemplate: null,
		};

		const issues = validateProjectTeam(team, [definition]);
		expect(issues).toContainEqual(expect.objectContaining({
			code: "team.data.restricted-role-missing",
			target: expect.objectContaining({ entityId: "qciEeOwner" }),
		}));
		expect(issues).not.toContainEqual(expect.objectContaining({
			code: "team.data.restricted-role-multiple",
			target: expect.objectContaining({ entityId: "historical-restricted-label" }),
		}));
	});

	it("blocks missing and duplicate standard definitions including zero-person N/A Functions", () => {
		const functionId = toTeamFunctionId("zero-person-standard");
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [{
				function: { kind: "standard", functionId },
				applicability: "notApplicable",
				assignments: [],
			}],
			appliedTemplate: null,
		};
		const definition = { id: functionId, displayName: "Synthetic Standard", active: true } as const;

		expect(validateProjectTeam(team, [])).toContainEqual(expect.objectContaining({
			code: "team.data.standard-function-definition-missing",
			severity: "blocking",
			target: expect.objectContaining({ entityId: functionId }),
		}));
		expect(validateProjectTeam(team, [definition, { ...definition }])).toContainEqual(expect.objectContaining({
			code: "team.data.standard-function-definition-duplicate",
			severity: "blocking",
			target: expect.objectContaining({ entityId: functionId }),
		}));
	});

	it("blocks standard-custom ID collisions and inconsistent custom identities", () => {
		const collidingId = toTeamFunctionId("colliding-function-id");
		const customId = toTeamFunctionId("inconsistent-custom-id");
		const definition = { id: collidingId, displayName: "Synthetic Standard", active: true } as const;
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [
				{ function: { kind: "standard", functionId: collidingId }, applicability: "notApplicable", assignments: [] },
				{ function: { kind: "custom", functionId: collidingId, displayName: "Synthetic Collision" }, applicability: "notApplicable", assignments: [] },
				{ function: { kind: "custom", functionId: customId, displayName: "Synthetic First" }, applicability: "notApplicable", assignments: [] },
				{ function: { kind: "custom", functionId: customId, displayName: "Synthetic Second" }, applicability: "notApplicable", assignments: [] },
			],
			appliedTemplate: null,
		};

		const issues = validateProjectTeam(team, [definition]);
		expect(issues.filter(({ code }) => code === "team.data.function-identity-conflict")).toHaveLength(3);
		expect(issues.every((issue) => issue.code !== "team.data.function-id-repaired")).toBe(true);
	});

	it("includes preserved custom references in Function identity validation", () => {
		const collidingId = toTeamFunctionId("preserved-standard-custom-collision");
		const inconsistentId = toTeamFunctionId("preserved-inconsistent-custom");
		const definition = { id: collidingId, displayName: "Synthetic Standard", active: true } as const;
		const preserved = (
			entryId: string,
			functionId: ReturnType<typeof toTeamFunctionId>,
			displayName: string,
		) => ({
			entryId: toPersonAssignmentId(entryId),
			function: { kind: "custom" as const, functionId, displayName },
			functionText: displayName,
			roleText: "Coordinator",
			name: "Synthetic Preserved",
			email: "preserved@example.test",
			extraCells: [],
			sourceRows: [],
			restrictedRoleExclusion: null,
		});
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [
				{ function: { kind: "standard", functionId: collidingId }, applicability: "notApplicable", assignments: [] },
				{ function: { kind: "custom", functionId: inconsistentId, displayName: "Synthetic First" }, applicability: "notApplicable", assignments: [] },
			],
			preservedUnclassifiedEntries: [
				preserved("preserved-collision", collidingId, "Synthetic Collision"),
				preserved("preserved-inconsistent", inconsistentId, "Synthetic Second"),
			],
			appliedTemplate: null,
		};

		const issues = validateProjectTeam(team, [definition]);
		expect(issues.filter(({ code }) => code === "team.data.function-identity-conflict")).toHaveLength(3);
	});

	it("does not mutate the supplied standard definitions", () => {
		const functionId = toTeamFunctionId("immutable-definition");
		const definition = Object.freeze({ id: functionId, displayName: "Synthetic Immutable-Member", active: true });
		const definitions = Object.freeze([definition]);
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [{ function: { kind: "standard", functionId }, applicability: "notApplicable", assignments: [] }],
			appliedTemplate: null,
		};

		validateProjectTeam(team, definitions);
		expect(definitions).toEqual([definition]);
		expect(Object.isFrozen(definitions)).toBe(true);
		expect(Object.isFrozen(definition)).toBe(true);
	});
});
