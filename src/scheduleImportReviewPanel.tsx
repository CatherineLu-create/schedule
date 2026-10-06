import React from "react";
import { milestoneDefinitionDisplayName } from "./application/milestoneDefinitionPresentation";
import type { CanonicalScheduleCommandContext } from "./application/commands/canonicalScheduleCommands";
import { collectSchedulePublishBlockingFindings, previewDraftLocalOccurrenceToPublic, previewScheduleImportDecision } from "./application/commands/scheduleReviewCommands";
import { selectScheduleReviewTrace } from "./application/selectors/scheduleReviewTrace";
import type { EffectiveMilestoneGovernanceContext } from "./application/governance/effectiveMilestoneGovernanceContext";
import { getCurrentPublishedVersion, type CanonicalProjectSchedule } from "./domain/schedule/officialSchedule";
import type { CanonicalScheduleWorkingDraftMilestone } from "./domain/schedule/canonicalScheduleWorkingDraft";
import type { MilestoneDefinition } from "./domain/schedule/milestoneCatalog";
import { suggestScheduleImportActions, type ApplicabilityApplyAction, type ConfirmMapDraftLocalOccurrenceToPublicInput, type ConfirmProjectLocalMilestoneDefinitionInput, type ConfirmScheduleImportDecisionInput, type DateApplyAction, type GovernanceSimulationPack, type ParsedDateValue, type RawImportCell, type ReviewTarget, type ScheduleImportCandidate, type ScheduleReviewFailureCode } from "./domain/schedule/scheduleReview";
import { parseDateOnly } from "./domain/shared/dateOnly";
import { toMilestoneId, toMilestoneTypeId, toStageGroupId, type MilestoneDefinitionId, type MilestoneId } from "./domain/shared/ids";
import type { ValidationIssue } from "./domain/validation/validationIssue";
export const governanceSimulationDisclosure = "模擬匯入資料｜供 PIP 流程驗收，非 Kevin 正式 JSON 格式";

export type LocalDefinitionFormInput = Omit<ConfirmProjectLocalMilestoneDefinitionInput, "definitionId" | "source" | "evidenceIds">;
export type LocalMappingFormInput = Omit<ConfirmMapDraftLocalOccurrenceToPublicInput, "sessionId" | "decisionId">;
export interface ScheduleReviewBindings {
  readonly schedule: CanonicalProjectSchedule;
  readonly context: CanonicalScheduleCommandContext;
  readonly onCreateLocal: (input: LocalDefinitionFormInput) => MilestoneDefinitionId | null;
  readonly onLoadSimulation: (pack: GovernanceSimulationPack) => void;
  readonly onConfirmImport: (input: ConfirmScheduleImportDecisionInput) => void;
  readonly onMapLocal: (input: LocalMappingFormInput) => boolean;
}
const control = "rounded border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:text-slate-400 disabled:cursor-not-allowed";
const panel = "mt-4 rounded border border-slate-200 bg-slate-50 p-4 space-y-3";
type DefinitionLabel = Pick<MilestoneDefinition, "id" | "name" | "stageGroupId" | "milestoneTypeId">;
function stageName(id: string, review: ScheduleReviewBindings) { return review.context.governance.stageGroupsForHistoricalResolution.find(item => item.id === id)?.displayName ?? "未設定階段"; }
function typeName(id: string | null, review: ScheduleReviewBindings) { return id === null ? "無類型" : review.context.governance.milestoneTypesForHistoricalResolution.find(item => item.id === id)?.displayName ?? "未設定類型"; }
function definitionLabel(definition: DefinitionLabel, review: ScheduleReviewBindings) { return `${milestoneDefinitionDisplayName(definition)} | ${stageName(definition.stageGroupId, review)} / ${typeName(definition.milestoneTypeId, review)}`; }
function allDefinitions(review: ScheduleReviewBindings) { return [...review.context.governance.definitionsForHistoricalResolution, ...review.schedule.localDefinitions]; }
export function scheduleReviewFailureMessage(code: ScheduleReviewFailureCode, language: "en" | "zh" = "en"): string {
  const chinese: Record<ScheduleReviewFailureCode, string> = {
    "no-working-draft": "請先建立 Working Draft。",
    "candidate-not-found": "此匯入項目已不在目前草稿中，請重新檢查。",
    "already-confirmed": "此項目已確認。",
    "target-not-found": "目標列已移除或無法使用，請重新選擇。",
    "target-definition-mismatch": "目標已變更或與來源里程碑不符，請重新選擇。",
    "duplicate-milestone-id": "里程碑識別資料衝突，未套用任何變更。",
    "duplicate-target-definition": "此草稿已有相同公版里程碑，請選擇其他目標。",
    "invalid-action-for-new-occurrence": "新增列必須明確設定或清除日期。",
    "invalid-date-or-applicability": "請確認日期與適用性；不適用時必須清除計畫及實際日期。",
    "invalid-local-classification": "請先確認本案自訂里程碑及有效分類；未知來源類型不能視為無類型。",
    "definition-not-addable": "目標目前不可新增，請重新選擇可用的公版里程碑。",
    "retired-definition-not-retained": "此專案沒有可合法引用的既有停用里程碑。",
    "stale-governance-context": "公版已變更，請重新檢查目前目標。",
    "id-collision": "識別資料衝突，未套用任何變更，請重試。",
    "invalid-equivalence-assertion": "請逐項確認四項相同條件後再對應。",
  };
  if (language === "zh") return chinese[code];
  const messages: Record<ScheduleReviewFailureCode, string> = {
    "no-working-draft": "Start a Working Draft before editing.",
    "candidate-not-found": "This import item is no longer in the current Draft. Review it again.",
    "already-confirmed": "This item is already confirmed.",
    "target-not-found": "The target row was removed or is unavailable. Select a current Draft row.",
    "target-definition-mismatch": "The target changed or does not match the source milestone. Select it again.",
    "duplicate-milestone-id": "The row conflicts with an existing identity. No changes were applied. Try again.",
    "duplicate-target-definition": "The Draft already contains this public milestone. Choose another target.",
    "invalid-action-for-new-occurrence": "A new row requires dates to be set or explicitly cleared.",
    "invalid-date-or-applicability": "Confirm valid dates and applicability. N/A requires both dates to be cleared.",
    "invalid-local-classification": "Confirm a Project-specific milestone with a selectable Stage and optional Type. An explicit unknown source Type cannot be treated as No Type.",
    "definition-not-addable": "The target is no longer addable. Choose an available public milestone.",
    "retired-definition-not-retained": "This Project has no legal existing reference to the retired milestone.",
    "stale-governance-context": "Governance changed. Review the current target again.",
    "id-collision": "An identity conflict occurred. No changes were applied. Try again.",
    "invalid-equivalence-assertion": "Confirm all four equivalence assertions before mapping.",
  };
  return messages[code];
}
function findingText(issue: ValidationIssue): string {
  const suffix = issue.code.split(".").at(-1)!;
  if (suffix === "pending-decision") return "匯入項目仍須逐筆明確確認。";
  if (suffix === "ambiguous-date") return "來源日期有歧義，請明確選擇日期。";
  if (suffix === "invalid-date" || suffix === "legacy-sentinel") return "來源日期無效，請設定或明確清除。";
  if (suffix === "unrecognized-applicability") return "來源適用性未知，請明確選擇。";
  if (suffix === "not-applicable-with-date") return "不適用的里程碑仍有日期，請清除計畫及實際日期。";
  if (suffix === "missing-plan-and-actual" || suffix === "actual-without-plan") return "適用的里程碑需要計畫日期。";
  const known = ["no-working-draft", "candidate-not-found", "already-confirmed", "target-not-found", "target-definition-mismatch", "duplicate-milestone-id", "duplicate-target-definition", "invalid-action-for-new-occurrence", "invalid-date-or-applicability", "invalid-local-classification", "definition-not-addable", "retired-definition-not-retained", "stale-governance-context", "id-collision", "invalid-equivalence-assertion"];
  return known.includes(suffix) ? scheduleReviewFailureMessage(suffix as ScheduleReviewFailureCode, "zh") : "草稿仍有分類、日期或重複列問題待處理。";
}
function Findings({ issues }: { issues: readonly ValidationIssue[] }) {
  const messages = [...new Set(issues.map(findingText))];
  return messages.length ? <ul className="list-disc pl-5 text-sm text-rose-700">{messages.map(message => <li key={message}>{message}</li>)}</ul> : <p className="text-sm text-emerald-800">無</p>;
}
export function SchedulePublishFindings({ review }: { review: ScheduleReviewBindings }) {
  const issues = collectSchedulePublishBlockingFindings(review.schedule, review.context);
  return issues.length > 0 ? <div className="mt-3" aria-label="Publish blockers"><p>The Working Draft has unresolved items. Resolve them before publishing.</p></div> : null;
}

export function ProjectLocalDefinitionEditor({ governance, onCreate, onCancel }: { governance: EffectiveMilestoneGovernanceContext; onCreate: (input: LocalDefinitionFormInput) => void; onCancel: () => void }) {
  const [name, setName] = React.useState("");
  const [stage, setStage] = React.useState("");
  const [type, setType] = React.useState("");
  const stageIsSelectable = governance.selectableStageGroups.some(item => item.id === stage);
  const typeIsSelectable = type === "" || governance.selectableMilestoneTypes.some(item => item.id === type);
  return <div className={panel} role="group" aria-label="Create Project-specific Milestone">
    <label className="block">Milestone Name <input className={control} value={name} onChange={event => setName(event.target.value)} /></label>
    <label className="block">Stage <select className={control} value={stage} onChange={event => setStage(event.target.value)}><option value="">Select Stage</option>{governance.selectableStageGroups.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
    <label className="block">Type (optional) <select className={control} value={type} onChange={event => setType(event.target.value)}><option value="">No Type</option>{governance.selectableMilestoneTypes.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
    <p className="text-sm">Choose a published Stage. Type is optional; choose No Type when none applies.</p>
    <button className={control} type="button" onClick={onCancel}>Cancel</button>{" "}
    <button className={control} type="button" disabled={!name.trim() || !stageIsSelectable || !typeIsSelectable} onClick={() => {
      if (name.trim() && stageIsSelectable && typeIsSelectable) onCreate({ name, stageGroupId: toStageGroupId(stage), milestoneTypeId: type === "" ? null : toMilestoneTypeId(type) });
    }}>Create Project-specific Milestone</button>
  </div>;
}

export function ScheduleSimulationEntry({ review }: { review: ScheduleReviewBindings }) {
  const [pack, setPack] = React.useState<GovernanceSimulationPack>("basic-success");
  const [confirm, setConfirm] = React.useState(false);
  return <section className={panel} aria-label="模擬匯入試用工具">
    <h3 className="font-semibold">模擬匯入試用工具</h3>
    <p className="text-sm text-slate-600">{governanceSimulationDisclosure}</p>
    <p className="text-sm text-slate-600">真實 Kevin 匯入格式與操作流程將於取得正式資料後另行設計。</p>
    <label>模擬情境 <select className={control} value={pack} onChange={event => { setPack(event.target.value as GovernanceSimulationPack); setConfirm(false); }}>
      <option value="basic-success">基本成功流程</option><option value="fixable-validation">可修正錯誤</option><option value="retired-existing-update">已停用但可更新原列</option><option value="retired-no-reference-negative">已停用且無合法引用（負向測試）</option>
    </select></label>{" "}
    <button className={control} type="button" onClick={() => review.schedule.workingDraft === null ? setConfirm(true) : review.onLoadSimulation(pack)}>載入模擬匯入資料</button>
    {pack === "basic-success" && review.schedule.localDefinitions.length === 0 && <p>基本成功流程需要此專案已有確認的本案自訂里程碑；可於該專案 Schedule 建立。</p>}
    {pack === "retired-no-reference-negative" && <p>預期負向結果：只修正日期仍不可發布。沒有合法引用的停用里程碑，不能新增或以同名本案自訂里程碑替代。</p>}
    {confirm && <div className={panel} role="dialog" aria-label="建立草稿並載入模擬資料">
      <p>{getCurrentPublishedVersion(review.schedule) === null ? "建立空白 Working Draft，並載入所選情境的待處理項目。" : "僅複製目前已發布排程的里程碑至 Working Draft，並載入所選情境的待處理項目。"}</p>
      <p>請逐筆審核載入的項目，再發布此專案草稿。</p>
      <button className={control} type="button" onClick={() => setConfirm(false)}>取消</button>{" "}
      <button className={control} type="button" onClick={() => { setConfirm(false); review.onLoadSimulation(pack); }}>建立草稿並載入</button>
    </div>}
  </section>;
}

export function LocalOccurrenceMapping({ review, milestoneId }: { review: ScheduleReviewBindings; milestoneId: MilestoneId }) {
  const [opened, setOpened] = React.useState(false);
  const [target, setTarget] = React.useState("");
  const [assertion, setAssertion] = React.useState({ workContent: false, stage: false, type: false, completionCriteria: false });
  const occurrence = review.schedule.workingDraft?.milestones.find(row => row.milestoneId === milestoneId);
  const local = review.schedule.localDefinitions.find(definition => definition.id === occurrence?.milestoneDefinitionId);
  if (!local) return null;
  const destination = review.context.governance.addablePublicDefinitions.find(definition => definition.id === target);
  const input = destination ? { milestoneId, localDefinitionId: local.id, publicDefinitionId: destination.id } : null;
  const preview = input ? previewDraftLocalOccurrenceToPublic(review.schedule, input, review.context) : null;
  const ready = assertion.workContent && assertion.stage && assertion.type && assertion.completionCriteria && preview?.ok;
  return <>

    <p>{definitionLabel(local, review)}</p>
    <button className={control} type="button" onClick={() => { setOpened(true); setTarget(""); setAssertion({ workContent: false, stage: false, type: false, completionCriteria: false }); }}>對應公版里程碑</button>
    {opened && <div className={panel} role="dialog" aria-label="對應公版里程碑">
      <p>本案自訂：{definitionLabel(local, review)}</p>
      <label>公版里程碑 <select className={control} value={target} onChange={event => { setTarget(event.target.value); setAssertion({ workContent: false, stage: false, type: false, completionCriteria: false }); }}><option value="">選擇公版里程碑</option>{review.context.governance.addablePublicDefinitions.map(definition => <option key={definition.id} value={definition.id}>{definitionLabel(definition, review)}</option>)}</select></label>
      {destination && <p>公版：{definitionLabel(destination, review)}</p>}
      {([['workContent', '工作內容相同'], ['stage', '階段相同'], ['type', '類型相同'], ['completionCriteria', '完成標準相同']] as const).map(([field, label]) => <label className="block" key={field}><input type="checkbox" checked={assertion[field]} onChange={event => setAssertion({ ...assertion, [field]: event.target.checked })} /> {label}</label>)}
      {preview && !preview.ok && <p role="alert">{scheduleReviewFailureMessage(preview.code, "zh")}</p>}
      {target !== "" && !destination && <p role="alert">{scheduleReviewFailureMessage("definition-not-addable", "zh")}</p>}
      <button className={control} type="button" onClick={() => setOpened(false)}>取消</button>{" "}
      <button className={control} type="button" disabled={!ready} onClick={() => {
        const { workContent, stage, type, completionCriteria } = assertion;
        if (!workContent || !stage || !type || !completionCriteria || !ready || !input) return;
        if (review.onMapLocal({ ...input, assertion: { workContent, stage, type, completionCriteria } })) setOpened(false);
      }}>確認對應</button>
    </div>}
  </>;
}

function rawText(cell: RawImportCell) { return cell.presence === "missing" ? "缺少欄位" : cell.raw.trim() === "" ? "空白" : cell.raw === "-" || cell.raw === "*" ? `原始符號： ${cell.raw}` : cell.raw; }
function parsedDateText(value: ParsedDateValue) { return value.kind === "parsed" ? value.value : value.kind === "missing" ? "缺少欄位" : value.kind === "blank" ? "空白" : value.kind === "ambiguous" ? `日期有歧義： ${value.raw}` : `日期無效： ${value.raw}`; }
function occurrenceText(row: CanonicalScheduleWorkingDraftMilestone | null) { return row === null ? "沒有既有列" : `${row.applicability === "applicable" ? "適用" : "N/A"} | 計畫 ${row.plan ?? "空白"} | 實際 ${row.actual ?? "空白"}`; }
type DateChoice = { readonly kind: "pending" | DateApplyAction["kind"]; readonly text: string };
function dateChoice(action: DateApplyAction | null): DateChoice { return { kind: action?.kind ?? "pending", text: action?.kind === "set" ? action.value : "" }; }
function dateAction(choice: DateChoice): DateApplyAction | null { const parsed = parseDateOnly(choice.text); return choice.kind === "pending" ? null : choice.kind === "set" ? parsed === null ? null : { kind: "set", value: parsed } : { kind: choice.kind }; }
function ImportDateAction({ label, value, onChange, existing }: { label: string; value: DateChoice; onChange: (choice: DateChoice) => void; existing: boolean }) {
  return <div><label>{label}處理方式 <select className={control} value={value.kind} onChange={event => onChange({ ...value, kind: event.target.value as DateChoice["kind"] })}><option value="pending">請明確選擇</option>{existing && <option value="keepExisting">保留目前值</option>}<option value="set">設定日期</option><option value="clear">清除日期</option></select></label>{" "}
    {value.kind === "set" && <label>{label}日期 <input className={control} type="date" value={value.text} onChange={event => onChange({ ...value, text: event.target.value })} /></label>}
  </div>;
}
interface TargetOption { readonly value: string; readonly label: string; readonly target: ReviewTarget }
function targetOptions(review: ScheduleReviewBindings, candidate: ScheduleImportCandidate): TargetOption[] {
  const source = candidate.sourceDefinitionId;
  const definitions = allDefinitions(review);
  const draft = review.schedule.workingDraft!;
  const options: TargetOption[] = draft.milestones.flatMap((row, index) => {
    const definition = definitions.find(item => item.id === row.milestoneDefinitionId);
    if (!definition || (source !== undefined && source !== definition.id)) return [];
    const eligibility = previewScheduleImportDecision(review.schedule, { candidateId: candidate.id,
      target: { kind: "updateExistingOccurrence", milestoneId: row.milestoneId, expectedDefinitionId: row.milestoneDefinitionId },
      plan: { kind: "clear" }, actual: { kind: "clear" }, applicability: { kind: "set", value: "notApplicable" },
    }, review.context);
    if (candidate.status === "pending" && (!eligibility.ok || eligibility.value.operationBlockingFindings.length > 0)) return [];
    return [{ value: row.milestoneId, label: `更新既有列 ${index + 1} | ${definitionLabel(definition, review)} | 計畫 ${row.plan ?? "空白"} / 實際 ${row.actual ?? "空白"}`, target: { kind: "updateExistingOccurrence" as const, milestoneId: row.milestoneId, expectedDefinitionId: row.milestoneDefinitionId } }];
  });
  // This read-only proposed identity is replaced by an allocated identity on explicit confirmation.
  const milestoneId = toMilestoneId(`review-preview:${candidate.id}`);
  for (const definition of review.context.governance.addablePublicDefinitions) {
    if ((source === undefined || source === definition.id) && !draft.milestones.some(row => row.milestoneDefinitionId === definition.id)) options.push({ value: definition.id, label: `新增公版里程碑列 | ${definitionLabel(definition, review)}`, target: { kind: "createPublicOccurrence", definitionId: definition.id, milestoneId } });
  }
  for (const definition of review.schedule.localDefinitions) {
    if ((source === undefined || source === definition.id) && !draft.milestones.some(row => row.milestoneDefinitionId === definition.id)) options.push({ value: definition.id, label: `新增已確認的本案自訂里程碑列 | ${definitionLabel(definition, review)}`, target: { kind: "createLocalOccurrence", localDefinitionId: definition.id, milestoneId } });
  }
  return options;
}
function CandidateDecision({ review, candidate, target }: { review: ScheduleReviewBindings; candidate: ScheduleImportCandidate; target: ReviewTarget | null }) {
  const before = target?.kind === "updateExistingOccurrence" ? review.schedule.workingDraft!.milestones.find(row => row.milestoneId === target.milestoneId) ?? null : null;
  const suggested = suggestScheduleImportActions(candidate, before);
  const [plan, setPlan] = React.useState(() => dateChoice(suggested.plan));
  const [actual, setActual] = React.useState(() => dateChoice(suggested.actual));
  const [applicability, setApplicability] = React.useState(suggested.applicability?.kind === "keepExisting" ? "keepExisting" : suggested.applicability?.value ?? "pending");
  const planAction = dateAction(plan), actualAction = dateAction(actual);
  const applicabilityAction: ApplicabilityApplyAction | null = applicability === "pending" ? null : applicability === "keepExisting" ? { kind: "keepExisting" } : { kind: "set", value: applicability as "applicable" | "notApplicable" };
  const input = target && planAction && actualAction && applicabilityAction ? { candidateId: candidate.id, target, plan: planAction, actual: actualAction, applicability: applicabilityAction } : null;
  const confirmed = candidate.status === "confirmed";
  const preview = input && !confirmed ? previewScheduleImportDecision(review.schedule, input, review.context) : null;
  const ready = preview?.ok && preview.value.operationBlockingFindings.length === 0;
  return <>
    <h4 className="font-medium">套用方式</h4>
    <fieldset disabled={confirmed} className="space-y-2">
      <label>適用性處理方式 <select className={control} value={applicability} onChange={event => setApplicability(event.target.value)}><option value="pending">請明確選擇</option>{before !== null && <option value="keepExisting">保留目前值</option>}<option value="applicable">適用</option><option value="notApplicable">N/A</option></select></label>
      <ImportDateAction label="計畫" existing={before !== null} value={plan} onChange={setPlan} />
      <ImportDateAction label="實際" existing={before !== null} value={actual} onChange={setActual} />
    </fieldset>
    <h4 className="font-medium">套用預覽</h4>
    {confirmed ? <p>本筆已確認，請參閱下方審核決策與最終發布結果。</p> : <><p>目前值： {occurrenceText(before)}</p><p>套用後： {preview?.ok && preview.value.afterOccurrence ? occurrenceText(preview.value.afterOccurrence) : "請完成有效選擇"}</p></>}
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded border border-rose-200 p-3"><h4 className="font-medium">本筆阻擋</h4>{confirmed ? <p>已確認</p> : !input ? <p>請選擇合法目標，並確認日期與適用性。</p> : preview?.ok ? <Findings issues={preview.value.operationBlockingFindings} /> : <p>{preview && scheduleReviewFailureMessage(preview.code, "zh")}</p>}</div>
      <div className="rounded border border-amber-200 p-3"><h4 className="font-medium">發布前仍待處理</h4><Findings issues={preview?.ok ? preview.value.remainingPublishBlockingFindings : collectSchedulePublishBlockingFindings(review.schedule, review.context)} /></div>
    </div>
    <button className={control} type="button" disabled={!ready || confirmed} onClick={() => { if (input && ready && !confirmed) review.onConfirmImport(input); }}>{confirmed ? "已確認" : "確認"}</button>
  </>;
}
function CandidateCard({ review, candidate, index }: { review: ScheduleReviewBindings; candidate: ScheduleImportCandidate; index: number }) {
  const evidence = review.schedule.evidenceLedger.find(item => item.id === candidate.evidenceId);
  const options = targetOptions(review, candidate);
  const [selected, setSelected] = React.useState(options[0]?.value ?? "");
  const target = options.find(option => option.value === selected)?.target ?? null;
  const retired = candidate.sourceDefinitionId !== undefined && review.context.governance.definitionsForHistoricalResolution.some(definition => definition.id === candidate.sourceDefinitionId) && !review.context.governance.addablePublicDefinitions.some(definition => definition.id === candidate.sourceDefinitionId);
  const names = allDefinitions(review);
  const confirmedDecision = review.schedule.reviewDecisions.find(decision => "candidateId" in decision && decision.candidateId === candidate.id);
  const confirmedDefinition = confirmedDecision && "targetDefinitionId" in confirmedDecision
    ? names.find(definition => definition.id === confirmedDecision.targetDefinitionId) : null;
  if (!evidence) return <article className={panel}><p>來源證據無法使用，請重新檢查資料。</p></article>;
  const raw = evidence.rawValues;
  const sourceStage = raw.stage.presence === "present" ? raw.stage.raw : null;
  const sourceType = raw.milestoneType.presence === "present" ? raw.milestoneType.raw : null;
  return <article className={panel} aria-label={`匯入項目 ${index + 1}`}>
    <h3 className="font-semibold">項目 {index + 1}: {rawText(raw.milestoneName)}</h3>
    {retired && <p className="text-amber-800">{options.length ? "已停用｜僅能更新既有合法引用" : "已停用｜此專案無合法引用，無法新增"}</p>}
    <div className="grid gap-3 md:grid-cols-2">
      <div><h4 className="font-medium">原始資料</h4><p>名稱： {rawText(raw.milestoneName)}</p><p>來源階段： {sourceStage !== null && review.context.governance.stageGroupsForHistoricalResolution.some(item => item.id === sourceStage) ? stageName(sourceStage, review) : rawText(raw.stage)}</p><p>來源類型： {sourceType !== null && review.context.governance.milestoneTypesForHistoricalResolution.some(item => item.id === sourceType) ? typeName(sourceType, review) : rawText(raw.milestoneType)}</p><p>計畫： {rawText(raw.plan)}</p><p>實際： {rawText(raw.actual)}</p><p>適用性： {rawText(raw.applicability)}</p></div>
      <div><h4 className="font-medium">系統解析</h4><p>建議對象： {candidate.proposedDefinitionMatches.map(id => names.find(item => item.id === id)).map(definition => definition ? definitionLabel(definition, review) : "無法辨識的目標").join(", ") || "請手動選擇"}</p><p>計畫： {parsedDateText(candidate.parsedPlan)}</p><p>實際： {parsedDateText(candidate.parsedActual)}</p><p>適用性： {candidate.parsedApplicability.kind === "explicitApplicable" ? "適用" : candidate.parsedApplicability.kind === "explicitNotApplicable" ? "N/A" : candidate.parsedApplicability.kind === "missing" ? "缺少欄位" : candidate.parsedApplicability.kind === "blank" ? "空白" : "未知"}</p><p>原始檢查結果（保留）：</p><Findings issues={candidate.rawFindings} /></div>
    </div>
    <h4 className="font-medium">套用目標</h4>
    {candidate.status === "confirmed" ? <p>已套用至： {confirmedDefinition ? definitionLabel(confirmedDefinition, review) : "請參閱審核紀錄"}</p> : <select className={control} aria-label="套用目標" value={options.some(option => option.value === selected) ? selected : ""} onChange={event => setSelected(event.target.value)}><option value="">選擇合法目標</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}
    <CandidateDecision key={selected} review={review} candidate={candidate} target={target} />
  </article>;
}
export function ScheduleImportReviewPanel({ review }: { review: ScheduleReviewBindings }) {
  const candidates = review.schedule.workingDraft?.importCandidates ?? [];
  if (candidates.length === 0) return null;
  const pending = candidates.filter(candidate => candidate.status === "pending").length;
  return <section className={panel} aria-label="匯入審核"><h2 className="text-lg font-semibold">匯入審核</h2><p className="text-sm text-slate-600">{governanceSimulationDisclosure}</p><p>{pending ? `待處理：${pending} 筆匯入項目，完成後才能發布。` : "所有匯入項目均已確認，發布前請檢查完整草稿。"}</p>{candidates.map((candidate, index) => <CandidateCard key={candidate.id} review={review} candidate={candidate} index={index} />)}</section>;
}
function decisionDate(action: DateApplyAction) { return action.kind === "set" ? action.value : action.kind === "clear" ? "清除日期" : "保留審核時的值"; }
export function ScheduleReviewHistory({ review }: { review: ScheduleReviewBindings }) {
  const traces = review.schedule.reviewSessions.flatMap(session => selectScheduleReviewTrace(review.schedule, session.id));
  if (!traces.length) return null;
  const definitions = allDefinitions(review);
  const name = (id: MilestoneDefinitionId) => {
    const definition = definitions.find(definition => definition.id === id);
    return definition ? milestoneDefinitionDisplayName(definition) : "無法辨識的里程碑";
  };
  return <section className={panel} aria-label="審核紀錄"><h2 className="text-lg font-semibold">審核紀錄</h2>{traces.map(({ decision, closure, finalOccurrence, retention }, index) => <div className="rounded border border-slate-200 bg-white p-3" key={decision.id}>
    <p>項目 {index + 1}</p><h3 className="font-medium">審核時的決策</h3>
    {"dateActions" in decision ? <p>{name(decision.targetDefinitionId)} | 計畫 {decisionDate(decision.dateActions.plan)} | 實際 {decisionDate(decision.dateActions.actual)} | {decision.applicabilityAction.kind === "keepExisting" ? "保留審核時的適用性" : decision.applicabilityAction.value === "applicable" ? "適用" : "N/A"}</p> : <p>{name(decision.fromLocalDefinitionId)} → {name(decision.toPublicDefinitionId)} (已確認四項相同條件)</p>}
    <h3 className="font-medium">最終發布結果</h3>
    {closure?.kind === "published" && <p>已發布版本 v{String(closure.versionNumber).padStart(2, "0")}</p>}
    <p>{retention === "unpublished" ? "尚未發布" : retention === "discarded" ? "已捨棄，未發布" : retention === "not-retained" ? "最終發布版本未保留此列" : finalOccurrence ? `${name(finalOccurrence.milestoneDefinitionId)} | ${occurrenceText(finalOccurrence)}` : "最終發布版本未保留此列"}</p>
  </div>)}</section>;
}
