import React from "react";
import ReactDOM from "react-dom/client";
import * as XLSX from "xlsx";
import {
  defaultProjectListColumnWidths,
  projectListColumns,
  resizeColumnWidth,
  type ColumnWidths,
  type ProjectListColumnKey,
} from "./dashboardColumns";
import {
  buildProjectFromForm,
  dashboardExportRow,
  dashboardProjectsFromWorksheetRows,
  projectStatusOptions,
  toProjectForm,
  updateProjectFromForm,
  type DashboardProject,
  type ProjectForm,
} from "./projectMaster";
import {
  addCustomField,
  createEmptyMember,
  defaultTeamMemberFields,
  deleteCustomField,
  deleteMember,
  emptyTeamMembersState,
  teamMembersFromWorksheetRows,
  updateMemberValue,
  type TeamMembersState,
} from "./teamMembers";
import {
  countScheduleWarnings,
  createInitialScheduleWarnings,
  hasScheduleWarning,
  resolveScheduleWarning,
  type ScheduleWarnings,
} from "./scheduleWarnings";
import {
  emptyScheduleFilters,
  filterScheduleRows,
  isScheduleRowCompleteOrNotApplicable,
  removeScheduleFilter,
  scheduleFilterChips,
  scheduleFilterOptions,
  updateScheduleFilter,
  type ScheduleFilterKey,
  type ScheduleFilterState,
} from "./scheduleFilters";
import {
  createInitialVersionHistory,
  publishVersion as publishScheduleVersion,
  selectVersion,
} from "./versionHistory";
import dashboardProjectRows from "./dashboardProjectRows.json";
import scheduleOutput from "./schedule-output_3108.json";
import "./styles.css";

type Page = "dashboard" | "workspace" | "draft";

type WorkspaceResource = "schedule" | "teamMembers";

type ScheduleItem = {
  id: string;
  phase: string;
  stage: string;
  milestone: string;
  plan: string;
  actual: string;
};

type ScheduleKey = keyof ScheduleItem;

type ScheduleVersionMeta = {
  warnings: ScheduleWarnings;
};

type FilterKey = "year" | "productLine" | "size" | "cpu" | "customer";

type DashboardFilters = Record<FilterKey, string>;

const dashboardProjects: DashboardProject[] = dashboardProjectsFromWorksheetRows(dashboardProjectRows as unknown[][]);
const project = dashboardProjects[0];

const schedule: ScheduleItem[] = scheduleOutput.records.map((record, index) => ({
  id: `schedule-row-${index + 1}`,
  phase: record.section || "-",
  stage: record.stage || "-",
  milestone: record.milestone || "-",
  plan: record.plan_content || "-",
  actual: record.actual_content || "-",
}));

const scheduleColumns: ScheduleKey[] = ["phase", "stage", "milestone", "plan", "actual"];

function exportScheduleToExcel() {
  const rows = schedule.map((item) => ({
    Phase: item.phase,
    Stage: item.stage,
    Milestone: item.milestone,
    Plan: item.plan,
    Actual: item.actual,
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Current Schedule");
  XLSX.writeFile(workbook, "ThinkBook_X14_Current_Schedule.xlsx");
}

function exportDashboardProjectListToExcel(projects: DashboardProject[]) {
  const rows = projects.map(dashboardExportRow);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Project List");
  XLSX.writeFile(workbook, "PIP_Dashboard_Project_List.xlsx");
}

function App() {
  const [page, setPage] = React.useState<Page>("dashboard");
  const [projects, setProjects] = React.useState<DashboardProject[]>(dashboardProjects);
  const [selectedProject, setSelectedProject] = React.useState<DashboardProject>(project);
  const [activeResource, setActiveResource] = React.useState<WorkspaceResource>("schedule");
  const [isCreateProjectOpen, setIsCreateProjectOpen] = React.useState(false);
  const [isEditProjectOpen, setIsEditProjectOpen] = React.useState(false);
  const [teamMembersByProject, setTeamMembersByProject] = React.useState<Record<string, TeamMembersState>>({});
  const teamMemberIdCounter = React.useRef(1);
  const [versionHistory, setVersionHistory] = React.useState(() =>
    createInitialVersionHistory<ScheduleItem, ScheduleVersionMeta>(schedule, {
      warnings: createInitialScheduleWarnings(),
    }),
  );
  const latestVersion = versionHistory.versions[versionHistory.versions.length - 1].version;
  const selectedProjectKey = selectedProject.id || selectedProject.name;
  const selectedTeamMembers = teamMembersByProject[selectedProjectKey] || emptyTeamMembersState;
  const selectedScheduleWarnings = versionHistory.currentMeta?.warnings || {};

  const openProject = (item: DashboardProject) => {
    setSelectedProject(item);
    setActiveResource("schedule");
    setPage("workspace");
  };
  const publishVersion = (draftSchedule: ScheduleItem[], warnings: ScheduleWarnings) => {
    setVersionHistory((current) => publishScheduleVersion(current, draftSchedule, { warnings }));
    setActiveResource("schedule");
    setPage("workspace");
  };
  const createProject = (input: ProjectForm) => {
    const newProject = {
      ...buildProjectFromForm(input),
      id: `created-project-${projects.length + 1}`,
    };

    setProjects((current) => [...current, newProject]);
    setTeamMembersByProject((current) => ({
      ...current,
      [newProject.id || newProject.name]: emptyTeamMembersState,
    }));
    setIsCreateProjectOpen(false);
  };
  const saveProjectChanges = (input: ProjectForm) => {
    const previousKey = selectedProjectKey;
    const updatedProject = updateProjectFromForm(selectedProject, input);

    setProjects((current) => current.map((item) => (item === selectedProject ? updatedProject : item)));
    setTeamMembersByProject((current) => {
      if (previousKey === (updatedProject.id || updatedProject.name)) {
        return current;
      }

      const { [previousKey]: existingTeamMembers, ...remainingProjects } = current;

      return {
        ...remainingProjects,
        [updatedProject.id || updatedProject.name]: existingTeamMembers || emptyTeamMembersState,
      };
    });
    setSelectedProject(updatedProject);
    setIsEditProjectOpen(false);
  };
  const updateSelectedTeamMembers = (nextState: TeamMembersState) => {
    setTeamMembersByProject((current) => ({
      ...current,
      [selectedProjectKey]: nextState,
    }));
  };
  const importTeamMembers = async (file: File) => {
    if (
      selectedTeamMembers.members.length > 0 &&
      !window.confirm("Importing a new file will replace the current Team Member table. Continue?")
    ) {
      return;
    }

    const nextImportId = teamMemberIdCounter.current++;
    const workbook = XLSX.read(await file.arrayBuffer());
    const firstWorksheetName = workbook.SheetNames[0];

    if (!firstWorksheetName) {
      return;
    }

    const worksheet = workbook.Sheets[firstWorksheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "" });

    updateSelectedTeamMembers(teamMembersFromWorksheetRows(rows, `import-${nextImportId}`, file.name));
  };
  const addTeamMember = () => {
    const nextMemberId = teamMemberIdCounter.current++;

    updateSelectedTeamMembers({
      ...selectedTeamMembers,
      members: [
        ...selectedTeamMembers.members,
        createEmptyMember(selectedTeamMembers.fields, `member-${nextMemberId}`),
      ],
    });
  };
  const editTeamMemberValue = (memberId: string, field: string, value: string) => {
    updateSelectedTeamMembers(updateMemberValue(selectedTeamMembers, memberId, field, value));
  };
  const removeTeamMember = (memberId: string) => {
    updateSelectedTeamMembers(deleteMember(selectedTeamMembers, memberId));
  };
  const addTeamMemberField = (fieldName: string) => {
    updateSelectedTeamMembers(addCustomField(selectedTeamMembers, fieldName));
  };
  const removeTeamMemberField = (fieldName: string) => {
    updateSelectedTeamMembers(deleteCustomField(selectedTeamMembers, fieldName));
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-100 text-slate-950">
      {page === "dashboard" && (
        <Dashboard
          onCreateProject={() => setIsCreateProjectOpen(true)}
          onOpenProject={openProject}
          projects={projects}
        />
      )}
      {page === "workspace" && (
        <ProjectWorkspace
          activeResource={activeResource}
          onAddTeamMember={addTeamMember}
          onAddTeamMemberField={addTeamMemberField}
          onBack={() => setPage("dashboard")}
          onDeleteTeamMember={removeTeamMember}
          onDeleteTeamMemberField={removeTeamMemberField}
          onEditProject={() => setIsEditProjectOpen(true)}
          onEditSchedule={() => setPage("draft")}
          onImportTeamMembers={importTeamMembers}
          onSelectResource={setActiveResource}
          onSelectVersion={(version) => setVersionHistory((current) => selectVersion(current, version))}
          onUpdateTeamMember={editTeamMemberValue}
          project={selectedProject}
          schedule={versionHistory.currentSchedule}
          scheduleWarnings={selectedScheduleWarnings}
          teamMembers={selectedTeamMembers}
          version={versionHistory.selectedVersion}
          versions={versionHistory.versions.map((entry) => entry.version)}
          isLatestVersion={versionHistory.selectedVersion === latestVersion}
        />
      )}
      {page === "draft" && (
        <WorkingDraft
          onCancelDraft={() => setPage("workspace")}
          onPublishComplete={publishVersion}
          project={selectedProject}
          schedule={versionHistory.currentSchedule}
          scheduleWarnings={selectedScheduleWarnings}
          version={versionHistory.selectedVersion}
          versions={versionHistory.versions.map((entry) => entry.version)}
        />
      )}
      {isCreateProjectOpen && (
        <ProjectDialog
          initialValue={{
            year: "",
            customer: "",
            productLine: "",
            projectName: "",
            qciModelName: "",
            acerModelName: "",
            acerMarketingName: "",
            panelSize: "",
            cpu: "",
            gpu: "",
            ssid: "",
            rmn: "",
            projectStatus: "Pending",
          }}
          onCancel={() => setIsCreateProjectOpen(false)}
          onSave={createProject}
          saveLabel="Save"
          title="Create Project"
        />
      )}
      {isEditProjectOpen && (
        <ProjectDialog
          initialValue={toProjectForm(selectedProject)}
          onCancel={() => setIsEditProjectOpen(false)}
          onSave={saveProjectChanges}
          saveLabel="Save Changes"
          title="Edit Project"
        />
      )}
    </main>
  );
}

function projectListCellValue(project: DashboardProject, key: ProjectListColumnKey) {
  const values: Record<ProjectListColumnKey, React.ReactNode> = {
    year: project.year,
    customer: project.customer,
    productLine: project.productLine,
    name: <span className="font-medium">{project.name}</span>,
    qciProjectName: project.qciProjectName,
    size: project.size,
    cpu: project.cpu,
    gpu: project.gpu,
    projectStatus: <StatusBadge status={project.projectStatus} />,
    currentStage: project.currentStage,
    mdrr: project.mdrr,
  };

  return values[key];
}

function Dashboard({
  onCreateProject,
  onOpenProject,
  projects,
}: {
  onCreateProject: () => void;
  onOpenProject: (project: DashboardProject) => void;
  projects: DashboardProject[];
}) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [filters, setFilters] = React.useState<DashboardFilters>({
    year: "",
    productLine: "",
    size: "",
    cpu: "",
    customer: "",
  });
  const [columnWidths, setColumnWidths] = React.useState<ColumnWidths>(defaultProjectListColumnWidths);
  const [resizingColumn, setResizingColumn] = React.useState<{
    key: ProjectListColumnKey;
    minWidth: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredProjects = projects.filter(
    (item) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          item.name,
          item.qciProjectName,
          item.productLine,
          item.customer,
          item.cpu,
          item.gpu,
        ].some((value) => value.toLowerCase().includes(normalizedSearch));

      return matchesSearch &&
      (!filters.year || item.year === filters.year) &&
      (!filters.productLine || item.productLine === filters.productLine) &&
      (!filters.size || item.size === filters.size) &&
      (!filters.cpu || item.cpu === filters.cpu) &&
      (!filters.customer || item.customer === filters.customer);
    },
  );
  const filterOptions = {
    year: Array.from(new Set(projects.map((item) => item.year).filter(Boolean))),
    productLine: Array.from(new Set(projects.map((item) => item.productLine).filter(Boolean))),
    size: Array.from(new Set(projects.map((item) => item.size).filter(Boolean))),
    cpu: Array.from(new Set(projects.map((item) => item.cpu).filter(Boolean))),
    customer: Array.from(new Set(projects.map((item) => item.customer).filter(Boolean))),
  };
  const activeFilters = [
    { key: "year", label: filters.year },
    { key: "productLine", label: filters.productLine },
    { key: "size", label: filters.size },
    { key: "cpu", label: filters.cpu },
    { key: "customer", label: filters.customer },
  ].filter((item): item is { key: FilterKey; label: string } => Boolean(item.label));

  const updateFilter = (key: FilterKey, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  };
  const clearFilter = (key: FilterKey) => {
    updateFilter(key, "");
  };
  const clearAllFilters = () => {
    setFilters({
      year: "",
      productLine: "",
      size: "",
      cpu: "",
      customer: "",
    });
  };
  const totalTableWidth = projectListColumns.reduce((total, column) => total + columnWidths[column.key], 0);

  React.useEffect(() => {
    if (!resizingColumn) {
      return undefined;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const deltaX = event.clientX - resizingColumn.startX;

      setColumnWidths((current) => ({
        ...current,
        [resizingColumn.key]: resizeColumnWidth(
          resizingColumn.startWidth,
          deltaX,
          resizingColumn.minWidth,
        ),
      }));
    };
    const handleMouseUp = () => {
      setResizingColumn(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingColumn]);

  return (
    <div className="mx-auto flex w-full max-w-none flex-col gap-5 px-6 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Project Information</h1>
          <div className="mt-1 text-sm font-normal text-slate-500">Dashboard</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm"
            onClick={() => exportDashboardProjectListToExcel(projects)}
          >
            Export to Excel
          </button>
          <button
            className="rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm text-white"
            onClick={onCreateProject}
          >
            Create Project
          </button>
        </div>
      </header>

      <section className="rounded-md border border-amber-200 bg-amber-50 p-4">
        <h2 className="text-lg font-semibold">Needs Attention</h2>
        <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <div className="font-semibold text-amber-950">Import Warning</div>
            {["Valour_ARX", "Macan S_ARX", "Mufasa_FRX"].map((name) => projects.find((item) => item.name === name)).filter((item): item is DashboardProject => Boolean(item)).map((item) => (
              <button className="mt-2 block text-left text-amber-900 underline" key={`parser-${item.id || item.qciProjectName}`} onClick={() => onOpenProject(item)}>
                {item.name}
              </button>
            ))}
          </div>
          <div>
            <div className="font-semibold text-amber-950">Milestone Due</div>
            {["Sportswagon_PNH", "GLS_Ni", "Sorento_PTZ"].map((name) => projects.find((item) => item.name === name)).filter((item): item is DashboardProject => Boolean(item)).map((item) => (
              <button className="mt-2 block text-left text-amber-900 underline" key={`due-${item.id || item.qciProjectName}`} onClick={() => onOpenProject(item)}>
                {item.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Search Project</h2>
        <input
          className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Search by project name or customer"
          type="search"
          onChange={(event) => setSearchTerm(event.target.value)}
          value={searchTerm}
        />
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Filters</h2>
          {activeFilters.map((item) => (
            <button
              className="rounded-full bg-slate-200 px-3 py-1 text-sm"
              key={item.key}
              onClick={() => clearFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
          {activeFilters.length > 0 && (
            <button className="rounded-full border border-slate-300 px-3 py-1 text-sm" onClick={clearAllFilters}>
              Clear All
            </button>
          )}
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-5">
          <label className="text-sm font-medium">
            Year
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal"
              onChange={(event) => updateFilter("year", event.target.value)}
              value={filters.year}
            >
              <option value="">All Years</option>
              {filterOptions.year.map((year) => (
                <option key={year}>{year}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Product Line
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal"
              onChange={(event) => updateFilter("productLine", event.target.value)}
              value={filters.productLine}
            >
              <option value="">All Product Lines</option>
              {filterOptions.productLine.map((productLine) => (
                <option key={productLine}>{productLine}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Panel Size
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal"
              onChange={(event) => updateFilter("size", event.target.value)}
              value={filters.size}
            >
              <option value="">All Panel Sizes</option>
              {filterOptions.size.map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            CPU
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal"
              onChange={(event) => updateFilter("cpu", event.target.value)}
              value={filters.cpu}
            >
              <option value="">All CPUs</option>
              {filterOptions.cpu.map((cpu) => (
                <option key={cpu}>{cpu}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Customer
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal"
              onChange={(event) => updateFilter("customer", event.target.value)}
              value={filters.customer}
            >
              <option value="">All Customers</option>
              {filterOptions.customer.map((customer) => (
                <option key={customer}>{customer}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <div className="p-4">
          <h2 className="text-lg font-semibold">Project List</h2>
        </div>
        <div className="max-w-full overflow-x-auto">
          <table
            className="border-t border-slate-200 text-left text-sm"
            style={{ tableLayout: "fixed", width: `${totalTableWidth}px` }}
          >
            <colgroup>
              {projectListColumns.map((column) => (
                <col key={column.key} style={{ width: `${columnWidths[column.key]}px` }} />
              ))}
            </colgroup>
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {projectListColumns.map((column) => (
                  <th className="relative px-4 py-3 font-semibold" key={column.key}>
                    <span>{column.label}</span>
                    <button
                      aria-label={`Resize ${column.label} column`}
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize border-r border-slate-300 hover:bg-slate-200"
                      onClick={(event) => event.stopPropagation()}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setResizingColumn({
                          key: column.key,
                          minWidth: column.minWidth,
                          startX: event.clientX,
                          startWidth: columnWidths[column.key],
                        });
                      }}
                      type="button"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map((item) => (
                <tr
                  className="cursor-pointer border-t border-slate-200 hover:bg-slate-50"
                  key={item.id || item.name}
                  onClick={() => onOpenProject(item)}
                >
                  {projectListColumns.map((column) => (
                    <td className="px-4 py-3 align-top" key={`${item.id || item.name}-${column.key}`}>
                      {projectListCellValue(item, column.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}

function ProjectDialog({
  initialValue,
  onCancel,
  onSave,
  saveLabel,
  title,
}: {
  initialValue: ProjectForm;
  onCancel: () => void;
  onSave: (input: ProjectForm) => void;
  saveLabel: string;
  title: string;
}) {
  const [form, setForm] = React.useState<ProjectForm>(initialValue);
  const updateForm = (key: keyof ProjectForm, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/20 px-4">
      <div className="w-full max-w-2xl rounded-md border border-slate-300 bg-white p-5">
        <h2 className="text-lg font-semibold">{title}</h2>

        <div className="mt-4 grid max-h-[70vh] gap-5 overflow-y-auto pr-1">
          <fieldset className="grid gap-3 rounded-md border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold">Project Identity</legend>
            <ProjectInput label="Project Name" value={form.projectName} onChange={(value) => updateForm("projectName", value)} />
            <ProjectInput label="QCI Model Name" value={form.qciModelName} onChange={(value) => updateForm("qciModelName", value)} />
            <ProjectInput label="Acer Model Name" value={form.acerModelName} onChange={(value) => updateForm("acerModelName", value)} />
            <ProjectInput label="Acer Marketing Name" value={form.acerMarketingName} onChange={(value) => updateForm("acerMarketingName", value)} />
          </fieldset>

          <fieldset className="grid gap-3 rounded-md border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold">Project Classification</legend>
            <ProjectInput label="Year" value={form.year} onChange={(value) => updateForm("year", value)} />
            <ProjectInput label="Customer" value={form.customer} onChange={(value) => updateForm("customer", value)} />
            <ProjectInput label="Product Line" value={form.productLine} onChange={(value) => updateForm("productLine", value)} />
          </fieldset>

          <fieldset className="grid gap-3 rounded-md border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold">Hardware</legend>
            <ProjectInput label="Panel Size" value={form.panelSize} onChange={(value) => updateForm("panelSize", value)} />
            <ProjectInput label="CPU" value={form.cpu} onChange={(value) => updateForm("cpu", value)} />
            <ProjectInput label="GPU" value={form.gpu} onChange={(value) => updateForm("gpu", value)} />
          </fieldset>

          <fieldset className="grid gap-3 rounded-md border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold">Internal Identifier</legend>
            <ProjectInput label="SSID" value={form.ssid} onChange={(value) => updateForm("ssid", value)} />
            <ProjectInput label="RMN" value={form.rmn} onChange={(value) => updateForm("rmn", value)} />
          </fieldset>

          <fieldset className="grid gap-3 rounded-md border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold">Project Management</legend>
            <ProjectSelect
              label="Project Status"
              value={form.projectStatus || "Pending"}
              onChange={(value) => updateForm("projectStatus", value)}
            />
          </fieldset>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-md border border-slate-300 px-4 py-2 text-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm text-white"
            onClick={() => onSave(form)}
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectSelect({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: ProjectForm["projectStatus"]) => void;
  value: ProjectForm["projectStatus"];
}) {
  return (
    <label className="grid gap-1 text-sm md:grid-cols-[180px_1fr] md:items-center">
      <span>{label}</span>
      <select
        className="rounded-md border border-slate-300 px-3 py-2"
        onChange={(event) => onChange(event.target.value as ProjectForm["projectStatus"])}
        value={value}
      >
        {projectStatusOptions.map((status) => (
          <option key={status}>{status}</option>
        ))}
      </select>
    </label>
  );
}

function StatusBadge({ status }: { status: DashboardProject["projectStatus"] }) {
  const colorClass = {
    Pending: "border-slate-300 bg-slate-100 text-slate-700",
    Ongoing: "border-blue-200 bg-blue-50 text-blue-700",
    MP: "border-emerald-200 bg-emerald-50 text-emerald-700",
    EOL: "border-zinc-300 bg-zinc-100 text-zinc-700",
  }[status];

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {status}
    </span>
  );
}

function ProjectInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm md:grid-cols-[180px_1fr] md:items-center">
      <span>{label}</span>
      <input
        className="rounded-md border border-slate-300 px-3 py-2"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function ProjectWorkspace({
  activeResource,
  isLatestVersion,
  onAddTeamMember,
  onAddTeamMemberField,
  onBack,
  onDeleteTeamMember,
  onDeleteTeamMemberField,
  onEditProject,
  onEditSchedule,
  onImportTeamMembers,
  onSelectResource,
  onSelectVersion,
  onUpdateTeamMember,
  project,
  schedule,
  scheduleWarnings,
  teamMembers,
  version,
  versions,
}: {
  activeResource: WorkspaceResource;
  isLatestVersion: boolean;
  onAddTeamMember: () => void;
  onAddTeamMemberField: (fieldName: string) => void;
  onBack: () => void;
  onDeleteTeamMember: (memberId: string) => void;
  onDeleteTeamMemberField: (fieldName: string) => void;
  onEditProject: () => void;
  onEditSchedule: () => void;
  onImportTeamMembers: (file: File) => void;
  onSelectResource: (resource: WorkspaceResource) => void;
  onSelectVersion: (version: string) => void;
  onUpdateTeamMember: (memberId: string, field: string, value: string) => void;
  project: DashboardProject;
  schedule: ScheduleItem[];
  scheduleWarnings: ScheduleWarnings;
  teamMembers: TeamMembersState;
  version: string;
  versions: string[];
}) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6">
      <button className="w-fit text-sm text-slate-600 underline" onClick={onBack}>
        Back to Dashboard
      </button>

      <section aria-label="Project Header" className="rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold">Project Master</h1>
            <div className="mt-3 grid gap-4 text-sm md:grid-cols-3">
              <div>
                <div className="font-semibold">Project Identity</div>
                <div className="mt-2 grid gap-1">
                  <div>Project Name: {project.name}</div>
                  <div>QCI Model Name: {project.qciProjectName}</div>
                  <div>Acer Model Name: {project.acerModelName || "-"}</div>
                  <div>Acer Marketing Name: {project.acerMarketingName || "-"}</div>
                </div>
              </div>
              <div>
                <div className="font-semibold">Project Classification</div>
                <div className="mt-2 grid gap-1">
                  <div>Year: {project.year || "-"}</div>
                  <div>Customer: {project.customer || "-"}</div>
                  <div>Product Line: {project.productLine || "-"}</div>
                </div>
              </div>
              <div>
                <div className="font-semibold">Hardware</div>
                <div className="mt-2 grid gap-1">
                  <div>Panel Size: {project.size}</div>
                  <div>CPU: {project.cpu}</div>
                  <div>GPU: {project.gpu}</div>
                </div>
              </div>
              <div>
                <div className="font-semibold">Internal Identifier</div>
                <div className="mt-2 grid gap-1">
                  <div>SSID: {project.ssid || "-"}</div>
                  <div>RMN: {project.rmn || project.platform || "-"}</div>
                </div>
              </div>
              <div>
                <div className="font-semibold">Project Management</div>
                <div className="mt-2">
                  <StatusBadge status={project.projectStatus} />
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <label className="text-sm">
              Version Selector
              <select
                className="ml-2 rounded-md border border-slate-300 px-2 py-1"
                value={version}
                onChange={(event) => onSelectVersion(event.target.value)}
              >
                {versions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <button className="rounded-md border border-slate-300 px-4 py-2 text-sm" onClick={onEditProject}>
              Edit Project
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Resources</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <div className={`rounded-md border p-4 ${activeResource === "schedule" ? "border-slate-900" : "border-slate-300"}`}>
            <div className="font-semibold">Schedule</div>
            <div className="mt-2 text-sm text-slate-600">Enabled</div>
            <button className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={() => onSelectResource("schedule")}>
              Open
            </button>
            <button
              className="ml-2 mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              disabled={!isLatestVersion}
              onClick={onEditSchedule}
            >
              Edit Schedule
            </button>
            {!isLatestVersion && <div className="mt-2 text-xs text-slate-500">Read-only version</div>}
          </div>
          <div className={`rounded-md border p-4 ${activeResource === "teamMembers" ? "border-slate-900" : "border-slate-300"}`}>
            <div className="font-semibold">Team Members</div>
            <div className="mt-2 text-sm text-slate-600">Enabled</div>
            <button className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={() => onSelectResource("teamMembers")}>
              Open
            </button>
          </div>
          {["Documents", "Future Modules"].map((item) => (
            <div className="rounded-md border border-slate-200 p-4" key={item}>
              <div className="font-semibold">{item}</div>
              <div className="mt-2 text-sm text-slate-600">Coming Soon</div>
            </div>
          ))}
        </div>
      </section>

      {activeResource === "schedule" && <ScheduleSection schedule={schedule} warnings={scheduleWarnings} />}

      {activeResource === "teamMembers" && (
        <TeamMembersSection
          onAddField={onAddTeamMemberField}
          onAddMember={onAddTeamMember}
          onDeleteField={onDeleteTeamMemberField}
          onDeleteMember={onDeleteTeamMember}
          onImport={onImportTeamMembers}
          onUpdateMember={onUpdateTeamMember}
          teamMembers={teamMembers}
        />
      )}

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Export Section</h2>
        <button
          className="mt-3 rounded-md border border-slate-300 px-4 py-2 text-sm"
          onClick={exportScheduleToExcel}
        >
          Export to Excel
        </button>
      </section>
    </div>
  );
}

function ScheduleSection({ schedule, warnings }: { schedule: ScheduleItem[]; warnings: ScheduleWarnings }) {
  const [filters, setFilters] = React.useState<ScheduleFilterState>(emptyScheduleFilters);
  const filteredSchedule = filterScheduleRows(schedule, filters);

  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="p-4">
        <h2 className="text-lg font-semibold">Current Schedule</h2>
        <ScheduleFilters
          filters={filters}
          onClearAll={() => setFilters(emptyScheduleFilters)}
          onRemoveFilter={(key) => setFilters((current) => removeScheduleFilter(current, key))}
          onUpdateFilter={(key, value) => setFilters((current) => updateScheduleFilter(current, key, value))}
          schedule={schedule}
        />
        <div className="mt-3 text-sm text-slate-600">
          Showing {filteredSchedule.length} of {schedule.length} milestones
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-t border-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Phase</th>
              <th className="px-4 py-3 font-semibold">Stage</th>
              <th className="px-4 py-3 font-semibold">Milestone</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Actual</th>
            </tr>
          </thead>
          <tbody>
            {filteredSchedule.map((item) => (
              <tr
                key={item.id}
                className={`border-t border-slate-200 ${isScheduleRowCompleteOrNotApplicable(item.actual) ? "text-slate-500" : ""}`}
              >
                {scheduleColumns.map((key) => (
                  <td className={`px-4 py-3 ${key === "phase" ? "font-medium" : ""}`} key={`${item.id}-${key}`}>
                    <span className="flex items-center gap-2">
                      {hasScheduleWarning(warnings, item.id, key) && (
                        <span aria-label="Warning" className="font-semibold text-amber-700">
                          ⚠
                        </span>
                      )}
                      <span>{item[key]}</span>
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ScheduleFilters({
  filters,
  onClearAll,
  onRemoveFilter,
  onUpdateFilter,
  schedule,
}: {
  filters: ScheduleFilterState;
  onClearAll: () => void;
  onRemoveFilter: (key: ScheduleFilterKey | "planRange" | "actualRange") => void;
  onUpdateFilter: <TKey extends ScheduleFilterKey>(key: TKey, value: ScheduleFilterState[TKey]) => void;
  schedule: ScheduleItem[];
}) {
  const options = scheduleFilterOptions(schedule);
  const chips = scheduleFilterChips(filters);

  return (
    <div className="mt-4 grid gap-3">
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          Phase
          <select
            className="mt-1 block w-40 rounded-md border border-slate-300 px-2 py-1.5"
            onChange={(event) => onUpdateFilter("phase", event.target.value)}
            value={filters.phase}
          >
            <option value="">All Phases</option>
            {options.phase.map((phase) => (
              <option key={phase}>{phase}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Stage
          <select
            className="mt-1 block w-40 rounded-md border border-slate-300 px-2 py-1.5"
            onChange={(event) => onUpdateFilter("stage", event.target.value)}
            value={filters.stage}
          >
            <option value="">All Stages</option>
            {options.stage.map((stage) => (
              <option key={stage}>{stage}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Milestone
          <input
            className="mt-1 block w-44 rounded-md border border-slate-300 px-2 py-1.5"
            onChange={(event) => onUpdateFilter("milestone", event.target.value)}
            placeholder="Search milestone"
            value={filters.milestone}
          />
        </label>
        <label className="text-sm">
          Plan From
          <input
            className="mt-1 block w-40 rounded-md border border-slate-300 px-2 py-1.5"
            onChange={(event) => onUpdateFilter("planFrom", event.target.value)}
            type="date"
            value={filters.planFrom}
          />
        </label>
        <label className="text-sm">
          Plan To
          <input
            className="mt-1 block w-40 rounded-md border border-slate-300 px-2 py-1.5"
            onChange={(event) => onUpdateFilter("planTo", event.target.value)}
            type="date"
            value={filters.planTo}
          />
        </label>
        <label className="text-sm">
          Actual From
          <input
            className="mt-1 block w-40 rounded-md border border-slate-300 px-2 py-1.5"
            onChange={(event) => onUpdateFilter("actualFrom", event.target.value)}
            type="date"
            value={filters.actualFrom}
          />
        </label>
        <label className="text-sm">
          Actual To
          <input
            className="mt-1 block w-40 rounded-md border border-slate-300 px-2 py-1.5"
            onChange={(event) => onUpdateFilter("actualTo", event.target.value)}
            type="date"
            value={filters.actualTo}
          />
        </label>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              className="rounded-full bg-slate-200 px-3 py-1 text-sm"
              key={chip.key}
              onClick={() => onRemoveFilter(chip.key)}
            >
              {chip.label}
            </button>
          ))}
          <button className="rounded-full border border-slate-300 px-3 py-1 text-sm" onClick={onClearAll}>
            Clear All
          </button>
        </div>
      )}
    </div>
  );
}

function TeamMembersSection({
  onAddField,
  onAddMember,
  onDeleteField,
  onDeleteMember,
  onImport,
  onUpdateMember,
  teamMembers,
}: {
  onAddField: (fieldName: string) => void;
  onAddMember: () => void;
  onDeleteField: (fieldName: string) => void;
  onDeleteMember: (memberId: string) => void;
  onImport: (file: File) => void;
  onUpdateMember: (memberId: string, field: string, value: string) => void;
  teamMembers: TeamMembersState;
}) {
  const fileInputId = React.useId();
  const customFields = teamMembers.fields.filter(
    (field) => !defaultTeamMemberFields.includes(field as (typeof defaultTeamMemberFields)[number]),
  );

  const requestAddField = () => {
    const fieldName = window.prompt("New field name");

    if (fieldName) {
      onAddField(fieldName);
    }
  };
  const requestDeleteField = (fieldName: string) => {
    if (window.confirm(`Delete field "${fieldName}"?`)) {
      onDeleteField(fieldName);
    }
  };
  const requestDeleteMember = (memberId: string) => {
    if (window.confirm("Delete this team member?")) {
      onDeleteMember(memberId);
    }
  };

  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-lg font-semibold">Team Members</h2>
          {teamMembers.sourceFileName && (
            <div className="mt-1 text-sm text-slate-600">Imported File: {teamMembers.sourceFileName}</div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            accept=".csv,.xls,.xlsx"
            className="hidden"
            id={fileInputId}
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                onImport(file);
                event.target.value = "";
              }
            }}
            type="file"
          />
          <label className="cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm" htmlFor={fileInputId}>
            Import Team Member
          </label>
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={onAddMember}>
            Add Member
          </button>
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={requestAddField}>
            Add Field
          </button>
        </div>
      </div>

      {customFields.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-slate-200 px-4 py-3 text-sm">
          {customFields.map((field) => (
            <button
              className="rounded-full border border-slate-300 px-3 py-1"
              key={field}
              onClick={() => requestDeleteField(field)}
            >
              Delete Field: {field}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-t border-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {teamMembers.fields.map((field) => (
                <th className="px-4 py-3 font-semibold" key={field}>
                  {field}
                </th>
              ))}
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {teamMembers.members.length === 0 && (
              <tr className="border-t border-slate-200">
                <td className="px-4 py-4 text-slate-600" colSpan={teamMembers.fields.length + 1}>
                  No team members yet.
                </td>
              </tr>
            )}
            {teamMembers.members.map((member) => (
              <tr className="border-t border-slate-200" key={member.id}>
                {teamMembers.fields.map((field) => (
                  <td className="px-4 py-2" key={`${member.id}-${field}`}>
                    <input
                      aria-label={`${field} for ${member.values.Name || "team member"}`}
                      className="w-full min-w-[140px] rounded-md border border-slate-300 px-2 py-1"
                      onChange={(event) => onUpdateMember(member.id, field, event.target.value)}
                      value={member.values[field] || ""}
                    />
                  </td>
                ))}
                <td className="px-4 py-2">
                  <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={() => requestDeleteMember(member.id)}>
                    Delete Member
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WorkingDraft({
  onCancelDraft,
  onPublishComplete,
  project,
  schedule,
  scheduleWarnings,
  version,
  versions,
}: {
  onCancelDraft: () => void;
  onPublishComplete: (draftSchedule: ScheduleItem[], warnings: ScheduleWarnings) => void;
  project: DashboardProject;
  schedule: ScheduleItem[];
  scheduleWarnings: ScheduleWarnings;
  version: string;
  versions: string[];
}) {
  const [draftSchedule, setDraftSchedule] = React.useState<ScheduleItem[]>(schedule);
  const [draftWarnings, setDraftWarnings] = React.useState<ScheduleWarnings>(scheduleWarnings);
  const [selectedCell, setSelectedCell] = React.useState<string | null>(null);
  const [editingCell, setEditingCell] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<ScheduleFilterState>(emptyScheduleFilters);
  const [isPublishOpen, setIsPublishOpen] = React.useState(false);
  const warningCount = countScheduleWarnings(draftWarnings);
  const canPublish = warningCount === 0;
  const filteredDraftSchedule = filterScheduleRows(draftSchedule, filters);

  const updateCell = (rowId: string, key: ScheduleKey, value: string) => {
    setDraftSchedule((items) =>
      items.map((item, index) =>
        item.id === rowId
          ? {
              ...item,
              [key]: value,
            }
          : item,
      ),
    );
    setDraftWarnings((current) => resolveScheduleWarning(current, rowId, key, value));
  };

  const publish = () => {
    if (!canPublish) {
      return;
    }

    setIsPublishOpen(false);
    onPublishComplete(draftSchedule, draftWarnings);
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6">
      <section aria-label="Project Header" className="rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              <div>Customer: {project.customer}</div>
              <div>PM: {project.pm || "Catherine"}</div>
              <div>Target MP: {project.targetMp || "2026/06"}</div>
              <div>Version: {version}</div>
              <div>Working Draft: Yes</div>
              <div>Need Attention: {project.needsAttention || "Yes"}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-md border border-slate-300 px-4 py-2 text-sm"
              onClick={onCancelDraft}
            >
              Cancel
            </button>
            <button
              className="rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
              disabled={!canPublish}
              onClick={() => setIsPublishOpen(true)}
            >
              Publish
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <div className="p-4">
          <h2 className="text-lg font-semibold">Editable Schedule</h2>
          <ScheduleFilters
            filters={filters}
            onClearAll={() => setFilters(emptyScheduleFilters)}
            onRemoveFilter={(key) => setFilters((current) => removeScheduleFilter(current, key))}
            onUpdateFilter={(key, value) => setFilters((current) => updateScheduleFilter(current, key, value))}
            schedule={draftSchedule}
          />
          <div className="mt-3 text-sm text-slate-600">
            Showing {filteredDraftSchedule.length} of {draftSchedule.length} milestones
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-t border-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Phase</th>
                <th className="px-4 py-3 font-semibold">Stage</th>
                <th className="px-4 py-3 font-semibold">Milestone</th>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Actual</th>
              </tr>
          </thead>
          <tbody>
              {filteredDraftSchedule.map((item) => (
                <tr
                  key={item.id}
                  className={`border-t border-slate-200 ${isScheduleRowCompleteOrNotApplicable(item.actual) ? "text-slate-500" : ""}`}
                >
                  {scheduleColumns.map((key) => (
                    <EditableCell
                      key={key}
                      cellKey={`${item.id}-${key}`}
                      isEditing={editingCell === `${item.id}-${key}`}
                      isSelected={selectedCell === `${item.id}-${key}`}
                      isWarning={hasScheduleWarning(draftWarnings, item.id, key)}
                      value={item[key]}
                      onChange={(value) => updateCell(item.id, key, value)}
                      onEdit={() => setEditingCell(`${item.id}-${key}`)}
                      onSelect={() => setSelectedCell(`${item.id}-${key}`)}
                      onStopEdit={() => setEditingCell(null)}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Publish Area</h2>
        <div className="mt-3 text-sm">{canPublish ? "Ready to Publish" : "Resolve warnings before publishing"}</div>
        <div className="mt-2 text-sm">Warnings: {warningCount}</div>
        <button
          className="mt-3 rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
          disabled={!canPublish}
          onClick={() => setIsPublishOpen(true)}
        >
          Publish
        </button>
      </section>

      {isPublishOpen && (
        <PublishDialog
          currentVersion={version}
          newVersion={`v${versions.length + 1}`}
          onCancel={() => setIsPublishOpen(false)}
          onPublish={publish}
        />
      )}
    </div>
  );
}

function EditableCell({
  cellKey,
  isEditing,
  isSelected,
  isWarning,
  onChange,
  onEdit,
  onSelect,
  onStopEdit,
  value,
}: {
  cellKey: string;
  isEditing: boolean;
  isSelected: boolean;
  isWarning: boolean;
  onChange: (value: string) => void;
  onEdit: () => void;
  onSelect: () => void;
  onStopEdit: () => void;
  value: string;
}) {
  return (
    <td
      className={`px-4 py-3 ${isSelected ? "outline outline-2 outline-slate-400" : ""}`}
      data-cell={cellKey}
      onClick={onSelect}
      onDoubleClick={onEdit}
    >
      {isEditing ? (
        <input
          autoFocus
          className="w-full rounded-sm border border-slate-400 px-2 py-1"
          onBlur={onStopEdit}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onStopEdit();
            }
          }}
          value={value}
        />
      ) : (
        <span className="flex items-center gap-2">
          {isWarning && (
            <span aria-label="Warning" className="font-semibold text-amber-700">
              ⚠
            </span>
          )}
          <span>{value}</span>
        </span>
      )}
    </td>
  );
}

function PublishDialog({
  currentVersion,
  newVersion,
  onCancel,
  onPublish,
}: {
  currentVersion: string;
  newVersion: string;
  onCancel: () => void;
  onPublish: () => void;
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/20 px-4">
      <div className="w-full max-w-md rounded-md border border-slate-300 bg-white p-5">
        <h2 className="text-lg font-semibold">Publish New Version</h2>
        <p className="mt-3 text-sm">You are about to publish a new version.</p>
        <div className="mt-4 grid gap-2 text-sm">
          <div>Current Version: {currentVersion}</div>
          <div>New Version: {newVersion}</div>
          <label>
            Version Note
            <textarea className="mt-1 h-20 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-md border border-slate-300 px-4 py-2 text-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm text-white"
            onClick={onPublish}
          >
            Publish
          </button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
