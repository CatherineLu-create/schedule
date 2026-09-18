import React from "react";

import type { UpdateScheduleWorkingDraftMilestoneInput } from "./application/commands/canonicalScheduleCommands";
import type {
  CurrentPublishedScheduleRead,
  ScheduleWorkingDraftRead,
} from "./application/selectors/scheduleSelectors";
import type { MilestoneDefinition } from "./domain/schedule/milestoneCatalog";
import type { MilestoneApplicability } from "./domain/schedule/schedule";
import { parseDateOnly, type DateOnly } from "./domain/shared/dateOnly";
import {
  toMilestoneDefinitionId,
  type MilestoneDefinitionId,
  type MilestoneId,
  type ProjectId,
} from "./domain/shared/ids";
import { OfficialScheduleView } from "./officialScheduleView";

export interface ScheduleWorkspaceProps {
  readonly draftRead: ScheduleWorkingDraftRead;
  readonly feedback: readonly string[];
  readonly milestoneDefinitions: readonly MilestoneDefinition[];
  readonly nextVersionLabel: string | null;
  readonly officialRead: CurrentPublishedScheduleRead;
  readonly onAddMilestone: (milestoneDefinitionId: MilestoneDefinitionId) => void;
  readonly onCancelDraft: () => void;
  readonly onPublishDraft: () => void;
  readonly onRemoveMilestone: (milestoneId: MilestoneId) => void;
  readonly onStartDraft: (() => void) | null;
  readonly onUpdateMilestone: (input: UpdateScheduleWorkingDraftMilestoneInput) => void;
  readonly projectId: ProjectId;
}

interface DateOnlyEditorProps {
  readonly feedback: readonly string[];
  readonly field: "plan" | "actual";
  readonly label: string;
  readonly milestoneId: MilestoneId;
  readonly onUnappliedChange: (editorKey: string, unapplied: boolean) => void;
  readonly onValidValue: (value: DateOnly | null) => void;
  readonly projectId: ProjectId;
  readonly value: DateOnly | null;
}

function DateOnlyEditor({
  feedback,
  field,
  label,
  milestoneId,
  onUnappliedChange,
  onValidValue,
  projectId,
  value,
}: DateOnlyEditorProps): React.ReactElement {
  const canonicalText = value ?? "";
  const [text, setText] = React.useState(canonicalText);
  const [badEmptyInput, setBadEmptyInput] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [awaitingCanonical, setAwaitingCanonical] = React.useState(false);
  const previousFeedback = React.useRef(feedback);
  const contextId = React.useId();
  const errorId = React.useId();

  React.useEffect(() => {
    setText(canonicalText);
    setBadEmptyInput(false);
    setEditing(false);
    setAwaitingCanonical(false);
  }, [field, milestoneId, projectId, value]);

  React.useEffect(() => {
    if (previousFeedback.current === feedback) return;
    previousFeedback.current = feedback;
    setAwaitingCanonical(false);
  }, [feedback]);

  const recordNativeInput = (input: HTMLInputElement): void => {
    setText(input.value);
    setBadEmptyInput(input.value === "");
    setEditing(true);
  };

  const unapplied = badEmptyInput || text !== canonicalText || awaitingCanonical;
  const invalid = badEmptyInput || (text !== "" && parseDateOnly(text) === null);
  const error = invalid
    ? "Date not applied. Choose a valid date or use Clear."
    : unapplied ? "Date not applied. The last accepted value is unchanged." : null;
  const editorKey = JSON.stringify([projectId, milestoneId, field]);

  React.useEffect(() => {
    onUnappliedChange(editorKey, unapplied);
  }, [editorKey, onUnappliedChange, unapplied]);

  React.useEffect(() => () => {
    onUnappliedChange(editorKey, false);
  }, [editorKey, onUnappliedChange]);

  return <div>
    <div className="flex flex-wrap items-center gap-1">
      <input
        aria-describedby={error === null ? contextId : `${contextId} ${errorId}`}
        aria-invalid={unapplied}
        aria-label={label}
        className="w-36 rounded border border-slate-300 px-2 py-1"
        onBlur={() => { if (!unapplied) setEditing(false); }}
        onChange={(event) => recordNativeInput(event.currentTarget)}
        onFocus={() => setEditing(true)}
        onInput={(event) => recordNativeInput(event.currentTarget)}
        onKeyDown={() => setEditing(true)}
        onPointerDown={() => setEditing(true)}
        type="date"
        value={text}
      />
      <button aria-label={`Clear ${label}`} className="rounded border border-slate-300 px-2 py-1" onClick={() => {
        setText("");
        setBadEmptyInput(false);
        setEditing(false);
        setAwaitingCanonical(value !== null);
        onValidValue(null);
      }} type="button">Clear</button>
    </div>
    {(editing || unapplied) && <div className="mt-1 flex flex-wrap gap-1">
      <button aria-label={`Apply Date to ${label}`} className="rounded border border-slate-300 px-2 py-1 disabled:text-slate-400" disabled={invalid || text === canonicalText || awaitingCanonical} onClick={() => {
        const parsed = parseDateOnly(text);
        if (parsed !== null && text !== canonicalText && !awaitingCanonical) {
          setAwaitingCanonical(true);
          onValidValue(parsed);
        }
      }} type="button">Apply Date</button>
      <button aria-label={`Cancel date edit for ${label}`} className="rounded border border-slate-300 px-2 py-1" onClick={() => {
        setText(canonicalText);
        setBadEmptyInput(false);
        setEditing(false);
        setAwaitingCanonical(false);
      }} type="button">Cancel</button>
    </div>}
    <p className="sr-only" id={contextId}>{label}</p>
    {error !== null && <p className="mt-1 text-xs text-rose-700" id={errorId}>{error}</p>}
  </div>;
}

function ScheduleWorkspaceContent({
  draftRead,
  feedback,
  milestoneDefinitions,
  nextVersionLabel,
  officialRead,
  onAddMilestone,
  onCancelDraft,
  onPublishDraft,
  onRemoveMilestone,
  onStartDraft,
  onUpdateMilestone,
  projectId,
}: ScheduleWorkspaceProps): React.ReactElement {
  const [definitionId, setDefinitionId] = React.useState("");
  const [confirmation, setConfirmation] = React.useState<"publish" | "discard" | null>(null);
  const [unappliedEditors, setUnappliedEditors] = React.useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const onUnappliedChange = React.useCallback((key: string, unapplied: boolean): void => {
    setUnappliedEditors((current) => {
      if (current.has(key) === unapplied) return current;
      const next = new Set(current);
      if (unapplied) next.add(key); else next.delete(key);
      return next;
    });
  }, []);
  const publishBlocked = unappliedEditors.size > 0;
  const messages = feedback.map((message, index) => (
    <p key={`${index}:${message}`}>{message}</p>
  ));

  const publishDialog = confirmation === "publish" ? (
    <div aria-label="Publish Working Draft" className="mt-4 rounded border border-slate-300 bg-slate-50 p-4" role="dialog">
      <h3 className="font-semibold">Publish Working Draft?</h3>
      <p>This will create a new official Schedule version.</p>
      <p>Published versions cannot be edited.</p>
      {nextVersionLabel !== null && <p>{nextVersionLabel}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm" onClick={() => setConfirmation(null)} type="button">Keep Editing</button>
        <button className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-400" disabled={publishBlocked} onClick={() => {
          if (publishBlocked) return;
          setConfirmation(null);
          onPublishDraft();
        }} type="button">Publish</button>
      </div>
    </div>
  ) : null;
  const discardDialog = confirmation === "discard" ? (
    <div aria-label="Discard Working Draft" className="mt-4 rounded border border-slate-300 bg-slate-50 p-4" role="dialog">
      <h3 className="font-semibold">Discard Working Draft?</h3>
      <p>All unpublished Schedule changes will be discarded.</p>
      <p>Published Schedule versions will not be affected.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm" onClick={() => setConfirmation(null)} type="button">Keep Editing</button>
        <button className="rounded border border-rose-300 bg-white px-3 py-1.5 text-sm text-rose-700" onClick={() => {
          setConfirmation(null);
          onCancelDraft();
        }} type="button">Discard Draft</button>
      </div>
    </div>
  ) : null;

  if (draftRead.kind === "unavailable" && draftRead.workingDraftExists) {
    return <section aria-label="Schedule" className="rounded-md border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold">Working Draft</h2>
      <p>Working Draft data unavailable</p>
      <button className="mt-3 rounded border border-rose-300 px-3 py-1.5 text-sm text-rose-700" onClick={() => setConfirmation("discard")} type="button">Discard Draft</button>
      {discardDialog}
      {messages}
    </section>;
  }
  if (draftRead.kind !== "workingDraft") {
    return <>
      <OfficialScheduleView read={officialRead} />
      {onStartDraft !== null && (
        <button className="self-end rounded border border-slate-300 bg-white px-4 py-2 text-sm" onClick={onStartDraft} type="button">Edit</button>
      )}
      {messages}
    </>;
  }

  return <section aria-label="Schedule" className="rounded-md border border-slate-200 bg-white p-4">
    <h2 className="text-lg font-semibold">Working Draft</h2>
    {draftRead.milestoneRows.length === 0 && <p>No milestones</p>}
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-y border-slate-200 bg-slate-50"><tr>{(["Phase", "Stage", "Milestone", "Plan", "Actual"] as const)
          .map((label) => <th className="px-4 py-3 font-medium" key={label}>{label}</th>)}</tr></thead>
        <tbody>{draftRead.milestoneRows.map((row) => <tr className="border-b border-slate-200" key={row.milestoneId}>
          <td className="px-4 py-3">{row.phase}</td>
          <td className="px-4 py-3">{row.stage}</td>
          <td className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span>{row.milestone}</span>
              <select
                aria-label={`Applicability for ${row.milestone}`}
                className="rounded border border-slate-300 bg-white px-2 py-1"
                onChange={(event) => onUpdateMilestone({
                  milestoneId: row.milestoneId,
                  field: "applicability",
                  value: event.target.value as MilestoneApplicability,
                })}
                value={row.applicability}
              >
                <option value="applicable">Applicable</option>
                <option value="notApplicable">Not Applicable</option>
              </select>
              <button
                aria-label={`Remove ${row.milestone}`}
                className="rounded border border-slate-300 px-2 py-1 text-slate-700"
                onClick={() => onRemoveMilestone(row.milestoneId)}
                type="button"
              >Remove</button>
            </div>
          </td>
          <td className="px-4 py-3"><DateOnlyEditor
            feedback={feedback}
            field="plan"
            key={`${projectId}:${row.milestoneId}:plan`}
            label={`Plan for ${row.milestone} occurrence ${row.milestoneId} in Project ${projectId}`}
            milestoneId={row.milestoneId}
            onUnappliedChange={onUnappliedChange}
            onValidValue={(value) => onUpdateMilestone({
              milestoneId: row.milestoneId,
              field: "plan",
              value,
            })}
            projectId={projectId}
            value={row.plan}
          /></td>
          <td className="px-4 py-3"><DateOnlyEditor
            feedback={feedback}
            field="actual"
            key={`${projectId}:${row.milestoneId}:actual`}
            label={`Actual for ${row.milestone} occurrence ${row.milestoneId} in Project ${projectId}`}
            milestoneId={row.milestoneId}
            onUnappliedChange={onUnappliedChange}
            onValidValue={(value) => onUpdateMilestone({
              milestoneId: row.milestoneId,
              field: "actual",
              value,
            })}
            projectId={projectId}
            value={row.actual}
          /></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">Milestone definition
        <select className="max-w-64 rounded border border-slate-300 bg-white px-2 py-1.5" onChange={(event) => setDefinitionId(event.target.value)} value={definitionId}>
          <option value="">Select milestone</option>
          {milestoneDefinitions.map((definition) => (
            <option key={definition.id} value={definition.id}>{definition.name}</option>
          ))}
        </select>
      </label>
      <button
        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:text-slate-400"
        disabled={definitionId === ""}
        onClick={() => {
          if (definitionId !== "") onAddMilestone(toMilestoneDefinitionId(definitionId));
        }}
        type="button"
      >Add Milestone</button>
      <button className="ml-auto rounded border border-rose-300 bg-white px-3 py-1.5 text-sm text-rose-700" onClick={() => setConfirmation("discard")} type="button">Discard Draft</button>
      <button className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-400" disabled={publishBlocked} onClick={() => {
        if (!publishBlocked) setConfirmation("publish");
      }} type="button">Publish</button>
    </div>
    {publishBlocked && <p className="mt-3 text-sm text-rose-700">Correct or clear unapplied dates before publishing.</p>}
    {publishDialog}
    {discardDialog}
    {messages}
  </section>;
}

export function ScheduleWorkspace(props: ScheduleWorkspaceProps): React.ReactElement {
  const mode = props.draftRead.kind === "unavailable"
    ? `unavailable:${props.draftRead.workingDraftExists}`
    : props.draftRead.kind;
  return <ScheduleWorkspaceContent key={JSON.stringify([props.projectId, mode])} {...props} />;
}
