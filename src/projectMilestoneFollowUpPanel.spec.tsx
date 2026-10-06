import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectMilestoneFollowUpPanel } from "./projectMilestoneFollowUpPanel";
import type { ProjectMilestoneFollowUpGroup } from "./application/selectors/projectMilestoneFollowUp";
import { toMilestoneDefinitionId, toProjectId } from "./domain/shared/ids";

afterEach(cleanup);
const groups: readonly ProjectMilestoneFollowUpGroup[] = [
  { projectId: toProjectId("exact-project-a"), projectName: "Manta", qciPmDisplay: "Saved PM", pendingDefinitions: [
    { milestoneDefinitionId: toMilestoneDefinitionId("milestone-design-kickoff"), displayName: "Kickoff" },
    { milestoneDefinitionId: toMilestoneDefinitionId("milestone-ramp-fcs"), displayName: "SSL/GL" },
  ] },
  { projectId: toProjectId("exact-project-b"), projectName: "Nautilus", qciPmDisplay: "Unassigned", pendingDefinitions: [
    { milestoneDefinitionId: toMilestoneDefinitionId("milestone-design-kickoff"), displayName: "Kickoff" },
  ] },
];

it("renders nothing when zero Projects have pending milestones", () => {
  const { container } = render(<ProjectMilestoneFollowUpPanel groups={[]} onOpenProject={vi.fn()} />);
  expect(container).toBeEmptyDOMElement();
});

it("renders one human-readable group per Project with saved PM or Unassigned and exact-ID navigation only", () => {
  const onOpenProject = vi.fn();
  render(<ProjectMilestoneFollowUpPanel groups={groups} onOpenProject={onOpenProject} />);
  const panel = screen.getByRole("region", { name: "Milestone Follow-up" });
  expect(within(panel).getByRole("heading", { name: "Milestone Follow-up" })).toBeVisible();
  expect(within(panel).getAllByRole("listitem")).toHaveLength(2);
  expect(within(panel).getByText("Pending: Kickoff, SSL/GL")).toBeVisible();
  expect(within(panel).getByText("QCI PM: Saved PM")).toBeVisible();
  expect(within(panel).getByText("QCI PM: Unassigned")).toBeVisible();
  expect(within(panel).getAllByRole("button")).toHaveLength(2);
  expect(within(panel).queryByRole("checkbox")).not.toBeInTheDocument();
  expect(panel).not.toHaveTextContent(/exact-project|milestone-ramp|milestone-design|FCS/);
  fireEvent.click(within(panel).getByRole("button", { name: "Open Project Manta" }));
  expect(onOpenProject).toHaveBeenCalledExactlyOnceWith("exact-project-a");
});
