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
	category: (row) => row.category,
	productLine: (row) => row.project.productLine,
	panelSize: (row) => row.project.panelSize,
	cpu: (row) => row.project.cpu,
	gpu: (row) => row.project.gpu,
	qciPm: (row) => row.qciPm?.value ?? "",
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
	it("exposes the nine approved filter keys in visual order", () => {
		expect(portfolioDashboardFilterKeys).toEqual([
			"year",
			"customer",
			"status",
			"category",
			"productLine",
			"panelSize",
			"cpu",
			"gpu",
			"qciPm",
		]);
		expect(Object.keys(emptyPortfolioDashboardFilters)).toEqual(portfolioDashboardFilterKeys);
		expect(emptyPortfolioDashboardFilters).toEqual({
			year: "",
			customer: "",
			status: "",
			category: "",
			productLine: "",
			panelSize: "",
			cpu: "",
			gpu: "",
			qciPm: "",
		});
	});

	it.each(portfolioDashboardFilterKeys)("filters by the exact %s display value", (key) => {
		const value = valueByKey[key](rows[1]!);
		const result = filterPortfolioDashboardRows(rows, "", filtersWith({ [key]: value }));

		expect(result.length).toBeGreaterThan(0);
		expect(result.every((row) => valueByKey[key](row) === value)).toBe(true);
		expect(rowIds(result)).toEqual(rows.filter((row) => valueByKey[key](row) === value).map((row) => row.projectId));
	});

	it("derives unique labeled options in first canonical row order without empty or dash sentinels", () => {
		const options = portfolioDashboardFilterOptions(rows);
		expect(Object.keys(options)).toEqual(portfolioDashboardFilterKeys);

		for (const key of portfolioDashboardFilterKeys) {
			const seen: { value: string; label: string }[] = [];
			for (const row of rows) {
				const value = valueByKey[key](row);
				const label = key === "qciPm" ? row.qciPm?.label ?? "" : value;
				if (value !== "" && value !== "-" && !seen.some((option) => option.value === value)) {
					seen.push({ value, label });
				}
			}
			expect(options[key]).toEqual(seen);
			expect(new Set(options[key].map(({ value }) => value)).size).toBe(options[key].length);
			expect(options[key].every(({ value, label }) => value !== "" && value !== "-" && label !== "")).toBe(true);
		}
	});

	it("derives options only from supplied rows in insertion order and excludes blank values and sentinels", () => {
		const suppliedValues = [
			{ year: "2031", customer: "Zeta Customer", projectStatus: "Synthetic Active", category: "Zeta Category", productLine: "Zeta Line", panelSize: "13 inch", cpu: "CPU Zeta", gpu: "GPU Zeta", qciPm: { value: "shared@example.test", label: "First Shared PM" } },
			{ year: "2030", customer: "Alpha Customer", projectStatus: "Synthetic Draft", category: "Alpha Category", productLine: "Alpha Line", panelSize: "14 inch", cpu: "CPU Alpha", gpu: "GPU Alpha", qciPm: { value: "alpha@example.test", label: "Same Display Name" } },
			{ year: "2031", customer: "Zeta Customer", projectStatus: "Synthetic Active", category: "Zeta Category", productLine: "Zeta Line", panelSize: "13 inch", cpu: "CPU Zeta", gpu: "GPU Zeta", qciPm: { value: "shared@example.test", label: "Later Shared Label" } },
			{ year: "", customer: "", projectStatus: "", category: "", productLine: "", panelSize: "", cpu: "", gpu: "", qciPm: { value: "other@example.test", label: "Same Display Name" } },
			{ year: "-", customer: "-", projectStatus: "-", category: "-", productLine: "-", panelSize: "-", cpu: "-", gpu: "-", qciPm: null },
		] as const;
		const suppliedRows = suppliedValues.map((values, index) => ({
			...rows[index]!,
			category: values.category,
			qciPm: values.qciPm,
			project: { ...rows[index]!.project, ...values, category: undefined, qciPm: undefined },
		}));

		expect(portfolioDashboardFilterOptions(suppliedRows)).toEqual({
			year: [{ value: "2031", label: "2031" }, { value: "2030", label: "2030" }],
			customer: [{ value: "Zeta Customer", label: "Zeta Customer" }, { value: "Alpha Customer", label: "Alpha Customer" }],
			status: [{ value: "Synthetic Active", label: "Synthetic Active" }, { value: "Synthetic Draft", label: "Synthetic Draft" }],
			category: [{ value: "Zeta Category", label: "Zeta Category" }, { value: "Alpha Category", label: "Alpha Category" }],
			productLine: [{ value: "Zeta Line", label: "Zeta Line" }, { value: "Alpha Line", label: "Alpha Line" }],
			panelSize: [{ value: "13 inch", label: "13 inch" }, { value: "14 inch", label: "14 inch" }],
			cpu: [{ value: "CPU Zeta", label: "CPU Zeta" }, { value: "CPU Alpha", label: "CPU Alpha" }],
			gpu: [{ value: "GPU Zeta", label: "GPU Zeta" }, { value: "GPU Alpha", label: "GPU Alpha" }],
			qciPm: [
				{ value: "shared@example.test", label: "First Shared PM" },
				{ value: "alpha@example.test", label: "Same Display Name" },
				{ value: "other@example.test", label: "Same Display Name" },
			],
		});
		expect(rowIds(filterPortfolioDashboardRows(
			suppliedRows,
			"",
			filtersWith({ qciPm: "shared@example.test" }),
		))).toEqual([suppliedRows[0]!.projectId, suppliedRows[2]!.projectId]);
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

	it("combines exact Category and QCI PM identities with other filters", () => {
		const categoryTarget = rows[2]!;
		expect(rowIds(filterPortfolioDashboardRows(rows, "", filtersWith({
			category: categoryTarget.category,
			customer: categoryTarget.project.customer,
		})))).toEqual([categoryTarget.projectId]);

		const qciTarget = rows[1]!;
		expect(rowIds(filterPortfolioDashboardRows(rows, "", filtersWith({
			qciPm: qciTarget.qciPm!.value,
			panelSize: qciTarget.project.panelSize,
		})))).toEqual([qciTarget.projectId]);
	});

	it("returns no rows when a populated filter value has no exact match", () => {
		expect(filterPortfolioDashboardRows(rows, "", filtersWith({ gpu: "not a canonical GPU" }))).toEqual([]);
	});

	it.each([
		["STN Project Name", "manta", (row: PortfolioDashboardRow) => row.project.projectName],
		["QCI Model Name", "znt", (row: PortfolioDashboardRow) => row.project.qciModelName],
		["Product Line", "helios neo", (row: PortfolioDashboardRow) => row.project.productLine],
		["Customer", "customer b", (row: PortfolioDashboardRow) => row.project.customer],
		["CPU", "novalake", (row: PortfolioDashboardRow) => row.project.cpu],
		["GPU", "gn22-x7", (row: PortfolioDashboardRow) => row.project.gpu],
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

	it("emits chips in key order and uses the human QCI PM label", () => {
		const filters = filtersWith({ gpu: "DEV GPU Alpha", status: "On Going", customer: "DEV Customer Acer", qciPm: rows[2]!.qciPm!.value });
		const options = portfolioDashboardFilterOptions(rows);

		expect(portfolioDashboardFilterChips(filters, options)).toEqual([
			{ key: "customer", field: "Customer", value: "DEV Customer Acer", label: "Customer: DEV Customer Acer" },
			{ key: "status", field: "Status", value: "On Going", label: "Status: On Going" },
			{ key: "gpu", field: "GPU", value: "DEV GPU Alpha", label: "GPU: DEV GPU Alpha" },
			{ key: "qciPm", field: "QCI PM", value: "project.003.qci.pm@example.test", label: "QCI PM: DEV Project 003 QCI PM" },
		]);
	});

	it("clearing one cloned filter removes only that predicate and chip", () => {
		const active = filtersWith({ customer: "Acer", gpu: "GN22-X7/X9" });
		const cleared = { ...active, gpu: "" };
		const before = filterPortfolioDashboardRows(rows, "", active);
		const after = filterPortfolioDashboardRows(rows, "", cleared);

		expect(rowIds(before)).toEqual([rows[3]!.projectId]);
		expect(rowIds(after)).toEqual(rows.filter((row) => row.project.customer === "Acer").map((row) => row.projectId));
		expect(portfolioDashboardFilterChips(cleared)).toEqual([
			{ key: "customer", field: "Customer", value: "Acer", label: "Customer: Acer" },
		]);
		expect(active.gpu).toBe("GN22-X7/X9");
	});

	it("keeps Projects without Category or QCI PM visible under All", () => {
		const blankRow = { ...rows[0]!, category: "-", qciPm: null };
		expect(filterPortfolioDashboardRows([blankRow], "", emptyPortfolioDashboardFilters)).toEqual([blankRow]);
		expect(portfolioDashboardFilterOptions([blankRow])).toMatchObject({ category: [], qciPm: [] });
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
		const filters = filtersWith({ status: "Pending", gpu: "GN22-X7/X9" });

		expect(rowIds(filterPortfolioDashboardRows(withoutTeamRows, "", filters))).toEqual(rowIds(filterPortfolioDashboardRows(originalRows, "", filters)));
	});
});
