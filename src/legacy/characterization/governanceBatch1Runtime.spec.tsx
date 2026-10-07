import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { App } from "../../main";
import { selectProjectMilestoneFollowUp } from "../../application/selectors/projectMilestoneFollowUp";
import { selectDashboardAttention } from "../../application/selectors/dashboardAttention";
import { selectScheduleReviewTrace } from "../../application/selectors/scheduleReviewTrace";
import { selectEffectiveProjectMilestoneRequirements } from "../../application/governance/projectMilestoneRequirements";
import { prepareProjectCreationCommit } from "../../application/governance/projectCreationGovernance";
import { addScheduleWorkingDraftMilestone, publishScheduleWorkingDraft, startScheduleWorkingDraft, updateScheduleWorkingDraftMilestone } from "../../application/commands/canonicalScheduleCommands";
import { confirmScheduleImportDecision, mapDraftLocalOccurrenceToPublic, previewDraftLocalOccurrenceToPublic } from "../../application/commands/scheduleReviewCommands";
import { previewGovernancePublish, updateGovernanceDraft } from "../../application/governance/milestoneGovernanceCommands";
import { initialScheduleCommandContext } from "../../test/governanceTestUtils";
import type { PrototypeState } from "../../application/state/prototypeState";
import type { CommandResult } from "../../domain/governance/milestoneGovernance";
import { createEmptyCanonicalProjectSchedule, getCurrentPublishedVersion, type CanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import { parseDateOnly } from "../../domain/shared/dateOnly";
import { toCanonicalScheduleWorkingDraftId, toMilestoneDefinitionId, toMilestoneId, toScheduleReviewDecisionId, toScheduleReviewSessionId } from "../../domain/shared/ids";
import { devProject001, devProject002 } from "../../fixtures/v2/canonicalProjectFixtures";

// Call-through observation of real App sibling states. No mocked authority, command result,
// initializer, second App, or reconstructed workbook; only the external download is replaced.
vi.mock("../../application/selectors/projectMilestoneFollowUp", async original => {
  const actual = await original<typeof import("../../application/selectors/projectMilestoneFollowUp")>();
  return { ...actual, selectProjectMilestoneFollowUp: vi.fn(actual.selectProjectMilestoneFollowUp) };
});
vi.mock("xlsx", async original => ({ ...await original<typeof import("xlsx")>(), writeFile: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

const referenceDate = parseDateOnly("2026-10-01")!;
const kickoff = "milestone-design-kickoff";
const idFix = "milestone-design-id-fix";
const mdrr = "milestone-mdrr";
const initialTypeLabels = ["No Type", "G/O", "SMT", "Pre-Build", "Close", "Test", "Certification", "Preparation"];
const projectHeaders = ["Status", "Year", "STN Project Name", "QCI Model Name", "Customer", "Category", "Product Line", "Panel Size", "CPU", "GPU", "PCB#"];
const scheduleHeaders = ["Kickoff", "ID fix", "ME drawing", "Mockup & DFM", "Tooling start + T1", "ME material for C", "Thermal module for C", "A1 G/O", "A1 SMT", "A1 Test", "A1 Close", "C1 G/O", "C1 SMT", "C1 Pre-Build", "C1 System Build", "C1 Test", "C1 Close", "C2 G/O", "C2 SMT", "C2 Pre-Build", "C2 System Build", "C2 Test", "C2 Close", "RAMP G/O", "ME signoff", "RAMP SMT", "RAMP Pre-build", "RAMP Main build", "SSL/GL", "MDRR"];
const teamHeaders = ["QCI PM", "QCI PjM", "Acer PM", "ME Owner", "EE Owner", "Thermal Owner", "BIOS Owner"];

function value<T>(result: CommandResult<T, string>): T {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}
function scheduleValue(result: { ok: true; schedule: CanonicalProjectSchedule } | { ok: false }): CanonicalProjectSchedule {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.schedule;
}
function live() {
  const call = vi.mocked(selectProjectMilestoneFollowUp).mock.calls.at(-1);
  if (!call) throw new Error("App has not rendered its actual consumers");
  return { prototype: call[0], governance: call[1], context: call[2] };
}
function schedule(projectId = devProject001.id) {
  return live().prototype.schedules.find(item => item.projectId === projectId)!;
}
function commandContext() {
  return { governance: live().context, localDefinitions: schedule().localDefinitions, retiredDraftOccurrenceGrants: live().governance.retiredDraftOccurrenceGrants };
}
function mount(initialSchedule = createEmptyCanonicalProjectSchedule(devProject001.id), second = false) {
  const initialState: PrototypeState = {
    projects: second ? [devProject001, devProject002] : [devProject001],
    schedules: second ? [initialSchedule, createEmptyCanonicalProjectSchedule(devProject002.id)] : [initialSchedule],
  };
  return render(<App initialState={initialState} referenceDate={referenceDate} />);
}
function click(name: string | RegExp) { fireEvent.click(screen.getByRole("button", { name })); }
function change(label: string, next: string, root?: HTMLElement) {
  fireEvent.change((root ? within(root) : screen).getByLabelText(label), { target: { value: next } });
}
function optionLabels(label: string) { return within(screen.getByLabelText(label)).getAllByRole("option").map(option => option.textContent); }
function dashboard() {
  if (screen.queryByRole("button", { name: "回到 Dashboard" })) click("回到 Dashboard");
  else click(/Dashboard/);
}
function openProject(name = "Manta") { fireEvent.click(within(screen.getByRole("table", { name: "Projects" })).getByRole("button", { name: `Open Project ${name}` })); }
function governance(start = false) {
  click("Governance");
  if (start) click("建立公版草稿");
}
function release() { click("檢查並預覽發布"); click("發布公版"); }
function governanceRow(name: string) { return screen.getByRole("rowheader", { name }).closest("tr")!; }
function setting(name: string, label: string) { fireEvent.click(within(governanceRow(name)).getByRole("checkbox", { name: label })); }
function publicDefinition(name: string, stage = "stage-design", type = "") {
  change("公版里程碑名稱", name); change("階段", stage); change("類型", type); click("加入公版草稿");
  return live().governance.draft!.candidateRelease.definitions.find(item => item.name === name)!.id;
}
function openLocal() { change("Milestone definition", "create-project-local"); }
function createLocal(name: string, stage = "stage-design", type = "") {
  openLocal(); change("Milestone Name", name); change("Stage", stage); change("Type (optional)", type);
  click("Create Project-specific Milestone");
  return schedule().localDefinitions.at(-1)!.id;
}
function add(id: string) { change("Milestone definition", id); click("Add Milestone"); }
function applyDate(name: string, date: string, field = "Plan") {
  const input = screen.getByLabelText(new RegExp(`^${field} for ${name} occurrence`));
  fireEvent.change(input, { target: { value: date } });
  click(`Apply Date to ${input.getAttribute("aria-label")}`);
}
function publishSchedule() {
  click("Publish");
  fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" })).getByRole("button", { name: "Publish" }));
}
function advanced(pack?: string) {
  governance(); fireEvent.click(screen.getByText("進階治理與試用工具"));
  if (pack) change("模擬情境", pack);
}
function load(pack: string, consent = false) {
  change("模擬情境", pack); click("載入模擬匯入資料");
  if (consent) click("建立草稿並載入");
}
function candidate(index: number) { return screen.getByRole("article", { name: `匯入項目 ${index}` }); }
function confirm(index: number) { fireEvent.click(within(candidate(index)).getByRole("button", { name: "確認" })); }
function publishAdvanced() { click("發布此專案草稿"); click("確認發布"); }
function exportGrid(): string[][] {
  click("Export to Excel");
  const [workbook, filename] = vi.mocked(XLSX.writeFile).mock.calls.at(-1)!;
  expect(filename).toBe("Project_Portfolio_Summary.xlsx");
  expect(workbook.SheetNames).toEqual(["All Projects"]);
  const roundtrip = XLSX.read(XLSX.write(workbook, { type: "array", bookType: "xlsx" }), { type: "array" });
  return XLSX.utils.sheet_to_json<string[]>(roundtrip.Sheets["All Projects"], { header: 1, defval: "" });
}
function attention() {
  const result = selectDashboardAttention(live().prototype, referenceDate, live().context);
  if (result.kind !== "available") throw new Error(JSON.stringify(result));
  return result;
}
function seededSchedule(rows: readonly [string, string | null, string | null, "applicable" | "notApplicable"][]) {
  const context = initialScheduleCommandContext();
  let result = scheduleValue(startScheduleWorkingDraft(createEmptyCanonicalProjectSchedule(devProject001.id), { workingDraftId: toCanonicalScheduleWorkingDraftId("batch-seed") }, context));
  rows.forEach(([definitionId, plan, actual, applicability], index) => {
    const milestoneId = toMilestoneId(`batch-row-${index}`);
    result = scheduleValue(addScheduleWorkingDraftMilestone(result, { milestoneId, milestoneDefinitionId: toMilestoneDefinitionId(definitionId) }, context));
    for (const [field, date] of [["plan", plan], ["actual", actual]] as const) {
      result = scheduleValue(updateScheduleWorkingDraftMilestone(result, { milestoneId, field, value: date === null ? null : parseDateOnly(date) }, context));
    }
    result = scheduleValue(updateScheduleWorkingDraftMilestone(result, { milestoneId, field: "applicability", value: applicability }, context));
  });
  return scheduleValue(publishScheduleWorkingDraft(result, { publishedAt: "2026-09-30T00:00:00Z" }, context));
}
function assign(name = "Manta", definitionId = kickoff) {
  change("需確認的公版里程碑", definitionId);
  fireEvent.click(screen.getByRole("checkbox", { name })); click("加入已選專案");
}
function createProject(name: string) {
  click("Create Project");
  const dialog = screen.getByRole("dialog", { name: "Create Project" });
  change("Year", "2027", dialog); change("Product Line", "demo-product-line-aspire-refresh-id", dialog);
  change("STN Project Name", name, dialog); change("QCI Model Name", `MODEL ${name}`, dialog);
  return dialog;
}

describe("Batch 1 integrated governance runtime", () => {
  // Catches draft leakage, consumers stuck on different releases, classification auto-retirement,
  // automatic occurrence creation, and replacement of legacy identity/optional null Type.
  it("governance_draft_is_invisible_until_publish_then_all_consumers_switch_together", () => {
    const initial = seededSchedule([[mdrr, "2026-10-10", null, "applicable"]]);
    mount(initial);
    const originalRelease = live().context.releaseId;
    governance(true);
    change("新階段名稱", "Release stage"); click("新增階段");
    change("新類型名稱", "Ordinary gate"); click("新增類型");
    const stageId = live().governance.draft!.candidateRelease.stageGroups.find(item => item.displayName === "Release stage")!.id;
    const typeId = live().governance.draft!.candidateRelease.milestoneTypes.find(item => item.displayName === "Ordinary gate")!.id;
    const gateId = publicDefinition("Release gate", stageId, typeId);
    const untypedId = publicDefinition("Untyped gate");
    setting("Release gate", "可新增"); setting("Release gate", "顯示於總表");
    setting("Untyped gate", "可新增"); setting("MDRR", "加入日期提醒");
    click("檢查並預覽發布");
    expect(live().context.releaseId).toBe(originalRelease);
    expect(attention().due.matches).toEqual([]);
    dashboard();
    expect(exportGrid()[0]).toEqual([...projectHeaders, ...scheduleHeaders, ...teamHeaders]);
    openProject(); click("Edit");
    expect(optionLabels("Milestone definition")).not.toContain("Release gate");
    openLocal();
    expect(optionLabels("Stage")).not.toContain("Release stage");
    expect(optionLabels("Type (optional)")).toEqual(initialTypeLabels);
    click("Cancel");
    governance(); release();
    const released = live().governance.releases.at(-1)!;
    expect(live().context.releaseId).toBe(released.id);
    expect(released.definitions.find(item => item.id === untypedId)?.milestoneTypeId).toBeNull();
    expect(released.definitions.filter(item => [mdrr, kickoff, idFix].includes(item.id)).map(item => [item.id, item.milestoneTypeId])).toEqual([
      [kickoff, "type-kickoff"], [idFix, "type-id-fix"], [mdrr, "type-mdrr"],
    ]);
    expect(attention().due.matches.map(item => [item.milestoneDefinitionId, item.plan])).toEqual([[mdrr, "2026-10-10"]]);
    dashboard();
    expect(exportGrid()[0]).toContain("Release gate");
    openProject();
    expect(optionLabels("Milestone definition")).toContain("Release gate");
    expect(schedule().workingDraft!.milestones).toEqual(initial.publishedVersions[0].milestones);
    openLocal(); expect(optionLabels("Stage")).toContain("Release stage");
    expect(optionLabels("Type (optional)")).toEqual([...initialTypeLabels, "Ordinary gate"]);
    click("Cancel");
    const localId = createLocal("Typed local", stageId, typeId);
    expect(schedule().workingDraft!.milestones).toHaveLength(1);
    governance(true); click("停用階段 Release stage"); click("停用類型 Ordinary gate"); release();
    expect(live().context.definitionsForHistoricalResolution.find(item => item.id === gateId)).toMatchObject({ active: true, stageGroupId: stageId, milestoneTypeId: typeId });
    expect(live().context.addablePublicDefinitions.map(item => item.id)).toContain(gateId);
    click("建立公版草稿");
    expect(optionLabels("階段")).not.toContain("Release stage");
    click("捨棄公版草稿");
    dashboard(); openProject(); openLocal();
    expect(optionLabels("Stage")).not.toContain("Release stage");
    expect(optionLabels("Type (optional)")).toEqual(initialTypeLabels);
    click("Cancel"); add(localId); add(gateId);
    expect(schedule().workingDraft!.milestones.map(item => item.milestoneDefinitionId)).toEqual([mdrr, localId, gateId]);
    expect(getCurrentPublishedVersion(schedule())?.milestones).toEqual(initial.publishedVersions[0].milestones);
  }, 30000); // Measured 13.9s: bounded multi-release UI flow exceeds Vitest's default 5s.

  // Catches name-based/MDRR rules, exclusive +14 bounds, lack of Project dedupe,
  // and reading Working Draft dates/applicability instead of Current Published.
  it("Attention uses exact automatic identities and inclusive DateOnly windows while Draft edits stay invisible", () => {
    mount(seededSchedule([
      ["milestone-a1-a-g-o", "2026-10-01", null, "applicable"],
      ["milestone-c1-c-pre-build", "2026-10-15", null, "applicable"],
      ["milestone-ramp-fcs", "2026-09-30", null, "applicable"],
      ["milestone-a1-a-smt", "2026-10-16", null, "applicable"],
      ["milestone-a1-a-close", "2026-10-02", "2026-10-03", "applicable"],
      ["milestone-c1-close", null, null, "notApplicable"],
      [mdrr, "2026-10-03", null, "applicable"],
    ]));
    expect(attention().due).toMatchObject({ projectCount: 1, projectIds: ["dev-project-001"] });
    expect(attention().due.matches.map(item => [item.milestoneName, item.plan])).toEqual([["A1 G/O", "2026-10-01"], ["C1 Pre-Build", "2026-10-15"]]);
    expect(attention().overdue.matches.map(item => [item.milestoneDefinitionId, item.milestoneName, item.plan])).toEqual([["milestone-ramp-fcs", "SSL/GL", "2026-09-30"]]);
    expect(live().context.definitionsForHistoricalResolution.find(item => item.id === "milestone-ramp-fcs")?.name).toBe("FCS");
    openProject(); click("Edit");
    const local = createLocal("FCS"); add(local); applyDate("FCS", "2026-10-04");
    applyDate("A1 G/O", "2026-10-20");
    expect(attention().due.matches.map(item => item.milestoneName)).toEqual(["A1 G/O", "C1 Pre-Build"]);
    publishSchedule(); dashboard();
    expect(attention().due.matches.map(item => item.milestoneName)).toEqual(["C1 Pre-Build"]);
    expect(attention().overdue.projectCount).toBe(1);
    expect(within(screen.getByRole("group", { name: "Upcoming Milestones" })).getByText("1")).toBeVisible();
  });

  // Catches implicit enrollment, same-name/Draft completion, frozen completion flags,
  // withdrawal deleting history/altering Schedule, and duplicate effective reenrollment.
  it.each(["applicable", "notApplicable"] as const)("explicit follow-up survives local/Draft lookalikes, completes only Published %s, reopens and reenrolls", applicability => {
    mount(undefined, true);
    expect(screen.queryByRole("region", { name: "Milestone Follow-up" })).not.toBeInTheDocument();
    governance(true); setting("Kickoff", "新案需確認"); assign(); release();
    const originalEnrollment = live().governance.requirementEnrollments[0];
    expect(live().governance.requirementEnrollments).toHaveLength(1);
    expect(originalEnrollment).toMatchObject({ projectId: "dev-project-001", milestoneDefinitionId: kickoff, source: "explicit-existing-project" });
    dashboard();
    expect(screen.getByRole("region", { name: "Milestone Follow-up" })).toHaveTextContent("QCI PM: Unassigned");
    openProject(); click("Edit");
    const localId = createLocal("Kickoff"); add(localId);
    change("Applicability for Kickoff", "notApplicable"); publishSchedule();
    expect(schedule().localDefinitions[0].milestoneTypeId).toBeNull();
    expect(screen.getByRole("region", { name: "Milestone Follow-up" })).toHaveTextContent("Pending public milestones: Kickoff");
    click("Edit"); click("Remove Kickoff"); add(kickoff);
    if (applicability === "applicable") applyDate("Kickoff", "2026-10-20");
    else change("Applicability for Kickoff", "notApplicable");
    expect(screen.getByRole("region", { name: "Milestone Follow-up" })).toBeVisible();
    publishSchedule();
    expect(screen.queryByRole("region", { name: "Milestone Follow-up" })).not.toBeInTheDocument();
    click("Edit"); click("Remove Kickoff");
    expect(screen.queryByRole("region", { name: "Milestone Follow-up" })).not.toBeInTheDocument();
    publishSchedule();
    expect(screen.getByRole("region", { name: "Milestone Follow-up" })).toHaveTextContent("Pending public milestones: Kickoff");
    const beforeWithdrawal = structuredClone(schedule());
    const beforeAttention = attention();
    governance(true); fireEvent.click(screen.getByRole("checkbox", { name: "撤回 Manta · Kickoff" })); release();
    expect(live().governance.requirementEnrollments).toEqual([originalEnrollment]);
    expect(live().governance.requirementWithdrawals).toHaveLength(1);
    expect(live().governance.requirementWithdrawals[0].enrollmentId).toBe(originalEnrollment.id);
    expect(schedule()).toEqual(beforeWithdrawal); expect(attention()).toEqual(beforeAttention);
    dashboard(); expect(screen.queryByRole("region", { name: "Milestone Follow-up" })).not.toBeInTheDocument();
    governance(true); assign(); release();
    expect(live().governance.requirementEnrollments).toHaveLength(2);
    expect(live().governance.requirementEnrollments[1].id).not.toBe(originalEnrollment.id);
    expect(selectEffectiveProjectMilestoneRequirements(live().prototype, live().governance)).toMatchObject([
      { projectId: "dev-project-001", milestoneDefinitionId: kickoff, status: "pending" },
    ]);
    expect(screen.getByRole("region", { name: "專案跟進紀錄" })).toHaveTextContent("已撤回");
    expect(screen.getByRole("region", { name: "專案跟進紀錄" })).toHaveTextContent("重新指定");
  }, 30000);

  // Catches partial Project/enrollment commits on real allocation failure and retroactive R2 requirements.
  it("creation is atomic on actual validation and ID collision, and R1 requirements remain snapshots under R2", () => {
    mount(); governance(true);
    setting("Kickoff", "新案需確認"); setting("ID fix", "新案需確認"); release();
    const r1 = live().governance.currentReleaseId;
    dashboard();
    const before = structuredClone(live());
    click("Create Project"); click("Save");
    expect(live().prototype).toEqual(before.prototype); expect(live().governance).toEqual(before.governance);
    click("Cancel");
    const projectId = "11111111-1111-4111-8111-111111111111";
    const enrollmentId = "22222222-2222-4222-8222-222222222222";
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(projectId).mockReturnValueOnce(enrollmentId).mockReturnValueOnce(enrollmentId);
    createProject("R1 Project"); click("Save");
    expect(screen.getByRole("dialog", { name: "Create Project" })).toHaveTextContent("Could not allocate a unique requirement ID.");
    expect(live().prototype).toEqual(before.prototype); expect(live().governance).toEqual(before.governance);
    click("Save");
    expect(screen.getByRole("region", { name: "Project Header" })).toHaveAttribute("data-project-id", projectId);
    const created = live().prototype.projects.at(-1)!;
    const empty = live().prototype.schedules.at(-1)!;
    expect(empty).toEqual({ projectId, publishedVersions: [], workingDraft: null, localDefinitions: [], evidenceLedger: [], reviewSessions: [], reviewDecisions: [], reviewClosures: [] });
    expect(Object.keys(live().prototype).sort()).toEqual(["projects", "schedules"]);
    expect(live().governance.requirementEnrollments.map(item => [item.projectId, item.milestoneDefinitionId, item.assignedByReleaseId, item.source])).toEqual([
      [projectId, kickoff, r1, "new-project-at-creation"], [projectId, idFix, r1, "new-project-at-creation"],
    ]);
    const snapshot = structuredClone(live().governance.requirementEnrollments);
    const failed = prepareProjectCreationCommit(before.prototype, before.governance, { project: created, schedule: schedule() }, () => enrollmentId as typeof snapshot[0]["id"]);
    expect(failed).toMatchObject({ ok: false, code: "invalid-empty-schedule" });
    expect(live().governance.requirementEnrollments).toEqual(snapshot);
    governance(true);
    const r2Definition = publicDefinition("R2 gate"); setting("R2 gate", "可新增"); setting("R2 gate", "新案需確認"); release();
    const r2 = live().governance.currentReleaseId;
    expect(r2).not.toBe(r1); expect(live().governance.requirementEnrollments).toEqual(snapshot);
    dashboard(); openProject("R1 Project"); click("Edit");
    expect(optionLabels("Milestone definition")).toContain("R2 gate");
    expect(screen.getByRole("region", { name: "Milestone Follow-up" })).not.toHaveTextContent("R2 gate");
    dashboard(); createProject("R2 Project"); click("Save");
    expect(live().governance.requirementEnrollments.slice(2).map(item => [item.milestoneDefinitionId, item.assignedByReleaseId])).toEqual([[kickoff, r2], [idFix, r2], [r2Definition, r2]]);
  }, 30000);

  // Catches automatic same-name mapping, fabricated equivalence, loss of occurrence identity,
  // local registry/history rewrites, and ledger writes before validation succeeds.
  it.each([false, true])("Project-specific mapping requires four actual assertions and preserves dates/history: N/A=%s", na => {
    mount(); openProject(); click("Edit");
    openLocal();
    expect(optionLabels("Type (optional)")).toEqual(initialTypeLabels);
    expect(screen.getByRole("button", { name: "Create Project-specific Milestone" })).toBeDisabled();
    change("Milestone Name", "Manual acceptance"); change("Stage", "stage-design"); click("Create Project-specific Milestone");
    const localId = schedule().localDefinitions[0].id;
    expect(schedule().workingDraft!.milestones).toEqual([]);
    expect(schedule().localDefinitions[0]).toMatchObject({ milestoneTypeId: null, confirmation: "confirmed" });
    add(localId);
    expect(screen.getByText("Project-specific", { exact: true })).toBeVisible();
    if (na) change("Applicability for Manual acceptance", "notApplicable");
    else { applyDate("Manual acceptance", "2026-10-15"); applyDate("Manual acceptance", "2026-10-16", "Actual"); }
    publishSchedule(); click("Edit");
    const before = structuredClone(schedule());
    const row = before.workingDraft!.milestones[0];
    expect(screen.queryByRole("button", { name: "對應公版里程碑" })).not.toBeInTheDocument();
    advanced(); click("對應公版里程碑");
    const dialog = screen.getByRole("dialog", { name: "對應公版里程碑" });
    const checkboxes = within(dialog).getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(4);
    checkboxes.forEach(box => expect(box).not.toBeChecked());
    change("公版里程碑", kickoff, dialog);
    expect(within(dialog).getByRole("button", { name: "確認對應" })).toBeDisabled();
    checkboxes.slice(0, 3).forEach(box => fireEvent.click(box));
    expect(within(dialog).getByRole("button", { name: "確認對應" })).toBeDisabled();
    fireEvent.click(checkboxes[3]); click("確認對應");
    expect(schedule().workingDraft!.milestones).toEqual([{
      milestoneId: row.milestoneId, milestoneDefinitionId: kickoff, applicability: na ? "notApplicable" : "applicable",
      plan: na ? null : "2026-10-15", actual: na ? null : "2026-10-16",
    }]);
    expect(schedule().localDefinitions).toEqual(before.localDefinitions);
    expect(schedule().publishedVersions).toEqual(before.publishedVersions);
    expect(schedule().evidenceLedger).toEqual([]);
    expect(schedule().reviewSessions[0].source).toBe("manual-local-mapping");
    expect(schedule().reviewDecisions[0]).toMatchObject({ fromLocalDefinitionId: localId, toPublicDefinitionId: kickoff, targetMilestoneId: row.milestoneId,
      assertion: { workContent: true, stage: true, type: true, completionCriteria: true } });
    expect(screen.getByRole("region", { name: "審核紀錄" })).toHaveTextContent("尚未發布");
    publishAdvanced();
    expect(getCurrentPublishedVersion(schedule())!.milestones[0].milestoneId).toBe(row.milestoneId);
    expect(schedule().publishedVersions[0]).toEqual(before.publishedVersions[0]);
  }, 30000);

  // Catches accepting a preview's obsolete authority, duplicate-target merging or ledger append on failure.
  it("mapping duplicate/stale/retired targets fail atomically against the current release", () => {
    mount(); openProject(); click("Edit");
    const localId = createLocal("Manual gate"); add(localId); change("Applicability for Manual gate", "notApplicable");
    const row = schedule().workingDraft!.milestones[0];
    const request = { milestoneId: row.milestoneId, localDefinitionId: localId, publicDefinitionId: toMilestoneDefinitionId(kickoff),
      sessionId: toScheduleReviewSessionId("batch-mapping"), decisionId: toScheduleReviewDecisionId("batch-mapping"),
      assertion: { workContent: true as const, stage: true as const, type: true as const, completionCriteria: true as const } };
    add(kickoff); change("Applicability for Kickoff", "notApplicable");
    const duplicateBefore = structuredClone(schedule());
    expect(mapDraftLocalOccurrenceToPublic(schedule(), request, commandContext())).toMatchObject({ ok: false, code: "duplicate-target-definition" });
    expect(schedule()).toEqual(duplicateBefore);
    click("Remove Kickoff");
    const staleBefore = structuredClone(schedule());
    expect(mapDraftLocalOccurrenceToPublic(schedule(), { ...request, milestoneId: toMilestoneId("removed-row") }, commandContext())).toMatchObject({ ok: false, code: "target-not-found" });
    expect(schedule()).toEqual(staleBefore);
    advanced(); click("對應公版里程碑"); change("公版里程碑", kickoff);
    within(screen.getByRole("dialog", { name: "對應公版里程碑" })).getAllByRole("checkbox").forEach(box => fireEvent.click(box));
    expect(screen.getByRole("button", { name: "確認對應" })).toBeEnabled();
    expect(previewDraftLocalOccurrenceToPublic(schedule(), request, commandContext()).ok).toBe(true);
    click("建立公版草稿");
    fireEvent.click(within(governanceRow("Kickoff")).getByRole("button", { name: "停用" }));
    expect(previewGovernancePublish(live().governance, live().prototype).diff!.retiredDefinitionIds).toEqual([kickoff]);
    release();
    expect(live().context.addablePublicDefinitions.map(item => item.id)).not.toContain(kickoff);
    expect(screen.getByRole("button", { name: "確認對應" })).toBeDisabled();
    const retiredBefore = structuredClone(schedule());
    expect(mapDraftLocalOccurrenceToPublic(schedule(), request, commandContext())).toMatchObject({ ok: false, code: "definition-not-addable" });
    expect(schedule()).toEqual(retiredBefore);
    expect(schedule().reviewDecisions).toEqual([]); expect(schedule().reviewSessions).toEqual([]);
    click("建立公版草稿");
    const candidateRelease = live().governance.draft!.candidateRelease;
    const invalid = value(updateGovernanceDraft(live().governance, { kind: "replace-candidate-release", candidateRelease: {
      ...candidateRelease, newProjectRequirementDefinitionIds: [toMilestoneDefinitionId(kickoff)],
    } }));
    expect(previewGovernancePublish(invalid, live().prototype).blockingIssues.map(issue => issue.code)).toContain("retire-requirement-conflict");
    expect(live().governance.draft!.candidateRelease.newProjectRequirementDefinitionIds).toEqual([]);
  }, 30000);

  // Catches no-Draft consent allocating/mutating, baseline autofill, loader recreation,
  // whole-batch confirmation, immutable raw evidence repair, and Draft leaking into official reads.
  it.each([false, true])("fixable simulation respects no-Draft consent and exact Current Published clone: published=%s", published => {
    const initial = published ? seededSchedule([[mdrr, "2026-11-01", null, "applicable"]]) : undefined;
    mount(initial); governance();
    const summary = screen.getByText("進階治理與試用工具");
    expect(summary.closest("details")).not.toHaveAttribute("open"); fireEvent.click(summary);
    expect(screen.getByText("模擬匯入資料｜供 PIP 流程驗收，非 Kevin 正式 JSON 格式")).toBeVisible();
    expect(screen.getByText("真實 Kevin 匯入格式與操作流程將於取得正式資料後另行設計。")).toBeVisible();
    expect(optionLabels("模擬情境")).toEqual(["基本成功流程", "可修正錯誤", "已停用但可更新原列", "已停用且無合法引用（負向測試）"]);
    expect(document.querySelector('input[type="file"], textarea')).toBeNull();
    const before = structuredClone(live()); const uuid = vi.spyOn(globalThis.crypto, "randomUUID");
    load("fixable-validation");
    expect(screen.getByRole("dialog", { name: "建立草稿並載入模擬資料" })).toHaveTextContent(published ? "僅複製目前已發布排程" : "建立空白 Working Draft");
    click("取消"); expect(uuid).not.toHaveBeenCalled(); expect(live()).toEqual(before);
    load("fixable-validation", true);
    expect(schedule().workingDraft!.milestones).toEqual(published ? initial!.publishedVersions[0].milestones : []);
    const draftId = schedule().workingDraft!.workingDraftId;
    const raw = structuredClone(schedule().evidenceLedger);
    expect(raw[2].rawValues.plan).toEqual({ presence: "present", raw: "10/11/2026" });
    confirm(1);
    expect(schedule().workingDraft!.importCandidates.map(item => item.status)).toEqual(["confirmed", "pending", "pending"]);
    confirm(2);
    expect(schedule().workingDraft!.importCandidates.map(item => item.status)).toEqual(["confirmed", "confirmed", "pending"]);
    expect(screen.getByRole("button", { name: "發布此專案草稿" })).toBeDisabled();
    const beforeBlocked = structuredClone(schedule());
    expect(publishScheduleWorkingDraft(schedule(), { publishedAt: "2026-10-01T00:00:00Z" }, commandContext())).toMatchObject({ ok: false, reason: "validation-failed" });
    expect(schedule()).toEqual(beforeBlocked);
    load("fixable-validation");
    expect(schedule()).toEqual(beforeBlocked); expect(schedule().workingDraft!.workingDraftId).toBe(draftId);
    dashboard();
    expect(exportGrid()[1][11]).toBe("");
    expect(attention().due.matches).toEqual([]);
    advanced();
    change("計畫處理方式", "set", candidate(3)); change("計畫日期", "2026-10-17", candidate(3)); confirm(3);
    expect(schedule().workingDraft!.importCandidates.map(item => item.status)).toEqual(["confirmed", "confirmed", "confirmed"]);
    expect(schedule().evidenceLedger).toEqual(raw);
    publishAdvanced();
    expect(schedule().workingDraft).toBeNull();
    expect(getCurrentPublishedVersion(schedule())!.milestones.slice(published ? 1 : 0).map(row => [row.milestoneDefinitionId, row.plan, row.actual])).toEqual([
      [kickoff, "2026-10-15", null], [idFix, "2026-10-16", null], ["milestone-me-portion-me-drawing", "2026-10-17", null],
    ]);
    dashboard(); expect(exportGrid()[1][11]).toBe("Applicable\nP: 2026/10/15\nA: —");
    openProject();
    expect(screen.queryByRole("region", { name: "匯入審核" })).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"], textarea')).toBeNull();
  }, 30000);

  // Catches trace replay as date truth and merging a decision with the final edited/removed result.
  it("basic-success keeps review Plan 15 distinct from Published Plan 20, removed rows and discarded decisions", () => {
    mount(); openProject(); click("Edit"); const localId = createLocal("Trial local");
    const draftId = schedule().workingDraft!.workingDraftId;
    advanced(); load("basic-success");
    expect(schedule().workingDraft!.workingDraftId).toBe(draftId);
    expect(schedule().workingDraft!.milestones).toEqual([]);
    confirm(1); confirm(2); confirm(3);
    expect(schedule().workingDraft!.milestones.map(row => [row.milestoneDefinitionId, row.plan, row.applicability])).toEqual([
      [kickoff, "2026-10-15", "applicable"], [localId, "2026-10-16", "applicable"], [idFix, null, "notApplicable"],
    ]);
    const sessionId = schedule().reviewSessions[0].id;
    expect(selectScheduleReviewTrace(schedule(), sessionId).map(item => item.retention)).toEqual(["unpublished", "unpublished", "unpublished"]);
    const loaded = structuredClone(schedule()); load("basic-success"); expect(schedule()).toEqual(loaded);
    dashboard(); openProject(); applyDate("Kickoff", "2026-10-20"); click("Remove ID fix"); publishSchedule();
    expect(selectScheduleReviewTrace(schedule(), sessionId).map(item => item.retention)).toEqual(["retained", "retained", "not-retained"]);
    // Real decisions now exist: accidentally mounting only the trace in PM must also fail.
    expect(screen.queryByRole("region", { name: "審核紀錄" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Review History|審核紀錄/ })).not.toBeInTheDocument();
    advanced();
    const history = screen.getByRole("region", { name: "審核紀錄" });
    expect(history).toHaveTextContent("Kickoff | 計畫 2026-10-15");
    expect(history).toHaveTextContent("Kickoff | 適用 | 計畫 2026-10-20");
    expect(history).toHaveTextContent("最終發布版本未保留此列");
    expect(history.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    dashboard(); expect(exportGrid()[1][11]).toBe("Applicable\nP: 2026/10/20\nA: —");
    advanced(); load("basic-success", true); confirm(1);
    const discardedSession = schedule().reviewSessions.at(-1)!.id;
    click("捨棄此專案草稿"); click("確認捨棄");
    expect(selectScheduleReviewTrace(schedule(), discardedSession).map(item => item.retention)).toEqual(["discarded"]);
    expect(screen.getByRole("region", { name: "審核紀錄" })).toHaveTextContent("已捨棄，未發布");
    expect(getCurrentPublishedVersion(schedule())!.milestones.find(row => row.milestoneDefinitionId === kickoff)?.plan).toBe("2026-10-20");
  }, 30000);

  // Catches the loader manufacturing a retired prerequisite or granting a new occurrence,
  // instead of updating only the real pre-retirement row issued by Governance Publish.
  it("retired-existing simulation requires a real D1 row and updates/publishes that exact identity", () => {
    mount(); openProject(); click("Edit");
    advanced();
    const empty = structuredClone(schedule()); load("retired-existing-update");
    expect(schedule()).toEqual(empty);
    expect(screen.getByRole("status")).toHaveTextContent("此專案沒有可合法引用的既有停用里程碑");
    dashboard(); openProject(); add(kickoff); applyDate("Kickoff", "2026-10-05");
    const row = structuredClone(schedule().workingDraft!.milestones[0]);
    const workingDraftId = schedule().workingDraft!.workingDraftId;
    governance(true); setting("Kickoff", "可新增"); release();
    expect(live().governance.retiredDraftOccurrenceGrants).toEqual([{
      projectId: "dev-project-001", workingDraftId, milestoneId: row.milestoneId,
      milestoneDefinitionId: kickoff, retiredByReleaseId: live().governance.currentReleaseId,
    }]);
    fireEvent.click(screen.getByText("進階治理與試用工具")); load("retired-existing-update");
    expect(schedule().workingDraft!.milestones).toEqual([row]);
    expect(within(candidate(1)).getByLabelText("套用目標").textContent).toContain("更新既有列 1");
    expect(within(candidate(1)).getByLabelText("套用目標").textContent).not.toContain("新增公版");
    confirm(1);
    expect(schedule().workingDraft!.milestones).toEqual([{ ...row, plan: "2026-10-15" }]);
    publishAdvanced();
    expect(getCurrentPublishedVersion(schedule())!.milestones).toEqual([{ ...row, plan: "2026-10-15" }]);
    dashboard(); openProject(); click("Edit");
    expect(optionLabels("Milestone definition")).not.toContain("Kickoff");
    applyDate("Kickoff", "2026-10-20"); publishSchedule();
    expect(getCurrentPublishedVersion(schedule())!.milestones).toEqual([{ ...row, plan: "2026-10-20" }]);
  }, 30000);

  // Catches grants surviving removal/restart as Add authority or being borrowed by another Project.
  it.each(["remove", "discard"] as const)("D1 cannot re-add after %s or authorize another Project", action => {
    mount(undefined, true); openProject(); click("Edit"); add(kickoff); applyDate("Kickoff", "2026-10-05");
    const previousDraftId = schedule().workingDraft!.workingDraftId;
    governance(true); setting("Kickoff", "可新增"); release();
    const grant = live().governance.retiredDraftOccurrenceGrants[0];
    dashboard(); openProject();
    if (action === "remove") click("Remove Kickoff");
    else { click("Discard Draft"); fireEvent.click(within(screen.getByRole("dialog", { name: "Discard Working Draft" })).getByRole("button", { name: "Discard Draft" })); click("Edit"); }
    expect(schedule().workingDraft!.milestones).toEqual([]);
    if (action === "discard") expect(schedule().workingDraft!.workingDraftId).not.toBe(previousDraftId);
    expect(optionLabels("Milestone definition")).not.toContain("Kickoff");
    const before = structuredClone(schedule());
    expect(addScheduleWorkingDraftMilestone(schedule(), { milestoneId: grant.milestoneId, milestoneDefinitionId: grant.milestoneDefinitionId }, commandContext())).toMatchObject({ ok: false, reason: "validation-failed" });
    expect(schedule()).toEqual(before);
    dashboard(); openProject("Nautilus"); click("Edit");
    const other = schedule(devProject002.id); const otherBefore = structuredClone(other);
    expect(addScheduleWorkingDraftMilestone(other, { milestoneId: grant.milestoneId, milestoneDefinitionId: grant.milestoneDefinitionId }, { ...commandContext(), localDefinitions: other.localDefinitions })).toMatchObject({ ok: false, reason: "validation-failed" });
    expect(schedule(devProject002.id)).toEqual(otherBefore);
    expect(schedule(devProject001.id)).toEqual(before);
  }, 30000);

  // Catches date correction or a synonymous local ID bypassing an exact retired public source.
  it("retired-no-reference stays pending after date correction and rejects a same-name local bypass", () => {
    mount(); openProject(); click("Edit");
    governance(true); setting("Kickoff", "可新增"); release();
    dashboard(); openProject(); const localId = createLocal("Kickoff");
    advanced(); load("retired-no-reference-negative");
    const pending = schedule().workingDraft!.importCandidates[0];
    expect(pending.sourceDefinitionId).toBe(kickoff);
    expect(within(candidate(1)).getByLabelText("套用目標").textContent).toBe("選擇合法目標");
    change("計畫處理方式", "set", candidate(1)); change("計畫日期", "2026-10-15", candidate(1));
    expect(within(candidate(1)).getByRole("button", { name: "確認" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "發布此專案草稿" })).toBeDisabled();
    const before = structuredClone(schedule());
    const result = confirmScheduleImportDecision(schedule(), {
      candidateId: pending.id, decisionId: toScheduleReviewDecisionId("bypass"),
      target: { kind: "createLocalOccurrence", localDefinitionId: localId, milestoneId: toMilestoneId("bypass") },
      plan: { kind: "set", value: parseDateOnly("2026-10-15")! }, actual: { kind: "clear" }, applicability: { kind: "set", value: "applicable" },
    }, commandContext());
    expect(result).toMatchObject({ ok: false, code: "target-definition-mismatch" });
    expect(schedule()).toEqual(before); expect(schedule().reviewDecisions).toEqual([]);
    expect(schedule().workingDraft!.importCandidates[0].status).toBe("pending");
    expect(schedule().evidenceLedger[0].rawValues.plan).toEqual({ presence: "present", raw: "10/11/2026" });
  }, 30000);

  // Catches DOM/viewport export construction, OR filtering, Draft dates/columns leaking,
  // omitted blank Team leaves, unsaved roster projection and multiple detail sheets.
  it("real workbook uses complete released leaves and exact Search AND Filters regardless of scrolling", () => {
    render(<App referenceDate={referenceDate} />);
    const headers = [...projectHeaders, ...scheduleHeaders, ...teamHeaders];
    const before = exportGrid();
    expect(before[0]).toEqual(headers); expect(before).toHaveLength(6);
    expect(before.slice(1).map(row => row[2])).toEqual(["Manta", "Nautilus", "Orca", "Beluga", "Marlin"]);
    expect(before[2][41]).toBe("DEV QCI PM"); expect(before[2].slice(42)).toEqual(["", "", "", "", "", ""]);
    const table = screen.getByTestId("portfolio-table-scroll"), proxy = screen.getByTestId("portfolio-bottom-scroll");
    table.scrollLeft = 1200; fireEvent.scroll(table); proxy.scrollLeft = 2400; fireEvent.scroll(proxy);
    const projectsTable = screen.getByRole("table", { name: "Projects" });
    const resize = screen.getByRole("button", { name: "Resize BIOS Owner column" });
    const biosIndex = [...projectsTable.querySelectorAll('th[scope="col"]')].indexOf(resize.closest("th")!);
    expect(projectsTable.querySelectorAll("col")[biosIndex]).toHaveStyle({ width: "135px" });
    fireEvent.keyDown(resize, { key: "ArrowRight" });
    expect(projectsTable.querySelectorAll("col")[biosIndex]).toHaveStyle({ width: "145px" });
    expect(exportGrid()).toEqual(before);
    change("Product Line", "Aspire (Refresh ID)");
    expect(exportGrid().slice(1).map(row => row[2])).toEqual(["Manta", "Marlin"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Manta" } });
    expect(exportGrid().slice(1).map(row => row[2])).toEqual(["Manta"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Nautilus" } }); expect(exportGrid()).toEqual([headers]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } }); click("Clear all"); expect(exportGrid()).toEqual(before);
    openProject("Nautilus"); click("Open Team Member"); click("Edit Team");
    fireEvent.change(screen.getByDisplayValue("DEV QCI PM"), { target: { value: "Saved Batch PM" } }); click("Save Team"); click("Back"); dashboard();
    expect(exportGrid()[2][41]).toBe("Saved Batch PM");
    openProject(); click("Edit"); applyDate("Kickoff", "2026-10-20"); dashboard();
    expect(exportGrid()[1][11]).toBe("Applicable\nP: 2026/09/18\nA: 2026/09/19");
    governance(true); const definitionId = publicDefinition("Export gate"); setting("Export gate", "顯示於總表");
    click("檢查並預覽發布"); dashboard(); expect(exportGrid()[0]).toEqual(headers);
    governance(); release(); dashboard();
    const releasedHeaders = [...projectHeaders, "Kickoff", "ID fix", "Export gate", ...scheduleHeaders.slice(2), ...teamHeaders];
    expect(exportGrid()[0]).toEqual(releasedHeaders);
    expect(live().context.addablePublicDefinitions.map(item => item.id)).not.toContain(definitionId);
    expect(exportGrid()[2].slice(-7)).toEqual(["Saved Batch PM", "", "", "", "", "", ""]);
    openProject(); publishSchedule(); dashboard();
    expect(exportGrid()[1][11]).toBe("Applicable\nP: 2026/10/20\nA: 2026/09/19");
  }, 30000);

  // Catches catalog cancellation losing session choices, case/ID collisions mutating catalogs,
  // governance rebuilding siblings, and changing Panel Size from filter-only to search.
  it("four self-service catalogs retain cancelled additions, guard collisions and resolve real Project/export values", () => {
    mount(); click("Create Project");
    const dialog = screen.getByRole("dialog", { name: "Create Project" });
    const labels = ["Product Line", "Panel Size", "CPU", "GPU"];
    expect(within(dialog).getAllByRole("button", { name: /^Add new/ }).map(button => button.getAttribute("aria-label"))).toEqual(labels.map(label => `Add new ${label}`));
    const ids: string[] = [];
    for (const label of labels) {
      fireEvent.click(within(dialog).getByRole("button", { name: `Add new ${label}` }));
      change(`New ${label}`, `Session ${label}`, dialog);
      fireEvent.click(within(dialog).getByRole("button", { name: `Add ${label} option` }));
      const selected = within(dialog).getByLabelText(label) as HTMLSelectElement;
      ids.push(selected.value); expect(selected.selectedOptions[0].textContent).toBe(`Session ${label}`);
    }
    fireEvent.click(within(dialog).getByRole("button", { name: "Add new CPU" })); change("New CPU", "  session cpu  ", dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Add CPU option" }));
    expect(dialog).toHaveTextContent("This catalog option already exists.");
    expect(within(dialog).getAllByRole("option", { name: "Session CPU" })).toHaveLength(1);
    change("New CPU", "Collision CPU", dialog);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(ids[0] as `${string}-${string}-${string}-${string}-${string}`);
    fireEvent.click(within(dialog).getByRole("button", { name: "Add CPU option" }));
    expect(dialog).toHaveTextContent("Generated catalog ID is already in use.");
    expect(within(dialog).queryByRole("option", { name: "Collision CPU" })).not.toBeInTheDocument();
    click("Cancel");
    governance(true); click("檢查並預覽發布"); click("捨棄公版草稿"); click("建立公版草稿"); release(); dashboard();
    const reused = createProject("Session Project");
    labels.forEach((label, index) => { expect(within(reused).getByRole("option", { name: `Session ${label}` })).toHaveValue(ids[index]); change(label, ids[index], reused); });
    click("Save");
    const header = screen.getByRole("region", { name: "Project Header" });
    labels.forEach(label => expect(header).toHaveTextContent(`${label}: Session ${label}`));
    dashboard();
    labels.forEach(label => expect(within(screen.getByLabelText(label)).getByRole("option", { name: `Session ${label}` })).toBeInTheDocument());
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Session CPU" } });
    expect(exportGrid().slice(1).map(row => row[2])).toEqual(["Session Project"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Session Panel Size" } }); expect(exportGrid()).toHaveLength(1);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } }); change("Panel Size", "Session Panel Size");
    const output = exportGrid(); expect(output).toHaveLength(2);
    expect(output[1].slice(6, 10)).toEqual(["Session Product Line", "Session Panel Size", "Session CPU", "Session GPU"]);
  }, 30000);

  // Catches remount retaining any governance, review, prototype or catalog session state.
  // App mounts twice using its own real bundled initializers; no initial-state replacement.
  it("real App remount restores bundled releases and clears all independent session mutations", () => {
    const first = render(<App referenceDate={referenceDate} />);
    const bundledPrototype = structuredClone(live().prototype), bundledGovernance = structuredClone(live().governance);
    click("Create Project");
    const dialog = screen.getByRole("dialog", { name: "Create Project" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add new CPU" })); change("New CPU", "Reset CPU", dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Add CPU option" })); click("Cancel");
    createProject("Transient Project"); click("Save"); dashboard();
    openProject("Nautilus"); click("Edit"); add(kickoff); applyDate("Kickoff", "2026-10-06");
    governance(true); assign("Manta", idFix); setting("Kickoff", "可新增"); release();
    expect(live().governance.requirementEnrollments).toHaveLength(1);
    expect(live().governance.retiredDraftOccurrenceGrants).toHaveLength(1);
    click("建立公版草稿"); fireEvent.click(screen.getByRole("checkbox", { name: "撤回 Manta · ID fix" })); release();
    fireEvent.click(screen.getByText("進階治理與試用工具")); change("工具操作專案", devProject002.id);
    load("retired-existing-update"); confirm(1);
    expect(schedule(devProject002.id).reviewDecisions).toHaveLength(1);
    expect(schedule(devProject002.id).evidenceLedger).toHaveLength(1);
    expect(live().governance.requirementWithdrawals).toHaveLength(1);
    dashboard(); click("Create Project");
    expect(within(screen.getByRole("dialog", { name: "Create Project" })).getByRole("option", { name: "Reset CPU" })).toBeInTheDocument(); click("Cancel");
    expect(live().prototype.projects).toHaveLength(6);
    first.unmount(); render(<App referenceDate={referenceDate} />);
    expect(live().prototype).toEqual(bundledPrototype); expect(live().governance).toEqual(bundledGovernance);
    expect(live().governance).toMatchObject({ draft: null, requirementEnrollments: [], requirementWithdrawals: [], retiredDraftOccurrenceGrants: [] });
    expect(screen.queryByRole("region", { name: "Milestone Follow-up" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Project Transient Project" })).not.toBeInTheDocument();
    click("Create Project");
    expect(within(screen.getByRole("dialog", { name: "Create Project" })).queryByRole("option", { name: "Reset CPU" })).not.toBeInTheDocument(); click("Cancel");
    governance(); expect(screen.getByText("進階治理與試用工具").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("region", { name: "目前已發布公版" })).toHaveTextContent("系統初始公版");
  }, 30000);
});
