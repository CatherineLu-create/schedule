import React from "react";
import type { GovernanceDraftUpdate, MilestoneGovernanceDraft } from "./domain/governance/milestoneGovernance";
import { toMilestoneTypeId, toStageGroupId } from "./domain/shared/ids";

export function GovernanceClassificationControls({ candidate, onUpdate }: {
  readonly candidate: MilestoneGovernanceDraft["candidateRelease"];
  readonly onUpdate: (update: GovernanceDraftUpdate) => void;
}) {
  const [stageName, setStageName] = React.useState("");
  const [typeName, setTypeName] = React.useState("");
  const button = "rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40";
  const input = "ml-2 rounded border border-slate-300 px-2 py-1";
  return <div className="grid gap-4 md:grid-cols-2">
    <section aria-label="階段管理" className="space-y-3 rounded-lg border border-slate-200 p-3">
      <h3 className="font-semibold">階段管理</h3>
      <label className="block text-sm">新階段名稱<input className={input} value={stageName} onChange={event => setStageName(event.target.value)} /></label>
      <button className={button} type="button" disabled={!stageName.trim()} onClick={() => {
        onUpdate({ kind: "add-stage", id: toStageGroupId(globalThis.crypto.randomUUID()), displayName: stageName });
        setStageName("");
      }}>新增階段</button>
      <ul className="space-y-2">{candidate.stageGroups.map(stage => <li key={stage.id} className="flex items-center justify-between gap-2 text-sm">
        <span>{stage.displayName}</span>
        {candidate.selectableStageGroupIds.includes(stage.id)
          ? <button type="button" className={button} aria-label={`停用階段 ${stage.displayName}`} onClick={() => onUpdate({ kind: "retire-stage", id: stage.id })}>停用階段</button>
          : <span className="text-slate-500">已停用</span>}
      </li>)}</ul>
    </section>
    <section aria-label="類型管理" className="space-y-3 rounded-lg border border-slate-200 p-3">
      <h3 className="font-semibold">類型管理</h3>
      <label className="block text-sm">新類型名稱<input className={input} value={typeName} onChange={event => setTypeName(event.target.value)} /></label>
      <button className={button} type="button" disabled={!typeName.trim()} onClick={() => {
        onUpdate({ kind: "add-type", id: toMilestoneTypeId(globalThis.crypto.randomUUID()), displayName: typeName });
        setTypeName("");
      }}>新增類型</button>
      <h4 className="font-medium">可選類型</h4>
      <ul className="space-y-2">{candidate.selectableMilestoneTypeIds.map(id => {
        const type = candidate.milestoneTypes.find(item => item.id === id)!;
        return <li key={id} className="flex items-center justify-between gap-2 text-sm">
          <span>{type.displayName}</span>
          {candidate.automaticAttentionTypeIds.includes(id)
            ? <span className="text-slate-600">系統自動提醒</span>
            : <button type="button" className={button} aria-label={`停用類型 ${type.displayName}`} onClick={() => onUpdate({ kind: "retire-type", id })}>停用類型</button>}
        </li>;
      })}</ul>
      <h4 className="font-medium">歷史類型</h4>
      <p className="text-sm text-slate-500">僅供既有里程碑引用，無法選用於新定義。</p>
      <ul className="flex flex-wrap gap-2 text-sm">{candidate.milestoneTypes.filter(type => !candidate.selectableMilestoneTypeIds.includes(type.id)).map(type => <li key={type.id}>{type.displayName}</li>)}</ul>
    </section>
  </div>;
}
