import { describe, expect, it } from "vitest";

import {
	devProject002,
	devProject005,
} from "../../fixtures/v2/canonicalProjectFixtures";
import { teamFunctionCatalog } from "../../config/v2/referenceData";
import {
	applicableWithoutOwnerTeamCandidate,
	missingEmailTeamCandidate,
	multipleRestrictedOwnerTeamCandidate,
} from "../../fixtures/v2/teamCandidateFixtures";
import {
	devMeTeamFunctionDefinition,
	devTeamFunctionDefinitions,
	devTeamTemplateV1,
	devTeamTemplateV2,
} from "../../fixtures/v2/teamTemplateFixtures";
import {
	toPersonAssignmentId,
	toTeamFunctionId,
} from "../../domain/shared/ids";
import type { ProjectTeam } from "../../domain/team/team";
import type { TeamFunctionDefinition } from "../../domain/team/teamTemplate";
import { createEditCandidate } from "../teamImport/teamCandidate";
import { saveProjectTeam } from "./teamCommands";

function saveTeam(
	project: typeof devProject002,
	team: ProjectTeam,
	standardFunctionDefinitions: readonly TeamFunctionDefinition[] = devTeamFunctionDefinitions,
) {
	return saveProjectTeam(project, {
		candidate: createEditCandidate(project.id, team, standardFunctionDefinitions),
		standardFunctionDefinitions,
	});
}

describe("Team Save command", () => {
	it("does not save a custom Function whose name is an N/A applicability marker", () => {
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [{
				function: { kind: "custom", functionId: toTeamFunctionId("invalid-na-function"), displayName: "N/A" },
				applicability: "applicable",
				assignments: [{
					assignmentId: toPersonAssignmentId("invalid-na-person"),
					role: "owner",
					functionText: "N/A-Owner",
					name: "Invalid NA Person",
					email: "invalid.na@example.test",
				}],
			}],
			preservedUnclassifiedEntries: [],
			appliedTemplate: null,
		};

		const result = saveTeam(devProject002, team, teamFunctionCatalog);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues).toContainEqual(expect.objectContaining({
			code: "team.data.invalid-applicability-function-label",
			severity: "blocking",
		}));
		expect(result).not.toHaveProperty("project");
	});

	it("does not save an exact N/A member identity", () => {
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [{
				function: { kind: "custom", functionId: toTeamFunctionId("valid-support-function"), displayName: "Synthetic Support" },
				applicability: "applicable",
				assignments: [{
					assignmentId: toPersonAssignmentId("invalid-na-member"),
					role: "member",
					functionText: "Synthetic Support-Member",
					name: " n/A ",
					email: "invalid.member@example.test",
					extraCells: [{
						columnIndex: 4,
						headerText: "Tel. No.",
						rawType: "s",
						rawValue: "24680",
						formattedText: "24680",
						hidden: false,
					}],
				}],
			}],
			preservedUnclassifiedEntries: [],
			appliedTemplate: null,
		};

		const result = saveTeam(devProject002, team, teamFunctionCatalog);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues).toContainEqual(expect.objectContaining({
			code: "team.data.invalid-applicability-member-name",
			severity: "blocking",
		}));
		expect(result).not.toHaveProperty("project");
	});

	it("blocks an ambiguous QCI Owner even when all seven restricted roles are otherwise valid", () => {
		const team: ProjectTeam = {
			projectRoles: {
				qciPm: { assignmentId: toPersonAssignmentId("valid-qci-pm"), name: "Valid QCI PM", email: "qci.pm@example.test" },
				qciPjm: { assignmentId: toPersonAssignmentId("valid-qci-pjm"), name: "Valid QCI PjM", email: "qci.pjm@example.test" },
				acerPm: { assignmentId: toPersonAssignmentId("valid-acer-pm"), name: "Valid Acer PM", email: "acer.pm@example.test" },
			},
			functions: teamFunctionCatalog.map((definition, index) => ({
				function: { kind: "standard" as const, functionId: definition.id },
				applicability: "applicable" as const,
				assignments: [{
					assignmentId: toPersonAssignmentId(`valid-owner-${index}`),
					role: "owner" as const,
					name: `Valid Owner ${index}`,
					email: `valid.owner.${index}@example.test`,
				}],
			})),
			preservedUnclassifiedEntries: [{
				entryId: toPersonAssignmentId("ambiguous-qci-owner"),
				function: { kind: "custom", functionId: toTeamFunctionId("ambiguous-qci-function"), displayName: "QCI PM Owner" },
				functionText: "QCI PM Owner",
				roleText: "unclear",
				name: "Ambiguous Owner",
				email: "ambiguous@example.test",
				extraCells: [],
				sourceRows: [],
				restrictedRoleExclusion: null,
			}],
			appliedTemplate: null,
		};

		const result = saveTeam(devProject002, team, teamFunctionCatalog);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues).toContainEqual(expect.objectContaining({
			code: "team.data.restricted-role-ambiguous",
			severity: "blocking",
		}));
		expect(result).not.toHaveProperty("project");
	});

	it("blocks no-email restricted duplicate identity while missing Email remains advisory", () => {
		const qciMe = teamFunctionCatalog[0]!;
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [{
				function: { kind: "standard", functionId: qciMe.id },
				applicability: "applicable",
				assignments: [
					{ assignmentId: toPersonAssignmentId("blank-email-one"), role: "owner", name: "Same Unknown", email: null },
					{ assignmentId: toPersonAssignmentId("blank-email-two"), role: "owner", name: "Same Unknown", email: null },
				],
			}],
			preservedUnclassifiedEntries: [],
			appliedTemplate: null,
		};

		const result = saveTeam(devProject002, team, teamFunctionCatalog);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues).toContainEqual(expect.objectContaining({
			code: "team.data.restricted-role-identity-unresolved",
			severity: "blocking",
		}));
		expect(result.issues.filter(({ code }) => code === "team.data.missing-email"))
			.toEqual(expect.arrayContaining([expect.objectContaining({ severity: "advisory" })]));
		expect(result).not.toHaveProperty("project");
	});

	it("blocks two canonical QCI-ME owner assignments without a raw Excel label", () => {
		const qciMe = teamFunctionCatalog[0]!;
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [{
				function: { kind: "standard", functionId: qciMe.id },
				applicability: "applicable",
				assignments: [
					{
						assignmentId: toPersonAssignmentId("canonical-qci-me-owner-one"),
						role: "owner",
						name: "Synthetic Owner One",
						email: "owner.one@example.test",
					},
					{
						assignmentId: toPersonAssignmentId("canonical-qci-me-owner-two"),
						role: "owner",
						name: "Synthetic Owner Two",
						email: "owner.two@example.test",
					},
				],
			}],
			preservedUnclassifiedEntries: [],
			appliedTemplate: null,
		};

		const result = saveTeam(devProject002, team, teamFunctionCatalog);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues).toContainEqual(expect.objectContaining({
			code: "team.data.restricted-role-multiple",
			severity: "blocking",
		}));
		expect(result).not.toHaveProperty("project");
	});

	it("rejects a Team containing Blocking issues", () => {
		const restrictedDefinitions = devTeamFunctionDefinitions.map((definition) =>
			definition.id === devMeTeamFunctionDefinition.id
				? { ...definition, displayName: "QCI-ME-Owner" }
				: definition,
		);
		const result = saveTeam(
			devProject002,
			multipleRestrictedOwnerTeamCandidate,
			restrictedDefinitions,
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe("validation");
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "team.data.restricted-role-multiple",
				severity: "blocking",
			}),
		);
		expect(devProject002.team).not.toBe(multipleRestrictedOwnerTeamCandidate);
	});

	it("allows multiple nonrestricted Owners without a count issue", () => {
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [{
				function: {
					kind: "custom",
					functionId: toTeamFunctionId("nonrestricted-multiple-owner"),
					displayName: "Synthetic Support",
				},
				applicability: "applicable",
				assignments: [
					{
						assignmentId: toPersonAssignmentId("nonrestricted-owner-one"),
						role: "owner",
						name: "Synthetic Owner One",
						email: "nonrestricted.one@example.test",
					},
					{
						assignmentId: toPersonAssignmentId("nonrestricted-owner-two"),
						role: "owner",
						name: "Synthetic Owner Two",
						email: "nonrestricted.two@example.test",
					},
				],
			}],
			preservedUnclassifiedEntries: [],
			appliedTemplate: null,
		};
		const result = saveTeam(devProject002, team);

		expect(result.ok).toBe(true);
		expect(result.issues).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: "team.data.multiple-owners" }),
			]),
		);
	});

	it("allows an Advisory-only Team and preserves Project identity, Master, and aliases", () => {
		const result = saveTeam(devProject002, applicableWithoutOwnerTeamCandidate);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "team.data.restricted-role-missing",
				severity: "advisory",
			}),
		);
		expect(result.project.team).toEqual(expect.objectContaining({
			projectRoles: applicableWithoutOwnerTeamCandidate.projectRoles,
			appliedTemplate: applicableWithoutOwnerTeamCandidate.appliedTemplate,
		}));
		expect(result.project.id).toBe(devProject002.id);
		expect(result.project.master).toBe(devProject002.master);
		expect(result.project.identityAliases).toBe(devProject002.identityAliases);
	});

	it("keeps canonical Project 005 saveable with Advisory issues", () => {
		expect(devProject005.team).not.toBeNull();
		const result = saveProjectTeam(devProject005, {
			candidate: createEditCandidate(devProject005.id, devProject005.team, devTeamFunctionDefinitions),
			standardFunctionDefinitions: devTeamFunctionDefinitions,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.issues.length).toBeGreaterThan(0);
		expect(result.issues.every((issue) => issue.severity === "advisory")).toBe(
			true,
		);
	});

	it("folds exact Member rows while preserving every source row", () => {
		const existingTeam = devProject002.team;
		expect(existingTeam).not.toBeNull();
		const sourceFunction = existingTeam!.functions[0]!;
		const sourceCell = {
			columnIndex: 2,
			headerText: "Member",
			rawType: "s",
			rawValue: "DEV Exact Member",
			formattedText: "DEV Exact Member",
			hidden: false,
		};
		const duplicateMember = {
			assignmentId: toPersonAssignmentId("team-save-exact-member"),
			role: "member" as const,
			name: "DEV Exact Member",
			email: "exact.member@example.test",
			sourceRows: [{
				fileName: "synthetic.xlsx",
				sheetName: "Roster",
				rowNumber: 2,
				cells: [sourceCell],
			}],
		};
		const secondDuplicateMember = {
			...duplicateMember,
			sourceRows: [{
				...duplicateMember.sourceRows[0],
				rowNumber: 9,
			}],
		};
		const team: ProjectTeam = {
			...existingTeam!,
			functions: [
				{
					...sourceFunction,
					assignments: [
						...sourceFunction.assignments,
						duplicateMember,
						secondDuplicateMember,
					],
				},
				...existingTeam!.functions.slice(1),
			],
		};

		const result = saveTeam(devProject002, team);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(
			result.project.team?.functions[0]?.assignments.filter(
				(assignment) => assignment.assignmentId === duplicateMember.assignmentId,
			),
		).toHaveLength(1);
		expect(
			result.project.team?.functions[0]?.assignments.find(
				(assignment) => assignment.assignmentId === duplicateMember.assignmentId,
			)?.sourceRows,
		).toEqual([
			expect.objectContaining({ rowNumber: 2 }),
			expect.objectContaining({ rowNumber: 9 }),
		]);
		expect(team.functions[0]?.assignments).toHaveLength(
			sourceFunction.assignments.length + 2,
		);
	});


	it("rejects a candidate owned by another Project without a replacement", () => {
		const candidate = createEditCandidate(
			devProject005.id,
			devProject005.team,
			devTeamFunctionDefinitions,
		);
		const result = saveProjectTeam(devProject002, {
			candidate,
			standardFunctionDefinitions: devTeamFunctionDefinitions,
		});

		expect(result).toMatchObject({ ok: false, reason: "validation" });
		if (result.ok) return;
		expect(result).not.toHaveProperty("project");
		expect(result.issues).toContainEqual(expect.objectContaining({
			code: "team.data.project-mismatch",
			severity: "blocking",
		}));
	});

	it("uses import rows as a whole replacement while preserving Function metadata and template", () => {
		const fullCandidate = createEditCandidate(
			devProject002.id,
			devProject002.team,
			devTeamFunctionDefinitions,
		);
		const retained = fullCandidate.rows.find(({ restrictedKey }) => restrictedKey === "qciPm")!;
		const candidate = {
			...fullCandidate,
			origin: "import" as const,
			fileName: "synthetic.xlsx",
			rows: [retained],
		};
		const result = saveProjectTeam(devProject002, {
			candidate,
			standardFunctionDefinitions: devTeamFunctionDefinitions,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.project.team?.projectRoles.qciPm?.assignmentId).toBe(
			retained.assignmentId,
		);
		expect(result.project.team?.projectRoles.qciPjm).toBeNull();
		expect(result.project.team?.projectRoles.acerPm).toBeNull();
		expect(result.project.team?.functions.every(({ assignments }) => assignments.length === 0)).toBe(true);
		expect(result.project.team?.functions.map(({ function: value }) => value.functionId)).toEqual(
			devProject002.team?.functions.map(({ function: value }) => value.functionId),
		);
		expect(result.project.team?.appliedTemplate).toBe(devProject002.team?.appliedTemplate);
	});

	it("does not auto-force an old saved Team onto the latest Template", () => {
		const oldTemplateTeam: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: devTeamTemplateV1.functions.map(({ functionId }) => ({
				function: { kind: "standard", functionId },
				applicability: "notApplicable",
				assignments: [],
			})),
			appliedTemplate: {
				templateId: devTeamTemplateV1.id,
				versionNumber: devTeamTemplateV1.versionNumber,
			},
		};

		const result = saveTeam(devProject002, oldTemplateTeam);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.project.team?.appliedTemplate?.versionNumber).toBe(1);
		expect(result.project.team?.functions.map(({ function: value }) => value.functionId)).toEqual(
			devTeamTemplateV1.functions.map(({ functionId }) => functionId),
		);
		expect(result.project.team?.functions).toHaveLength(2);
		expect(devTeamTemplateV2.functions).toHaveLength(4);
	});

	it("preserves identical Member records when they belong to different Functions", () => {
		const member = {
			assignmentId: toPersonAssignmentId("cross-function-member-record"),
			role: "member" as const,
			name: "DEV Cross Function Member",
			email: "cross.function@example.test",
		};
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [
				{
					function: {
						kind: "standard",
						functionId: devMeTeamFunctionDefinition.id,
					},
					applicability: "notApplicable",
					assignments: [],
				},
				{
					function: {
						kind: "custom",
						functionId: toTeamFunctionId("cross-function-a"),
						displayName: "DEV Function A",
					},
					applicability: "applicable",
					assignments: [
						{
							assignmentId: toPersonAssignmentId("cross-function-owner-a"),
							role: "owner",
							name: "DEV Owner A",
							email: "owner.a@example.test",
						},
						member,
					],
				},
				{
					function: {
						kind: "custom",
						functionId: toTeamFunctionId("cross-function-b"),
						displayName: "DEV Function B",
					},
					applicability: "applicable",
					assignments: [
						{
							assignmentId: toPersonAssignmentId("cross-function-owner-b"),
							role: "owner",
							name: "DEV Owner B",
							email: "owner.b@example.test",
						},
						member,
					],
				},
			],
			appliedTemplate: null,
		};

		const result = saveTeam(devProject002, team);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(
			result.project.team?.functions.flatMap((value) => value.assignments).filter(
				(assignment) => assignment.assignmentId === member.assignmentId,
			),
		).toHaveLength(2);
	});

	it("returns one local-row missing-email issue when canonical IDs repeat across Functions", () => {
		const sharedAssignmentId = toPersonAssignmentId("shared-diagnostic-assignment");
		const firstFunctionId = toTeamFunctionId("diagnostic-function-a");
		const secondFunctionId = toTeamFunctionId("diagnostic-function-b");
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [
				{
					function: { kind: "custom", functionId: firstFunctionId, displayName: "Diagnostic A-Member" },
					applicability: "applicable",
					assignments: [{ assignmentId: sharedAssignmentId, role: "member", name: "Synthetic Missing", email: null }],
				},
				{
					function: { kind: "custom", functionId: secondFunctionId, displayName: "Diagnostic B-Member" },
					applicability: "applicable",
					assignments: [{ assignmentId: sharedAssignmentId, role: "member", name: "Synthetic Present", email: "present@example.test" }],
				},
			],
			preservedUnclassifiedEntries: [],
			appliedTemplate: null,
		};
		const candidate = createEditCandidate(devProject002.id, team, []);
		const missingRow = candidate.rows[0]!;
		const result = saveProjectTeam(devProject002, {
			candidate,
			standardFunctionDefinitions: [],
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const missingEmailIssues = result.issues.filter(({ code }) => code === "team.data.missing-email");
		expect(missingEmailIssues).toHaveLength(1);
		expect(missingEmailIssues[0]?.target).toMatchObject({
			entityId: missingRow.rowId,
			field: "email",
		});
	});

	it("returns same-email identity conflicts against candidate-local row IDs", () => {
		const functionId = toTeamFunctionId("diagnostic-conflict-function");
		const team: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [{
				function: { kind: "custom", functionId, displayName: "Diagnostic Conflict-Member" },
				applicability: "applicable",
				assignments: [
					{ assignmentId: toPersonAssignmentId("diagnostic-conflict-one"), role: "member", name: "Synthetic One", email: "conflict@example.test" },
					{ assignmentId: toPersonAssignmentId("diagnostic-conflict-two"), role: "member", name: "Synthetic Two", email: "conflict@example.test" },
				],
			}],
			preservedUnclassifiedEntries: [],
			appliedTemplate: null,
		};
		const candidate = createEditCandidate(devProject002.id, team, []);
		const result = saveProjectTeam(devProject002, {
			candidate,
			standardFunctionDefinitions: [],
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const conflictTargets = result.issues
			.filter(({ code }) => code === "team.data.identity-conflict")
			.map(({ target }) => target.entityId);
		expect(conflictTargets).toEqual(candidate.rows.map(({ rowId }) => rowId));
	});

	it("returns a Project Role missing-email Advisory without blocking Save", () => {
		const team: ProjectTeam = {
			...missingEmailTeamCandidate,
			projectRoles: {
				qciPm: {
					assignmentId: toPersonAssignmentId("project-role-missing-email"),
					name: "DEV Role Missing Email",
					email: "   ",
				},
				qciPjm: null,
				acerPm: null,
			},
		};

		const result = saveTeam(devProject002, team);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(
			result.issues.filter((issue) => issue.code === "team.data.missing-email"),
		).toHaveLength(2);
	});
});
