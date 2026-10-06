import React from "react";
import type { Project } from "./domain/project/project";
import type { ProjectId } from "./domain/shared/ids";
import { collectSchedulePublishBlockingFindings } from "./application/commands/scheduleReviewCommands";
import { LocalOccurrenceMapping, ScheduleImportReviewPanel, ScheduleReviewHistory, ScheduleSimulationEntry, type ScheduleReviewBindings } from "./scheduleImportReviewPanel";

export interface GovernanceScheduleToolsBindings {
  readonly review: ScheduleReviewBindings;
  readonly feedback: readonly string[];
  readonly onPublish: () => void;
  readonly onDiscard: () => void;
  readonly onClearFeedback: () => void;
}
export interface GovernanceAdvancedToolsProps {
  readonly projects: readonly Project[];
  readonly bindProject: (projectId: ProjectId) => GovernanceScheduleToolsBindings | null;
}
const button = "rounded border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40";

function SelectedProjectTools({ bindings }: { bindings: GovernanceScheduleToolsBindings }) {
  const { review, feedback, onPublish, onDiscard } = bindings;
  const [confirmation, setConfirmation] = React.useState<"publish" | "discard" | null>(null);
  const draft = review.schedule.workingDraft;
  const locals = draft?.milestones.filter(row => review.schedule.localDefinitions.some(definition => definition.id === row.milestoneDefinitionId && definition.confirmation === "confirmed")) ?? [];
  const blockers = collectSchedulePublishBlockingFindings(review.schedule, review.context);
  return <>
    <section className="mt-4 space-y-3" aria-label="本案自訂里程碑對應">
      <h3 className="font-semibold">本案自訂里程碑對應</h3>
      {draft === null ? <p>此專案目前沒有 Working Draft，暫無可處理的本案自訂對應。</p> : locals.length === 0 ? <p>此 Working Draft 目前沒有需要對應的本案自訂里程碑。</p> : locals.map(row => <div className="rounded border border-slate-200 p-3" key={row.milestoneId}><LocalOccurrenceMapping review={review} milestoneId={row.milestoneId} /></div>)}
    </section>
    <ScheduleSimulationEntry review={review} />
    <ScheduleImportReviewPanel review={review} />
    {feedback.map((message, index) => <p role="status" key={`${index}:${message}`}>{message}</p>)}
    {draft !== null && <section className="mt-4 space-y-3" aria-label="此專案真實草稿">
      <h3 className="font-semibold">此專案的真實 Working Draft</h3>
      <p>以下操作會發布或捨棄所選專案的實際排程草稿。</p>
      {blockers.length > 0 && <p>發布前仍有待處理項目，請完成日期、適用性與逐筆確認。</p>}
      <button type="button" className={button} disabled={blockers.length > 0} onClick={() => setConfirmation("publish")}>發布此專案草稿</button>{" "}
      <button type="button" className={button} onClick={() => setConfirmation("discard")}>捨棄此專案草稿</button>
      {confirmation !== null && <div role="dialog" aria-label={confirmation === "publish" ? "發布此專案 Working Draft" : "捨棄此專案 Working Draft"} className="space-y-2 rounded border p-3">
        <p>{confirmation === "publish" ? "確認發布此專案草稿？將建立不可編輯的正式排程版本。" : "確認捨棄此專案草稿？所有未發布的排程變更將移除，已發布版本不受影響。"}</p>
        <button type="button" className={button} onClick={() => setConfirmation(null)}>取消</button>{" "}
        <button type="button" className={button} disabled={confirmation === "publish" && blockers.length > 0} onClick={() => {
          if (confirmation === "publish" && blockers.length > 0) return;
          setConfirmation(null);
          if (confirmation === "publish") onPublish(); else onDiscard();
        }}>{confirmation === "publish" ? "確認發布" : "確認捨棄"}</button>
      </div>}
    </section>}
    <ScheduleReviewHistory review={review} />
  </>;
}

export function GovernanceAdvancedTools({ projects, bindProject }: GovernanceAdvancedToolsProps) {
  const [selectedProjectId, setSelectedProjectId] = React.useState<ProjectId | null>(() => projects[0]?.id ?? null);
  const selectedProject = projects.find(project => project.id === selectedProjectId);
  const bindings = selectedProject ? bindProject(selectedProject.id) : null;
  return <details className="rounded-xl border border-slate-200 bg-white p-4">
    <summary className="cursor-pointer font-semibold">進階治理與試用工具</summary>
    <p className="my-3 text-sm text-slate-600">低頻治理與原型驗證功能；不影響一般 PM 的 Schedule 操作。</p>
    <label>工具操作專案 <select className={button} value={selectedProject?.id ?? ""} onChange={event => { bindings?.onClearFeedback(); setSelectedProjectId(projects.find(project => project.id === event.target.value)?.id ?? null); }}>
      <option value="">選擇專案</option>
      {projects.map(project => <option key={project.id} value={project.id}>{[project.master.basicInformation.stnProjectName ?? "未命名專案", project.master.basicInformation.qciModelName, project.master.basicInformation.year].filter(value => value !== null && value !== "").join(" · ")}</option>)}
    </select></label>
    {bindings ? <SelectedProjectTools key={`${selectedProjectId}:${bindings.review.schedule.workingDraft?.workingDraftId ?? "no-draft"}`} bindings={bindings} /> : <p>請選擇可使用排程的專案。</p>}
  </details>;
}
