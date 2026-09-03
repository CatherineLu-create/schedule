import { toPersonAssignmentId } from "../../domain/shared/ids";
import type { ProjectRoles, ProjectTeam } from "../../domain/team/team";
import {
	devBiosTeamFunctionDefinition,
	devEeTeamFunctionDefinition,
	devMeTeamFunctionDefinition,
	devTeamTemplateV2,
	devThermalTeamFunctionDefinition,
} from "./teamTemplateFixtures";

const candidateProjectRoles: ProjectRoles = {
	qciPm: null,
	qciPjm: null,
	acerPm: null,
};

const candidateAppliedTemplate = {
	templateId: devTeamTemplateV2.id,
	versionNumber: devTeamTemplateV2.versionNumber,
} as const;

export const multipleOwnerTeamCandidate: ProjectTeam = {
	projectRoles: candidateProjectRoles,
	functions: [
		{
			function: {
				kind: "standard",
				functionId: devMeTeamFunctionDefinition.id,
			},
			applicability: "applicable",
			assignments: [
				{
					assignmentId: toPersonAssignmentId(
						"candidate-team-multiple-owner-1",
					),
					role: "owner",
					name: "DEV Owner One",
					email: "owner.one@example.test",
				},
				{
					assignmentId: toPersonAssignmentId(
						"candidate-team-multiple-owner-2",
					),
					role: "owner",
					name: "DEV Owner Two",
					email: "owner.two@example.test",
				},
			],
		},
	],
	appliedTemplate: candidateAppliedTemplate,
};

export const multipleLeaderTeamCandidate: ProjectTeam = {
	projectRoles: candidateProjectRoles,
	functions: [
		{
			function: {
				kind: "standard",
				functionId: devEeTeamFunctionDefinition.id,
			},
			applicability: "applicable",
			assignments: [
				{
					assignmentId: toPersonAssignmentId(
						"candidate-team-multiple-leader-1",
					),
					role: "leader",
					name: "DEV Leader One",
					email: "leader.one@example.test",
				},
				{
					assignmentId: toPersonAssignmentId(
						"candidate-team-multiple-leader-2",
					),
					role: "leader",
					name: "DEV Leader Two",
					email: "leader.two@example.test",
				},
				{
					assignmentId: toPersonAssignmentId(
						"candidate-team-multiple-leader-owner",
					),
					role: "owner",
					name: "DEV EE Owner",
					email: "ee.owner@example.test",
				},
			],
		},
	],
	appliedTemplate: candidateAppliedTemplate,
};

export const notApplicableWithPeopleTeamCandidate: ProjectTeam = {
	projectRoles: candidateProjectRoles,
	functions: [
		{
			function: {
				kind: "standard",
				functionId: devThermalTeamFunctionDefinition.id,
			},
			applicability: "notApplicable",
			assignments: [
				{
					assignmentId: toPersonAssignmentId(
						"candidate-team-not-applicable-member",
					),
					role: "member",
					name: "DEV Thermal Member",
					email: "thermal.member@example.test",
				},
			],
		},
	],
	appliedTemplate: candidateAppliedTemplate,
};

export const applicableWithoutOwnerTeamCandidate: ProjectTeam = {
	projectRoles: candidateProjectRoles,
	functions: [
		{
			function: {
				kind: "standard",
				functionId: devBiosTeamFunctionDefinition.id,
			},
			applicability: "applicable",
			assignments: [
				{
					assignmentId: toPersonAssignmentId(
						"candidate-team-without-owner-leader",
					),
					role: "leader",
					name: "DEV BIOS Leader",
					email: "bios.leader@example.test",
				},
				{
					assignmentId: toPersonAssignmentId(
						"candidate-team-without-owner-member",
					),
					role: "member",
					name: "DEV BIOS Member",
					email: "bios.member@example.test",
				},
			],
		},
	],
	appliedTemplate: candidateAppliedTemplate,
};

export const missingEmailTeamCandidate: ProjectTeam = {
	projectRoles: candidateProjectRoles,
	functions: [
		{
			function: {
				kind: "standard",
				functionId: devMeTeamFunctionDefinition.id,
			},
			applicability: "applicable",
			assignments: [
				{
					assignmentId: toPersonAssignmentId(
						"candidate-team-missing-email-owner",
					),
					role: "owner",
					name: "DEV Missing Email Owner",
					email: null,
				},
			],
		},
	],
	appliedTemplate: candidateAppliedTemplate,
};
