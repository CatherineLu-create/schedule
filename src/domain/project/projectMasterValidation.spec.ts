import { describe, expect, expectTypeOf, it } from "vitest";

import {
	devProject001,
	devProject002,
} from "../../fixtures/v2/canonicalProjectFixtures";
import {
	validateProjectMasterCompleteness,
	type ProjectMasterCompletenessField,
} from "./projectMasterValidation";

describe("Project Master completeness advisory", () => {
	it("derives Advisory issues only for explicitly configured fields", () => {
		const fields: readonly ProjectMasterCompletenessField[] = [
			{
				section: "basicInformation",
				field: "customer",
				label: "Customer",
			},
			{
				section: "basicInformation",
				field: "qciModelName",
				label: "QCI Model Name",
			},
		];

		const issues = validateProjectMasterCompleteness(
			devProject001.master,
			fields,
		);

		expect(issues).toEqual([
			expect.objectContaining({
				code: "projectMaster.data.missing-field",
				domain: "projectMaster",
				source: "data",
				severity: "advisory",
				message: "QCI Model Name is incomplete.",
				target: expect.objectContaining({
					section: "projectMaster.basicInformation",
					field: "qciModelName",
				}),
			}),
		]);
	});

	it("does not invent a default completeness field set", () => {
		expect(validateProjectMasterCompleteness(devProject001.master, [])).toEqual(
			[],
		);
	});

	it("does not warn for configured Basic fields that contain values", () => {
		expect(
			validateProjectMasterCompleteness(devProject002.master, [
				{ section: "basicInformation", field: "year", label: "Year" },
				{
					section: "basicInformation",
					field: "productLine",
					label: "Product Line",
				},
				{
					section: "basicInformation",
					field: "stnProjectName",
					label: "STN Project Name",
				},
			]),
		).toEqual([]);
	});

	it("reports a configured missing Platform/Hardware field as Data Advisory", () => {
		const issues = validateProjectMasterCompleteness(devProject001.master, [
			{
				section: "platformHardware",
				field: "pcbNumber",
				label: "PCB#",
			},
		]);

		expect(issues).toEqual([
			expect.objectContaining({
				code: "projectMaster.data.missing-field",
				source: "data",
				severity: "advisory",
				message: "PCB# is incomplete.",
				target: {
					section: "projectMaster.platformHardware",
					field: "pcbNumber",
				},
			}),
		]);
	});

	it("does not warn for a populated configured field outside Basic Information", () => {
		expect(
			validateProjectMasterCompleteness(devProject002.master, [
				{
					section: "platformHardware",
					field: "pcbNumber",
					label: "PCB#",
				},
			]),
		).toEqual([]);
	});

	it("evaluates explicitly configured fields from different sections together", () => {
		const issues = validateProjectMasterCompleteness(devProject001.master, [
			{
				section: "basicInformation",
				field: "qciModelName",
				label: "QCI Model Name",
			},
			{
				section: "modelRegulatory",
				field: "ssid",
				label: "SSID",
			},
			{
				section: "mechanical.product",
				field: "productWeightG",
				label: "Product Weight",
			},
		]);

		expect(issues.map(({ target }) => target)).toEqual([
			{
				section: "projectMaster.basicInformation",
				field: "qciModelName",
			},
			{
				section: "projectMaster.modelRegulatory",
				field: "ssid",
			},
			{
				section: "projectMaster.mechanical.product",
				field: "productWeightG",
			},
		]);
		expect(issues.every(({ severity }) => severity === "advisory")).toBe(true);
	});

	it("supports every existing Project Master leaf section without selecting a policy", () => {
		const descriptors: readonly ProjectMasterCompletenessField[] = [
			{ section: "basicInformation", field: "status", label: "Status" },
			{ section: "platformHardware", field: "cpu", label: "CPU" },
			{ section: "leverage", field: "pcbLeverage", label: "PCB Leverage" },
			{ section: "cover", field: "aCover", label: "A Cover" },
			{
				section: "modelRegulatory",
				field: "acerModelName",
				label: "Acer Model Name",
			},
			{
				section: "mechanical.product",
				field: "productLengthMm",
				label: "Product Length",
			},
			{
				section: "mechanical.package",
				field: "packageLengthMm",
				label: "Package Length",
			},
			{ section: "other", field: "remark", label: "Remark" },
		];

		expect(descriptors.map(({ section }) => section)).toEqual([
			"basicInformation",
			"platformHardware",
			"leverage",
			"cover",
			"modelRegulatory",
			"mechanical.product",
			"mechanical.package",
			"other",
		]);
		expectTypeOf<ProjectMasterCompletenessField["section"]>().toEqualTypeOf<
			| "basicInformation"
			| "platformHardware"
			| "leverage"
			| "cover"
			| "modelRegulatory"
			| "mechanical.product"
			| "mechanical.package"
			| "other"
		>();
	});
});
