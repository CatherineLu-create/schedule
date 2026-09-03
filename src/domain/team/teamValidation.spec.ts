import { describe, expect, it } from "vitest";

import { devProject005 } from "../../fixtures/v2/canonicalProjectFixtures";
import {
	applicableWithoutOwnerTeamCandidate,
	missingEmailTeamCandidate,
	multipleLeaderTeamCandidate,
	multipleOwnerTeamCandidate,
	notApplicableWithPeopleTeamCandidate,
} from "../../fixtures/v2/teamCandidateFixtures";
import {
	devMeTeamFunctionDefinition,
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
	type TeamImportProblem,
} from "./teamValidation";

function summaries(team: ProjectTeam) {
	return validateProjectTeam(team).map(({ code, source, severity }) => ({
		code,
		source,
		severity,
	}));
}

describe("Project Team validation", () => {
	it("classifies multiple Owners in one Function as Blocking Data", () => {
		expect(summaries(multipleOwnerTeamCandidate)).toContainEqual({
			code: "team.data.multiple-owners",
			source: "data",
			severity: "blocking",
		});
	});

	it("classifies multiple Leaders in one Function as Blocking Data", () => {
		expect(summaries(multipleLeaderTeamCandidate)).toContainEqual({
			code: "team.data.multiple-leaders",
			source: "data",
			severity: "blocking",
		});
	});

	it("classifies Not Applicable with people as Blocking Data", () => {
		expect(summaries(notApplicableWithPeopleTeamCandidate)).toContainEqual({
			code: "team.data.not-applicable-with-people",
			source: "data",
			severity: "blocking",
		});
	});

	it("classifies an Applicable Function without an Owner as Advisory Data", () => {
		expect(summaries(applicableWithoutOwnerTeamCandidate)).toContainEqual({
			code: "team.data.missing-owner",
			source: "data",
			severity: "advisory",
		});
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

		expect(summaries(team)).toEqual([
			{
				code: "team.data.pending-applicability",
				source: "data",
				severity: "advisory",
			},
		]);
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

		expect(validateProjectTeam(team)).toEqual([]);
	});

	it("returns only Advisories for canonical Project 005", () => {
		expect(devProject005.team).not.toBeNull();
		const issues = validateProjectTeam(devProject005.team!);

		expect(issues).toContainEqual(
			expect.objectContaining({
				code: "team.data.missing-owner",
				severity: "advisory",
			}),
		);
		expect(issues.every((issue) => issue.severity === "advisory")).toBe(true);
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
		expect(validateProjectTeam(normalized)).toEqual([]);
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
