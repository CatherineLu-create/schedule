import React from "react";
import type { SaveProjectTeamResult } from "./application/commands/teamCommands";
import type { ProjectMismatchResult } from "./application/commands/teamSaveState";
import { selectTeamMemberRows, type TeamMemberRow } from "./application/selectors/teamMemberRows";
import {
  addTeamCandidateRow,
  assignCandidateFunction,
  confirmNoncriticalRole,
  createCustomCandidateFunctionRef,
  createEditCandidate,
  createImportCandidate,
  editTeamCandidate,
  excludeImportSourceRow,
  materializeProjectTeam,
  removeTeamCandidateRow,
  renameCustomCandidateFunction,
  validateTeamEditCandidate,
  type NewTeamCandidateRow,
  type TeamCandidateRow,
  type TeamEditCandidate,
} from "./application/teamImport/teamCandidate";
import {
  inspectTeamImport,
  readTeamImportFile,
  selectTeamImportSheet,
  type TeamImportFile,
  type TeamParsedSheet,
  type TeamSheetCandidate,
} from "./application/teamImport/teamImport";
import type { Project } from "./domain/project/project";
import type {
  PersonAssignmentId,
  ProjectId,
  TeamFunctionId,
} from "./domain/shared/ids";
import type {
  CustomProjectFunctionRef,
  ProjectFunctionRef,
  TeamSourceCell,
  TeamSourceRow,
} from "./domain/team/team";
import type { TeamFunctionDefinition } from "./domain/team/teamTemplate";
import { validateProjectTeam } from "./domain/team/teamValidation";
import type { ValidationIssue } from "./domain/validation/validationIssue";

export interface TeamMemberWorkspaceProps {
  readonly project: Project;
  readonly standardFunctionDefinitions: readonly TeamFunctionDefinition[];
  readonly createFunctionId: () => TeamFunctionId;
  readonly createAssignmentId: () => PersonAssignmentId;
  readonly onSave: (
    projectId: ProjectId,
    candidate: TeamEditCandidate,
  ) => SaveProjectTeamResult | ProjectMismatchResult;
  readonly onBack: () => void;
}

interface ReadState {
  readonly mode: "read";
  readonly importIssues?: readonly ValidationIssue[];
}

interface EditState {
  readonly mode: "edit";
  readonly candidate: TeamEditCandidate;
  readonly issues: readonly ValidationIssue[];
  readonly dirty: boolean;
  readonly confirm: "discardToRead" | "discardToBack" | "manualClear" | null;
  readonly importIssues?: readonly ValidationIssue[];
}

type RestorableState = ReadState | EditState;

interface ImportIdentity {
  readonly projectId: ProjectId;
  readonly requestId: number;
  readonly editorGeneration: number;
  readonly importSessionId: string;
}

interface ImportBase extends ImportIdentity {
  readonly priorState: RestorableState;
  readonly fileName: string;
}

interface ReadingState extends ImportBase {
  readonly mode: "importReading";
}

interface ChooseSheetState extends ImportBase {
  readonly mode: "importChooseSheet";
  readonly input: TeamImportFile;
  readonly sheets: readonly TeamSheetCandidate[];
  readonly issues: readonly ValidationIssue[];
}

interface PreviewState extends ImportBase {
  readonly mode: "importPreview";
  readonly candidate: TeamEditCandidate;
  readonly excludedRows: readonly TeamCandidateRow[];
  readonly issues: readonly ValidationIssue[];
  readonly rawRowCount: number;
  readonly selectedSheetName: string;
}

interface ReplaceConfirmState extends Omit<PreviewState, "mode"> {
  readonly mode: "importReplaceConfirm";
  readonly originalEffectiveRows: number;
  readonly incomingEffectiveRows: number;
}

type ActiveImportState = ReadingState | ChooseSheetState | PreviewState | ReplaceConfirmState;

interface ImportDiscardState {
  readonly mode: "importDiscard";
  readonly returnState: ActiveImportState | RestorableState;
}

interface ImportConsentState {
  readonly mode: "importConsent";
  readonly file: File;
  readonly returnState: EditState | PreviewState;
  readonly priorState: RestorableState;
}

type EditorState =
  | ReadState
  | EditState
  | ReadingState
  | ChooseSheetState
  | PreviewState
  | ReplaceConfirmState
  | ImportDiscardState
  | ImportConsentState;

function safeAnchor(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function hasPersonData(row: TeamCandidateRow): boolean {
  return (
    (row.name?.trim() ?? "") !== "" ||
    (row.email?.trim() ?? "") !== "" ||
    row.extraCells.some(
      (cell) => cell.rawValue !== null || (cell.formattedText?.trim() ?? "") !== "",
    )
  );
}

function withoutBlankManualPlaceholders(candidate: TeamEditCandidate): TeamEditCandidate {
  return {
    ...candidate,
    rows: candidate.rows.filter((row) => hasPersonData(row) || row.sourceRows.length > 0),
  };
}

function importIssue(code: string, message: string, fileName?: string): ValidationIssue {
  return {
    code,
    domain: "team",
    source: "import",
    severity: "blocking",
    message,
    target: { section: "team.import", ...(fileName === undefined ? {} : { entityId: fileName }) },
  };
}

function effectiveRosterCount(
  candidate: TeamEditCandidate,
  standardFunctionDefinitions: readonly TeamFunctionDefinition[],
): number | null {
  const result = materializeProjectTeam(
    withoutBlankManualPlaceholders(candidate),
    standardFunctionDefinitions,
  );
  return result.ok ? selectTeamMemberRows(result.team).length : null;
}

function projectDisplayName(project: Project): string {
  return project.master.basicInformation.stnProjectName ?? project.id;
}

function readFunctionName(
  row: TeamMemberRow,
  standardNames: ReadonlyMap<TeamFunctionId, string>,
): string {
  if (row.kind === "projectRole") return row.roleText;
  if (row.function.kind === "custom") return row.function.displayName;
  return standardNames.get(row.function.functionId) ?? row.function.functionId;
}

function readApplicability(project: Project, row: TeamMemberRow): string {
  if (row.kind === "projectRole") return "—";
  const value = project.team?.functions.find(
    (functionTeam) => functionTeam.function.functionId === row.function.functionId,
  )?.applicability;
  if (value === "notApplicable") return "Not Applicable";
  if (value === "applicable") return "Applicable";
  if (value === "pending") return "Pending";
  return "—";
}

function sourceValue(value: TeamSourceCell["rawValue"]): string {
  return value === null ? "(blank)" : String(value);
}

function SourceEvidenceDetails({
  sourceRows,
}: {
  readonly sourceRows: readonly TeamSourceRow[];
}): React.ReactElement {
  if (sourceRows.length === 0) {
    return <p>No imported source.</p>;
  }
  return (
    <div className="grid gap-3">
      {sourceRows.map((sourceRow, sourceIndex) => {
        const functionCell = sourceRow.cells.find(
          ({ headerText }) => headerText?.trim().toLowerCase() === "function",
        );
        return (
          <section
            className="rounded border border-slate-200 p-2"
            key={`${sourceRow.fileName}:${sourceRow.sheetName}:${sourceRow.rowNumber}:${sourceIndex}`}
          >
            <div>File: {sourceRow.fileName}</div>
            <div>Sheet: {sourceRow.sheetName}</div>
            <div>Row: {sourceRow.rowNumber}</div>
            {functionCell !== undefined && (
              <div>Original Function: {sourceValue(functionCell.rawValue)}</div>
            )}
            <div className="mt-2 grid gap-2">
              {sourceRow.cells.map((cell) => (
                <div className="rounded bg-slate-50 p-2" key={`${cell.columnIndex}:${cell.headerText ?? ""}`}>
                  <div>Column {cell.columnIndex} ({cell.headerText ?? "Unlabeled"})</div>
                  <div>Raw value ({cell.rawType}): {sourceValue(cell.rawValue)}</div>
                  {cell.formattedText !== null && <div>Formatted text: {cell.formattedText}</div>}
                  <div>Hidden: {cell.hidden ? "yes" : "no"}</div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ImportFileInput({
  onFile,
}: {
  readonly onFile: (file: File) => void;
}): React.ReactElement {
  return (
    <label className="cursor-pointer rounded-md border border-slate-300 px-4 py-2 text-sm">
      Import Team Member
      <input
        accept=".csv,.xls,.xlsx"
        aria-label="Import Team Member file"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file !== undefined) onFile(file);
        }}
        type="file"
      />
    </label>
  );
}

function ReadTeam({
  project,
  standardFunctionDefinitions,
  onBack,
  onEdit,
  onImport,
  importIssues = [],
}: {
  readonly project: Project;
  readonly standardFunctionDefinitions: readonly TeamFunctionDefinition[];
  readonly onBack: () => void;
  readonly onEdit: () => void;
  readonly onImport: (file: File) => void;
  readonly importIssues?: readonly ValidationIssue[];
}): React.ReactElement {
  const rows = selectTeamMemberRows(project.team);
  const standardNames = new Map(
    standardFunctionDefinitions.map((definition) => [definition.id, definition.displayName]),
  );
  const canonicalIssues = project.team === null
    ? []
    : validateProjectTeam(project.team, standardFunctionDefinitions);
  return (
    <section aria-label="Team Member workspace" className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6">
      <div className="flex items-center justify-between gap-4">
        <button className="text-sm text-slate-600 underline" onClick={onBack} type="button">Back</button>
        <div className="flex gap-2" data-action-side="right">
          <ImportFileInput onFile={onImport} />
          <button className="rounded-md border border-slate-300 px-4 py-2 text-sm" onClick={onEdit} type="button">Edit Team</button>
        </div>
      </div>
      <div className="rounded-md border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-semibold">Team Member</h1>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No Team members saved.</p>
        ) : (
          <table className="mt-4 w-full text-left text-sm">
            <thead><tr><th>Function</th><th>Role</th><th>Name</th><th>Email</th><th>Applicability</th><th>Details</th></tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.kind}:${row.rowId}:${index}`}>
                  <td>{readFunctionName(row, standardNames)}</td>
                  <td>{row.roleText}</td>
                  <td>{row.name ?? "—"}</td>
                  <td>{row.email ?? "—"}</td>
                  <td>{readApplicability(project, row)}</td>
                  <td>
                    <details>
                      <summary>Source details</summary>
                      {row.extraCells.map((cell) => (
                        <div key={`${cell.columnIndex}:${cell.headerText ?? ""}`}>
                          {cell.headerText ?? `Column ${cell.columnIndex}`}: {cell.formattedText ?? String(cell.rawValue ?? "")}
                        </div>
                      ))}
                      <SourceEvidenceDetails sourceRows={row.sourceRows} />
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <IssueSummary issues={canonicalIssues} renderedRowIds={new Set()} />
      <IssueSummary issues={importIssues} renderedRowIds={new Set()} />
    </section>
  );
}

function IssueSummary({
  issues,
  renderedRowIds,
}: {
  readonly issues: readonly ValidationIssue[];
  readonly renderedRowIds: ReadonlySet<string>;
}): React.ReactElement {
  const blocking = issues.filter(({ severity }) => severity === "blocking");
  const advisories = issues.filter(({ severity }) => severity === "advisory");
  const advisoryGroups = [...advisories.reduce((groups, issue) => {
    const existing = groups.get(issue.code);
    groups.set(issue.code, existing === undefined
      ? { issue, count: 1 }
      : { issue: existing.issue, count: existing.count + 1 });
    return groups;
  }, new Map<string, { issue: ValidationIssue; count: number }>()).values()];
  return (
    <div className="grid gap-3">
      {blocking.length > 0 && (
        <section aria-label="Blocking issues" className="rounded-md border border-rose-300 bg-rose-50 p-3">
          <h2 className="font-semibold">Blocking issues</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {blocking.map((issue, index) => (
              <li key={`${issue.code}:${issue.target.entityId ?? ""}:${index}`}>
                {issue.message}{" "}
                {issue.target.entityId !== undefined && renderedRowIds.has(issue.target.entityId) && (
                  <a className="underline" href={`#team-row-${safeAnchor(issue.target.entityId)}`}>Go to row</a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {advisoryGroups.length > 0 && (
        <section aria-label="Advisories" className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <h2 className="font-semibold">Advisories</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {advisoryGroups.map(({ issue, count }) => (
              <li key={issue.code}>{issue.message}{count > 1 ? ` (${count})` : ""}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function updateExtraCell(
  cells: readonly TeamSourceCell[],
  index: number,
  value: string,
): readonly TeamSourceCell[] {
  return cells.map((cell, cellIndex) => cellIndex === index
    ? { ...cell, rawType: "s", rawValue: value, formattedText: value }
    : cell);
}

function candidateCustomFunctionRefs(
  candidate: TeamEditCandidate,
): readonly CustomProjectFunctionRef[] {
  const refs = new Map<TeamFunctionId, CustomProjectFunctionRef>();
  for (const functionTeam of candidate.baseTeam?.functions ?? []) {
    if (functionTeam.function.kind === "custom") {
      refs.set(functionTeam.function.functionId, functionTeam.function);
    }
  }
  for (const row of candidate.rows) {
    if (row.functionRef?.kind === "custom") {
      refs.set(row.functionRef.functionId, row.functionRef);
    }
  }
  return [...refs.values()];
}

function CandidateRowEditor({
  candidate,
  row,
  standardFunctionDefinitions,
  onCandidate,
  onExcludeImportRow,
  createFunctionId,
}: {
  readonly candidate: TeamEditCandidate;
  readonly row: TeamCandidateRow;
  readonly standardFunctionDefinitions: readonly TeamFunctionDefinition[];
  readonly onCandidate: (candidate: TeamEditCandidate) => void;
  readonly onExcludeImportRow?: (row: TeamCandidateRow) => void;
  readonly createFunctionId: () => TeamFunctionId;
}): React.ReactElement {
  const customRefs = candidateCustomFunctionRefs(candidate);
  const functionValue = row.functionRef?.functionId ?? "__project_role__";
  const edit = (patch: Parameters<typeof editTeamCandidate>[2]) => {
    onCandidate(editTeamCandidate(candidate, row.rowId, patch, standardFunctionDefinitions));
  };
  const assign = (ref: ProjectFunctionRef) => {
    onCandidate(assignCandidateFunction(candidate, row.rowId, ref, standardFunctionDefinitions));
  };
  const createCustom = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const displayName = String(data.get("newCustomName") ?? "").trim();
    if (displayName === "") return;
    assign(createCustomCandidateFunctionRef(candidate, displayName, createFunctionId));
    form.reset();
  };
  const markApplicable = () => {
    if (row.functionRef === null) return;
    let next = candidate;
    for (const candidateRow of candidate.rows) {
      if (candidateRow.functionRef?.functionId === row.functionRef.functionId) {
        next = editTeamCandidate(next, candidateRow.rowId, { applicability: "applicable" }, standardFunctionDefinitions);
      }
    }
    onCandidate(next);
  };
  return (
    <fieldset
      className="grid gap-3 rounded-md border border-slate-300 p-3"
      data-assignment-id={row.assignmentId}
      data-row-id={row.rowId}
      data-testid="team-candidate-row"
      id={`team-row-${safeAnchor(row.rowId)}`}
    >
      <div
        data-assignment-id={row.assignmentId}
        data-row-id={row.rowId}
        data-testid={`team-candidate-row-${row.assignmentId}`}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-sm">Function
            <select
              aria-label="Function"
              className="rounded-md border border-slate-300 px-2 py-1"
              onChange={(event) => {
                const value = event.target.value;
                if (value === "__new_custom__" || value === "__project_role__") return;
                const standard = standardFunctionDefinitions.find(({ id }) => id === value);
                if (standard !== undefined) assign({ kind: "standard", functionId: standard.id });
                else {
                  const custom = customRefs.find(({ functionId }) => functionId === value);
                  if (custom !== undefined) assign(custom);
                }
              }}
              value={functionValue}
            >
              {row.functionRef === null && <option value="__project_role__">Project role</option>}
              {standardFunctionDefinitions.map((definition) => (
                <option key={definition.id} value={definition.id}>{definition.displayName}</option>
              ))}
              {customRefs.map((ref) => <option key={ref.functionId} value={ref.functionId}>{ref.displayName}</option>)}
              <option value="__new_custom__">New custom Function…</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">Role
            <input aria-label="Role" className="rounded-md border border-slate-300 px-2 py-1" onChange={(event) => edit({ roleText: event.target.value })} value={row.roleText} />
          </label>
          <label className="grid gap-1 text-sm">Name
            <input aria-label="Name" className="rounded-md border border-slate-300 px-2 py-1" onChange={(event) => edit({ name: event.target.value || null })} value={row.name ?? ""} />
          </label>
          <label className="grid gap-1 text-sm">Email
            <input aria-label="Email" className="rounded-md border border-slate-300 px-2 py-1" onChange={(event) => edit({ email: event.target.value || null })} value={row.email ?? ""} />
          </label>
        </div>
        {row.functionRef?.kind === "custom" && (
          <label className="mt-3 grid gap-1 text-sm">Custom Function name
            <input
              aria-label="Custom Function name"
              className="rounded-md border border-slate-300 px-2 py-1"
              onChange={(event) => onCandidate(renameCustomCandidateFunction(candidate, row.functionRef!.functionId, event.target.value))}
              value={row.functionRef.displayName}
            />
          </label>
        )}
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); createCustom(event.currentTarget); }}>
          <label className="grid gap-1 text-sm">New custom Function name
            <input aria-label="New custom Function name" className="rounded-md border border-slate-300 px-2 py-1" name="newCustomName" />
          </label>
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" type="submit">Create custom Function</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {row.applicability === "notApplicable" && hasPersonData(row) && (
            <button className="rounded-md border border-amber-400 px-3 py-1.5 text-sm" onClick={markApplicable} type="button">Mark Applicable</button>
          )}
          {row.possibleRestricted && row.restrictedRoleDecision === "unresolved" && (
            <button
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              onClick={() => onCandidate(confirmNoncriticalRole(candidate, row.rowId, standardFunctionDefinitions))}
              type="button"
            >Confirm noncritical role</button>
          )}
          {candidate.origin === "import" && row.sourceRows.length > 0 && (
            <button
              className="rounded-md border border-amber-300 px-3 py-1.5 text-sm"
              onClick={() => {
                if (onExcludeImportRow !== undefined) {
                  onExcludeImportRow(row);
                  return;
                }
                onCandidate(excludeImportSourceRow(candidate, row.rowId));
              }}
              type="button"
            >Exclude imported row</button>
          )}
          <button className="rounded-md border border-rose-300 px-3 py-1.5 text-sm" onClick={() => onCandidate(removeTeamCandidateRow(candidate, row.rowId))} type="button">Remove person</button>
        </div>
        <details className="mt-3 text-sm">
          <summary>Source details</summary>
          <div className="mt-2 grid gap-2">
            {row.extraCells.map((cell, index) => (
              <label className="grid gap-1" key={`${cell.columnIndex}:${cell.headerText ?? ""}`}>
                {cell.headerText ?? `Column ${cell.columnIndex}`}
                <input
                  className="rounded-md border border-slate-300 px-2 py-1"
                  onChange={(event) => edit({ extraCells: updateExtraCell(row.extraCells, index, event.target.value) })}
                  value={cell.formattedText ?? String(cell.rawValue ?? "")}
                />
              </label>
            ))}
            <SourceEvidenceDetails sourceRows={row.sourceRows} />
          </div>
        </details>
      </div>
    </fieldset>
  );
}

function CandidateRosterEditor({
  candidate,
  standardFunctionDefinitions,
  createFunctionId,
  onCandidate,
  onExcludeImportRow,
  onAddPerson,
}: {
  readonly candidate: TeamEditCandidate;
  readonly standardFunctionDefinitions: readonly TeamFunctionDefinition[];
  readonly createFunctionId: () => TeamFunctionId;
  readonly onCandidate: (candidate: TeamEditCandidate) => void;
  readonly onExcludeImportRow?: (row: TeamCandidateRow) => void;
  readonly onAddPerson: () => void;
}): React.ReactElement {
  return (
    <div className="mt-4 grid gap-3">
      {candidate.rows.map((row) => (
        <CandidateRowEditor
          candidate={candidate}
          createFunctionId={createFunctionId}
          key={row.rowId}
          onCandidate={onCandidate}
          onExcludeImportRow={onExcludeImportRow}
          row={row}
          standardFunctionDefinitions={standardFunctionDefinitions}
        />
      ))}
      <button className="w-fit rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={onAddPerson} type="button">Add person</button>
    </div>
  );
}

function ExcludedImportRows({ rows }: { readonly rows: readonly TeamCandidateRow[] }): React.ReactElement | null {
  if (rows.length === 0) return null;
  return (
    <section aria-label="Excluded imported rows" className="rounded-md border border-amber-300 bg-amber-50 p-3">
      <h2 className="font-semibold">Excluded imported rows</h2>
      <div className="mt-2 grid gap-3">
        {rows.map((row) => (
          <article className="rounded border border-amber-200 bg-white p-2 text-sm" key={row.rowId}>
            <div>Name: {row.name ?? "(blank)"}</div>
            <div>Email: {row.email ?? "(blank)"}</div>
            <div>Function: {row.functionText || "(blank)"}</div>
            <SourceEvidenceDetails sourceRows={row.sourceRows} />
          </article>
        ))}
      </div>
    </section>
  );
}

export function TeamMemberWorkspace({
  project,
  standardFunctionDefinitions,
  createFunctionId,
  createAssignmentId,
  onSave,
  onBack,
}: TeamMemberWorkspaceProps): React.ReactElement {
  const [editor, setEditor] = React.useState<EditorState>({ mode: "read" });
  const requestIdRef = React.useRef(0);
  const editorGenerationRef = React.useRef(0);
  const activeImportRef = React.useRef<ImportIdentity | null>(null);
  const mountedRef = React.useRef(true);
  const projectRef = React.useRef(project);
  projectRef.current = project;

  React.useLayoutEffect(() => {
    editorGenerationRef.current += 1;
    activeImportRef.current = null;
    setEditor({ mode: "read" });
  }, [project.id]);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      editorGenerationRef.current += 1;
      activeImportRef.current = null;
    };
  }, []);

  const isLiveImport = (identity: ImportIdentity): boolean => {
    const active = activeImportRef.current;
    return (
      mountedRef.current &&
      projectRef.current.id === identity.projectId &&
      active?.projectId === identity.projectId &&
      active.requestId === identity.requestId &&
      active.editorGeneration === identity.editorGeneration &&
      active.importSessionId === identity.importSessionId
    );
  };

  const matchesImportIdentity = (
    state: ActiveImportState | RestorableState,
    identity: ImportIdentity,
  ): state is ActiveImportState => state.mode.startsWith("import") && (
    "requestId" in state &&
    state.projectId === identity.projectId &&
    state.requestId === identity.requestId &&
    state.editorGeneration === identity.editorGeneration &&
    state.importSessionId === identity.importSessionId
  );

  const setImportProgress = (
    identity: ImportIdentity,
    next: ActiveImportState,
  ): void => {
    setEditor((current) => current.mode === "importDiscard" &&
      matchesImportIdentity(current.returnState, identity)
      ? { ...current, returnState: next }
      : next);
  };

  const finishImport = (
    identity: ImportIdentity,
    priorState: RestorableState,
    issues: readonly ValidationIssue[],
  ): void => {
    if (!isLiveImport(identity)) return;
    const restored: RestorableState = issues.length === 0
      ? priorState
      : { ...priorState, importIssues: issues };
    editorGenerationRef.current += 1;
    activeImportRef.current = null;
    setEditor((current) => current.mode === "importDiscard" &&
      matchesImportIdentity(current.returnState, identity)
      ? { ...current, returnState: restored }
      : restored);
  };

  const restorePriorState = (
    priorState: RestorableState,
    issues: readonly ValidationIssue[] = [],
  ): void => {
    editorGenerationRef.current += 1;
    activeImportRef.current = null;
    setEditor(issues.length === 0
      ? priorState
      : { ...priorState, importIssues: issues });
  };

  const acceptReadySheet = (
    identity: ImportIdentity,
    priorState: RestorableState,
    sheet: TeamParsedSheet,
  ): void => {
    if (!isLiveImport(identity)) return;
    const latestProject = projectRef.current;
    if (latestProject.id !== identity.projectId) return;
    const candidate = createImportCandidate(
      latestProject.id,
      latestProject.team,
      sheet,
      identity.importSessionId,
      standardFunctionDefinitions,
      createFunctionId,
      createAssignmentId,
    );
    setImportProgress(identity, {
      ...identity,
      mode: "importPreview",
      priorState,
      fileName: sheet.fileName,
      candidate,
      excludedRows: [],
      issues: validateTeamEditCandidate(candidate, standardFunctionDefinitions),
      rawRowCount: sheet.rows.length,
      selectedSheetName: sheet.sheetName,
    });
  };

  const startImport = (file: File, priorState: RestorableState): void => {
    const identity: ImportIdentity = {
      projectId: projectRef.current.id,
      requestId: requestIdRef.current + 1,
      editorGeneration: editorGenerationRef.current + 1,
      importSessionId: globalThis.crypto.randomUUID(),
    };
    requestIdRef.current = identity.requestId;
    editorGenerationRef.current = identity.editorGeneration;
    activeImportRef.current = identity;
    setEditor({ mode: "importReading", ...identity, priorState, fileName: file.name });
    void readTeamImportFile(file)
      .then((input) => {
        if (!isLiveImport(identity)) return;
        const inspection = inspectTeamImport(input);
        if (!isLiveImport(identity)) return;
        if (inspection.kind === "error") {
          finishImport(identity, priorState, inspection.issues);
          return;
        }
        if (inspection.kind === "chooseSheet") {
          setImportProgress(identity, {
            mode: "importChooseSheet",
            ...identity,
            priorState,
            fileName: input.fileName,
            input,
            sheets: inspection.sheets,
            issues: [],
          });
          return;
        }
        acceptReadySheet(identity, priorState, inspection.sheet);
      })
      .catch((error: unknown) => {
        if (!isLiveImport(identity)) return;
        finishImport(identity, priorState, [importIssue(
          "team.import.file-read",
          error instanceof Error ? error.message : "Team import file could not be read.",
          file.name,
        )]);
      });
  };

  const selectImport = (file: File): void => {
    if (editor.mode === "edit" && editor.dirty) {
      setEditor({ mode: "importConsent", file, returnState: editor, priorState: editor });
      return;
    }
    if (editor.mode === "importPreview") {
      setEditor({
        mode: "importConsent",
        file,
        returnState: editor,
        priorState: editor.priorState,
      });
      return;
    }
    if (editor.mode === "importReplaceConfirm") {
      const preview: PreviewState = { ...editor, mode: "importPreview" };
      setEditor({
        mode: "importConsent",
        file,
        returnState: preview,
        priorState: editor.priorState,
      });
      return;
    }
    if (editor.mode === "importReading" || editor.mode === "importChooseSheet") {
      startImport(file, editor.priorState);
      return;
    }
    if (editor.mode === "read" || editor.mode === "edit") {
      startImport(file, editor);
    }
  };

  const addPersonToCandidate = (
    candidate: TeamEditCandidate,
    onCandidate: (candidate: TeamEditCandidate) => void,
  ): void => {
    const definition = standardFunctionDefinitions.find(({ active }) => active)
      ?? standardFunctionDefinitions[0];
    const functionRef: ProjectFunctionRef | null = definition === undefined
      ? null
      : { kind: "standard", functionId: definition.id };
    const applicability = functionRef === null
      ? null
      : candidate.baseTeam?.functions.find(
          (functionTeam) => functionTeam.function.functionId === functionRef.functionId,
        )?.applicability ?? "pending";
    const row: NewTeamCandidateRow = {
      functionText: definition?.displayName ?? "",
      functionRef,
      parsedRole: functionRef === null ? "unclassified" : "member",
      restrictedKey: null,
      possibleRestricted: false,
      restrictedRoleDecision: "unresolved",
      roleText: functionRef === null ? "" : "member",
      name: null,
      email: null,
      extraCells: [],
      sourceRows: [],
      applicability,
    };
    onCandidate(addTeamCandidateRow(candidate, row, createAssignmentId));
  };

  if (editor.mode === "read") {
    return (
      <ReadTeam
        importIssues={editor.importIssues}
        onBack={onBack}
        onEdit={() => {
          editorGenerationRef.current += 1;
          activeImportRef.current = null;
          const candidate = createEditCandidate(project.id, project.team, standardFunctionDefinitions);
          setEditor({
            mode: "edit",
            candidate,
            issues: validateTeamEditCandidate(candidate, standardFunctionDefinitions),
            dirty: false,
            confirm: null,
          });
        }}
        onImport={selectImport}
        project={project}
        standardFunctionDefinitions={standardFunctionDefinitions}
      />
    );
  }

  if (editor.mode === "importConsent") {
    return (
      <section aria-label="Team Member workspace" className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6">
        <div aria-label="Replace unsaved Team edits" className="rounded-md border border-amber-300 bg-white p-4" role="dialog">
          <h1 className="text-lg font-semibold">Replace unsaved Team edits?</h1>
          <p className="mt-2 text-sm">The current unsaved candidate will be preserved unless you continue.</p>
          <div className="mt-3 flex justify-between gap-2">
            <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" data-action-side="left" onClick={() => setEditor(editor.returnState)} type="button">Keep current edit</button>
            <button className="rounded-md border border-slate-900 px-3 py-1.5 text-sm" data-action-side="right" onClick={() => startImport(editor.file, editor.priorState)} type="button">Continue with import</button>
          </div>
        </div>
      </section>
    );
  }

  if (editor.mode === "importDiscard") {
    return (
      <section aria-label="Team Member workspace" className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6">
        <div aria-label="Discard unsaved Team import" className="rounded-md border border-amber-300 bg-white p-4" role="dialog">
          <h1 className="text-lg font-semibold">Discard unsaved Team import?</h1>
          <p className="mt-2 text-sm">The current read, sheet choice, or preview will be discarded without saving.</p>
          <div className="mt-3 flex justify-between gap-2">
            <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" data-action-side="left" onClick={() => setEditor(editor.returnState)} type="button">Stay</button>
            <button
              className="rounded-md border border-rose-400 px-3 py-1.5 text-sm"
              data-action-side="right"
              onClick={() => {
                editorGenerationRef.current += 1;
                activeImportRef.current = null;
                setEditor({ mode: "read" });
                onBack();
              }}
              type="button"
            >Discard &amp; Leave</button>
          </div>
        </div>
      </section>
    );
  }

  if (editor.mode === "importReading") {
    return (
      <section aria-label="Team Member workspace" className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6">
        <div className="flex justify-between gap-3">
          <div className="flex gap-2" data-action-side="left">
            <button className="text-sm text-slate-600 underline" onClick={() => setEditor({ mode: "importDiscard", returnState: editor })} type="button">Back</button>
            <button className="text-sm text-slate-600 underline" onClick={() => restorePriorState(editor.priorState)} type="button">Cancel Import</button>
          </div>
          <ImportFileInput onFile={selectImport} />
        </div>
        <section aria-live="polite" className="rounded-md border border-slate-200 bg-white p-4">
          <h1 className="text-2xl font-semibold">Reading Team import</h1>
          <p className="mt-2 text-sm">{editor.fileName}</p>
        </section>
      </section>
    );
  }

  if (editor.mode === "importChooseSheet") {
    const chooseSheet = (sheetName: string): void => {
      if (!isLiveImport(editor)) return;
      const inspection = selectTeamImportSheet(editor.input, sheetName);
      if (!isLiveImport(editor)) return;
      if (inspection.kind === "ready") {
        acceptReadySheet(editor, editor.priorState, inspection.sheet);
        return;
      }
      setEditor({ ...editor, issues: inspection.kind === "error" ? inspection.issues : [importIssue(
        "team.import.sheet-selection",
        "Selected sheet did not resolve to one roster.",
        sheetName,
      )] });
    };
    return (
      <section aria-label="Team Member workspace" className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6">
        <div className="flex justify-between gap-3">
          <div className="flex gap-2" data-action-side="left">
            <button className="text-sm text-slate-600 underline" onClick={() => setEditor({ mode: "importDiscard", returnState: editor })} type="button">Back</button>
            <button className="text-sm text-slate-600 underline" onClick={() => restorePriorState(editor.priorState)} type="button">Cancel Import</button>
          </div>
          <ImportFileInput onFile={selectImport} />
        </div>
        <section aria-label="Choose Team import sheet" className="rounded-md border border-slate-200 bg-white p-4">
          <h1 className="text-2xl font-semibold">Choose Team import sheet</h1>
          <p className="mt-1 text-sm">File: {editor.fileName}</p>
          <div className="mt-4 grid gap-3">
            {editor.sheets.map((sheet) => (
              <div className="flex items-center justify-between rounded border border-slate-200 p-3" key={sheet.sheetName}>
                <span>{sheet.sheetName}: header row {sheet.headerRowNumber}, {sheet.personRowCount} person row{sheet.personRowCount === 1 ? "" : "s"}</span>
                <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={() => chooseSheet(sheet.sheetName)} type="button">Use {sheet.sheetName}</button>
              </div>
            ))}
          </div>
        </section>
        <IssueSummary issues={editor.issues} renderedRowIds={new Set()} />
      </section>
    );
  }

  if (editor.mode === "importPreview" || editor.mode === "importReplaceConfirm") {
    const updateImportCandidate = (candidate: TeamEditCandidate): void => {
      setEditor({
        ...editor,
        mode: "importPreview",
        candidate,
        issues: validateTeamEditCandidate(
          withoutBlankManualPlaceholders(candidate),
          standardFunctionDefinitions,
        ),
      });
    };
    const excludeImportRow = (row: TeamCandidateRow): void => {
      const candidate = excludeImportSourceRow(editor.candidate, row.rowId);
      setEditor({
        ...editor,
        mode: "importPreview",
        candidate,
        excludedRows: editor.excludedRows.some(({ rowId }) => rowId === row.rowId)
          ? editor.excludedRows
          : [...editor.excludedRows, row],
        issues: validateTeamEditCandidate(
          withoutBlankManualPlaceholders(candidate),
          standardFunctionDefinitions,
        ),
      });
    };
    const performImportSave = (candidate: TeamEditCandidate): void => {
      if (!isLiveImport(editor)) return;
      const latestProject = projectRef.current;
      if (latestProject.id !== editor.projectId || candidate.projectId !== editor.projectId) return;
      const result = onSave(latestProject.id, candidate);
      if (result.ok) {
        editorGenerationRef.current += 1;
        activeImportRef.current = null;
        setEditor({ mode: "read" });
        return;
      }
      setEditor({ ...editor, mode: "importPreview", issues: result.issues });
    };
    const requestImportSave = (): void => {
      const candidate = withoutBlankManualPlaceholders(editor.candidate);
      const incomingEffectiveRows = effectiveRosterCount(candidate, standardFunctionDefinitions);
      if (incomingEffectiveRows === null) {
        const materialized = materializeProjectTeam(candidate, standardFunctionDefinitions);
        setEditor({
          ...editor,
          mode: "importPreview",
          issues: materialized.ok ? editor.issues : materialized.issues,
        });
        return;
      }
      if (incomingEffectiveRows === 0) {
        setEditor({
          ...editor,
          mode: "importPreview",
          issues: [
            ...editor.issues.filter(({ code }) => code !== "team.import.zero-effective-rows"),
            importIssue(
              "team.import.zero-effective-rows",
              "Import must contain at least one effective roster row.",
              editor.fileName,
            ),
          ],
        });
        return;
      }
      const latestProject = projectRef.current;
      if (latestProject.id !== editor.projectId) return;
      const originalEffectiveRows = selectTeamMemberRows(latestProject.team).length;
      if (originalEffectiveRows > 0) {
        setEditor({
          ...editor,
          mode: "importReplaceConfirm",
          candidate,
          originalEffectiveRows,
          incomingEffectiveRows,
        });
        return;
      }
      performImportSave(candidate);
    };
    const incomingCount = effectiveRosterCount(editor.candidate, standardFunctionDefinitions);
    const blocking = editor.issues.some(({ severity }) => severity === "blocking");
    return (
      <section aria-label="Team Member workspace" className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-2" data-action-side="left">
            <button className="text-sm text-slate-600 underline" onClick={() => setEditor({ mode: "importDiscard", returnState: editor })} type="button">Back</button>
            <button className="text-sm text-slate-600 underline" onClick={() => restorePriorState(editor.priorState)} type="button">Cancel Import</button>
          </div>
          <div className="flex gap-2" data-action-side="right">
            <ImportFileInput onFile={selectImport} />
            <button className="rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={blocking} onClick={requestImportSave} type="button">Save imported Team</button>
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <h1 className="text-2xl font-semibold">Import Team preview</h1>
          <p className="mt-1 text-sm">File: {editor.fileName}</p>
          <p className="text-sm">Sheet: {editor.selectedSheetName}</p>
          <p className="text-sm">Raw parsed rows: {editor.rawRowCount}</p>
          <p className="text-sm">Effective roster rows: {incomingCount ?? "Resolve Blocking issues"}</p>
          <p className="text-sm">Excluded imported rows: {editor.candidate.excludedSourceRowIds.length}</p>
          <CandidateRosterEditor
            candidate={editor.candidate}
            createFunctionId={createFunctionId}
            onAddPerson={() => addPersonToCandidate(editor.candidate, updateImportCandidate)}
            onCandidate={updateImportCandidate}
            onExcludeImportRow={excludeImportRow}
            standardFunctionDefinitions={standardFunctionDefinitions}
          />
        </div>
        <ExcludedImportRows rows={editor.excludedRows} />
        <IssueSummary
          issues={editor.issues}
          renderedRowIds={new Set(editor.candidate.rows.map(({ rowId }) => rowId))}
        />
        {editor.mode === "importReplaceConfirm" && (
          <div aria-label="Confirm whole Team replacement" className="rounded-md border border-rose-300 bg-white p-4" role="dialog">
            <h2 className="font-semibold">Replace the saved Team?</h2>
            <p>Project: {projectDisplayName(projectRef.current)}</p>
            <p>File: {editor.fileName}</p>
            <p>Existing roster rows: {editor.originalEffectiveRows}</p>
            <p>Incoming roster rows: {editor.incomingEffectiveRows}</p>
            <p>People absent from the incoming import will disappear.</p>
            <p>Existing system and manual edits do not merge automatically.</p>
            <div className="mt-3 flex justify-between gap-2">
              <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" data-action-side="left" onClick={() => setEditor({ ...editor, mode: "importPreview" })} type="button">Back to preview</button>
              <button
                className="rounded-md border border-rose-400 px-3 py-1.5 text-sm"
                data-action-side="right"
                onClick={() => {
                  const latestCount = selectTeamMemberRows(projectRef.current.team).length;
                  if (latestCount !== editor.originalEffectiveRows) {
                    setEditor({ ...editor, originalEffectiveRows: latestCount });
                    return;
                  }
                  performImportSave(editor.candidate);
                }}
                type="button"
              >Replace &amp; Save</button>
            </div>
          </div>
        )}
      </section>
    );
  }

  const updateCandidate = (candidate: TeamEditCandidate): void => {
    setEditor({
      mode: "edit",
      candidate,
      issues: validateTeamEditCandidate(
        withoutBlankManualPlaceholders(candidate),
        standardFunctionDefinitions,
      ),
      dirty: true,
      confirm: null,
    });
  };
  const blocking = editor.issues.some(({ severity }) => severity === "blocking");
  const performSave = (candidate: TeamEditCandidate): void => {
    const result = onSave(project.id, candidate);
    if (result.ok) {
      editorGenerationRef.current += 1;
      activeImportRef.current = null;
      setEditor({ mode: "read" });
      return;
    }
    setEditor({ ...editor, issues: result.issues, confirm: null });
  };
  const requestSave = (): void => {
    if (!editor.candidate.rows.some(hasPersonData)) {
      setEditor({ ...editor, confirm: "manualClear" });
      return;
    }
    performSave(withoutBlankManualPlaceholders(editor.candidate));
  };
  const requestCancel = (): void => {
    setEditor(editor.dirty ? { ...editor, confirm: "discardToRead" } : { mode: "read" });
  };
  const requestBack = (): void => {
    if (editor.dirty) {
      setEditor({ ...editor, confirm: "discardToBack" });
      return;
    }
    onBack();
  };

  return (
    <section aria-label="Team Member workspace" className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2" data-action-side="left">
          <button className="text-sm text-slate-600 underline" onClick={requestBack} type="button">Back</button>
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={requestCancel} type="button">Cancel</button>
        </div>
        <div className="flex gap-2" data-action-side="right">
          <ImportFileInput onFile={selectImport} />
          <button className="rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50" data-action-side="right" disabled={blocking} onClick={requestSave} type="button">Save Team</button>
        </div>
      </div>
      <div className="rounded-md border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-semibold">Edit Team</h1>
        <p className="mt-1 text-sm text-slate-600">Changes stay local until Save Team succeeds.</p>
        <CandidateRosterEditor
          candidate={editor.candidate}
          createFunctionId={createFunctionId}
          onAddPerson={() => addPersonToCandidate(editor.candidate, updateCandidate)}
          onCandidate={updateCandidate}
          standardFunctionDefinitions={standardFunctionDefinitions}
        />
      </div>
      <IssueSummary
        issues={editor.issues}
        renderedRowIds={new Set(editor.candidate.rows.map(({ rowId }) => rowId))}
      />
      <IssueSummary issues={editor.importIssues ?? []} renderedRowIds={new Set()} />
      {(editor.confirm === "discardToRead" || editor.confirm === "discardToBack") && (
        <div aria-label="Discard unsaved Team edits" className="rounded-md border border-amber-300 bg-white p-4" role="dialog">
          <h2 className="font-semibold">Discard unsaved Team edits?</h2>
          <div className="mt-3 flex gap-2" data-action-side="left">
            <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setEditor({ ...editor, confirm: null })} type="button">Stay</button>
            <button
              className="rounded-md border border-rose-400 px-3 py-1.5 text-sm"
              onClick={() => {
                const leaveWorkspace = editor.confirm === "discardToBack";
                editorGenerationRef.current += 1;
                activeImportRef.current = null;
                setEditor({ mode: "read" });
                if (leaveWorkspace) onBack();
              }}
              type="button"
            >{editor.confirm === "discardToBack" ? "Discard & Leave" : "Discard changes"}</button>
          </div>
        </div>
      )}
      {editor.confirm === "manualClear" && (
        <div aria-label="Confirm manual clear" className="rounded-md border border-rose-300 bg-white p-4" role="dialog">
          <h2 className="font-semibold">Clear the Team roster?</h2>
          <p className="mt-2 text-sm">This manual Save contains no effective people.</p>
          <div className="mt-3 flex justify-between gap-2">
            <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" data-action-side="left" onClick={() => setEditor({ ...editor, confirm: null })} type="button">Cancel clear</button>
            <button
              className="rounded-md border border-rose-400 px-3 py-1.5 text-sm"
              data-action-side="right"
              onClick={() => performSave(withoutBlankManualPlaceholders(editor.candidate))}
              type="button"
            >Confirm clear</button>
          </div>
        </div>
      )}
    </section>
  );
}
