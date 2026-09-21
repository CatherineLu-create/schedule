import { describe, expect, expectTypeOf, it } from "vitest";
import type { ProjectTeam } from "../../domain/team/team";
import {
	applicableWithoutOwnerTeamCandidate,
	missingEmailTeamCandidate,
	multipleLeaderTeamCandidate,
	multipleOwnerTeamCandidate,
	multipleRestrictedOwnerTeamCandidate,
	notApplicableWithPeopleTeamCandidate,
} from "./teamCandidateFixtures";

describe("Team validation candidate fixtures", () => {
	it("represents two Owners in one applicable Function", () => {
		const [functionTeam] = multipleOwnerTeamCandidate.functions;

		expect(functionTeam?.applicability).toBe("applicable");
		expect(
			functionTeam?.assignments.filter(({ role }) => role === "owner"),
		).toHaveLength(2);
	});

	it("represents two exact restricted-role Owners with source labels", () => {
		const [functionTeam] = multipleRestrictedOwnerTeamCandidate.functions;

		expect(functionTeam?.assignments).toHaveLength(2);
		expect(
			functionTeam?.assignments.map(({ functionText }) => functionText),
		).toEqual(["QCI-ME-Owner", "QCI-ME-Owner"]);
	});

	it("represents two Leaders without introducing a missing-Owner condition", () => {
		const [functionTeam] = multipleLeaderTeamCandidate.functions;

		expect(
			functionTeam?.assignments.filter(({ role }) => role === "leader"),
		).toHaveLength(2);
		expect(
			functionTeam?.assignments.filter(({ role }) => role === "owner"),
		).toHaveLength(1);
	});

	it("represents a notApplicable Function that still has a person", () => {
		const [functionTeam] = notApplicableWithPeopleTeamCandidate.functions;

		expect(functionTeam?.applicability).toBe("notApplicable");
		expect(functionTeam?.assignments).toHaveLength(1);
	});

	it("represents an applicable Function with Leader and Member but no Owner", () => {
		const [functionTeam] = applicableWithoutOwnerTeamCandidate.functions;
		const roles = functionTeam?.assignments.map(({ role }) => role);

		expect(functionTeam?.applicability).toBe("applicable");
		expect(roles).toEqual(["leader", "member"]);
		expect(roles).not.toContain("owner");
	});

	it("represents a meaningful person name with a missing email", () => {
		const [functionTeam] = missingEmailTeamCandidate.functions;
		const [assignment] = functionTeam?.assignments ?? [];

		expect(assignment?.name).toBe("DEV Missing Email Owner");
		expect(assignment?.email).toBeNull();
		expectTypeOf(missingEmailTeamCandidate).toEqualTypeOf<ProjectTeam>();
	});
});
