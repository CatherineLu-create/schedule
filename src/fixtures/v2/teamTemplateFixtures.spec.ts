import { describe, expect, it } from "vitest";
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
	it("defines exactly five stable development Functions including inactive DEV Legacy", () => {
		expect(
			devTeamFunctionDefinitions.map((definition) => ({
				id: definition.id,
				displayName: definition.displayName,
				active: definition.active,
			})),
		).toEqual([
			{
				id: "dev-team-function-me",
				displayName: "DEV ME",
				active: true,
			},
			{
				id: "dev-team-function-ee",
				displayName: "DEV EE",
				active: true,
			},
			{
				id: "dev-team-function-thermal",
				displayName: "DEV Thermal",
				active: true,
			},
			{
				id: "dev-team-function-bios",
				displayName: "DEV BIOS",
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
		expect(devLegacyTeamFunctionDefinition.active).toBe(false);
	});

	it("defines v1 and v2 with one stable Template ID and explicit ordered versions", () => {
		expect(devTeamTemplateV1.id).toBe("dev-team-template-standard");
		expect(devTeamTemplateV2.id).toBe(devTeamTemplateV1.id);
		expect(devTeamTemplateV1.versionNumber).toBe(1);
		expect(devTeamTemplateV2.versionNumber).toBe(2);
		expect(devTeamTemplateV1.functions).toEqual([
			{ functionId: devMeTeamFunctionDefinition.id, displayOrder: 10 },
			{ functionId: devEeTeamFunctionDefinition.id, displayOrder: 20 },
		]);
		expect(devTeamTemplateV2.functions).toEqual([
			{ functionId: devMeTeamFunctionDefinition.id, displayOrder: 10 },
			{ functionId: devEeTeamFunctionDefinition.id, displayOrder: 20 },
			{
				functionId: devThermalTeamFunctionDefinition.id,
				displayOrder: 30,
			},
			{ functionId: devBiosTeamFunctionDefinition.id, displayOrder: 40 },
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
				functionId: devThermalTeamFunctionDefinition.id,
				displayOrder: 30,
			},
			{ functionId: devBiosTeamFunctionDefinition.id, displayOrder: 40 },
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
				functionId: devMeTeamFunctionDefinition.id,
				applicability: "applicable",
				roles: ["owner"],
			},
			{
				functionId: devEeTeamFunctionDefinition.id,
				applicability: "applicable",
				roles: ["owner"],
			},
			{
				functionId: devThermalTeamFunctionDefinition.id,
				applicability: "notApplicable",
				roles: [],
			},
			{
				functionId: devBiosTeamFunctionDefinition.id,
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
