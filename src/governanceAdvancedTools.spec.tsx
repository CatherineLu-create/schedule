import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./main";
import { prototypeReducer } from "./application/state/prototypeReducer";
import { startScheduleWorkingDraft } from "./application/commands/canonicalScheduleCommands";
import { confirmProjectLocalMilestoneDefinition, loadBuiltInScheduleSimulation } from "./application/commands/scheduleReviewCommands";
import { createEmptyCanonicalProjectSchedule, type CanonicalProjectSchedule } from "./domain/schedule/officialSchedule";
import { devProject001 } from "./fixtures/v2/canonicalProjectFixtures";
import { initialScheduleCommandContext } from "./test/governanceTestUtils";
import { toCanonicalScheduleWorkingDraftId, toMilestoneDefinitionId, toMilestoneId, toProjectId, toScheduleEvidenceId, toScheduleImportCandidateId, toScheduleReviewSessionId, toStageGroupId } from "./domain/shared/ids";
import { parseDateOnly } from "./domain/shared/dateOnly";

vi.mock("./application/state/prototypeReducer", async original => {
  const actual = await original<typeof import("./application/state/prototypeReducer")>();
  return { ...actual, prototypeReducer: vi.fn(actual.prototypeReducer) };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });
const other = { ...devProject001, id: toProjectId("ux06-other-project"), master: { ...devProject001.master, basicInformation: { ...devProject001.master.basicInformation, stnProjectName: "Second actual Project", qciModelName: "UX06 Model" } } };
function draft(projectId = devProject001.id) {
  const result = startScheduleWorkingDraft(createEmptyCanonicalProjectSchedule(projectId), { workingDraftId: toCanonicalScheduleWorkingDraftId(`draft-${projectId}`) }, initialScheduleCommandContext());
  if (!result.ok) throw new Error("draft fixture");
  return result.schedule;
}
function localDraft(projectId = devProject001.id): CanonicalProjectSchedule {
  const result = confirmProjectLocalMilestoneDefinition(draft(projectId), { definitionId: toMilestoneDefinitionId(`local-${projectId}`), name: `Local ${projectId === other.id ? "Second" : "First"}`, stageGroupId: toStageGroupId("stage-design"), milestoneTypeId: null, source: "manual", evidenceIds: [] }, initialScheduleCommandContext().governance);
  if (!result.ok) throw new Error("local fixture");
  return { ...result.value, workingDraft: { ...result.value.workingDraft!, milestones: [{ milestoneId: toMilestoneId(`row-${projectId}`), milestoneDefinitionId: result.value.localDefinitions[0].id, applicability: "applicable", plan: parseDateOnly("2026-10-15"), actual: parseDateOnly("2026-10-16") }] } };
}
function pendingDraft() {
  const result = loadBuiltInScheduleSimulation(draft(), { pack: "fixable-validation", ids: { sessionId: toScheduleReviewSessionId("ux06-session"), evidenceIds: [1, 2, 3].map(n => toScheduleEvidenceId(`ux06-e-${n}`)), candidateIds: [1, 2, 3].map(n => toScheduleImportCandidateId(`ux06-c-${n}`)) } }, initialScheduleCommandContext());
  if (!result.ok) throw new Error("pending fixture");
  return result.value;
}
function mount(first = createEmptyCanonicalProjectSchedule(devProject001.id), second = createEmptyCanonicalProjectSchedule(other.id)) {
  let seq = 0;
  const uuid = vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => `99999999-9999-4999-8999-${String(++seq).padStart(12, "0")}`);
  render(<App initialState={{ projects: [devProject001, other], schedules: [first, second] }} initialSelectedProjectId={devProject001.id} />);
  return uuid;
}
function openAdvanced() {
  fireEvent.click(screen.getByRole("button", { name: "公版管理" }));
  fireEvent.click(screen.getByText("進階治理與試用工具"));
}
function selectOther() { fireEvent.change(screen.getByLabelText("工具操作專案"), { target: { value: other.id } }); }
function changes() { return vi.mocked(prototypeReducer).mock.calls.map(([, action]) => action).filter(action => action.type === "scheduleReplaced"); }

it("UX06 PM never exposes advanced tools even with pending imported candidates", () => {
  mount(pendingDraft());
  expect(screen.queryAllByText(/Simulated import data|模擬匯入資料/)).toHaveLength(0);
  expect(screen.queryByLabelText(/Scenario|模擬情境/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Load simulated|載入模擬/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: /Import Review|匯入審核/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Map to Public|對應公版/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByText(/Raw data|Parsed result|Review History|原始資料|系統解析|審核紀錄/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Discard Draft" })).toBeEnabled();
  expect(screen.getByLabelText("Publish blockers")).toHaveTextContent("unresolved");
  expect(screen.queryByText(/Governance|公版管理/, { selector: "p" })).not.toBeInTheDocument();
});

it("UX06 Governance starts collapsed and opening/selecting tools has no command or ID side effects", () => {
  const uuid = mount();
  fireEvent.click(screen.getByRole("button", { name: "公版管理" }));
  const summary = screen.getByText("進階治理與試用工具");
  expect(summary.closest("details")).not.toHaveAttribute("open");
  expect(screen.getByRole("button", { name: "載入模擬匯入資料" })).not.toBeVisible();
  fireEvent.click(summary);
  expect(screen.getByRole("heading", { name: "本案自訂里程碑對應" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "模擬匯入試用工具" })).toBeVisible();
  expect(screen.getByText("模擬匯入資料｜供 PIP 流程驗收，非 Kevin 正式 JSON 格式")).toBeVisible();
  expect(screen.getByText("真實 Kevin 匯入格式與操作流程將於取得正式資料後另行設計。")).toBeVisible();
  expect(within(screen.getByLabelText("工具操作專案")).getByRole("option", { name: /Second actual Project.*UX06 Model/ })).toBeInTheDocument();
  expect(screen.getByLabelText("工具操作專案").textContent).not.toMatch(/dev-project|ux06-other/);
  selectOther();
  expect(screen.getByText("此專案目前沒有 Working Draft，暫無可處理的本案自訂對應。")).toBeVisible();
  fireEvent.click(summary);
  expect(summary.closest("details")).not.toHaveAttribute("open");
  fireEvent.click(summary);
  expect(uuid).not.toHaveBeenCalled();
  expect(changes()).toEqual([]);
});

it("UX06 maps only the selected real Project and resets pair assertions across Projects", () => {
  const first = localDraft(), second = localDraft(other.id);
  mount(first, second); openAdvanced(); selectOther();
  expect(screen.queryByText(/Local First/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "對應公版里程碑" }));
  const mapping = within(screen.getByRole("dialog", { name: "對應公版里程碑" }));
  expect(mapping.getByText(/Local Second/)).toHaveTextContent("無類型");
  fireEvent.change(mapping.getByLabelText("公版里程碑"), { target: { value: "milestone-design-kickoff" } });
  mapping.getAllByRole("checkbox").forEach(box => { expect(box).not.toBeChecked(); fireEvent.click(box); });
  fireEvent.change(screen.getByLabelText("工具操作專案"), { target: { value: devProject001.id } });
  expect(screen.queryByRole("dialog", { name: "對應公版里程碑" })).not.toBeInTheDocument();
  selectOther(); fireEvent.click(screen.getByRole("button", { name: "對應公版里程碑" }));
  const reset = within(screen.getByRole("dialog", { name: "對應公版里程碑" }));
  expect(reset.getByLabelText("公版里程碑")).toHaveValue("");
  reset.getAllByRole("checkbox").forEach(box => expect(box).not.toBeChecked());
  fireEvent.change(reset.getByLabelText("公版里程碑"), { target: { value: "milestone-design-kickoff" } });
  reset.getAllByRole("checkbox").forEach(box => fireEvent.click(box));
  fireEvent.click(reset.getByRole("button", { name: "確認對應" }));
  const actions = changes();
  expect(actions).toHaveLength(1);
  expect(actions[0].projectId).toBe(other.id);
  expect(actions[0].schedule.workingDraft?.milestones).toEqual([{ ...second.workingDraft!.milestones[0], milestoneDefinitionId: "milestone-design-kickoff" }]);
  expect(actions[0].schedule.localDefinitions).toEqual(second.localDefinitions);
  expect(actions[0].schedule.evidenceLedger).toEqual([]);
  expect(screen.getByRole("region", { name: "審核紀錄" })).toHaveTextContent("尚未發布");
  expect(first).toEqual(localDraft());
});

it("UX06 Governance publishes only its selected real Draft and PM reads the resulting official version", () => {
  const first = localDraft(), second = localDraft(other.id);
  const before = structuredClone({ first, second });
  const uuid = mount(first, second); openAdvanced(); selectOther();
  fireEvent.click(screen.getByRole("button", { name: "發布此專案草稿" }));
  expect(changes()).toEqual([]);
  fireEvent.click(within(screen.getByRole("dialog", { name: "發布此專案 Working Draft" })).getByRole("button", { name: "確認發布" }));
  expect(changes()).toHaveLength(1);
  expect(changes()[0].projectId).toBe(other.id);
  expect(changes()[0].schedule.workingDraft).toBeNull();
  expect(changes()[0].schedule.publishedVersions[0].milestones).toEqual(second.workingDraft!.milestones);
  expect({ first, second }).toEqual(before);
  expect(uuid).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "回到 Dashboard" }));
  fireEvent.click(screen.getByRole("button", { name: "Open Project Second actual Project" }));
  expect(screen.getByRole("region", { name: "Current Schedule" })).toHaveTextContent("Local Second");
  expect(screen.getByText("Published v01")).toBeVisible();
  expect(screen.queryByRole("region", { name: "審核紀錄" })).not.toBeInTheDocument();
});

it("UX06 no-Draft consent never leaks across Projects and simulation/confirm/discard target the selected Schedule", () => {
  const uuid = mount(); openAdvanced();
  fireEvent.change(screen.getByLabelText("模擬情境"), { target: { value: "fixable-validation" } });
  fireEvent.click(screen.getByRole("button", { name: "載入模擬匯入資料" }));
  expect(screen.getByRole("dialog", { name: "建立草稿並載入模擬資料" })).toBeVisible();
  selectOther();
  expect(screen.queryByRole("dialog", { name: "建立草稿並載入模擬資料" })).not.toBeInTheDocument();
  expect(uuid).not.toHaveBeenCalled(); expect(changes()).toEqual([]);
  fireEvent.change(screen.getByLabelText("模擬情境"), { target: { value: "fixable-validation" } });
  fireEvent.click(screen.getByRole("button", { name: "載入模擬匯入資料" }));
  fireEvent.click(screen.getByRole("button", { name: "建立草稿並載入" }));
  const loaded = changes().at(-1)!;
  expect(loaded.projectId).toBe(other.id);
  expect(loaded.schedule.workingDraft?.milestones).toEqual([]);
  const cards = within(screen.getByRole("region", { name: "匯入審核" })).getAllByRole("article");
  fireEvent.click(within(cards[0]).getByRole("button", { name: "確認" }));
  expect(changes().at(-1)!.schedule.workingDraft?.milestones).toHaveLength(1);
  expect(changes().at(-1)!.schedule.workingDraft?.importCandidates[1].status).toBe("pending");
  expect(screen.getByRole("button", { name: "發布此專案草稿" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "捨棄此專案草稿" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "捨棄此專案 Working Draft" })).getByRole("button", { name: "確認捨棄" }));
  expect(changes().at(-1)!.schedule.workingDraft).toBeNull();
  expect(changes().every(action => action.projectId === other.id)).toBe(true);
  expect(screen.getByRole("region", { name: "審核紀錄" })).toHaveTextContent("已捨棄，未發布");
});
