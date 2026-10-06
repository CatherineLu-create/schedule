import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { GovernanceWorkspace } from "./governanceWorkspace";
import { createInitialMilestoneGovernanceRuntimeState } from "./application/governance/milestoneGovernanceInitializer";
import { selectEffectiveMilestoneGovernanceContext } from "./application/governance/effectiveMilestoneGovernanceContext";
import { previewGovernancePublish, publishGovernanceDraft, startGovernanceDraft, updateGovernanceDraft } from "./application/governance/milestoneGovernanceCommands";
import type { CommandResult, GovernancePublishPreview, MilestoneGovernanceRuntimeState } from "./domain/governance/milestoneGovernance";
import { devProject001 } from "./fixtures/v2/canonicalProjectFixtures";
import { toCatalogItemId, toGovernanceDraftId, toGovernanceReleaseId, toMilestoneDefinitionId, toProjectId, toRequirementEnrollmentId, toRequirementWithdrawalId } from "./domain/shared/ids";
import { orderMilestoneDefinitions } from "./application/milestoneDefinitionOrdering";
import type { ValidationIssue } from "./domain/validation/validationIssue";

afterEach(cleanup);
const kickoff = toMilestoneDefinitionId("milestone-design-kickoff");
const gateId = toMilestoneDefinitionId("runtime-gov-demo-gate");
const disclosure = "模擬模式｜變更僅保留於本次試用，重新整理後重置，不會同步其他使用者。";
const projects = ["pending", "on-going", "mp", "eol", "rfq", "kick-off"].map((status, index) => ({
  ...devProject001, id: toProjectId(`picker-project-${index}`), master: { ...devProject001.master,
    basicInformation: { ...devProject001.master.basicInformation, status: toCatalogItemId(`status-${status}`),
      stnProjectName: `Project ${index}`, qciModelName: `QCI Model ${index}`, year: [2027, 2026, 2027, 2027, null, 2026][index] } },
}));
function value<T>(result: CommandResult<T, string>): T {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}
function draftState() {
  const started = value(startGovernanceDraft(createInitialMilestoneGovernanceRuntimeState(), toGovernanceDraftId("ux-draft")));
  const candidate = started.draft!.candidateRelease;
  return value(updateGovernanceDraft(started, { kind: "replace-candidate-release", candidateRelease: { ...candidate,
    definitions: [...candidate.definitions, { ...candidate.definitions[0], id: gateId, name: "GOV Demo Gate", milestoneTypeId: null, displayOrder: 9999 }],
  } }));
}
function setup(initial = draftState(), issues: readonly ValidationIssue[] = []) {
  let observed = initial;
  let nextDefinition = 0;
  function Harness() {
    const [state, setState] = React.useState(initial);
    const [preview, setPreview] = React.useState<GovernancePublishPreview | null>(null);
    observed = state;
    return <GovernanceWorkspace state={state} context={value(selectEffectiveMilestoneGovernanceContext(state))}
      projects={projects} schedules={[]} preview={preview} issues={issues} onStartDraft={() => {}}
      createDefinitionId={() => toMilestoneDefinitionId(`inserted-${++nextDefinition}`)}
      onUpdateDraft={update => { setState(value(updateGovernanceDraft(state, update))); setPreview(null); }}
      onPreview={() => setPreview(previewGovernancePublish(state, { projects, schedules: [] }))}
      onPublish={() => {}} onDiscard={() => {}} onBack={() => {}} />;
  }
  render(<Harness />);
  return () => observed;
}
const click = (name: string) => fireEvent.click(screen.getByText(name, { selector: "button", exact: true }));
const row = (name = "GOV Demo Gate") => screen.getByText(name, { selector: "th", exact: true }).closest("tr")!;
const check = (label: string, name = "GOV Demo Gate") => within(row(name)).getByRole("checkbox", { name: label });
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const picker = () => screen.getByText("專案選取", { selector: "legend", exact: true }).closest("fieldset")!;
const pick = (name: string) => fireEvent.click(within(picker()).getByRole("checkbox", { name }));
const options = () => within(picker()).getAllByRole("checkbox").map(item => item.getAttribute("aria-label"));
const showPreview = () => { click("檢查並預覽發布"); return screen.getByRole("region", { name: "公版發布預覽" }); };

it("UX05 manages Chinese Stage and Type Draft catalogs with protected and historical read-only Types", () => {
  const state = setup();
  const stages = within(screen.getByRole("region", { name: "階段管理" }));
  const types = within(screen.getByRole("region", { name: "類型管理" }));
  expect(types.getByRole("heading", { name: "可選類型" })).toBeVisible();
  expect(types.getByRole("heading", { name: "歷史類型" })).toBeVisible();
  expect(types.getAllByText("系統自動提醒")).toHaveLength(4);
  expect(types.queryByRole("button", { name: /停用類型.*G\/O|停用類型.*SMT|停用類型.*Pre-Build|停用類型.*Close|停用類型.*MDRR|重新命名/ })).not.toBeInTheDocument();
  fireEvent.change(stages.getByLabelText("新階段名稱"), { target: { value: "New Stage" } });
  fireEvent.click(stages.getByRole("button", { name: "新增階段" }));
  fireEvent.change(types.getByLabelText("新類型名稱"), { target: { value: "New Type" } });
  fireEvent.click(types.getByRole("button", { name: "新增類型" }));
  expect(state().draft!.candidateRelease.stageGroups.at(-1)?.displayName).toBe("New Stage");
  expect(state().draft!.candidateRelease.milestoneTypes.at(-1)?.displayName).toBe("New Type");
  fireEvent.click(stages.getByRole("button", { name: "停用階段 Design" }));
  fireEvent.click(types.getByRole("button", { name: "停用類型 Test" }));
  const preview = within(showPreview());
  for (const heading of ["新增階段", "停用階段", "新增類型", "停用類型"]) expect(preview.getByRole("heading", { name: heading })).toBeVisible();
  expect(preview.getByText("此階段仍被既有里程碑使用；停用後僅停止新定義選用，不會停用既有里程碑。")).toBeVisible();
  expect(preview.queryByRole("button")).not.toBeInTheDocument();
  expect(state().releases[0].stageGroups.some(item => item.displayName === "New Stage")).toBe(false);
});

it("UX05 public editor allows No Type and seven selectable Types while preserving MDRR legacy label and ordinary reminder", () => {
  const state = setup();
  const types = within(screen.getByLabelText("類型", { exact: true })).getAllByRole("option");
  expect(types.map(item => item.textContent)).toEqual(["無類型", "G/O", "SMT", "Pre-Build", "Close", "Test", "Certification", "Preparation"]);
  change("公版里程碑名稱", "No Type public work"); change("階段", "stage-design");
  click("加入公版草稿");
  expect(state().draft!.candidateRelease.definitions.at(-1)?.milestoneTypeId).toBeNull();
  expect(within(row("No Type public work")).getByRole("checkbox", { name: "加入日期提醒" })).toBeEnabled();
  expect(within(row("MDRR")).getByRole("checkbox", { name: "加入日期提醒" })).toBeEnabled();
  expect(state().draft!.candidateRelease.definitions.find(item => item.id === "milestone-mdrr")?.milestoneTypeId).toBe("type-mdrr");
});

it("governance_primary_labels_are_traditional_chinese_and_simulation_disclosure_remains_exact_without_fake_permissions", () => {
  setup();
  for (const name of ["公版管理", "目前已發布公版", "自動提醒類型", "公版草稿", "既有專案需確認", "撤回既有跟進要求", "公版發布紀錄", "專案跟進紀錄"]) {
    expect(screen.getByRole("heading", { name })).toBeVisible();
  }
  expect(screen.getByText(disclosure)).toBeVisible();
  expect(screen.getByText("公版里程碑、設定與專案跟進紀錄")).toBeVisible();
  expect(screen.queryByText(/admin only|admin login|permission required|管理員登入|權限不足/i)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "回到 Dashboard" })).toBeEnabled();
});
it("normal_governance_hides_technical_ids_in_text_and_accessible_labels_without_changing_identity", () => {
  const state = setup();
  const region = screen.getByRole("region", { name: "公版管理" });
  for (const id of [gateId, kickoff, state().currentReleaseId, "ux-draft", ...projects.map(project => project.id)]) {
    expect(region).not.toHaveTextContent(id);
    expect(region.querySelector(`[aria-label*="${id}"], [title*="${id}"]`)).toBeNull();
  }
  expect(region).not.toHaveTextContent("Stable ID");
  expect(screen.getByLabelText("需確認的公版里程碑").querySelector(`option[value="${gateId}"]`)).toHaveTextContent("GOV Demo Gate");
  expect(state().draft!.candidateRelease.definitions.find(item => item.id === gateId)?.name).toBe("GOV Demo Gate");
});
it("governance_definition_table_header_and_first_column_are_sticky_with_opaque_corner_and_local_overflow", () => {
  setup();
  const table = screen.getByRole("table", { name: /public definitions and settings|公版里程碑與設定/ });
  for (const header of within(table).getAllByRole("columnheader")) expect(header).toHaveClass("sticky", "top-0", "bg-slate-50");
  for (const first of within(table).getAllByRole("rowheader")) expect(first).toHaveClass("sticky", "left-0", "bg-white", "min-w-[240px]");
  expect(within(table).getAllByRole("columnheader")[0]).toHaveClass("left-0", "z-30", "min-w-[240px]");
  expect(table.parentElement).toHaveClass("overflow-auto", "max-w-full");
  expect(table.closest("section[aria-label='公版管理']")).toHaveClass("min-w-0", "max-w-full");
});
it("governance_sticky_headers_have_a_bounded_vertical_scroll_owner", () => {
  setup();
  const table = screen.getByRole("table", { name: "公版里程碑與設定" });
  const scrollOwner = table.parentElement!;
  expect(scrollOwner).toHaveClass("max-h-[70vh]", "overflow-auto", "max-w-full");
  expect(scrollOwner).toContainElement(table);
  for (const header of within(table).getAllByRole("columnheader")) expect(header).toHaveClass("sticky", "top-0");
});
it("new_project_requirement_is_disabled_when_not_addable_without_changing_other_memberships", () => {
  const state = setup();
  expect(check("新案需確認")).toBeDisabled();
  expect(check("新案需確認")).toHaveAttribute("title", "新案需確認的里程碑必須同時設為「可新增」。");
  fireEvent.click(check("新案需確認"));
  expect(state().draft!.candidateRelease.newProjectRequirementDefinitionIds).not.toContain(gateId);
  fireEvent.click(check("加入日期提醒"));
  expect(check("新案需確認")).not.toBeChecked();
  fireEvent.click(check("可新增")); fireEvent.click(check("新案需確認"));
  expect(check("新案需確認")).toBeChecked(); expect(check("加入日期提醒")).toBeChecked();
});
it("cannot_turn_off_addable_while_requirement_remains_checked_and_retire_never_clears_memberships", () => {
  const state = setup(); fireEvent.click(check("可新增")); fireEvent.click(check("新案需確認"));
  const before = state(); fireEvent.click(check("可新增"));
  expect(state()).toBe(before); expect(check("可新增")).toBeChecked(); expect(check("新案需確認")).toBeChecked();
  expect(within(row()).getByText("請先取消「新案需確認」，再取消「可新增」。")).toBeVisible();
  fireEvent.click(within(row()).getByRole("button", { name: "停用" }));
  expect(state()).toBe(before);
  fireEvent.click(check("新案需確認")); fireEvent.click(check("可新增"));
  expect(check("可新增")).not.toBeChecked();
});
it("requirement_addable_conflict_hides_debug_details_without_replacing_command_validation", () => {
  const initial = draftState(); const candidate = initial.draft!.candidateRelease;
  const malformed = value(updateGovernanceDraft(initial, { kind: "replace-candidate-release", candidateRelease: { ...candidate, newProjectRequirementDefinitionIds: [gateId] } }));
  const state = setup(malformed); const region = showPreview();
  expect(within(region).getByText("GOV Demo Gate 已設為「新案需確認」，但目前不可新增。請先設為「可新增」，或取消「新案需確認」。")).toBeVisible();
  expect(within(region).queryByText("顯示技術細節")).not.toBeInTheDocument();
  expect(region.querySelector("pre")).toBeNull();
  expect(region).not.toHaveTextContent("retire-requirement-conflict");
  expect(region).not.toHaveTextContent(gateId);
  expect(screen.getByRole("button", { name: "發布公版" })).toBeDisabled();
  expect(state()).toBe(malformed);
  expect(previewGovernancePublish(state(), { projects, schedules: [] }).blockingIssues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "retire-requirement-conflict", target: { section: "newProjectRequirementDefinitionIds", entityId: gateId } })]));
});
it("project_picker_defaults_to_non_eol_without_auto_selection_or_assignments_and_supports_multi_select", () => {
  const state = setup(); expect(screen.getByLabelText("專案狀態")).toHaveValue("non-eol");
  expect(options()).toEqual(["Project 0", "Project 1", "Project 2", "Project 4", "Project 5"]);
  expect(state().draft!.existingProjectAssignments).toEqual([]); expect(screen.getByText("已選 0 個專案")).toBeVisible();
  change("需確認的公版里程碑", kickoff); pick("Project 0"); pick("Project 1");
  expect(screen.getByText("已選 2 個專案")).toBeVisible(); click("加入已選專案");
  expect(state().draft!.existingProjectAssignments).toEqual([{ projectId: projects[0].id, milestoneDefinitionId: kickoff }, { projectId: projects[1].id, milestoneDefinitionId: kickoff }]);
});
it("project_picker_searches_project_and_qci_project_name_and_preserves_selection_across_filters", () => {
  setup(); change("需確認的公版里程碑", kickoff); pick("Project 0");
  change("搜尋專案", "project 1"); expect(options()).toEqual(["Project 1"]); pick("Project 1");
  change("搜尋專案", "qci model 2"); expect(options()).toEqual(["Project 2"]);
  expect(within(picker()).getByText("QCI Model 2")).toBeVisible();
  change("搜尋專案", ""); change("專案狀態", "status-eol"); expect(options()).toEqual(["Project 3"]);
  expect(screen.getByText("已選 2 個專案")).toBeVisible(); change("專案狀態", "all");
  expect(within(picker()).getByRole("checkbox", { name: "Project 0" })).toBeChecked();
  expect(within(picker()).getByRole("checkbox", { name: "Project 1" })).toBeChecked();
  click("清除選取"); expect(screen.getByText("已選 0 個專案")).toBeVisible();
});
it.each([["status-pending", ["Project 0"]], ["status-on-going", ["Project 1"]], ["status-mp", ["Project 2"]], ["status-eol", ["Project 3"]], ["all", ["Project 0", "Project 1", "Project 2", "Project 3", "Project 4", "Project 5"]]] as const)("project_picker_filters_each_status_%s", (status, names) => {
  setup(); change("專案狀態", status); expect(options()).toEqual(names);
});
it("select_all_filtered_selects_only_filtered_eligible_rows_and_existing_assignment_is_not_duplicated", () => {
  const initial = draftState(); const seeded = value(updateGovernanceDraft(initial, { kind: "replace-existing-project-assignments", assignments: [{ projectId: projects[0].id, milestoneDefinitionId: kickoff }] }));
  const state = setup(seeded); change("需確認的公版里程碑", kickoff);
  expect(within(picker()).getByRole("checkbox", { name: "Project 0" })).toBeDisabled();
  expect(within(picker()).getByRole("checkbox", { name: "Project 0" })).toBeChecked();
  expect(within(picker()).getByText("已加入", { exact: true })).toBeVisible();
  change("專案狀態", "status-on-going"); click("選取目前篩選結果");
  expect(screen.getByText("已選 1 個專案")).toBeVisible(); click("加入已選專案");
  expect(state().draft!.existingProjectAssignments).toEqual([{ projectId: projects[0].id, milestoneDefinitionId: kickoff }, { projectId: projects[1].id, milestoneDefinitionId: kickoff }]);
  click("加入已選專案"); expect(state().draft!.existingProjectAssignments).toHaveLength(2);
});
it("eol_project_can_be_explicitly_selected_when_filter_allows", () => {
  const state = setup(); change("需確認的公版里程碑", kickoff); change("專案狀態", "status-eol"); pick("Project 3"); click("加入已選專案");
  expect(state().draft!.existingProjectAssignments).toEqual([{ projectId: projects[3].id, milestoneDefinitionId: kickoff }]);
});
it("preview_is_human_diff_only_with_date_reminder_wording_and_no_raw_dump", () => {
  setup(); fireEvent.click(check("可新增")); fireEvent.click(check("顯示於總表")); fireEvent.click(check("新案需確認"));
  fireEvent.click(check("顯示於總表", "Kickoff"));
  const region = showPreview();
  expect(within(region).getByText("新增公版 +1｜可新增 +1/-0｜總表欄位 +1/-1｜加入日期提醒 +0/-0｜新案需確認 +1/-0｜停用 0")).toBeVisible();
  for (const heading of ["新增公版", "可新增設定變更", "總表欄位變更", "新案需確認變更"]) expect(within(region).getByRole("heading", { name: heading })).toBeVisible();
  expect(within(region).queryByRole("heading", { name: "加入日期提醒變更" })).not.toBeInTheDocument();
  expect(within(region).queryByRole("heading", { name: "停用公版" })).not.toBeInTheDocument();
  expect(within(region).queryByText("顯示技術細節")).not.toBeInTheDocument();
  expect(region).not.toHaveTextContent("milestone-c1-close");
  expect(region).not.toHaveTextContent("Close");
  expect(region.querySelector("pre")).toBeNull();
  const headings = within(region).getAllByRole("heading").map(item => item.textContent);
  expect(headings.slice(0, 3)).toEqual(["公版發布預覽", "阻擋原因", "提醒事項"]);
  const summary = within(region).getByLabelText("發布變更摘要");
  for (const heading of ["阻擋原因", "提醒事項"]) expect(within(region).getByRole("heading", { name: heading }).compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(region).not.toHaveTextContent("addableDefinitionIds"); expect(region).not.toHaveTextContent("portfolioColumnDefinitionIds");
});

// These tests catch selecting a global/tie order, stale Stage anchors, filter OR,
// automatic opt-in writes, and leaking command diagnostics into normal content.
function add(name: string, position?: string) {
  change("公版里程碑名稱", name); change("類型", "type-test");
  if (position) change("插入位置", position);
  click("加入公版草稿");
}
it("inserts_at_stage_end_front_bundled_anchor_and_runtime_anchor_without_renumbering", () => {
  const state = setup(); const before = state().draft!.candidateRelease.definitions;
  change("階段", "stage-c1");
  expect(screen.getByLabelText("插入位置")).toHaveValue("end");
  add("C1 end"); add("C1 front", "start");
  add("C1 after bundled", "milestone-c1-c-g-o");
  expect(within(screen.getByLabelText("插入位置")).getByRole("option", { name: "放在「C1 after bundled」之後" })).toHaveValue("inserted-3");
  add("C1 after runtime", "inserted-3");
  const definitions = state().draft!.candidateRelease.definitions;
  expect(definitions.filter(item => item.stageGroupId === "stage-c1").length).toBe(10);
  expect(orderMilestoneDefinitions(definitions.filter(item => item.stageGroupId === "stage-c1"), state().draft!.candidateRelease.stageGroups).map(item => item.id)).toEqual([
    "inserted-2", "milestone-c1-c-g-o", "inserted-3", "inserted-4", "milestone-c1-c-smt", "milestone-c1-c-pre-build", "milestone-c1-c-main-build", "milestone-c1-c-test", "milestone-c1-close", "inserted-1",
  ]);
  expect(definitions.slice(0, before.length)).toEqual(before);
  expect(definitions.slice(-4).map(item => item.displayOrder)).toEqual([180, 110, 125, 127.5]);
});
it("stage_change_refreshes_anchor_choices_and_resets_invalid_anchor_to_end", () => {
  setup(); change("階段", "stage-c1"); change("插入位置", "milestone-c1-close");
  change("階段", "stage-c2");
  expect(screen.getByLabelText("插入位置")).toHaveValue("end");
  expect(within(screen.getByLabelText("插入位置")).getByRole("option", { name: "放在「C2 Close」之後" })).toBeInTheDocument();
  expect(screen.getByLabelText("插入位置").querySelector('option[value="milestone-c1-close"]')).toBeNull();
  expect(screen.getByLabelText("插入位置").querySelector('option[value="milestone-c2-c-close"]')).not.toBeNull();
});
it.each(["duplicate", "not-finite", "no-midpoint"])("invalid_stage_order_%s_rejects_add_atomically_with_human_error", kind => {
  const initial = draftState(); const candidate = initial.draft!.candidateRelease;
  const definitions = candidate.definitions.map(item => item.id === "milestone-c1-c-smt" ? { ...item, displayOrder: kind === "duplicate" ? 120 : kind === "not-finite" ? NaN : 120 + Number.EPSILON * 64 } : item);
  const malformed = value(updateGovernanceDraft(initial, { kind: "replace-candidate-release", candidateRelease: { ...candidate, definitions } }));
  const state = setup(malformed); change("階段", "stage-c1"); add("Must not add", "milestone-c1-c-g-o");
  expect(state()).toBe(malformed); expect(screen.getByRole("alert")).toHaveTextContent("無法插入");
  expect(screen.getByRole("alert")).not.toHaveTextContent("milestone-c1");
  expect(screen.getByLabelText("公版里程碑名稱")).toHaveValue("Must not add");
});
it("year_options_are_derived_sorted_unique_and_all_years_is_default", () => {
  setup(); const year = screen.getByLabelText("年份");
  expect(year).toHaveValue("all");
  expect(within(year).getAllByRole("option").map(item => item.textContent)).toEqual(["全部年份", "2026", "2027"]);
  expect(options()).toContain("Project 4");
});
it("search_year_status_intersection_select_all_preserves_selections_across_years_and_skips_assigned", () => {
  const state = setup(); change("需確認的公版里程碑", kickoff); pick("Project 1");
  change("年份", "2027"); expect(options()).toEqual(["Project 0", "Project 2"]);
  change("專案狀態", "status-mp"); change("搜尋專案", "QCI Model 2");
  expect(options()).toEqual(["Project 2"]); click("選取目前篩選結果");
  expect(screen.getByText("已選 2 個專案")).toBeVisible(); click("加入已選專案");
  expect(state().draft!.existingProjectAssignments).toEqual([{ projectId: projects[1].id, milestoneDefinitionId: kickoff }, { projectId: projects[2].id, milestoneDefinitionId: kickoff }]);
  expect(within(picker()).getByRole("checkbox", { name: "Project 2" })).toBeChecked();
  expect(within(picker()).getByRole("checkbox", { name: "Project 2" })).toBeDisabled();
  click("選取目前篩選結果"); expect(screen.getByText("已選 0 個專案")).toBeVisible();
  change("搜尋專案", ""); change("專案狀態", "all"); change("年份", "2026");
  expect(within(picker()).getByRole("checkbox", { name: "Project 1" })).toBeChecked();
});
it("type_explanation_and_date_reminder_indicator_follow_automatic_type_policy_without_mutating_redundant_membership", () => {
  const initial = draftState(); const candidate = initial.draft!.candidateRelease;
  const redundantId = toMilestoneDefinitionId("milestone-c1-c-g-o");
  const seeded = value(updateGovernanceDraft(initial, { kind: "replace-candidate-release", candidateRelease: { ...candidate, additionalAttentionDefinitionIds: [redundantId] } }));
  const state = setup(seeded);
  expect(screen.getByText("G/O、SMT、Pre-Build、Close 會自動加入 Dashboard 的 Upcoming / Overdue；其他類型或無類型可另外設定「加入日期提醒」。")).toBeVisible();
  expect(screen.getByText("G/O、SMT、Pre-Build、Close 會自動提醒；其他類型或無類型可勾選加入 Dashboard 的 Upcoming / Overdue。")).toBeVisible();
  const table = screen.getByRole("table", { name: "公版里程碑與設定" });
  expect(within(table).getByRole("columnheader", { name: "加入日期提醒" })).toBeVisible();
  const automatic = candidate.definitions.filter(item => item.milestoneTypeId !== null && ["type-g-o", "type-smt", "type-pre-build", "type-close"].includes(item.milestoneTypeId));
  expect(automatic.length).toBeGreaterThan(4);
  for (const definition of automatic) {
    const row = within(table).getByRole("rowheader", { name: definition.name }).closest("tr")!;
    expect(within(row).getByText("自動提醒")).toBeVisible();
    expect(within(row).queryByRole("checkbox", { name: "加入日期提醒" })).not.toBeInTheDocument();
  }
  expect(state()).toBe(seeded);
  fireEvent.click(check("加入日期提醒"));
  expect(state().draft!.candidateRelease.additionalAttentionDefinitionIds).toEqual([redundantId, gateId]);
  expect(showPreview()).toHaveTextContent("加入日期提醒變更");
});
it("SSL/GL uses the existing definition with a noninteractive automatic reminder and presentation labels", () => {
  const initial = draftState();
  const state = setup(initial);
  const table = screen.getByRole("table", { name: "公版里程碑與設定" });
  const sslGl = within(table).getByRole("rowheader", { name: "SSL/GL" }).closest("tr")!;
  expect(within(sslGl).getByText("自動提醒")).toBeVisible();
  expect(within(sslGl).queryByRole("checkbox", { name: "加入日期提醒" })).not.toBeInTheDocument();
  expect(within(table).queryByRole("rowheader", { name: "FCS" })).not.toBeInTheDocument();
  expect(check("加入日期提醒", "MDRR")).not.toBeChecked();
  expect(state()).toBe(initial);
  expect(state().draft!.candidateRelease.additionalAttentionDefinitionIds).toEqual([]);
  change("階段", "stage-ramp");
  expect(within(screen.getByLabelText("插入位置")).getByRole("option", { name: "放在「SSL/GL」之後" })).toHaveValue("milestone-ramp-fcs");
  expect(within(screen.getByLabelText("需確認的公版里程碑")).getByRole("option", { name: "SSL/GL｜RAMP-stage｜FCS" })).toHaveValue("milestone-ramp-fcs");
  fireEvent.click(within(sslGl).getByRole("checkbox", { name: "顯示於總表" }));
  const preview = showPreview();
  expect(preview).toHaveTextContent("SSL/GL · 移除");
  expect(preview).not.toHaveTextContent("FCS · 移除");
  expect(state().draft!.candidateRelease.definitions).toEqual(initial.draft!.candidateRelease.definitions);
});

it("unknown_command_issues_use_safe_visible_fallback_without_raw_message_code_or_ids", () => {
  setup(undefined, [{ code: "unknown-secret-code", domain: "governance", source: "data", severity: "blocking", message: "failure runtime-secret-uuid", target: { section: "definitions", entityId: "runtime-secret-uuid" } }]);
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("公版設定需要調整");
  for (const secret of ["unknown-secret-code", "runtime-secret-uuid", "技術細節"]) expect(alert).not.toHaveTextContent(secret);
  expect(alert.querySelector("pre, details")).toBeNull();
});
it("governance_stage_picker_displays_A2_with_the_original_canonical_id_and_order", () => {
  setup(); const stage = screen.getByLabelText("階段");
  expect(within(stage).getByRole("option", { name: "A2-stage" })).toHaveValue("stage-a-a2");
  expect(within(stage).getAllByRole("option").map(item => item.getAttribute("value"))).toEqual(["", "stage-design", "stage-me-portion", "stage-thermal", "stage-a1", "stage-a-a2", "stage-c1", "stage-c2", "stage-ramp", "stage-mdrr"]);
  expect(screen.getByRole("region", { name: "公版管理" })).not.toHaveTextContent("A/A2-stage");
});

it.each([true, false])("history_labels_exact_pair_reassignment_across_releases_%s_without_fabricating_other_milestone_retarget", sameDefinition => {
  let state = createInitialMilestoneGovernanceRuntimeState();
  const target = sameDefinition ? kickoff : toMilestoneDefinitionId("milestone-design-id-fix");
  for (let sequence = 1; sequence <= 3; sequence++) {
    state = value(startGovernanceDraft(state, toGovernanceDraftId(`history-draft-${sequence}`)));
    if (sequence === 2) state = value(updateGovernanceDraft(state, { kind: "replace-withdrawals", enrollmentIds: [toRequirementEnrollmentId("history-enrollment-1")] }));
    if (sequence !== 2 || !sameDefinition) state = value(updateGovernanceDraft(state, { kind: "replace-existing-project-assignments", assignments: [{ projectId: projects[0].id, milestoneDefinitionId: sequence === 1 ? kickoff : target }] }));
    state = value(publishGovernanceDraft(state, { projects, schedules: [] }, {
      createReleaseId: () => toGovernanceReleaseId(`history-release-${sequence}`),
      createEnrollmentId: () => toRequirementEnrollmentId(`history-enrollment-${sequence}`),
      createWithdrawalId: () => toRequirementWithdrawalId(`history-withdrawal-${sequence}`), nowIso: () => `2026-10-0${sequence}T00:00:00Z`,
    }));
    if (!sameDefinition && sequence === 2) break;
  }
  setup(state); const history = screen.getByRole("region", { name: "專案跟進紀錄" });
  const latest = history.querySelectorAll("article")[1];
  expect(latest).toHaveTextContent(sameDefinition ? "重新指定" : "加入既有專案");
  expect(latest).toHaveTextContent(sameDefinition ? "試用發布 #3" : "試用發布 #2");
  expect(history).toHaveTextContent("撤回於 試用發布 #2");
  for (const secret of ["history-enrollment", "history-release", "history-withdrawal", "picker-project", "milestone-design"]) expect(history).not.toHaveTextContent(secret);
});
