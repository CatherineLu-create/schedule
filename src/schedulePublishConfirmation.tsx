import React from "react";
import { getNextPublishedScheduleVersionNumber } from "./application/commands/canonicalScheduleCommands";
import { getCurrentPublishedVersion, type CanonicalProjectSchedule } from "./domain/schedule/officialSchedule";
import { validateSchedulePublishNote } from "./domain/schedule/scheduleValidation";
import type { ValidationIssue } from "./domain/validation/validationIssue";

export const scheduleVersionLabel = (number: number): string => `v${String(number).padStart(2, "0")}`;

export function HistoricalDraftWarning({ schedule }: { readonly schedule: CanonicalProjectSchedule }): React.ReactElement | null {
  const draft = schedule.workingDraft;
  if (!draft) return null;
  const base = draft.basePublishedVersionNumber;
  if (base === null) return null;
  if (base === undefined || !schedule.publishedVersions.some(version => version.versionNumber === base)) {
    return <p className="text-sm text-slate-600">Base version unavailable</p>;
  }
  const current = getCurrentPublishedVersion(schedule);
  if (!current || current.versionNumber === base) return null;
  const next = getNextPublishedScheduleVersionNumber(schedule);
  const later = schedule.publishedVersions.filter(version => version.versionNumber > base).sort((a, b) => a.versionNumber - b.versionNumber);
  const consecutive = later.length > 1 && later.every((version, index) => index === 0 || version.versionNumber === later[index - 1].versionNumber + 1);
  const affected = consecutive
    ? `${scheduleVersionLabel(later[0].versionNumber)}–${scheduleVersionLabel(later.at(-1)!.versionNumber)}`
    : later.map(version => scheduleVersionLabel(version.versionNumber)).join(", ");
  return <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
    This draft is based on historical version {scheduleVersionLabel(base)}. Current Published is {scheduleVersionLabel(current.versionNumber)}. {next.ok ? `Publishing this draft will create ${scheduleVersionLabel(next.versionNumber)} and may replace changes introduced in ${affected}.` : "The next Published version is unavailable."}
  </p>;
}

interface SchedulePublishConfirmationProps {
  readonly schedule: CanonicalProjectSchedule;
  readonly blockers: readonly ValidationIssue[];
  readonly onCancel: () => void;
  readonly onPublish: (versionNote: string) => void;
  readonly additionalBlocker?: string;
  readonly language?: "en" | "zh";
}

export function SchedulePublishConfirmation({ schedule, blockers, onCancel, onPublish, additionalBlocker, language = "en" }: SchedulePublishConfirmationProps): React.ReactElement {
  const current = getCurrentPublishedVersion(schedule);
  const next = getNextPublishedScheduleVersionNumber(schedule);
  const identity = JSON.stringify([schedule.projectId, schedule.workingDraft?.workingDraftId, schedule.workingDraft?.basePublishedVersionNumber, current?.versionNumber]);
  const [input, setInput] = React.useState({ identity, text: "" });
  // A changed target invalidates prior confirmation synchronously, before effects run.
  const note = input.identity === identity ? input.text : "";
  const noteIssues = validateSchedulePublishNote(note);
  const blocked = !schedule.workingDraft || !next.ok || blockers.length > 0 || noteIssues.length > 0 || !!additionalBlocker;
  const inputId = React.useId();
  const errorId = React.useId();
  const zh = language === "zh";
  return <div aria-label={zh ? "發布此專案 Working Draft" : "Publish Working Draft"} className="mt-4 space-y-3 rounded border border-slate-300 bg-slate-50 p-4" role="dialog">
    <h3 className="font-semibold">{zh ? "確認發布此專案草稿？" : "Publish Working Draft?"}</h3>
    <p>This will create a new official Schedule version.</p>
    <p>Published versions cannot be edited.</p>
    {next.ok ? <p>Publish as {scheduleVersionLabel(next.versionNumber)}</p> : <p>The next Published version is unavailable.</p>}
    <HistoricalDraftWarning schedule={schedule} />
    <label htmlFor={inputId}>Publish Note</label>
    <textarea id={inputId} className="block w-full rounded border p-2" value={note} aria-invalid={noteIssues.length > 0} aria-describedby={errorId} onChange={event => setInput({ identity, text: event.target.value })} />
    <div id={errorId}>{noteIssues.map(issue => <p key={issue.code}>{issue.message}</p>)}</div>
    {blockers.map((issue, index) => <p key={`${issue.code}:${index}`}>{issue.message}</p>)}
    {additionalBlocker && <p>{additionalBlocker}</p>}
    <div className="flex gap-2">
      <button type="button" className="rounded border px-3 py-2" onClick={onCancel}>{zh ? "取消" : "Keep Editing"}</button>
      <button type="button" className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-40" disabled={blocked} onClick={() => { if (!blocked && input.identity === identity) onPublish(note.trim()); }}>{zh ? "確認發布" : "Publish"}</button>
    </div>
  </div>;
}
