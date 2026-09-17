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
    expect(screen.getByLabelText("Plan for Kickoff")).toHaveValue("2026-09-15");
    expect(screen.getByLabelText("Actual for Kickoff")).toHaveValue("");
    expect(screen.queryByRole("columnheader", { name: "Applicability" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Kickoff" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard Draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume Draft" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Based on Published|Version History|Review Mode/i))
      .not.toBeInTheDocument();
  });

  it("emits only complete raw DateOnly values and null clears", () => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    const plan = screen.getByLabelText("Plan for Kickoff");
    fireEvent.change(plan, { target: { value: "2026-09" } });
    expect(onUpdateMilestone).not.toHaveBeenCalled();
    expect(plan).toHaveValue("2026-09");
    fireEvent.change(plan, { target: { value: "2026-09-30" } });
    expect(onUpdateMilestone).toHaveBeenLastCalledWith({
      milestoneId: toMilestoneId("draft-kickoff"), field: "plan",
      value: parseDateOnly("2026-09-30"),
    });
    fireEvent.change(plan, { target: { value: "" } });
    expect(onUpdateMilestone).toHaveBeenLastCalledWith({
      milestoneId: toMilestoneId("draft-kickoff"), field: "plan", value: null,
    });
    fireEvent.change(screen.getByLabelText("Actual for Kickoff"), {
      target: { value: "2026-10-01" },
    });
    expect(onUpdateMilestone).toHaveBeenLastCalledWith({
      milestoneId: toMilestoneId("draft-kickoff"), field: "actual",
      value: parseDateOnly("2026-10-01"),
    });
  });

  it.each(["2026-12-15", "2026/12/15"])("accepts %s as canonical ISO", (text) => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Plan for Kickoff" }), {
      target: { value: text },
    });
    expect(onUpdateMilestone).toHaveBeenCalledTimes(1);
    expect(onUpdateMilestone).toHaveBeenCalledWith({
      milestoneId: draft.milestones[0]!.milestoneId,
      field: "plan",
      value: parseDateOnly("2026-12-15"),
    });
  });

  it("accepts a valid slash leap day as canonical ISO", () => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    fireEvent.change(screen.getByLabelText("Plan for Kickoff"), {
      target: { value: "2028/02/29" },
    });
    expect(onUpdateMilestone).toHaveBeenCalledWith({
      milestoneId: draft.milestones[0]!.milestoneId,
      field: "plan",
      value: parseDateOnly("2028-02-29"),
    });
  });

  it.each(["2026/02-28", "2026-2-28", "2026-02", "2026-02-30"])(
    "keeps unsupported date text %s unapplied without dispatching",
    (text) => {
      render(<ScheduleWorkspace {...workingDraftProps} />);
      const input = screen.getByLabelText("Plan for Kickoff");
      fireEvent.change(input, { target: { value: text } });
      expect(onUpdateMilestone).not.toHaveBeenCalled();
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAccessibleDescription(
        /Date not applied\. Enter a valid date as YYYY-MM-DD or YYYY\/MM\/DD\./,
      );
    },
  );

  it("shows invalid text as unapplied without dispatching an edit", () => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    const input = screen.getByRole("textbox", { name: "Plan for Kickoff" });
    fireEvent.change(input, { target: { value: "2026/02/30" } });
    expect(onUpdateMilestone).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      /Date not applied\. Enter a valid date as YYYY-MM-DD or YYYY\/MM\/DD\./,
    );
  });

  it("blocks Publish for invalid Plan text while keeping Discard available", () => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    fireEvent.change(screen.getByLabelText("Plan for Kickoff"), {
      target: { value: "2026-02-30" },
    });
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByText("Correct or clear unapplied dates before publishing."))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard Draft" })).toBeEnabled();
  });

  it("blocks an open Publish confirmation for invalid Actual text", () => {
    render(<ScheduleWorkspace {...workingDraftProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.change(screen.getByLabelText("Actual for Kickoff"), {
      target: { value: "2026/13/01" },
    });
    const dialog = screen.getByRole("dialog", { name: "Publish Working Draft" });
    expect(within(dialog).getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(onPublishDraft).not.toHaveBeenCalled();
  });

  it("unblocks Publish only when a valid edit is reflected by canonical props", () => {
    const { rerender } = render(<ScheduleWorkspace {...workingDraftProps} />);
    fireEvent.change(screen.getByLabelText("Plan for Kickoff"), {
      target: { value: "2026-12-15" },
    });
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    rerender(<ScheduleWorkspace {...propsForDateBuffer(
      "workspace-project", "draft-kickoff", parseDateOnly("2026-12-15"),
    )} />);
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  });

  it("clears an invalid editor's Publish guard when its row is removed", () => {
    const { rerender } = render(<ScheduleWorkspace {...workingDraftProps} />);
    fireEvent.change(screen.getByLabelText("Plan for Kickoff"), {
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
    fireEvent.change(screen.getByLabelText("Plan for Kickoff"), {
      target: { value: "2026-02-30" },
    });
    fireEvent.change(screen.getByLabelText("Plan for Second Kickoff"), {
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
    const input = screen.getByLabelText("Plan for Kickoff");
    fireEvent.change(input, { target: { value: "2026-02-30" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(input, { target: { value: "2026-12-15" } });
    expect(input).toHaveAccessibleDescription(/last accepted value is unchanged/i);
    rerender(<ScheduleWorkspace {...propsForDateBuffer("p1", "m1", accepted)} />);
    expect(screen.getByLabelText("Plan for Kickoff")).toHaveAttribute("aria-invalid", "false");
    fireEvent.change(screen.getByLabelText("Plan for Kickoff"), { target: { value: "" } });
    rerender(<ScheduleWorkspace {...propsForDateBuffer("p1", "m1", null)} />);
    expect(screen.getByLabelText("Plan for Kickoff")).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText(/Date not applied\./)).not.toBeInTheDocument();
  });

  it("resets incomplete date text across Project, milestone, field, and canonical value changes", () => {
    const initial = parseDateOnly("2026-09-15");
    const replacement = parseDateOnly("2026-10-20");
    if (initial === null || replacement === null) throw new Error("Invalid test date");
    const { rerender } = render(
      <ScheduleWorkspace {...propsForDateBuffer("p1", "m1", initial)} />,
    );
    fireEvent.change(screen.getByLabelText("Plan for Kickoff"), {
      target: { value: "2030-0" },
    });
    expect(screen.getByLabelText("Plan for Kickoff")).toHaveValue("2030-0");
    rerender(<ScheduleWorkspace {...propsForDateBuffer("p2", "m1", initial)} />);
    expect(screen.getByLabelText("Plan for Kickoff")).toHaveValue("2026-09-15");
    fireEvent.change(screen.getByLabelText("Plan for Kickoff"), {
      target: { value: "2031-0" },
    });
    rerender(<ScheduleWorkspace {...propsForDateBuffer("p2", "m2", initial)} />);
    expect(screen.getByLabelText("Plan for Kickoff")).toHaveValue("2026-09-15");
    fireEvent.change(screen.getByLabelText("Actual for Kickoff"), {
      target: { value: "2032-0" },
    });
    expect(screen.getByLabelText("Plan for Kickoff")).toHaveValue("2026-09-15");
    rerender(<ScheduleWorkspace {...propsForDateBuffer("p2", "m2", replacement)} />);
    expect(screen.getByLabelText("Plan for Kickoff")).toHaveValue("2026-10-20");
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
    expect(screen.getByLabelText("Plan for Kickoff")).toHaveValue("2026-09-15");
    const catalog = screen.getByLabelText("Milestone definition");
    expect(within(catalog).getByRole("option", { name: "Kickoff" })).toBeInTheDocument();
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
    expect(screen.queryByLabelText("Plan for Kickoff")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume Draft" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard Draft" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Discard Working Draft" }))
      .getByRole("button", { name: "Discard Draft" }));
    expect(onCancelDraft).toHaveBeenCalledTimes(1);
  });
});
