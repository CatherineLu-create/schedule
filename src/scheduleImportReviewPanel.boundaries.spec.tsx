import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ScheduleImportReviewPanel, LocalOccurrenceMapping, type ScheduleReviewBindings } from "./scheduleImportReviewPanel";
import { cancelScheduleWorkingDraft, startScheduleWorkingDraft, type CanonicalScheduleCommandContext } from "./application/commands/canonicalScheduleCommands";
import { confirmScheduleImportDecision, loadBuiltInScheduleSimulation, mapDraftLocalOccurrenceToPublic, confirmProjectLocalMilestoneDefinition } from "./application/commands/scheduleReviewCommands";
import { createEmptyCanonicalProjectSchedule, type CanonicalProjectSchedule } from "./domain/schedule/officialSchedule";
import { createScheduleImportCandidate, type RawImportCell, type ScheduleEvidenceRecord } from "./domain/schedule/scheduleReview";
import { devProject001 } from "./fixtures/v2/canonicalProjectFixtures";
import { initialScheduleCommandContext, publishedRetirementFixture } from "./test/governanceTestUtils";
import { selectEffectiveMilestoneGovernanceContext, selectEffectiveRetiredDraftOccurrenceGrants } from "./application/governance/effectiveMilestoneGovernanceContext";
import { toCanonicalScheduleWorkingDraftId, toMilestoneDefinitionId, toMilestoneId, toMilestoneTypeId, toScheduleEvidenceId, toScheduleImportCandidateId, toScheduleReviewDecisionId, toScheduleReviewSessionId, toStageGroupId } from "./domain/shared/ids";
import { parseDateOnly } from "./domain/shared/dateOnly";
import { toScheduleVersionNumber } from "./domain/schedule/schedule";

afterEach(cleanup);
function value<T>(result: { ok: true; value: T } | { ok: false }): T { if (!result.ok) throw new Error("Test fixture command failed"); return result.value; }
function fixture(plan: RawImportCell, actual: RawImportCell, existing: boolean) {
  const context = initialScheduleCommandContext();
  const definition = context.governance.addablePublicDefinitions[0];
  const evidence: ScheduleEvidenceRecord = { id: toScheduleEvidenceId("boundary-evidence"), sourceKind: "future-external-adapter", sourceDescriptor: "typed test evidence", candidateFingerprint: "boundary-candidate", rawValues: {
    milestoneName: { presence: "present", raw: definition.name }, stage: { presence: "present", raw: definition.stageGroupId }, milestoneType: definition.milestoneTypeId === null ? { presence: "missing" } : { presence: "present", raw: definition.milestoneTypeId },
    plan, actual, applicability: { presence: "present", raw: "Applicable" },
  } };
  const candidate = createScheduleImportCandidate(evidence, toScheduleImportCandidateId("boundary-candidate"), definition.id);
  const workingDraftId = toCanonicalScheduleWorkingDraftId("boundary-draft"), sessionId = toScheduleReviewSessionId("boundary-session");
  const schedule: CanonicalProjectSchedule = { ...createEmptyCanonicalProjectSchedule(devProject001.id),
    workingDraft: { workingDraftId, importCandidates: [candidate], reviewSessionIds: [sessionId], milestones: existing ? [{ milestoneId: toMilestoneId("boundary-row"), milestoneDefinitionId: definition.id, applicability: "applicable", plan: parseDateOnly("2026-09-10"), actual: parseDateOnly("2026-09-11") }] : [] },
    evidenceLedger: [evidence], reviewSessions: [{ id: sessionId, source: "future-external-adapter", workingDraftId, evidenceIds: [evidence.id], candidateIds: [candidate.id] }],
  };
  return { schedule, context };
}
function show(initial: CanonicalProjectSchedule, initialContext: CanonicalScheduleCommandContext, mapping = false) {
  let schedule = initial, context = initialContext, count = 0;
  const errors: string[] = [];
  const props = (): ScheduleReviewBindings => ({ schedule, context: { ...context, localDefinitions: schedule.localDefinitions },
    onCreateLocal: () => null, onLoadSimulation: () => {},
    onConfirmImport: input => {
      const result = confirmScheduleImportDecision(schedule, { ...input, decisionId: toScheduleReviewDecisionId(`boundary-decision-${++count}`) }, { ...context, localDefinitions: schedule.localDefinitions });
      if (result.ok) { schedule = result.value; refresh(); } else errors.push(result.code);
    },
    onMapLocal: input => {
      const result = mapDraftLocalOccurrenceToPublic(schedule, { ...input, sessionId: toScheduleReviewSessionId(`mapping-session-${++count}`), decisionId: toScheduleReviewDecisionId(`mapping-decision-${count}`) }, { ...context, localDefinitions: schedule.localDefinitions });
      if (result.ok) { schedule = result.value; refresh(); return true; } errors.push(result.code); return false;
    },
  });
  const view = () => mapping ? <LocalOccurrenceMapping review={props()} milestoneId={toMilestoneId("boundary-row")} /> : <ScheduleImportReviewPanel review={props()} />;
  const rendered = render(view());
  function refresh() { rendered.rerender(view()); }
  return { current: () => schedule, errors, replace: (next: CanonicalProjectSchedule, nextContext = context) => { schedule = next; context = nextContext; refresh(); } };
}
function loadRetired(schedule: CanonicalProjectSchedule, context: CanonicalScheduleCommandContext) {
  return value(loadBuiltInScheduleSimulation(schedule, { pack: "retired-existing-update", ids: { sessionId: toScheduleReviewSessionId("retired-session"), evidenceIds: [toScheduleEvidenceId("retired-evidence")], candidateIds: [toScheduleImportCandidateId("retired-candidate")] } }, context));
}

describe("GOV10 review action and exact target boundaries", () => {
  it.each([{ presence: "missing" } as const, { presence: "present", raw: "" } as const])("keeps existing dates for $presence and only clears Actual on explicit choice", raw => {
    const { schedule, context } = fixture(raw, raw, true);
    const harness = show(schedule, context);
    expect(screen.getByLabelText("計畫處理方式")).toHaveValue("keepExisting");
    expect(screen.getByLabelText("實際處理方式")).toHaveValue("keepExisting");
    fireEvent.change(screen.getByLabelText("實際處理方式"), { target: { value: "clear" } });
    fireEvent.click(screen.getByRole("button", { name: "確認" }));
    expect(harness.current().workingDraft?.milestones[0]).toMatchObject({ milestoneId: "boundary-row", plan: "2026-09-10", actual: null });
    expect(harness.current().evidenceLedger).toEqual(schedule.evidenceLedger);
  });
  it.each([{ presence: "missing" } as const, { presence: "present", raw: "" } as const])("new occurrence never offers keep for $presence and missing Plan stays blocked", raw => {
    const { schedule, context } = fixture(raw, raw, false); show(schedule, context);
    expect(screen.queryByRole("option", { name: "保留目前值" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("計畫處理方式")).toHaveValue("clear");
    expect(screen.getByLabelText("實際處理方式")).toHaveValue("clear");
    expect(screen.getByRole("button", { name: "確認" })).toBeDisabled();
  });
  it("distinguishes sentinel raw evidence and blocks N/A with dates until both dates are explicitly cleared", () => {
    const { schedule, context } = fixture({ presence: "present", raw: "-" }, { presence: "missing" }, true);
    const harness = show(schedule, context);
    expect(screen.getByText("計畫： 原始符號： -")).toBeVisible();
    expect(screen.getAllByText("實際： 缺少欄位", { selector: "p" })).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("適用性處理方式"), { target: { value: "notApplicable" } });
    fireEvent.change(screen.getByLabelText("計畫處理方式"), { target: { value: "clear" } });
    expect(screen.getByRole("button", { name: "確認" })).toBeDisabled();
    expect(screen.getAllByText("不適用的里程碑仍有日期，請清除計畫及實際日期。").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("實際處理方式"), { target: { value: "clear" } });
    fireEvent.click(screen.getByRole("button", { name: "確認" }));
    expect(harness.current().workingDraft?.milestones[0]).toMatchObject({ applicability: "notApplicable", plan: null, actual: null });
    expect(screen.getByText("計畫： 原始符號： -")).toBeVisible();
  });
  it("shows a changed source date against the existing date before confirming without retyping", () => {
    const { schedule, context } = fixture({ presence: "present", raw: "2026-10-15" }, { presence: "present", raw: "" }, true);
    const harness = show(schedule, context);
    expect(screen.getByText("目前值： 適用 | 計畫 2026-09-10 | 實際 2026-09-11")).toBeVisible();
    expect(screen.getByText("套用後： 適用 | 計畫 2026-10-15 | 實際 2026-09-11")).toBeVisible();
    expect(harness.current()).toEqual(schedule);
    fireEvent.click(screen.getByRole("button", { name: "確認" }));
    expect(harness.current().workingDraft?.milestones[0]).toMatchObject({ plan: "2026-10-15", actual: "2026-09-11" });
  });
  it("selects the exact retained historical row when two rows share one retired definition", () => {
    const retired = publishedRetirementFixture();
    const governance = value(selectEffectiveMilestoneGovernanceContext(retired.state));
    const context = { governance, localDefinitions: [], retiredDraftOccurrenceGrants: [] };
    const first = retired.schedule.workingDraft!.milestones[0], second = { ...first, milestoneId: toMilestoneId("retired-second"), plan: parseDateOnly("2026-09-01") };
    const published: CanonicalProjectSchedule = { ...createEmptyCanonicalProjectSchedule(devProject001.id), publishedVersions: [{ versionNumber: toScheduleVersionNumber(1), publishedAt: "2026-09-01T00:00:00Z", versionNote: null, milestones: [first, second] }] };
    const started = startScheduleWorkingDraft(published, { workingDraftId: toCanonicalScheduleWorkingDraftId("retired-clone") }, context);
    if (!started.ok) throw new Error("retained clone fixture");
    const loaded = loadRetired(started.schedule, context); const harness = show(loaded, context);
    expect(screen.getByText("已停用｜僅能更新既有合法引用")).toBeVisible();
    const options = within(screen.getByLabelText("套用目標")).getAllByRole("option");
    expect(options.slice(1).map(option => (option as HTMLOptionElement).value)).toEqual([first.milestoneId, "retired-second"]);
    expect(options[1].textContent).not.toBe(options[2].textContent);
    fireEvent.change(screen.getByLabelText("套用目標"), { target: { value: "retired-second" } });
    fireEvent.click(screen.getByRole("button", { name: "確認" }));
    expect(harness.current().workingDraft?.milestones).toEqual([first, { ...second, plan: "2026-10-15" }]);
  });
  it("removing a retired row or restarting the Draft never recreates the retired row or reuses its D1 grant", () => {
    const retired = publishedRetirementFixture();
    const governance = value(selectEffectiveMilestoneGovernanceContext(retired.state));
    const context = { governance, localDefinitions: [], retiredDraftOccurrenceGrants: value(selectEffectiveRetiredDraftOccurrenceGrants(retired.state)) };
    const loaded = loadRetired(retired.schedule, context); const harness = show(loaded, context);
    harness.replace({ ...loaded, workingDraft: { ...loaded.workingDraft!, milestones: [] } });
    expect(screen.getByText("已停用｜此專案無合法引用，無法新增")).toBeVisible();
    expect(screen.getByRole("button", { name: "確認" })).toBeDisabled();
    const cancelled = cancelScheduleWorkingDraft(loaded); if (!cancelled.ok) throw new Error("cancel fixture");
    const restarted = startScheduleWorkingDraft(cancelled.schedule, { workingDraftId: toCanonicalScheduleWorkingDraftId("new-retired-draft") }, context); if (!restarted.ok) throw new Error("restart fixture");
    // Even a stale external row carrying the old MilestoneId must not appear as a lawful target.
    harness.replace({ ...restarted.schedule, workingDraft: { ...loaded.workingDraft!, workingDraftId: restarted.schedule.workingDraft!.workingDraftId }, reviewSessions: loaded.reviewSessions.map(session => ({ ...session, workingDraftId: restarted.schedule.workingDraft!.workingDraftId })), reviewClosures: [] });
    expect(screen.getByText("已停用｜此專案無合法引用，無法新增")).toBeVisible();
    expect(screen.getByRole("button", { name: "確認" })).toBeDisabled();
    expect(harness.errors).toEqual([]);
  });
  it("mapping duplicate and stale targets are human-readable and leave the Schedule unchanged", () => {
    const f = fixture({ presence: "present", raw: "2026-10-15" }, { presence: "missing" }, true);
    const local = value(confirmProjectLocalMilestoneDefinition(f.schedule, { definitionId: toMilestoneDefinitionId("mapping-local"), name: "Local mapping", stageGroupId: toStageGroupId("stage-design"), milestoneTypeId: null, source: "manual", evidenceIds: [] }, f.context.governance));
    const row = { ...local.workingDraft!.milestones[0], milestoneDefinitionId: local.localDefinitions[0].id };
    const schedule = { ...local, workingDraft: { ...local.workingDraft!, milestones: [row, { ...row, milestoneId: toMilestoneId("duplicate-public-row"), milestoneDefinitionId: f.context.governance.addablePublicDefinitions[0].id }] } };
    const harness = show(schedule, f.context, true);
    fireEvent.click(screen.getByRole("button", { name: "對應公版里程碑" }));
    fireEvent.change(screen.getByLabelText("公版里程碑"), { target: { value: "milestone-design-kickoff" } });
    screen.getAllByRole("checkbox").forEach(box => fireEvent.click(box));
    expect(screen.getByRole("alert")).toHaveTextContent("此草稿已有相同公版里程碑");
    expect(screen.getByRole("button", { name: "確認對應" })).toBeDisabled(); expect(harness.current()).toEqual(schedule);
    fireEvent.change(screen.getByLabelText("公版里程碑"), { target: { value: "milestone-design-id-fix" } });
    screen.getAllByRole("checkbox").forEach(box => fireEvent.click(box));
    expect(screen.getByRole("button", { name: "確認對應" })).toBeEnabled();
    harness.replace(schedule, { ...f.context, governance: { ...f.context.governance, addablePublicDefinitions: f.context.governance.addablePublicDefinitions.filter(definition => definition.id !== "milestone-design-id-fix") } });
    expect(screen.getByRole("button", { name: "確認對應" })).toBeDisabled(); expect(harness.current()).toEqual(schedule);
    expect(screen.getByText(/目標目前不可新增/)).toBeVisible();
  });
});
