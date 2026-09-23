import { describe, expect, it } from "vitest";

import {
	classifyTeamLabel,
	isInvalidApplicabilityFunctionLabel,
} from "./teamRoleMapping";

describe("Team role mapping", () => {
	it.each([
		["QCI-PM-Owner", "qciPm"],
		["QCI-PJM-Owner", "qciPjm"],
		["Acer PM", "acerPm"],
		["QCI-ME-Owner", "qciMeOwner"],
		["QCI-EE-Owner", "qciEeOwner"],
		["QCI-Thermal-Owner", "qciThermalOwner"],
		["QCI-BIOS-Owner ", "qciBiosOwner"],
	] as const)("maps the exact restricted label %s", (functionText, key) => {
		expect(classifyTeamLabel(functionText, "")).toEqual({
			kind: "restricted",
			key,
		});
	});

	it.each([
		["QCI-ME", "qciMeOwner"],
		["QCI-EE", "qciEeOwner"],
		["QCI-Thermal", "qciThermalOwner"],
		["QCI-BIOS", "qciBiosOwner"],
	] as const)("maps the canonical Function and owner pair %s", (functionText, key) => {
		expect(classifyTeamLabel(functionText, " owner ")).toEqual({
			kind: "restricted",
			key,
		});
	});

	it.each([
		["QCI-ME", "leader"],
		["QCI-ME", "member"],
		["QCMC", "owner"],
		["EE ERD", "owner"],
		["EE IQC", "owner"],
		["QCI-ME Chrome", "owner"],
		["QCI-ME Windows", "owner"],
	] as const)("does not map the non-restricted Function/role pair %s + %s", (functionText, roleText) => {
		expect(classifyTeamLabel(functionText, roleText)).not.toEqual(
			expect.objectContaining({ kind: "restricted" }),
		);
	});

	it("keeps QCI-PM-Leader as a general Leader", () => {
		expect(classifyTeamLabel("QCI-PM-Leader", "")).toEqual({
			kind: "functionRole",
			role: "leader",
		});
	});

	it.each([
		"QCMC-EE IQC-Owner",
		"QCI-EE ERD-Owner",
		"QCI-EE IQC-Owner",
		"QCI-SW Bundle-Owner-(Chrome)",
		"QCI-SW Bundle-Owner-(Windows)",
	])("does not substring-map %s to a restricted role", (functionText) => {
		expect(classifyTeamLabel(functionText, "")).toEqual({
			kind: "functionRole",
			role: "owner",
		});
	});

	it("marks a token-level near match as possibly restricted without guessing a key", () => {
		expect(classifyTeamLabel("QCI PM Owner", "unclear")).toEqual({
			kind: "unclassified",
			possibleRestricted: true,
		});
	});

	it.each(["Acer-PM", "Acer PM Owner"])(
		"keeps the Acer near match %s unresolved instead of treating it as noncritical",
		(functionText) => {
			expect(classifyTeamLabel(functionText, "unclear")).toEqual({
				kind: "unclassified",
				possibleRestricted: true,
			});
		},
	);

	it("keeps an unrelated unknown role noncritical", () => {
		expect(classifyTeamLabel("Custom Lab", "Coordinator")).toEqual({
			kind: "unclassified",
			possibleRestricted: false,
		});
	});

	it.each([
		"NA",
		"N/A",
		" na-owner ",
		"NA-Leader",
		"NA-Member",
		"N/A-Owner",
		"N/A-Leader",
		"N/A-Member",
	])("rejects the applicability marker %s as a Function label", (functionText) => {
		expect(isInvalidApplicabilityFunctionLabel(functionText)).toBe(true);
	});

	it.each([
		"NAND-Owner",
		"Finance-Owner",
		"QCI-ME-Owner",
		"QCMC-EE IQC-Owner",
	])("does not reject the legitimate Function label %s", (functionText) => {
		expect(isInvalidApplicabilityFunctionLabel(functionText)).toBe(false);
	});
});
