import type { PortfolioDashboardRow } from "./application/selectors/portfolioDashboardRows";

export const portfolioDashboardFilterKeys = [
	"year",
	"customer",
	"status",
	"productLine",
	"panelSize",
	"cpu",
	"gpu",
] as const;

export type PortfolioDashboardFilterKey = (typeof portfolioDashboardFilterKeys)[number];

export type PortfolioDashboardFilters = Readonly<Record<PortfolioDashboardFilterKey, string>>;

export const emptyPortfolioDashboardFilters: PortfolioDashboardFilters = {
	year: "",
	customer: "",
	status: "",
	productLine: "",
	panelSize: "",
	cpu: "",
	gpu: "",
};

export type PortfolioDashboardFilterOptions = Readonly<Record<PortfolioDashboardFilterKey, readonly string[]>>;

export interface PortfolioDashboardFilterChip {
	readonly key: PortfolioDashboardFilterKey;
	readonly field: string;
	readonly value: string;
	readonly label: string;
}

const portfolioDashboardFilterFields: Readonly<Record<PortfolioDashboardFilterKey, string>> = {
	year: "Year",
	customer: "Customer",
	status: "Status",
	productLine: "Product Line",
	panelSize: "Panel Size",
	cpu: "CPU",
	gpu: "GPU",
};

const portfolioDashboardFilterGetters: Readonly<Record<PortfolioDashboardFilterKey, (row: PortfolioDashboardRow) => string>> = {
	year: (row) => row.project.year,
	customer: (row) => row.project.customer,
	status: (row) => row.project.projectStatus,
	productLine: (row) => row.project.productLine,
	panelSize: (row) => row.project.panelSize,
	cpu: (row) => row.project.cpu,
	gpu: (row) => row.project.gpu,
};

const searchableProjectValues: readonly ((row: PortfolioDashboardRow) => string)[] = [
	(row) => row.project.projectName,
	(row) => row.project.qciModelName,
	(row) => row.project.productLine,
	(row) => row.project.customer,
	(row) => row.project.cpu,
	(row) => row.project.gpu,
];

export function portfolioDashboardFilterOptions(
	rows: readonly PortfolioDashboardRow[],
): PortfolioDashboardFilterOptions {
	const options = {} as Record<PortfolioDashboardFilterKey, readonly string[]>;
	for (const key of portfolioDashboardFilterKeys) {
		options[key] = [...new Set(rows.map(portfolioDashboardFilterGetters[key]).filter((value) => value !== "" && value !== "-"))];
	}
	return options;
}

export function filterPortfolioDashboardRows(
	rows: readonly PortfolioDashboardRow[],
	searchTerm: string,
	filters: PortfolioDashboardFilters,
): readonly PortfolioDashboardRow[] {
	const normalizedSearch = searchTerm.trim().toLowerCase();
	return rows.filter((row) => {
		const matchesSearch = normalizedSearch.length === 0 || searchableProjectValues.some(
			(getValue) => getValue(row).toLowerCase().includes(normalizedSearch),
		);
		return matchesSearch && portfolioDashboardFilterKeys.every((key) => {
			const selectedValue = filters[key];
			return selectedValue === "" || portfolioDashboardFilterGetters[key](row) === selectedValue;
		});
	});
}

export function portfolioDashboardFilterChips(
	filters: PortfolioDashboardFilters,
): readonly PortfolioDashboardFilterChip[] {
	return portfolioDashboardFilterKeys.flatMap((key) => {
		const value = filters[key];
		if (value === "") return [];
		const field = portfolioDashboardFilterFields[key];
		return [{ key, field, value, label: `${field}: ${value}` }];
	});
}
