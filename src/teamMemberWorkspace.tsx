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
  ProjectTeam,
  ProjectFunctionRef,
  TeamSourceCell,
} from "./domain/team/team";
import type { TeamFunctionDefinition } from "./domain/team/teamTemplate";
import {
  classifyTeamLabel,
  isInvalidApplicabilityFunctionLabel,
} from "./domain/team/teamRoleMapping";
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

const workspaceClassName =
  "mx-auto flex h-dvh max-w-6xl flex-col gap-5 overflow-y-auto px-6 py-6";

function safeAnchor(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function hasPersonData(row: TeamCandidateRow): boolean {
  return (
    (row.name?.trim() ?? "") !== "" ||
    (row.email?.trim() ?? "") !== "" ||
    row.extraCells.some(
      (cell) =>
        (cell.formattedText?.trim() ?? "") !== "" ||
        (typeof cell.rawValue === "string"
          ? cell.rawValue.trim() !== ""
          : cell.rawValue !== null),
    )
  );
}

function withoutBlankManualPlaceholders(candidate: TeamEditCandidate): TeamEditCandidate {
  return {
    ...candidate,
    rows: candidate.rows.filter(hasPersonData),
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

function roleDisplay(role: "leader" | "owner" | "member"): string {
  return `${role[0]!.toUpperCase()}${role.slice(1)}`;
}

function fullFunctionText(base: string, role: "leader" | "owner" | "member"): string {
  const classification = classifyTeamLabel(base, "");
  if (classification.kind === "functionRole") {
    return classification.role === role
      ? base
      : `${splitFunctionRole(base).base}-${roleDisplay(role)}`;
  }
  if (classification.kind === "restricted") {
    return role === "owner"
      ? base
      : `${splitFunctionRole(base).base}-${roleDisplay(role)}`;
  }
  return `${base}-${roleDisplay(role)}`;
}

function matchesCurrentFunctionText(sourceText: string, currentText: string): boolean {
  const source = classifyTeamLabel(sourceText, "");
  const current = classifyTeamLabel(currentText, "");
  if (source.kind !== current.kind) return false;
  if (source.kind === "restricted" && current.kind === "restricted") {
    return source.key === current.key;
  }
  if (source.kind === "functionRole" && current.kind === "functionRole") {
    return source.role === current.role &&
      normalizedText(splitFunctionRole(sourceText).base) === normalizedText(splitFunctionRole(currentText).base);
  }
  return normalizedText(sourceText) === normalizedText(currentText);
}

function readFunctionText(
  row: TeamMemberRow,
  standardNames: ReadonlyMap<TeamFunctionId, string>,
): string {
  if (row.kind === "projectRole") {
    const currentText = row.roleText.startsWith("QCI ")
      ? `${row.roleText.toUpperCase().replaceAll(" ", "-")}-Owner`
      : row.roleText;
    const sourceText = row.functionText?.trim() ?? "";
    return sourceText !== "" && matchesCurrentFunctionText(sourceText, currentText)
      ? sourceText
      : currentText;
  }
  if (row.kind === "preserved") return row.functionText ?? "";
  const sourceText = row.functionText?.trim() ?? "";
  const base = row.function.kind === "custom"
    ? row.function.displayName
    : standardNames.get(row.function.functionId) ?? (sourceText || row.function.functionId);
  const currentText = fullFunctionText(base, row.role);
  return sourceText !== "" && matchesCurrentFunctionText(sourceText, currentText)
    ? sourceText
    : currentText;
}

function readRoleRank(functionText: string): number {
  const role = splitFunctionRole(functionText).role;
  if (role === "leader") return 0;
  if (role === "owner") return 1;
  if (role === "member") return 2;
  return 3;
}

function readBaseFunctionKey(functionText: string): string {
  const parsed = splitFunctionRole(functionText);
  return normalizedText(parsed.role === null ? functionText : parsed.base);
}

function readBaseFunctionOrder(
  team: ProjectTeam | null,
  standardFunctionDefinitions: readonly TeamFunctionDefinition[],
): readonly string[] {
  const standardNames = new Map(
    standardFunctionDefinitions.map((definition) => [definition.id, definition.displayName]),
  );
  const order: string[] = [];
  const add = (functionText: string): void => {
    const key = readBaseFunctionKey(functionText);
    if (!order.includes(key)) order.push(key);
  };
  const rows = selectTeamMemberRows(team);
  for (const row of rows) {
    if (row.kind === "projectRole") add(readFunctionText(row, standardNames));
  }
  for (const functionTeam of team?.functions ?? []) {
    const functionText = functionTeam.function.kind === "custom"
      ? functionTeam.function.displayName
      : standardNames.get(functionTeam.function.functionId) ?? functionTeam.function.functionId;
    add(functionText);
  }
  for (const row of rows) {
    if (row.kind === "preserved") add(readFunctionText(row, standardNames));
  }
  for (const row of rows) {
    add(readFunctionText(row, standardNames));
  }
  return order;
}

function isTelCell(cell: TeamSourceCell): boolean {
  const normalized = cell.headerText?.trim().toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  return normalized === "tel" || normalized === "telno" || normalized === "telephone";
}

function telText(cells: readonly TeamSourceCell[]): string {
  const cell = cells.find(isTelCell);
  return cell?.formattedText ?? (cell?.rawValue === null || cell?.rawValue === undefined
    ? ""
    : String(cell.rawValue));
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

function TeamActionBar({
  issues,
  left,
  right,
}: {
  readonly issues: readonly ValidationIssue[];
  readonly left: React.ReactNode;
  readonly right: React.ReactNode;
}): React.ReactElement {
  const blockingCount = issues.filter(({ severity }) => severity === "blocking").length;
  const advisoryCount = issues.filter(({ severity }) => severity === "advisory").length;
  return (
    <div
      className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm"
      data-testid="team-action-bar"
    >
      <div
        className="grid grid-cols-2 items-center gap-2 px-4 py-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3"
        data-content-alignment="team-roster"
        data-testid="team-action-content"
      >
        <div className="col-start-1 row-start-1 flex flex-wrap items-center gap-2" data-action-side="left">{left}</div>
        <div
          aria-label="Team issue status"
          className="col-span-2 row-start-2 justify-self-center whitespace-nowrap text-xs font-medium text-slate-600 sm:col-span-1 sm:col-start-2 sm:row-start-1"
          role="status"
        >
          Blocking {blockingCount} <span aria-hidden="true">·</span> Advisories {advisoryCount}
        </div>
        <div className="col-start-2 row-start-1 flex flex-wrap items-center justify-end gap-2 sm:col-start-3" data-action-side="right">{right}</div>
      </div>
    </div>
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
  const effectiveBaseFunctionOrder = readBaseFunctionOrder(
    project.team,
    standardFunctionDefinitions,
  );
  const presentedRows = rows.map((row, sourceIndex) => ({
    row,
    functionText: readFunctionText(row, standardNames),
    sourceIndex,
    baseFunctionKey: readBaseFunctionKey(readFunctionText(row, standardNames)),
    roleRank: readRoleRank(readFunctionText(row, standardNames)),
  }));
  const groups = (["QCI", "QCMC", "OTHER"] as const).map((name) => {
    const siteRows = presentedRows.filter(({ row, functionText }) => {
      if (row.kind === "projectRole") {
        if (row.projectRole === "qciPm" || row.projectRole === "qciPjm") {
          return name === "QCI";
        }
        return name === "OTHER";
      }
      const normalized = functionText.trim().toUpperCase();
      if (normalized === "QCI" || normalized.startsWith("QCI-")) {
        return name === "QCI";
      }
      if (normalized === "QCMC" || normalized.startsWith("QCMC-")) {
        return name === "QCMC";
      }
      return name === "OTHER";
    });
    const baseRank = new Map<string, number>();
    for (const presented of siteRows) {
      if (!baseRank.has(presented.baseFunctionKey)) {
        baseRank.set(presented.baseFunctionKey, baseRank.size);
      }
    }
    const preferredBaseRank = new Map(
      effectiveBaseFunctionOrder.map((key, index) => [key, index]),
    );
    const presentationRank = (key: string): number =>
      preferredBaseRank.get(key) ?? effectiveBaseFunctionOrder.length + baseRank.get(key)!;
    return {
      name,
      rows: [...siteRows].sort((left, right) =>
        (presentationRank(left.baseFunctionKey) - presentationRank(right.baseFunctionKey)) ||
        (left.roleRank - right.roleRank) ||
        (left.sourceIndex - right.sourceIndex)),
    };
  });
  const visibleIssues = [...canonicalIssues, ...importIssues];
  return (
    <section aria-label="Team Member workspace" className={workspaceClassName}>
      <TeamActionBar
        issues={visibleIssues}
        left={<button className="text-sm text-slate-600 underline" onClick={onBack} type="button">Back</button>}
        right={<>
          <ImportFileInput onFile={onImport} />
          <button className="rounded-md border border-slate-300 px-4 py-2 text-sm" onClick={onEdit} type="button">Edit Team</button>
        </>}
      />
      <IssueSummary issues={canonicalIssues} renderedRowIds={new Set()} />
      <IssueSummary issues={importIssues} renderedRowIds={new Set()} />
      <div className="rounded-md border border-slate-200 bg-white py-4">
        <div className="px-4" data-content-alignment="team-roster" data-testid="team-main-content">
        <h1 className="text-2xl font-semibold">Team Member</h1>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No Team members saved.</p>
        ) : (
          <table aria-label="Team roster" className="mt-4 w-full text-left text-sm">
            <thead><tr><th>Function</th><th>Member</th><th>email</th><th>Tel. No.</th></tr></thead>
            {groups.map((group) => (
              <tbody aria-label={group.name} key={group.name}>
                <tr className="border-t border-slate-300 bg-slate-50">
                  <th className="py-2" colSpan={4} scope="rowgroup">{group.name}</th>
                </tr>
                {group.rows.map(({ row, functionText }, index) => (
                  <tr className="border-t border-slate-100 leading-6" data-testid="team-read-row" key={`${row.kind}:${row.rowId}:${index}`}>
                    <td className="py-2">{functionText}</td>
                    <td className="py-2">{row.name ?? "—"}</td>
                    <td className="py-2">{row.email ?? "—"}</td>
                    <td className="py-2">{telText(row.extraCells) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        )}
        </div>
      </div>
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
  const groupIssues = (values: readonly ValidationIssue[]) => [...values.reduce((groups, issue) => {
    const key = `${issue.code}\u0000${issue.message}`;
    const existing = groups.get(key);
    const issueHasRenderedRow =
      issue.target.entityId !== undefined && renderedRowIds.has(issue.target.entityId);
    const existingHasRenderedRow = existing?.issue.target.entityId !== undefined &&
      renderedRowIds.has(existing.issue.target.entityId);
    groups.set(key, existing === undefined
      ? { issue, count: 1 }
      : {
          issue: !existingHasRenderedRow && issueHasRenderedRow ? issue : existing.issue,
          count: existing.count + 1,
        });
    return groups;
  }, new Map<string, { issue: ValidationIssue; count: number }>()).values()];
  const blockingGroups = groupIssues(blocking);
  const advisoryGroups = groupIssues(advisories);
  return (
    <div className="grid gap-3">
      {blockingGroups.length > 0 && (
        <section aria-label="Blocking issues" className="rounded-md border border-rose-300 bg-rose-50 p-3">
          <h2 className="font-semibold">Blocking issues</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {blockingGroups.map(({ issue, count }) => (
              <li key={`${issue.code}:${issue.message}`}>
                {issue.message}{count > 1 ? ` (${count})` : ""}{" "}
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

function updateTelCell(
  cells: readonly TeamSourceCell[],
  value: string,
): readonly TeamSourceCell[] {
  const index = cells.findIndex(isTelCell);
  if (index >= 0) return updateExtraCell(cells, index, value);
  if (value === "") return cells;
  const columnIndex = cells.reduce((maximum, cell) => Math.max(maximum, cell.columnIndex), 0) + 1;
  return [...cells, {
    columnIndex,
    headerText: "Tel. No.",
    rawType: "s",
    rawValue: value,
    formattedText: value,
    hidden: false,
  }];
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

function candidateFunctionText(
  row: TeamCandidateRow,
  standardFunctionDefinitions: readonly TeamFunctionDefinition[],
): string {
  const rawText = row.functionText;
  const sourceText = rawText.trim();
  if (row.functionRef === null || row.parsedRole === "unclassified") return rawText;
  const base = row.functionRef.kind === "custom"
    ? row.functionRef.displayName
    : standardFunctionDefinitions.find(({ id }) => id === row.functionRef!.functionId)?.displayName
      ?? (sourceText || row.functionRef.functionId);
  const currentText = fullFunctionText(base, row.parsedRole);
  return sourceText !== "" && matchesCurrentFunctionText(sourceText, currentText)
    ? rawText
    : currentText;
}

function functionSuggestions(
  candidate: TeamEditCandidate,
  standardFunctionDefinitions: readonly TeamFunctionDefinition[],
): readonly string[] {
  const suggestions = new Map<string, string>();
  const add = (value: string) => {
    const trimmed = value.trim();
    if (trimmed !== "") suggestions.set(trimmed.toLowerCase(), trimmed);
  };
  ["QCI-PM-Owner", "QCI-PJM-Owner", "Acer PM"].forEach(add);
  for (const definition of standardFunctionDefinitions) {
    (["leader", "owner", "member"] as const).forEach((role) =>
      add(`${definition.displayName}-${roleDisplay(role)}`));
  }
  for (const ref of candidateCustomFunctionRefs(candidate)) {
    const existingClassification = classifyTeamLabel(ref.displayName, "");
    if (existingClassification.kind === "unclassified") {
      (["leader", "owner", "member"] as const).forEach((role) =>
        add(`${ref.displayName}-${roleDisplay(role)}`));
    } else {
      add(ref.displayName);
    }
  }
  candidate.rows.forEach((row) => add(candidateFunctionText(row, standardFunctionDefinitions)));
  return [...suggestions.values()];
}

interface ExistingFunctionChoice {
  readonly key: string;
  readonly label: string;
  readonly functionRef: CustomProjectFunctionRef;
  readonly role: "leader" | "owner" | "member";
}

function duplicateCustomFunctionChoices(
  candidate: TeamEditCandidate,
): readonly ExistingFunctionChoice[] {
  const refs = candidateCustomFunctionRefs(candidate);
  const counts = new Map<string, number>();
  for (const ref of refs) {
    const key = normalizedText(ref.displayName);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const occurrences = new Map<string, number>();
  return refs.flatMap((ref) => {
    const displayKey = normalizedText(ref.displayName);
    if ((counts.get(displayKey) ?? 0) < 2) return [];
    const occurrence = (occurrences.get(displayKey) ?? 0) + 1;
    occurrences.set(displayKey, occurrence);
    return (["leader", "owner", "member"] as const).map((role) => ({
      key: `${ref.functionId}::${role}`,
      label: `${fullFunctionText(ref.displayName, role)} (existing Function ${occurrence})`,
      functionRef: ref,
      role,
    }));
  });
}

function assignExistingFunctionChoice(
  candidate: TeamEditCandidate,
  row: TeamCandidateRow,
  choice: ExistingFunctionChoice,
  standardFunctionDefinitions: readonly TeamFunctionDefinition[],
): TeamEditCandidate {
  let next = assignCandidateFunction(
    candidate,
    row.rowId,
    choice.functionRef,
    standardFunctionDefinitions,
  );
  next = replaceCandidateRow(next, row.rowId, {
    functionText: fullFunctionText(choice.functionRef.displayName, choice.role),
  });
  return editTeamCandidate(
    next,
    row.rowId,
    { roleText: choice.role },
    standardFunctionDefinitions,
  );
}

function normalizedText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function splitFunctionRole(value: string): {
  readonly base: string;
  readonly role: "leader" | "owner" | "member" | null;
} {
  const match = value.trim().match(/^(.*)-(leader|owner|member)$/i);
  if (match === null || (match[1]?.trim() ?? "") === "") {
    return { base: value.trim(), role: null };
  }
  return {
    base: match[1]!.trim(),
    role: match[2]!.toLowerCase() as "leader" | "owner" | "member",
  };
}

function replaceCandidateRow(
  candidate: TeamEditCandidate,
  rowId: string,
  patch: Partial<Pick<TeamCandidateRow, "functionText" | "functionRef" | "applicability">>,
): TeamEditCandidate {
  return {
    ...candidate,
    rows: candidate.rows.map((row) => row.rowId === rowId ? { ...row, ...patch } : row),
  };
}

function editCandidateFunctionText(
  candidate: TeamEditCandidate,
  row: TeamCandidateRow,
  value: string,
  standardFunctionDefinitions: readonly TeamFunctionDefinition[],
  createFunctionId: () => TeamFunctionId,
): TeamEditCandidate {
  const functionText = value;
  const { base, role } = splitFunctionRole(functionText);
  const standard = standardFunctionDefinitions.find(
    ({ displayName }) => normalizedText(displayName) === normalizedText(base),
  );
  let next = candidate;
  if (base === "") {
    next = replaceCandidateRow(next, row.rowId, {
      functionText,
      functionRef: null,
      applicability: null,
    });
  } else if (isInvalidApplicabilityFunctionLabel(functionText)) {
    next = replaceCandidateRow(next, row.rowId, {
      functionText,
      functionRef: null,
      applicability: null,
    });
  } else if (standard !== undefined) {
    next = assignCandidateFunction(
      next,
      row.rowId,
      { kind: "standard", functionId: standard.id },
      standardFunctionDefinitions,
    );
  } else if (classifyTeamLabel(functionText, "").kind === "restricted") {
    next = replaceCandidateRow(next, row.rowId, { functionRef: null, applicability: null });
  } else {
    const customRefs = candidateCustomFunctionRefs(next);
    const exactFullLabelMatches = customRefs.filter(
      ({ displayName }) => normalizedText(displayName) === normalizedText(functionText),
    );
    const baseMatches = customRefs.filter(
      ({ displayName }) => normalizedText(displayName) === normalizedText(base),
    );
    const matching = exactFullLabelMatches.length > 0 ? exactFullLabelMatches : baseMatches;
    let custom = row.functionRef?.kind === "custom" &&
      (
        normalizedText(row.functionRef.displayName) === normalizedText(functionText) ||
        normalizedText(row.functionRef.displayName) === normalizedText(base)
      )
      ? row.functionRef
      : matching.length === 1
        ? matching[0]
        : undefined;
    if (custom === undefined && row.functionRef?.kind === "custom") {
      next = renameCustomCandidateFunction(next, row.functionRef.functionId, base);
      custom = { ...row.functionRef, displayName: base };
    }
    if (custom === undefined && matching.length === 0 && base !== "") {
      custom = createCustomCandidateFunctionRef(next, base, createFunctionId);
    }
    if (custom !== undefined) {
      next = assignCandidateFunction(next, row.rowId, custom, standardFunctionDefinitions);
    } else if (matching.length > 1) {
      next = replaceCandidateRow(next, row.rowId, { functionRef: null, applicability: null });
    }
  }
  next = replaceCandidateRow(next, row.rowId, { functionText });
  return editTeamCandidate(next, row.rowId, { roleText: role ?? "" }, standardFunctionDefinitions);
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
  const edit = (patch: Parameters<typeof editTeamCandidate>[2]) => {
    onCandidate(editTeamCandidate(candidate, row.rowId, patch, standardFunctionDefinitions));
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
  const listId = `team-function-suggestions-${safeAnchor(row.rowId)}`;
  const displayedFunctionText = candidateFunctionText(row, standardFunctionDefinitions);
  const canMarkApplicable =
    row.functionRef !== null &&
    !isInvalidApplicabilityFunctionLabel(displayedFunctionText) &&
    row.applicability === "notApplicable" &&
    hasPersonData(row);
  const canExcludeFromImport = onExcludeImportRow !== undefined && row.sourceRows.length > 0;
  const existingFunctionChoices = duplicateCustomFunctionChoices(candidate);
  return (
    <tr
      className="border-t border-slate-200 align-top leading-6"
      data-assignment-id={row.assignmentId}
      data-row-id={row.rowId}
      data-testid="team-candidate-row"
      id={`team-row-${safeAnchor(row.rowId)}`}
    >
      <td className="p-2">
        <input
          aria-label="Function"
          className="w-full min-w-48 rounded-md border border-slate-300 px-2 py-1"
          list={listId}
          onChange={(event) => onCandidate(editCandidateFunctionText(
            candidate,
            row,
            event.target.value,
            standardFunctionDefinitions,
            createFunctionId,
          ))}
          type="text"
          value={displayedFunctionText}
        />
        <datalist id={listId}>
          {functionSuggestions(candidate, standardFunctionDefinitions).map((suggestion) => (
            <option key={suggestion.toLowerCase()} value={suggestion} />
          ))}
        </datalist>
        {existingFunctionChoices.length > 0 && (
          <select
            aria-label="Choose existing Function identity"
            className="mt-1 w-full min-w-48 rounded-md border border-slate-300 px-2 py-1 text-xs"
            onChange={(event) => {
              const choice = existingFunctionChoices.find(({ key }) => key === event.target.value);
              if (choice !== undefined) {
                onCandidate(assignExistingFunctionChoice(
                  candidate,
                  row,
                  choice,
                  standardFunctionDefinitions,
                ));
              }
            }}
            value=""
          >
            <option value="">Choose existing Function...</option>
            {existingFunctionChoices.map((choice) => (
              <option key={choice.key} value={choice.key}>{choice.label}</option>
            ))}
          </select>
        )}
      </td>
      <td className="p-2">
        <input aria-label="Name" className="w-full min-w-36 rounded-md border border-slate-300 px-2 py-1" onChange={(event) => edit({ name: event.target.value || null })} type="text" value={row.name ?? ""} />
      </td>
      <td className="p-2">
        <input aria-label="Email" className="w-full min-w-48 rounded-md border border-slate-300 px-2 py-1" inputMode="email" onChange={(event) => edit({ email: event.target.value || null })} type="text" value={row.email ?? ""} />
      </td>
      <td className="p-2">
        <input
          aria-label="Tel. No."
          className="w-full min-w-28 rounded-md border border-slate-300 px-2 py-1"
          inputMode="tel"
          onChange={(event) => edit({ extraCells: updateTelCell(row.extraCells, event.target.value) })}
          type="text"
          value={telText(row.extraCells)}
        />
      </td>
      <td className="p-2">
        <div className="flex min-w-32 flex-wrap gap-1">
          {canMarkApplicable && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-800">
              <span>N/A</span>
              <button className="rounded-md border border-amber-400 px-2 py-1 text-xs" onClick={markApplicable} type="button">Mark Applicable</button>
            </span>
          )}
          {row.possibleRestricted && row.restrictedRoleDecision === "unresolved" && (
            <button
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              onClick={() => onCandidate(confirmNoncriticalRole(candidate, row.rowId, standardFunctionDefinitions))}
              type="button"
            >Confirm noncritical role</button>
          )}
          {canExcludeFromImport ? (
            <button
              className="rounded-md border border-amber-300 px-2 py-1 text-xs"
              onClick={() => onExcludeImportRow(row)}
              type="button"
            >Exclude from import</button>
          ) : (
            <button className="rounded-md border border-rose-300 px-2 py-1 text-xs" onClick={() => onCandidate(removeTeamCandidateRow(candidate, row.rowId))} type="button">Remove person</button>
          )}
        </div>
      </td>
    </tr>
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
    <div className="mt-4 grid gap-3 overflow-x-auto">
      <table aria-label="Team roster editor" className="w-full text-left text-sm">
        <thead><tr><th>Function</th><th>Member</th><th>email</th><th>Tel. No.</th><th>Actions</th></tr></thead>
        <tbody>
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
        </tbody>
      </table>
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
    const row: NewTeamCandidateRow = {
      functionText: "",
      functionRef: null,
      parsedRole: "unclassified",
      restrictedKey: null,
      possibleRestricted: false,
      restrictedRoleDecision: "unresolved",
      roleText: "",
      name: null,
      email: null,
      extraCells: [],
      sourceRows: [],
      applicability: null,
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
      <section aria-label="Team Member workspace" className={workspaceClassName}>
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
      <section aria-label="Team Member workspace" className={workspaceClassName}>
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
      <section aria-label="Team Member workspace" className={workspaceClassName}>
        <TeamActionBar
          issues={[]}
          left={<>
            <button className="text-sm text-slate-600 underline" onClick={() => setEditor({ mode: "importDiscard", returnState: editor })} type="button">Back</button>
            <button className="text-sm text-slate-600 underline" onClick={() => restorePriorState(editor.priorState)} type="button">Cancel Import</button>
          </>}
          right={<ImportFileInput onFile={selectImport} />}
        />
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
      <section aria-label="Team Member workspace" className={workspaceClassName}>
        <TeamActionBar
          issues={editor.issues}
          left={<>
            <button className="text-sm text-slate-600 underline" onClick={() => setEditor({ mode: "importDiscard", returnState: editor })} type="button">Back</button>
            <button className="text-sm text-slate-600 underline" onClick={() => restorePriorState(editor.priorState)} type="button">Cancel Import</button>
          </>}
          right={<ImportFileInput onFile={selectImport} />}
        />
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
      <section aria-label="Team Member workspace" className={workspaceClassName}>
        <TeamActionBar
          issues={editor.issues}
          left={<>
            <button className="text-sm text-slate-600 underline" onClick={() => setEditor({ mode: "importDiscard", returnState: editor })} type="button">Back</button>
            <button className="text-sm text-slate-600 underline" onClick={() => restorePriorState(editor.priorState)} type="button">Cancel Import</button>
          </>}
          right={<>
            <ImportFileInput onFile={selectImport} />
            <button className="rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={blocking} onClick={requestImportSave} type="button">Save imported Team</button>
          </>}
        />
        <IssueSummary
          issues={editor.issues}
          renderedRowIds={new Set(editor.candidate.rows.map(({ rowId }) => rowId))}
        />
        <div className="rounded-md border border-slate-200 bg-white py-4">
          <div className="px-4" data-content-alignment="team-roster" data-testid="team-main-content">
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
        </div>
        <ExcludedImportRows rows={editor.excludedRows} />
        {editor.mode === "importReplaceConfirm" && (
          <div aria-label="Confirm whole Team replacement" className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4" role="dialog">
            <div className="w-full max-w-lg rounded-md border border-rose-300 bg-white p-4">
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
    setEditor(editor.dirty
      ? { ...editor, confirm: "discardToRead" }
      : { mode: "read" });
  };
  const requestBack = (): void => {
    if (editor.dirty) {
      setEditor({ ...editor, confirm: "discardToBack" });
      return;
    }
    onBack();
  };

  return (
    <section aria-label="Team Member workspace" className={workspaceClassName}>
      <TeamActionBar
        issues={[...editor.issues, ...(editor.importIssues ?? [])]}
        left={<>
          <button className="text-sm text-slate-600 underline" onClick={requestBack} type="button">Back</button>
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={requestCancel} type="button">Cancel</button>
        </>}
        right={<>
          <ImportFileInput onFile={selectImport} />
          <button className="rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50" data-action-side="right" disabled={blocking} onClick={requestSave} type="button">Save Team</button>
        </>}
      />
      <IssueSummary
        issues={editor.issues}
        renderedRowIds={new Set(editor.candidate.rows.map(({ rowId }) => rowId))}
      />
      <IssueSummary issues={editor.importIssues ?? []} renderedRowIds={new Set()} />
      <div className="rounded-md border border-slate-200 bg-white py-4">
        <div className="px-4" data-content-alignment="team-roster" data-testid="team-main-content">
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
      </div>
      {(editor.confirm === "discardToRead" || editor.confirm === "discardToBack") && (
        <div aria-label="Discard unsaved Team edits" className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4" role="dialog">
          <div className="w-full max-w-md rounded-md border border-amber-300 bg-white p-4">
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
