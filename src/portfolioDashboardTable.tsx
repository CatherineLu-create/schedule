import * as React from "react";
import type { PortfolioCurrentPublishedRead, PortfolioDashboardRow } from "./application/selectors/portfolioDashboardRows";
import type { ProjectId } from "./domain/shared/ids";
import {
  portfolioStickyColumnKeys, resizePortfolioColumnWidth,
  type PortfolioColumn, type PortfolioColumnKey, type PortfolioColumnWidths, type PortfolioProjectInfoColumnKey,
  type PortfolioScheduleColumnMapping, type PortfolioVisibleSchema,
} from "./portfolioDashboardColumns";

export interface PortfolioDashboardTableProps {
  readonly rows: readonly PortfolioDashboardRow[];
  readonly schema: PortfolioVisibleSchema;
  readonly onOpenProject: (projectId: ProjectId) => void;
}
interface BottomScrollerLayout {
  readonly contentWidth: number;
  readonly left: number;
  readonly visible: boolean;
  readonly width: number;
}
const hiddenBottomScrollerLayout: BottomScrollerLayout = {
  contentWidth: 0,
  left: 0,
  visible: false,
  width: 0,
};
const display = (value: string) => value === "-" ? "—" : value;
const projectValues: Record<PortfolioProjectInfoColumnKey, (row: PortfolioDashboardRow) => string> = {
  projectStatus: (row) => row.project.projectStatus,
  year: (row) => row.project.year,
  name: (row) => row.project.projectName,
  qciProjectName: (row) => row.project.qciModelName,
  customer: (row) => row.project.customer,
  category: (row) => row.category,
  productLine: (row) => row.project.productLine,
  size: (row) => row.project.panelSize,
  cpu: (row) => row.project.cpu,
  gpu: (row) => row.project.gpu,
  pcbNumber: (row) => row.pcbNumber,
};

function schedulePresentation(read: PortfolioCurrentPublishedRead, label: string) {
  if (read.kind === "unavailable") return { state: "unavailable", title: "Schedule data unavailable", tone: "bg-rose-50/70 text-rose-700" };
  if (read.kind === "noPublishedSchedule") return { state: "noPublishedSchedule", title: "No published schedule", tone: "text-slate-400" };
  if (read.milestoneCount === 0) return { state: "publishedEmpty", title: `${read.versionLabel} · No milestones`, tone: "bg-sky-50/50 text-sky-700" };
  return { state: "published", title: `${read.versionLabel} · ${label}`, tone: "text-slate-600" };
}

function ScheduleValue({ read, mapping }: { read: PortfolioCurrentPublishedRead; mapping: PortfolioScheduleColumnMapping }) {
  if (read.kind !== "published" || read.milestoneCount === 0 || mapping.valueMode === "placeholder") return <>—</>;
  const occurrences = read.cells.find((cell) => cell.milestoneDefinitionId === mapping.milestoneDefinitionId)?.occurrences ?? [];
  const displayableOccurrences = mapping.emptyWhenNotApplicableOrUndated
    ? occurrences.filter((occurrence) =>
        occurrence.applicability === "applicable"
        && (occurrence.plan !== "-" || occurrence.actual !== "-"))
    : occurrences;
  if (displayableOccurrences.length === 0) return <>—</>;
  return <div className="space-y-2 whitespace-normal text-xs leading-5">
    {displayableOccurrences.map((occurrence) => <div key={occurrence.milestoneId} data-milestone-id={occurrence.milestoneId} className="border-b border-slate-100 pb-1 last:border-0 last:pb-0">
      {occurrence.applicability === "notApplicable" ? (
        <div>N/A</div>
      ) : (
        <>
          <div className="text-[10px] font-medium text-slate-500">Applicable</div>
          <div>P: {display(occurrence.plan)}</div>
          <div>A: {display(occurrence.actual)}</div>
        </>
      )}
    </div>)}
  </div>;
}

function ProjectStatus({ value }: { value: string }) {
  if (value === "-") return <span className="text-slate-400">—</span>;
  return <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{value}</span>;
}

export function PortfolioDashboardTable({ rows, schema, onOpenProject }: PortfolioDashboardTableProps): React.ReactElement {
  const [resizedWidths, setWidths] = React.useState<PortfolioColumnWidths>({});
  const widths = Object.fromEntries(schema.columns.map(column => [column.key, resizedWidths[column.key] ?? column.defaultWidth])) as Record<PortfolioColumnKey, number>;
  const [resizing, setResizing] = React.useState<{ key: PortfolioColumnKey; minWidth: number; startX: number; startWidth: number } | null>(null);
  const [bottomScrollerLayout, setBottomScrollerLayout] = React.useState<BottomScrollerLayout>(
    hiddenBottomScrollerLayout,
  );
  const tableViewportRef = React.useRef<HTMLDivElement>(null);
  const bottomScrollerRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (resizing === null) return;
    const move = (event: MouseEvent) => setWidths((current) => ({ ...current, [resizing.key]: resizePortfolioColumnWidth(resizing.startWidth, event.clientX - resizing.startX, resizing.minWidth) }));
    const finish = () => setResizing(null);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", finish);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", finish);
    };
  }, [resizing]);

  const offsets = new Map<PortfolioColumnKey, number>();
  let offset = 0;
  for (const key of portfolioStickyColumnKeys) { offsets.set(key, offset); offset += widths[key]; }
  const stickyStyle = (column: PortfolioColumn): React.CSSProperties | undefined => offsets.has(column.key)
    ? { "--portfolio-sticky-left": `${offsets.get(column.key)}px` } as React.CSSProperties
    : undefined;
  const stickyClassName = (column: PortfolioColumn, header = false) => offsets.has(column.key)
    ? `lg:sticky lg:left-[var(--portfolio-sticky-left)] ${header ? "lg:z-30" : "lg:z-10"}`
    : "";
  const totalWidth = schema.columns.reduce((total, column) => total + widths[column.key], 0);

  const updateBottomScrollerLayout = React.useCallback(() => {
    const tableViewport = tableViewportRef.current;
    if (tableViewport === null) return;
    const rect = tableViewport.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const clippedLeft = Math.max(0, rect.left);
    const clippedRight = Math.min(window.innerWidth, rect.right);
    const width = Math.max(0, clippedRight - clippedLeft);
    const horizontalScrollRange = Math.max(
      0,
      tableViewport.scrollWidth - tableViewport.clientWidth,
    );
    const nextLayout = {
      contentWidth: horizontalScrollRange + width,
      left: clippedLeft,
      visible: width > 0
        && rect.bottom > 0
        && rect.top < viewportHeight
        && tableViewport.scrollWidth > tableViewport.clientWidth
        && rect.bottom > viewportHeight,
      width,
    };
    setBottomScrollerLayout((current) => current.contentWidth === nextLayout.contentWidth
      && current.left === nextLayout.left
      && current.visible === nextLayout.visible
      && current.width === nextLayout.width
      ? current
      : nextLayout);
    const bottomScroller = bottomScrollerRef.current;
    if (bottomScroller !== null && bottomScroller.scrollLeft !== tableViewport.scrollLeft) {
      bottomScroller.scrollLeft = tableViewport.scrollLeft;
    }
  }, []);

  React.useLayoutEffect(() => {
    updateBottomScrollerLayout();
  });

  React.useLayoutEffect(() => {
    const tableViewport = tableViewportRef.current;
    if (tableViewport === null) return;
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateBottomScrollerLayout);
    resizeObserver?.observe(tableViewport);
    const table = tableViewport.querySelector("table");
    if (table !== null) resizeObserver?.observe(table);
    window.addEventListener("resize", updateBottomScrollerLayout);
    window.addEventListener("scroll", updateBottomScrollerLayout, { passive: true });
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateBottomScrollerLayout);
      window.removeEventListener("scroll", updateBottomScrollerLayout);
    };
  }, [updateBottomScrollerLayout]);

  React.useLayoutEffect(() => {
    if (!bottomScrollerLayout.visible) return;
    const tableViewport = tableViewportRef.current;
    const bottomScroller = bottomScrollerRef.current;
    if (tableViewport !== null && bottomScroller !== null
      && bottomScroller.scrollLeft !== tableViewport.scrollLeft) {
      bottomScroller.scrollLeft = tableViewport.scrollLeft;
    }
  }, [
    bottomScrollerLayout.contentWidth,
    bottomScrollerLayout.visible,
    bottomScrollerLayout.width,
  ]);

  const synchronizeScrollLeft = (
    source: HTMLDivElement,
    target: HTMLDivElement | null,
  ): void => {
    if (target !== null && target.scrollLeft !== source.scrollLeft) {
      target.scrollLeft = source.scrollLeft;
    }
  };

  return <><div ref={tableViewportRef} aria-label="Projects table scroll area" role="region" tabIndex={0} data-testid="portfolio-table-scroll"
    onScroll={(event) => synchronizeScrollLeft(event.currentTarget, bottomScrollerRef.current)}
    className="min-w-0 max-h-[70vh] max-w-full overflow-auto overscroll-contain border-y border-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
    <table aria-label="Projects" className="text-left text-sm" style={{ tableLayout: "fixed", width: totalWidth }}>
      <colgroup>{schema.columns.map((column) => <col key={column.key} style={{ width: widths[column.key] }} />)}</colgroup>
      <thead className="sticky top-0 z-40 text-xs font-semibold text-slate-500">
        <tr>{schema.domainGroups.map((group) => <th key={group.key} scope="colgroup" colSpan={group.colSpan} title={group.key === "team" ? "QCI PM active; other Team columns migration pending" : undefined}
          className={`h-9 border-b border-r border-slate-300 px-4 py-2 text-center text-xs font-bold tracking-[0.14em] ${group.key === "project" ? "bg-slate-200 text-slate-800" : group.key === "schedule" ? "bg-sky-100 text-sky-900" : "bg-violet-100 text-violet-900"}`}>{group.label}</th>)}</tr>
        <tr>{schema.subgroups.map((group) => <th key={group.key} scope="colgroup" colSpan={group.colSpan}
          className={`h-9 border-b border-r border-slate-200 px-3 py-2 text-center text-[11px] font-bold ${group.domain === "project" ? "bg-slate-100 text-slate-700" : group.domain === "schedule" ? "bg-sky-50 text-sky-800" : "bg-violet-50 text-violet-800"}`}>{group.label}</th>)}</tr>
        <tr>{schema.columns.map((column, index) => <th key={column.key} scope="col" data-column-key={column.key} style={stickyStyle(column)}
          className={`relative h-11 border-b border-slate-300 px-4 py-3 ${stickyClassName(column, true)} ${offsets.has(column.key) ? "bg-slate-100 shadow-[2px_0_0_0_rgb(203_213_225)]" : "bg-white"} ${index > 0 && schema.columns[index - 1].domain !== column.domain ? "border-l-4 border-l-slate-300" : ""}`}>
          <span className="line-clamp-2 whitespace-normal break-words leading-tight" title={column.label}>{column.label}</span>
          <button type="button" aria-label={`Resize ${column.label} column`} title="Drag or use Left/Right arrow keys to resize"
            className="absolute right-0 top-0 h-full w-2 cursor-col-resize border-r border-slate-200 transition hover:bg-slate-200 focus-visible:bg-sky-200 focus-visible:outline-2 focus-visible:outline-sky-600"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); setResizing({ key: column.key, minWidth: column.minWidth, startX: event.clientX, startWidth: widths[column.key] }); }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault(); event.stopPropagation();
              const delta = event.key === "ArrowLeft" ? -10 : 10;
              setWidths((current) => ({ ...current, [column.key]: resizePortfolioColumnWidth(current[column.key] ?? column.defaultWidth, delta, column.minWidth) }));
            }} />
        </th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row) => <tr key={row.projectId} data-project-id={row.projectId} onClick={() => onOpenProject(row.projectId)} className="group cursor-pointer border-t border-slate-100 text-slate-700 transition hover:bg-slate-50 focus-within:bg-sky-50/50">
          {schema.columns.map((column, index) => {
            const mapping = column.domain === "schedule" ? schema.scheduleMappings.find((entry) => entry.key === column.key) : undefined;
            const schedule = mapping ? schedulePresentation(row.schedule, column.label) : undefined;
            const qciPmColumn = column.key === "team:qciPm";
            const pendingTeamColumn = column.domain === "team" && !qciPmColumn;
            const value = column.domain === "project"
              ? projectValues[column.key as PortfolioProjectInfoColumnKey](row)
              : qciPmColumn
                ? row.qciPm?.label ?? "-"
                : "-";
            return <td key={column.key} data-column-key={column.key} data-domain={column.domain} data-schedule-state={schedule?.state}
              title={schedule?.title ?? (pendingTeamColumn ? "Migration pending" : undefined)} style={stickyStyle(column)}
              className={`px-4 py-3.5 align-middle ${stickyClassName(column)} ${column.domain === "schedule" ? schedule?.tone : "whitespace-nowrap"} ${pendingTeamColumn ? "text-slate-400" : ""} ${offsets.has(column.key) ? "bg-white shadow-[1px_0_0_0_rgb(241_245_249)] group-hover:bg-slate-50 group-focus-within:bg-sky-50" : ""} ${index > 0 && schema.columns[index - 1].domain !== column.domain ? "border-l-4 border-l-slate-200" : ""}`}>
              {mapping ? <ScheduleValue read={row.schedule} mapping={mapping} /> : column.key === "name"
                ? <button type="button" aria-label={`Open Project ${display(value)}`} onClick={(event) => { event.stopPropagation(); onOpenProject(row.projectId); }} className="max-w-full truncate rounded text-left font-semibold text-slate-900 hover:text-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">{display(value)}</button>
                : column.key === "projectStatus" ? <ProjectStatus value={value} />
                  : <span className="block truncate" title={column.domain === "project" ? display(value) : undefined}>{display(value)}</span>}
            </td>;
          })}
        </tr>)}
        {rows.length === 0 && <tr><td colSpan={schema.columns.length} className="px-4 py-10 text-slate-500">No projects match the current search and filters</td></tr>}
      </tbody>
    </table>
  </div>
  <div
    ref={bottomScrollerRef}
    aria-label="All Projects bottom horizontal scrollbar"
    role="region"
    tabIndex={bottomScrollerLayout.visible ? 0 : -1}
    data-testid="portfolio-bottom-scroll"
    hidden={!bottomScrollerLayout.visible}
    onScroll={(event) => synchronizeScrollLeft(event.currentTarget, tableViewportRef.current)}
    className="fixed bottom-0 z-50 h-4 overflow-x-auto overflow-y-hidden border-t border-slate-300 bg-white/95 shadow-[0_-2px_6px_rgba(15,23,42,0.14)]"
    style={{ left: bottomScrollerLayout.left, width: bottomScrollerLayout.width }}
  >
    <div aria-hidden="true" className="h-px" style={{ width: bottomScrollerLayout.contentWidth }} />
  </div></>;
}
