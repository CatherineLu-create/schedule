import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CurrentPublishedScheduleRead,
  ScheduleWorkingDraftMilestoneRow,
} from "./application/selectors/scheduleSelectors";
import { milestoneDefinitions } from "./config/v2/referenceData";
import type { CanonicalPublishedScheduleVersion } from "./domain/schedule/officialSchedule";
import { toScheduleVersionNumber } from "./domain/schedule/schedule";
import { parseDateOnly, type DateOnly } from "./domain/shared/dateOnly";
import { toMilestoneDefinitionId, toMilestoneId, toProjectId } from "./domain/shared/ids";
import type { ValidationIssue } from "./domain/validation/validationIssue";
import { ScheduleWorkspace, type ScheduleWorkspaceProps } from "./scheduleWorkspace";

const onAddMilestone = vi.fn<ScheduleWorkspaceProps["onAddMilestone"]>();
const onCancelDraft = vi.fn<ScheduleWorkspaceProps["onCancelDraft"]>();
const onPublishDraft = vi.fn<ScheduleWorkspaceProps["onPublishDraft"]>();
const onRemoveMilestone = vi.fn<ScheduleWorkspaceProps["onRemoveMilestone"]>();
const onStartDraft = vi.fn<NonNullable<ScheduleWorkspaceProps["onStartDraft"]>>();
const onUpdateMilestone = vi.fn<ScheduleWorkspaceProps["onUpdateMilestone"]>();

const draftIssue: ValidationIssue = {
  code: "schedule.draft.integrity.unresolved-milestone-definition",
  domain: "schedule",
  source: "data",
  severity: "blocking",
  message: "Working Draft milestone must reference an existing milestone definition.",
  target: {
    section: "schedule.workingDraft",
    entityId: "draft-bad",
    field: "milestoneDefinitionId",
  },
};

const draft = {
  milestones: [{
    milestoneId: toMilestoneId("draft-kickoff"),
    milestoneDefinitionId: toMilestoneDefinitionId("milestone-design-kickoff"),
    applicability: "applicable" as const,
    plan: parseDateOnly("2026-09-15"),
    actual: null,
  }],
};

const workingDraftRow: ScheduleWorkingDraftMilestoneRow = {
  milestoneId: draft.milestones[0]!.milestoneId,
  phase: "-",
  stage: "Design",
  milestone: "Kickoff",
  applicability: "applicable",
  plan: parseDateOnly("2026-09-15"),
  actual: null,
};

const baseProps: ScheduleWorkspaceProps = {
  draftRead: { kind: "noWorkingDraft" },
  feedback: [],
  milestoneDefinitions,
  nextVersionLabel: null,
  officialRead: { kind: "noPublishedSchedule" },
  onAddMilestone,
  onCancelDraft,
  onPublishDraft,
  onRemoveMilestone,
  onStartDraft,
  onUpdateMilestone,
  projectId: toProjectId("workspace-project"),
};

const workingDraftProps: ScheduleWorkspaceProps = {
  ...baseProps,
  draftRead: { kind: "workingDraft", draft, milestoneRows: [workingDraftRow] },
  nextVersionLabel: "Publish as v04",
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const publishedVersion: CanonicalPublishedScheduleVersion = {
  versionNumber: toScheduleVersionNumber(1),
  versionNote: null,
  publishedAt: "published-one",
  milestones: [],
};

describe("Schedule Workspace presentation", () => {
  it.each([
    ["unavailable", {
      kind: "unavailable",
      issues: [{ code: "schedule.integrity.missing-schedule", domain: "schedule",
        source: "data", severity: "blocking", message: "Missing Schedule",
        target: { section: "schedule" } }],
    } satisfies CurrentPublishedScheduleRead, "Schedule data unavailable"],
    ["no Published", { kind: "noPublishedSchedule" } satisfies CurrentPublishedScheduleRead, "-"],
    ["Published row", {
      kind: "published", version: { ...publishedVersion, milestones: [{
        milestoneId: toMilestoneId("published-kickoff"),
        milestoneDefinitionId: toMilestoneDefinitionId("milestone-design-kickoff"),
        applicability: "applicable", plan: parseDateOnly("2026-09-15"), actual: null,
      }] }, versionLabel: "Published v01", milestoneRows: [{
        milestoneId: toMilestoneId("published-kickoff"), phase: "-", stage: "Design",
        milestone: "Kickoff", applicability: "applicable", plan: "2026/09/15", actual: "-",
      }],
    } satisfies CurrentPublishedScheduleRead, "Kickoff"],
    ["zero milestones", {
      kind: "published", version: publishedVersion, versionLabel: "Published v01",
      milestoneRows: [],
    } satisfies CurrentPublishedScheduleRead, "No milestones"],
  ] as const)("delegates %s Official read", (_name, officialRead, expected) => {
    render(<ScheduleWorkspace {...baseProps} officialRead={officialRead} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("shows only Edit in owner-resolved Official mode", () => {
    render(<ScheduleWorkspace {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onStartDraft).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Add Milestone" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard Draft" })).not.toBeInTheDocument();
  });

  it("offers no lifecycle action when exact ownership is unavailable", () => {
    render(<ScheduleWorkspace {...baseProps} onStartDraft={null} draftRead={{
      kind: "unavailable", workingDraftExists: false, issues: [draftIssue],
    }} officialRead={{ kind: "unavailable", issues: [draftIssue] }} />);
    expect(screen.getByText("Schedule data unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard Draft" })).not.toBeInTheDocument();
  });

  it("renders exactly five Draft business columns and approved controls", () => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map(({ textContent }) => textContent))
      .toEqual(["Phase", "Stage", "Milestone", "Plan", "Actual"]);
    expect(screen.getByRole("row", { name: /Kickoff/ })).toHaveTextContent("Design");
    expect(screen.getByLabelText("Applicability for Kickoff")).toHaveValue("applicable");
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("2026-09-15");
    expect(screen.getByLabelText(/^Actual for Kickoff occurrence/)).toHaveValue("");
    expect(screen.queryByRole("columnheader", { name: "Applicability" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Kickoff" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard Draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume Draft" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Based on Published|Version History|Review Mode/i))
      .not.toBeInTheDocument();
  });

  it("keeps labelled mutable native inputs and hides field actions while inactive", () => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    const plan = screen.getByLabelText(
      "Plan for Kickoff occurrence draft-kickoff in Project workspace-project",
    );
    const actual = screen.getByLabelText(
      "Actual for Kickoff occurrence draft-kickoff in Project workspace-project",
    );
    for (const input of [plan, actual]) {
      expect(input).toHaveAttribute("type", "date");
      expect(input).toBeEnabled();
      expect(input).not.toHaveAttribute("readonly");
    }
    expect(plan).toHaveValue("2026-09-15");
    expect(actual).toHaveValue("");
    expect(screen.queryByRole("button", { name: /^Open calendar for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Apply Date to/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Cancel date edit for/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Clear Actual for Kickoff occurrence/ })).toBeEnabled();
    fireEvent.focus(plan);
    expect(screen.getByRole("button", { name: /^Apply Date to Plan for Kickoff occurrence/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Cancel date edit for Plan for Kickoff occurrence/ })).toBeEnabled();
    fireEvent.blur(plan);
    expect(screen.queryByRole("button", { name: /^Apply Date to/ })).not.toBeInTheDocument();
  });

  it.each([
    ["Plan", "2026-09-15"],
    ["Actual", ""],
  ])("opens and dismisses clean %s native input without a canonical write", (field, initial) => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    const input = screen.getByLabelText(new RegExp("^" + field + " for Kickoff occurrence"));
    fireEvent.pointerDown(input);
    fireEvent.focus(input);
    expect(input).toHaveValue(initial);
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);
    expect(onUpdateMilestone).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  });

  it("applies Plan and initially-null Actual only by click and clears Plan explicitly", () => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    const plan = screen.getByLabelText(/^Plan for Kickoff occurrence/);
    const actual = screen.getByLabelText(/^Actual for Kickoff occurrence/);
    fireEvent.change(plan, { target: { value: "2026-09-30" } });
    expect(onUpdateMilestone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Apply Date to Plan for Kickoff occurrence/ }));
    expect(onUpdateMilestone).toHaveBeenCalledExactlyOnceWith({
      milestoneId: toMilestoneId("draft-kickoff"), field: "plan", value: parseDateOnly("2026-09-30"),
    });
    fireEvent.change(actual, { target: { value: "2026-10-01" } });
    expect(onUpdateMilestone).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /^Apply Date to Actual for Kickoff occurrence/ }));
    expect(onUpdateMilestone).toHaveBeenCalledTimes(2);
    expect(onUpdateMilestone).toHaveBeenLastCalledWith({
      milestoneId: toMilestoneId("draft-kickoff"), field: "actual", value: parseDateOnly("2026-10-01"),
    });
    fireEvent.change(plan, { target: { value: "" } });
    expect(onUpdateMilestone).toHaveBeenCalledTimes(2);
    expect(plan).toHaveAccessibleDescription(/Date not applied/);
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^Clear Plan for Kickoff occurrence/ }));
    expect(onUpdateMilestone).toHaveBeenCalledTimes(3);
    expect(onUpdateMilestone).toHaveBeenLastCalledWith({
      milestoneId: toMilestoneId("draft-kickoff"), field: "plan", value: null,
    });
  });

  it("keeps provisional native date events out of the canonical callback until Apply Date", () => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    const plan = screen.getByLabelText(/^Plan for Kickoff occurrence/);
    fireEvent.input(plan, { target: { value: "2027-03-19" } });
    fireEvent.change(plan, { target: { value: "2027-03-19" } });
    expect(plan).toHaveValue("2027-03-19");
    expect(onUpdateMilestone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", {
      name: /^Apply Date to Plan for Kickoff occurrence/,
    }));
    expect(onUpdateMilestone).toHaveBeenCalledExactlyOnceWith({
      milestoneId: toMilestoneId("draft-kickoff"),
      field: "plan",
      value: parseDateOnly("2027-03-19"),
    });
  });

  it("submits one Apply while pending and permits a deliberate retry after rejection feedback", () => {
    const { rerender } = render(<ScheduleWorkspace {...workingDraftProps} />);
    fireEvent.change(screen.getByLabelText(/^Plan for Kickoff occurrence/), {
      target: { value: "2027-03-19" },
    });
    const apply = screen.getByRole("button", { name: /^Apply Date to Plan for Kickoff occurrence/ });
    fireEvent.click(apply);
    expect(apply).toBeDisabled();
    fireEvent.click(apply);
    expect(onUpdateMilestone).toHaveBeenCalledTimes(1);
    rerender(<ScheduleWorkspace {...workingDraftProps} feedback={["Update rejected"]} />);
    expect(apply).toBeEnabled();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    fireEvent.click(apply);
    expect(onUpdateMilestone).toHaveBeenCalledTimes(2);
  });

  it("keeps a second pending field guarded when field Cancel closes only the first edit", () => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.change(screen.getByLabelText(/^Plan for Kickoff occurrence/), {
      target: { value: "2027-03-19" },
    });
    fireEvent.change(screen.getByLabelText(/^Actual for Kickoff occurrence/), {
      target: { value: "2027-03-20" },
    });
    expect(onUpdateMilestone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Cancel date edit for Plan for Kickoff occurrence/ }));
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("2026-09-15");
    expect(screen.getByLabelText(/^Actual for Kickoff occurrence/)).toHaveValue("2027-03-20");
    expect(screen.getByRole("dialog", { name: "Publish Working Draft" })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog", { name: "Publish Working Draft" }))
      .getByRole("button", { name: "Publish" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^Cancel date edit for Actual for Kickoff occurrence/ }));
    expect(screen.getByLabelText(/^Actual for Kickoff occurrence/)).toHaveValue("");
    expect(within(screen.getByRole("dialog", { name: "Publish Working Draft" }))
      .getByRole("button", { name: "Publish" })).toBeEnabled();
    expect(onUpdateMilestone).not.toHaveBeenCalled();
  });

  it("keeps initially-null Plan and populated Actual local until each Apply Date", () => {
    const actual = parseDateOnly("2026-09-19");
    if (actual === null) throw new Error("Invalid test date");
    render(<ScheduleWorkspace {...workingDraftProps} draftRead={{
      kind: "workingDraft",
      draft: { milestones: [{ ...draft.milestones[0]!, plan: null, actual }] },
      milestoneRows: [{ ...workingDraftRow, plan: null, actual }],
    }} />);
    const planInput = screen.getByLabelText(/^Plan for Kickoff occurrence/);
    const actualInput = screen.getByLabelText(/^Actual for Kickoff occurrence/);
    expect(planInput).toHaveValue("");
    expect(planInput).toHaveAttribute("aria-invalid", "false");
    fireEvent.input(planInput, { target: { value: "2027-03-18" } });
    fireEvent.change(actualInput, { target: { value: "2027-03-19" } });
    fireEvent.blur(actualInput);
    expect(onUpdateMilestone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Apply Date to Plan for Kickoff occurrence/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Apply Date to Actual for Kickoff occurrence/ }));
    expect(onUpdateMilestone.mock.calls).toEqual([
      [{ milestoneId: toMilestoneId("draft-kickoff"), field: "plan", value: parseDateOnly("2027-03-18") }],
      [{ milestoneId: toMilestoneId("draft-kickoff"), field: "actual", value: parseDateOnly("2027-03-19") }],
    ]);
  });

  it("keeps an empty native input unapplied without clearing a saved date", () => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    const input = screen.getByLabelText(/^Plan for Kickoff occurrence/);
    fireEvent.input(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(onUpdateMilestone).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Date not applied/);
    expect(screen.getByRole("button", { name: /^Apply Date to Plan for Kickoff occurrence/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  it("keeps a sanitized invalid native value unapplied", () => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    const input = screen.getByLabelText(/^Plan for Kickoff occurrence/);
    fireEvent.change(input, { target: { value: "2026-02-30" } });
    expect(onUpdateMilestone).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Date not applied/);
    expect(screen.getByRole("button", { name: /^Apply Date to Plan for Kickoff occurrence/ })).toBeDisabled();
  });

  it("blocks Publish for invalid Plan input while keeping Discard available", () => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    fireEvent.change(screen.getByLabelText(/^Plan for Kickoff occurrence/), {
      target: { value: "2026-02-30" },
    });
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByText("Correct or clear unapplied dates before publishing."))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard Draft" })).toBeEnabled();
  });

  it("blocks an open Publish confirmation for invalid Actual input", () => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.input(screen.getByLabelText(/^Actual for Kickoff occurrence/), {
      target: { value: "2026/13/01" },
    });
    const dialog = screen.getByRole("dialog", { name: "Publish Working Draft" });
    expect(within(dialog).getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(onPublishDraft).not.toHaveBeenCalled();
  });

  it("unblocks Publish only when a valid edit is reflected by canonical props", () => {
    const { rerender } = render(<ScheduleWorkspace {...workingDraftProps} />);
    fireEvent.change(screen.getByLabelText(/^Plan for Kickoff occurrence/), {
      target: { value: "2026-12-15" },
    });
    expect(onUpdateMilestone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Apply Date to Plan for Kickoff occurrence/ }));
    expect(onUpdateMilestone).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    rerender(<ScheduleWorkspace {...propsForDateBuffer(
      "workspace-project", "draft-kickoff", parseDateOnly("2026-12-15"),
    )} />);
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  });

  it("keeps rejected selections and pending Clear guarded until canonical props reflect them", () => {
    const populatedActual = parseDateOnly("2026-09-19");
    const nextPlan = parseDateOnly("2026-11-03");
    if (populatedActual === null || nextPlan === null) throw new Error("Invalid test date");
    const propsWith = (plan: DateOnly | null, actual: DateOnly | null): ScheduleWorkspaceProps => ({
      ...workingDraftProps,
      draftRead: {
        kind: "workingDraft",
        draft: { milestones: [{ ...draft.milestones[0]!, plan, actual }] },
        milestoneRows: [{ ...workingDraftRow, plan, actual }],
      },
    });
    const initial = propsWith(null, populatedActual);
    const { rerender } = render(<ScheduleWorkspace {...initial} />);
    fireEvent.change(screen.getByLabelText(/^Plan for Kickoff occurrence/), {
      target: { value: "2026-11-03" },
    });
    expect(onUpdateMilestone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Apply Date to Plan for Kickoff occurrence/ }));
    expect(onUpdateMilestone).toHaveBeenLastCalledWith({
      milestoneId: toMilestoneId("draft-kickoff"), field: "plan", value: nextPlan,
    });
    rerender(<ScheduleWorkspace {...initial} feedback={["Update rejected"]} />);
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveAccessibleDescription(/last accepted value is unchanged/);
    rerender(<ScheduleWorkspace {...propsWith(nextPlan, populatedActual)} />);
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();

    fireEvent.change(screen.getByLabelText(/^Actual for Kickoff occurrence/), {
      target: { value: "2026-12-04" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Apply Date to Actual for Kickoff occurrence/ }));
    expect(onUpdateMilestone).toHaveBeenLastCalledWith({
      milestoneId: toMilestoneId("draft-kickoff"), field: "actual", value: parseDateOnly("2026-12-04"),
    });
    rerender(<ScheduleWorkspace {...propsWith(nextPlan, parseDateOnly("2026-12-04"))} />);
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /^Clear Actual for Kickoff occurrence/ }));
    expect(onUpdateMilestone).toHaveBeenLastCalledWith({
      milestoneId: toMilestoneId("draft-kickoff"), field: "actual", value: null,
    });
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    rerender(<ScheduleWorkspace {...propsWith(nextPlan, null)} />);
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  });

  it("distinguishes duplicate milestone definitions by occurrence and Project in each date action", () => {
    const secondId = toMilestoneId("draft-kickoff-two");
    render(<ScheduleWorkspace {...workingDraftProps} draftRead={{
      kind: "workingDraft",
      draft: { milestones: [draft.milestones[0]!, { ...draft.milestones[0]!, milestoneId: secondId }] },
      milestoneRows: [workingDraftRow, { ...workingDraftRow, milestoneId: secondId }],
    }} />);
    for (const occurrence of ["draft-kickoff", "draft-kickoff-two"]) {
      const name = `Plan for Kickoff occurrence ${occurrence} in Project workspace-project`;
      const input = screen.getByLabelText(name);
      expect(input).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Clear ${name}` })).toBeInTheDocument();
      fireEvent.focus(input);
      expect(screen.getByRole("button", { name: `Apply Date to ${name}` })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Cancel date edit for ${name}` })).toBeInTheDocument();
    }
  });

  it("clears an invalid editor's Publish guard when its row is removed", () => {
    const { rerender } = render(<ScheduleWorkspace {...workingDraftProps} />);
    fireEvent.change(screen.getByLabelText(/^Plan for Kickoff occurrence/), {
      target: { value: "2026-02-30" },
    });
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    rerender(<ScheduleWorkspace {...workingDraftProps} draftRead={{
      kind: "workingDraft",
      draft: { milestones: [] },
      milestoneRows: [],
    }} />);
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  });

  it("keeps Publish blocked when one of two invalid rows remains", () => {
    const secondId = toMilestoneId("draft-second-kickoff");
    const secondRow: ScheduleWorkingDraftMilestoneRow = {
      ...workingDraftRow,
      milestoneId: secondId,
      milestone: "Second Kickoff",
    };
    const secondMilestone = { ...draft.milestones[0]!, milestoneId: secondId };
    const twoRows: ScheduleWorkspaceProps = {
      ...workingDraftProps,
      draftRead: {
        kind: "workingDraft",
        draft: { milestones: [draft.milestones[0]!, secondMilestone] },
        milestoneRows: [workingDraftRow, secondRow],
      },
    };
    const { rerender } = render(<ScheduleWorkspace {...twoRows} />);
    fireEvent.change(screen.getByLabelText(/^Plan for Kickoff occurrence/), {
      target: { value: "2026-02-30" },
    });
    fireEvent.change(screen.getByLabelText(/^Plan for Second Kickoff occurrence/), {
      target: { value: "2026-13-01" },
    });
    rerender(<ScheduleWorkspace {...twoRows} draftRead={{
      kind: "workingDraft",
      draft: { milestones: [secondMilestone] },
      milestoneRows: [secondRow],
    }} />);
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  function propsForDateBuffer(
    projectId: string, milestoneId: string, planValue: DateOnly | null,
  ): ScheduleWorkspaceProps {
    const typedMilestoneId = toMilestoneId(milestoneId);
    return {
      ...workingDraftProps,
      projectId: toProjectId(projectId),
      draftRead: {
        kind: "workingDraft",
        draft: { milestones: [{ ...draft.milestones[0]!, milestoneId: typedMilestoneId,
          plan: planValue }] },
        milestoneRows: [{ ...workingDraftRow, milestoneId: typedMilestoneId,
          plan: planValue }],
      },
    };
  }

  it("clears unapplied feedback only after accepted canonical props reflect valid text or clear", () => {
    const initial = parseDateOnly("2026-09-15");
    const accepted = parseDateOnly("2026-12-15");
    if (initial === null || accepted === null) throw new Error("Invalid test date");
    const { rerender } = render(<ScheduleWorkspace {...propsForDateBuffer(
      "p1", "m1", initial,
    )} />);
    const input = screen.getByLabelText(/^Plan for Kickoff occurrence/);
    fireEvent.change(input, { target: { value: "2026-02-30" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(input, { target: { value: "2026-12-15" } });
    expect(input).toHaveAccessibleDescription(/last accepted value is unchanged/i);
    fireEvent.click(screen.getByRole("button", { name: /^Apply Date to Plan for Kickoff occurrence/ }));
    rerender(<ScheduleWorkspace {...propsForDateBuffer("p1", "m1", accepted)} />);
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveAttribute("aria-invalid", "false");
    fireEvent.click(screen.getByRole("button", { name: /^Clear Plan for Kickoff occurrence/ }));
    rerender(<ScheduleWorkspace {...propsForDateBuffer("p1", "m1", null)} />);
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText(/Date not applied\./)).not.toBeInTheDocument();
  });

  it("resets unapplied native input across Project, milestone, field, and canonical changes", () => {
    const initial = parseDateOnly("2026-09-15");
    const replacement = parseDateOnly("2026-10-20");
    if (initial === null || replacement === null) throw new Error("Invalid test date");
    const { rerender } = render(
      <ScheduleWorkspace {...propsForDateBuffer("p1", "m1", initial)} />,
    );
    fireEvent.change(screen.getByLabelText(/^Plan for Kickoff occurrence/), {
      target: { value: "" },
    });
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveAttribute("aria-invalid", "true");
    rerender(<ScheduleWorkspace {...propsForDateBuffer("p2", "m1", initial)} />);
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("2026-09-15");
    fireEvent.change(screen.getByLabelText(/^Plan for Kickoff occurrence/), {
      target: { value: "" },
    });
    rerender(<ScheduleWorkspace {...propsForDateBuffer("p2", "m2", initial)} />);
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("2026-09-15");
    fireEvent.change(screen.getByLabelText(/^Actual for Kickoff occurrence/), {
      target: { value: "" },
    });
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("2026-09-15");
    rerender(<ScheduleWorkspace {...propsForDateBuffer("p2", "m2", replacement)} />);
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("2026-10-20");
  });

  it("emits only approved applicability, catalog Add, and exact Remove inputs", () => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    fireEvent.change(screen.getByLabelText("Applicability for Kickoff"), {
      target: { value: "notApplicable" },
    });
    expect(onUpdateMilestone).toHaveBeenLastCalledWith({
      milestoneId: toMilestoneId("draft-kickoff"), field: "applicability",
      value: "notApplicable",
    });
    expect(onUpdateMilestone).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("2026-09-15");
    const catalog = screen.getByLabelText("Milestone definition");
    expect(within(catalog).getByRole("option", { name: "Kickoff" })).toBeInTheDocument();
    expect(within(screen.getByLabelText("Applicability for Kickoff"))
      .getByRole("option", { name: "Not Applicable" })).toHaveValue("notApplicable");
    expect(screen.queryByLabelText("Milestone name")).not.toBeInTheDocument();
    fireEvent.change(catalog, { target: { value: "milestone-design-kickoff" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Milestone" }));
    expect(onAddMilestone).toHaveBeenCalledTimes(1);
    expect(onAddMilestone).toHaveBeenCalledWith(
      toMilestoneDefinitionId("milestone-design-kickoff"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Kickoff" }));
    expect(onRemoveMilestone).toHaveBeenCalledWith(toMilestoneId("draft-kickoff"));
  });

  it("requires Publish confirmation and keeps editing without dispatch", () => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    let dialog = screen.getByRole("dialog", { name: "Publish Working Draft" });
    expect(within(dialog).getByText("Published versions cannot be edited.")).toBeInTheDocument();
    expect(within(dialog).getByText("Publish as v04")).toBeInTheDocument();
    expect(onPublishDraft).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep Editing" }));
    expect(onPublishDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    dialog = screen.getByRole("dialog", { name: "Publish Working Draft" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));
    expect(onPublishDraft).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Version note")).not.toBeInTheDocument();
  });

  it("requires Discard confirmation and preserves edits on Keep Editing", () => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Discard Draft" }));
    let dialog = screen.getByRole("dialog", { name: "Discard Working Draft" });
    expect(within(dialog).getByText("Published Schedule versions will not be affected."))
      .toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep Editing" }));
    expect(onCancelDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard Draft" }));
    dialog = screen.getByRole("dialog", { name: "Discard Working Draft" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard Draft" }));
    expect(onCancelDraft).toHaveBeenCalledTimes(1);
  });

  it("keeps only the latest confirmation and clears it when the Draft exits", () => {
    const { rerender } = render(<ScheduleWorkspace {...workingDraftProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard Draft" }));
    expect(screen.queryByRole("dialog", { name: "Publish Working Draft" })).not.toBeInTheDocument();
    const discard = screen.getByRole("dialog", { name: "Discard Working Draft" });
    fireEvent.click(within(discard).getByRole("button", { name: "Discard Draft" }));
    expect(onCancelDraft).toHaveBeenCalledTimes(1);
    rerender(<ScheduleWorkspace {...baseProps} />);
    rerender(<ScheduleWorkspace {...workingDraftProps} />);
    expect(screen.queryByRole("dialog", { name: "Publish Working Draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Discard Working Draft" })).not.toBeInTheDocument();
    expect(onPublishDraft).not.toHaveBeenCalled();
  });

  it("replaces a Discard confirmation with Publish before either lifecycle command", () => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Discard Draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(screen.queryByRole("dialog", { name: "Discard Working Draft" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Publish Working Draft" })).toBeInTheDocument();
    expect(onCancelDraft).not.toHaveBeenCalled();
    expect(onPublishDraft).not.toHaveBeenCalled();
  });

  it("resets confirmation on Project change and after a failed void lifecycle callback", () => {
    const { rerender } = render(<ScheduleWorkspace {...workingDraftProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    rerender(<ScheduleWorkspace {...workingDraftProps} projectId={toProjectId("other-project")} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" }))
      .getByRole("button", { name: "Publish" }));
    expect(onPublishDraft).toHaveBeenCalledTimes(1);
    rerender(<ScheduleWorkspace {...workingDraftProps} projectId={toProjectId("other-project")}
      feedback={["The next Published version is unavailable."]} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("The next Published version is unavailable.")).toBeInTheDocument();
  });

  it("offers only Discard recovery for a malformed existing Draft", () => {
    render(<ScheduleWorkspace {...baseProps} draftRead={{
      kind: "unavailable", workingDraftExists: true, issues: [draftIssue],
    }} />);
    expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
    expect(screen.getByText("Working Draft data unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Milestone" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Plan for Kickoff occurrence/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume Draft" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard Draft" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Discard Working Draft" }))
      .getByRole("button", { name: "Discard Draft" }));
    expect(onCancelDraft).toHaveBeenCalledTimes(1);
  });
});
