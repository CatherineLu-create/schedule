import React from "react";
import type { PortfolioDashboardRow } from "./application/selectors/portfolioDashboardRows";
import type { ProjectId } from "./domain/shared/ids";
import {
  emptyPortfolioDashboardFilters,
  filterPortfolioDashboardRows,
  portfolioDashboardFilterChips,
  portfolioDashboardFilterOptions,
  type PortfolioDashboardFilterKey,
} from "./portfolioDashboardFilters";
import { PortfolioDashboardTable } from "./portfolioDashboardTable";

export interface PortfolioDashboardViewProps {
  readonly rows: readonly PortfolioDashboardRow[];
  readonly onCreateProject: () => void;
  readonly onExport: () => void;
  readonly onOpenProject: (projectId: ProjectId) => void;
}

const controls: readonly (
  | { readonly key: PortfolioDashboardFilterKey; readonly label: string; readonly disabled?: false }
  | { readonly key: "category" | "qciPm"; readonly label: string; readonly disabled: true; readonly explanation: string }
)[] = [
  { key: "year", label: "Year" },
  { key: "customer", label: "Customer" },
  { key: "status", label: "Status" },
  { key: "category", label: "Category", disabled: true, explanation: "Not available in V2.2" },
  { key: "productLine", label: "Product Line" },
  { key: "panelSize", label: "Panel Size" },
  { key: "cpu", label: "CPU" },
  { key: "gpu", label: "GPU" },
  { key: "qciPm", label: "QCI PM", disabled: true, explanation: "Migration pending" },
];
const attentionCards = [
  { title: "Blocking Issues", supporting: "Calculation not active", tone: "border-rose-100 bg-rose-50/60 text-rose-800" },
  { title: "Milestone Due", supporting: "Next 14 days · calculation not active", tone: "border-amber-100 bg-amber-50/60 text-amber-800" },
  { title: "Overdue", supporting: "Past due · calculation not active", tone: "border-orange-100 bg-orange-50/60 text-orange-800" },
] as const;
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600";

export function PortfolioDashboardView({ rows, onCreateProject, onExport, onOpenProject }: PortfolioDashboardViewProps): React.ReactElement {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [filters, setFilters] = React.useState(emptyPortfolioDashboardFilters);
  const id = React.useId();
  const options = portfolioDashboardFilterOptions(rows);
  const filteredRows = filterPortfolioDashboardRows(rows, searchTerm, filters);
  const chips = portfolioDashboardFilterChips(filters);

  return <section aria-label="Portfolio Dashboard" style={{ isolation: "isolate" }} className="flex w-full min-w-0 flex-col gap-5 bg-slate-100 px-4 py-5 sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Project Information</h1>
        <p className="mt-1 text-sm text-slate-500">Portfolio overview</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onExport()} className={`rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 ${focus}`}>Export to Excel</button>
        <button type="button" aria-label="Create Project" onClick={() => onCreateProject()} className={`rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 ${focus}`}>+ Create Project</button>
      </div>
    </header>

    <section aria-labelledby={`${id}-attention`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 id={`${id}-attention`} className="text-base font-semibold text-slate-900">Needs Attention</h2>
      <p className="mt-1 text-xs text-slate-500">Portfolio indicators await approved business rules.</p>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {attentionCards.map((card) => <div key={card.title} role="group" aria-label={card.title} className={`rounded-lg border p-4 ${card.tone}`}>
          <h3 className="text-sm font-medium">{card.title}</h3>
          <div className="mt-2 text-2xl font-semibold">—</div>
          <p className="mt-1 text-xs">{card.supporting}</p>
        </div>)}
      </div>
    </section>

    <section aria-labelledby={`${id}-filters`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 id={`${id}-filters`} className="text-base font-semibold text-slate-900">Search / Filters</h2>
      <label className="mt-4 block text-xs font-medium text-slate-600" htmlFor={`${id}-search`}>Search</label>
      <input id={`${id}-search`} type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search STN Project Name, QCI Model Name, Product Line, Customer, CPU, GPU" className={`mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm ${focus}`} />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {controls.map((control) => <div key={control.key} className="min-w-0">
          <label htmlFor={`${id}-${control.key}`} className="block text-xs font-medium text-slate-600">{control.label}</label>
          {control.disabled ? <>
            <select id={`${id}-${control.key}`} disabled aria-describedby={`${id}-${control.key}-reason`} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-400 disabled:cursor-not-allowed">
              <option>Not available</option>
            </select>
            <p id={`${id}-${control.key}-reason`} className="mt-1 text-xs text-slate-500">{control.explanation}</p>
          </> : <select id={`${id}-${control.key}`} value={filters[control.key]} onChange={(event) => setFilters((current) => ({ ...current, [control.key]: event.target.value }))} className={`mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm ${focus}`}>
            <option value="">All</option>
            {options[control.key].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>}
        </div>)}
      </div>
      {chips.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        {chips.map((chip) => <button key={chip.key} type="button" aria-label={`Remove ${chip.label}`} onClick={() => setFilters((current) => ({ ...current, [chip.key]: "" }))} className={`max-w-full rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200 ${focus}`}>{chip.label} ×</button>)}
        <button type="button" onClick={() => setFilters(emptyPortfolioDashboardFilters)} className={`rounded px-2 py-1 text-xs text-slate-600 underline hover:text-slate-900 ${focus}`}>Clear all</button>
      </div>}
    </section>

    <section aria-labelledby={`${id}-projects`} className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 sm:px-5">
        <div><h2 id={`${id}-projects`} className="text-base font-semibold text-slate-900">Projects</h2>
          <p className="mt-1 text-xs text-slate-500">Showing {filteredRows.length} of {rows.length} projects</p>
        </div>
        <p className="text-xs text-slate-500">Scroll horizontally to view Schedule and Team</p>
      </div>
      <PortfolioDashboardTable rows={filteredRows} onOpenProject={onOpenProject} />
    </section>
  </section>;
}
