import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../../main";
import { createInitialMilestoneGovernanceRuntimeState } from "../../application/governance/milestoneGovernanceInitializer";
import { publishGovernanceDraft, startGovernanceDraft, updateGovernanceDraft } from "../../application/governance/milestoneGovernanceCommands";
import { toCatalogItemId, toGovernanceDraftId, toGovernanceReleaseId, toMilestoneDefinitionId, toRequirementEnrollmentId, toRequirementWithdrawalId } from "../../domain/shared/ids";
import { devProject001 } from "../../fixtures/v2/canonicalProjectFixtures";
import { createEmptyCanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import type { CommandResult } from "../../domain/governance/milestoneGovernance";
import { publishedRetirementFixture } from "../../test/governanceTestUtils";

vi.mock("../../application/governance/milestoneGovernanceInitializer", async importOriginal => {
  const actual = await importOriginal<typeof import("../../application/governance/milestoneGovernanceInitializer")>();
  return { ...actual, createInitialMilestoneGovernanceRuntimeState: vi.fn(actual.createInitialMilestoneGovernanceRuntimeState) };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function value<T>(result: CommandResult<T, string>): T {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}

// Mutation: App forwards stored grants without deriving their issuing-release authority.
it.each(["unknown", "bundled", "future", "nonRetiring"] as const)("App rejects Edit and Publish for a %s issuing-release grant", kind => {
  const fixture = publishedRetirementFixture();
  const state = { ...fixture.state, retiredDraftOccurrenceGrants: [{ ...fixture.grant, retiredByReleaseId: fixture.invalidIssuingReleaseIds[kind] }] };
  const before = structuredClone({ state, prototype: fixture.prototype });
  vi.mocked(createInitialMilestoneGovernanceRuntimeState).mockReturnValueOnce(state);
  render(<App initialState={fixture.prototype} initialSelectedProjectId={devProject001.id} />);
  fireEvent.change(screen.getByLabelText("Applicability for Kickoff"), { target: { value: "notApplicable" } });
  expect.soft(screen.getByLabelText("Applicability for Kickoff")).toHaveValue("applicable");
  expect.soft(screen.queryByText(/Nonaddable public definitions require exact Current Published lineage/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" })).getByRole("button", { name: "Publish" }));
  expect.soft(screen.queryByLabelText("Applicability for Kickoff")).toBeInTheDocument();
  expect(screen.getByText("Retired definition requires exact current lineage or D1 grant.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
  expect(screen.queryByText("Published v01")).not.toBeInTheDocument();
  expect({ state, prototype: fixture.prototype }).toEqual(before);
});

it("App edits and publishes a genuinely issued D1 row", () => {
  const fixture = publishedRetirementFixture();
  const before = structuredClone(fixture.prototype);
  vi.mocked(createInitialMilestoneGovernanceRuntimeState).mockReturnValueOnce(fixture.state);
  render(<App initialState={fixture.prototype} initialSelectedProjectId={devProject001.id} />);
  fireEvent.change(screen.getByLabelText("Applicability for Kickoff"), { target: { value: "notApplicable" } });
  expect(screen.getByLabelText("Applicability for Kickoff")).toHaveValue("notApplicable");
  fireEvent.click(screen.getByRole("button", { name: /^Clear Plan for Kickoff occurrence/ }));
  expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" })).getByRole("button", { name: "Publish" }));
  expect(screen.queryByLabelText("Applicability for Kickoff")).not.toBeInTheDocument();
  expect(screen.getByText("Published v01")).toBeInTheDocument();
  expect(fixture.prototype).toEqual(before);
});

it("one mounted App retains its released consumer context across navigation and renders", () => {
  const baseline = createInitialMilestoneGovernanceRuntimeState();
  const started = value(startGovernanceDraft(baseline, toGovernanceDraftId("runtime-draft")));
  const extra = { ...baseline.releases[0].definitions[0], id: toMilestoneDefinitionId("runtime-new"), name: "Runtime released choice", milestoneTypeId: null };
  const draft = value(updateGovernanceDraft(started, { kind: "replace-candidate-release", candidateRelease: {
    ...started.draft!.candidateRelease, definitions: [...baseline.releases[0].definitions, extra],
    addableDefinitionIds: [extra.id], portfolioColumnDefinitionIds: [extra.id],
  } }));
  const initialState = { projects: [devProject001], schedules: [createEmptyCanonicalProjectSchedule(devProject001.id)] };
  const published = value(publishGovernanceDraft(draft, initialState, {
    createReleaseId: () => toGovernanceReleaseId("runtime-release"), createEnrollmentId: () => toRequirementEnrollmentId("unused"),
    createWithdrawalId: () => toRequirementWithdrawalId("unused"), nowIso: () => "2026-10-01T01:00:00.000Z",
  }));
  vi.mocked(createInitialMilestoneGovernanceRuntimeState).mockClear().mockReturnValueOnce(published);
  const { rerender } = render(<App initialState={initialState} />);
  expect(screen.getByRole("columnheader", { name: /Runtime released choice/ })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: /^Kickoff/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
  const createDialog = screen.getByRole("dialog", { name: "Create Project" });
  fireEvent.click(within(createDialog).getByRole("button", { name: "Add new Product Line" }));
  fireEvent.change(within(createDialog).getByRole("textbox", { name: "New Product Line" }), { target: { value: "Governance session line" } });
  fireEvent.click(within(createDialog).getByRole("button", { name: "Add Product Line option" }));
  const optionId = (within(createDialog).getByRole("option", { name: "Governance session line" }) as HTMLOptionElement).value;
  expect(optionId).not.toBe("");
  fireEvent.click(within(createDialog).getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: /^Open Project/ }));
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(within(screen.getByLabelText("Milestone definition")).getAllByRole("option").map(option => option.textContent)).toEqual(["Select milestone", "Runtime released choice", "+ Add Project-specific Milestone…"]);
  expect(screen.queryByRole("row", { name: /Runtime released choice/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
  rerender(<App initialState={initialState} />);
  expect(screen.getByRole("columnheader", { name: /Runtime released choice/ })).toBeInTheDocument();
  expect(createInitialMilestoneGovernanceRuntimeState).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
  expect(within(screen.getByRole("dialog", { name: "Create Project" })).getByRole("option", { name: "Governance session line" })).toHaveValue(toCatalogItemId(optionId));
});
