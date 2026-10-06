import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../../main";
import { createInitialMilestoneGovernanceRuntimeState } from "../../application/governance/milestoneGovernanceInitializer";
import { publishGovernanceDraft, startGovernanceDraft, updateGovernanceDraft } from "../../application/governance/milestoneGovernanceCommands";
import { createEmptyCanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import { toGovernanceDraftId, toGovernanceReleaseId, toRequirementEnrollmentId, toRequirementWithdrawalId } from "../../domain/shared/ids";
import { devProject001, devProject002 } from "../../fixtures/v2/canonicalProjectFixtures";
import type { CommandResult } from "../../domain/governance/milestoneGovernance";
import { parseDateOnly } from "../../domain/shared/dateOnly";

vi.mock("../../application/governance/milestoneGovernanceInitializer", async importOriginal => {
  const actual = await importOriginal<typeof import("../../application/governance/milestoneGovernanceInitializer")>();
  return { ...actual, createInitialMilestoneGovernanceRuntimeState: vi.fn(actual.createInitialMilestoneGovernanceRuntimeState) };
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function value<T>(result: CommandResult<T, string>): T {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}
function setup(assigned = true, savedTeam = false) {
  const prototype = { projects: [{ ...devProject001, team: savedTeam ? devProject002.team : null }, devProject002], schedules: [devProject001, devProject002].map(project => createEmptyCanonicalProjectSchedule(project.id)) };
  const initial = createInitialMilestoneGovernanceRuntimeState();
  const definitionId = initial.releases[0].addableDefinitionIds[0];
  let governance = initial;
  if (assigned) {
    const draft = value(updateGovernanceDraft(value(startGovernanceDraft(initial, toGovernanceDraftId("follow-up"))), {
      kind: "replace-existing-project-assignments", assignments: [{ projectId: devProject001.id, milestoneDefinitionId: definitionId }],
    }));
    governance = value(publishGovernanceDraft(draft, prototype, {
      createReleaseId: () => toGovernanceReleaseId("follow-up"), createEnrollmentId: () => toRequirementEnrollmentId("follow-up"),
      createWithdrawalId: () => toRequirementWithdrawalId("unused"), nowIso: () => "2026-10-01T00:00:00Z",
    }));
  }
  vi.mocked(createInitialMilestoneGovernanceRuntimeState).mockReturnValueOnce(governance);
  render(<App initialState={prototype} referenceDate={parseDateOnly("2026-10-01")!} />);
  return { prototype, governance, definitionId };
}
function followUp() { return screen.getByRole("region", { name: "Milestone Follow-up" }); }
function openManta() { fireEvent.click(within(followUp()).getByRole("button", { name: "Open Project Manta" })); }
function publish() {
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" })).getByRole("button", { name: "Publish" }));
}

it("hides Dashboard and Workspace follow-up when no effective pending enrollment exists", () => {
  setup(false);
  expect(screen.queryByRole("region", { name: "Milestone Follow-up" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open Project Manta" }));
  expect(screen.queryByRole("region", { name: "Milestone Follow-up" })).not.toBeInTheDocument();
});

it("keeps follow-up outside table filters and Attention, and navigates to a compact readonly selected-Project card", () => {
  setup();
  expect(within(followUp()).getByText("QCI PM: Unassigned")).toBeVisible();
  expect(within(followUp()).getByText("Pending: Kickoff")).toBeVisible();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "not-a-project" } });
  expect(screen.getByText("Showing 0 of 2 projects")).toBeVisible();
  for (const name of ["Upcoming Milestones", "Overdue"]) {
    expect(within(screen.getByRole("group", { name })).getByText("0")).toBeVisible();
  }
  expect(within(screen.getByRole("region", { name: "Needs Attention" })).queryByText("Kickoff")).not.toBeInTheDocument();
  openManta();
  expect(screen.getByRole("region", { name: "Project Header" })).toHaveAttribute("data-project-id", devProject001.id);
  expect(followUp()).toHaveTextContent("Pending public milestones: Kickoff");
  expect(followUp().nextElementSibling).toBe(screen.getByRole("region", { name: "Current Schedule" }));
  expect(within(followUp()).queryByRole("button")).not.toBeInTheDocument();
  expect(within(followUp()).queryByRole("checkbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
  fireEvent.click(within(screen.getByRole("table", { name: "Projects" })).getByRole("button", { name: "Open Project Nautilus" }));
  expect(screen.queryByRole("region", { name: "Milestone Follow-up" })).not.toBeInTheDocument();
});

it("uses the newly saved QCI PM after Team editing without acknowledging or completing pending work", () => {
  setup(true, true);
  expect(followUp()).toHaveTextContent("QCI PM: DEV QCI PM");
  openManta();
  fireEvent.click(screen.getByRole("button", { name: "Open Team Member" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit Team" }));
  fireEvent.change(screen.getByDisplayValue("DEV QCI PM"), { target: { value: "New saved PM" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(followUp()).toHaveTextContent("Pending public milestones: Kickoff");
  fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
  expect(followUp()).toHaveTextContent("QCI PM: New saved PM");
  expect(followUp()).not.toHaveTextContent("DEV QCI PM");
  expect(followUp()).toHaveTextContent("Pending: Kickoff");
});

it.each(["applicable", "notApplicable"] as const)("only Current Published %s completes follow-up; a later removal reopens it without blocking Publish", applicability => {
  const { definitionId } = setup();
  openManta();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  const schedule = screen.getByRole("region", { name: "Schedule" });
  expect(followUp()).toHaveTextContent("Pending public milestones: Kickoff");
  expect(within(schedule).queryByText(/simulation|mapping|governance|模擬|匯入審核|對應公版|審核紀錄|公版管理/i)).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Milestone definition" }), { target: { value: definitionId } });
  fireEvent.click(screen.getByRole("button", { name: "Add Milestone" }));
  if (applicability === "applicable") {
    fireEvent.change(screen.getByLabelText(/^Plan for Kickoff occurrence/), { target: { value: "2026-10-20" } });
    fireEvent.click(screen.getByRole("button", { name: /^Apply Date to Plan for Kickoff occurrence/ }));
  } else {
    fireEvent.change(screen.getByLabelText("Applicability for Kickoff"), { target: { value: applicability } });
  }
  expect(followUp()).toHaveTextContent("Pending public milestones: Kickoff");
  publish();
  expect(screen.getByText("Published v01")).toBeVisible();
  expect(screen.queryByRole("region", { name: "Milestone Follow-up" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
  expect(screen.queryByRole("region", { name: "Milestone Follow-up" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open Project Manta" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove Kickoff" }));
  expect(screen.queryByRole("region", { name: "Milestone Follow-up" })).not.toBeInTheDocument();
  publish();
  expect(screen.getByText("Published v02")).toBeVisible();
  expect(followUp()).toHaveTextContent("Pending public milestones: Kickoff");
  fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
  expect(within(followUp()).getByText("Pending: Kickoff")).toBeVisible();
  for (const name of ["Upcoming Milestones", "Overdue"]) expect(within(screen.getByRole("group", { name })).getByText("0")).toBeVisible();
});

it("preserves all four session catalogs through governance start, preview, discard, publish and advanced simulation", () => {
  setup(false);
  fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
  const dialog = screen.getByRole("dialog", { name: "Create Project" });
  const labels = ["Product Line", "Panel Size", "CPU", "GPU"];
  for (const label of labels) {
    fireEvent.click(within(dialog).getByRole("button", { name: `Add new ${label}` }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: `New ${label}` }), { target: { value: `Session ${label}` } });
    fireEvent.click(within(dialog).getByRole("button", { name: `Add ${label} option` }));
    const option = within(dialog).getByRole("option", { name: `Session ${label}` }) as HTMLOptionElement;
    expect(within(dialog).getByLabelText(label)).toHaveValue(option.value);
  }
  const options = (form: HTMLElement) => labels.map(label => Array.from((within(form).getByLabelText(label) as HTMLSelectElement).options, option => [option.value, option.textContent]));
  const before = options(dialog);
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  const openGovernance = () => fireEvent.click(screen.getByRole("button", { name: "公版管理" }));
  const action = (name: string) => fireEvent.click(screen.getByText(name, { selector: "button", exact: true }));
  const checkCatalogs = () => {
    action("回到 Dashboard");
    fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
    const reopened = screen.getByRole("dialog", { name: "Create Project" });
    expect(options(reopened)).toEqual(before);
    fireEvent.click(within(reopened).getByRole("button", { name: "Cancel" }));
    openGovernance();
  };
  openGovernance();
  action("建立公版草稿");
  checkCatalogs();
  action("檢查並預覽發布");
  checkCatalogs();
  action("捨棄公版草稿");
  checkCatalogs();
  action("建立公版草稿");
  action("檢查並預覽發布");
  action("發布公版");
  checkCatalogs();
  fireEvent.click(screen.getByText("進階治理與試用工具"));
  fireEvent.change(screen.getByLabelText("工具操作專案"), { target: { value: devProject001.id } });
  fireEvent.change(screen.getByLabelText("模擬情境"), { target: { value: "fixable-validation" } });
  action("載入模擬匯入資料");
  action("建立草稿並載入");
  expect(screen.getByRole("region", { name: "匯入審核" })).toBeVisible();
  checkCatalogs();
}, 30000); // Measured 6.48s for this bounded multi-navigation flow; default 5s was insufficient.
