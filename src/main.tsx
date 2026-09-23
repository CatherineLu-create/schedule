import React from "react";
import ReactDOM from "react-dom/client";
import * as XLSX from "xlsx";
import { PortfolioDashboardView } from "./portfolioDashboardView";
import { selectDashboardAttention } from "./application/selectors/dashboardAttention";
import { selectPortfolioDashboardRows } from "./application/selectors/portfolioDashboardRows";
import {
  createProject,
  updateProjectMaster,
  type CreateProjectContext,
  type CreateProjectDefaults,
  type CreateProjectInput,
  type CreateProjectRequiredField,
} from "./application/commands/projectCommands";
import {
  addScheduleWorkingDraftMilestone,
  cancelScheduleWorkingDraft,
  getNextPublishedScheduleVersionNumber,
  publishScheduleWorkingDraft,
  removeScheduleWorkingDraftMilestone,
  startScheduleWorkingDraft,
  updateScheduleWorkingDraftMilestone,
  type CanonicalScheduleCommandContext,
  type CanonicalScheduleCommandFailure,
  type CanonicalScheduleLifecycleFailureReason,
  type UpdateScheduleWorkingDraftMilestoneInput,
} from "./application/commands/canonicalScheduleCommands";
import { prototypeReducer } from "./application/state/prototypeReducer";
import type { PrototypeState } from "./application/state/prototypeState";
import { saveProjectTeamForState, type ProjectMismatchResult } from "./application/commands/teamSaveState";
import type { SaveProjectTeamResult } from "./application/commands/teamCommands";
import type { TeamEditCandidate } from "./application/teamImport/teamCandidate";
import {
  selectDashboardProjectRow,
  selectDashboardProjectRows,
  type DashboardProjectRow,
} from "./application/selectors/dashboardProjectRows";
import {
  resolveCanonicalScheduleOwner,
  selectCurrentPublishedSchedule,
  selectScheduleWorkingDraft,
} from "./application/selectors/scheduleSelectors";
import { getProjectById } from "./application/selectors/projectSelectors";
import {
  confirmCreateProjectAnyway,
  interpretCreateProjectResult,
  interpretUpdateProjectMasterResult,
  type CreateProjectInterpretation,
  type DuplicateProjectDecisionRequest,
} from "./application/workflow/workflowInterpretation";
import { milestoneDefinitions, statusCatalog, teamFunctionCatalog } from "./config/v2/referenceData";
import type { Project } from "./domain/project/project";
import {
  createEmptyCanonicalProjectSchedule,
  type CanonicalProjectSchedule,
} from "./domain/schedule/officialSchedule";
import type { CatalogItem } from "./domain/reference-data/catalog";
import { toLocalDateOnly, type DateOnly } from "./domain/shared/dateOnly";
import {
  toCatalogItemId,
  toMilestoneId,
  toPersonAssignmentId,
  toProjectId,
  toTeamFunctionId,
  type CatalogItemId,
  type MilestoneDefinitionId,
  type MilestoneId,
  type ProjectId,
} from "./domain/shared/ids";
import type { ValidationIssue } from "./domain/validation/validationIssue";
import { DuplicateProjectReview } from "./duplicateProjectReview";
import { canonicalProjectFixtures } from "./fixtures/v2/canonicalProjectFixtures";
import { canonicalScheduleFixtures } from "./fixtures/v2/canonicalScheduleFixtures";
import {
  cpuReferenceFixtures,
  customerReferenceFixtures,
  gpuReferenceFixtures,
  panelSizeReferenceFixtures,
  productLineReferenceFixtures,
} from "./fixtures/v2/referenceFixtures";
import { devTeamTemplateV2 } from "./fixtures/v2/teamTemplateFixtures";
import {
  emptyProjectMasterForm,
  overwriteProjectMasterFromForm,
  toCreateProjectMasterInput,
  toProjectMasterForm,
  type CatalogSelection,
  type ProjectMasterForm,
} from "./projectMasterForm";
import { ScheduleWorkspace, type ScheduleWorkspaceProps } from "./scheduleWorkspace";
import { TeamMemberWorkspace, type TeamMemberWorkspaceProps } from "./teamMemberWorkspace";
import {
  defaultTeamMemberFields,
  type TeamMembersState,
} from "./teamMembers";
import "./styles.css";

type Page = "dashboard" | "workspace";

interface PendingDuplicateCreate {
  readonly input: CreateProjectInput;
  readonly context: CreateProjectContext;
  readonly decision: DuplicateProjectDecisionRequest;
}

type CreateFieldErrors = Partial<Record<CreateProjectRequiredField, string>>;

const initialPrototypeState: PrototypeState = {
  projects: canonicalProjectFixtures,
  schedules: canonicalScheduleFixtures,
};

const createDefaults: CreateProjectDefaults = {
  customerId: toCatalogItemId("dev-customer-acer"),
  statusId: toCatalogItemId("status-rfq"),
  teamTemplate: devTeamTemplateV2,
};

const canonicalScheduleCommandContext: CanonicalScheduleCommandContext = {
  milestoneDefinitions,
};

function scheduleFailureMessages(
  failure: CanonicalScheduleCommandFailure<CanonicalScheduleLifecycleFailureReason>,
): readonly string[] {
  if (failure.reason === "validation-failed") {
    return failure.issues.map(({ message }) => message);
  }
  const messages = {
    "no-working-draft": "No Working Draft is available.",
    "milestone-not-found": "The Working Draft milestone is unavailable.",
    "next-version-unavailable": "The next Published version is unavailable.",
  } satisfies Record<
    Exclude<CanonicalScheduleLifecycleFailureReason, "validation-failed">,
    string
  >;
  return [messages[failure.reason]];
}

function dashboardExportRow(project: DashboardProjectRow) {
  return {
    Year: project.year,
    Customer: project.customer,
    "Product Line": project.productLine,
    "Project Name": project.projectName,
    "QCI Model Name": project.qciModelName,
    "Acer Model Name": project.acerModelName,
    "Acer Marketing Name": project.acerMarketingName,
    "Panel Size": project.panelSize,
    CPU: project.cpu,
    GPU: project.gpu,
    SSID: project.ssid,
    RMN: project.rmn,
    "Project Status": project.projectStatus,
    "Current Stage": project.currentStage,
    MDRR: project.mdrr,
  };
}

function exportDashboardProjectListToExcel(projects: readonly DashboardProjectRow[]) {
  const rows = projects.map(dashboardExportRow);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Project List");
  XLSX.writeFile(workbook, "Project_Portfolio_Summary.xlsx");
}

export interface AppProps {
  readonly initialState?: PrototypeState;
  readonly initialSelectedProjectId?: ProjectId | null;
  readonly referenceDate?: DateOnly;
}

export function App({
  initialState = initialPrototypeState,
  initialSelectedProjectId = null,
  referenceDate,
}: AppProps = {}): React.ReactElement {
  const [page, setPage] = React.useState<Page>(
    initialSelectedProjectId === null ? "dashboard" : "workspace",
  );
  const [state, dispatch] = React.useReducer(prototypeReducer, initialState);
  const [dashboardReferenceDate] = React.useState<DateOnly>(
    () => referenceDate ?? toLocalDateOnly(new Date()),
  );
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const [selectedProjectId, setSelectedProjectId] =
    React.useState<ProjectId | null>(initialSelectedProjectId);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = React.useState(false);
  const [isEditProjectOpen, setIsEditProjectOpen] = React.useState(false);
  const [createCandidateId, setCreateCandidateId] = React.useState<ProjectId | null>(null);
  const [createForm, setCreateForm] = React.useState<ProjectMasterForm>(emptyProjectMasterForm);
  const [createFieldErrors, setCreateFieldErrors] = React.useState<CreateFieldErrors>({});
  const [createIssues, setCreateIssues] = React.useState<readonly ValidationIssue[]>([]);
  const [createFeedback, setCreateFeedback] = React.useState<string | null>(null);
  const [pendingDuplicateCreate, setPendingDuplicateCreate] =
    React.useState<PendingDuplicateCreate | null>(null);
  const [editForm, setEditForm] = React.useState<ProjectMasterForm>(emptyProjectMasterForm);
  const [editIssues, setEditIssues] = React.useState<readonly ValidationIssue[]>([]);
  const [editFeedback, setEditFeedback] = React.useState<readonly ValidationIssue[]>([]);
  const [scheduleFeedback, setScheduleFeedback] = React.useState<readonly string[]>([]);

  const selectedCanonicalProject =
    selectedProjectId === null ? null : getProjectById(state, selectedProjectId);
  const dashboardRows = selectDashboardProjectRows(state);
  const portfolioDashboardRows = selectPortfolioDashboardRows(state);
  const dashboardAttention = selectDashboardAttention(
    state,
    dashboardReferenceDate,
  );
  const selectedDashboardRow =
    selectedProjectId === null ? null : selectDashboardProjectRow(state, selectedProjectId);
  const selectedScheduleRead =
    selectedProjectId === null
      ? null
      : selectCurrentPublishedSchedule(state, selectedProjectId);
  const selectedDraftRead = selectedProjectId === null
    ? null
    : selectScheduleWorkingDraft(state, selectedProjectId);
  const selectedScheduleOwner = selectedProjectId === null
    ? null
    : resolveCanonicalScheduleOwner(state, selectedProjectId);

  const saveTeam = (
    projectId: ProjectId,
    candidate: TeamEditCandidate,
  ): SaveProjectTeamResult | ProjectMismatchResult => {
    if (selectedProjectId !== projectId || candidate.projectId !== projectId) {
      return {
        ok: false,
        reason: "projectMismatch",
        issues: [{
          code: "team.data.project-mismatch",
          domain: "team",
          source: "data",
          severity: "blocking",
          message: "Team candidate belongs to a different selected Project.",
          target: { section: "team", entityId: projectId },
        }],
      };
    }
    const result = saveProjectTeamForState(
      stateRef.current,
      projectId,
      candidate,
      teamFunctionCatalog,
    );
    if (result.ok) dispatch({ type: "projectReplaced", project: result.project });
    return result;
  };

  const dispatchScheduleReplacement = (
    projectId: ProjectId,
    result: { readonly ok: true; readonly schedule: CanonicalProjectSchedule },
  ): void => {
    dispatch({ type: "scheduleReplaced", projectId, schedule: result.schedule });
  };

  const startScheduleDraft = (): void => {
    if (selectedProjectId === null) return;
    const projectId = selectedProjectId;
    const owner = resolveCanonicalScheduleOwner(state, projectId);
    if (owner.kind === "unavailable") {
      setScheduleFeedback(owner.issues.map(({ message }) => message));
      return;
    }
    const result = startScheduleWorkingDraft(owner.schedule, canonicalScheduleCommandContext);
    if (!result.ok) {
      setScheduleFeedback(scheduleFailureMessages(result));
      return;
    }
    if (result.status === "created") dispatchScheduleReplacement(projectId, result);
    setScheduleFeedback([]);
  };

  const updateScheduleDraftMilestone = (
    input: UpdateScheduleWorkingDraftMilestoneInput,
  ): void => {
    if (selectedProjectId === null) return;
    const projectId = selectedProjectId;
    const owner = resolveCanonicalScheduleOwner(state, projectId);
    if (owner.kind === "unavailable") {
      setScheduleFeedback(owner.issues.map(({ message }) => message));
      return;
    }
    const result = updateScheduleWorkingDraftMilestone(
      owner.schedule, input, canonicalScheduleCommandContext,
    );
    if (!result.ok) {
      setScheduleFeedback(scheduleFailureMessages(result));
      return;
    }
    dispatchScheduleReplacement(projectId, result);
    setScheduleFeedback([]);
  };

  const addScheduleDraftMilestone = (milestoneDefinitionId: MilestoneDefinitionId): void => {
    if (selectedProjectId === null) return;
    const projectId = selectedProjectId;
    const owner = resolveCanonicalScheduleOwner(state, projectId);
    if (owner.kind === "unavailable") {
      setScheduleFeedback(owner.issues.map(({ message }) => message));
      return;
    }
    const milestoneId = toMilestoneId(globalThis.crypto.randomUUID());
    const result = addScheduleWorkingDraftMilestone(
      owner.schedule,
      { milestoneId, milestoneDefinitionId },
      canonicalScheduleCommandContext,
    );
    if (!result.ok) {
      setScheduleFeedback(scheduleFailureMessages(result));
      return;
    }
    dispatchScheduleReplacement(projectId, result);
    setScheduleFeedback([]);
  };

  const removeScheduleDraftMilestone = (milestoneId: MilestoneId): void => {
    if (selectedProjectId === null) return;
    const projectId = selectedProjectId;
    const owner = resolveCanonicalScheduleOwner(state, projectId);
    if (owner.kind === "unavailable") {
      setScheduleFeedback(owner.issues.map(({ message }) => message));
      return;
    }
    const result = removeScheduleWorkingDraftMilestone(
      owner.schedule, { milestoneId }, canonicalScheduleCommandContext,
    );
    if (!result.ok) {
      setScheduleFeedback(scheduleFailureMessages(result));
      return;
    }
    dispatchScheduleReplacement(projectId, result);
    setScheduleFeedback([]);
  };

  const cancelScheduleDraft = (): void => {
    if (selectedProjectId === null) return;
    const projectId = selectedProjectId;
    const owner = resolveCanonicalScheduleOwner(state, projectId);
    if (owner.kind === "unavailable") {
      setScheduleFeedback(owner.issues.map(({ message }) => message));
      return;
    }
    const result = cancelScheduleWorkingDraft(owner.schedule);
    if (!result.ok) {
      setScheduleFeedback(scheduleFailureMessages(result));
      return;
    }
    dispatchScheduleReplacement(projectId, result);
    setScheduleFeedback([]);
  };

  const publishScheduleDraft = (): void => {
    if (selectedProjectId === null) return;
    const projectId = selectedProjectId;
    const owner = resolveCanonicalScheduleOwner(state, projectId);
    if (owner.kind === "unavailable") {
      setScheduleFeedback(owner.issues.map(({ message }) => message));
      return;
    }
    const publishedAt = new Date().toISOString();
    const result = publishScheduleWorkingDraft(
      owner.schedule, { publishedAt }, canonicalScheduleCommandContext,
    );
    if (!result.ok) {
      setScheduleFeedback(scheduleFailureMessages(result));
      return;
    }
    dispatchScheduleReplacement(projectId, result);
    setScheduleFeedback([]);
  };

  const nextVersion =
    selectedScheduleOwner?.kind === "available" &&
    selectedDraftRead?.kind === "workingDraft" &&
    selectedScheduleRead?.kind !== "unavailable"
      ? getNextPublishedScheduleVersionNumber(selectedScheduleOwner.schedule)
      : null;
  const nextVersionLabel = nextVersion?.ok
    ? `Publish as v${String(nextVersion.versionNumber).padStart(2, "0")}`
    : null;
  const scheduleWorkspaceProps: ScheduleWorkspaceProps | null =
    selectedProjectId === null || selectedScheduleRead === null || selectedDraftRead === null
      ? null
      : {
          draftRead: selectedDraftRead,
          feedback: scheduleFeedback,
          milestoneDefinitions,
          nextVersionLabel,
          officialRead: selectedScheduleRead,
          onAddMilestone: addScheduleDraftMilestone,
          onCancelDraft: cancelScheduleDraft,
          onPublishDraft: publishScheduleDraft,
          onRemoveMilestone: removeScheduleDraftMilestone,
          onStartDraft: selectedScheduleOwner?.kind === "available"
            ? startScheduleDraft
            : null,
          onUpdateMilestone: updateScheduleDraftMilestone,
          projectId: selectedProjectId,
        };

  React.useEffect(() => {
    if (selectedProjectId !== null && selectedCanonicalProject === null) {
      setSelectedProjectId(null);
      setIsEditProjectOpen(false);
      setPendingDuplicateCreate(null);
      setScheduleFeedback([]);
      setPage("dashboard");
    }
  }, [selectedProjectId, selectedCanonicalProject]);

  const openProject = (projectId: ProjectId) => {
    setSelectedProjectId(projectId);
    setScheduleFeedback([]);
    setPage("workspace");
  };
  const backToDashboard = (): void => {
    setScheduleFeedback([]);
    setPage("dashboard");
  };
  const closeCreate = () => {
    setIsCreateProjectOpen(false);
    setPendingDuplicateCreate(null);
    setCreateCandidateId(null);
    setCreateForm(emptyProjectMasterForm);
    setCreateFieldErrors({});
    setCreateIssues([]);
    setCreateFeedback(null);
  };
  const openCreate = () => {
    setCreateCandidateId(toProjectId(globalThis.crypto.randomUUID()));
    setCreateForm(emptyProjectMasterForm);
    setCreateFieldErrors({});
    setCreateIssues([]);
    setCreateFeedback(null);
    setPendingDuplicateCreate(null);
    setIsCreateProjectOpen(true);
  };
  const completeCreate = (project: Project, issues: readonly ValidationIssue[]) => {
    dispatch({
      type: "projectAdded",
      project,
      schedule: createEmptyCanonicalProjectSchedule(project.id),
    });
    setSelectedProjectId(project.id);
    setEditFeedback(issues);
    setScheduleFeedback([]);
    setPage("workspace");
    closeCreate();
  };
  const handleCreateInterpretation = (
    interpretation: CreateProjectInterpretation,
    input: CreateProjectInput,
    context: CreateProjectContext,
  ) => {
    if (interpretation.kind === "completed") {
      completeCreate(interpretation.result.project, interpretation.result.issues);
      return;
    }

    if (interpretation.kind === "duplicateProject") {
      setPendingDuplicateCreate({ input, context, decision: interpretation });
      setCreateIssues(interpretation.issues);
      return;
    }

    const result = interpretation.result;
    if (result.reason === "requiredFields") {
      const messages: Record<CreateProjectRequiredField, string> = {
        year: "Year is required.",
        productLine: "Product Line is required.",
        stnProjectName: "STN Project Name is required.",
      };
      setCreateFieldErrors(Object.fromEntries(
        result.missingFields.map((field) => [field, messages[field]]),
      ));
      setCreateFeedback(null);
    } else {
      setCreateFieldErrors({});
      setCreateFeedback("A Project with this Project ID already exists.");
    }
  };
  const saveCreate = () => {
    if (createCandidateId === null) return;

    const input: CreateProjectInput = {
      projectId: createCandidateId,
      master: toCreateProjectMasterInput(createForm),
      qciPm: null,
    };
    const context: CreateProjectContext = {
      existingProjects: state.projects,
      defaults: createDefaults,
    };
    handleCreateInterpretation(
      interpretCreateProjectResult(createProject(input, context)),
      input,
      context,
    );
  };
  const createAnyway = () => {
    if (pendingDuplicateCreate === null) return;

    handleCreateInterpretation(
      confirmCreateProjectAnyway(
        pendingDuplicateCreate.input,
        pendingDuplicateCreate.context,
      ),
      pendingDuplicateCreate.input,
      pendingDuplicateCreate.context,
    );
  };
  const openEdit = () => {
    if (selectedCanonicalProject === null) return;
    setEditForm(toProjectMasterForm(selectedCanonicalProject.master));
    setEditIssues([]);
    setIsEditProjectOpen(true);
  };
  const saveEdit = () => {
    if (selectedCanonicalProject === null) return;

    const candidateMaster = overwriteProjectMasterFromForm(
      selectedCanonicalProject.master,
      editForm,
    );
    const interpretation = interpretUpdateProjectMasterResult(
      updateProjectMaster(selectedCanonicalProject, { master: candidateMaster }),
    );
    setEditIssues(interpretation.result.issues);
    if (interpretation.kind === "blocked") return;

    dispatch({ type: "projectReplaced", project: interpretation.result.project });
    setEditFeedback(interpretation.result.issues);
    setScheduleFeedback([]);
    setIsEditProjectOpen(false);
  };

  const matchingRows = pendingDuplicateCreate === null
    ? []
    : pendingDuplicateCreate.decision.matchingProjectIds
        .map((projectId) => getProjectById(state, projectId))
        .filter((project): project is Project => project !== null)
        .map((project) => selectDashboardProjectRow(state, project.id))
        .filter((row): row is DashboardProjectRow => row !== null);
  const renderWorkspace =
    page === "workspace" &&
    selectedCanonicalProject !== null &&
    selectedDashboardRow !== null &&
    scheduleWorkspaceProps !== null;

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-100 text-slate-950">
      {!renderWorkspace && (
        <PortfolioDashboardView
          attention={dashboardAttention}
          onCreateProject={openCreate}
          onExport={() => exportDashboardProjectListToExcel(dashboardRows)}
          onOpenProject={openProject}
          rows={portfolioDashboardRows}
        />
      )}
      {renderWorkspace && (
        <ProjectWorkspace
          feedback={editFeedback}
          onBack={backToDashboard}
          onEditProject={openEdit}
          project={selectedCanonicalProject}
          row={selectedDashboardRow}
          scheduleWorkspaceProps={scheduleWorkspaceProps}
          teamMemberWorkspaceProps={{
            createAssignmentId: () => toPersonAssignmentId(globalThis.crypto.randomUUID()),
            createFunctionId: () => toTeamFunctionId(globalThis.crypto.randomUUID()),
            onSave: saveTeam,
            standardFunctionDefinitions: teamFunctionCatalog,
          }}
        />
      )}
      {isCreateProjectOpen && (
        pendingDuplicateCreate === null ? (
          <ProjectDialog
            fieldErrors={createFieldErrors}
            feedback={createFeedback}
            issues={createIssues}
            onCancel={closeCreate}
            onChange={setCreateForm}
            onSave={saveCreate}
            saveLabel="Save"
            title="Create Project"
            value={createForm}
          />
        ) : (
          <div
            aria-label="Create Project"
            className="fixed inset-0 z-10 flex items-center justify-center bg-black/20 px-4"
            role="dialog"
          >
            <div className="w-full max-w-2xl rounded-md border border-slate-300 bg-white p-5">
              <h2 className="text-lg font-semibold">Create Project</h2>
              <div className="mt-4">
                <DuplicateProjectReview
                  decision={pendingDuplicateCreate.decision}
                  matchingRows={matchingRows}
                  onBackToForm={() => setPendingDuplicateCreate(null)}
                  onCreateAnyway={createAnyway}
                  onSelectProject={(projectId) => {
                    openProject(projectId);
                    closeCreate();
                  }}
                />
              </div>
            </div>
          </div>
        )
      )}
      {isEditProjectOpen && selectedCanonicalProject !== null && (
        <ProjectDialog
          fieldErrors={{}}
          feedback={null}
          issues={editIssues}
          onCancel={() => setIsEditProjectOpen(false)}
          onChange={setEditForm}
          onSave={saveEdit}
          saveLabel="Save Changes"
          title="Edit Project"
          value={editForm}
        />
      )}
    </main>
  );
}


function ProjectDialog({
  fieldErrors,
  feedback,
  issues,
  onCancel,
  onChange,
  onSave,
  saveLabel,
  title,
  value,
}: {
  readonly fieldErrors: CreateFieldErrors;
  readonly feedback: string | null;
  readonly issues: readonly ValidationIssue[];
  readonly onCancel: () => void;
  readonly onChange: (form: ProjectMasterForm) => void;
  readonly onSave: () => void;
  readonly saveLabel: string;
  readonly title: string;
  readonly value: ProjectMasterForm;
}) {
  const updateForm = <TKey extends keyof ProjectMasterForm>(
    key: TKey,
    nextValue: ProjectMasterForm[TKey],
  ) => {
    onChange({ ...value, [key]: nextValue });
  };

  return (
    <div
      aria-label={title}
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/20 px-4"
      role="dialog"
    >
      <div className="w-full max-w-2xl rounded-md border border-slate-300 bg-white p-5">
        <h2 className="text-lg font-semibold">{title}</h2>

        <div className="mt-4 grid max-h-[70vh] gap-5 overflow-y-auto pr-1">
          <fieldset className="grid gap-3 rounded-md border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold">Project Identity</legend>
            <ProjectInput
              error={fieldErrors.stnProjectName}
              label="STN Project Name"
              value={value.stnProjectName}
              onChange={(nextValue) => updateForm("stnProjectName", nextValue)}
            />
            <ProjectInput label="QCI Model Name" value={value.qciModelName} onChange={(nextValue) => updateForm("qciModelName", nextValue)} />
            <ProjectInput label="Acer Model Name" value={value.acerModelName} onChange={(nextValue) => updateForm("acerModelName", nextValue)} />
            <ProjectInput label="Acer Marketing Name" value={value.acerMarketingName} onChange={(nextValue) => updateForm("acerMarketingName", nextValue)} />
          </fieldset>

          <fieldset className="grid gap-3 rounded-md border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold">Project Classification</legend>
            <ProjectInput error={fieldErrors.year} label="Year" value={value.year} onChange={(nextValue) => updateForm("year", nextValue)} />
            <ProjectCatalogSelect emptyLabel="Select Customer" label="Customer" options={customerReferenceFixtures} value={value.customerId} onChange={(nextValue) => updateForm("customerId", nextValue)} />
            <ProjectCatalogSelect error={fieldErrors.productLine} emptyLabel="Select Product Line" label="Product Line" options={productLineReferenceFixtures} value={value.productLineId} onChange={(nextValue) => updateForm("productLineId", nextValue)} />
          </fieldset>

          <fieldset className="grid gap-3 rounded-md border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold">Hardware</legend>
            <ProjectCatalogSelect emptyLabel="Select Panel Size" label="Panel Size" options={panelSizeReferenceFixtures} value={value.panelSizeId} onChange={(nextValue) => updateForm("panelSizeId", nextValue)} />
            <ProjectCatalogSelect emptyLabel="Select CPU" label="CPU" options={cpuReferenceFixtures} value={value.cpuId} onChange={(nextValue) => updateForm("cpuId", nextValue)} />
            <ProjectCatalogSelect emptyLabel="Select GPU" label="GPU" options={gpuReferenceFixtures} value={value.gpuId} onChange={(nextValue) => updateForm("gpuId", nextValue)} />
          </fieldset>

          <fieldset className="grid gap-3 rounded-md border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold">Internal Identifier</legend>
            <ProjectInput label="SSID" value={value.ssid} onChange={(nextValue) => updateForm("ssid", nextValue)} />
            <ProjectInput label="RMN" value={value.rmn} onChange={(nextValue) => updateForm("rmn", nextValue)} />
          </fieldset>

          <fieldset className="grid gap-3 rounded-md border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold">Project Management</legend>
            <ProjectCatalogSelect emptyLabel="Select Project Status" label="Project Status" options={statusCatalog} value={value.statusId} onChange={(nextValue) => updateForm("statusId", nextValue)} />
          </fieldset>

          {feedback !== null && <div className="text-sm text-rose-700">{feedback}</div>}
          {issues.map((issue) => (
            <div className="text-sm text-amber-800" key={`${issue.code}-${issue.target.field ?? "section"}`}>
              {issue.message}
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-md border border-slate-300 px-4 py-2 text-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm text-white"
            onClick={onSave}
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectCatalogSelect({
  emptyLabel,
  error,
  label,
  onChange,
  options,
  value,
}: {
  readonly emptyLabel: string;
  readonly error?: string;
  readonly label: string;
  readonly onChange: (value: CatalogSelection) => void;
  readonly options: readonly CatalogItem<CatalogItemId>[];
  readonly value: CatalogSelection;
}) {
  const hasResolvedValue = value === "" || options.some((option) => option.id === value);

  return (
    <label className="grid gap-1 text-sm md:grid-cols-[180px_1fr] md:items-center">
      <span>{label}</span>
      <span className="grid gap-1">
        <select
          className="rounded-md border border-slate-300 px-3 py-2"
          onChange={(event) => onChange(
            event.target.value === "" ? "" : toCatalogItemId(event.target.value),
          )}
          value={value}
        >
          <option value="">{emptyLabel}</option>
          {!hasResolvedValue && <option value={value}>-</option>}
          {options.map((option) => (
            <option key={option.id} value={option.id}>{option.displayName}</option>
          ))}
        </select>
        {error !== undefined && <span className="text-xs text-rose-700">{error}</span>}
      </span>
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorClass = ({
    RFQ: "border-violet-200 bg-violet-50 text-violet-700",
    "Kick off": "border-cyan-200 bg-cyan-50 text-cyan-700",
    Pending: "border-slate-300 bg-slate-100 text-slate-700",
    "On Going": "border-blue-200 bg-blue-50 text-blue-700",
    MP: "border-emerald-200 bg-emerald-50 text-emerald-700",
    EOL: "border-zinc-300 bg-zinc-100 text-zinc-700",
  } satisfies Record<string, string>)[status] ?? "border-slate-300 bg-white text-slate-700";

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {status}
    </span>
  );
}

function ProjectInput({
  error,
  label,
  onChange,
  value,
}: {
  readonly error?: string;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  return (
    <label className="grid gap-1 text-sm md:grid-cols-[180px_1fr] md:items-center">
      <span>{label}</span>
      <span className="grid gap-1">
        <input
          className="rounded-md border border-slate-300 px-3 py-2"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
        {error !== undefined && <span className="text-xs text-rose-700">{error}</span>}
      </span>
    </label>
  );
}

export interface ProjectWorkspaceProps {
  readonly feedback: readonly ValidationIssue[];
  readonly onBack: () => void;
  readonly onEditProject: () => void;
  readonly project: Project;
  readonly row: DashboardProjectRow;
  readonly scheduleWorkspaceProps: ScheduleWorkspaceProps;
  readonly teamMemberWorkspaceProps?: Omit<TeamMemberWorkspaceProps, "project" | "onBack">;
}

export function ProjectWorkspace({
  feedback,
  onBack,
  onEditProject,
  project,
  row,
  scheduleWorkspaceProps,
  teamMemberWorkspaceProps,
}: ProjectWorkspaceProps): React.ReactElement {
  const [openTeam, setOpenTeam] = React.useState(false);

  React.useEffect(() => {
    setOpenTeam(false);
  }, [project.id]);

  if (openTeam && teamMemberWorkspaceProps !== undefined) {
    return (
      <TeamMemberWorkspace
        {...teamMemberWorkspaceProps}
        onBack={() => setOpenTeam(false)}
        project={project}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6">
      <button className="w-fit text-sm text-slate-600 underline" onClick={onBack}>
        ← Dashboard
      </button>

      <section
        aria-label="Project Header"
        className="rounded-md border border-slate-200 bg-white p-4"
        data-project-id={project.id}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold">Project Master</h1>
            <div className="mt-3 grid gap-4 text-sm md:grid-cols-3">
              <div>
                <div className="font-semibold">Project Identity</div>
                <div className="mt-2 grid gap-1">
                  <div>Project Name: {row.projectName}</div>
                  <div>QCI Model Name: {row.qciModelName}</div>
                  <div>Acer Model Name: {row.acerModelName}</div>
                  <div>Acer Marketing Name: {row.acerMarketingName}</div>
                </div>
              </div>
              <div>
                <div className="font-semibold">Project Classification</div>
                <div className="mt-2 grid gap-1">
                  <div>Year: {row.year}</div>
                  <div>Customer: {row.customer}</div>
                  <div>Product Line: {row.productLine}</div>
                </div>
              </div>
              <div>
                <div className="font-semibold">Hardware</div>
                <div className="mt-2 grid gap-1">
                  <div>Panel Size: {row.panelSize}</div>
                  <div>CPU: {row.cpu}</div>
                  <div>GPU: {row.gpu}</div>
                </div>
              </div>
              <div>
                <div className="font-semibold">Internal Identifier</div>
                <div className="mt-2 grid gap-1">
                  <div>SSID: {row.ssid}</div>
                  <div>RMN: {row.rmn}</div>
                </div>
              </div>
              <div>
                <div className="font-semibold">Project Management</div>
                <div className="mt-2">
                  <StatusBadge status={row.projectStatus} />
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <button className="rounded-md border border-slate-300 px-4 py-2 text-sm" onClick={onEditProject}>
              Edit Project
            </button>
          </div>
        </div>
      </section>

      <section aria-label="Resources" className="rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Resources</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border border-slate-300 p-4">
            <h3 className="font-semibold">Schedule</h3>
            <div className="mt-2 text-sm text-slate-600">Shown below</div>
          </div>
          <div className="rounded-md border border-slate-300 p-4">
            <h3 className="font-semibold">Team Member</h3>
            <div className="mt-2 text-sm text-slate-600">View and edit the canonical Team</div>
            <button
              className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              disabled={teamMemberWorkspaceProps === undefined}
              onClick={() => setOpenTeam(true)}
              type="button"
            >
              Open Team Member
            </button>
          </div>
          <div className="rounded-md border border-slate-300 p-4">
            <h3 className="font-semibold">Weekly Report</h3>
            <div className="mt-2 text-sm text-slate-600">Migration pending</div>
            <button
              className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              disabled
              type="button"
            >
              Open Weekly Report
            </button>
          </div>
          <div className="rounded-md border border-slate-300 p-4">
            <h3 className="font-semibold">AVL</h3>
            <div className="mt-2 text-sm text-slate-600">Migration pending</div>
            <button
              className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              disabled
              type="button"
            >
              Open AVL
            </button>
          </div>
        </div>
      </section>

      <ScheduleWorkspace {...scheduleWorkspaceProps} />

      {feedback.map((issue) => (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm" key={`${issue.code}-${issue.target.field ?? "section"}`}>
          {issue.message}
        </div>
      ))}
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

const rootElement = document.getElementById("root");
if (rootElement !== null) {
  ReactDOM.createRoot(rootElement).render(<App />);
}
