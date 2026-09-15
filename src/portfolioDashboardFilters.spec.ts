import { describe, expect, it } from "vitest";

import { canonicalProjectFixtures, devProject003 } from "./fixtures/v2/canonicalProjectFixtures";
import { canonicalScheduleFixtures } from "./fixtures/v2/canonicalScheduleFixtures";
import {
	filterPortfolioDashboardRows,
	emptyPortfolioDashboardFilters,
	portfolioDashboardFilterChips,
	portfolioDashboardFilterKeys,
	portfolioDashboardFilterOptions,
	type PortfolioDashboardFilterKey,
	type PortfolioDashboardFilters,
} from "./portfolioDashboardFilters";
import { selectPortfolioDashboardRows, type PortfolioDashboardRow } from "./application/selectors/portfolioDashboardRows";

const rows = selectPortfolioDashboardRows({
	projects: canonicalProjectFixtures,
	schedules: canonicalScheduleFixtures,
});

const valueByKey = {
	year: (row) => row.project.year,
	customer: (row) => row.project.customer,
	status: (row) => row.project.projectStatus,
	productLine: (row) => row.project.productLine,
	panelSize: (row) => row.project.panelSize,
	cpu: (row) => row.project.cpu,
	gpu: (row) => row.project.gpu,
} satisfies Record<PortfolioDashboardFilterKey, (row: PortfolioDashboardRow) => string>;

function filtersWith(
	values: Partial<Record<PortfolioDashboardFilterKey, string>>,
): PortfolioDashboardFilters {
	return { ...emptyPortfolioDashboardFilters, ...values };
}

function rowIds(matched: readonly PortfolioDashboardRow[]): string[] {
	return matched.map((row) => row.projectId);
}

describe("canonical Portfolio Dashboard filters", () => {
	it("exposes exactly the approved seven filter keys", () => {
		expect(portfolioDashboardFilterKeys).toEqual([
			"year",
			"customer",
			"status",
			"productLine",
			"panelSize",
			"cpu",
			"gpu",
		]);
		expect(Object.keys(emptyPortfolioDashboardFilters)).toEqual(portfolioDashboardFilterKeys);
		expect(emptyPortfolioDashboardFilters).toEqual({
			year: "",
			customer: "",
			status: "",
			productLine: "",
			panelSize: "",
			cpu: "",
			gpu: "",
		});
	});

	it.each(portfolioDashboardFilterKeys)("filters by the exact %s display value", (key) => {
		const value = valueByKey[key](rows[1]!);
		const result = filterPortfolioDashboardRows(rows, "", filtersWith({ [key]: value }));

		expect(result.length).toBeGreaterThan(0);
		expect(result.every((row) => valueByKey[key](row) === value)).toBe(true);
		expect(rowIds(result)).toEqual(rows.filter((row) => valueByKey[key](row) === value).map((row) => row.projectId));
	});

	it("derives unique options in first canonical row order without empty or dash sentinels", () => {
		const options = portfolioDashboardFilterOptions(rows);
		expect(Object.keys(options)).toEqual(portfolioDashboardFilterKeys);

		for (const key of portfolioDashboardFilterKeys) {
			const seen: string[] = [];
			for (const row of rows) {
				const value = valueByKey[key](row);
				if (value !== "" && value !== "-" && !seen.includes(value)) seen.push(value);
			}
			expect(options[key]).toEqual(seen);
			expect(new Set(options[key]).size).toBe(options[key].length);
			expect(options[key].every((value) => value !== "" && value !== "-")).toBe(true);
		}
	});

	it("derives options only from supplied rows in insertion order and excludes both sentinels", () => {
		const suppliedValues = [
			{ year: "2031", customer: "Zeta Customer", projectStatus: "Synthetic Active", productLine: "Zeta Line", panelSize: "13 inch", cpu: "CPU Zeta", gpu: "GPU Zeta" },
			{ year: "2030", customer: "Alpha Customer", projectStatus: "Synthetic Draft", productLine: "Alpha Line", panelSize: "14 inch", cpu: "CPU Alpha", gpu: "GPU Alpha" },
			{ year: "2031", customer: "Zeta Customer", projectStatus: "Synthetic Active", productLine: "Zeta Line", panelSize: "13 inch", cpu: "CPU Zeta", gpu: "GPU Zeta" },
			{ year: "", customer: "", projectStatus: "", productLine: "", panelSize: "", cpu: "", gpu: "" },
			{ year: "-", customer: "-", projectStatus: "-", productLine: "-", panelSize: "-", cpu: "-", gpu: "-" },
		] as const;
		const suppliedRows = suppliedValues.map((values, index) => ({
			...rows[index]!,
			project: { ...rows[index]!.project, ...values },
		}));

		expect(portfolioDashboardFilterOptions(suppliedRows)).toEqual({
			year: ["2031", "2030"],
			customer: ["Zeta Customer", "Alpha Customer"],
			status: ["Synthetic Active", "Synthetic Draft"],
			productLine: ["Zeta Line", "Alpha Line"],
			panelSize: ["13 inch", "14 inch"],
			cpu: ["CPU Zeta", "CPU Alpha"],
			gpu: ["GPU Zeta", "GPU Alpha"],
		});
	});

	it("combines Product Line, Customer, and GPU with AND semantics", () => {
		const target = rows[1]!;
		const result = filterPortfolioDashboardRows(rows, "", filtersWith({
			productLine: target.project.productLine,
			customer: target.project.customer,
			gpu: target.project.gpu,
		}));

		expect(rowIds(result)).toEqual([target.projectId]);
	});

	it("returns no rows when a populated filter value has no exact match", () => {
		expect(filterPortfolioDashboardRows(rows, "", filtersWith({ gpu: "not a canonical GPU" }))).toEqual([]);
	});

	it.each([
		["STN Project Name", "manta", (row: PortfolioDashboardRow) => row.project.projectName],
		["QCI Model Name", "qci-alpha-01", (row: PortfolioDashboardRow) => row.project.qciModelName],
		["Product Line", "line alpha", (row: PortfolioDashboardRow) => row.project.productLine],
		["Customer", "customer b", (row: PortfolioDashboardRow) => row.project.customer],
		["CPU", "cpu beta", (row: PortfolioDashboardRow) => row.project.cpu],
		["GPU", "gpu beta", (row: PortfolioDashboardRow) => row.project.gpu],
	] as const)("searches case-insensitively across approved field %s", (_field, term, getter) => {
		const expectedIds = rows.filter((row) => getter(row).toLowerCase().includes(term)).map((row) => row.projectId);
		expect(expectedIds.length).toBeGreaterThan(0);
		expect(rowIds(filterPortfolioDashboardRows(rows, `  ${term.toUpperCase()}  `, emptyPortfolioDashboardFilters))).toEqual(expectedIds);
	});

	it("does not search category or QCI PM Team values", () => {
		expect(filterPortfolioDashboardRows(rows, "DEV Notebook", emptyPortfolioDashboardFilters)).toEqual([]);
		expect(filterPortfolioDashboardRows(rows, "DEV Project 003 QCI PM", emptyPortfolioDashboardFilters)).toEqual([]);
		expect(filterPortfolioDashboardRows(rows, "DEV Project Alpha Legacy", emptyPortfolioDashboardFilters)).toEqual([]);
	});

	it("emits chips in key order with exact field labels and values", () => {
		const filters = filtersWith({ gpu: "DEV GPU Alpha", status: "On Going", customer: "DEV Customer Acer" });

		expect(portfolioDashboardFilterChips(filters)).toEqual([
			{ key: "customer", field: "Customer", value: "DEV Customer Acer", label: "Customer: DEV Customer Acer" },
			{ key: "status", field: "Status", value: "On Going", label: "Status: On Going" },
			{ key: "gpu", field: "GPU", value: "DEV GPU Alpha", label: "GPU: DEV GPU Alpha" },
		]);
	});

	it("clearing one cloned filter removes only that predicate and chip", () => {
		const active = filtersWith({ productLine: "DEV Line Alpha", gpu: "DEV GPU Alpha" });
		const cleared = { ...active, gpu: "" };
		const before = filterPortfolioDashboardRows(rows, "", active);
		const after = filterPortfolioDashboardRows(rows, "", cleared);

		expect(rowIds(before)).toEqual([rows[1]!.projectId]);
		expect(rowIds(after)).toEqual(rows.filter((row) => row.project.productLine === "DEV Line Alpha").map((row) => row.projectId));
		expect(portfolioDashboardFilterChips(cleared)).toEqual([
			{ key: "productLine", field: "Product Line", value: "DEV Line Alpha", label: "Product Line: DEV Line Alpha" },
		]);
		expect(active.gpu).toBe("DEV GPU Alpha");
	});

	it("ignores runtime Category and QCI PM values instead of treating them as filters", () => {
		const unsupportedValues = {
			...emptyPortfolioDashboardFilters,
			category: "DEV Notebook",
			qciPm: "DEV Project 003 QCI PM",
		} as PortfolioDashboardFilters;

		expect(filterPortfolioDashboardRows(rows, "", unsupportedValues)).toEqual(rows);
		expect(portfolioDashboardFilterChips(unsupportedValues)).toEqual([]);
	});

	it("returns all canonical rows with empty search and filter state", () => {
		expect(filterPortfolioDashboardRows(rows, "", emptyPortfolioDashboardFilters)).toEqual(rows);
	});

	it("does not mutate or reorder input rows", () => {
		const before = structuredClone(rows);
		const output = filterPortfolioDashboardRows(rows, "DEV", filtersWith({ customer: "DEV Customer Acer" }));

		expect(rows).toEqual(before);
		expect(rowIds(output)).toEqual(rows.filter((row) => row.project.customer === "DEV Customer Acer" && [row.project.projectName, row.project.qciModelName, row.project.productLine, row.project.customer, row.project.cpu, row.project.gpu].some((value) => value.toLowerCase().includes("dev"))).map((row) => row.projectId));
	});

	it("ignores category, non-filter Portfolio values, and Schedule cells", () => {
		const base = rows[1]!;
		const changed = {
			...base,
			category: "Category Sentinel",
			pcbNumber: "Changed PCB",
			project: { ...base.project, mdrr: "Changed MDRR", currentStage: "Changed Stage" },
			schedule: { kind: "unavailable" as const, issues: [] },
		};
		const baseline = filterPortfolioDashboardRows([base], "DEV", filtersWith({ gpu: base.project.gpu }));

		expect(rowIds(filterPortfolioDashboardRows([changed], "DEV", filtersWith({ gpu: base.project.gpu })))).toEqual(rowIds(baseline));
	});

	it("does not search a unique marker that appears only in a published Schedule occurrence", () => {
		const marker = "ONLY-IN-SCHEDULE-OCCURRENCE-7D3A";
		const published = rows[0]!.schedule;
		expect(published.kind).toBe("published");
		if (published.kind !== "published") throw new Error("Expected canonical fixture to have a published Schedule");
		const firstCell = published.cells[0]!;
		const firstOccurrence = firstCell.occurrences[0]!;
		const scheduleOnlyMarkerRow: PortfolioDashboardRow = {
			...rows[0]!,
			schedule: {
				...published,
				cells: published.cells.map((cell, index) => index === 0
					? { ...cell, occurrences: [{ ...firstOccurrence, plan: marker }] }
					: cell),
			},
		};

		expect([scheduleOnlyMarkerRow.project.projectName, scheduleOnlyMarkerRow.project.qciModelName, scheduleOnlyMarkerRow.project.productLine, scheduleOnlyMarkerRow.project.customer, scheduleOnlyMarkerRow.project.cpu, scheduleOnlyMarkerRow.project.gpu].some((value) => value.includes(marker))).toBe(false);
		expect(filterPortfolioDashboardRows([scheduleOnlyMarkerRow], marker, emptyPortfolioDashboardFilters)).toEqual([]);
	});

	it("keeps filtering outcomes independent of canonical Team-only state", () => {
		const originalRows = selectPortfolioDashboardRows({ projects: canonicalProjectFixtures, schedules: canonicalScheduleFixtures });
		const withoutTeamRows = selectPortfolioDashboardRows({
			projects: canonicalProjectFixtures.map((project) => project.id === devProject003.id ? { ...project, team: null } : project),
			schedules: canonicalScheduleFixtures,
		});
		const filters = filtersWith({ status: "Pending", gpu: "DEV GPU Beta" });

		expect(rowIds(filterPortfolioDashboardRows(withoutTeamRows, "", filters))).toEqual(rowIds(filterPortfolioDashboardRows(originalRows, "", filters)));
	});
});
