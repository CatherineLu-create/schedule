import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../../main";
import { createInitialMilestoneGovernanceRuntimeState } from "../../application/governance/milestoneGovernanceInitializer";
import { selectEffectiveMilestoneGovernanceContext } from "../../application/governance/effectiveMilestoneGovernanceContext";
import { prepareProjectCreationCommit } from "../../application/governance/projectCreationGovernance";
import { publishGovernanceDraft, startGovernanceDraft, updateGovernanceDraft } from "../../application/governance/milestoneGovernanceCommands";
import { createEmptyCanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import { toGovernanceDraftId, toGovernanceReleaseId, toRequirementEnrollmentId, toRequirementWithdrawalId } from "../../domain/shared/ids";
import { devProject001 } from "../../fixtures/v2/canonicalProjectFixtures";
import type { CommandResult } from "../../domain/governance/milestoneGovernance";

// Preserve real behavior; wrapping the two application boundaries observes actual state retained by App.
vi.mock("../../application/governance/milestoneGovernanceInitializer", async importOriginal => {
  const actual = await importOriginal<typeof import("../../application/governance/milestoneGovernanceInitializer")>();
  return { ...actual, createInitialMilestoneGovernanceRuntimeState: vi.fn(actual.createInitialMilestoneGovernanceRuntimeState) };
});
vi.mock("../../application/governance/effectiveMilestoneGovernanceContext", async importOriginal => {
  const actual = await importOriginal<typeof import("../../application/governance/effectiveMilestoneGovernanceContext")>();
  return { ...actual, selectEffectiveMilestoneGovernanceContext: vi.fn(actual.selectEffectiveMilestoneGovernanceContext) };
});
vi.mock("../../application/governance/projectCreationGovernance", async importOriginal => {
  const actual = await importOriginal<typeof import("../../application/governance/projectCreationGovernance")>();
  return { ...actual, prepareProjectCreationCommit: vi.fn(actual.prepareProjectCreationCommit) };
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.restoreAllMocks(); });
function value<T>(result: CommandResult<T, string>): T {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}
function fixture() {
  const initial = createInitialMilestoneGovernanceRuntimeState();
  const requirements = initial.releases[0].addableDefinitionIds.slice(0, 2);
  const started = value(startGovernanceDraft(initial, toGovernanceDraftId("runtime-create")));
  const edited = value(updateGovernanceDraft(started, { kind: "replace-candidate-release", candidateRelease: {
    ...started.draft!.candidateRelease, newProjectRequirementDefinitionIds: requirements,
  } }));
  const prototype = { projects: [devProject001], schedules: [createEmptyCanonicalProjectSchedule(devProject001.id)] };
  const governance = value(publishGovernanceDraft(edited, prototype, {
    createReleaseId: () => toGovernanceReleaseId("runtime-creation-release"),
    createEnrollmentId: () => toRequirementEnrollmentId("unused"), createWithdrawalId: () => toRequirementWithdrawalId("unused"),
    nowIso: () => "2026-10-01T00:00:00Z",
  }));
  vi.mocked(createInitialMilestoneGovernanceRuntimeState).mockReturnValueOnce(governance);
  vi.mocked(selectEffectiveMilestoneGovernanceContext).mockClear();
  render(<App initialState={prototype} />);
  return { prototype, governance, requirements };
}
function openCreate(duplicate: boolean) {
  fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
  const dialog = screen.getByRole("dialog", { name: "Create Project" });
  fireEvent.change(within(dialog).getByLabelText("Year"), { target: { value: "2027" } });
  fireEvent.change(within(dialog).getByLabelText("Product Line"), { target: { value: "demo-product-line-aspire-refresh-id" } });
  fireEvent.change(within(dialog).getByLabelText("STN Project Name"), { target: { value: duplicate ? "Manta" : "Governance Creation" } });
  fireEvent.change(within(dialog).getByLabelText("QCI Model Name"), { target: { value: "GOV-CREATE" } });
  return dialog;
}
function submit(duplicate: boolean) {
  fireEvent.click(within(screen.getByRole("dialog", { name: "Create Project" })).getByRole("button", { name: "Save" }));
  if (duplicate) fireEvent.click(within(screen.getByRole("dialog", { name: "Create Project" })).getByRole("button", { name: "Create Anyway" }));
}
const projectUuid = "11111111-1111-4111-8111-111111111111";
const enrollmentUuid1 = "22222222-2222-4222-8222-222222222222";
const enrollmentUuid2 = "33333333-3333-4333-8333-333333333333";

it.each([false, true])("real App %s Create commits rendered Project, empty Schedule and all creation enrollments together", duplicate => {
  const { requirements, governance, prototype } = fixture();
  const before = structuredClone({ governance, prototype });
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(projectUuid).mockReturnValueOnce(enrollmentUuid1).mockReturnValueOnce(enrollmentUuid2);
  openCreate(duplicate);
  submit(duplicate);
  expect(screen.queryByRole("dialog", { name: "Create Project" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Project Header" })).toHaveAttribute("data-project-id", projectUuid);
  expect(within(screen.getByRole("region", { name: "Current Schedule" })).getByText("-")).toBeInTheDocument();
  const retained = vi.mocked(selectEffectiveMilestoneGovernanceContext).mock.calls.at(-1)![0];
  expect(retained.requirementEnrollments).toEqual([
    { id: enrollmentUuid1, projectId: projectUuid, milestoneDefinitionId: requirements[0], assignedByReleaseId: "runtime-creation-release", source: "new-project-at-creation" },
    { id: enrollmentUuid2, projectId: projectUuid, milestoneDefinitionId: requirements[1], assignedByReleaseId: "runtime-creation-release", source: "new-project-at-creation" },
  ]);
  expect({ governance, prototype }).toEqual(before);
});

it.each([false, true])("injected prepare failure in %s Create changes neither state and allows a complete real retry", duplicate => {
  const { governance, prototype, requirements } = fixture();
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(projectUuid).mockReturnValueOnce(enrollmentUuid1).mockReturnValueOnce(enrollmentUuid2);
  const dialog = openCreate(duplicate);
  fireEvent.click(within(dialog).getByRole("button", { name: "Add new CPU" }));
  fireEvent.change(within(dialog).getByRole("textbox", { name: "New CPU" }), { target: { value: "Independent session CPU" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add CPU option" }));
  vi.mocked(prepareProjectCreationCommit).mockReturnValueOnce({ ok: false, code: "duplicate-enrollment-id", issues: [{
    code: "governance.creation.duplicate-enrollment-id", domain: "governance", source: "data", severity: "blocking",
    message: "Cannot allocate creation requirements. Please retry.", target: { section: "projectCreation" },
  }] });
  submit(duplicate);
  expect(screen.queryByRole("region", { name: "Project Header" })).not.toBeInTheDocument();
  const failedDialog = screen.getByRole("dialog", { name: "Create Project" });
  expect(within(failedDialog).getByText("Cannot allocate creation requirements. Please retry.")).toBeInTheDocument();
  expect(within(failedDialog).getByRole("option", { name: "Independent session CPU" })).toBeInTheDocument();
  expect(screen.queryByText("GOV-CREATE")).not.toBeInTheDocument();
  expect(vi.mocked(selectEffectiveMilestoneGovernanceContext).mock.calls.at(-1)![0]).toEqual(governance);
  submit(duplicate);
  // The second invocation is real: the submitted state must still exclude the failed Project/enrollments.
  const [retryPrototype, retryGovernance] = vi.mocked(prepareProjectCreationCommit).mock.calls.at(-1)!;
  expect(retryPrototype).toEqual(prototype);
  expect(retryGovernance).toEqual(governance);
  expect(screen.getByRole("region", { name: "Project Header" })).toHaveAttribute("data-project-id", projectUuid);
  const retained = vi.mocked(selectEffectiveMilestoneGovernanceContext).mock.calls.at(-1)![0];
  expect(retained.requirementEnrollments.map(item => item.milestoneDefinitionId)).toEqual(requirements);
  expect(screen.getByRole("region", { name: "Project Header" })).toHaveTextContent("Independent session CPU");
});
