import React from "react";
import ReactDOM from "react-dom/client";
import * as XLSX from "xlsx";
import { createPortfolioDashboardWorkbook } from "./portfolioDashboardExport";
import { PortfolioDashboardView } from "./portfolioDashboardView";
import { selectDashboardAttention } from "./application/selectors/dashboardAttention";
import { selectPortfolioDashboardRows } from "./application/selectors/portfolioDashboardRows";
import { selectProjectMilestoneFollowUp, type ProjectMilestoneFollowUpGroup } from "./application/selectors/projectMilestoneFollowUp";
import { createInitialMilestoneGovernanceRuntimeState } from "./application/governance/milestoneGovernanceInitializer";
import { prepareProjectCreationCommit } from "./application/governance/projectCreationGovernance";
import { discardGovernanceDraft, previewGovernancePublish, publishGovernanceDraft, startGovernanceDraft, updateGovernanceDraft } from "./application/governance/milestoneGovernanceCommands";
import type { GovernanceDraftUpdate, GovernancePublishPreview, MilestoneGovernanceRuntimeState } from "./domain/governance/milestoneGovernance";
import { GovernanceWorkspace } from "./governanceWorkspace";
import type { GovernanceScheduleToolsBindings } from "./governanceAdvancedTools";
import { selectEffectiveMilestoneGovernanceContext, selectEffectiveRetiredDraftOccurrenceGrants } from "./application/governance/effectiveMilestoneGovernanceContext";
import { createPortfolioVisibleSchema } from "./portfolioDashboardColumns";
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
import {
  addSelfServiceCatalogItem,
  createInitialSelfServiceReferenceCatalogs,
  type SelfServiceCatalogKey,
  type SelfServiceReferenceCatalogs,
} from "./application/reference-data/selfServiceCatalogs";
import { saveProjectTeamForState, type ProjectMismatchResult } from "./application/commands/teamSaveState";
import type { SaveProjectTeamResult } from "./application/commands/teamCommands";
import type { TeamEditCandidate } from "./application/teamImport/teamCandidate";
import {
  selectDashboardProjectRow,
  type DashboardProjectRow,
} from "./application/selectors/dashboardProjectRows";
import {
  resolveCanonicalScheduleOwner,
  selectCurrentPublishedSchedule,
  selectScheduleWorkingDraft,
} from "./application/selectors/scheduleSelectors";
import { getProjectById } from "./application/selectors/projectSelectors";
import {
  selectProjectLeverageDisplay,
  selectProjectReferenceOptions,
} from "./application/selectors/projectReferenceOptions";
import {
  confirmCreateProjectAnyway,
  interpretCreateProjectResult,
  interpretUpdateProjectMasterResult,
  type CreateProjectInterpretation,
  type DuplicateProjectDecisionRequest,
} from "./application/workflow/workflowInterpretation";
import {
  statusCatalog,
  teamFunctionCatalog,
} from "./config/v2/referenceData";
import type { Project } from "./domain/project/project";
import {
  createEmptyCanonicalProjectSchedule,
  type CanonicalProjectSchedule,
} from "./domain/schedule/officialSchedule";
import { toLocalDateOnly, type DateOnly } from "./domain/shared/dateOnly";
import {
  toCanonicalScheduleWorkingDraftId,
  toCatalogItemId,
  toGovernanceDraftId,
  toGovernanceReleaseId,
  toMilestoneId,
  toPersonAssignmentId,
  toProjectId,
  toRequirementEnrollmentId,
  toRequirementWithdrawalId,
  toTeamFunctionId,
  type CatalogItemId,
  type MilestoneDefinitionId,
  type MilestoneId,
  type ProjectId,
} from "./domain/shared/ids";
import type { ValidationIssue } from "./domain/validation/validationIssue";
import { DuplicateProjectReview } from "./duplicateProjectReview";
import { createUserTrialDemoSeed } from "./fixtures/userTrialDemoSeed";
import { canonicalProjectFixtures } from "./fixtures/v2/canonicalProjectFixtures";
import { canonicalScheduleFixtures } from "./fixtures/v2/canonicalScheduleFixtures";
import {
  customerReferenceFixtures,
} from "./fixtures/v2/referenceFixtures";
import { devTeamTemplateV2 } from "./fixtures/v2/teamTemplateFixtures";
import {
  emptyProjectMasterForm,
  overwriteProjectMasterFromForm,
  toCreateProjectMasterInput,
  toProjectMasterForm,
  validateProjectMasterMechanicalForm,
  type ProjectMasterFormErrors,
  type ProjectMasterForm,
} from "./projectMasterForm";
import {
  ProjectCatalogSelect,
  ProjectFieldInput,
  ProjectSelfServiceCatalogSelect,
  type ProjectSelfServiceCatalogAddResult,
} from "./projectMasterControls";
import { ProjectMasterDetail } from "./projectMasterDetail";
import { ScheduleWorkspace, type ScheduleWorkspaceProps } from "./scheduleWorkspace";
import { scheduleReviewFailureMessage, type LocalDefinitionFormInput, type LocalMappingFormInput } from "./scheduleImportReviewPanel";
import { confirmProjectLocalMilestoneDefinition, confirmScheduleImportDecision, loadBuiltInScheduleSimulation, mapDraftLocalOccurrenceToPublic } from "./application/commands/scheduleReviewCommands";
import { resolveScheduleDefinitions } from "./application/governance/scheduleDefinitionResolution";
import type { ConfirmScheduleImportDecisionInput, GovernanceSimulationPack } from "./domain/schedule/scheduleReview";
import { governanceSimulationPacks } from "./fixtures/v2/governanceSimulationFixtures";
import { toMilestoneDefinitionId, toScheduleEvidenceId, toScheduleImportCandidateId, toScheduleReviewDecisionId, toScheduleReviewSessionId } from "./domain/shared/ids";
import { TeamMemberWorkspace, type TeamMemberWorkspaceProps } from "./teamMemberWorkspace";
import {
  defaultTeamMemberFields,
  type TeamMembersState,
} from "./teamMembers";
import "./styles.css";

type Page = "dashboard" | "workspace" | "projectMasterDetail" | "governance";

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

export function createUserTrialPrototypeState(
  referenceDate: DateOnly,
): PrototypeState {
  const demoSeed = createUserTrialDemoSeed(referenceDate);
  return {
    projects: [...canonicalProjectFixtures, ...demoSeed.projects],
    schedules: [...canonicalScheduleFixtures, ...demoSeed.schedules],
  };
}

const createDefaults: CreateProjectDefaults = {
  customerId: toCatalogItemId("dev-customer-acer"),
  statusId: toCatalogItemId("status-rfq"),
  teamTemplate: devTeamTemplateV2,
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

export interface AppProps {
  readonly createCatalogItemId?: () => CatalogItemId;
  readonly initialState?: PrototypeState;
  readonly initialSelectedProjectId?: ProjectId | null;
  readonly referenceDate?: DateOnly;
}

export function App({
  createCatalogItemId = () => toCatalogItemId(globalThis.crypto.randomUUID()),
  initialState = initialPrototypeState,
  initialSelectedProjectId = null,
  referenceDate,
}: AppProps = {}): React.ReactElement {
  const [page, setPage] = React.useState<Page>(
    initialSelectedProjectId === null ? "dashboard" : "workspace",
  );
  const [state, dispatch] = React.useReducer(prototypeReducer, initialState);
  const [governanceState, setGovernanceState] = React.useState(createInitialMilestoneGovernanceRuntimeState);
  const [governancePreviewSnapshot, setGovernancePreviewSnapshot] = React.useState<{
    readonly governance: MilestoneGovernanceRuntimeState;
    readonly prototype: PrototypeState;
    readonly preview: GovernancePublishPreview;
  } | null>(null);
  const [governanceIssues, setGovernanceIssues] = React.useState<readonly ValidationIssue[]>([]);
  // A preview is actionable only for the exact two snapshots that were validated.
  const governancePreview = governancePreviewSnapshot?.governance === governanceState && governancePreviewSnapshot.prototype === state
    ? governancePreviewSnapshot.preview : null;
  const startPublicGovernanceDraft = () => {
    const result = startGovernanceDraft(governanceState, toGovernanceDraftId(globalThis.crypto.randomUUID()));
    setGovernancePreviewSnapshot(null);
    setGovernanceIssues(result.ok ? [] : result.issues);
    if (result.ok) setGovernanceState(result.value);
  };
  const updatePublicGovernanceDraft = (update: GovernanceDraftUpdate) => {
    const result = updateGovernanceDraft(governanceState, update);
    setGovernancePreviewSnapshot(null);
    setGovernanceIssues(result.ok ? [] : result.issues);
    if (result.ok) setGovernanceState(result.value);
  };
  const previewPublicGovernanceDraft = () => {
    setGovernanceIssues([]);
    setGovernancePreviewSnapshot({ governance: governanceState, prototype: state, preview: previewGovernancePublish(governanceState, state) });
  };
  const publishPublicGovernanceDraft = () => {
    if (!governancePreview || governancePreview.blockingIssues.length > 0) return;
    const result = publishGovernanceDraft(governanceState, state, {
      createReleaseId: () => toGovernanceReleaseId(globalThis.crypto.randomUUID()),
      createEnrollmentId: () => toRequirementEnrollmentId(globalThis.crypto.randomUUID()),
      createWithdrawalId: () => toRequirementWithdrawalId(globalThis.crypto.randomUUID()),
      nowIso: () => new Date().toISOString(),
    });
    setGovernanceIssues(result.ok ? [] : result.issues);
    if (result.ok) {
      setGovernanceState(result.value);
      setGovernancePreviewSnapshot(null);
    }
  };
  const { governance, retiredDraftOccurrenceGrants } = React.useMemo(() => {
    const result = selectEffectiveMilestoneGovernanceContext(governanceState);
    if (!result.ok) throw new Error(`Governance unavailable: ${result.code}`);
    const grants = selectEffectiveRetiredDraftOccurrenceGrants(governanceState);
    if (!grants.ok) throw new Error(`Governance unavailable: ${grants.code}`);
    return { governance: result.value, retiredDraftOccurrenceGrants: grants.value };
  }, [governanceState]);
  const portfolioSchema = React.useMemo(() => createPortfolioVisibleSchema(governance), [governance]);
  const scheduleCommandContext = (schedule: CanonicalProjectSchedule): CanonicalScheduleCommandContext => ({
    governance, localDefinitions: schedule.localDefinitions,
    retiredDraftOccurrenceGrants,
  });
  const [selfServiceCatalogs, setSelfServiceCatalogs] =
    React.useState<SelfServiceReferenceCatalogs>(createInitialSelfServiceReferenceCatalogs);
  const [dashboardReferenceDate] = React.useState<DateOnly>(
    () => referenceDate ?? toLocalDateOnly(new Date()),
  );
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const [selectedProjectId, setSelectedProjectId] =
    React.useState<ProjectId | null>(initialSelectedProjectId);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = React.useState(false);
  const [isProjectMasterEditing, setIsProjectMasterEditing] = React.useState(false);
  const [createCandidateId, setCreateCandidateId] = React.useState<ProjectId | null>(null);
  const [createForm, setCreateForm] = React.useState<ProjectMasterForm>(emptyProjectMasterForm);
  const [createFieldErrors, setCreateFieldErrors] = React.useState<CreateFieldErrors>({});
  const [createIssues, setCreateIssues] = React.useState<readonly ValidationIssue[]>([]);
  const [createFeedback, setCreateFeedback] = React.useState<string | null>(null);
  const [pendingDuplicateCreate, setPendingDuplicateCreate] =
    React.useState<PendingDuplicateCreate | null>(null);
  const [editForm, setEditForm] = React.useState<ProjectMasterForm>(emptyProjectMasterForm);
  const [editFieldErrors, setEditFieldErrors] = React.useState<ProjectMasterFormErrors>({});
  const [editIssues, setEditIssues] = React.useState<readonly ValidationIssue[]>([]);
  const [editFeedback, setEditFeedback] = React.useState<readonly ValidationIssue[]>([]);
  const [scheduleFeedback, setScheduleFeedback] = React.useState<readonly string[]>([]);
  const [governanceScheduleFeedback, setGovernanceScheduleFeedback] = React.useState<{ projectId: ProjectId; messages: readonly string[] } | null>(null);
  const commandContextRef = React.useRef(scheduleCommandContext);
  commandContextRef.current = scheduleCommandContext;

  const selectedCanonicalProject =
    selectedProjectId === null ? null : getProjectById(state, selectedProjectId);
  const portfolioDashboardRows = selectPortfolioDashboardRows(state, selfServiceCatalogs, governance);
  const milestoneFollowUp = selectProjectMilestoneFollowUp(state, governanceState, governance);
  const dashboardAttention = selectDashboardAttention(
    state,
    dashboardReferenceDate,
    governance,
  );
  const selectedDashboardRow =
    selectedProjectId === null
      ? null
      : selectDashboardProjectRow(state, selectedProjectId, selfServiceCatalogs);
  const selectedScheduleRead =
    selectedProjectId === null
      ? null
      : selectCurrentPublishedSchedule(state, selectedProjectId, governance);
  const selectedDraftRead = selectedProjectId === null
    ? null
    : selectScheduleWorkingDraft(state, selectedProjectId, governance);
  const selectedScheduleOwner = selectedProjectId === null
    ? null
    : resolveCanonicalScheduleOwner(state, selectedProjectId);
  const selectedLeverageDisplay = selectedProjectId === null
    ? null
    : selectProjectLeverageDisplay(state, selectedProjectId);
  const projectReferenceOptions = selectProjectReferenceOptions(state);

  const addSelfServiceOption = (
    key: SelfServiceCatalogKey,
    label: string,
  ): ProjectSelfServiceCatalogAddResult => {
    const result = addSelfServiceCatalogItem(
      selfServiceCatalogs,
      key,
      label,
      createCatalogItemId,
    );
    if (!result.ok) return { ok: false, message: result.message };
    setSelfServiceCatalogs(result.catalogs);
    return { ok: true, id: result.item.id };
  };

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
    const result = startScheduleWorkingDraft(
      owner.schedule,
      { workingDraftId: toCanonicalScheduleWorkingDraftId(globalThis.crypto.randomUUID()) },
      scheduleCommandContext(owner.schedule),
    );
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
      owner.schedule, input, scheduleCommandContext(owner.schedule),
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
      scheduleCommandContext(owner.schedule),
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
      owner.schedule, { milestoneId }, scheduleCommandContext(owner.schedule),
    );
    if (!result.ok) {
      setScheduleFeedback(scheduleFailureMessages(result));
      return;
    }
    dispatchScheduleReplacement(projectId, result);
    setScheduleFeedback([]);
  };

  const cancelScheduleDraft = (projectId: ProjectId, report: (messages: readonly string[]) => void = setScheduleFeedback): void => {
    const owner = resolveCanonicalScheduleOwner(stateRef.current, projectId);
    if (owner.kind === "unavailable") {
      report(owner.issues.map(({ message }) => message));
      return;
    }
    const result = cancelScheduleWorkingDraft(owner.schedule);
    if (!result.ok) {
      report(scheduleFailureMessages(result));
      return;
    }
    dispatchScheduleReplacement(projectId, result);
    report([]);
  };

  const publishScheduleDraft = (projectId: ProjectId, report: (messages: readonly string[]) => void = setScheduleFeedback): void => {
    const owner = resolveCanonicalScheduleOwner(stateRef.current, projectId);
    if (owner.kind === "unavailable") {
      report(owner.issues.map(({ message }) => message));
      return;
    }
    const publishedAt = new Date().toISOString();
    const result = publishScheduleWorkingDraft(
      owner.schedule, { publishedAt }, commandContextRef.current(owner.schedule),
    );
    if (!result.ok) {
      report(scheduleFailureMessages(result));
      return;
    }
    dispatchScheduleReplacement(projectId, result);
    report([]);
  };

  // Review commands always resolve the current Project owner and governance at confirmation.
  const currentReviewOwner = (projectId: ProjectId) => resolveCanonicalScheduleOwner(stateRef.current, projectId);
  const createProjectLocalDefinition = (projectId: ProjectId, input: LocalDefinitionFormInput): MilestoneDefinitionId | null => {
    const owner = currentReviewOwner(projectId);
    if (owner.kind !== "available") return null;
    const definitionId = toMilestoneDefinitionId(globalThis.crypto.randomUUID());
    const result = confirmProjectLocalMilestoneDefinition(owner.schedule, { ...input, definitionId, source: "manual", evidenceIds: [] }, commandContextRef.current(owner.schedule).governance);
    if (!result.ok) { setScheduleFeedback([scheduleReviewFailureMessage(result.code)]); return null; }
    dispatchScheduleReplacement(projectId, { ok: true, schedule: result.value });
    setScheduleFeedback([]);
    return definitionId;
  };
  const reportGovernanceSchedule = (projectId: ProjectId, messages: readonly string[]): void => setGovernanceScheduleFeedback({ projectId, messages });
  const loadScheduleSimulation = (projectId: ProjectId, pack: GovernanceSimulationPack): void => {
    const owner = currentReviewOwner(projectId);
    if (owner.kind !== "available") return;
    let schedule = owner.schedule;
    if (schedule.workingDraft === null) {
      const started = startScheduleWorkingDraft(schedule, { workingDraftId: toCanonicalScheduleWorkingDraftId(globalThis.crypto.randomUUID()) }, commandContextRef.current(schedule));
      if (!started.ok) { reportGovernanceSchedule(projectId, ["此專案目前無法建立草稿，請檢查既有排程與公版設定。"]); return; }
      schedule = started.schedule;
    }
    const records = governanceSimulationPacks[pack];
    const result = loadBuiltInScheduleSimulation(schedule, { pack, ids: {
      sessionId: toScheduleReviewSessionId(globalThis.crypto.randomUUID()),
      evidenceIds: records.map(() => toScheduleEvidenceId(globalThis.crypto.randomUUID())),
      candidateIds: records.map(() => toScheduleImportCandidateId(globalThis.crypto.randomUUID())),
    } }, commandContextRef.current(schedule));
    if (!result.ok) { reportGovernanceSchedule(projectId, [scheduleReviewFailureMessage(result.code, "zh")]); return; }
    if (result.value === owner.schedule) { reportGovernanceSchedule(projectId, ["此模擬情境已載入，未重複加入。"]); return; }
    // Start + load is committed once, only after both commands succeed.
    dispatchScheduleReplacement(projectId, { ok: true, schedule: result.value });
    reportGovernanceSchedule(projectId, []);
  };
  const confirmScheduleImport = (projectId: ProjectId, input: ConfirmScheduleImportDecisionInput): void => {
    const owner = currentReviewOwner(projectId);
    if (owner.kind !== "available") return;
    const target = input.target.kind === "updateExistingOccurrence" ? input.target : { ...input.target, milestoneId: toMilestoneId(globalThis.crypto.randomUUID()) };
    const result = confirmScheduleImportDecision(owner.schedule, { ...input, target, decisionId: toScheduleReviewDecisionId(globalThis.crypto.randomUUID()) }, commandContextRef.current(owner.schedule));
    if (!result.ok) { reportGovernanceSchedule(projectId, [scheduleReviewFailureMessage(result.code, "zh")]); return; }
    dispatchScheduleReplacement(projectId, { ok: true, schedule: result.value });
    reportGovernanceSchedule(projectId, []);
  };
  const mapScheduleLocal = (projectId: ProjectId, input: LocalMappingFormInput): boolean => {
    const owner = currentReviewOwner(projectId);
    if (owner.kind !== "available") return false;
    const result = mapDraftLocalOccurrenceToPublic(owner.schedule, { ...input,
      sessionId: toScheduleReviewSessionId(globalThis.crypto.randomUUID()), decisionId: toScheduleReviewDecisionId(globalThis.crypto.randomUUID()),
    }, commandContextRef.current(owner.schedule));
    if (!result.ok) { reportGovernanceSchedule(projectId, [scheduleReviewFailureMessage(result.code, "zh")]); return false; }
    dispatchScheduleReplacement(projectId, { ok: true, schedule: result.value });
    reportGovernanceSchedule(projectId, []);
    return true;
  };

  const bindGovernanceProject = (projectId: ProjectId): GovernanceScheduleToolsBindings | null => {
    const owner = resolveCanonicalScheduleOwner(state, projectId);
    if (owner.kind !== "available") return null;
    return {
      review: {
        schedule: owner.schedule, context: scheduleCommandContext(owner.schedule),
        onCreateLocal: () => null,
        onLoadSimulation: pack => loadScheduleSimulation(projectId, pack),
        onConfirmImport: input => confirmScheduleImport(projectId, input),
        onMapLocal: input => mapScheduleLocal(projectId, input),
      },
      feedback: governanceScheduleFeedback?.projectId === projectId ? governanceScheduleFeedback.messages : [],
      onClearFeedback: () => setGovernanceScheduleFeedback(null),
      onPublish: () => publishScheduleDraft(projectId, messages => reportGovernanceSchedule(projectId, messages.length ? ["此專案草稿尚無法發布，請檢查日期、適用性及待處理項目。"] : [])),
      onDiscard: () => cancelScheduleDraft(projectId, messages => reportGovernanceSchedule(projectId, messages.length ? ["此專案目前無法捨棄草稿，請重新檢查排程。"] : [])),
    };
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
          governance,
          feedback: scheduleFeedback,
          milestoneDefinitions: selectedScheduleOwner?.kind === "available"
            ? resolveScheduleDefinitions(governance, selectedScheduleOwner.schedule.localDefinitions).filter(definition =>
              governance.addablePublicDefinitions.some(publicDefinition => publicDefinition.id === definition.id)
              || selectedScheduleOwner.schedule.localDefinitions.some(local => local.id === definition.id))
            : governance.addablePublicDefinitions,
          review: selectedScheduleOwner?.kind === "available" ? {
            schedule: selectedScheduleOwner.schedule,
            context: scheduleCommandContext(selectedScheduleOwner.schedule),
            onCreateLocal: input => createProjectLocalDefinition(selectedProjectId, input),
            onLoadSimulation: pack => loadScheduleSimulation(selectedProjectId, pack),
            onConfirmImport: input => confirmScheduleImport(selectedProjectId, input),
            onMapLocal: input => mapScheduleLocal(selectedProjectId, input),
          } : undefined,
          nextVersionLabel,
          officialRead: selectedScheduleRead,
          onAddMilestone: addScheduleDraftMilestone,
          onCancelDraft: () => cancelScheduleDraft(selectedProjectId),
          onPublishDraft: () => publishScheduleDraft(selectedProjectId),
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
      setIsProjectMasterEditing(false);
      setPendingDuplicateCreate(null);
      setScheduleFeedback([]);
      setPage("dashboard");
    }
  }, [selectedProjectId, selectedCanonicalProject]);

  const openProject = (projectId: ProjectId) => {
    setSelectedProjectId(projectId);
    setIsProjectMasterEditing(false);
    setScheduleFeedback([]);
    setPage("workspace");
  };
  const backToDashboard = (): void => {
    setIsProjectMasterEditing(false);
    setScheduleFeedback([]);
    setPage("dashboard");
  };
  const openProjectMasterDetail = (): void => {
    setIsProjectMasterEditing(false);
    setPage("projectMasterDetail");
  };
  const backToProjectWorkspace = (): void => {
    setIsProjectMasterEditing(false);
    setPage("workspace");
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
    const prepared = prepareProjectCreationCommit(state, governanceState, {
      project,
      schedule: createEmptyCanonicalProjectSchedule(project.id),
    }, () => toRequirementEnrollmentId(globalThis.crypto.randomUUID()));
    if (!prepared.ok) {
      setPendingDuplicateCreate(null);
      setCreateIssues(prepared.issues);
      setCreateFeedback(null);
      return;
    }
    dispatch(prepared.value.prototypeAction);
    setGovernanceState(prepared.value.governanceState);
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
    setEditFieldErrors({});
    setEditIssues([]);
    setIsProjectMasterEditing(true);
  };
  const saveEdit = () => {
    if (selectedCanonicalProject === null) return;

    const fieldErrors = validateProjectMasterMechanicalForm(editForm);
    setEditFieldErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

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
    setIsProjectMasterEditing(false);
  };

  const matchingRows = pendingDuplicateCreate === null
    ? []
    : pendingDuplicateCreate.decision.matchingProjectIds
        .map((projectId) => getProjectById(state, projectId))
        .filter((project): project is Project => project !== null)
        .map((project) => selectDashboardProjectRow(state, project.id, selfServiceCatalogs))
        .filter((row): row is DashboardProjectRow => row !== null);
  const renderWorkspace =
    page === "workspace" &&
    selectedCanonicalProject !== null &&
    selectedDashboardRow !== null &&
    scheduleWorkspaceProps !== null;
  const renderProjectMasterDetail =
    page === "projectMasterDetail" &&
    selectedCanonicalProject !== null &&
    selectedDashboardRow !== null &&
    selectedLeverageDisplay !== null;
  const teamMemberWorkspaceProps = {
    createAssignmentId: () => toPersonAssignmentId(globalThis.crypto.randomUUID()),
    createFunctionId: () => toTeamFunctionId(globalThis.crypto.randomUUID()),
    onSave: saveTeam,
    standardFunctionDefinitions: teamFunctionCatalog,
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-100 text-slate-950">
      <nav aria-label="PIP navigation" className="flex justify-end border-b border-slate-200 bg-white px-4 py-2 sm:px-6">
        <button type="button" aria-current={page === "governance" ? "page" : undefined} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50" onClick={() => setPage("governance")}>公版管理</button>
      </nav>
      {page === "governance" && <GovernanceWorkspace
        state={governanceState}
        context={governance}
        projects={state.projects}
        schedules={state.schedules}
        scheduleTools={bindGovernanceProject}
        preview={governancePreview}
        issues={governanceIssues}
        onStartDraft={startPublicGovernanceDraft}
        onUpdateDraft={updatePublicGovernanceDraft}
        onPreview={previewPublicGovernanceDraft}
        onPublish={publishPublicGovernanceDraft}
        onDiscard={() => {
          setGovernanceState(discardGovernanceDraft(governanceState));
          setGovernancePreviewSnapshot(null);
          setGovernanceIssues([]);
        }}
        onBack={backToDashboard}
      />}
      {page === "dashboard" && (
        <PortfolioDashboardView
          attention={dashboardAttention}
          followUpGroups={milestoneFollowUp}
          onCreateProject={openCreate}
          onExport={(rows, schema) => XLSX.writeFile(createPortfolioDashboardWorkbook(rows, schema), "Project_Portfolio_Summary.xlsx")}
          onOpenProject={openProject}
          rows={portfolioDashboardRows}
          schema={portfolioSchema}
        />
      )}
      {renderWorkspace && (
        <ProjectWorkspace
          onBack={backToDashboard}
          onViewProjectMaster={openProjectMasterDetail}
          project={selectedCanonicalProject}
          row={selectedDashboardRow}
          milestoneFollowUp={milestoneFollowUp.find(group => group.projectId === selectedCanonicalProject.id)}
          scheduleWorkspaceProps={scheduleWorkspaceProps}
          teamMemberWorkspaceProps={teamMemberWorkspaceProps}
        />
      )}
      {renderProjectMasterDetail && (
        isProjectMasterEditing ? (
          <ProjectMasterDetail
            fieldErrors={editFieldErrors}
            form={editForm}
            issues={editIssues}
            key={selectedCanonicalProject.id}
            leverageDisplay={selectedLeverageDisplay}
            mode="edit"
            onCancel={() => {
              setEditFieldErrors({});
              setEditIssues([]);
              setIsProjectMasterEditing(false);
            }}
            onChange={(nextForm) => {
              setEditFieldErrors({});
              setEditForm(nextForm);
            }}
            onSave={saveEdit}
            onAddCatalogOption={addSelfServiceOption}
            project={selectedCanonicalProject}
            projectReferenceOptions={projectReferenceOptions}
            row={selectedDashboardRow}
            selfServiceCatalogs={selfServiceCatalogs}
          />
        ) : (
          <ProjectMasterDetail
            feedback={editFeedback}
            key={selectedCanonicalProject.id}
            leverageDisplay={selectedLeverageDisplay}
            mode="read"
            onBack={backToProjectWorkspace}
            onBeginEdit={openEdit}
            project={selectedCanonicalProject}
            projectReferenceOptions={projectReferenceOptions}
            row={selectedDashboardRow}
          />
        )
      )}
      {isCreateProjectOpen && (
        pendingDuplicateCreate === null ? (
          <CreateProjectDialog
            fieldErrors={createFieldErrors}
            feedback={createFeedback}
            issues={createIssues}
            onCancel={closeCreate}
            onChange={setCreateForm}
            onSave={saveCreate}
            onAddCatalogOption={addSelfServiceOption}
            selfServiceCatalogs={selfServiceCatalogs}
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
    </main>
  );
}


type CreateProjectDialogProps = {
  readonly fieldErrors: CreateFieldErrors;
  readonly feedback: string | null;
  readonly issues: readonly ValidationIssue[];
  readonly onCancel: () => void;
  readonly onAddCatalogOption: (
    key: SelfServiceCatalogKey,
    label: string,
  ) => ProjectSelfServiceCatalogAddResult;
  readonly onChange: (form: ProjectMasterForm) => void;
  readonly onSave: () => void;
  readonly selfServiceCatalogs: SelfServiceReferenceCatalogs;
  readonly value: ProjectMasterForm;
};

function CreateProjectDialog(props: CreateProjectDialogProps) {
  const {
  fieldErrors,
  feedback,
  issues,
  onAddCatalogOption,
  onCancel,
  onChange,
  onSave,
  selfServiceCatalogs,
  value,
  } = props;
  const updateForm = <TKey extends keyof ProjectMasterForm>(
    key: TKey,
    nextValue: ProjectMasterForm[TKey],
  ) => {
    onChange({ ...value, [key]: nextValue });
  };

  return (
    <div
      aria-label="Create Project"
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/20 px-4"
      role="dialog"
    >
      <div className="w-full max-w-2xl rounded-md border border-slate-300 bg-white p-5">
        <h2 className="text-lg font-semibold">Create Project</h2>

        <div className="mt-4 grid max-h-[70vh] gap-5 overflow-y-auto pr-1">
          <fieldset className="grid gap-3 rounded-md border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold">Project Identity</legend>
            <ProjectFieldInput
              error={fieldErrors.stnProjectName}
              label="STN Project Name"
              value={value.stnProjectName}
              onChange={(nextValue) => updateForm("stnProjectName", nextValue)}
            />
            <ProjectFieldInput label="QCI Model Name" value={value.qciModelName} onChange={(nextValue) => updateForm("qciModelName", nextValue)} />
            <ProjectFieldInput label="Acer Model Name" value={value.acerModelName} onChange={(nextValue) => updateForm("acerModelName", nextValue)} />
            <ProjectFieldInput label="Acer Marketing Name" value={value.acerMarketingName} onChange={(nextValue) => updateForm("acerMarketingName", nextValue)} />
          </fieldset>

          <fieldset className="grid gap-3 rounded-md border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold">Project Classification</legend>
            <ProjectFieldInput error={fieldErrors.year} label="Year" value={value.year} onChange={(nextValue) => updateForm("year", nextValue)} />
            <ProjectCatalogSelect emptyLabel="Select Customer" label="Customer" options={customerReferenceFixtures} value={value.customerId} onChange={(nextValue) => updateForm("customerId", nextValue)} />
            <ProjectSelfServiceCatalogSelect error={fieldErrors.productLine} emptyLabel="Select Product Line" label="Product Line" options={selfServiceCatalogs.productLine} value={value.productLineId} onAddOption={(label) => onAddCatalogOption("productLine", label)} onChange={(nextValue) => updateForm("productLineId", nextValue)} />
          </fieldset>

          <fieldset className="grid gap-3 rounded-md border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold">Hardware</legend>
            <ProjectSelfServiceCatalogSelect emptyLabel="Select Panel Size" label="Panel Size" options={selfServiceCatalogs.panelSize} value={value.panelSizeId} onAddOption={(label) => onAddCatalogOption("panelSize", label)} onChange={(nextValue) => updateForm("panelSizeId", nextValue)} />
            <ProjectSelfServiceCatalogSelect emptyLabel="Select CPU" label="CPU" options={selfServiceCatalogs.cpu} value={value.cpuId} onAddOption={(label) => onAddCatalogOption("cpu", label)} onChange={(nextValue) => updateForm("cpuId", nextValue)} />
            <ProjectSelfServiceCatalogSelect emptyLabel="Select GPU" label="GPU" options={selfServiceCatalogs.gpu} value={value.gpuId} onAddOption={(label) => onAddCatalogOption("gpu", label)} onChange={(nextValue) => updateForm("gpuId", nextValue)} />
          </fieldset>

          <fieldset className="grid gap-3 rounded-md border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold">Internal Identifier</legend>
            <ProjectFieldInput label="SSID" value={value.ssid} onChange={(nextValue) => updateForm("ssid", nextValue)} />
            <ProjectFieldInput label="RMN" value={value.rmn} onChange={(nextValue) => updateForm("rmn", nextValue)} />
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
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { readonly status: string }): React.ReactElement {
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

export interface ProjectWorkspaceProps {
  readonly onBack: () => void;
  readonly onViewProjectMaster: () => void;
  readonly project: Project;
  readonly row: DashboardProjectRow;
  readonly milestoneFollowUp?: ProjectMilestoneFollowUpGroup;
  readonly scheduleWorkspaceProps: ScheduleWorkspaceProps;
  readonly teamMemberWorkspaceProps?: Omit<TeamMemberWorkspaceProps, "project" | "onBack">;
}

export function ProjectWorkspace({
  onBack,
  onViewProjectMaster,
  project,
  row,
  milestoneFollowUp,
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
            <button className="rounded-md border border-slate-300 px-4 py-2 text-sm" onClick={onViewProjectMaster}>
              View Project Master
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

      {milestoneFollowUp && <section aria-label="Milestone Follow-up" className="min-w-0 rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold">Milestone Follow-up</h2>
        <p className="mt-2 break-words text-sm text-slate-700">Pending public milestones: {milestoneFollowUp.pendingDefinitions.map(definition => definition.displayName).join(", ")}</p>
        <p className="mt-1 text-xs text-slate-500">Complete by publishing the required Public Milestone or marking it N/A.</p>
      </section>}
      <ScheduleWorkspace {...scheduleWorkspaceProps} />
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
  const referenceDate = toLocalDateOnly(new Date());
  ReactDOM.createRoot(rootElement).render(
    <App
      initialState={createUserTrialPrototypeState(referenceDate)}
      referenceDate={referenceDate}
    />,
  );
}
