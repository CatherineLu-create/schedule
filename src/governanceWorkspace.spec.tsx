import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./main";
import { createInitialMilestoneGovernanceRuntimeState } from "./application/governance/milestoneGovernanceInitializer";
import { selectEffectiveMilestoneGovernanceContext } from "./application/governance/effectiveMilestoneGovernanceContext";
import { prepareProjectCreationCommit } from "./application/governance/projectCreationGovernance";
import { previewGovernancePublish, publishGovernanceDraft, startGovernanceDraft, updateGovernanceDraft } from "./application/governance/milestoneGovernanceCommands";
import type { CommandResult, MilestoneGovernanceRuntimeState } from "./domain/governance/milestoneGovernance";
import type { PrototypeState } from "./application/state/prototypeState";
import { devProject001 } from "./fixtures/v2/canonicalProjectFixtures";
import { createEmptyCanonicalProjectSchedule } from "./domain/schedule/officialSchedule";
import { toScheduleVersionNumber } from "./domain/schedule/schedule";
import { parseDateOnly } from "./domain/shared/dateOnly";
import { milestoneTypeCatalog, stageGroupCatalog } from "./config/v2/referenceData";
import { toCanonicalScheduleWorkingDraftId, toGovernanceDraftId, toGovernanceReleaseId, toMilestoneDefinitionId, toMilestoneId, toRequirementEnrollmentId, toRequirementWithdrawalId } from "./domain/shared/ids";

// These wrappers retain every real state transition and selector. They observe App's
// actual committed state; only the named failure test injects a failed prepare result.
vi.mock("./application/governance/milestoneGovernanceInitializer", async original => {
  const actual = await original<typeof import("./application/governance/milestoneGovernanceInitializer")>();
  return { ...actual, createInitialMilestoneGovernanceRuntimeState: vi.fn(actual.createInitialMilestoneGovernanceRuntimeState) };
});
vi.mock("./application/governance/effectiveMilestoneGovernanceContext", async original => {
  const actual = await original<typeof import("./application/governance/effectiveMilestoneGovernanceContext")>();
  return { ...actual, selectEffectiveMilestoneGovernanceContext: vi.fn(actual.selectEffectiveMilestoneGovernanceContext) };
});
vi.mock("./application/governance/projectCreationGovernance", async original => {
  const actual = await original<typeof import("./application/governance/projectCreationGovernance")>();
  return { ...actual, prepareProjectCreationCommit: vi.fn(actual.prepareProjectCreationCommit) };
});
vi.mock("./application/governance/milestoneGovernanceCommands", async original => {
  const actual = await original<typeof import("./application/governance/milestoneGovernanceCommands")>();
  return { ...actual, previewGovernancePublish: vi.fn(actual.previewGovernancePublish), publishGovernanceDraft: vi.fn(actual.publishGovernanceDraft) };
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.restoreAllMocks(); });

const disclosure = "模擬模式｜變更僅保留於本次試用，重新整理後重置，不會同步其他使用者。";
const kickoff = toMilestoneDefinitionId("milestone-design-kickoff");
const definitionUuid = "66666666-6666-4666-8666-666666666666";
const releaseUuid = "77777777-7777-4777-8777-777777777777";
const newName = "Governance test milestone";
function value<T>(result: CommandResult<T, string>): T {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}
function prototype(): PrototypeState {
  return { projects: [devProject001], schedules: [{
    ...createEmptyCanonicalProjectSchedule(devProject001.id),
    publishedVersions: [{ versionNumber: toScheduleVersionNumber(1), versionNote: null,
      publishedAt: "2026-10-01T00:00:00Z", milestones: [{ milestoneId: toMilestoneId("published-kickoff"),
        milestoneDefinitionId: kickoff, applicability: "applicable", plan: parseDateOnly("2026-10-10"), actual: null }] }],
  }] };
}
function setup(governance?: MilestoneGovernanceRuntimeState, initialState = prototype()) {
  if (governance) vi.mocked(createInitialMilestoneGovernanceRuntimeState).mockReturnValueOnce(governance);
  vi.mocked(selectEffectiveMilestoneGovernanceContext).mockClear();
  return render(<App initialState={initialState} referenceDate={parseDateOnly("2026-10-01")!} />);
}
const retained = () => vi.mocked(selectEffectiveMilestoneGovernanceContext).mock.calls.at(-1)![0];
const governanceActionRegions: Readonly<Record<string, string>> = {
  公版管理: "PIP navigation",
  "建立公版草稿": "目前已發布公版",
  "加入公版草稿": "公版草稿",
  "加入已選專案": "既有專案需確認",
  "檢查並預覽發布": "公版草稿",
  "發布公版": "公版草稿",
  "捨棄公版草稿": "公版草稿",
  "回到 Dashboard": "公版管理",
};
// getByLabelText scans every descendant before checking aria-label. Repeated
// global lookups traversed all released history (the lineage case hit 16.486s).
// Locate the visible semantic heading, then query only its interaction region.
function namedRegion(name: string) {
  return name === "PIP navigation" ? screen.getByRole("navigation", { name })
    : screen.getByText(name, { selector: "h1,h2,h3", exact: true }).closest("section")!;
}
function click(name: string | RegExp) {
  const region = typeof name === "string" ? governanceActionRegions[name] : undefined;
  // Exact visible action labels avoid computing every Retire button's accessible
  // name across the definition table and every released history record.
  const action = name === "Create Project" ? screen.getByLabelText(name, { selector: "button" })
    : name === "Edit" ? screen.getByText(name, { selector: "button", exact: true }) : region
    ? within(namedRegion(region)).getByText(name, { selector: "button", exact: true })
    : screen.getByRole("button", { name });
  fireEvent.click(action);
}
function openProject(name: RegExp = /^Open Project/) { fireEvent.click(within(screen.getByRole("region", { name: "All Projects" })).getByRole("button", { name })); }
function open() { click("公版管理"); return namedRegion("公版管理"); }
function start() { open(); click("建立公版草稿"); }
function editRow(name = "Kickoff") {
  return within(namedRegion("公版草稿")).getByText(name, { selector: "th", exact: true }).closest("tr")!;
}
function toggle(label: string, name = "Kickoff") { fireEvent.click(within(editRow(name)).getByRole("checkbox", { name: label })); }
function preview() { click("檢查並預覽發布"); return namedRegion("公版發布預覽"); }
function publish() { preview(); click("發布公版"); }
function addDefinition() {
  const form = within(within(namedRegion("公版草稿")).getByText("新增公版里程碑", { selector: "legend", exact: true }).closest("fieldset")!);
  fireEvent.change(form.getByLabelText("公版里程碑名稱"), { target: { value: `  ${newName}  ` } });
  fireEvent.change(form.getByLabelText("階段"), { target: { value: "stage-design" } });
  fireEvent.change(form.getByLabelText("類型"), { target: { value: "type-test" } });
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(definitionUuid);
  click("加入公版草稿");
}
function assign(id = kickoff) {
  const assignment = within(namedRegion("既有專案需確認"));
  fireEvent.change(assignment.getByLabelText("需確認的公版里程碑"), { target: { value: id } });
  fireEvent.click(within(assignment.getByRole("group", { name: "專案選取" })).getByRole("checkbox", { name: devProject001.master.basicInformation.stnProjectName! }));
  click("加入已選專案");
}
function malformedRequirement(initial = createInitialMilestoneGovernanceRuntimeState()) {
  const started = value(startGovernanceDraft(initial, toGovernanceDraftId("malformed-requirement")));
  const candidate = started.draft!.candidateRelease;
  return value(updateGovernanceDraft(started, { kind: "replace-candidate-release", candidateRelease: { ...candidate,
    addableDefinitionIds: candidate.addableDefinitionIds.filter(id => id !== kickoff), newProjectRequirementDefinitionIds: [kickoff],
  } }));
}
function assignedState() {
  let state = value(startGovernanceDraft(createInitialMilestoneGovernanceRuntimeState(), toGovernanceDraftId("seed-draft")));
  state = value(updateGovernanceDraft(state, { kind: "replace-existing-project-assignments", assignments: [{ projectId: devProject001.id, milestoneDefinitionId: kickoff }] }));
  return value(publishGovernanceDraft(state, prototype(), {
    createReleaseId: () => toGovernanceReleaseId("assignment-release"),
    createEnrollmentId: () => toRequirementEnrollmentId("original-enrollment"),
    createWithdrawalId: () => toRequirementWithdrawalId("unused"), nowIso: () => "2026-10-01T01:00:00Z",
  }));
}
function creation(name = "Created after Governance") {
  click("回到 Dashboard"); click("Create Project");
  const dialog = screen.getByRole("dialog", { name: "Create Project" });
  fireEvent.change(within(dialog).getByLabelText("Year"), { target: { value: "2027" } });
  fireEvent.change(within(dialog).getByLabelText("Product Line"), { target: { value: "demo-product-line-aspire-refresh-id" } });
  fireEvent.change(within(dialog).getByLabelText("STN Project Name"), { target: { value: name } });
  return dialog;
}
function addCpu(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole("button", { name: "Add new CPU" }));
  fireEvent.change(within(dialog).getByRole("textbox", { name: "New CPU" }), { target: { value: "Session CPU" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add CPU option" }));
  return (within(dialog).getByRole("option", { name: "Session CPU" }) as HTMLOptionElement).value;
}
function assertBaselineConsumers() {
  expect(screen.getByRole("columnheader", { name: /^Kickoff/ })).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Needs Attention" })).queryByText("Kickoff")).not.toBeInTheDocument();
  openProject();
  expect(screen.getByRole("region", { name: "Current Schedule" })).toHaveTextContent("Kickoff");
  click("Edit");
  expect(within(screen.getByLabelText("Milestone definition")).getByRole("option", { name: "ID fix" })).toBeInTheDocument();
  expect(within(screen.getByLabelText("Milestone definition")).queryByRole("option", { name: newName })).not.toBeInTheDocument();
}

// Each case catches a concrete loss of navigation, isolation, command validation,
// or consumer behavior. They deliberately exercise the real mounted PIP App.
it("governance_page_is_inside_existing_pip_navigation", () => {
  setup(); const main = screen.getByRole("main");
  expect(within(main).getByRole("navigation", { name: "PIP navigation" })).toBeInTheDocument();
  open(); expect(within(main).getByRole("heading", { name: "公版管理" })).toBeInTheDocument();
  click("回到 Dashboard"); expect(screen.getByRole("region", { name: "Portfolio Dashboard" })).toBeInTheDocument();
});
it("opening_governance_does_not_reinitialize_runtime_state", () => {
  setup(); const before = retained(); const calls = vi.mocked(createInitialMilestoneGovernanceRuntimeState).mock.calls.length;
  open(); click("回到 Dashboard"); open();
  expect(retained()).toBe(before); expect(createInitialMilestoneGovernanceRuntimeState).toHaveBeenCalledTimes(calls);
});
it("navigation_away_and_back_preserves_same_session_governance_state", () => {
  setup(); start(); toggle("加入日期提醒"); const before = retained();
  click("回到 Dashboard"); open(); expect(retained()).toBe(before);
  expect(within(editRow()).getByRole("checkbox", { name: "加入日期提醒" })).toBeChecked();
});
it("governance_navigation_does_not_reset_self_service_catalogs", () => {
  setup(); click("Create Project"); const dialog = screen.getByRole("dialog", { name: "Create Project" }); const id = addCpu(dialog);
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" })); start(); toggle("顯示於總表"); click("捨棄公版草稿");
  click("回到 Dashboard"); click("Create Project");
  expect(within(screen.getByRole("dialog", { name: "Create Project" })).getByRole("option", { name: "Session CPU" })).toHaveValue(id);
});
it("simulation_mode_reload_disclosure_is_visible", () => { setup(); open(); expect(screen.getByText(disclosure)).toBeVisible(); });
it("no_fake_login_or_permission_ui", () => {
  setup(); open(); expect(screen.getByRole("button", { name: "建立公版草稿" })).toBeEnabled();
  expect(screen.queryByText(/admin login|access denied|permission required|sign in/i)).not.toBeInTheDocument();
});
it("start_draft_keeps_current_release_and_consumers_unchanged", () => {
  setup(); const before = retained(); start();
  expect(retained().releases).toBe(before.releases); expect(retained().currentReleaseId).toBe(before.currentReleaseId);
  expect(retained().draft!.candidateRelease.definitions).toEqual(before.releases[0].definitions);
  click("回到 Dashboard"); assertBaselineConsumers();
});
it("draft_edits_do_not_change_select_portfolio_attention", () => {
  setup(); start(); addDefinition(); toggle("可新增", newName); toggle("顯示於總表", newName); toggle("加入日期提醒"); toggle("顯示於總表");
  click("回到 Dashboard"); assertBaselineConsumers();
});
it("discard_keeps_current_release_and_history", () => {
  const initial = assignedState(); setup(initial); start(); addDefinition(); click("捨棄公版草稿");
  expect(retained()).toEqual(initial); expect(screen.getByRole("region", { name: "專案跟進紀錄" })).toHaveTextContent("Kickoff");
});
it("draft_mutation_clears_stale_preview", () => {
  setup(); start(); preview(); toggle("顯示於總表");
  expect(screen.queryByRole("region", { name: "公版發布預覽" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "發布公版" })).toBeDisabled();
});
it("preview_is_read_only", () => {
  const state = prototype(); const before = structuredClone(state); setup(undefined, state); start(); const governance = retained(); preview();
  expect(retained()).toBe(governance); expect(state).toEqual(before);
  expect(vi.mocked(previewGovernancePublish).mock.calls.at(-1)).toEqual([governance, state]);
  expect(governance.draft).not.toBeNull(); expect(governance.releases).toHaveLength(1);
});
it("creates_new_draft_public_definition_with_legal_stage_and_type", () => {
  setup(); start();
  expect(screen.getByRole("button", { name: "加入公版草稿" })).toBeDisabled();
  expect(within(screen.getByLabelText("階段")).getAllByRole("option").map(o => (o as HTMLOptionElement).value).filter(Boolean)).toEqual(stageGroupCatalog.filter(s => s.active && s.reviewStatus === "reviewed").map(s => s.id));
  expect(within(screen.getByLabelText("類型")).getAllByRole("option").map(o => (o as HTMLOptionElement).value).filter(Boolean)).toEqual(milestoneTypeCatalog.filter(t => t.active && t.reviewStatus === "reviewed").map(t => t.id));
  addDefinition(); const definition = retained().draft!.candidateRelease.definitions.at(-1)!;
  expect(definition).toMatchObject({ id: definitionUuid, name: newName, stageGroupId: "stage-design", milestoneTypeId: "type-test", active: true, reviewStatus: "reviewed", aliases: [], showInPortfolio: false });
  expect(Number.isSafeInteger(definition.displayOrder)).toBe(true);
  expect(definition.displayOrder).toBe(30);
  expect(editRow(newName)).not.toHaveTextContent(definitionUuid);
  expect(retained().releases[0].definitions.some(d => d.id === definitionUuid)).toBe(false);
});
it("published_definition_semantics_not_normally_editable_in_place", () => {
  setup(); start(); const row = within(editRow());
  expect(row.queryByRole("textbox")).not.toBeInTheDocument(); expect(row.queryByRole("combobox")).not.toBeInTheDocument();
  expect(row.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  expect(editRow()).not.toHaveTextContent("milestone-design-kickoff"); expect(editRow()).toHaveTextContent("Design"); expect(editRow()).toHaveTextContent("已確認");
});
it("addable_portfolio_attention_requirement_are_independent", () => {
  setup(); start(); addDefinition();
  for (const label of ["顯示於總表", "加入日期提醒"]) toggle(label, newName);
  expect(within(editRow(newName)).getByRole("checkbox", { name: "可新增" })).not.toBeChecked();
  expect(within(editRow(newName)).getByRole("checkbox", { name: "新案需確認" })).toBeDisabled();
  toggle("可新增", newName); toggle("新案需確認", newName);
  const candidate = retained().draft!.candidateRelease;
  for (const key of ["portfolioColumnDefinitionIds", "additionalAttentionDefinitionIds", "newProjectRequirementDefinitionIds"] as const) expect(candidate[key]).toContain(definitionUuid);
  toggle("顯示於總表", newName);
  expect(within(editRow(newName)).getByRole("checkbox", { name: "加入日期提醒" })).toBeChecked();
  expect(within(editRow(newName)).getByRole("checkbox", { name: "新案需確認" })).toBeChecked();
});
it("automatic_four_types_are_not_disable_toggles", () => {
  setup(); start(); const automatic = screen.getByRole("region", { name: "自動提醒類型" });
  for (const name of ["G/O", "SMT", "Close", "MDRR"]) expect(within(automatic).getByText(name, { exact: true })).toBeInTheDocument();
  expect(within(automatic).queryByRole("checkbox")).not.toBeInTheDocument();
});
it("retire_does_not_silently_clear_portfolio_or_attention", () => {
  setup(); start(); toggle("加入日期提醒"); toggle("新案需確認");
  const before = retained();
  fireEvent.click(within(editRow()).getByRole("button", { name: "停用" }));
  expect(retained()).toBe(before);
  expect(within(editRow()).getByRole("checkbox", { name: "可新增" })).toBeChecked();
  for (const label of ["顯示於總表", "加入日期提醒", "新案需確認"]) expect(within(editRow()).getByRole("checkbox", { name: label })).toBeChecked();
  toggle("新案需確認"); fireEvent.click(within(editRow()).getByRole("button", { name: "停用" }));
  expect(within(editRow()).getByRole("checkbox", { name: "可新增" })).not.toBeChecked();
  for (const label of ["顯示於總表", "加入日期提醒"]) expect(within(editRow()).getByRole("checkbox", { name: label })).toBeChecked();
  expect(retained().draft!.withdrawalEnrollmentIds).toEqual([]);
});
// This full App scenario exceeded 5s (5879ms) in the complete Windows suite.
// Bound its real interaction cost explicitly; no polling or global timeout change.
it("preview_shows_definition_setting_assignment_withdrawal_grant_diffs", () => {
  const state = prototype(); const withDraft: PrototypeState = { ...state, schedules: [{ ...state.schedules[0], workingDraft: {
    workingDraftId: toCanonicalScheduleWorkingDraftId("exact-draft"), milestones: [{ ...state.schedules[0].publishedVersions[0].milestones[0], milestoneId: toMilestoneId("exact-occurrence") }], reviewSessionIds: [], importCandidates: [],
  } }] };
  setup(assignedState(), withDraft); start(); addDefinition(); toggle("可新增", newName); toggle("顯示於總表", newName); toggle("加入日期提醒", newName); toggle("新案需確認", newName);
  fireEvent.click(within(editRow()).getByRole("button", { name: "停用" }));
  fireEvent.click(within(screen.getByLabelText("撤回既有跟進要求")).getByLabelText(`撤回 ${devProject001.master.basicInformation.stnProjectName} · Kickoff`)); assign(toMilestoneDefinitionId(definitionUuid));
  const region = preview();
  for (const label of ["新增公版", "停用公版", "可新增設定變更", "總表欄位變更", "加入日期提醒變更", "新案需確認變更", "既有專案需確認變更", "撤回跟進要求", "保留既有草稿里程碑"]) expect(within(region).getByRole("heading", { name: label })).toBeVisible();
  expect(within(region).queryByText("顯示技術細節")).not.toBeInTheDocument();
  expect(region.querySelector("pre")).toBeNull();
  for (const text of [definitionUuid, "original-enrollment", "exact-draft", "exact-occurrence", devProject001.id]) expect(region).not.toHaveTextContent(text);
  expect(region).toHaveTextContent(`${newName}｜Design｜Test`);
  expect(region).toHaveTextContent(`${newName} · 新增 1 個專案`);
  const result = vi.mocked(previewGovernancePublish).mock.results.at(-1)!.value;
  expect(result.proposedWithdrawalEnrollmentIds).toEqual(["original-enrollment"]);
  expect(result.proposedRetiredDraftOccurrenceGrants).toEqual([expect.objectContaining({ projectId: devProject001.id, workingDraftId: "exact-draft", milestoneId: "exact-occurrence", milestoneDefinitionId: kickoff })]);
}, 15000);
it("preview_surfaces_blocking_and_warnings", () => {
  setup(malformedRequirement(assignedState())); open();
  const region = preview(); expect(region).toHaveTextContent("Kickoff 已設為「新案需確認」，但目前不可新增");
  expect(region).toHaveTextContent("未來若從已發布排程移除，將再次成為待確認");
  expect(region).not.toHaveTextContent("retained-requirement-may-reopen"); expect(region).not.toHaveTextContent("future Published Schedule");
  expect(vi.mocked(previewGovernancePublish).mock.results.at(-1)!.value.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "retained-requirement-may-reopen" })]));
});
it("blocking_preview_cannot_successfully_publish", () => {
  setup(malformedRequirement()); open(); const before = retained(); preview();
  expect(screen.getByRole("button", { name: "發布公版" })).toBeDisabled(); click("發布公版"); expect(retained()).toBe(before);
});
it("successful_publish_switches_select_portfolio_attention_via_effective_context", () => {
  setup(); start(); addDefinition(); toggle("可新增", newName); toggle("顯示於總表", newName); toggle("顯示於總表"); toggle("加入日期提醒");
  publish(); click("回到 Dashboard");
  expect(screen.queryByRole("columnheader", { name: /^Kickoff/ })).not.toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: new RegExp(newName) })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Needs Attention" })).toHaveTextContent("Kickoff");
  openProject(); click("Edit"); expect(within(screen.getByLabelText("Milestone definition")).getByRole("option", { name: newName })).toBeInTheDocument();
});
it("failed_publish_preserves_draft_current_release_history", () => {
  setup(); start(); toggle("加入日期提醒"); preview(); const before = retained();
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(before.currentReleaseId as `${string}-${string}-${string}-${string}-${string}`);
  click("發布公版"); expect(retained()).toBe(before);
  expect(screen.getByRole("alert")).toHaveTextContent("識別碼或專案跟進要求重複"); expect(screen.getByRole("region", { name: "公版草稿" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).not.toHaveTextContent(before.currentReleaseId);
});
it("success_clears_draft_and_preview", () => {
  setup(); start(); publish(); expect(retained().draft).toBeNull();
  expect(screen.queryByRole("region", { name: "公版發布預覽" })).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "建立公版草稿" })).toBeEnabled();
});
it("publish_does_not_modify_project_schedule_occurrences", () => {
  const state = prototype(); const before = structuredClone(state); setup(undefined, state); start(); assign(); publish();
  expect(state).toEqual(before); click("回到 Dashboard"); openProject();
  expect(screen.getByRole("region", { name: "Current Schedule" })).toHaveTextContent("Kickoff");
  expect(screen.queryByRole("heading", { name: "Working Draft" })).not.toBeInTheDocument();
  open(); click("建立公版草稿"); preview();
  expect(vi.mocked(previewGovernancePublish).mock.calls.at(-1)![1]).toEqual(before);
});
it("existing_project_assignment_is_explicit", () => {
  setup(); start(); expect(within(namedRegion("既有專案需確認")).getByRole("button", { name: "加入已選專案" })).toBeDisabled();
  assign(); expect(retained().draft!.existingProjectAssignments).toEqual([{ projectId: devProject001.id, milestoneDefinitionId: kickoff }]);
  assign(); expect(retained().draft!.existingProjectAssignments).toEqual([{ projectId: devProject001.id, milestoneDefinitionId: kickoff }]);
  preview(); expect(vi.mocked(previewGovernancePublish).mock.results.at(-1)!.value.blockingIssues).toEqual([]);
});
it("withdrawal_history_preserves_original_enrollment", () => {
  const initial = assignedState(); setup(initial); start(); fireEvent.click(screen.getByRole("checkbox", { name: `撤回 ${devProject001.master.basicInformation.stnProjectName} · Kickoff` }));
  expect(retained().requirementWithdrawals).toEqual([]); expect(retained().draft!.withdrawalEnrollmentIds).toEqual(["original-enrollment"]); publish();
  expect(retained().requirementEnrollments).toEqual(initial.requirementEnrollments);
  expect(retained().requirementWithdrawals[0]).toMatchObject({ enrollmentId: "original-enrollment", withdrawnByReleaseId: retained().currentReleaseId });
  const history = screen.getByRole("region", { name: "專案跟進紀錄" });
  for (const id of ["assignment-release", "original-enrollment", retained().requirementWithdrawals[0].id, devProject001.id, kickoff]) expect(history).not.toHaveTextContent(id);
  expect(history).toHaveTextContent("加入既有專案"); expect(history).toHaveTextContent("撤回於 試用發布 #2"); expect(history).toHaveTextContent("試用發布 #1");
  expect(history).toHaveTextContent("2026-10-01T01:00:00Z"); expect(history).toHaveTextContent(retained().releases.at(-1)!.publishedAt!);
});
// Real assignment/retarget release flow took 5575ms in covering and 5261ms in
// the full Windows suite (3430ms isolated). Scope the query and budget this case.
it("retarget_history_uses_new_enrollment_id", () => {
  setup(assignedState()); start(); fireEvent.click(within(screen.getByLabelText("撤回既有跟進要求")).getByLabelText(`撤回 ${devProject001.master.basicInformation.stnProjectName} · Kickoff`));
  const target = retained().releases[0].addableDefinitionIds[1]; assign(target); publish();
  const entries = retained().requirementEnrollments; expect(entries).toHaveLength(2); expect(entries[1].id).not.toBe(entries[0].id); expect(entries[1].milestoneDefinitionId).toBe(target);
  const history = screen.getByRole("region", { name: "專案跟進紀錄" }); expect(history).not.toHaveTextContent(entries[0].id); expect(history).not.toHaveTextContent(entries[1].id);
  expect(history).toHaveTextContent("加入既有專案"); expect(history).toHaveTextContent("Kickoff"); expect(history).toHaveTextContent("ID fix");
}, 15000);
it("retire_conflict_is_shown_not_silently_resolved", () => {
  const empty = { projects: [devProject001], schedules: [createEmptyCanonicalProjectSchedule(devProject001.id)] };
  setup(assignedState(), empty); start(); toggle("可新增"); const before = retained();
  expect(preview()).toHaveTextContent("停用後，既有跟進要求將無法完成");
  expect(retained()).toBe(before); expect(retained().draft!.withdrawalEnrollmentIds).toEqual([]);
});
it("bundled_baseline_and_runtime_release_history_are_distinct", () => {
  setup(); start(); vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(releaseUuid); toggle("顯示於總表"); publish();
  const history = screen.getByRole("region", { name: "公版發布紀錄" }); expect(history).toHaveTextContent("系統初始公版"); expect(history).toHaveTextContent("試用發布");
  expect(history).not.toHaveTextContent(releaseUuid); expect(history).toHaveTextContent("試用發布 #1"); expect(history).toHaveTextContent(retained().releases[1].publishedAt!);
  expect(retained().currentReleaseId).toBe(releaseUuid);
  expect(within(history).getAllByText("顯示於總表")).toHaveLength(2); expect(history).not.toHaveTextContent("Published v01");
});
it("released_new_project_requirement_is_inherited_by_project_created_after_publish", () => {
  setup(); start(); toggle("新案需確認"); publish(); const release = retained().currentReleaseId;
  fireEvent.click(within(creation()).getByRole("button", { name: "Save" }));
  const id = screen.getByRole("region", { name: "Project Header" }).getAttribute("data-project-id");
  expect(retained().requirementEnrollments).toEqual([expect.objectContaining({ projectId: id, milestoneDefinitionId: kickoff, assignedByReleaseId: release, source: "new-project-at-creation" })]);
  open(); expect(screen.getByRole("region", { name: "專案跟進紀錄" })).toHaveTextContent("建立新案時加入");
});
it("pre_publish_project_creation_does_not_use_draft_requirement", () => {
  setup(); start(); toggle("新案需確認"); fireEvent.click(within(creation("Before publish")).getByRole("button", { name: "Save" }));
  expect(retained().requirementEnrollments).toEqual([]); open(); expect(within(editRow()).getByRole("checkbox", { name: "新案需確認" })).toBeChecked();
});
// Two real releases and Create took 6943ms in the five-file Windows run;
// isolated it took 2270ms. Keep all state/lineage assertions with a local budget.
it("later_release_does_not_retroactively_change_creation_enrollment", () => {
  setup(); start(); toggle("新案需確認"); publish(); fireEvent.click(within(creation()).getByRole("button", { name: "Save" })); const entries = retained().requirementEnrollments;
  open(); click("建立公版草稿"); toggle("新案需確認"); addDefinition(); toggle("可新增", newName); toggle("新案需確認", newName); publish();
  expect(retained().requirementEnrollments).toEqual(entries); expect(entries[0].assignedByReleaseId).not.toBe(retained().currentReleaseId);
  click("回到 Dashboard"); openProject(/^Open Project Manta/); click("Edit"); expect(within(screen.getByLabelText("Milestone definition")).getByRole("option", { name: newName })).toBeInTheDocument();
}, 15000);
it("create_prepare_failure_remains_atomic_after_governance_page_exists", () => {
  setup(); start(); toggle("新案需確認"); publish(); const before = retained(); const dialog = creation(); const cpu = addCpu(dialog);
  vi.mocked(prepareProjectCreationCommit).mockReturnValueOnce({ ok: false, code: "duplicate-enrollment-id", issues: [{ code: "governance.creation.duplicate-enrollment-id", domain: "governance", source: "data", severity: "blocking", message: "Cannot allocate creation enrollment", target: { section: "projectCreation" } }] });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  expect(screen.getByText("Cannot allocate creation enrollment")).toBeInTheDocument(); expect(retained()).toBe(before); expect(screen.queryByRole("region", { name: "Project Header" })).not.toBeInTheDocument();
  expect(within(dialog).getByRole("option", { name: "Session CPU" })).toHaveValue(cpu);
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  const [retriedPrototype, retriedGovernance] = vi.mocked(prepareProjectCreationCommit).mock.calls.at(-1)!;
  expect(retriedPrototype).toEqual(prototype()); expect(retriedGovernance).toBe(before); expect(retained().requirementEnrollments).toHaveLength(1);
  expect(screen.getByRole("region", { name: "Project Header" })).toHaveTextContent("Session CPU");
});
it.each([
  ["semantic_mutation_of_published_definition_is_blocked", "無法直接變更原有名稱、階段或類型", "rename"],
  ["historical_definition_removal_is_blocked", "已發布里程碑必須保留", "remove"],
  ["public_id_collision_with_project_local_is_blocked", "識別碼或專案跟進要求重複", "collision"],
] as const)("%s", (_name, message, kind) => {
  const baseline = createInitialMilestoneGovernanceRuntimeState(); let draft = value(startGovernanceDraft(baseline, toGovernanceDraftId("malformed")));
  const candidate = draft.draft!.candidateRelease; const first = candidate.definitions.find(d => d.id === kickoff)!; const state = prototype();
  const definitions = kind === "rename" ? candidate.definitions.map(d => d.id === kickoff ? { ...d, name: "Illegal rename" } : d)
    : kind === "remove" ? candidate.definitions.filter(d => d.id !== kickoff) : [...candidate.definitions, { ...first, id: toMilestoneDefinitionId("local-collision") }];
  draft = value(updateGovernanceDraft(draft, { kind: "replace-candidate-release", candidateRelease: { ...candidate, definitions } }));
  const initialState: PrototypeState = kind === "collision" ? { ...state, schedules: [{ ...state.schedules[0], localDefinitions: [{ ...first, id: toMilestoneDefinitionId("local-collision"), source: "manual", confirmation: "confirmed", evidenceIds: [] }] }] } : state;
  setup(draft, initialState); open(); const before = retained(); expect(preview()).toHaveTextContent(message); click("發布公版"); expect(retained()).toBe(before);
});
it("valid_membership_changes_still_publish", () => {
  setup(); start(); toggle("顯示於總表"); toggle("加入日期提醒"); toggle("新案需確認"); publish();
  const release = retained().releases.at(-1)!; expect(release.portfolioColumnDefinitionIds).not.toContain(kickoff); expect(release.additionalAttentionDefinitionIds).toContain(kickoff); expect(release.newProjectRequirementDefinitionIds).toContain(kickoff);
});
it("remount_resets_runtime_governance_to_bundled_baseline", () => {
  const mounted = setup(); start(); addDefinition(); toggle("可新增", newName); publish(); mounted.unmount(); setup(); open();
  expect(retained().releases).toHaveLength(1); expect(retained().draft).toBeNull(); expect(retained().requirementEnrollments).toEqual([]); expect(screen.queryByText(newName)).not.toBeInTheDocument();
});
// Two real releases plus Create/CPU/Cancel navigation took 5534ms in the full suite.
it("same_session_governance_and_self_service_do_not_reset_each_other", () => {
  setup(); start(); toggle("新案需確認"); publish(); const released = retained();
  click("回到 Dashboard"); click("Create Project");
  const dialog = screen.getByRole("dialog", { name: "Create Project" });
  const id = addCpu(dialog); fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" })); open(); expect(retained()).toBe(released);
  click("建立公版草稿"); toggle("加入日期提醒"); publish(); click("回到 Dashboard"); click("Create Project");
  expect(within(screen.getByRole("dialog", { name: "Create Project" })).getByRole("option", { name: "Session CPU" })).toHaveValue(id);
}, 15000);
it("project_workspace_has_no_public_governance_publish_action", () => {
  setup(); open(); click("回到 Dashboard"); openProject();
  expect(screen.queryByRole("button", { name: "發布公版" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "建立公版草稿" })).not.toBeInTheDocument();
});
it("governance_page_centralizes_public_management_without_claiming_real_permission", () => {
  setup(); start(); expect(screen.getByRole("button", { name: "加入公版草稿" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "檢查並預覽發布" })).toBeInTheDocument();
  expect(screen.queryByText(/admin only|authorized users|role required/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: /JSON/i })).not.toBeInTheDocument();
});
it("bundled_initial_state_still_reproduces_existing_select_portfolio_attention", () => { setup(); open(); click("回到 Dashboard"); assertBaselineConsumers(); });

it("changing_the_project_snapshot_invalidates_preview_before_returning_to_governance", () => {
  setup(); start(); preview(); fireEvent.click(within(creation()).getByRole("button", { name: "Save" })); open();
  expect(screen.queryByRole("region", { name: "公版發布預覽" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "發布公版" })).toBeDisabled();
  preview(); expect(vi.mocked(previewGovernancePublish).mock.calls.at(-1)![1].projects).toHaveLength(2);
});

it("published_stage_insertions_share_exact_order_in_portfolio_and_schedule_select", () => {
  setup(); start(); const original = retained().releases[0].definitions;
  const additions = [
    ["Inserted after bundled", "11111111-1111-4111-8111-111111111111", "milestone-c1-c-g-o"],
    ["Inserted after runtime", "22222222-2222-4222-8222-222222222222", "11111111-1111-4111-8111-111111111111"],
    ["Inserted at front", "33333333-3333-4333-8333-333333333333", "start"],
  ] as const;
  for (const [name, id, position] of additions) {
    fireEvent.change(screen.getByLabelText("公版里程碑名稱"), { target: { value: name } });
    fireEvent.change(screen.getByLabelText("階段"), { target: { value: "stage-c1" } });
    fireEvent.change(screen.getByLabelText("類型"), { target: { value: "type-test" } });
    fireEvent.change(screen.getByLabelText("插入位置"), { target: { value: position } });
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(id);
    click("加入公版草稿"); toggle("可新增", name); toggle("顯示於總表", name);
  }
  publish(); const released = retained().releases.at(-1)!;
  expect(released.definitions.slice(0, original.length)).toEqual(original);
  expect(released.definitions.slice(-3).map(item => item.displayOrder)).toEqual([125, 127.5, 110]);
  click("回到 Dashboard");
  const columns = within(screen.getByRole("region", { name: "All Projects" })).getAllByRole("columnheader").map(item => item.textContent);
  const position = columns.findIndex(label => label?.startsWith("Inserted at front"));
  expect(columns.slice(position, position + 5).map(label => label?.replace(/\s+/g, " ").trim())).toEqual(expect.arrayContaining([
    expect.stringContaining("Inserted at front"), expect.stringContaining("C1 G/O"), expect.stringContaining("Inserted after bundled"), expect.stringContaining("Inserted after runtime"), expect.stringContaining("C1 SMT"),
  ]));
  expect(columns[position + 1]).toContain("C1 G/O"); expect(columns[position + 2]).toContain("Inserted after bundled"); expect(columns[position + 3]).toContain("Inserted after runtime"); expect(columns[position + 4]).toContain("C1 SMT");
  openProject(); click("Edit");
  const options = within(screen.getByLabelText("Milestone definition")).getAllByRole("option").map(item => (item as HTMLOptionElement).value);
  const first = options.indexOf(additions[2][1]);
  expect(options.slice(first, first + 5)).toEqual([additions[2][1], "milestone-c1-c-g-o", additions[0][1], additions[1][1], "milestone-c1-c-smt"]);
}, 15000);

it("released_nonautomatic_test_date_reminder_reaches_real_dashboard_attention", () => {
  const baseline = prototype();
  const initial: PrototypeState = { ...baseline, schedules: [{ ...baseline.schedules[0], publishedVersions: [{ ...baseline.schedules[0].publishedVersions[0], milestones: [{ ...baseline.schedules[0].publishedVersions[0].milestones[0], milestoneDefinitionId: toMilestoneDefinitionId("milestone-c1-c-test") }] }] }] };
  setup(undefined, initial);
  expect(screen.getByRole("region", { name: "Needs Attention" })).not.toHaveTextContent("C1 Test");
  start(); toggle("加入日期提醒", "C1 Test");
  expect(preview()).toHaveTextContent("加入日期提醒變更"); click("發布公版");
  expect(retained().releases.at(-1)!.additionalAttentionDefinitionIds).toEqual(["milestone-c1-c-test"]);
  click("回到 Dashboard"); expect(screen.getByRole("region", { name: "Needs Attention" })).toHaveTextContent("C1 Test");
});
