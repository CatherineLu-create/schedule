import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { GovernanceWorkspace } from "./governanceWorkspace";
import { createInitialMilestoneGovernanceRuntimeState } from "./application/governance/milestoneGovernanceInitializer";
import { selectEffectiveMilestoneGovernanceContext } from "./application/governance/effectiveMilestoneGovernanceContext";
import { previewGovernancePublish, publishGovernanceDraft, startGovernanceDraft, updateGovernanceDraft } from "./application/governance/milestoneGovernanceCommands";
import type { CommandResult, GovernancePublishPreview, MilestoneGovernanceRuntimeState } from "./domain/governance/milestoneGovernance";
import type { MilestoneDefinition } from "./domain/schedule/milestoneCatalog";
import { toGovernanceDraftId, toGovernanceReleaseId, toMilestoneDefinitionId, toRequirementEnrollmentId, toRequirementWithdrawalId, toStageGroupId } from "./domain/shared/ids";

afterEach(cleanup);

function value<T>(result: CommandResult<T, string>): T {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}
const initialState = () => createInitialMilestoneGovernanceRuntimeState();
const start = (state = initialState()) => value(startGovernanceDraft(state, toGovernanceDraftId("ordering-draft")));
function withDefinitions(definitions: readonly MilestoneDefinition[]) {
  const state = start();
  return value(updateGovernanceDraft(state, { kind: "replace-candidate-release", candidateRelease: { ...state.draft!.candidateRelease, definitions } }));
}
function publish(state: MilestoneGovernanceRuntimeState) {
  return value(publishGovernanceDraft(state, { projects: [], schedules: [] }, {
    createReleaseId: () => toGovernanceReleaseId("ordering-release"),
    createEnrollmentId: () => toRequirementEnrollmentId("unused-ordering-enrollment"),
    createWithdrawalId: () => toRequirementWithdrawalId("unused-ordering-withdrawal"),
    nowIso: () => "2026-10-05T00:00:00.000Z",
  }));
}
function setup(initial: MilestoneGovernanceRuntimeState) {
  let observed = initial;
  function Harness() {
    const [state, setState] = React.useState(initial);
    const [preview, setPreview] = React.useState<GovernancePublishPreview | null>(null);
    observed = state;
    return <GovernanceWorkspace state={state} context={value(selectEffectiveMilestoneGovernanceContext(state))}
      projects={[]} schedules={[]} preview={preview}
      createDefinitionId={() => toMilestoneDefinitionId("ordering-new-a1")}
      onStartDraft={() => { setState(start(state)); setPreview(null); }}
      onUpdateDraft={update => { setState(value(updateGovernanceDraft(state, update))); setPreview(null); }}
      onPreview={() => setPreview(previewGovernancePublish(state, { projects: [], schedules: [] }))}
      onPublish={() => { setState(publish(state)); setPreview(null); }}
      onDiscard={() => {}} onBack={() => {}} />;
  }
  const view = render(<Harness />);
  return { state: () => observed, ...view };
}
function tableRows() {
  return within(screen.getByRole("table", { name: "公版里程碑與設定" })).getAllByRole("row").slice(1);
}
function rowNames(rows = tableRows()) {
  return rows.map(row => within(row).getByRole("rowheader").textContent);
}
function stageRows(stage: string) {
  return tableRows().filter(row => within(row).getAllByRole("cell")[0].textContent === stage);
}
function historyNames(releaseName: string) {
  const history = screen.getByRole("region", { name: "公版發布紀錄" });
  const article = within(history).getByRole("heading", { name: releaseName }).closest("article")!;
  const summary = within(article).getByText(/^已發布里程碑 · /, { selector: "summary" });
  const details = summary.closest("details")!;
  if (!details.open) fireEvent.click(summary);
  return within(details).getAllByRole("listitem").map(item => item.textContent!.split(" · ")[0]);
}
const click = (name: string) => fireEvent.click(screen.getByText(name, { selector: "button", exact: true }));
const change = (label: string, next: string) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value: next } });
function freezeDeep<T>(input: T): T {
  if (input !== null && typeof input === "object") {
    Object.values(input).forEach(freezeDeep);
    Object.freeze(input);
  }
  return input;
}

// These assertions catch raw storage order, alphabetical/type sorting, filtering,
// and in-place sorting; expected order is never computed by the shared sorter.
it("governance_table_uses_shared_canonical_stage_order", () => {
  setup(withDefinitions([...initialState().releases[0].definitions].reverse()));
  const stages = tableRows().map(row => within(row).getAllByRole("cell")[0].textContent);
  expect(stages.filter((stage, index) => index === 0 || stage !== stages[index - 1])).toEqual([
    "Design", "ME Portion", "Thermal", "A1-stage", "A2-stage", "C1-stage", "C2-stage", "RAMP-stage", "MDRR",
  ]);
});

it("newly_published_a1_definition_renders_inside_a1_group_not_at_end", () => {
  const initial = initialState();
  const baseline = structuredClone(initial);
  const view = setup(initial);
  click("建立公版草稿");
  change("公版里程碑名稱", "A__A");
  change("階段", "stage-a1");
  change("插入位置", "milestone-a1-a-g-o");
  expect(screen.getByLabelText("類型", { exact: true })).toHaveValue("");
  click("加入公版草稿");
  const candidate = view.state().draft!.candidateRelease;
  expect(candidate.definitions.at(-1)).toMatchObject({ name: "A__A", stageGroupId: "stage-a1", milestoneTypeId: null, displayOrder: 85 });
  expect(candidate.definitions.slice(0, -1)).toEqual(initial.releases[0].definitions);
  const addedRow = screen.getByRole("rowheader", { name: "A__A" }).closest("tr")!;
  fireEvent.click(within(addedRow).getByRole("checkbox", { name: "可新增" }));
  const draftSnapshot = structuredClone(view.state().draft);
  click("檢查並預覽發布");
  expect(screen.getByRole("button", { name: "發布公版" })).toBeEnabled();
  click("發布公版");
  expect(view.state().draft).toBeNull();
  expect(view.state().releases).toHaveLength(2);
  expect(view.state().releases[1].definitions).toEqual(draftSnapshot!.candidateRelease.definitions);
  expect(view.state().releases[1].addableDefinitionIds).toContain("ordering-new-a1");
  const expected = ["A1 G/O", "A__A", "A1 SMT", "A1 Test", "A1 Close", "A G/O", "C1 G/O", "C2 G/O", "RAMP G/O", "MDRR"];
  expect.soft(historyNames("試用發布 #1 · 目前使用").filter(name => expected.includes(name))).toEqual(expected);
  click("建立公版草稿");
  expect(rowNames().filter(name => expected.includes(name!))).toEqual(expected);
  expect(initial).toEqual(baseline);
});

it("governance_table_respects_within_stage_display_order", () => {
  setup(withDefinitions([...initialState().releases[0].definitions].reverse()));
  expect(rowNames(stageRows("A1-stage"))).toEqual(["A1 G/O", "A1 SMT", "A1 Test", "A1 Close"]);
});

it.each([false, true])("governance_table_uses_stable_id_tiebreak_reverse_%s", reverse => {
  const definitions = initialState().releases[0].definitions;
  const a1 = definitions.find(item => item.id === "milestone-a1-a-g-o")!;
  const ties = [
    { ...a1, id: toMilestoneDefinitionId("ordering-z"), name: "A label", displayOrder: 95 },
    { ...a1, id: toMilestoneDefinitionId("ordering-a"), name: "Z label", displayOrder: 95 },
  ];
  const input = [...definitions, ...ties];
  setup(withDefinitions(reverse ? input.reverse() : input));
  expect(rowNames(stageRows("A1-stage"))).toEqual(["A1 G/O", "A1 SMT", "Z label", "A label", "A1 Test", "A1 Close"]);
});

it("governance_table_does_not_mutate_release_definition_order", () => {
  const source = freezeDeep([...initialState().releases[0].definitions].reverse());
  const published = publish(withDefinitions(source));
  const state = freezeDeep(start(published));
  const before = structuredClone(state);
  const sourceBefore = structuredClone(source);
  setup(state);
  expect(tableRows()).toHaveLength(source.length);
  expect(historyNames("試用發布 #1 · 目前使用")).toHaveLength(source.length);
  expect(state).toEqual(before);
  expect(source).toEqual(sourceBefore);
});

it("optional_type_definition_participates_in_same_ordering", () => {
  const definitions = initialState().releases[0].definitions;
  const a1 = definitions.find(item => item.id === "milestone-a1-a-g-o")!;
  setup(withDefinitions([...definitions, { ...a1, id: toMilestoneDefinitionId("ordering-null-type"), name: "Optional Type", milestoneTypeId: null, displayOrder: 95 }]));
  expect(rowNames(stageRows("A1-stage"))).toEqual(["A1 G/O", "A1 SMT", "Optional Type", "A1 Test", "A1 Close"]);
});

it("retired_or_legacy_displayed_rows_keep_existing_membership_and_sort_deterministically", () => {
  const started = value(updateGovernanceDraft(start(), { kind: "retire-stage", id: toStageGroupId("stage-a-a2") }));
  const candidate = started.draft!.candidateRelease;
  const retired = value(updateGovernanceDraft(started, { kind: "replace-candidate-release", candidateRelease: {
    ...candidate, definitions: [...candidate.definitions].reverse(),
    addableDefinitionIds: candidate.addableDefinitionIds.filter(id => id !== "milestone-a1-a-close"),
  } }));
  const state = start(publish(retired));
  const snapshot = structuredClone(state);
  setup(state);
  const names = rowNames();
  const expected = ["Kickoff", "A1 Close", "A G/O", "BIOS frozen", "MDRR"];
  expect.soft(names.filter(name => expected.includes(name!))).toEqual(expected);
  expect.soft(historyNames("試用發布 #1 · 目前使用").filter(name => expected.includes(name))).toEqual(expected);
  expect(names).toHaveLength(candidate.definitions.length);
  expect(new Set(names)).toEqual(new Set(candidate.definitions.map(item => item.id === "milestone-ramp-fcs" ? "SSL/GL" : item.name)));
  expect(new Set(historyNames("試用發布 #1 · 目前使用"))).toEqual(new Set(names));
  expect(within(stageRows("A2-stage")[0]).getByText("不可新增", { exact: false })).toBeInTheDocument();
  expect(state.draft!.candidateRelease.stageGroups.find(stage => stage.id === "stage-a-a2")?.active).toBe(false);
  expect(state).toEqual(snapshot);
});

it("unknown_stage_draft_rows_keep_existing_fallback_and_membership", () => {
  const definitions = initialState().releases[0].definitions;
  const unknown = { ...definitions[0], stageGroupId: toStageGroupId("unresolved-historical-stage"), displayOrder: -100 };
  setup(withDefinitions([
    { ...unknown, id: toMilestoneDefinitionId("unknown-z"), name: "A unknown" }, ...definitions,
    { ...unknown, id: toMilestoneDefinitionId("unknown-a"), name: "Z unknown" },
  ]));
  expect(rowNames().slice(-3)).toEqual(["MDRR", "Z unknown", "A unknown"]);
  expect(rowNames(stageRows("未設定階段"))).toEqual(["Z unknown", "A unknown"]);
});
