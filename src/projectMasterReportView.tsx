import React from "react";
import type { PortfolioDashboardRow } from "./application/selectors/portfolioDashboardRows";
import type { PrototypeState } from "./application/state/prototypeState";
import { emptyPortfolioDashboardFilters, filterPortfolioDashboardRows, portfolioDashboardFilterOptions } from "./portfolioDashboardFilters";
import { PortfolioSearchFilters } from "./portfolioSearchFilters";
import { projectMasterReportCells, projectMasterReportColumns, projectMasterReportGroups, type ProjectMasterReportColumn, type ProjectMasterReportGroupKey } from "./projectMasterReportColumns";

interface ProjectMasterReportViewProps {
  readonly state: PrototypeState;
  readonly rows: readonly PortfolioDashboardRow[];
  readonly onBack: () => void;
  readonly onExport: (rows: readonly PortfolioDashboardRow[], columns: readonly ProjectMasterReportColumn[]) => void;
}

export function ProjectMasterReportView({ state, rows, onBack, onExport }: ProjectMasterReportViewProps): React.ReactElement {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [filters, setFilters] = React.useState(emptyPortfolioDashboardFilters);
  const [selectedGroups, setSelectedGroups] = React.useState<readonly ProjectMasterReportGroupKey[]>(() => projectMasterReportGroups.map(group => group.key));
  const id = React.useId();
  const filteredRows = filterPortfolioDashboardRows(rows, searchTerm, filters);
  const columns = projectMasterReportColumns(selectedGroups);
  // Keep room to read scrolling content even when all three identities are
  // frozen on a narrow screen. Desktop widths retain the normal table pattern.
  const widths = columns.map(column => column.group !== "identity" ? `${column.width}px`
    : column.key === "year" ? `clamp(56px, 8vw, ${column.width}px)`
      : `clamp(76px, 17vw, ${column.width}px)`);
  const totalWidth = `calc(${widths.join(" + ")})`;
  const offsets = columns.map((column, index) => column.group !== "identity" ? undefined
    : index === 0 ? "0px" : `calc(${widths.slice(0, index).join(" + ")})`);
  const boundary = (index: number) => index > 0 && columns[index - 1].group !== columns[index].group ? "border-l-2 border-l-slate-300" : "";

  return <section aria-label="Project Master Report" className="flex w-full min-w-0 flex-col gap-5 bg-slate-100 px-4 py-5 sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <button type="button" aria-label="Back to Dashboard" onClick={onBack} className="mb-2 text-sm text-slate-600 underline">← Dashboard</button>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Project Master Report</h1>
      </div>
      <button type="button" disabled={selectedGroups.length === 0} onClick={() => onExport(filteredRows, columns)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">Export to Excel</button>
    </header>

    <PortfolioSearchFilters id={id} searchTerm={searchTerm} onSearchChange={setSearchTerm} filters={filters} onFiltersChange={setFilters} options={portfolioDashboardFilterOptions(rows)} />

    <fieldset className="rounded-xl border border-slate-200 bg-white px-4 pb-4 shadow-sm">
      <legend className="px-1 text-base font-semibold text-slate-900">Export Contents</legend>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-3">
        {projectMasterReportGroups.map(group => <label key={group.key} className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={selectedGroups.includes(group.key)} onChange={event => setSelectedGroups(current => event.target.checked ? [...current, group.key] : current.filter(key => key !== group.key))} className="h-4 w-4 accent-slate-900" />
          {group.label}
        </label>)}
      </div>
    </fieldset>

    <section aria-labelledby={`${id}-count`} className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
      <h2 id={`${id}-count`} className="p-4 text-base font-semibold text-slate-900">{filteredRows.length} {filteredRows.length === 1 ? "Project" : "Projects"}</h2>
      <div role="region" aria-label="Project Master Report table" tabIndex={0} className="min-w-0 max-h-[70vh] max-w-full overflow-auto overscroll-contain border-y border-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
        <table aria-label="Project Master Report" className="text-left text-sm" style={{ tableLayout: "fixed", width: totalWidth }}>
          <colgroup>{columns.map((column, index) => <col key={column.key} style={{ width: widths[index] }} />)}</colgroup>
          <thead className="sticky top-0 z-20 bg-slate-100 text-xs font-semibold text-slate-600">
            <tr>{columns.map((column, index) => <th key={column.key} scope="col" data-column-key={column.key} data-group={column.group} style={{ left: offsets[index] }} className={`break-words border-b border-slate-300 bg-slate-100 px-2 py-3 sm:px-4 ${offsets[index] === undefined ? "" : "sticky z-30"} ${boundary(index)}`}>
              {column.label}
            </th>)}</tr>
          </thead>
          <tbody>
            {filteredRows.map(row => {
              const values = projectMasterReportCells(state, row, columns);
              return <tr key={row.projectId} data-project-id={row.projectId} className="group border-t border-slate-100 text-slate-700">
                {columns.map((column, index) => <td key={column.key} data-column-key={column.key} data-group={column.group} style={{ left: offsets[index] }} className={`break-words bg-white px-2 py-3.5 align-middle sm:px-4 group-hover:bg-slate-50 ${offsets[index] === undefined ? "" : "sticky z-10"} ${boundary(index)}`}>{values[index]}</td>)}
              </tr>;
            })}
            {filteredRows.length === 0 && <tr><td colSpan={columns.length} className="px-4 py-10 text-slate-500">No projects found</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </section>;
}
