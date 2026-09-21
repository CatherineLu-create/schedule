import { describe, expect, it } from "vitest";
import {
	qciBiosTeamFunctionDefinition,
	qciEeTeamFunctionDefinition,
	qciMeTeamFunctionDefinition,
	qciThermalTeamFunctionDefinition,
	teamFunctionCatalog,
} from "../../config/v2/referenceData";
import { getMissingStandardFunctions } from "../../domain/team/teamTemplate";
import type { ProjectTeam } from "../../domain/team/team";
import {
	devBiosTeamFunctionDefinition,
	devEeTeamFunctionDefinition,
	devLegacyTeamFunctionDefinition,
	devMeTeamFunctionDefinition,
	devTeamFunctionDefinitions,
	devTeamTemplateV1,
	devTeamTemplateV2,
	devThermalTeamFunctionDefinition,
	validSavedTeamFixture,
} from "./teamTemplateFixtures";

describe("synthetic Team Function and Template fixtures", () => {
	it("reuses the four production standard Functions and keeps inactive DEV Legacy fixture-only", () => {
		expect(
			devTeamFunctionDefinitions.map((definition) => ({
				id: definition.id,
				displayName: definition.displayName,
				active: definition.active,
			})),
		).toEqual([
			{
				id: "team-function-qci-me",
				displayName: "QCI-ME",
				active: true,
			},
			{
				id: "team-function-qci-ee",
				displayName: "QCI-EE",
				active: true,
			},
			{
				id: "team-function-qci-thermal",
				displayName: "QCI-Thermal",
				active: true,
			},
			{
				id: "team-function-qci-bios",
				displayName: "QCI-BIOS",
				active: true,
			},
			{
				id: "dev-team-function-legacy",
				displayName: "DEV Legacy",
				active: false,
			},
		]);
		expect(new Set(devTeamFunctionDefinitions.map(({ id }) => id)).size).toBe(
			5,
		);
		expect(devMeTeamFunctionDefinition).toBe(
			qciMeTeamFunctionDefinition,
		);
		expect(devEeTeamFunctionDefinition).toBe(
			qciEeTeamFunctionDefinition,
		);
		expect(devThermalTeamFunctionDefinition).toBe(
			qciThermalTeamFunctionDefinition,
		);
		expect(devBiosTeamFunctionDefinition).toBe(
			qciBiosTeamFunctionDefinition,
		);
		expect(devLegacyTeamFunctionDefinition.active).toBe(false);
		expect(teamFunctionCatalog).not.toContain(devLegacyTeamFunctionDefinition);
	});

	it("defines v1 and v2 with one stable Template ID and explicit ordered versions", () => {
		expect(devTeamTemplateV1.id).toBe("dev-team-template-standard");
		expect(devTeamTemplateV2.id).toBe(devTeamTemplateV1.id);
		expect(devTeamTemplateV1.versionNumber).toBe(1);
		expect(devTeamTemplateV2.versionNumber).toBe(2);
		expect(devTeamTemplateV1.functions).toEqual([
			{ functionId: "team-function-qci-me", displayOrder: 10 },
			{ functionId: "team-function-qci-ee", displayOrder: 20 },
		]);
		expect(devTeamTemplateV2.functions).toEqual([
			{ functionId: "team-function-qci-me", displayOrder: 10 },
			{ functionId: "team-function-qci-ee", displayOrder: 20 },
			{
				functionId: "team-function-qci-thermal",
				displayOrder: 30,
			},
			{ functionId: "team-function-qci-bios", displayOrder: 40 },
		]);
		expect(
			devTeamTemplateV2.functions.some(
				({ functionId }) =>
					functionId === devLegacyTeamFunctionDefinition.id,
			),
		).toBe(false);
		expect(
			devTeamTemplateV2.functions.every(
				(item) => Object.keys(item).sort().join(",") === "displayOrder,functionId",
			),
		).toBe(true);
	});

	it("exposes Thermal and BIOS as the two missing v2 standards for a v1-shaped Team", () => {
		const v1ShapedTeam: ProjectTeam = {
			projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
			functions: [
				{
					function: {
						kind: "standard",
						functionId: devMeTeamFunctionDefinition.id,
					},
					applicability: "applicable",
					assignments: [],
				},
				{
					function: {
						kind: "standard",
						functionId: devEeTeamFunctionDefinition.id,
					},
					applicability: "notApplicable",
					assignments: [],
				},
			],
			appliedTemplate: {
				templateId: devTeamTemplateV1.id,
				versionNumber: devTeamTemplateV1.versionNumber,
			},
		};

		expect(
			getMissingStandardFunctions(v1ShapedTeam, devTeamTemplateV2),
		).toEqual([
			{
				functionId: "team-function-qci-thermal",
				displayOrder: 30,
			},
			{ functionId: "team-function-qci-bios", displayOrder: 40 },
		]);
	});
});

describe("valid saved Team fixture", () => {
	it("contains the three Project Roles and v2 applied-template metadata", () => {
		expect(validSavedTeamFixture.projectRoles).toEqual({
			qciPm: {
				assignmentId: "dev-saved-team-qci-pm",
				name: "DEV QCI PM",
				email: "qci.pm@example.test",
			},
			qciPjm: {
				assignmentId: "dev-saved-team-qci-pjm",
				name: "DEV QCI PjM",
				email: "qci.pjm@example.test",
			},
			acerPm: {
				assignmentId: "dev-saved-team-acer-pm",
				name: "DEV Acer PM",
				email: "acer.pm@example.test",
			},
		});
		expect(validSavedTeamFixture.appliedTemplate).toEqual({
			templateId: devTeamTemplateV2.id,
			versionNumber: devTeamTemplateV2.versionNumber,
		});
	});

	it("has one Owner for each applicable Function and no people in DEV Thermal", () => {
		expect(
			validSavedTeamFixture.functions.map((functionTeam) => ({
				functionId: functionTeam.function.functionId,
				applicability: functionTeam.applicability,
				roles: functionTeam.assignments.map(({ role }) => role),
			})),
		).toEqual([
			{
				functionId: "team-function-qci-me",
				applicability: "applicable",
				roles: ["owner"],
			},
			{
				functionId: "team-function-qci-ee",
				applicability: "applicable",
				roles: ["owner"],
			},
			{
				functionId: "team-function-qci-thermal",
				applicability: "notApplicable",
				roles: [],
			},
			{
				functionId: "team-function-qci-bios",
				applicability: "applicable",
				roles: ["owner"],
			},
		]);
		expect(
			validSavedTeamFixture.functions.every(
				(functionTeam) =>
					functionTeam.applicability !== "applicable" ||
					functionTeam.assignments.filter(({ role }) => role === "owner")
						.length === 1,
			),
		).toBe(true);
	});
});
