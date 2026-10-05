import React from "react";
import type { EffectiveMilestoneGovernanceContext } from "./application/governance/effectiveMilestoneGovernanceContext";
import { selectEffectiveProjectMilestoneRequirements } from "./application/governance/projectMilestoneRequirements";
import { insertionDisplayOrder, orderMilestoneDefinitions } from "./application/milestoneDefinitionOrdering";
import { milestoneTypeCatalog, stageGroupCatalog, statusCatalog } from "./config/v2/referenceData";
import type { GovernanceDraftUpdate, GovernancePublishPreview, MilestoneGovernanceDraft, MilestoneGovernanceRelease, MilestoneGovernanceRuntimeState } from "./domain/governance/milestoneGovernance";
import type { Project } from "./domain/project/project";
import type { CanonicalProjectSchedule } from "./domain/schedule/officialSchedule";
import { toMilestoneDefinitionId, type MilestoneDefinitionId, type ProjectId } from "./domain/shared/ids";
import type { ValidationIssue } from "./domain/validation/validationIssue";

export interface GovernanceWorkspaceProps {
  readonly state: MilestoneGovernanceRuntimeState;
  readonly context: EffectiveMilestoneGovernanceContext;
  readonly projects: readonly Project[];
  readonly schedules: readonly CanonicalProjectSchedule[];
  readonly preview: GovernancePublishPreview | null;
  readonly issues?: readonly ValidationIssue[];
  readonly onStartDraft: () => void;
  readonly onUpdateDraft: (update: GovernanceDraftUpdate) => void;
  readonly onPreview: () => void;
  readonly onPublish: () => void;
  readonly onDiscard: () => void;
  readonly onBack: () => void;
  readonly createDefinitionId?: () => MilestoneDefinitionId;
}

type Candidate = MilestoneGovernanceDraft["candidateRelease"];
const settings = [
  ["addableDefinitionIds", "可新增", "可新增設定變更"],
  ["portfolioColumnDefinitionIds", "顯示於總表", "總表欄位變更"],
  ["additionalAttentionDefinitionIds", "加入日期提醒", "加入日期提醒變更"],
  ["newProjectRequirementDefinitionIds", "新案需確認", "新案需確認變更"],
] as const;
type Setting = typeof settings[number][0];
const button = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-600";
const panel = "min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
const control = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";
const legalStages = stageGroupCatalog.filter(item => item.active && item.reviewStatus === "reviewed");
const legalTypes = milestoneTypeCatalog.filter(item => item.active && item.reviewStatus === "reviewed");
const requirementHelp = "新案需確認的里程碑必須同時設為「可新增」。";
const addableHelp = "請先取消「新案需確認」，再取消「可新增」。";
const statusFilters = [["non-eol", "非 EOL"], ["all", "全部"], ["status-pending", "Pending"], ["status-on-going", "On-going"], ["status-mp", "MP"], ["status-eol", "EOL"]] as const;
const requirementStatuses = { pending: "待確認", adopted: "已跟進", notApplicable: "不適用" } as const;

function definitionName(release: Candidate, id: string): string {
  return release.definitions.find(definition => definition.id === id)?.name ?? "無法辨識的里程碑";
}
function DefinitionName({ release, id }: { readonly release: Candidate; readonly id: string }) {
  return <>{definitionName(release, id)}</>;
}
function definitionDescription(release: Candidate, id: string): string {
  const definition = release.definitions.find(item => item.id === id);
  return [definitionName(release, id), stageGroupCatalog.find(item => item.id === definition?.stageGroupId)?.displayName ?? "未設定階段",
    milestoneTypeCatalog.find(item => item.id === definition?.milestoneTypeId)?.displayName ?? "未設定類型"].join("｜");
}
function DefinitionList({ release, ids, action, describe = false }: { readonly release: Candidate; readonly ids: readonly string[]; readonly action?: string; readonly describe?: boolean }) {
  return ids.length === 0 ? <p className="text-slate-500">無</p> : <ul className="space-y-1 break-words text-sm">
    {ids.map((id, index) => <li key={`${id}-${index}`}>{describe ? definitionDescription(release, id) : definitionName(release, id)}{action && ` · ${action}`}</li>)}
  </ul>;
}
function SettingsSummary({ release }: { readonly release: Candidate }) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    {settings.map(([field, label]) => <details key={field}>
      <summary className="cursor-pointer font-medium"><span>{label}</span> · {release[field].length}</summary>
      <DefinitionList release={release} ids={release[field]} />
    </details>)}
  </div>;
}
function issueMessage(issue: ValidationIssue, release: Candidate): string {
  const label = definitionName(release, issue.target.entityId ?? "");
  if (issue.code === "retire-requirement-conflict" && issue.target.section === "newProjectRequirementDefinitionIds") {
    return `${label} 已設為「新案需確認」，但目前不可新增。請先設為「可新增」，或取消「新案需確認」。`;
  }
  const messages: Record<string, string> = {
    "retire-requirement-conflict": "停用後，既有跟進要求將無法完成。請明確撤回該要求，或保留可完成的途徑。",
    "retained-requirement-may-reopen": "此要求已完成且保留已發布排程的跟進紀錄；未來若從已發布排程移除，將再次成為待確認。",
    "governance.definition.semantic-identity-changed": `${label} 已發布，無法直接變更原有名稱、階段或類型。`,
    "governance.definition.historical-resolution-dropped": "已發布里程碑必須保留，供歷史紀錄引用。",
    "duplicate-id": "識別碼或專案跟進要求重複，請檢查設定。",
    "invalid-reference": "設定包含無效或衝突的引用，請檢查里程碑與專案。",
    "no-legal-fulfillment-path": "此跟進要求目前沒有可完成的途徑，請檢查可新增設定與既有排程。",
    "stale-base-release": "草稿依據的公版已變更，請重新建立草稿。",
    "no-draft": "目前沒有公版草稿。",
    "draft-already-exists": "目前已有公版草稿。",
  };
  return messages[issue.code] ?? "公版設定需要調整，請檢查里程碑與專案設定後重新預覽。";
}
function Issues({ issues, release }: { readonly issues: readonly ValidationIssue[]; readonly release: Candidate }) {
  return issues.length === 0 ? <p>無</p> : <ul className="space-y-2">
    {issues.map((issue, index) => <li key={`${issue.code}-${index}`} className="break-words">{issueMessage(issue, release)}</li>)}
  </ul>;
}
function membershipDiff(before: readonly MilestoneDefinitionId[], after: readonly MilestoneDefinitionId[]) {
  return { added: after.filter(id => !before.includes(id)), removed: before.filter(id => !after.includes(id)) };
}
function PublishChanges({ current, preview }: { readonly current: MilestoneGovernanceRelease; readonly preview: GovernancePublishPreview }) {
  if (!preview.candidateRelease || !preview.diff) return null;
  const candidate = preview.candidateRelease;
  const changes = settings.map(([field, label, heading]) => ({ field, label, heading, ...membershipDiff(current[field], candidate[field]) }));
  return <>
    <p className="rounded-lg bg-slate-50 p-3 text-sm" aria-label="發布變更摘要">
      {[`新增公版 +${preview.diff.addedDefinitionIds.length}`, ...changes.map(change => `${change.field === "portfolioColumnDefinitionIds" ? "總表欄位" : change.label} +${change.added.length}/-${change.removed.length}`), `停用 ${preview.diff.retiredDefinitionIds.length}`].join("｜")}
    </p>
    <div className="grid gap-4 md:grid-cols-2">
      {([["新增公版", preview.diff.addedDefinitionIds], ["停用公版", preview.diff.retiredDefinitionIds], ["里程碑資料變更", preview.diff.changedDefinitionIds]] as const).filter(([, ids]) => ids.length > 0).map(([heading, ids]) =>
        <div key={heading}><h3 className="font-medium">{heading}</h3><DefinitionList release={candidate} ids={ids} describe /></div>)}
      {changes.filter(change => change.added.length + change.removed.length > 0).map(change => <div key={change.field}>
        <h3 className="font-medium">{change.heading}</h3>
        {change.added.length > 0 && <DefinitionList release={candidate} ids={change.added} action="加入" />}
        {change.removed.length > 0 && <DefinitionList release={current} ids={change.removed} action="移除" />}
      </div>)}
    </div>
  </>;
}

export function GovernanceWorkspace({ state, context, projects, schedules, preview, issues = [], onStartDraft, onUpdateDraft, onPreview, onPublish, onDiscard, onBack,
  createDefinitionId = () => toMilestoneDefinitionId(globalThis.crypto.randomUUID()),
}: GovernanceWorkspaceProps): React.ReactElement {
  const current = state.releases.find(release => release.id === context.releaseId)!;
  const draft = state.draft;
  const candidate = draft?.candidateRelease;
  const [name, setName] = React.useState("");
  const [stage, setStage] = React.useState("");
  const [insertionPosition, setInsertionPosition] = React.useState("end");
  const [insertionError, setInsertionError] = React.useState("");
  const [type, setType] = React.useState("");
  const [definitionId, setDefinitionId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("non-eol");
  const [yearFilter, setYearFilter] = React.useState("all");
  const [selectedProjectIds, setSelectedProjectIds] = React.useState<ReadonlySet<ProjectId>>(new Set());
  const [guardedDefinitionId, setGuardedDefinitionId] = React.useState<MilestoneDefinitionId | null>(null);
  React.useEffect(() => {
    setSelectedProjectIds(new Set()); setGuardedDefinitionId(null); setDefinitionId(""); setSearch(""); setStatusFilter("non-eol"); setYearFilter("all"); setInsertionPosition("end"); setInsertionError("");
  }, [draft?.id]);
  const stageDefinitions = orderMilestoneDefinitions((candidate?.definitions ?? []).filter(definition => definition.stageGroupId === stage));
  React.useEffect(() => {
    if (insertionPosition !== "start" && insertionPosition !== "end" && !stageDefinitions.some(definition => definition.id === insertionPosition)) setInsertionPosition("end");
  }, [stage, candidate?.definitions, insertionPosition]);
  const effective = selectEffectiveProjectMilestoneRequirements({ projects, schedules }, state);
  const projectName = (id: string) => projects.find(project => project.id === id)?.master.basicInformation.stnProjectName ?? "未命名專案";
  const releaseLabel = (id: string) => {
    const release = state.releases.find(item => item.id === id);
    return !release ? "先前公版" : release.publishedAt === null ? "系統初始公版" : `試用發布 #${state.releases.filter(item => item.publishedAt !== null).findIndex(item => item.id === id) + 1}`;
  };
  const releaseTime = (id: string) => state.releases.find(item => item.id === id)?.publishedAt;
  const replace = (next: Candidate) => onUpdateDraft({ kind: "replace-candidate-release", candidateRelease: next });
  const setMembership = (field: Setting, id: MilestoneDefinitionId, checked: boolean) => {
    if (!candidate) return;
    if (field === "addableDefinitionIds" && !checked && candidate.newProjectRequirementDefinitionIds.includes(id)) {
      setGuardedDefinitionId(id); return;
    }
    if (field === "newProjectRequirementDefinitionIds" && checked && !candidate.addableDefinitionIds.includes(id)) return;
    setGuardedDefinitionId(null);
    replace({ ...candidate, [field]: checked ? [...candidate[field], id] : candidate[field].filter(item => item !== id) });
  };
  const newStage = legalStages.find(item => item.id === stage);
  const newType = legalTypes.find(item => item.id === type);
  const addDefinition = () => {
    if (!candidate || !name.trim() || !newStage || !newType) return;
    const displayOrder = insertionDisplayOrder(candidate.definitions, stage, insertionPosition);
    if (displayOrder === null) { setInsertionError("此階段的排列無法插入指定位置，請檢查里程碑排列後再試。草稿未變更。"); return; }
    replace({ ...candidate, definitions: [...candidate.definitions, {
      id: createDefinitionId(), name: name.trim(), stageGroupId: newStage.id, milestoneTypeId: newType.id,
      displayOrder,
      active: true, reviewStatus: "reviewed", aliases: [], showInPortfolio: false,
    }] });
    setName(""); setInsertionError("");
  };
  const assignmentDefinition = candidate?.definitions.find(definition => definition.id === definitionId);
  const alreadyAssigned = (projectId: ProjectId) => Boolean(draft?.existingProjectAssignments.some(assignment => assignment.projectId === projectId && assignment.milestoneDefinitionId === definitionId)
    || effective.some(enrollment => enrollment.projectId === projectId && enrollment.milestoneDefinitionId === definitionId && !draft?.withdrawalEnrollmentIds.includes(enrollment.enrollmentId)));
  const filteredProjects = projects.filter(project => {
    const basic = project.master.basicInformation;
    return (statusFilter === "all" || (statusFilter === "non-eol" ? basic.status !== "status-eol" : basic.status === statusFilter))
      && (yearFilter === "all" || (basic.year !== null && String(basic.year) === yearFilter))
      && [basic.stnProjectName, basic.qciModelName].some(value => (value ?? "").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  });
  const selectedEligibleProjects = projects.filter(project => selectedProjectIds.has(project.id) && !alreadyAssigned(project.id));
  const years = [...new Set(projects.map(project => project.master.basicInformation.year).filter((year): year is number => year !== null))].sort((left, right) => left - right);

  return <section aria-label="公版管理" className="min-w-0 max-w-full space-y-5 px-4 py-5 sm:px-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">公版管理</h1>
        <p className="mt-1 text-sm text-slate-600">公版里程碑、設定與專案跟進紀錄</p>
      </div>
      <button type="button" className={button} onClick={onBack}>回到 Dashboard</button>
    </header>
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">模擬模式｜變更僅保留於本次試用，重新整理後重置，不會同步其他使用者。</p>
    <section aria-label="目前已發布公版" className={panel}>
      <h2 className="text-lg font-semibold">目前已發布公版</h2>
      <p className="my-2 break-words text-sm">{releaseLabel(current.id)}{current.publishedAt && <> · <time dateTime={current.publishedAt}>{current.publishedAt}</time></>}</p>
      <SettingsSummary release={current} />
      {!draft && <button type="button" className={`${button} mt-4`} onClick={onStartDraft}>建立公版草稿</button>}
    </section>
    <section aria-label="自動提醒類型" className={panel}>
      <h2 className="font-semibold">自動提醒類型</h2>
      <p className="text-sm text-slate-600">以下類型固定自動提醒</p>
      <ul className="mt-2 flex flex-wrap gap-3">{milestoneTypeCatalog.filter(item => context.automaticAttentionTypeIds.has(item.id)).map(item => <li className="rounded-full bg-slate-100 px-3 py-1 text-sm" key={item.id}>{item.displayName}</li>)}</ul>
    </section>
    {issues.length > 0 && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"><Issues issues={issues} release={candidate ?? current} /></div>}
    {draft && candidate && <section aria-label="公版草稿" className={`${panel} space-y-5 border-sky-300`}>
      <div><h2 className="text-lg font-semibold">公版草稿</h2>
        <p className="text-sm">草稿設定於發布後生效。</p>
      </div>
      <fieldset className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-3">
        <legend className="px-1 font-medium">新增公版里程碑</legend>
        <label className="text-sm">公版里程碑名稱<input className={control} value={name} onChange={event => setName(event.target.value)} /></label>
        <label className="text-sm">階段<select className={control} value={stage} onChange={event => { setStage(event.target.value); setInsertionError(""); }}>
          <option value="">選擇階段</option>{legalStages.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}
        </select></label>
        <label className="text-sm">類型<select className={control} value={type} onChange={event => setType(event.target.value)}>
          <option value="">選擇類型</option>{legalTypes.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}
        </select></label>
        <label className="text-sm">插入位置<select className={control} value={insertionPosition} onChange={event => { setInsertionPosition(event.target.value); setInsertionError(""); }}>
          <option value="end">放在此階段最後</option><option value="start">放在此階段最前面</option>
          {stageDefinitions.map(definition => <option key={definition.id} value={definition.id}>放在「{definition.name}」之後</option>)}
        </select></label>
        <p className="text-sm text-slate-600 md:col-span-3">G/O、SMT、Close、MDRR 會自動加入 Dashboard 的 Upcoming / Overdue；其他類型可另外設定「加入日期提醒」。</p>
        {insertionError && <p role="alert" className="text-sm text-red-800 md:col-span-3">{insertionError}</p>}
        <button type="button" className={`${button} justify-self-start`} disabled={!name.trim() || !newStage || !newType} onClick={addDefinition}>加入公版草稿</button>
      </fieldset>
      <p className="text-sm text-slate-600">各項設定分別選擇；新案需確認必須同時可新增。停用前請檢查保留的設定與跟進要求，預覽將顯示衝突。</p>
      <p className="text-sm text-slate-600">G/O、SMT、Close、MDRR 會自動提醒；其他類型可勾選加入 Dashboard 的 Upcoming / Overdue。</p>
      <div className="max-h-[70vh] max-w-full overflow-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <caption className="p-3 text-left font-medium">公版里程碑與設定</caption>
          <thead><tr>{["里程碑", "階段", "類型", "狀態", ...settings.map(([, label]) => label), "停用"].map((label, index) => <th className={`sticky top-0 bg-slate-50 px-3 py-2 ${index === 0 ? "left-0 z-30 min-w-[240px]" : "z-20"}`} key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{candidate.definitions.map(definition => <tr className="border-t border-slate-200 align-top" key={definition.id}>
            <th scope="row" className="sticky left-0 z-10 min-w-[240px] bg-white px-3 py-3 font-medium"><DefinitionName release={candidate} id={definition.id} /></th>
            <td className="px-3 py-3">{stageGroupCatalog.find(item => item.id === definition.stageGroupId)?.displayName ?? "未設定階段"}</td>
            <td className="px-3 py-3">{milestoneTypeCatalog.find(item => item.id === definition.milestoneTypeId)?.displayName ?? "未設定類型"}</td>
            <td className="px-3 py-3">{current.definitions.some(item => item.id === definition.id) ? "已發布" : "僅草稿"}<br />{definition.active ? "啟用" : "未啟用"} · {definition.reviewStatus === "reviewed" ? "已確認" : "待確認"}<br />{candidate.addableDefinitionIds.includes(definition.id) ? "可新增" : "不可新增"}</td>
            {settings.map(([field, label]) => {
              if (field === "additionalAttentionDefinitionIds" && context.automaticAttentionTypeIds.has(definition.milestoneTypeId)) return <td className="px-3 py-3 text-slate-600" key={field}>自動提醒</td>;
              const requirementDisabled = field === "newProjectRequirementDefinitionIds" && !candidate.addableDefinitionIds.includes(definition.id) && !candidate[field].includes(definition.id);
              return <td className="px-3 py-3" key={field}>
                <input aria-label={label} type="checkbox" className="h-4 w-4" checked={candidate[field].includes(definition.id)} disabled={requirementDisabled} title={requirementDisabled ? requirementHelp : undefined} onChange={event => setMembership(field, definition.id, event.target.checked)} />
                {requirementDisabled && <p className="mt-1 max-w-40 text-xs text-slate-500">{requirementHelp}</p>}
                {field === "addableDefinitionIds" && guardedDefinitionId === definition.id && <p role="status" className="mt-1 max-w-40 text-xs text-amber-800">{addableHelp}</p>}
              </td>;
            })}
            <td className="px-3 py-3"><button type="button" className={button} disabled={!candidate.addableDefinitionIds.includes(definition.id)} onClick={() => setMembership("addableDefinitionIds", definition.id, false)}>停用</button></td>
          </tr>)}</tbody>
        </table>
      </div>
      <section aria-label="既有專案需確認" className="space-y-3">
        <h3 className="font-semibold">既有專案需確認</h3>
        <div className="grid items-end gap-3 md:grid-cols-4">
          <label className="text-sm">需確認的公版里程碑<select className={control} value={definitionId} onChange={event => setDefinitionId(event.target.value)}><option value="">選擇公版里程碑</option>{orderMilestoneDefinitions(candidate.definitions).map(definition => <option key={definition.id} value={definition.id}>{definitionDescription(candidate, definition.id)}</option>)}</select></label>
          <label className="text-sm">搜尋專案<input className={control} value={search} onChange={event => setSearch(event.target.value)} /></label>
          <label className="text-sm">年份<select className={control} value={yearFilter} onChange={event => setYearFilter(event.target.value)}><option value="all">全部年份</option>{years.map(year => <option key={year} value={year}>{year}</option>)}</select></label>
          <label className="text-sm">專案狀態<select className={control} value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>{statusFilters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={button} disabled={!assignmentDefinition} onClick={() => setSelectedProjectIds(previous => new Set([...previous, ...filteredProjects.filter(project => !alreadyAssigned(project.id)).map(project => project.id)]))}>選取目前篩選結果</button>
          <button type="button" className={button} onClick={() => setSelectedProjectIds(new Set())}>清除選取</button>
          <p className="text-sm">已選 {selectedEligibleProjects.length} 個專案</p>
        </div>
        <fieldset className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-2">
          <legend className="px-1 text-sm">專案選取</legend>
          {filteredProjects.length === 0 && <p className="text-sm text-slate-500">沒有符合條件的專案</p>}
          {filteredProjects.map(project => {
            const basic = project.master.basicInformation;
            const assigned = alreadyAssigned(project.id);
            return <label className="flex items-start gap-2 rounded bg-slate-50 p-2 text-sm" key={project.id}>
              <input type="checkbox" aria-label={projectName(project.id)} disabled={!assignmentDefinition || assigned} checked={assigned || selectedProjectIds.has(project.id)} onChange={event => {
                const next = new Set(selectedProjectIds); if (event.target.checked) next.add(project.id); else next.delete(project.id); setSelectedProjectIds(next);
              }} />
              <span>{projectName(project.id)} · {statusCatalog.find(status => status.id === basic.status)?.displayName ?? "未設定狀態"}
                {basic.qciModelName && <span className="block text-slate-600">{basic.qciModelName}</span>}
                {basic.year !== null && <span className="block text-slate-600">{basic.year}</span>}{assigned && <span className="block text-slate-600">已加入</span>}
              </span>
            </label>;
          })}
        </fieldset>
        <button type="button" className={button} disabled={!assignmentDefinition || selectedEligibleProjects.length === 0} onClick={() => {
          if (!assignmentDefinition || selectedEligibleProjects.length === 0) return;
          onUpdateDraft({ kind: "replace-existing-project-assignments", assignments: [...draft.existingProjectAssignments, ...selectedEligibleProjects.map(project => ({ projectId: project.id, milestoneDefinitionId: assignmentDefinition.id }))] });
          setSelectedProjectIds(new Set());
        }}>加入已選專案</button>
        <ul className="space-y-2 text-sm">{draft.existingProjectAssignments.map((assignment, index) => <li key={index} className="flex flex-wrap items-center gap-2">
          <span>{projectName(assignment.projectId)}</span> → <span><DefinitionName release={candidate} id={assignment.milestoneDefinitionId} /></span>
          <button type="button" className={button} aria-label={`移除草稿要求 ${index + 1}`} onClick={() => onUpdateDraft({ kind: "replace-existing-project-assignments", assignments: draft.existingProjectAssignments.filter((_, position) => position !== index) })}>移除草稿要求</button>
        </li>)}</ul>
      </section>
      <section aria-label="撤回既有跟進要求" className="space-y-2">
        <h3 className="font-semibold">撤回既有跟進要求</h3>
        <p className="text-sm text-slate-600">若要重新指定，請撤回原跟進要求，再明確加入新的專案與里程碑；原有紀錄會保留。</p>
        {effective.length === 0 && <p className="text-sm">目前沒有有效的跟進要求</p>}
        {effective.map(enrollment => <label key={enrollment.enrollmentId} className="flex items-start gap-2 break-words text-sm">
          <input type="checkbox" aria-label={`撤回 ${projectName(enrollment.projectId)} · ${definitionName(current, enrollment.milestoneDefinitionId)}`} checked={draft.withdrawalEnrollmentIds.includes(enrollment.enrollmentId)} onChange={event => onUpdateDraft({ kind: "replace-withdrawals", enrollmentIds: event.target.checked ? [...draft.withdrawalEnrollmentIds, enrollment.enrollmentId] : draft.withdrawalEnrollmentIds.filter(id => id !== enrollment.enrollmentId) })} />
          <span>{projectName(enrollment.projectId)} · {definitionName(current, enrollment.milestoneDefinitionId)} · {requirementStatuses[enrollment.status]}
            <span className="block text-slate-600">加入於 {releaseLabel(enrollment.assignedByReleaseId)}{releaseTime(enrollment.assignedByReleaseId) && ` · ${releaseTime(enrollment.assignedByReleaseId)}`}</span>
          </span>
        </label>)}
      </section>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={onPreview}>檢查並預覽發布</button>
        <button type="button" className={`${button} border-sky-600 text-sky-900`} disabled={!preview || preview.blockingIssues.length > 0} onClick={onPublish}>發布公版</button>
        <button type="button" className={button} onClick={onDiscard}>捨棄公版草稿</button>
      </div>
    </section>}
    {preview && <section aria-label="公版發布預覽" className={`${panel} space-y-4`}>
      <h2 className="text-lg font-semibold">公版發布預覽</h2>
      <div className="rounded-lg bg-red-50 p-3 text-sm text-red-900"><h3 className="font-semibold">阻擋原因</h3><Issues issues={preview.blockingIssues} release={preview.candidateRelease ?? current} /></div>
      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><h3 className="font-semibold">提醒事項</h3><Issues issues={preview.warnings} release={preview.candidateRelease ?? current} /></div>
      <PublishChanges current={current} preview={preview} />
      {preview.proposedAssignments.length > 0 && <div><h3 className="font-medium">既有專案需確認變更</h3><ul>{[...new Set(preview.proposedAssignments.map(assignment => assignment.milestoneDefinitionId))].map(id => <li className="break-words text-sm" key={id}>
        {definitionName(preview.candidateRelease ?? current, id)} · 新增 {preview.proposedAssignments.filter(assignment => assignment.milestoneDefinitionId === id).length} 個專案
        <ul>{preview.proposedAssignments.filter(assignment => assignment.milestoneDefinitionId === id).map((assignment, index) => <li key={index}>{projectName(assignment.projectId)} · 加入</li>)}</ul>
      </li>)}</ul></div>}
      {preview.proposedWithdrawalEnrollmentIds.length > 0 && <div><h3 className="font-medium">撤回跟進要求</h3><ul>{preview.proposedWithdrawalEnrollmentIds.map((id, index) => {
        const enrollment = state.requirementEnrollments.find(item => item.id === id);
        return <li className="break-words text-sm" key={`${id}-${index}`}>{enrollment ? `${projectName(enrollment.projectId)} · ${definitionName(current, enrollment.milestoneDefinitionId)}` : "無法辨識的跟進要求"}</li>;
      })}</ul></div>}
      {preview.proposedRetiredDraftOccurrenceGrants.length > 0 && <div><h3 className="font-medium">保留既有草稿里程碑</h3><ul>{preview.proposedRetiredDraftOccurrenceGrants.map((grant, index) => <li className="break-words text-sm" key={index}>{projectName(grant.projectId)} · <DefinitionName release={current} id={grant.milestoneDefinitionId} /></li>)}</ul></div>}
    </section>}
    <section aria-label="公版發布紀錄" className={`${panel} space-y-4`}>
      <h2 className="text-lg font-semibold">公版發布紀錄</h2>
      <p className="text-sm text-slate-600">公版發布紀錄追蹤公用設定；各專案的排程版本仍保留在原專案。</p>
      {state.releases.map(release => <article key={release.id} className="space-y-2 border-t border-slate-200 pt-3">
        <h3 className="break-words font-medium">{releaseLabel(release.id)}{release.id === context.releaseId && " · 目前使用"}</h3>
        {release.publishedAt !== null && <time className="block text-sm" dateTime={release.publishedAt}>{release.publishedAt}</time>}
        <SettingsSummary release={release} />
        <details><summary className="cursor-pointer text-sm">已發布里程碑 · {release.definitions.length}</summary>
          <ul className="space-y-1 text-sm">{release.definitions.map(definition => <li className="break-words" key={definition.id}>
            <DefinitionName release={release} id={definition.id} /> · {stageGroupCatalog.find(stage => stage.id === definition.stageGroupId)?.displayName ?? "未設定階段"} · {milestoneTypeCatalog.find(type => type.id === definition.milestoneTypeId)?.displayName ?? "未設定類型"} · {definition.active ? "啟用" : "未啟用"} · {definition.reviewStatus === "reviewed" ? "已確認" : "待確認"} · {release.addableDefinitionIds.includes(definition.id) ? "可新增" : "不可新增"}
          </li>)}</ul>
        </details>
      </article>)}
    </section>
    <section aria-label="專案跟進紀錄" className={`${panel} space-y-3`}>
      <h2 className="text-lg font-semibold">專案跟進紀錄</h2>
      {state.requirementEnrollments.length === 0 && <p className="text-sm">目前沒有專案跟進紀錄。</p>}
      {state.requirementEnrollments.map(enrollment => {
        const release: MilestoneGovernanceRelease | undefined = state.releases.find(item => item.id === enrollment.assignedByReleaseId);
        const status = effective.find(item => item.enrollmentId === enrollment.id)?.status;
        const withdrawals = state.requirementWithdrawals.filter(withdrawal => withdrawal.enrollmentId === enrollment.id);
        const assignedReleaseIndex = state.releases.findIndex(item => item.id === enrollment.assignedByReleaseId);
        const reassigned = state.requirementWithdrawals.some(withdrawal => {
          const withdrawnReleaseIndex = state.releases.findIndex(item => item.id === withdrawal.withdrawnByReleaseId);
          return withdrawnReleaseIndex >= 0 && withdrawnReleaseIndex <= assignedReleaseIndex
            && state.requirementEnrollments.some(original => original.id !== enrollment.id && original.id === withdrawal.enrollmentId
              && original.projectId === enrollment.projectId && original.milestoneDefinitionId === enrollment.milestoneDefinitionId);
        });
        return <article key={enrollment.id} className="break-words border-t border-slate-200 pt-3 text-sm">
          <h3 className="font-medium">{projectName(enrollment.projectId)} · {definitionName(release ?? current, enrollment.milestoneDefinitionId)}</h3>
          <p>{enrollment.source === "new-project-at-creation" ? "建立新案時加入" : reassigned ? "重新指定" : "加入既有專案"} · {status ? requirementStatuses[status] : withdrawals.length > 0 ? "已撤回" : "目前公版已無效"}</p>
          <p>{releaseLabel(enrollment.assignedByReleaseId)}{release?.publishedAt && <> · <time dateTime={release.publishedAt}>{release.publishedAt}</time></>}</p>
          {withdrawals.map(withdrawal => <p key={withdrawal.id}>撤回於 {releaseLabel(withdrawal.withdrawnByReleaseId)}{releaseTime(withdrawal.withdrawnByReleaseId) && <> · <time dateTime={releaseTime(withdrawal.withdrawnByReleaseId)!}>{releaseTime(withdrawal.withdrawnByReleaseId)}</time></>}</p>)}
        </article>;
      })}
    </section>
  </section>;
}
