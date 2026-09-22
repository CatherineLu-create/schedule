import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import * as XLSX from "xlsx";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  updateProjectMaster,
  type UpdateProjectMasterInput,
  type UpdateProjectMasterResult,
} from "../../application/commands/projectCommands";
import {
  cancelScheduleWorkingDraft,
  startScheduleWorkingDraft,
} from "../../application/commands/canonicalScheduleCommands";
import { selectDashboardProjectRow } from "../../application/selectors/dashboardProjectRows";
import {
  resolveCanonicalScheduleOwner,
  selectCurrentPublishedSchedule,
  selectScheduleWorkingDraft,
} from "../../application/selectors/scheduleSelectors";
import { prototypeReducer } from "../../application/state/prototypeReducer";
import type { PrototypeState } from "../../application/state/prototypeState";
import { milestoneDefinitions } from "../../config/v2/referenceData";
import type { Project } from "../../domain/project/project";
import type { CanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import type { ScheduleVersionNumber } from "../../domain/schedule/schedule";
import { toMilestoneDefinitionId } from "../../domain/shared/ids";
import {
  canonicalProjectFixtures,
  devProject001,
  devProject002,
  devProject003,
} from "../../fixtures/v2/canonicalProjectFixtures";
import {
  canonicalScheduleFixtures,
  devSchedule001,
} from "../../fixtures/v2/canonicalScheduleFixtures";
import type { ScheduleWorkspaceProps } from "../../scheduleWorkspace";
import {
  App,
  ProjectWorkspace,
} from "../../main";

vi.mock("../../application/commands/projectCommands", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../application/commands/projectCommands")>();
  return { ...actual, updateProjectMaster: vi.fn(actual.updateProjectMaster) };
});

vi.mock("../../application/state/prototypeReducer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../application/state/prototypeReducer")>();
  return { ...actual, prototypeReducer: vi.fn(actual.prototypeReducer) };
});

vi.mock("xlsx", () => ({
  utils: {
    json_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
    sheet_to_json: vi.fn(() => []),
  },
  writeFile: vi.fn(),
  read: vi.fn(),
}));

const fixedUuid = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function dashboardTable(): HTMLTableElement {
  return screen.getByRole("table");
}

function dashboardRows(): HTMLElement[] {
  return Array.from(dashboardTable().querySelectorAll<HTMLElement>("tbody [data-project-id]"));
}

function dashboardRow(projectId: string): HTMLElement {
  const row = dashboardRows().find((candidate) => candidate.dataset.projectId === projectId);
  if (row === undefined) throw new Error(`Missing canonical Dashboard row for ${projectId}`);
  return row;
}

function openProjectByQci(qciModelName: string): void {
  const qciCell = within(dashboardTable()).getByText(qciModelName);
  const row = qciCell.closest("tr");
  if (row === null) throw new Error(`Missing Dashboard row for ${qciModelName}`);
  fireEvent.click(row);
}

function openProjectByName(projectName: string): void {
  const nameCell = within(dashboardTable()).getByText(projectName);
  const row = nameCell.closest("tr");
  if (row === null) throw new Error(`Missing Dashboard row for ${projectName}`);
  fireEvent.click(row);
}

function openCreateDialog(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
  return screen.getByRole("dialog", { name: "Create Project" });
}

function fillCreateIdentity(
  dialog: HTMLElement,
  values: {
    readonly year: string;
    readonly productLineId: string;
    readonly stnProjectName: string;
    readonly qciModelName?: string;
  },
): void {
  fireEvent.change(within(dialog).getByLabelText("Year"), { target: { value: values.year } });
  fireEvent.change(within(dialog).getByLabelText("Product Line"), {
    target: { value: values.productLineId },
  });
  fireEvent.change(within(dialog).getByLabelText("STN Project Name"), {
    target: { value: values.stnProjectName },
  });
  if (values.qciModelName !== undefined) {
    fireEvent.change(within(dialog).getByLabelText("QCI Model Name"), {
      target: { value: values.qciModelName },
    });
  }
}

function projectHeader(): HTMLElement {
  return screen.getByRole("region", { name: "Project Header" });
}

function LocalScheduleWorkspaceHarness({ schedule }: { schedule: CanonicalProjectSchedule }) {
  const localState: PrototypeState = {
    projects: [devProject003],
    schedules: [schedule],
  };
  const row = selectDashboardProjectRow(localState, devProject003.id);

  if (row === null) {
    throw new Error("Missing canonical Dashboard row for malformed Schedule harness");
  }

  return (
    <ProjectWorkspace
      feedback={[]}
      onBack={() => undefined}
      onEditProject={() => undefined}
      project={devProject003}
      row={row}
      scheduleWorkspaceProps={{
        draftRead: selectScheduleWorkingDraft(localState, devProject003.id),
        feedback: [],
        milestoneDefinitions,
        nextVersionLabel: null,
        officialRead: selectCurrentPublishedSchedule(localState, devProject003.id),
        onAddMilestone: () => undefined,
        onCancelDraft: () => undefined,
        onPublishDraft: () => undefined,
        onRemoveMilestone: () => undefined,
        onStartDraft: () => undefined,
        onUpdateMilestone: () => undefined,
        projectId: devProject003.id,
      }}
    />
  );
}

const zeroMilestoneSchedule: CanonicalProjectSchedule = {
  projectId: devProject003.id,
  publishedVersions: [{
    versionNumber: 1 as ScheduleVersionNumber,
    versionNote: null,
    publishedAt: "2026-09-12T00:00:00Z",
    milestones: [],
  }],
  workingDraft: null,
};

const malformedSchedule: CanonicalProjectSchedule = {
  ...zeroMilestoneSchedule,
  publishedVersions: [{
    ...zeroMilestoneSchedule.publishedVersions[0]!,
    versionNumber: 0 as ScheduleVersionNumber,
  }],
};

const currentScheduleWithOutOfOrderHistory: CanonicalProjectSchedule = {
  projectId: devProject003.id,
  publishedVersions: [
    { ...zeroMilestoneSchedule.publishedVersions[0]!, versionNumber: 1 as ScheduleVersionNumber },
    { ...zeroMilestoneSchedule.publishedVersions[0]!, versionNumber: 4 as ScheduleVersionNumber },
    { ...zeroMilestoneSchedule.publishedVersions[0]!, versionNumber: 2 as ScheduleVersionNumber },
  ],
  workingDraft: null,
};

function MalformedDraftWorkspaceHarness(): React.ReactElement {
  const source = devSchedule001.publishedVersions[0]!.milestones[0]!;
  const [state, dispatch] = React.useReducer(prototypeReducer, {
    projects: [devProject001],
    schedules: [{
      ...devSchedule001,
      workingDraft: {
        milestones: [{
          ...source,
          milestoneDefinitionId: toMilestoneDefinitionId("missing-definition"),
        }],
      },
    }],
  });
  const row = selectDashboardProjectRow(state, devProject001.id);
  if (row === null) throw new Error("Missing malformed-harness Dashboard row");

  const owner = resolveCanonicalScheduleOwner(state, devProject001.id);
  const onCancelDraft = (): void => {
    if (owner.kind === "unavailable") return;
    const result = cancelScheduleWorkingDraft(owner.schedule);
    if (!result.ok) return;
    dispatch({ type: "scheduleReplaced", projectId: devProject001.id,
      schedule: result.schedule });
  };
  const onStartDraft = (): void => {
    if (owner.kind === "unavailable") return;
    const result = startScheduleWorkingDraft(owner.schedule, { milestoneDefinitions });
    if (!result.ok || result.status === "existing") return;
    dispatch({ type: "scheduleReplaced", projectId: devProject001.id,
      schedule: result.schedule });
  };
  const scheduleWorkspaceProps: ScheduleWorkspaceProps = {
    draftRead: selectScheduleWorkingDraft(state, devProject001.id),
    feedback: [],
    milestoneDefinitions,
    nextVersionLabel: null,
    officialRead: selectCurrentPublishedSchedule(state, devProject001.id),
    onAddMilestone: () => undefined,
    onCancelDraft,
    onPublishDraft: () => undefined,
    onRemoveMilestone: () => undefined,
    onStartDraft: owner.kind === "available" ? onStartDraft : null,
    onUpdateMilestone: () => undefined,
    projectId: devProject001.id,
  };

  return <ProjectWorkspace
    feedback={[]}
    onBack={() => undefined}
    onEditProject={() => undefined}
    project={devProject001}
    row={row}
    scheduleWorkspaceProps={scheduleWorkspaceProps}
  />;
}

function lastReducedState(): PrototypeState {
  const result = vi.mocked(prototypeReducer).mock.results.at(-1);
  if (result?.type !== "return") {
    throw new Error("Expected a real completed reducer transition");
  }
  return result.value;
}

function applyDateInput(input: HTMLElement, date: string): void {
  const label = input.getAttribute("aria-label");
  if (label === null) throw new Error("Date input needs an accessible label");
  fireEvent.change(input, { target: { value: date } });
  fireEvent.click(screen.getByRole("button", { name: `Apply Date to ${label}` }));
}

describe("canonical Portfolio, Project/Master and Schedule runtime", () => {
  it("shows one Current Schedule directly below Resources", () => {
    render(<App />);
    openProjectByName("Manta");

    const master = projectHeader();
    const resources = screen.getByRole("region", { name: "Resources" });
    const schedule = screen.getByRole("region", { name: "Current Schedule" });
    expect(master.compareDocumentPosition(resources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(resources.nextElementSibling).toBe(schedule);
    expect(screen.getAllByRole("region", { name: "Current Schedule" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Open Schedule" })).not.toBeInTheDocument();
    expect(within(resources).getByText("Shown below")).toBeInTheDocument();
    expect(within(resources).getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent)).toEqual([
        "Schedule", "Team Member", "Weekly Report", "AVL",
      ]);
    expect(within(resources).getAllByText("Migration pending")).toHaveLength(2);
    expect(within(resources).getByRole("button", { name: "Open Team Member" })).toBeEnabled();
    for (const name of ["Open Weekly Report", "Open AVL"]) {
      expect(within(resources).getByRole("button", { name })).toBeDisabled();
    }
  });

  it.each([
    ["2026-12-15", "Dashboard"],
    ["2026-12-15", "Nautilus"],
  ])("applies initially-null ID fix Actual %s before navigating through %s", (text, route) => {
    render(<App />);
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText(/^Actual for ID fix occurrence/)).toHaveValue("");
    const before = lastReducedState();
    vi.mocked(prototypeReducer).mockClear();
    const actualInput = screen.getByLabelText(/^Actual for ID fix occurrence/);
    fireEvent.change(actualInput, { target: { value: text } });
    expect(vi.mocked(prototypeReducer)).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: `Apply Date to ${actualInput.getAttribute("aria-label")}` }));
    const after = lastReducedState();
    expect(vi.mocked(prototypeReducer).mock.calls.at(-1)?.[1]).toMatchObject({
      type: "scheduleReplaced", projectId: devProject001.id,
    });
    const schedule = after.schedules.find((entry) => entry.projectId === devProject001.id)!;
    expect(schedule.workingDraft?.milestones.find(
      (entry) => entry.milestoneId === "dev-project-001-milestone-design-id-fix",
    )?.actual).toBe("2026-12-15");
    expect(schedule.publishedVersions).toBe(
      before.schedules.find((entry) => entry.projectId === devProject001.id)!.publishedVersions,
    );
    for (const unrelated of before.schedules.filter((entry) => entry.projectId !== devProject001.id)) {
      expect(after.schedules.find((entry) => entry.projectId === unrelated.projectId)).toBe(unrelated);
    }
    const transitionCount = vi.mocked(prototypeReducer).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    if (route === "Nautilus") {
      openProjectByName("Nautilus");
      fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    }
    openProjectByName("Manta");
    expect(screen.getByLabelText(/^Actual for ID fix occurrence/)).toHaveValue("2026-12-15");
    expect(vi.mocked(prototypeReducer).mock.calls).toHaveLength(transitionCount);
  });

  it.each([
    ["Plan", "2026-12-15", "Dashboard"],
    ["Plan", "2026-12-15", "Nautilus"],
    ["Actual", "2026-12-16", "Dashboard"],
    ["Actual", "2026-12-16", "Nautilus"],
  ] as const)("applies populated Kickoff %s %s before navigating through %s", (field, text, route) => {
    render(<App />);
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const label = `${field} for Kickoff`;
    const expected = field === "Plan" ? "2026-12-15" : "2026-12-16";
    expect(screen.getByLabelText(new RegExp(`^${label} occurrence `))).toHaveValue(field === "Plan" ? "2026-09-18" : "2026-09-19");
    vi.mocked(prototypeReducer).mockClear();
    const dateInput = screen.getByLabelText(new RegExp(`^${label} occurrence `));
    fireEvent.change(dateInput, { target: { value: text } });
    expect(vi.mocked(prototypeReducer)).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: `Apply Date to ${dateInput.getAttribute("aria-label")}` }));
    const after = lastReducedState();
    expect(vi.mocked(prototypeReducer).mock.calls.at(-1)?.[1]).toMatchObject({
      type: "scheduleReplaced", projectId: devProject001.id,
    });
    const kickoff = after.schedules.find((entry) => entry.projectId === devProject001.id)
      ?.workingDraft?.milestones.find(
        (entry) => entry.milestoneId === "dev-project-001-milestone-design-kickoff",
      );
    expect(field === "Plan" ? kickoff?.plan : kickoff?.actual).toBe(expected);
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    if (route === "Nautilus") {
      openProjectByName("Nautilus");
      fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    }
    openProjectByName("Manta");
    expect(screen.getByLabelText(new RegExp(`^${label} occurrence `))).toHaveValue(expected);
  });

  it("keeps provisional input, change, and focus loss out of the real reducer until Apply Date", () => {
    render(<App />);
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const before = lastReducedState();
    vi.mocked(prototypeReducer).mockClear();
    const plan = screen.getByLabelText(/^Plan for Kickoff occurrence/);
    fireEvent.focus(plan);
    fireEvent.input(plan, { target: { value: "2027-03-19" } });
    fireEvent.change(plan, { target: { value: "2027-03-19" } });
    fireEvent.blur(plan);
    expect(vi.mocked(prototypeReducer)).not.toHaveBeenCalled();
    expect(plan).toHaveValue("2027-03-19");
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^Cancel date edit for Plan for Kickoff occurrence/ }));
    expect(plan).toHaveValue("2026-09-18");
    expect(vi.mocked(prototypeReducer)).not.toHaveBeenCalled();
    fireEvent.change(plan, { target: { value: "2027-03-19" } });
    expect(vi.mocked(prototypeReducer)).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Apply Date to Plan for Kickoff occurrence/ }));
    expect(vi.mocked(prototypeReducer).mock.calls).toHaveLength(1);
    expect(vi.mocked(prototypeReducer).mock.calls[0]?.[1]).toMatchObject({
      type: "scheduleReplaced", projectId: devProject001.id,
    });
    const after = lastReducedState();
    const schedule = after.schedules.find((entry) => entry.projectId === devProject001.id)!;
    expect(schedule.workingDraft?.milestones.find((entry) =>
      entry.milestoneId === "dev-project-001-milestone-design-kickoff")?.plan).toBe("2027-03-19");
    expect(schedule.publishedVersions).toBe(
      before.schedules.find((entry) => entry.projectId === devProject001.id)!.publishedVersions,
    );
    for (const unrelated of before.schedules.filter((entry) => entry.projectId !== devProject001.id)) {
      expect(after.schedules.find((entry) => entry.projectId === unrelated.projectId)).toBe(unrelated);
    }
  });

  it("drops a valid unapplied candidate on Dashboard and Project navigation", () => {
    render(<App />);
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    vi.mocked(prototypeReducer).mockClear();
    fireEvent.change(screen.getByLabelText(/^Plan for Kickoff occurrence/), {
      target: { value: "2027-03-19" },
    });
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("2027-03-19");
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(vi.mocked(prototypeReducer)).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    openProjectByName("Nautilus");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByText(/Date not applied/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    openProjectByName("Manta");
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("2026-09-18");
    expect(screen.queryByText(/Date not applied/)).not.toBeInTheDocument();
    expect(vi.mocked(prototypeReducer).mock.calls.every(([, action]) =>
      action.type !== "scheduleReplaced" || action.projectId !== devProject001.id)).toBe(true);
  });

  it.each(["Dashboard", "Nautilus"])("persists clear and applicability through %s navigation", (route) => {
    render(<App />);
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    vi.mocked(prototypeReducer).mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^Clear Plan for Kickoff occurrence/ }));
    fireEvent.change(screen.getByLabelText("Applicability for Kickoff"), {
      target: { value: "notApplicable" },
    });
    const after = lastReducedState();
    const kickoff = after.schedules.find((entry) => entry.projectId === devProject001.id)
      ?.workingDraft?.milestones.find(
        (entry) => entry.milestoneId === "dev-project-001-milestone-design-kickoff",
      );
    expect(kickoff?.plan).toBeNull();
    expect(kickoff?.applicability).toBe("notApplicable");
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    if (route === "Nautilus") {
      openProjectByName("Nautilus");
      fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    }
    openProjectByName("Manta");
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("");
    expect(screen.getByLabelText("Applicability for Kickoff")).toHaveValue("notApplicable");
  });

  it("keeps invalid native input unapplied without a reducer transition", () => {
    render(<App />);
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const before = lastReducedState();
    vi.mocked(prototypeReducer).mockClear();
    const input = screen.getByLabelText(/^Plan for Kickoff occurrence/);
    fireEvent.change(input, { target: { value: "2026-02-30" } });
    expect(vi.mocked(prototypeReducer)).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Date not applied. Choose a valid date or use Clear."))
      .toBeInTheDocument();
    expect(before.schedules.find((entry) => entry.projectId === devProject001.id)?.workingDraft
      ?.milestones.find((entry) => entry.milestoneId === "dev-project-001-milestone-design-kickoff")?.plan)
      .toBe("2026-09-18");
  });

  it("keeps empty Plan input out of canonical state and blocks an open confirmation without Project leakage", () => {
    render(<App />);
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    const before = lastReducedState();
    vi.mocked(prototypeReducer).mockClear();
    fireEvent.input(screen.getByLabelText(/^Plan for Kickoff occurrence/), { target: { value: "" } });
    expect(vi.mocked(prototypeReducer)).not.toHaveBeenCalled();
    expect(before.schedules.find((entry) => entry.projectId === devProject001.id)
      ?.workingDraft?.milestones.find((entry) =>
        entry.milestoneId === "dev-project-001-milestone-design-kickoff")?.plan)
      .toBe("2026-09-18");
    expect(within(screen.getByRole("dialog", { name: "Publish Working Draft" }))
      .getByRole("button", { name: "Publish" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    openProjectByName("Nautilus");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByText(/Date not applied/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    openProjectByName("Manta");
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("2026-09-18");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/Date not applied/)).not.toBeInTheDocument();
  });

  it("restores the prior canonical date after impossible input and Dashboard navigation", () => {
    render(<App />);
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    vi.mocked(prototypeReducer).mockClear();
    fireEvent.change(screen.getByLabelText(/^Plan for Kickoff occurrence/), {
      target: { value: "2026-02-30" },
    });
    expect(vi.mocked(prototypeReducer)).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    openProjectByName("Manta");
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("2026-09-18");
    expect(vi.mocked(prototypeReducer)).not.toHaveBeenCalled();
  });

  it("keeps App confirmation directions mutually exclusive and clears them after Draft exits", () => {
    render(<App />);
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard Draft" }));
    expect(screen.queryByRole("dialog", { name: "Publish Working Draft" })).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Discard Working Draft" }))
      .getByRole("button", { name: "Discard Draft" }));
    expect(screen.getByText("Published v01")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard Draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(screen.queryByRole("dialog", { name: "Discard Working Draft" })).not.toBeInTheDocument();
    const publish = screen.getByRole("dialog", { name: "Publish Working Draft" });
    fireEvent.click(within(publish).getByRole("button", { name: "Keep Editing" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clears confirmations after successful Publish before a later Draft starts", () => {
    render(<App />);
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" }))
      .getByRole("button", { name: "Publish" }));
    expect(screen.getByText("Published v02")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Publish Working Draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Discard Working Draft" })).not.toBeInTheDocument();
  });

  it("clears an open confirmation across Dashboard navigation without a lifecycle reducer action", () => {
    render(<App />);
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard Draft" }));
    expect(screen.getByRole("dialog", { name: "Discard Working Draft" })).toBeInTheDocument();
    vi.mocked(prototypeReducer).mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    openProjectByName("Manta");
    expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(vi.mocked(prototypeReducer)).not.toHaveBeenCalled();
  });

  it("starts Manta's Published v1 as a directly editable Working Draft", () => {
    render(<App />);
    openProjectByName("Manta");
    expect(screen.getByRole("heading", { name: "Project Master" })).toBeInTheDocument();
    expect(screen.getByText("Published v01")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
    const resources = screen.getByRole("region", { name: "Resources" });
    const draftSchedule = screen.getByRole("region", { name: "Schedule" });
    expect(projectHeader().compareDocumentPosition(resources) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(resources.nextElementSibling).toBe(draftSchedule);
    expect(screen.getAllByRole("region", { name: "Schedule" })).toHaveLength(1);
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("2026-09-18");
    expect(screen.queryByRole("button", { name: "Resume Draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Draft" })).not.toBeInTheDocument();
  });

  it("persists valid Plan/Actual edits and null clears across navigation", () => {
    render(<App />);
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    applyDateInput(screen.getByLabelText(/^Plan for Kickoff occurrence/), "2026-12-15");
    applyDateInput(screen.getByLabelText(/^Actual for Kickoff occurrence/), "2026-12-16");
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    openProjectByName("Manta");
    expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("2026-12-15");
    expect(screen.getByLabelText(/^Actual for Kickoff occurrence/)).toHaveValue("2026-12-16");
    fireEvent.click(screen.getByRole("button", { name: /^Clear Actual for Kickoff occurrence/ }));
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    openProjectByName("Manta");
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("2026-12-15");
    expect(screen.getByLabelText(/^Actual for Kickoff occurrence/)).toHaveValue("");
    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-001");
  });

  it("keeps empty native input transient and changes applicability without clearing dates", () => {
    render(<App />);
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/^Plan for Kickoff occurrence/), {
      target: { value: "" },
    });
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(screen.getByLabelText("Applicability for Kickoff"), {
      target: { value: "notApplicable" },
    });
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    openProjectByName("Manta");
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("2026-09-18");
    expect(screen.getByLabelText("Applicability for Kickoff")).toHaveValue("notApplicable");
  });

  it("allocates one identity per Add and removes only the Draft row", () => {
    const randomUuid = vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222")
      .mockReturnValueOnce("33333333-3333-4333-8333-333333333333");
    render(<App />);
    openProjectByName("Nautilus");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Milestone definition"), {
      target: { value: "milestone-design-kickoff" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Milestone" }));
    expect(randomUuid).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("row", { name: /Kickoff/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Kickoff" }));
    expect(screen.queryByRole("row", { name: /Kickoff/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Milestone" }));
    expect(randomUuid).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("row", { name: /Kickoff/ })).toBeInTheDocument();
    expect(randomUuid.mock.results.map(({ value }) => value)).toEqual([
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("keeps edits until Discard confirmation and restores Official v1", () => {
    render(<App />);
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    applyDateInput(screen.getByLabelText(/^Plan for Kickoff occurrence/), "2032-02-20");
    fireEvent.click(screen.getByRole("button", { name: "Discard Draft" }));
    let dialog = screen.getByRole("dialog", { name: "Discard Working Draft" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep Editing" }));
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("2032-02-20");
    fireEvent.click(screen.getByRole("button", { name: "Discard Draft" }));
    dialog = screen.getByRole("dialog", { name: "Discard Working Draft" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard Draft" }));
    expect(screen.getByText("Published v01")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Working Draft" })).not.toBeInTheDocument();
  });

  it("publishes Manta v1 as v2 only after confirmation", () => {
    render(<App />);
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    applyDateInput(screen.getByLabelText(/^Plan for Kickoff occurrence/), "2033-03-04");
    applyDateInput(screen.getByLabelText(/^Actual for Kickoff occurrence/), "2033-03-05");
    fireEvent.change(screen.getByLabelText("Applicability for Kickoff"), {
      target: { value: "notApplicable" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    let dialog = screen.getByRole("dialog", { name: "Publish Working Draft" });
    expect(within(dialog).getByText("Publish as v02")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep Editing" }));
    expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    dialog = screen.getByRole("dialog", { name: "Publish Working Draft" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));
    expect(screen.getByText("Published v02")).toBeInTheDocument();
    expect(screen.getByText("2033/03/04")).toBeInTheDocument();
    expect(screen.getByText("2033/03/05")).toBeInTheDocument();
    expect(screen.getByText("Not Applicable")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Working Draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
  });

  it("publishes an empty no-Published Draft as v1", () => {
    render(<App />);
    openProjectByName("Nautilus");
    expect(within(screen.getByRole("region", { name: "Current Schedule" }))
      .getByText("-")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("No milestones")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" }))
      .getByRole("button", { name: "Publish" }));
    expect(screen.getByText("Published v01")).toBeInTheDocument();
    expect(screen.getByText("No milestones")).toBeInTheDocument();
  });

  it("isolates and resumes Drafts by exact ProjectId", () => {
    render(<App />);
    openProjectByName("Nautilus");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Milestone definition"), {
      target: { value: "milestone-design-kickoff" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Milestone" }));
    applyDateInput(screen.getByLabelText(/^Plan for Kickoff occurrence/), "2031-01-15");
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    openProjectByName("Manta");
    expect(screen.queryByDisplayValue("2031-01-15")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    openProjectByName("Nautilus");
    expect(screen.getByDisplayValue("2031-01-15")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume Draft" })).not.toBeInTheDocument();
    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-002");
  });

  it("keeps healthy Published truth available while recovering a malformed Draft", () => {
    render(<MalformedDraftWorkspaceHarness />);
    expect(screen.getByText("Working Draft data unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Published v01")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard Draft" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Discard Working Draft" }))
      .getByRole("button", { name: "Discard Draft" }));
    expect(screen.getByText("Published v01")).toBeInTheDocument();
    expect(within(projectHeader()).getByText("Project Name: Manta")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
  });

  it("keeps Portfolio Published-only while editing, then reflects Publish", () => {
    render(<App />);
    const initialCell = dashboardRow("dev-project-001")
      .querySelector('[data-column-key="schedule:design:kickoff"]');
    expect(initialCell).toHaveTextContent("P: 2026/09/18");
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    applyDateInput(screen.getByLabelText(/^Plan for Kickoff occurrence/), "2034-04-05");
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    expect(dashboardRow("dev-project-001")
      .querySelector('[data-column-key="schedule:design:kickoff"]'))
      .toHaveTextContent("P: 2026/09/18");
    expect(dashboardRow("dev-project-001")).not.toHaveTextContent("2034/04/05");
    expect(screen.queryByRole("columnheader", { name: "A2" })).not.toBeInTheDocument();
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" }))
      .getByRole("button", { name: "Publish" }));
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    expect(dashboardRow("dev-project-001")
      .querySelector('[data-column-key="schedule:design:kickoff"]'))
      .toHaveTextContent("P: 2034/04/05");
    expect(screen.queryByRole("columnheader", { name: "A2" })).not.toBeInTheDocument();
  });

  it("keeps ID fix's Published null Actual until its applicable Draft date is published", () => {
    render(<App />);
    const idFixCell = () => dashboardRow("dev-project-001")
      .querySelector('[data-column-key="schedule:design:id-fix"]');
    expect(idFixCell()).toHaveTextContent("Applicable");
    expect(idFixCell()).toHaveTextContent("A: —");

    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText(/^Actual for ID fix occurrence/)).toHaveValue("");
    applyDateInput(screen.getByLabelText(/^Actual for ID fix occurrence/), "2026-12-15");
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    expect(idFixCell()).toHaveTextContent("A: —");
    expect(idFixCell()).not.toHaveTextContent("2026/12/15");

    openProjectByName("Manta");
    expect(screen.getByLabelText(/^Actual for ID fix occurrence/)).toHaveValue("2026-12-15");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" }))
      .getByRole("button", { name: "Publish" }));
    expect(screen.getByText("Published v02")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    expect(idFixCell()).toHaveTextContent("Applicable");
    expect(idFixCell()).toHaveTextContent("A: 2026/12/15");
  });

  it("keeps Draft-only applicable A2 out of Dashboard until Publish", () => {
    render(<App />);
    expect(screen.queryByRole("columnheader", { name: "A2" })).not.toBeInTheDocument();
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Milestone definition"), {
      target: { value: "milestone-a-a2-a-g-o" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Milestone" }));
    const draft = lastReducedState().schedules.find((entry) => entry.projectId === devProject001.id)?.workingDraft;
    expect(draft?.milestones.find((entry) => entry.milestoneDefinitionId === "milestone-a-a2-a-g-o"))
      .toMatchObject({ applicability: "applicable", plan: null, actual: null });

    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    expect(screen.queryByRole("columnheader", { name: "A2" })).not.toBeInTheDocument();
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" }))
      .getByRole("button", { name: "Publish" }));
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    expect(screen.getByRole("columnheader", { name: "A2" })).toBeInTheDocument();
    const a2Cell = dashboardRow("dev-project-001")
      .querySelector('[data-column-key="schedule:a-a2-stage:a-g-o"]');
    expect(a2Cell).toHaveTextContent("P: —");
    expect(a2Cell).toHaveTextContent("A: —");
  });

  it("keeps a notApplicable Draft out of Dashboard until Publish advances Current Published", () => {
    render(<App />);
    const kickoffCell = () => dashboardRow("dev-project-001")
      .querySelector('[data-column-key="schedule:design:kickoff"]');
    const before = kickoffCell()?.textContent;
    expect(before).toContain("P: 2026/09/18");
    expect(kickoffCell()).not.toHaveTextContent("N/A");

    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Applicability for Kickoff"), {
      target: { value: "notApplicable" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    expect(kickoffCell()).toHaveTextContent(before!);
    expect(kickoffCell()).not.toHaveTextContent("N/A");

    openProjectByName("Manta");
    expect(screen.getByLabelText("Applicability for Kickoff")).toHaveValue("notApplicable");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" }))
      .getByRole("button", { name: "Publish" }));
    expect(screen.getByText("Published v02")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    expect(kickoffCell()?.querySelector('[data-milestone-id]')).toHaveTextContent(/^N\/A$/);
    expect(kickoffCell()).not.toHaveTextContent("2026/09/18");
  });

  it("preserves an overflow Draft and reports precise Publish failure", () => {
    const overflowSchedule: CanonicalProjectSchedule = {
      ...devSchedule001,
      publishedVersions: [{
        ...devSchedule001.publishedVersions[0]!,
        versionNumber: Number.MAX_SAFE_INTEGER as ScheduleVersionNumber,
      }],
      workingDraft: { milestones: [{ ...devSchedule001.publishedVersions[0]!.milestones[0]! }] },
    };
    render(<App initialState={{ projects: [devProject001], schedules: [overflowSchedule] }}
      initialSelectedProjectId={devProject001.id} />);
    expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" }))
      .getByRole("button", { name: "Publish" }));
    expect(screen.getByText("The next Published version is unavailable."))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("2026-09-18");
  });

  it("discards a no-Published Draft back to the legal empty Official state", () => {
    render(<App />);
    openProjectByName("Nautilus");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard Draft" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Discard Working Draft" }))
      .getByRole("button", { name: "Discard Draft" }));
    expect(within(screen.getByRole("region", { name: "Current Schedule" }))
      .getByText("-")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard Draft" })).not.toBeInTheDocument();
  });

  it("cleans an unresolved selected Project without rendering stale Draft data", async () => {
    const source = devSchedule001.publishedVersions[0]!.milestones[0]!;
    const staleSchedule = {
      ...devSchedule001,
      workingDraft: { milestones: [{ ...source }] },
    };
    render(<App initialSelectedProjectId={devProject001.id}
      initialState={{ projects: [], schedules: [staleSchedule] }} />);
    expect(screen.queryByRole("heading", { name: "Working Draft" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Schedule" }))
      .not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Project Information" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Project Header" }))
      .not.toBeInTheDocument();
  });
  it("integrates the canonical Portfolio shell, Current Published grouped table, search, and seven filters", () => {
    render(<App />);

    // Detects the obsolete inline Dashboard and invented attention calculations.
    expect(screen.getByRole("heading", { name: "Project Information", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Portfolio overview")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Project" })).toHaveTextContent("+ Create Project");
    expect(screen.getByRole("button", { name: "Export to Excel" })).toBeVisible();
    const attention = screen.getByRole("region", { name: "Needs Attention" });
    for (const [title, supporting] of [
      ["Blocking Issues", "Calculation not active"],
      ["Milestone Due", "Next 14 days · calculation not active"],
      ["Overdue", "Past due · calculation not active"],
    ]) {
      const card = within(attention).getByRole("group", { name: title });
      expect(within(card).getByText("—")).toBeVisible();
      expect(within(card).getByText(supporting)).toBeVisible();
      expect(within(card).queryByText(/^\d+$/)).not.toBeInTheDocument();
    }
    expect(screen.queryByText("No items requiring attention.")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Projects", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Showing 5 of 5 projects")).toBeInTheDocument();

    // Detects flat headers, wrong 11/35/7 structure, or a diagnostic status leaf.
    const headerRows = dashboardTable().querySelectorAll("thead tr");
    expect(headerRows).toHaveLength(3);
    expect(Array.from(headerRows[0]!.querySelectorAll("th"), (header) => [header.textContent, header.colSpan])).toEqual([
      ["PROJECT INFORMATION", 11], ["SCHEDULE", 31], ["TEAM MEMBER", 7],
    ]);
    expect(Array.from(headerRows[1]!.querySelectorAll("th"), (header) => header.textContent)).toEqual([
      "Core fields", "Design", "ME Portion", "Thermal", "A", "C1-stage", "C2-stage", "RAMP-stage", "MDRR", "Project Roles", "Standard Function Owners",
    ]);
    const leaves = Array.from(headerRows[2]!.querySelectorAll("th"));
    expect(leaves.slice(0, 11).map((header) => header.querySelector("span")?.textContent)).toEqual([
      "Status", "Year", "STN Project Name", "QCI Model Name", "Customer", "Category", "Product Line", "Panel Size", "CPU", "GPU", "PCB#",
    ]);
    expect(leaves.filter((header) => header.dataset.columnKey?.startsWith("schedule:"))).toHaveLength(31);
    expect(leaves.some((header) => header.dataset.columnKey?.startsWith("schedule:a-a2-stage:"))).toBe(false);
    expect(leaves.filter((header) => header.dataset.columnKey?.startsWith("team:")).map((header) => header.querySelector("span")?.textContent)).toEqual([
      "QCI PM", "QCI PjM", "Acer PM", "ME Owner", "EE Owner", "Thermal Owner", "BIOS Owner",
    ]);
    expect(leaves).toHaveLength(49);
    expect(within(dashboardTable()).queryByRole("columnheader", { name: /Current Published|Schedule Status|Diagnostic/ })).not.toBeInTheDocument();
    expect(dashboardRows()).toHaveLength(5);
    expect(dashboardRows().map((row) => row.dataset.projectId)).toEqual([
      "dev-project-001", "dev-project-002", "dev-project-003", "dev-project-004", "dev-project-005",
    ]);
    for (const name of ["Manta", "Nautilus", "Orca", "Beluga", "Marlin"]) {
      expect(within(dashboardTable()).getAllByText(name).length).toBeGreaterThan(0);
    }

    // Detects last-array v1 reads, collapsed empty states, and Team fixture leakage.
    const kickoffCell = dashboardRow("dev-project-001").querySelector('[data-column-key="schedule:design:kickoff"]')!;
    expect(kickoffCell).toHaveAttribute("title", "Published v01 · Kickoff");
    expect(kickoffCell).toHaveTextContent("P: 2026/09/18");
    for (const id of ["dev-project-002", "dev-project-003", "dev-project-004", "dev-project-005"]) {
      const cells = dashboardRow(id).querySelectorAll('[data-domain="schedule"]');
      expect(cells).toHaveLength(31);
      for (const cell of cells) { expect(cell).toHaveAttribute("title", "No published schedule"); expect(cell).toHaveTextContent(/^—$/); }
    }
    for (const row of dashboardRows()) {
      const cells = row.querySelectorAll('[data-domain="team"]');
      expect(cells).toHaveLength(7);
      for (const cell of cells) { expect(cell).toHaveTextContent(/^—$/); expect(cell).toHaveAttribute("title", "Migration pending"); }
    }
    expect(screen.queryByText("DEV Project 003 QCI PM")).not.toBeInTheDocument();

    // Detects missing canonical predicates or accidentally enabled unsupported fields.
    const filterPanel = screen.getByRole("region", { name: "Search / Filters" });
    const labels = ["Year", "Customer", "Status", "Category", "Product Line", "Panel Size", "CPU", "GPU", "QCI PM"];
    const controls = within(filterPanel).getAllByRole("combobox");
    expect(controls).toHaveLength(9);
    labels.forEach((label, index) => {
      expect(controls[index]).toHaveAccessibleName(label);
      if (label === "Category" || label === "QCI PM") {
        expect(controls[index]).toBeDisabled();
        expect(controls[index]).toHaveAccessibleDescription(/Not available in V2.2|Migration pending/);
        expect(within(controls[index]).getAllByRole("option")).toHaveLength(1);
      } else expect(controls[index]).toBeEnabled();
    });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "DEV-QCI-DRAFT-04" } });
    expect(dashboardRows()).toHaveLength(1);
    expect(within(dashboardTable()).getByText("Beluga")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    const productLineFilter = screen.getByLabelText("Product Line");
    expect(within(productLineFilter).getByRole("option", { name: "Aspire (Refresh ID)" })).toBeInTheDocument();
    expect(within(productLineFilter).queryByRole("option", { name: "Deep Sea" })).not.toBeInTheDocument();
    fireEvent.change(productLineFilter, { target: { value: "Aspire (Refresh ID)" } });

    expect(dashboardRows()).toHaveLength(2);
    expect(within(dashboardTable()).getByText("Manta")).toBeInTheDocument();
    expect(within(dashboardTable()).getByText("Marlin")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "MP" } });
    expect(dashboardRows().map((row) => row.dataset.projectId)).toEqual(["dev-project-005"]);
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("GPU"), { target: { value: "GN20-X6" } });
    expect(dashboardRows()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Customer"), { target: { value: "DEV Customer B" } });
    expect(dashboardRows()).toHaveLength(0);
    expect(screen.getByText("Showing 0 of 5 projects")).toBeInTheDocument();
    expect(screen.getByText("No projects match the current search and filters")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(dashboardRows()).toHaveLength(5);
    // Detects name-based selection of the other identically named Project.
    fireEvent.click(within(dashboardRow("dev-project-003")).getByRole("button", { name: "Open Project Orca" }));
    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-003");
    expect(screen.getByRole("heading", { name: "Project Master" })).toBeInTheDocument();
  }, 10_000);

  it("shows Manta's canonical Current Published Schedule by ProjectId and opens Team Member", () => {
    render(<App />);
    openProjectByName("Manta");

    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-001");
    expect(within(projectHeader()).getByText("Project Name: Manta")).toBeInTheDocument();
    const resources = screen.getByRole("region", { name: "Resources" });
    expect(within(resources).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Schedule", "Team Member", "Weekly Report", "AVL",
    ]);
    expect(within(resources).queryByText("Project Master")).not.toBeInTheDocument();
    expect(within(resources).getAllByText("Migration pending")).toHaveLength(2);
    expect(within(resources).getByText("Shown below")).toBeInTheDocument();
    expect(within(resources).queryByRole("button", { name: "Open Schedule" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Team Member" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Open Weekly Report" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open AVL" })).toBeDisabled();
    expect(screen.getAllByText("Migration pending")).toHaveLength(2);

    const scheduleView = screen.getByRole("region", { name: "Current Schedule" });
    expect(within(scheduleView).getByText("Published v01")).toBeInTheDocument();
    expect(within(scheduleView).getByText("Kickoff")).toBeInTheDocument();
    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-001");

    fireEvent.click(screen.getByRole("button", { name: "Open Team Member" }));
    expect(screen.getByRole("heading", { name: "Team Member" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Current Schedule" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "← Dashboard" }));
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    openProjectByName("Nautilus");

    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-002");
    const nextScheduleView = screen.getByRole("region", { name: "Current Schedule" });
    expect(within(nextScheduleView).getByText("-")).toBeInTheDocument();
    expect(within(nextScheduleView).queryByText("No published schedule")).not.toBeInTheDocument();
    expect(within(nextScheduleView).queryByText(/^Published v/)).not.toBeInTheDocument();
  });

  it("saves only the selected Project Team through one projectReplaced transition", () => {
    render(<App initialSelectedProjectId={devProject002.id} />);
    const initialSchedule = devSchedule001;

    fireEvent.click(screen.getByRole("button", { name: "Open Team Member" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Team" }));
    fireEvent.change(screen.getByDisplayValue("DEV ME Owner"), {
      target: { value: "Saved ME Owner" },
    });
    vi.mocked(prototypeReducer).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));

    const replacements = vi.mocked(prototypeReducer).mock.calls.filter(
      ([, action]) => action.type === "projectReplaced",
    );
    expect(replacements).toHaveLength(1);
    expect(replacements[0]?.[1]).toMatchObject({
      type: "projectReplaced",
      project: { id: devProject002.id },
    });
    const reduced = lastReducedState();
    const saved = reduced.projects.find(({ id }) => id === devProject002.id)!;
    expect(saved.team?.functions.flatMap(({ assignments }) => assignments)
      .find(({ assignmentId }) => assignmentId === "dev-saved-team-me-owner")?.name)
      .toBe("Saved ME Owner");
    expect(saved.master).toEqual(devProject002.master);
    expect(saved.identityAliases).toEqual(devProject002.identityAliases);
    expect(reduced.projects.filter(({ id }) => id !== devProject002.id))
      .toEqual(canonicalProjectFixtures.filter(({ id }) => id !== devProject002.id));
    expect(reduced.schedules).toEqual(canonicalScheduleFixtures);
    expect(reduced.schedules.find(({ projectId }) => projectId === initialSchedule.projectId))
      .toEqual(initialSchedule);
  });

  it("shows the valid no-Published Schedule state", () => {
    render(<App />);
    openProjectByName("Nautilus");

    const resources = screen.getByRole("region", { name: "Resources" });
    const scheduleView = screen.getByRole("region", { name: "Current Schedule" });
    expect(projectHeader().compareDocumentPosition(resources) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(resources.nextElementSibling).toBe(scheduleView);
    expect(screen.getAllByRole("region", { name: "Current Schedule" })).toHaveLength(1);
    expect(within(scheduleView).getByText("-")).toBeInTheDocument();
    expect(within(scheduleView).queryByText("No published schedule")).not.toBeInTheDocument();
    expect(within(scheduleView).queryByText(/^Published v/)).not.toBeInTheDocument();
  });

  it("renders the maximum Published version as Current Schedule", () => {
    expect(Object.hasOwn(zeroMilestoneSchedule, "workingDraft")).toBe(true);
    expect(Reflect.get(zeroMilestoneSchedule, "workingDraft")).toBeNull();
    render(<LocalScheduleWorkspaceHarness schedule={currentScheduleWithOutOfOrderHistory} />);

    const currentSchedule = screen.getByRole("region", { name: "Current Schedule" });
    expect(within(currentSchedule).getByText("Published v04")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Working Draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publish|Discard Draft|Resume Draft/ })).not.toBeInTheDocument();
  });

  it("shows a Published version with zero milestones distinctly", () => {
    render(<LocalScheduleWorkspaceHarness schedule={zeroMilestoneSchedule} />);

    const scheduleView = screen.getByRole("region", { name: "Current Schedule" });
    expect(within(scheduleView).getByText("Published v01")).toBeInTheDocument();
    expect(within(scheduleView).getByText("No milestones")).toBeInTheDocument();
    expect(within(scheduleView).queryByText("No published schedule")).not.toBeInTheDocument();
  });

  it("isolates malformed Schedule data from the canonical Project Master", () => {
    render(<LocalScheduleWorkspaceHarness schedule={malformedSchedule} />);

    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-003");
    expect(within(projectHeader()).getByText("Project Name: Orca")).toBeInTheDocument();
    expect(screen.getByText("Schedule data unavailable")).toBeInTheDocument();

    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-003");
    expect(within(projectHeader()).getByText("Project Name: Orca")).toBeInTheDocument();
    expect(within(projectHeader()).getByRole("button", { name: "Edit Project" })).toBeEnabled();
  });

  it("shows canonical-safe attention and exports all canonical rows despite active filters", () => {
    render(<App />);
    expect(screen.queryByText("No items requiring attention.")).not.toBeInTheDocument();
    for (const legacyName of [
      "Valour_ARX", "Macan S_ARX", "Mufasa_FRX", "Sportswagon_PNH", "GLS_Ni", "Sorento_PTZ",
    ]) {
      expect(screen.queryByText(legacyName)).not.toBeInTheDocument();
    }

    fireEvent.change(screen.getByLabelText("Product Line"), { target: { value: "Aspire (Refresh ID)" } });
    expect(dashboardRows()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));

    const exportedRows = vi.mocked(XLSX.utils.json_to_sheet).mock.calls[0]![0] as Array<Record<string, string>>;
    expect(exportedRows).toHaveLength(5);
    expect(exportedRows.map((row) => row["Project Name"])).toEqual([
      "Manta", "Nautilus", "Orca", "Beluga", "Marlin",
    ]);
    expect(vi.mocked(XLSX.writeFile)).toHaveBeenCalledWith(
      expect.anything(),
      "Project_Portfolio_Summary.xlsx",
    );
    expect(exportedRows.every((row) => row["Current Stage"] === "-" && row.MDRR === "-")).toBe(true);
    // Detects widening the export to Schedule/Team or dropping reviewed Master fields.
    for (const row of exportedRows) expect(Object.keys(row)).toEqual([
      "Year", "Customer", "Product Line", "Project Name", "QCI Model Name", "Acer Model Name", "Acer Marketing Name", "Panel Size", "CPU", "GPU", "SSID", "RMN", "Project Status", "Current Stage", "MDRR",
    ]);
  });

  it("rejects missing Create fields without adding a Project", () => {
    render(<App />);
    const dialog = openCreateDialog();
    for (const label of [
      "STN Project Name", "QCI Model Name", "Acer Model Name", "Acer Marketing Name", "Year",
      "Customer", "Product Line", "Panel Size", "CPU", "GPU", "SSID", "RMN", "Project Status",
    ]) {
      expect(within(dialog).getByLabelText(label)).toBeInTheDocument();
    }
    expect(within(dialog).queryByLabelText("Project Name")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(within(dialog).getByText("Year is required.")).toBeInTheDocument();
    expect(within(dialog).getByText("Product Line is required.")).toBeInTheDocument();
    expect(within(dialog).getByText("STN Project Name is required.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Create Project" })).toBeInTheDocument();
    expect(dashboardRows()).toHaveLength(5);
  });

  it("creates an ordinary canonical Project with one UUID and opens Project Master", () => {
    const randomUuid = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(fixedUuid);
    render(<App />);
    const dialog = openCreateDialog();
    fillCreateIdentity(dialog, {
      year: "2030", productLineId: "dev-product-line-beta", stnProjectName: "Runtime Created Project",
      qciModelName: "RUNTIME-CREATED-QCI",
    });
    expect(within(dialog).getByLabelText("Customer")).toHaveValue("");
    expect(within(dialog).getByLabelText("Project Status")).toHaveValue("");
    fireEvent.change(within(dialog).getByLabelText("Acer Model Name"), { target: { value: "Runtime Acer" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(projectHeader()).toHaveAttribute("data-project-id", fixedUuid);
    expect(within(projectHeader()).getByText("Project Name: Runtime Created Project")).toBeInTheDocument();
    expect(within(projectHeader()).getByText("Customer: Acer")).toBeInTheDocument();
    expect(within(projectHeader()).getByText("RFQ")).toBeInTheDocument();
    expect(randomUuid).toHaveBeenCalledTimes(1);
    expect(within(screen.getByRole("region", { name: "Current Schedule" })).getByText("-")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
    expect(screen.getByText("No milestones")).toBeInTheDocument();
    expect(projectHeader()).toHaveAttribute("data-project-id", fixedUuid);
    fireEvent.click(screen.getByRole("button", { name: "← Dashboard" }));
    expect(dashboardRows()).toHaveLength(6);
    expect(within(dashboardTable()).getByText("Runtime Created Project")).toBeInTheDocument();
  });

  it("opens the sole duplicate match directly after Review Existing", () => {
    render(<App />);
    const dialog = openCreateDialog();
    fillCreateIdentity(dialog, {
      year: "2027", productLineId: "demo-product-line-aspire-refresh-id", stnProjectName: "Manta",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const reviewDialog = screen.getByRole("dialog", { name: "Create Project" });
    fireEvent.click(within(reviewDialog).getByRole("button", { name: "Review Existing" }));

    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-001");
    expect(screen.queryByRole("dialog", { name: "Create Project" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: "Current Schedule" })).toHaveLength(1);
    expect(within(screen.getByRole("region", { name: "Current Schedule" }))
      .getByText("Published v01")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Schedule" })).not.toBeInTheDocument();
  });

  it("lists all duplicate matches and opens only the explicitly chosen ProjectId", () => {
    const firstId = "22222222-2222-4222-8222-222222222222";
    const secondId = "33333333-3333-4333-8333-333333333333";
    const thirdCandidateId = "44444444-4444-4444-8444-444444444444";
    vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce(firstId)
      .mockReturnValueOnce(secondId)
      .mockReturnValueOnce(thirdCandidateId);
    render(<App />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Local Multiple Match" },
    });
    let dialog = openCreateDialog();
    fillCreateIdentity(dialog, {
      year: "2032", productLineId: "dev-product-line-alpha", stnProjectName: "Local Multiple Match",
      qciModelName: "MULTI-QCI-01",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(projectHeader()).toHaveAttribute("data-project-id", firstId);
    fireEvent.click(screen.getByRole("button", { name: "← Dashboard" }));

    dialog = openCreateDialog();
    fillCreateIdentity(dialog, {
      year: "2032", productLineId: "dev-product-line-alpha", stnProjectName: "Local Multiple Match",
      qciModelName: "MULTI-QCI-02",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    let reviewDialog = screen.getByRole("dialog", { name: "Create Project" });
    fireEvent.click(within(reviewDialog).getByRole("button", { name: "Create Anyway" }));
    expect(projectHeader()).toHaveAttribute("data-project-id", secondId);
    fireEvent.click(screen.getByRole("button", { name: "← Dashboard" }));

    dialog = openCreateDialog();
    fillCreateIdentity(dialog, {
      year: "2032", productLineId: "dev-product-line-alpha", stnProjectName: "Local Multiple Match",
      qciModelName: "MULTI-QCI-03",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    reviewDialog = screen.getByRole("dialog", { name: "Create Project" });
    fireEvent.click(within(reviewDialog).getByRole("button", { name: "Review Existing" }));

    expect(screen.queryByRole("region", { name: "Project Header" })).not.toBeInTheDocument();
    expect(within(reviewDialog).getByRole("button", { name: /MULTI-QCI-01/ })).toBeInTheDocument();
    fireEvent.click(within(reviewDialog).getByRole("button", { name: /MULTI-QCI-02/ }));
    expect(projectHeader()).toHaveAttribute("data-project-id", secondId);
    expect(screen.getAllByRole("region", { name: "Current Schedule" })).toHaveLength(1);
    const currentSchedule = screen.getByRole("region", { name: "Current Schedule" });
    expect(within(currentSchedule).getByText("-")).toBeInTheDocument();
    expect(within(currentSchedule).queryByText(/^Published v/)).not.toBeInTheDocument();
  }, 10_000);

  it("creates a duplicate anyway with the UUID allocated for the original attempt", () => {
    const randomUuid = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(fixedUuid);
    render(<App />);
    const dialog = openCreateDialog();
    fillCreateIdentity(dialog, {
      year: "2027", productLineId: "demo-product-line-game-pad", stnProjectName: "Nautilus",
      qciModelName: "NEW-DUPLICATE-QCI",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const reviewDialog = screen.getByRole("dialog", { name: "Create Project" });
    expect(dashboardRows()).toHaveLength(5);
    expect(screen.queryByRole("region", { name: "Project Header" })).not.toBeInTheDocument();
    fireEvent.click(within(reviewDialog).getByRole("button", { name: "Create Anyway" }));

    expect(projectHeader()).toHaveAttribute("data-project-id", fixedUuid);
    expect(within(projectHeader()).getByText("QCI Model Name: NEW-DUPLICATE-QCI")).toBeInTheDocument();
    expect(randomUuid).toHaveBeenCalledTimes(1);
    expect(within(screen.getByRole("region", { name: "Current Schedule" })).getByText("-")).toBeInTheDocument();
    expect(screen.queryByText("Schedule data unavailable")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
    expect(projectHeader()).toHaveAttribute("data-project-id", fixedUuid);
  });

  it("edits through the Master command, preserves hidden fields, and retains ProjectId", () => {
    render(<App />);
    openProjectByQci("DEV-QCI-ALPHA-02");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Milestone definition"), {
      target: { value: "milestone-design-kickoff" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Milestone" }));
    applyDateInput(screen.getByLabelText(/^Plan for Kickoff occurrence/), "2035-07-08");
    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-003");
    fireEvent.click(within(projectHeader()).getByRole("button", { name: "Edit Project" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Project" });

    const textChanges: Record<string, string> = {
      "STN Project Name": "Orca Revised", "QCI Model Name": "DEV-QCI-ALPHA-REVISED",
      "Acer Model Name": "Revised Acer Model", "Acer Marketing Name": "Revised Marketing",
      Year: "2031", SSID: "REVISED-SSID", RMN: "REVISED-RMN",
    };
    for (const [label, value] of Object.entries(textChanges)) {
      fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
    }
    for (const [label, value] of [
      ["Customer", "dev-customer-acer"], ["Product Line", "dev-product-line-beta"],
      ["Panel Size", "dev-panel-size-18"], ["CPU", "dev-cpu-beta"], ["GPU", "dev-gpu-beta"],
      ["Project Status", "status-mp"],
    ]) {
      fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
    }
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    const commandCall = vi.mocked(updateProjectMaster).mock.calls.at(-1);
    expect(commandCall).toBeDefined();
    const candidate = commandCall![1].master;
    expect(candidate.basicInformation.category).toBe(devProject003.master.basicInformation.category);
    expect(candidate.platformHardware.pcbNumber).toBe(devProject003.master.platformHardware.pcbNumber);
    expect(candidate.platformHardware.housingNumber).toBe(devProject003.master.platformHardware.housingNumber);
    expect(candidate.leverage).toEqual(devProject003.master.leverage);
    expect(candidate.cover).toEqual(devProject003.master.cover);
    expect(candidate.mechanical).toEqual(devProject003.master.mechanical);
    expect(candidate.other).toEqual(devProject003.master.other);
    const commandResult = vi.mocked(updateProjectMaster).mock.results.at(-1)?.value as UpdateProjectMasterResult;
    expect(commandResult.project.identityAliases).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "stnProjectName", originalValue: "Orca" }),
      expect.objectContaining({ kind: "qciModelName", originalValue: "DEV-QCI-ALPHA-02" }),
    ]));
    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-003");
    expect(within(projectHeader()).getByText("Project Name: Orca Revised")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Plan for Kickoff occurrence/)).toHaveValue("2035-07-08");
    expect(screen.getByRole("row", { name: /Kickoff/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-003");
    fireEvent.click(screen.getByRole("button", { name: "← Dashboard" }));
    expect(within(dashboardTable()).getByText("Orca Revised")).toBeInTheDocument();
  });

  it("keeps a blocked Edit open without replacement and completes an Advisory-only Edit", () => {
    vi.mocked(updateProjectMaster)
      .mockImplementationOnce((project: Project, input: UpdateProjectMasterInput) => ({
        project: { ...project, master: input.master },
        issues: [{
          code: "projectMaster.completeness.blocked", domain: "projectMaster", source: "data",
          severity: "blocking", message: "Blocked for correction.",
          target: { section: "projectMaster.basicInformation", entityId: project.id },
        }],
      }))
      .mockImplementationOnce((project: Project, input: UpdateProjectMasterInput) => ({
        project: { ...project, master: input.master },
        issues: [{
          code: "projectMaster.data.advisory", domain: "projectMaster", source: "data",
          severity: "advisory", message: "Advisory saved.",
          target: { section: "projectMaster.basicInformation", entityId: project.id },
        }],
      }));
    render(<App />);
    openProjectByQci("DEV-QCI-ALPHA-02");
    fireEvent.click(within(projectHeader()).getByRole("button", { name: "Edit Project" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Project" });
    fireEvent.change(within(dialog).getByLabelText("STN Project Name"), { target: { value: "Blocked Candidate" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    expect(screen.getByRole("dialog", { name: "Edit Project" })).toBeInTheDocument();
    expect(within(dialog).getByText("Blocked for correction.")).toBeInTheDocument();
    expect(within(projectHeader()).getByText("Project Name: Orca")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("STN Project Name"), { target: { value: "Advisory Candidate" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));
    expect(screen.queryByRole("dialog", { name: "Edit Project" })).not.toBeInTheDocument();
    expect(within(projectHeader()).getByText("Project Name: Advisory Candidate")).toBeInTheDocument();
    expect(screen.getByText("Advisory saved.")).toBeInTheDocument();
  });

  it("cancels Edit and discards only transient form changes", () => {
    render(<App />);
    openProjectByQci("DEV-QCI-ALPHA-02");
    fireEvent.click(within(projectHeader()).getByRole("button", { name: "Edit Project" }));
    let dialog = screen.getByRole("dialog", { name: "Edit Project" });
    fireEvent.change(within(dialog).getByLabelText("STN Project Name"), { target: { value: "Discard Me" } });
    fireEvent.change(within(dialog).getByLabelText("QCI Model Name"), { target: { value: "DISCARD-QCI" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(within(projectHeader()).getByText("Project Name: Orca")).toBeInTheDocument();
    fireEvent.click(within(projectHeader()).getByRole("button", { name: "Edit Project" }));
    dialog = screen.getByRole("dialog", { name: "Edit Project" });
    expect(within(dialog).getByLabelText("STN Project Name")).toHaveValue("Orca");
    expect(within(dialog).getByLabelText("QCI Model Name")).toHaveValue("DEV-QCI-ALPHA-02");
  });
});
