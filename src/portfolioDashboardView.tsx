import React from "react";
import type {
  DashboardAttentionGroup,
  DashboardAttentionRead,
} from "./application/selectors/dashboardAttention";
import type { PortfolioDashboardRow } from "./application/selectors/portfolioDashboardRows";
import {
  milestoneDefinitions,
  milestoneTypeCatalog,
} from "./config/v2/referenceData";
import { formatDateOnly } from "./domain/shared/dateOnly";
import type { MilestoneId, ProjectId } from "./domain/shared/ids";
import {
  emptyPortfolioDashboardFilters,
  filterPortfolioDashboardRows,
  portfolioDashboardFilterChips,
  portfolioDashboardFilterOptions,
  type PortfolioDashboardFilterKey,
} from "./portfolioDashboardFilters";
import { PortfolioDashboardTable } from "./portfolioDashboardTable";

export interface PortfolioDashboardViewProps {
  readonly attention: DashboardAttentionRead;
  readonly rows: readonly PortfolioDashboardRow[];
  readonly onCreateProject: () => void;
  readonly onExport: () => void;
  readonly onOpenProject: (projectId: ProjectId) => void;
}

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

interface AttentionProjectPresentation {
  readonly projectId: ProjectId;
  readonly projectName: string;
  readonly milestones: readonly {
    readonly milestoneId: MilestoneId;
    readonly typeLabel: string;
    readonly planLabel: string;
  }[];
}

const milestoneDefinitionById = new Map(
  milestoneDefinitions.map((definition) => [definition.id, definition]),
);
const milestoneTypeById = new Map(
  milestoneTypeCatalog.map((type) => [type.id, type]),
);

function attentionProjectPresentations(
  group: DashboardAttentionGroup,
  rows: readonly PortfolioDashboardRow[],
): readonly AttentionProjectPresentation[] {
  const rowByProjectId = new Map(rows.map((row) => [row.projectId, row]));

  return group.projectIds.map((projectId) => {
    const row = rowByProjectId.get(projectId);
    if (row === undefined) {
      throw new Error(`Attention Project row is unavailable: ${projectId}`);
    }

    const milestones = group.matches
      .filter((match) => match.projectId === projectId)
      .map((match) => {
        const definition = milestoneDefinitionById.get(
          match.milestoneDefinitionId,
        );
        if (definition === undefined) {
          throw new Error(
            `Attention milestone definition is unavailable: ${match.milestoneDefinitionId}`,
          );
        }
        const type = milestoneTypeById.get(definition.milestoneTypeId);
        if (type === undefined) {
          throw new Error(
            `Attention milestone type is unavailable: ${definition.milestoneTypeId}`,
          );
        }
        return {
          milestoneId: match.milestoneId,
          typeLabel: type.displayName,
          planLabel: formatDateOnly(match.plan),
        };
      });

    return {
      projectId,
      projectName: row.project.projectName,
      milestones,
    };
  });
}

export function PortfolioDashboardView({ attention, rows, onCreateProject, onExport, onOpenProject }: PortfolioDashboardViewProps): React.ReactElement {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [filters, setFilters] = React.useState(emptyPortfolioDashboardFilters);
  const id = React.useId();
  const options = portfolioDashboardFilterOptions(rows);
  const filteredRows = filterPortfolioDashboardRows(rows, searchTerm, filters);
  const chips = portfolioDashboardFilterChips(filters, options);
  const attentionCards = [
    { title: "Blocking Issues", value: "—", supporting: "Calculation not active", tone: "border-rose-100 bg-rose-50/60 text-rose-800", projects: [] },
    {
      title: "Upcoming Milestones",
      value: attention.kind === "available" ? String(attention.due.projectCount) : "—",
      supporting: attention.kind === "available" ? "Next 14 days · unique projects" : "Calculation unavailable",
      tone: "border-amber-100 bg-amber-50/60 text-amber-800",
      projects: attention.kind === "available"
        ? attentionProjectPresentations(attention.due, rows)
        : [],
    },
    {
      title: "Overdue",
      value: attention.kind === "available" ? String(attention.overdue.projectCount) : "—",
      supporting: attention.kind === "available" ? "Past due · unique projects" : "Calculation unavailable",
      tone: "border-orange-100 bg-orange-50/60 text-orange-800",
      projects: attention.kind === "available"
        ? attentionProjectPresentations(attention.overdue, rows)
        : [],
    },
  ] as const;

  return <section aria-label="Portfolio Dashboard" style={{ isolation: "isolate" }} className="flex w-full min-w-0 flex-col gap-5 bg-slate-100 px-4 py-5 sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Project Information</h1>
        <p className="mt-1 text-sm text-slate-500">Dashboard</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onExport()} className={`rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 ${focus}`}>Export to Excel</button>
        <button type="button" aria-label="Create Project" onClick={() => onCreateProject()} className={`rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 ${focus}`}>+ Create Project</button>
      </div>
    </header>

    <section aria-labelledby={`${id}-attention`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 id={`${id}-attention`} className="text-base font-semibold text-slate-900">Needs Attention</h2>
      <p className="mt-1 text-xs text-slate-500">Upcoming and Overdue use Current Published Schedule.</p>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {attentionCards.map((card) => <div key={card.title} role="group" aria-label={card.title} className={`rounded-lg border p-4 ${card.tone}`}>
          <h3 className="text-sm font-medium">{card.title}</h3>
          <div className="mt-2 text-2xl font-semibold">{card.value}</div>
          <p className="mt-1 text-xs">{card.supporting}</p>
          {card.projects.length > 0 && <div className="mt-3 space-y-3 border-t border-current/15 pt-3">
            {card.projects.map((project) => <div key={project.projectId}>
              <button
                type="button"
                aria-label={`Open Project ${project.projectName}`}
                onClick={() => onOpenProject(project.projectId)}
                className={`max-w-full text-left text-sm font-semibold underline-offset-2 hover:underline ${focus}`}
              >
                {project.projectName}
              </button>
              <ul className="mt-1 space-y-0.5 text-xs">
                {project.milestones.map((milestone) => <li key={milestone.milestoneId}>
                  {milestone.typeLabel} · {milestone.planLabel}
                </li>)}
              </ul>
            </div>)}
          </div>}
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
          <select id={`${id}-${control.key}`} value={filters[control.key]} onChange={(event) => setFilters((current) => ({ ...current, [control.key]: event.target.value }))} className={`mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm ${focus}`}>
            <option value="">All</option>
            {options[control.key].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
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
        <p className="text-xs text-slate-500">Scroll horizontally to view Schedule and Team Member</p>
      </div>
      <PortfolioDashboardTable rows={filteredRows} schemaRows={rows} onOpenProject={onOpenProject} />
    </section>
  </section>;
}
