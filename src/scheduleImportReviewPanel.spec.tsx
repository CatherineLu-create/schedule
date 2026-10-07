import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./main";
import { prototypeReducer } from "./application/state/prototypeReducer";
import { createEmptyCanonicalProjectSchedule, type CanonicalProjectSchedule } from "./domain/schedule/officialSchedule";
import { devProject001 } from "./fixtures/v2/canonicalProjectFixtures";
import { devSchedule001 } from "./fixtures/v2/canonicalScheduleFixtures";
import { stageGroupCatalog } from "./config/v2/referenceData";
import { parseDateOnly } from "./domain/shared/dateOnly";
import { startScheduleWorkingDraft } from "./application/commands/canonicalScheduleCommands";
import { initialScheduleCommandContext, initialGovernanceContext } from "./test/governanceTestUtils";
import { toCanonicalScheduleWorkingDraftId } from "./domain/shared/ids";

vi.mock("./application/state/prototypeReducer", async (original) => {
  const actual = await original<typeof import("./application/state/prototypeReducer")>();
  return { ...actual, prototypeReducer: vi.fn(actual.prototypeReducer) };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

function open(schedule = createEmptyCanonicalProjectSchedule(devProject001.id)) {
  let sequence = 0;
  const uuid = vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => `11111111-1111-4111-8111-${String(++sequence).padStart(12, "0")}`);
  render(<App initialState={{ projects: [devProject001], schedules: [schedule] }} initialSelectedProjectId={devProject001.id} referenceDate={parseDateOnly("2026-10-01")!} />);
  return { uuid, original: structuredClone(schedule) };
}
function latest(original: CanonicalProjectSchedule): CanonicalProjectSchedule {
  const actions = vi.mocked(prototypeReducer).mock.calls.map(([, action]) => action).filter(action => action.type === "scheduleReplaced");
  return actions.length ? actions[actions.length - 1].schedule : original;
}
function openTools() {
  if (screen.queryByLabelText("工具操作專案")) return;
  fireEvent.click(screen.getByRole("button", { name: "Governance" }));
  fireEvent.click(screen.getByText("進階治理與試用工具"));
}
function returnToPM() {
  if (screen.queryByLabelText("工具操作專案")) {
    fireEvent.click(screen.getByRole("button", { name: "回到 Dashboard" }));
    fireEvent.click(screen.getByRole("button", { name: /^Open Project/ }));
  }
}
function selectPack(pack = "fixable-validation") {
  openTools();
  fireEvent.change(screen.getByLabelText("模擬情境"), { target: { value: pack } });
  fireEvent.click(screen.getByRole("button", { name: "載入模擬匯入資料" }));
}
function load(pack = "fixable-validation") {
  selectPack(pack);
  const confirm = screen.queryByRole("button", { name: "建立草稿並載入" });
  if (confirm) fireEvent.click(confirm);
}
function candidates() { return within(screen.getByRole("region", { name: "匯入審核" })).getAllByRole("article"); }
function createLocal() {
  returnToPM();
  fireEvent.change(screen.getByLabelText("Milestone definition"), { target: { value: "create-project-local" } });
  fireEvent.change(screen.getByLabelText("Milestone Name"), { target: { value: "本案驗收關卡" } });
  fireEvent.change(screen.getByLabelText("Stage", { exact: true }), { target: { value: stageGroupCatalog[0].id } });
  fireEvent.change(screen.getByLabelText("Type (optional)", { exact: true }), { target: { value: "type-test" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Project-specific Milestone" }));
}

describe("GOV10 real Schedule App review", () => {
  it("shows SSL/GL in reused mapping and review labels while retaining the canonical definition identity", () => {
    const { original } = open();
    const canonical = initialGovernanceContext().definitionsForHistoricalResolution.find(definition => definition.id === "milestone-ramp-fcs")!;
    const snapshot = structuredClone(canonical);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    createLocal(); fireEvent.click(screen.getByRole("button", { name: "Add Milestone" }));
    openTools();
    fireEvent.click(screen.getByRole("button", { name: "對應公版里程碑" }));
    const dialog = within(screen.getByRole("dialog", { name: "對應公版里程碑" }));
    const option = within(dialog.getByLabelText("公版里程碑")).getAllByRole("option").find(item => item.getAttribute("value") === "milestone-ramp-fcs")!;
    expect(option).toHaveTextContent("SSL/GL | RAMP-stage / FCS");
    fireEvent.change(dialog.getByLabelText("公版里程碑"), { target: { value: "milestone-ramp-fcs" } });
    dialog.getAllByRole("checkbox").forEach(box => fireEvent.click(box));
    fireEvent.click(dialog.getByRole("button", { name: "確認對應" }));
    expect(screen.getByRole("region", { name: "審核紀錄" })).toHaveTextContent("本案驗收關卡 → SSL/GL");
    expect(latest(original).workingDraft!.milestones[0].milestoneDefinitionId).toBe("milestone-ramp-fcs");
    expect(initialGovernanceContext().definitionsForHistoricalResolution.find(definition => definition.id === canonical.id)).toEqual(snapshot);
  });
  it("UX05 English local creation defaults to No Type and requires explicit Add Milestone", () => {
    const { original } = open();
    expect(screen.queryByText(/Simulated import data/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(within(screen.getByLabelText("Milestone definition")).getAllByRole("option").at(-1)).toHaveTextContent("+ Add Project-specific Milestone…");
    fireEvent.change(screen.getByLabelText("Milestone definition"), { target: { value: "create-project-local" } });
    fireEvent.change(screen.getByLabelText("Milestone Name"), { target: { value: "Untyped acceptance" } });
    fireEvent.change(screen.getByLabelText("Stage", { exact: true }), { target: { value: "stage-design" } });
    expect(within(screen.getByLabelText("Type (optional)")).getAllByRole("option").map(option => option.textContent)).toEqual(["No Type", "G/O", "SMT", "Pre-Build", "Close", "Test", "Certification", "Preparation"]);
    fireEvent.click(screen.getByRole("button", { name: "Create Project-specific Milestone" }));
    expect(latest(original).localDefinitions[0].milestoneTypeId).toBeNull();
    expect(latest(original).workingDraft!.milestones).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Add Milestone" }));
    expect(latest(original).workingDraft!.milestones).toHaveLength(1);
    expect(screen.getByText("Project-specific", { exact: true })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Add Stage|Add Type|新增階段|新增類型/ })).not.toBeInTheDocument();
  });
  it("creates a classified project-local definition without an occurrence, selects it, then uses explicit Add", () => {
    const { original } = open();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const options = within(screen.getByLabelText("Milestone definition")).getAllByRole("option");
    expect(options.at(-1)).toHaveTextContent("+ Add Project-specific Milestone…");
    createLocal();
    const created = latest(original);
    expect(created.localDefinitions).toHaveLength(1);
    expect(created.workingDraft?.milestones).toEqual([]);
    expect(screen.getByLabelText("Milestone definition")).toHaveValue(created.localDefinitions[0].id);
    fireEvent.click(screen.getByRole("button", { name: "Add Milestone" }));
    expect(latest(original).workingDraft?.milestones).toHaveLength(1);
    expect(screen.getByText("Project-specific", { exact: true })).toBeVisible();
    expect(screen.queryByRole("button", { name: /申請公版|發布公版/ })).not.toBeInTheDocument();
  });
  it("offers only catalog Stage and Type values in the local editor", () => {
    open(); fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Milestone definition"), { target: { value: "create-project-local" } });
    const context = initialGovernanceContext();
    for (const [label, catalog] of [["Stage", context.selectableStageGroups], ["Type (optional)", context.selectableMilestoneTypes]] as const) {
      const values = within(screen.getByLabelText(label, { exact: true })).getAllByRole("option").map(option => (option as HTMLOptionElement).value).filter(Boolean);
      expect(values).toEqual(catalog.map(item => item.id));
    }
    expect(screen.getByText(/Type is optional/)).toBeVisible();
  });
  it("does not expose internal occurrence or Project IDs in readable text or accessible labels", () => {
    open(); load();
    fireEvent.click(within(candidates()[0]).getByRole("button", { name: "確認" }));
    const schedule = screen.getByRole("region", { name: "匯入審核" });
    expect(schedule.textContent).not.toMatch(/11111111|dev-project-001|review-preview/);
    for (const element of schedule.querySelectorAll("[aria-label]")) expect(element.getAttribute("aria-label")).not.toMatch(/11111111|dev-project-001|review-preview/);
  });
  it("basic-success confirms public/local/N-A candidates without an impossible retired row", () => {
    const { original } = open(); fireEvent.click(screen.getByRole("button", { name: "Edit" })); createLocal(); load("basic-success");
    expect(screen.queryByText(/已停用｜/)).not.toBeInTheDocument();
    candidates().forEach(card => fireEvent.click(within(card).getByRole("button", { name: "確認" })));
    expect(latest(original).workingDraft?.milestones.map(row => [row.applicability, row.plan, row.actual])).toEqual([
      ["applicable", "2026-10-15", null], ["applicable", "2026-10-16", null], ["notApplicable", null, null],
    ]);
    expect(screen.getByRole("button", { name: "發布此專案草稿" })).toBeEnabled();
  });
  it("negative retired evidence stays pending after legal date correction and offers no local bypass", () => {
    const { original } = open(); fireEvent.click(screen.getByRole("button", { name: "Edit" })); createLocal(); load("retired-no-reference-negative");
    const card = within(candidates()[0]);
    expect(card.getByText("已停用｜此專案無合法引用，無法新增")).toBeVisible();
    expect(screen.getByText(/只修正日期仍不可發布/)).toBeVisible();
    expect(within(card.getByLabelText("套用目標")).getAllByRole("option")).toHaveLength(1);
    fireEvent.change(card.getByLabelText("計畫處理方式"), { target: { value: "set" } });
    fireEvent.change(card.getByLabelText("計畫日期"), { target: { value: "2026-11-10" } });
    expect(card.getByRole("button", { name: "確認" })).toBeDisabled();
    expect(latest(original).workingDraft?.importCandidates[0].status).toBe("pending");
    expect(latest(original).workingDraft?.milestones).toEqual([]);
  });
  it("changing the public mapping target clears the four pair-specific assertions", () => {
    open(); fireEvent.click(screen.getByRole("button", { name: "Edit" })); createLocal(); fireEvent.click(screen.getByRole("button", { name: "Add Milestone" }));
    openTools();
    fireEvent.click(screen.getByRole("button", { name: "對應公版里程碑" }));
    const dialog = within(screen.getByRole("dialog", { name: "對應公版里程碑" }));
    fireEvent.change(dialog.getByLabelText("公版里程碑"), { target: { value: "milestone-design-kickoff" } });
    dialog.getAllByRole("checkbox").forEach(box => fireEvent.click(box));
    expect(dialog.getByRole("button", { name: "確認對應" })).toBeEnabled();
    fireEvent.change(dialog.getByLabelText("公版里程碑"), { target: { value: "milestone-design-id-fix" } });
    dialog.getAllByRole("checkbox").forEach(box => expect(box).not.toBeChecked());
    expect(dialog.getByRole("button", { name: "確認對應" })).toBeDisabled();
  });
  it("App mapping ID collisions leave the row and root history unchanged with human feedback", () => {
    const { original, uuid } = open(); fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const map = (target: string) => {
      openTools();
    fireEvent.click(screen.getByRole("button", { name: "對應公版里程碑" }));
      const dialog = within(screen.getByRole("dialog", { name: "對應公版里程碑" }));
      fireEvent.change(dialog.getByLabelText("公版里程碑"), { target: { value: target } });
      dialog.getAllByRole("checkbox").forEach(box => fireEvent.click(box));
      fireEvent.click(dialog.getByRole("button", { name: "確認對應" }));
    };
    createLocal(); fireEvent.click(screen.getByRole("button", { name: "Add Milestone" })); map("milestone-design-kickoff");
    createLocal(); fireEvent.click(screen.getByRole("button", { name: "Add Milestone" }));
    const before = structuredClone(latest(original));
    uuid.mockReturnValue(before.reviewSessions[0].id as ReturnType<Crypto["randomUUID"]>);
    map("milestone-design-id-fix");
    expect(latest(original)).toEqual(before);
    expect(screen.getByText("識別資料衝突，未套用任何變更，請重試。")).toBeVisible();
    expect(screen.getByRole("dialog", { name: "對應公版里程碑" })).toBeVisible();
  });
  it.each([false, true])("cancels NoDraft loading with zero IDs and no Schedule mutation (published=%s)", published => {
    const { original, uuid } = open(published ? { ...devSchedule001, workingDraft: null } : undefined); selectPack();
    expect(screen.getByRole("dialog", { name: "建立草稿並載入模擬資料" })).toHaveTextContent(published ? "僅複製目前已發布排程" : "空白 Working Draft");
    expect(uuid).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(uuid).not.toHaveBeenCalled(); expect(latest(original)).toEqual(original);
    expect(screen.queryByText("Working Draft", { exact: true })).not.toBeInTheDocument();
  });
  it.each([false, true])("loads only candidates into the empty or exact cloned draft (published=%s)", published => {
    const { original } = open(published ? { ...devSchedule001, workingDraft: null } : undefined);
    load();
    const result = latest(original);
    expect(vi.mocked(prototypeReducer).mock.calls.filter(([, action]) => action.type === "scheduleReplaced")).toHaveLength(1);
    const current = [...original.publishedVersions].sort((left, right) => right.versionNumber - left.versionNumber)[0];
    expect(result.workingDraft?.milestones).toEqual(current?.milestones ?? []);
    expect(result.workingDraft?.importCandidates).toHaveLength(3);
    expect(result.publishedVersions).toEqual(original.publishedVersions);
    expect(screen.getAllByText("模擬匯入資料｜供 PIP 流程驗收，非 Kevin 正式 JSON 格式")).toHaveLength(2);
    expect(document.querySelector('input[type="file"],textarea')).toBeNull();
    expect(within(screen.getByLabelText("模擬情境")).getAllByRole("option")).toHaveLength(4);
  });
  it("preserves an existing Draft and repeated loads are a human-readable no-op", () => {
    const started = startScheduleWorkingDraft({ ...devSchedule001, workingDraft: null }, { workingDraftId: toCanonicalScheduleWorkingDraftId("existing-draft") }, initialScheduleCommandContext());
    if (!started.ok) throw new Error("fixture");
    const { original } = open(started.schedule);
    fireEvent.input(screen.getByLabelText(/^Plan for Kickoff /), { target: { value: "2027-01-20" } });
    fireEvent.click(screen.getByRole("button", { name: /^Apply Date to Plan for Kickoff / }));
    const editedRows = latest(original).workingDraft!.milestones;
    load();
    const first = latest(original); load();
    expect(latest(original)).toEqual(first);
    expect(first.workingDraft?.milestones).toEqual(editedRows);
    expect(first.workingDraft?.workingDraftId).toBe("existing-draft");
    expect(screen.getByText("此模擬情境已載入，未重複加入。")).toBeVisible();
  });
  it("retains the human applied target after confirmation and appends another scenario without resetting decisions", () => {
    const { original } = open(); load();
    fireEvent.click(within(candidates()[0]).getByRole("button", { name: "確認" }));
    expect(within(candidates()[0]).getByText(/已套用至： Kickoff/)).toBeVisible();
    const confirmed = latest(original); load("retired-no-reference-negative");
    const appended = latest(original);
    expect(appended.reviewDecisions).toEqual(confirmed.reviewDecisions);
    expect(appended.reviewSessions.slice(0, 1)).toEqual(confirmed.reviewSessions);
    expect(appended.workingDraft?.milestones).toEqual(confirmed.workingDraft?.milestones);
    expect(appended.workingDraft?.workingDraftId).toBe(confirmed.workingDraft?.workingDraftId);
    expect(appended.workingDraft?.importCandidates).toHaveLength(4);
  });
  it("requires an explicit local for basic success and never leaves a partial Draft on prerequisite failure", () => {
    const { original } = open(); load("basic-success");
    expect(latest(original)).toEqual(original);
    expect(screen.getByText(/基本成功流程需要此專案已有確認的本案自訂里程碑/)).toBeVisible();
    expect(screen.queryByLabelText("Milestone Name")).not.toBeInTheDocument();
  });
  it("shows the exact retired prerequisite without inventing an occurrence", () => {
    const { original } = open(); load("retired-existing-update");
    expect(screen.getByText("此專案沒有可合法引用的既有停用里程碑。")).toBeVisible();
    expect(latest(original)).toEqual(original);
  });
  it("confirms A and B independently of C, requires explicit ambiguous correction, and preserves raw evidence", () => {
    const { original } = open(); load();
    const loaded = latest(original);
    const [a, b, c] = candidates();
    for (const label of ["原始資料", "系統解析", "套用目標", "套用方式", "套用預覽", "本筆阻擋", "發布前仍待處理"]) expect(within(a).getByText(label, { exact: true })).toBeVisible();
    expect(within(a).getByRole("button", { name: "確認" })).toBeEnabled();
    expect(within(c).getByRole("button", { name: "確認" })).toBeDisabled();
    fireEvent.click(within(a).getByRole("button", { name: "確認" }));
    expect(latest(original).workingDraft?.importCandidates[1]).toEqual(loaded.workingDraft?.importCandidates[1]);
    expect(latest(original).workingDraft?.importCandidates[2]).toEqual(loaded.workingDraft?.importCandidates[2]);
    fireEvent.click(within(b).getByRole("button", { name: "確認" }));
    expect(screen.getByText("待處理：1 筆匯入項目，完成後才能發布。")).toBeVisible();
    expect(screen.getByRole("button", { name: "發布此專案草稿" })).toBeDisabled();
    fireEvent.change(within(c).getByLabelText("計畫處理方式"), { target: { value: "set" } });
    fireEvent.change(within(c).getByLabelText("計畫日期"), { target: { value: "2026-11-10" } });
    fireEvent.click(within(c).getByRole("button", { name: "確認" }));
    expect(latest(original).workingDraft?.milestones.map(row => row.plan)).toEqual(["2026-10-15", "2026-10-16", "2026-11-10"]);
    expect(latest(original).workingDraft?.milestones.every(row => row.milestoneId.startsWith("11111111-1111-4111-8111-"))).toBe(true);
    expect(latest(original).evidenceLedger).toEqual(loaded.evidenceLedger);
    expect(within(c).getAllByText(/10\/11\/2026/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "發布此專案草稿" })).toBeEnabled();
    expect(latest(original).publishedVersions).toEqual([]);
  });
  it("maps a manual local with four explicit assertions, no simulation, and preserves row identity and dates", () => {
    const { original } = open(); fireEvent.click(screen.getByRole("button", { name: "Edit" })); createLocal();
    fireEvent.click(screen.getByRole("button", { name: "Add Milestone" }));
    const before = latest(original);
    openTools();
    fireEvent.click(screen.getByRole("button", { name: "對應公版里程碑" }));
    const mapping = within(screen.getByRole("dialog", { name: "對應公版里程碑" }));
    const checks = mapping.getAllByRole("checkbox");
    expect(checks).toHaveLength(4); checks.forEach(check => expect(check).not.toBeChecked());
    fireEvent.change(mapping.getByLabelText("公版里程碑"), { target: { value: "milestone-design-kickoff" } });
    checks.slice(0, 3).forEach(check => fireEvent.click(check));
    expect(mapping.getByRole("button", { name: "確認對應" })).toBeDisabled();
    fireEvent.click(checks[3]); fireEvent.click(mapping.getByRole("button", { name: "確認對應" }));
    const after = latest(original);
    expect(after.workingDraft?.milestones[0]).toEqual({ ...before.workingDraft!.milestones[0], milestoneDefinitionId: "milestone-design-kickoff" });
    expect(after.localDefinitions).toEqual(before.localDefinitions);
    expect(after.evidenceLedger).toEqual([]);
    expect(after.reviewSessions[0]).toMatchObject({ source: "manual-local-mapping", evidenceIds: [] });
    expect(after.reviewDecisions[0]).toMatchObject({ assertion: { workContent: true, stage: true, type: true, completionCriteria: true } });
  });
  it.each(["published", "removed", "discarded"] as const)("keeps decision history separate from %s final outcome", outcome => {
    const { original } = open(); load();
    const [a, b, c] = candidates();
    fireEvent.click(within(a).getByRole("button", { name: "確認" }));
    fireEvent.click(within(b).getByRole("button", { name: "確認" }));
    fireEvent.change(within(c).getByLabelText("計畫處理方式"), { target: { value: "set" } });
    fireEvent.change(within(c).getByLabelText("計畫日期"), { target: { value: "2026-11-10" } });
    fireEvent.click(within(c).getByRole("button", { name: "確認" }));
    returnToPM();
    const schedule = within(screen.getByRole("region", { name: "Schedule" }));
    if (outcome === "published") {
      const date = schedule.getByLabelText(/^Plan for Kickoff /);
      fireEvent.input(date, { target: { value: "2026-10-20" } });
      fireEvent.click(schedule.getByRole("button", { name: /^Apply Date to Plan for Kickoff / }));
    } else if (outcome === "removed") fireEvent.click(schedule.getByRole("button", { name: "Remove Kickoff" }));
    if (outcome === "discarded") {
      fireEvent.click(schedule.getByRole("button", { name: "Discard Draft" }));
      fireEvent.click(within(screen.getByRole("dialog", { name: "Discard Working Draft" })).getByRole("button", { name: "Discard Draft" }));
    } else {
      fireEvent.click(schedule.getByRole("button", { name: "Publish" }));
      fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" })).getByRole("button", { name: "Publish" }));
    }
    expect(screen.queryByRole("region", { name: "審核紀錄" })).not.toBeInTheDocument();
    openTools();
    const history = within(screen.getByRole("region", { name: "審核紀錄" }));
    expect(history.getAllByText(/計畫 2026-10-15/)).toHaveLength(1);
    if (outcome === "published") {
      expect(history.getByText(/計畫 2026-10-20/)).toBeVisible();
      expect(latest(original).publishedVersions[0].milestones[0].plan).toBe("2026-10-20");
    } else expect(history.getAllByText(outcome === "removed" ? "最終發布版本未保留此列" : "已捨棄，未發布").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "審核紀錄" }).textContent).not.toMatch(/11111111|review-preview|milestone-design/);
  });
});
