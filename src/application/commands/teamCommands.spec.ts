import { describe, expect, it } from "vitest";

import {
	devProject002,
	devProject005,
} from "../../fixtures/v2/canonicalProjectFixtures";
import {
	applicableWithoutOwnerTeamCandidate,
	missingEmailTeamCandidate,
	multipleOwnerTeamCandidate,
} from "../../fixtures/v2/teamCandidateFixtures";
import {
	devMeTeamFunctionDefinition,
	devTeamTemplateV1,
	devTeamTemplateV2,
} from "../../fixtures/v2/teamTemplateFixtures";
import {
	toPersonAssignmentId,
	toTeamFunctionId,
} from "../../domain/shared/ids";
import type { ProjectTeam } from "../../domain/team/team";
import { saveProjectTeam } from "./teamCommands";

describe("Team Save command", () => {
	it("rejects a Team containing Blocking issues", () => {
		const result = saveProjectTeam(devProject002, {
			team: multipleOwnerTeamCandidate,
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe("validation");
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "team.data.multiple-owners",
				severity: "blocking",
			}),
		);
		expect(devProject002.team).not.toBe(multipleOwnerTeamCandidate);
	});

	it("allows an Advisory-only Team and preserves Master and Schedule", () => {
		const result = saveProjectTeam(devProject002, {
			team: applicableWithoutOwnerTeamCandidate,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "team.data.missing-owner",
				severity: "advisory",
			}),
		);
		expect(result.project.team).toBe(applicableWithoutOwnerTeamCandidate);
		expect(result.project.master).toBe(devProject002.master);
		expect(result.project.schedule).toBe(devProject002.schedule);
	});

	it("keeps canonical Project 005 saveable with Advisory issues", () => {
		expect(devProject005.team).not.toBeNull();
		const result = saveProjectTeam(devProject005, {
			team: devProject005.team!,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.issues.length).toBeGreaterThan(0);
		expect(result.issues.every((issue) => issue.severity === "advisory")).toBe(
			true,
		);
	});

	it("deduplicates exact Member records before saving without merging roles", () => {
		const existingTeam = devProject002.team;
		expect(existingTeam).not.toBeNull();
		const sourceFunction = existingTeam!.functions[0]!;
		const duplicateMember = {
			assignmentId: toPersonAssignmentId("team-save-exact-member"),
			role: "member" as const,
			name: "DEV Exact Member",
			email: "exact.member@example.test",
		};
		const team: ProjectTeam = {
			...existingTeam!,
			functions: [
				{
					...sourceFunction,
					assignments: [
						...sourceFunction.assignments,
						duplicateMember,
						duplicateMember,
					],
				},
				...existingTeam!.functions.slice(1),
			],
		};

		const result = saveProjectTeam(devProject002, { team });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(
			result.project.team?.functions[0]?.assignments.filter(
				(assignment) => assignment.assignmentId === duplicateMember.assignmentId,
			),
		).toHaveLength(1);
		expect(team.functions[0]?.assignments).toHaveLength(
			sourceFunction.assignments.length + 2,
		);
	});

	it("rejects an unassigned imported person but allows an unknown Function Advisory", () => {
		const blocking = saveProjectTeam(devProject002, {
			team: applicableWithoutOwnerTeamCandidate,
			importProblems: [
				{
					kind: "unassignedPerson",
					entityId: "team-import-row-unassigned",
					message: "Imported person cannot be assigned to a Function.",
				},
			],
		});
		const advisory = saveProjectTeam(devProject002, {
			team: {
				...applicableWithoutOwnerTeamCandidate,
				functions: [
					{
						function: {
							kind: "custom",
							functionId: toTeamFunctionId("imported-custom-function"),
							displayName: "DEV Imported Custom",
						},
						applicability: "notApplicable",
						assignments: [],
					},
				],
			},
			importProblems: [
				{
					kind: "unknownFunction",
					entityId: "imported-custom-function",
					message: "Unknown imported Function is preserved as custom.",
				},
			],
		});

		expect(blocking.ok).toBe(false);
		expect(advisory.ok).toBe(true);
		if (!advisory.ok) return;
		expect(advisory.issues).toContainEqual(
			expect.objectContaining({
				code: "team.import.unknown-function",
				severity: "advisory",
			}),
		);
		expect(advisory.project.team?.functions[0]?.function.kind).toBe("custom");
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

		const result = saveProjectTeam(devProject002, { team: oldTemplateTeam });

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

		const result = saveProjectTeam(devProject002, { team });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(
			result.project.team?.functions.flatMap((value) => value.assignments).filter(
				(assignment) => assignment.assignmentId === member.assignmentId,
			),
		).toHaveLength(2);
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

		const result = saveProjectTeam(devProject002, { team });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(
			result.issues.filter((issue) => issue.code === "team.data.missing-email"),
		).toHaveLength(2);
	});
});
