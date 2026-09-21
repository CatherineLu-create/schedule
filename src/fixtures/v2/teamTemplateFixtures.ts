import {
	toPersonAssignmentId,
	toTeamFunctionId,
	toTeamTemplateId,
} from "../../domain/shared/ids";
import {
	qciBiosTeamFunctionDefinition,
	qciEeTeamFunctionDefinition,
	qciMeTeamFunctionDefinition,
	qciThermalTeamFunctionDefinition,
} from "../../config/v2/referenceData";
import type { ProjectTeam } from "../../domain/team/team";
import {
	toTeamTemplateVersionNumber,
	type TeamFunctionDefinition,
	type TeamTemplate,
} from "../../domain/team/teamTemplate";

export const devMeTeamFunctionDefinition = qciMeTeamFunctionDefinition;

export const devEeTeamFunctionDefinition = qciEeTeamFunctionDefinition;

export const devThermalTeamFunctionDefinition = qciThermalTeamFunctionDefinition;

export const devBiosTeamFunctionDefinition = qciBiosTeamFunctionDefinition;

export const devLegacyTeamFunctionDefinition: TeamFunctionDefinition = {
	id: toTeamFunctionId("dev-team-function-legacy"),
	displayName: "DEV Legacy",
	active: false,
};

export const devTeamFunctionDefinitions: readonly TeamFunctionDefinition[] = [
	devMeTeamFunctionDefinition,
	devEeTeamFunctionDefinition,
	devThermalTeamFunctionDefinition,
	devBiosTeamFunctionDefinition,
	devLegacyTeamFunctionDefinition,
];

const devTeamTemplateId = toTeamTemplateId("dev-team-template-standard");

export const devTeamTemplateV1: TeamTemplate = {
	id: devTeamTemplateId,
	versionNumber: toTeamTemplateVersionNumber(1),
	functions: [
		{ functionId: devMeTeamFunctionDefinition.id, displayOrder: 10 },
		{ functionId: devEeTeamFunctionDefinition.id, displayOrder: 20 },
	],
};

export const devTeamTemplateV2: TeamTemplate = {
	id: devTeamTemplateId,
	versionNumber: toTeamTemplateVersionNumber(2),
	functions: [
		{ functionId: devMeTeamFunctionDefinition.id, displayOrder: 10 },
		{ functionId: devEeTeamFunctionDefinition.id, displayOrder: 20 },
		{ functionId: devThermalTeamFunctionDefinition.id, displayOrder: 30 },
		{ functionId: devBiosTeamFunctionDefinition.id, displayOrder: 40 },
	],
};

export const validSavedTeamFixture: ProjectTeam = {
	projectRoles: {
		qciPm: {
			assignmentId: toPersonAssignmentId("dev-saved-team-qci-pm"),
			name: "DEV QCI PM",
			email: "qci.pm@example.test",
		},
		qciPjm: {
			assignmentId: toPersonAssignmentId("dev-saved-team-qci-pjm"),
			name: "DEV QCI PjM",
			email: "qci.pjm@example.test",
		},
		acerPm: {
			assignmentId: toPersonAssignmentId("dev-saved-team-acer-pm"),
			name: "DEV Acer PM",
			email: "acer.pm@example.test",
		},
	},
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
						"dev-saved-team-me-owner",
					),
					role: "owner",
					name: "DEV ME Owner",
					email: "dev.me.owner@example.test",
				},
			],
		},
		{
			function: {
				kind: "standard",
				functionId: devEeTeamFunctionDefinition.id,
			},
			applicability: "applicable",
			assignments: [
				{
					assignmentId: toPersonAssignmentId(
						"dev-saved-team-ee-owner",
					),
					role: "owner",
					name: "DEV EE Owner",
					email: "dev.ee.owner@example.test",
				},
			],
		},
		{
			function: {
				kind: "standard",
				functionId: devThermalTeamFunctionDefinition.id,
			},
			applicability: "notApplicable",
			assignments: [],
		},
		{
			function: {
				kind: "standard",
				functionId: devBiosTeamFunctionDefinition.id,
			},
			applicability: "applicable",
			assignments: [
				{
					assignmentId: toPersonAssignmentId(
						"dev-saved-team-bios-owner",
					),
					role: "owner",
					name: "DEV BIOS Owner",
					email: "dev.bios.owner@example.test",
				},
			],
		},
	],
	appliedTemplate: {
		templateId: devTeamTemplateV2.id,
		versionNumber: devTeamTemplateV2.versionNumber,
	},
};
