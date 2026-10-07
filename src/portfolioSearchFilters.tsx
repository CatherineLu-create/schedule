import React from "react";
import { emptyPortfolioDashboardFilters, portfolioDashboardFilterChips, type PortfolioDashboardFilters, type PortfolioDashboardFilterKey, type PortfolioDashboardFilterOptions } from "./portfolioDashboardFilters";

const controls: readonly { readonly key: PortfolioDashboardFilterKey; readonly label: string }[] = [
  { key: "year", label: "Year" },
  { key: "customer", label: "Customer" },
  { key: "status", label: "Status" },
  { key: "category", label: "Category" },
  { key: "productLine", label: "Product Line" },
  { key: "panelSize", label: "Panel Size" },
  { key: "cpu", label: "CPU" },
  { key: "gpu", label: "GPU" },
  { key: "qciPm", label: "QCI PM" },
];
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600";

interface PortfolioSearchFiltersProps {
  readonly id: string;
  readonly searchTerm: string;
  readonly onSearchChange: (value: string) => void;
  readonly filters: PortfolioDashboardFilters;
  readonly onFiltersChange: React.Dispatch<React.SetStateAction<PortfolioDashboardFilters>>;
  readonly options: PortfolioDashboardFilterOptions;
}

export function PortfolioSearchFilters({ id, searchTerm, onSearchChange, filters, onFiltersChange, options }: PortfolioSearchFiltersProps): React.ReactElement {
  const chips = portfolioDashboardFilterChips(filters, options);
  return (
    <section aria-labelledby={`${id}-filters`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 id={`${id}-filters`} className="text-base font-semibold text-slate-900">Search / Filters</h2>
      <label className="mt-4 block text-xs font-medium text-slate-600" htmlFor={`${id}-search`}>Search</label>
      <input id={`${id}-search`} type="search" value={searchTerm} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search STN Project Name, QCI Model Name, Product Line, Customer, CPU, GPU" className={`mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm ${focus}`} />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {controls.map((control) => <div key={control.key} className="min-w-0">
          <label htmlFor={`${id}-${control.key}`} className="block text-xs font-medium text-slate-600">{control.label}</label>
          <select id={`${id}-${control.key}`} value={filters[control.key]} onChange={(event) => onFiltersChange((current) => ({ ...current, [control.key]: event.target.value }))} className={`mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm ${focus}`}>
            <option value="">All</option>
            {options[control.key].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>)}
      </div>
      {chips.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        {chips.map((chip) => <button key={chip.key} type="button" aria-label={`Remove ${chip.label}`} onClick={() => onFiltersChange((current) => ({ ...current, [chip.key]: "" }))} className={`max-w-full rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200 ${focus}`}>{chip.label} ×</button>)}
        <button type="button" onClick={() => onFiltersChange(emptyPortfolioDashboardFilters)} className={`rounded px-2 py-1 text-xs text-slate-600 underline hover:text-slate-900 ${focus}`}>Clear all</button>
      </div>}
    </section>
  );
}
