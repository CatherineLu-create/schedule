import { initialGovernanceContext } from "../../test/governanceTestUtils";
import { initialScheduleCommandContext } from "../../test/governanceTestUtils";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { selectPortfolioDashboardRows } from "../../application/selectors/portfolioDashboardRows";
import { createInitialSelfServiceReferenceCatalogs } from "../../application/reference-data/selfServiceCatalogs";
import { selectTeamMemberRows } from "../../application/selectors/teamMemberRows";
import {
  selectDashboardAttention,
} from "../../application/selectors/dashboardAttention";
import {
  resolveCanonicalScheduleOwner,
  selectCurrentPublishedSchedule,
  selectScheduleWorkingDraft,
} from "../../application/selectors/scheduleSelectors";
import { prototypeReducer } from "../../application/state/prototypeReducer";
import type { PrototypeState } from "../../application/state/prototypeState";
import { inspectTeamImport } from "../../application/teamImport/teamImport";
import { milestoneDefinitions } from "../../config/v2/referenceData";
import type { Project } from "../../domain/project/project";
import { createEmptyCanonicalProjectSchedule, type CanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import type { ScheduleVersionNumber } from "../../domain/schedule/schedule";
import { parseDateOnly, type DateOnly } from "../../domain/shared/dateOnly";
import {
  toCanonicalScheduleWorkingDraftId,
  toCatalogItemId,
  toMilestoneDefinitionId,
  toMilestoneId,
  toProjectId,
} from "../../domain/shared/ids";
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
import { userTrialDemoProjectIds } from "../../fixtures/userTrialDemoSeed";
import type { ScheduleWorkspaceProps } from "../../scheduleWorkspace";
import {
  App,
  createUserTrialPrototypeState,
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

vi.mock("xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xlsx")>();
  return {
    ...actual,
    writeFile: vi.fn(),
  };
});

const fixedUuid = "11111111-1111-4111-8111-111111111111";

function exportedDashboardGrid(): string[][] {
  const workbook = vi.mocked(XLSX.writeFile).mock.calls.at(-1)![0];
  expect(workbook.SheetNames).toEqual(["All Projects"]);
  return XLSX.utils.sheet_to_json<string[]>(workbook.Sheets["All Projects"]!, { header: 1, defval: "" });
}

function exportedDashboardRows(): Record<string, string>[] {
  const [headers, ...rows] = exportedDashboardGrid();
  return rows.map(row => Object.fromEntries(headers!.map((header, index) => [header, row[index]!] )));
}

function dateOnly(value: string): DateOnly {
  const parsed = parseDateOnly(value);
  if (parsed === null) throw new Error(`Invalid test DateOnly: ${value}`);
  return parsed;
}

const dashboardReferenceDate = dateOnly("2026-09-23");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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

function addSelfServiceOption(
  container: HTMLElement,
  field: "Product Line" | "Panel Size" | "CPU" | "GPU",
  displayName: string,
): void {
  fireEvent.click(within(container).getByRole("button", { name: `Add new ${field}` }));
  fireEvent.change(within(container).getByRole("textbox", { name: `New ${field}` }), {
    target: { value: displayName },
  });
  fireEvent.click(within(container).getByRole("button", { name: `Add ${field} option` }));
}

function projectHeader(): HTMLElement {
  return screen.getByRole("region", { name: "Project Header" });
}

function openProjectMasterDetail(): HTMLElement {
  fireEvent.click(within(projectHeader()).getByRole("button", { name: "View Project Master" }));
  return screen.getByRole("region", { name: "Project Master Detail" });
}

function openEditMaster(): HTMLElement {
  const detail = screen.queryByRole("region", { name: "Project Master Detail" })
    ?? openProjectMasterDetail();
  fireEvent.click(within(detail).getByRole("button", { name: "Edit Master" }));
  return screen.getByRole("region", { name: "Project Master Detail" });
}

function openTeamMemberFromWorkspace(): void {
  const resources = screen.getByRole("region", { name: "Resources" });
  fireEvent.click(within(resources).getByRole("button", { name: "Open Team Member" }));
}

function expandedProjectMasterState(): {
  readonly state: PrototypeState;
  readonly target: Project;
  readonly sourceA: Project;
  readonly sourceB: Project;
} {
  const targetId = toProjectId("expanded-target");
  const sourceA: Project = {
    ...devProject001,
    id: toProjectId("expanded-source-a"),
    master: {
      ...devProject001.master,
      basicInformation: {
        ...devProject001.master.basicInformation,
        year: 2028,
        stnProjectName: "Shared Source",
        qciModelName: "SOURCE-QCI-A",
      },
    },
  };
  const sourceB: Project = {
    ...devProject002,
    id: toProjectId("expanded-source-b"),
    master: {
      ...devProject002.master,
      basicInformation: {
        ...devProject002.master.basicInformation,
        year: 2029,
        stnProjectName: "Shared Source",
        qciModelName: "SOURCE-QCI-B",
      },
    },
  };
  const target: Project = {
    ...devProject003,
    id: targetId,
    master: {
      ...devProject003.master,
      mechanical: {
        product: {
          productLengthMm: 320.5,
          productWidthMm: 220,
          productHeightMm: 17.25,
          productWeightG: 0,
        },
        package: {
          packageLengthMm: 480.5,
          packageWidthMm: 310,
          packageHeightMm: 65.75,
          grossWeightG: 2500.5,
        },
      },
      cover: {
        aCover: toCatalogItemId("cover-plastic-paint"),
        bCover: toCatalogItemId("cover-plastic-texture"),
        cCover: toCatalogItemId("cover-al-plate"),
        dCover: toCatalogItemId("unresolved-cover"),
      },
      leverage: {
        pcbLeverage: targetId,
        aLeverage: sourceA.id,
        bLeverage: null,
        cLeverage: toProjectId("unavailable-source"),
        dLeverage: sourceB.id,
      },
    },
  };

  return {
    state: { projects: [target, sourceA, sourceB], schedules: [] },
    target,
    sourceA,
    sourceB,
  };
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
      onBack={() => undefined}
      onViewProjectMaster={() => undefined}
      project={devProject003}
      row={row}
      scheduleWorkspaceProps={{
        draftRead: selectScheduleWorkingDraft(localState, devProject003.id, initialGovernanceContext()),
        governance: initialGovernanceContext(),
        feedback: [],
        milestoneDefinitions,
        nextVersionLabel: null,
        officialRead: selectCurrentPublishedSchedule(localState, devProject003.id, initialGovernanceContext()),
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
  ...createEmptyCanonicalProjectSchedule(devProject003.id),
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
  ...createEmptyCanonicalProjectSchedule(devProject003.id),
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
        workingDraftId: toCanonicalScheduleWorkingDraftId("malformed-runtime-draft"),
        reviewSessionIds: [],
        importCandidates: [],
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
    const result = startScheduleWorkingDraft(owner.schedule, { workingDraftId: toCanonicalScheduleWorkingDraftId("runtime-start-draft") }, initialScheduleCommandContext());
    if (!result.ok || result.status === "existing") return;
    dispatch({ type: "scheduleReplaced", projectId: devProject001.id,
      schedule: result.schedule });
  };
  const scheduleWorkspaceProps: ScheduleWorkspaceProps = {
    governance: initialGovernanceContext(),
    draftRead: selectScheduleWorkingDraft(state, devProject001.id, initialGovernanceContext()),
    feedback: [],
    milestoneDefinitions,
    nextVersionLabel: null,
    officialRead: selectCurrentPublishedSchedule(state, devProject001.id, initialGovernanceContext()),
    onAddMilestone: () => undefined,
    onCancelDraft,
    onPublishDraft: () => undefined,
    onRemoveMilestone: () => undefined,
    onStartDraft: owner.kind === "available" ? onStartDraft : null,
    onUpdateMilestone: () => undefined,
    projectId: devProject001.id,
  };

  return <ProjectWorkspace
    onBack={() => undefined}
    onViewProjectMaster={() => undefined}
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

function addMilestone(milestoneDefinitionId: string): void {
  fireEvent.change(screen.getByLabelText("Milestone definition"), {
    target: { value: milestoneDefinitionId },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add Milestone" }));
}

describe("canonical Portfolio, Project/Master and Schedule runtime", () => {
  it("GOV10 review changes stay out of Dashboard, Portfolio and Attention until canonical Publish", () => {
    let sequence = 0;
    vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => `22222222-2222-4222-8222-${String(++sequence).padStart(12, "0")}`);
    const initial: PrototypeState = { projects: [devProject001], schedules: [createEmptyCanonicalProjectSchedule(devProject001.id)] };
    const catalogs = createInitialSelfServiceReferenceCatalogs();
    const governance = initialGovernanceContext();
    const official = (state: PrototypeState) => ({
      dashboard: selectDashboardProjectRow(state, devProject001.id, catalogs),
      portfolio: selectPortfolioDashboardRows(state, catalogs, governance),
      attention: selectDashboardAttention(state, dashboardReferenceDate, governance),
      schedule: selectCurrentPublishedSchedule(state, devProject001.id, governance),
    });
    const before = official(initial);
    render(<App initialState={initial} initialSelectedProjectId={devProject001.id} referenceDate={dashboardReferenceDate} />);
    fireEvent.click(screen.getByRole("button", { name: "Governance" }));
    fireEvent.click(screen.getByText("進階治理與試用工具"));
    fireEvent.change(screen.getByLabelText("模擬情境"), { target: { value: "fixable-validation" } });
    fireEvent.click(screen.getByRole("button", { name: "載入模擬匯入資料" }));
    fireEvent.click(screen.getByRole("button", { name: "建立草稿並載入" }));
    const cards = within(screen.getByRole("region", { name: "匯入審核" })).getAllByRole("article");
    fireEvent.click(within(cards[0]).getByRole("button", { name: "確認" }));
    fireEvent.click(within(cards[1]).getByRole("button", { name: "確認" }));
    fireEvent.change(within(cards[2]).getByLabelText("計畫處理方式"), { target: { value: "set" } });
    fireEvent.change(within(cards[2]).getByLabelText("計畫日期"), { target: { value: "2026-11-10" } });
    fireEvent.click(within(cards[2]).getByRole("button", { name: "確認" }));
    const confirmed = lastReducedState();
    expect(official(confirmed)).toEqual(before);
    expect(confirmed.schedules[0].reviewDecisions).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "發布此專案草稿" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "發布此專案 Working Draft" })).getByRole("button", { name: "確認發布" }));
    const published = lastReducedState();
    expect(published.schedules[0].workingDraft).toBeNull();
    expect(published.schedules[0].reviewClosures).toEqual([{ sessionId: confirmed.schedules[0].reviewSessions[0].id, kind: "published", versionNumber: 1 }]);
    expect(official(published).schedule).toMatchObject({ kind: "published", versionLabel: "Published v01" });
    expect(official(published).portfolio).not.toEqual(before.portfolio);
    fireEvent.click(screen.getByRole("button", { name: "回到 Dashboard" }));
    fireEvent.click(screen.getByRole("button", { name: /^Open Project/ }));
    expect(screen.getByRole("region", { name: "Current Schedule" })).toHaveTextContent("2026/10/15");
  });
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

  it("clones only Published rows and offers absent active definitions for manual Add", () => {
    render(<App />);
    openProjectByName("Manta");

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const schedule = screen.getByRole("region", { name: "Schedule" });
    expect(within(schedule).getAllByRole("row")).toHaveLength(5);
    expect(within(schedule).queryByRole("row", { name: /A1 Close/ })).not.toBeInTheDocument();
    expect(within(schedule).getByText("Kickoff")).toBeInTheDocument();

    const addChoices = within(schedule).getByLabelText("Milestone definition");
    for (const activeLabel of [
      "Mockup & DFM", "Tooling start + T1", "ME material for C", "Thermal module for C",
      "A1 Close", "C1 System Build", "C2 System Build", "RAMP G/O", "MDRR",
    ]) {
      expect(within(addChoices).getByRole("option", { name: activeLabel })).toBeInTheDocument();
    }
    for (const compatibilityLabel of ["Kickoff", "ID fix", "ME drawing", "A-Close", "Golden Run"]) {
      expect(within(addChoices).queryByRole("option", { name: compatibilityLabel }))
        .not.toBeInTheDocument();
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
    render(<App />);
    openProjectByName("Nautilus");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const randomUuid = vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222")
      .mockReturnValueOnce("33333333-3333-4333-8333-333333333333");
    fireEvent.change(screen.getByLabelText("Milestone definition"), {
      target: { value: "milestone-a1-a-close" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Milestone" }));
    expect(randomUuid).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("row", { name: /A1 Close/ })).toBeInTheDocument();
    expect(within(screen.getByLabelText("Milestone definition"))
      .queryByRole("option", { name: "A1 Close" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove A1 Close" }));
    expect(screen.queryByRole("row", { name: /A1 Close/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Milestone definition"), {
      target: { value: "milestone-a1-a-close" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Milestone" }));
    expect(randomUuid).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("row", { name: /A1 Close/ })).toBeInTheDocument();
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
    expect(within(screen.getByRole("row", { name: /Kickoff/ }))
      .getByText("Applicable")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Working Draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
  });

  it("keeps a no-Published Draft empty until a milestone is manually added", () => {
    render(<App />);
    openProjectByName("Nautilus");
    expect(within(screen.getByRole("region", { name: "Current Schedule" }))
      .getByText("-")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const schedule = screen.getByRole("region", { name: "Schedule" });
    expect(within(schedule).getAllByRole("row")).toHaveLength(1);
    expect(within(schedule).queryByRole("row", { name: /A1 Close/ })).not.toBeInTheDocument();
    expect(within(schedule).getByRole("option", { name: "A1 Close" })).toBeInTheDocument();
    addMilestone("milestone-a1-a-close");
    expect(within(schedule).getByRole("row", { name: /A1 Close/ })).toBeInTheDocument();
    const beforePublish = lastReducedState();
    const beforeSnapshot = structuredClone(beforePublish);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" }))
      .getByRole("button", { name: "Publish" }));
    expect(screen.getByText("An applicable occurrence requires a Plan date.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
    expect(screen.queryByText("Published v01")).not.toBeInTheDocument();
    expect(lastReducedState()).toBe(beforePublish);
    expect(lastReducedState()).toEqual(beforeSnapshot);
    expect(lastReducedState().schedules.find(entry => entry.projectId === devProject002.id)?.publishedVersions).toEqual([]);
    applyDateInput(screen.getByLabelText(/^Plan for A1 Close occurrence/), "2031-01-15");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" }))
      .getByRole("button", { name: "Publish" }));
    expect(screen.getByText("Published v01")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /A1 Close/ })).toBeInTheDocument();
    expect(screen.getByText("2031/01/15")).toBeInTheDocument();
    expect(beforePublish).toEqual(beforeSnapshot);
  });

  it("isolates and resumes Drafts by exact ProjectId", () => {
    render(<App />);
    openProjectByName("Nautilus");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    addMilestone("milestone-a1-a-close");
    applyDateInput(screen.getByLabelText(/^Plan for A1 Close occurrence/), "2031-01-15");
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
    render(<App referenceDate={dashboardReferenceDate} />);
    const dueCard = () => within(screen.getByRole("region", { name: "Needs Attention" }))
      .getByRole("group", { name: "Upcoming Milestones" });
    expect(within(dueCard()).getByText("0")).toBeVisible();
    const initialCell = dashboardRow("dev-project-001")
      .querySelector('[data-column-key="schedule:a1-stage:a-g-o"]');
    expect(initialCell).toHaveTextContent("P: 2026/10/15");
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    applyDateInput(screen.getByLabelText(/^Plan for A1 G\/O occurrence/), "2026-09-28");
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    expect(dashboardRow("dev-project-001")
      .querySelector('[data-column-key="schedule:a1-stage:a-g-o"]'))
      .toHaveTextContent("P: 2026/10/15");
    expect(dashboardRow("dev-project-001")).not.toHaveTextContent("2026/09/28");
    expect(within(dueCard()).getByText("0")).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: "A2" })).not.toBeInTheDocument();
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" }))
      .getByRole("button", { name: "Publish" }));
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    expect(dashboardRow("dev-project-001")
      .querySelector('[data-column-key="schedule:a1-stage:a-g-o"]'))
      .toHaveTextContent("P: 2026/09/28");
    expect(within(dueCard()).getByText("1")).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: "A2" })).not.toBeInTheDocument();
  });

  it("keeps the runtime reference date fixed for the browser session", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 30, 12));
    render(<App />);
    const dueCard = () => within(screen.getByRole("region", { name: "Needs Attention" }))
      .getByRole("group", { name: "Upcoming Milestones" });

    expect(within(dueCard()).getByText("0")).toBeVisible();

    vi.setSystemTime(new Date(2026, 9, 1, 12));
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));

    expect(within(dueCard()).getByText("0")).toBeVisible();
  });

  it("keeps A1 G/O's Published null Actual until its applicable Draft date is published", () => {
    render(<App />);
    const a1GoCell = () => dashboardRow("dev-project-001")
      .querySelector('[data-column-key="schedule:a1-stage:a-g-o"]');
    expect(a1GoCell()).toHaveTextContent("Applicable");
    expect(a1GoCell()).toHaveTextContent("A: —");

    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText(/^Actual for A1 G\/O occurrence/)).toHaveValue("");
    applyDateInput(screen.getByLabelText(/^Actual for A1 G\/O occurrence/), "2026-12-15");
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    expect(a1GoCell()).toHaveTextContent("A: —");
    expect(a1GoCell()).not.toHaveTextContent("2026/12/15");

    openProjectByName("Manta");
    expect(screen.getByLabelText(/^Actual for A1 G\/O occurrence/)).toHaveValue("2026-12-15");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" }))
      .getByRole("button", { name: "Publish" }));
    expect(screen.getByText("Published v02")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    expect(a1GoCell()).toHaveTextContent("Applicable");
    expect(a1GoCell()).toHaveTextContent("A: 2026/12/15");
  });

  it("keeps Draft-only applicable A1 Close out of Dashboard until Publish", () => {
    render(<App />);
    const a1CloseCell = () => dashboardRow("dev-project-001")
      .querySelector('[data-column-key="schedule:a1-stage:a-close"]');
    expect(a1CloseCell()).toHaveTextContent(/^—$/);
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    addMilestone("milestone-a1-a-close");
    fireEvent.change(screen.getByLabelText("Applicability for A1 Close"), {
      target: { value: "applicable" },
    });
    const draft = lastReducedState().schedules.find((entry) => entry.projectId === devProject001.id)?.workingDraft;
    expect(draft?.milestones.find((entry) => entry.milestoneDefinitionId === "milestone-a1-a-close"))
      .toMatchObject({ applicability: "applicable", plan: null, actual: null });

    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    expect(a1CloseCell()).toHaveTextContent(/^—$/);
    openProjectByName("Manta");
    applyDateInput(screen.getByLabelText(/^Plan for A1 Close occurrence/), "2031-01-15");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" }))
      .getByRole("button", { name: "Publish" }));
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    expect(a1CloseCell()).toHaveTextContent("P: 2031/01/15");
    expect(a1CloseCell()).toHaveTextContent("A: —");
  });

  it("keeps a notApplicable Draft out of Dashboard until Publish advances Current Published", () => {
    render(<App />);
    const a1GoCell = () => dashboardRow("dev-project-001")
      .querySelector('[data-column-key="schedule:a1-stage:a-g-o"]');
    const before = a1GoCell()?.textContent;
    expect(before).toContain("P: 2026/10/15");
    expect(a1GoCell()).not.toHaveTextContent("N/A");

    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Applicability for A1 G/O"), {
      target: { value: "notApplicable" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    expect(a1GoCell()).toHaveTextContent(before!);
    expect(a1GoCell()).not.toHaveTextContent("N/A");

    openProjectByName("Manta");
    expect(screen.getByLabelText("Applicability for A1 G/O")).toHaveValue("notApplicable");
    const beforePublish = lastReducedState();
    const beforeSnapshot = structuredClone(beforePublish);
    const originalHistory = beforePublish.schedules.find(entry => entry.projectId === devProject001.id)!.publishedVersions;
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" }))
      .getByRole("button", { name: "Publish" }));
    expect(screen.getByText("N/A requires both dates to be cleared.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
    expect(screen.queryByText("Published v02")).not.toBeInTheDocument();
    expect(lastReducedState()).toBe(beforePublish);
    expect(lastReducedState()).toEqual(beforeSnapshot);
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    expect(a1GoCell()).toHaveTextContent(before!);
    expect(a1GoCell()).not.toHaveTextContent("N/A");
    openProjectByName("Manta");
    fireEvent.click(screen.getByRole("button", { name: /^Clear Plan for A1 G\/O occurrence/ }));
    expect(screen.getByLabelText(/^Plan for A1 G\/O occurrence/)).toHaveValue("");
    expect(screen.getByLabelText(/^Actual for A1 G\/O occurrence/)).toHaveValue("");
    expect(lastReducedState().schedules.find(entry => entry.projectId === devProject001.id)!.publishedVersions).toBe(originalHistory);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" }))
      .getByRole("button", { name: "Publish" }));
    expect(screen.getByText("Published v02")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    expect(a1GoCell()?.querySelector('[data-milestone-id]')).toHaveTextContent(/^N\/A$/);
    expect(a1GoCell()).not.toHaveTextContent("2026/10/15");
    expect(lastReducedState().schedules.find(entry => entry.projectId === devProject001.id)!.publishedVersions[0]).toBe(originalHistory[0]);
    expect(beforePublish).toEqual(beforeSnapshot);
  });

  it("preserves an overflow Draft and reports precise Publish failure", () => {
    const overflowSchedule: CanonicalProjectSchedule = {
      ...devSchedule001,
      publishedVersions: [{
        ...devSchedule001.publishedVersions[0]!,
        versionNumber: Number.MAX_SAFE_INTEGER as ScheduleVersionNumber,
      }],
      workingDraft: {
        workingDraftId: toCanonicalScheduleWorkingDraftId("overflow-runtime-draft"),
        reviewSessionIds: [],
        importCandidates: [],
        milestones: [{ ...devSchedule001.publishedVersions[0]!.milestones[0]! }],
      },
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
      workingDraft: {
        workingDraftId: toCanonicalScheduleWorkingDraftId("stale-runtime-draft"),
        reviewSessionIds: [],
        importCandidates: [],
        milestones: [{ ...source }],
      },
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

  it("boots the User Trial Demo Seed through canonical Dashboard and Workspace paths", () => {
    const runtimeState = createUserTrialPrototypeState(dashboardReferenceDate);
    const attentionRead = selectDashboardAttention(
      runtimeState,
      dashboardReferenceDate,
      initialGovernanceContext(),
    );
    expect(attentionRead.kind).toBe("available");
    if (attentionRead.kind !== "available") {
      throw new Error("Expected available runtime Dashboard attention");
    }
    expect(attentionRead.due.projectIds).toContain(userTrialDemoProjectIds.goDueSoon);
    expect(attentionRead.due.projectIds).not.toContain(userTrialDemoProjectIds.mdrrDueSoon);
    expect(attentionRead.overdue.projectIds).toContain(
      userTrialDemoProjectIds.smtOverdue,
    );
    expect(attentionRead.due.projectIds).not.toContain(
      userTrialDemoProjectIds.completedMilestone,
    );
    expect(attentionRead.overdue.projectIds).not.toContain(
      userTrialDemoProjectIds.completedMilestone,
    );
    expect(attentionRead.due.projectCount).toBe(1);
    expect(attentionRead.overdue.projectCount).toBe(1);

    render(<App
      initialState={runtimeState}
      referenceDate={dashboardReferenceDate}
    />);

    expect(screen.getByText("Showing 9 of 9 projects")).toBeInTheDocument();
    const attention = screen.getByRole("region", { name: "Needs Attention" });
    const upcoming = within(attention).getByRole("group", {
      name: "Upcoming Milestones",
    });
    const overdue = within(attention).getByRole("group", { name: "Overdue" });
    expect(within(upcoming)
      .getByText(String(attentionRead.due.projectCount))).toBeVisible();
    expect(within(overdue)
      .getByText(String(attentionRead.overdue.projectCount))).toBeVisible();
    expect(within(upcoming).getByRole("button", {
      name: "Open Project DEMO - G/O Due Soon",
    })).toBeVisible();
    expect(within(upcoming).getByText("A1 G/O · 2026/09/28")).toBeVisible();
    expect(within(upcoming).queryByRole("button", {
      name: "Open Project DEMO - MDRR Due Soon",
    })).not.toBeInTheDocument();
    expect(within(upcoming).queryByText("MDRR · 2026/10/03")).not.toBeInTheDocument();
    expect(within(overdue).getByRole("button", {
      name: "Open Project DEMO - SMT Overdue",
    })).toBeVisible();
    expect(within(overdue).getByText("A1 SMT · 2026/09/16")).toBeVisible();
    expect(within(attention).queryByRole("button", {
      name: "Open Project DEMO - Completed Milestone",
    })).not.toBeInTheDocument();

    const mdrrPortfolioCell = dashboardRow(
      userTrialDemoProjectIds.mdrrDueSoon,
    ).querySelector('[data-column-key="schedule:mdrr:mdrr"]');
    expect(mdrrPortfolioCell).toHaveTextContent("P: 2026/10/03");
    expect(mdrrPortfolioCell).toHaveTextContent("A: —");

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "DEMO -" },
    });
    expect(dashboardRows()).toHaveLength(4);
    expect(screen.getByText("Showing 4 of 9 projects")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Customer"))
      .getByRole("option", { name: "DEMO" })).toBeInTheDocument();

    openProjectByName("DEMO - MDRR Due Soon");
    expect(within(projectHeader()).getByText(
      "Project Name: DEMO - MDRR Due Soon",
    )).toBeInTheDocument();
    expect(within(projectHeader()).getByText("Customer: DEMO"))
      .toBeInTheDocument();
    expect(within(projectHeader()).getByText("Year: 2026"))
      .toBeInTheDocument();
    expect(within(projectHeader()).getByText(
      "Product Line: Aspire (Refresh ID)",
    )).toBeInTheDocument();
    const schedule = screen.getByRole("region", { name: "Current Schedule" });
    expect(within(schedule).getByText("Published v01")).toBeInTheDocument();
    const plannedDate = within(schedule).getByText("2026/10/03");
    const milestoneRow = plannedDate.closest("tr");
    if (milestoneRow === null) {
      throw new Error("Expected the Published MDRR milestone row");
    }
    expect(within(milestoneRow).getAllByText("MDRR")).toHaveLength(2);
  });

  it("integrates the canonical Portfolio shell, Current Published grouped table, search, and nine filters", () => {
    render(<App referenceDate={dashboardReferenceDate} />);

    // Detects obsolete inline Dashboard rendering or attention disconnected from canonical state.
    expect(screen.getByRole("heading", { name: "Project Information", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Portfolio overview")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Project" })).toHaveTextContent("+ Create Project");
    expect(screen.getByRole("button", { name: "Export to Excel" })).toBeVisible();
    const attention = screen.getByRole("region", { name: "Needs Attention" });
    for (const [title, supporting] of [
      ["Blocking Issues", "Calculation not active"],
    ]) {
      const card = within(attention).getByRole("group", { name: title });
      expect(within(card).getByText("—")).toBeVisible();
      expect(within(card).getByText(supporting)).toBeVisible();
      expect(within(card).queryByText(/^\d+$/)).not.toBeInTheDocument();
    }
    const due = within(attention).getByRole("group", { name: "Upcoming Milestones" });
    expect(within(due).getByText("0")).toBeVisible();
    expect(within(due).getByText("Next 14 days · unique projects")).toBeVisible();
    const overdue = within(attention).getByRole("group", { name: "Overdue" });
    expect(within(overdue).getByText("0")).toBeVisible();
    expect(within(overdue).getByText("Past due · unique projects")).toBeVisible();
    expect(within(attention).getByText("Upcoming and Overdue use Current Published Schedule.")).toBeVisible();
    expect(within(attention).queryByText("Next 14 days · calculation not active")).not.toBeInTheDocument();
    expect(within(attention).queryByText("Past due · calculation not active")).not.toBeInTheDocument();
    expect(screen.queryByText("No items requiring attention.")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "All Projects", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Showing 5 of 5 projects")).toBeInTheDocument();

    // Detects flat headers, wrong 11/30/7 structure, or a diagnostic status leaf.
    const headerRows = dashboardTable().querySelectorAll("thead tr");
    expect(headerRows).toHaveLength(3);
    expect(Array.from(headerRows[0]!.querySelectorAll("th"), (header) => [header.textContent, header.colSpan])).toEqual([
      ["PROJECT INFORMATION", 11], ["SCHEDULE", 30], ["TEAM MEMBER", 7],
    ]);
    expect(Array.from(headerRows[1]!.querySelectorAll("th"), (header) => header.textContent)).toEqual([
      "Core fields", "Design", "ME Portion", "Thermal", "A1", "C1-stage", "C2-stage", "RAMP-stage", "MDRR", "Project Roles", "Standard Function Owners",
    ]);
    const leaves = Array.from(headerRows[2]!.querySelectorAll("th"));
    expect(leaves.slice(0, 11).map((header) => header.querySelector("span")?.textContent)).toEqual([
      "Status", "Year", "STN Project Name", "QCI Model Name", "Customer", "Category", "Product Line", "Panel Size", "CPU", "GPU", "PCB#",
    ]);
    expect(leaves.filter((header) => header.dataset.columnKey?.startsWith("schedule:"))).toHaveLength(30);
    expect(leaves.some((header) => header.dataset.columnKey?.startsWith("schedule:a-a2-stage:"))).toBe(false);
    expect(leaves.filter((header) => header.dataset.columnKey?.startsWith("team:")).map((header) => header.querySelector("span")?.textContent)).toEqual([
      "QCI PM", "QCI PjM", "Acer PM", "ME Owner", "EE Owner", "Thermal Owner", "BIOS Owner",
    ]);
    expect(leaves).toHaveLength(48);
    expect(within(dashboardTable()).queryByRole("columnheader", { name: /Current Published|Schedule Status|Diagnostic/ })).not.toBeInTheDocument();
    expect(dashboardRows()).toHaveLength(5);
    expect(dashboardRows().map((row) => row.dataset.projectId)).toEqual([
      "dev-project-001", "dev-project-002", "dev-project-003", "dev-project-004", "dev-project-005",
    ]);
    for (const name of ["Manta", "Nautilus", "Orca", "Beluga", "Marlin"]) {
      expect(within(dashboardTable()).getAllByText(name).length).toBeGreaterThan(0);
    }

    // Detects last-array v1 reads, collapsed empty states, and Team fixture leakage.
    const a1GoCell = dashboardRow("dev-project-001").querySelector('[data-column-key="schedule:a1-stage:a-g-o"]')!;
    expect(a1GoCell).toHaveAttribute("title", "Published v01 · A1 G/O");
    expect(a1GoCell).toHaveTextContent("P: 2026/10/15");
    for (const id of ["dev-project-002", "dev-project-003", "dev-project-004", "dev-project-005"]) {
      const cells = dashboardRow(id).querySelectorAll('[data-domain="schedule"]');
      expect(cells).toHaveLength(30);
      for (const cell of cells) { expect(cell).toHaveAttribute("title", "No published schedule"); expect(cell).toHaveTextContent(/^—$/); }
    }
    const qciPmByProjectId = new Map([
      ["dev-project-002", "DEV QCI PM"],
      ["dev-project-003", "DEV Project 003 QCI PM"],
      ["dev-project-004", "DEV Project 004 QCI PM"],
      ["dev-project-005", "DEV Project 005 QCI PM"],
    ]);
    for (const row of dashboardRows()) {
      const cells = row.querySelectorAll('[data-domain="team"]');
      expect(cells).toHaveLength(7);
      const qciPm = row.querySelector('[data-column-key="team:qciPm"]')!;
      const expectedQciPm = qciPmByProjectId.get(row.dataset.projectId ?? "");
      expect(qciPm).toHaveTextContent(expectedQciPm ?? /^—$/);
      expect(qciPm).not.toHaveAttribute("title", "Migration pending");
      for (const cell of Array.from(cells).slice(1)) {
        expect(cell).toHaveTextContent(/^—$/);
        expect(cell).toHaveAttribute("title", "Migration pending");
      }
    }
    expect(within(dashboardRow("dev-project-003")).getByText("DEV Project 003 QCI PM")).toBeInTheDocument();

    // Detects missing canonical predicates or stale disabled Category / QCI PM controls.
    const filterPanel = screen.getByRole("region", { name: "Search / Filters" });
    const labels = ["Year", "Customer", "Status", "Category", "Product Line", "Panel Size", "CPU", "GPU", "QCI PM"];
    const controls = within(filterPanel).getAllByRole("combobox");
    expect(controls).toHaveLength(9);
    labels.forEach((label, index) => {
      expect(controls[index]).toHaveAccessibleName(label);
      expect(controls[index]).toBeEnabled();
    });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ZBG" } });
    expect(dashboardRows()).toHaveLength(1);
    expect(within(dashboardTable()).getByText("Beluga")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Gaming" } });
    expect(dashboardRows().map((row) => row.dataset.projectId)).toEqual(["dev-project-003", "dev-project-004"]);
    fireEvent.change(screen.getByLabelText("QCI PM"), { target: { value: "project.003.qci.pm@example.test" } });
    expect(dashboardRows().map((row) => row.dataset.projectId)).toEqual(["dev-project-003"]);
    expect(screen.getByRole("button", { name: "Remove QCI PM: DEV Project 003 QCI PM" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

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
    const scheduleView = screen.getByRole("region", { name: "Current Schedule" });
    expect(within(scheduleView).getByText("Published v01")).toBeInTheDocument();
    expect(within(scheduleView).getByText("Kickoff")).toBeInTheDocument();

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

    fireEvent.click(within(resources).getByRole("button", { name: "Open Team Member" }));
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

    openTeamMemberFromWorkspace();
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

  it("atomically replaces only the selected Project Team after imported Save confirmation", async () => {
    render(<App initialSelectedProjectId={devProject002.id} />);
    openTeamMemberFromWorkspace();
    const encoded = new TextEncoder().encode([
      "Function,Member,email",
      "Custom Lab-Member,Runtime Imported,runtime-imported@example.test",
    ].join("\n"));
    const file = {
      name: "runtime-team.csv",
      arrayBuffer: vi.fn(async () => encoded.buffer.slice(
        encoded.byteOffset,
        encoded.byteOffset + encoded.byteLength,
      ) as ArrayBuffer),
    } as unknown as File;

    fireEvent.change(screen.getByLabelText("Import Team Member file"), {
      target: { files: [file] },
    });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Import Team preview" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Save imported Team" }));
    expect(screen.getByRole("dialog", { name: "Confirm whole Team replacement" })).toBeInTheDocument();

    vi.mocked(prototypeReducer).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Replace & Save" }));

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
    expect(saved.team?.functions.flatMap(({ assignments }) => assignments).map(({ name }) => name))
      .toEqual(["Runtime Imported"]);
    expect(saved.master).toEqual(devProject002.master);
    expect(saved.identityAliases).toEqual(devProject002.identityAliases);
    expect(reduced.projects.filter(({ id }) => id !== devProject002.id))
      .toEqual(canonicalProjectFixtures.filter(({ id }) => id !== devProject002.id));
    expect(reduced.schedules).toEqual(canonicalScheduleFixtures);
    expect(screen.getByRole("heading", { name: "Team Member" })).toBeInTheDocument();
    expect(screen.getAllByText("Runtime Imported").length).toBeGreaterThan(0);
    expect(screen.queryByText("DEV ME Owner")).not.toBeInTheDocument();
  });

  it("imports hidden numeric XLSX evidence into one lossless unknown-role roster and reopens it", async () => {
    render(<App initialSelectedProjectId={devProject002.id} />);
    openTeamMemberFromWorkspace();
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["Function", "Member", "email", "Tel. No."],
      ["QCMC-Coordinator", "Integrated Unknown", null, 24680],
    ]);
    worksheet["!cols"] = [{}, {}, {}, { hidden: true }];
    XLSX.utils.book_append_sheet(workbook, worksheet, "Roster");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const file = {
      name: "integrated-hidden.xlsx",
      arrayBuffer: vi.fn(async () => bytes),
    } as unknown as File;

    fireEvent.change(screen.getByLabelText("Import Team Member file"), {
      target: { files: [file] },
    });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Import Team preview" })).toBeInTheDocument());
    expect(screen.getByDisplayValue("Integrated Unknown")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save imported Team" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save imported Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace & Save" }));

    const reduced = lastReducedState();
    const saved = reduced.projects.find(({ id }) => id === devProject002.id)!;
    expect(selectTeamMemberRows(saved.team)).toHaveLength(1);
    expect(saved.team?.preservedUnclassifiedEntries).toEqual([
      expect.objectContaining({
        roleText: "",
        name: "Integrated Unknown",
        email: null,
        extraCells: [expect.objectContaining({
          headerText: "Tel. No.",
          rawType: "n",
          rawValue: 24680,
          hidden: true,
        })],
        sourceRows: [expect.objectContaining({
          fileName: "integrated-hidden.xlsx",
          sheetName: "Roster",
          rowNumber: 2,
          cells: expect.arrayContaining([
            expect.objectContaining({
              headerText: "Function",
              rawType: "s",
              rawValue: "QCMC-Coordinator",
              formattedText: "QCMC-Coordinator",
              hidden: false,
            }),
            expect.objectContaining({
              headerText: "Tel. No.",
              rawType: "n",
              rawValue: 24680,
              formattedText: "24680",
              hidden: true,
            }),
          ]),
        })],
      }),
    ]);
    expect(saved.team?.appliedTemplate).toEqual(devProject002.team?.appliedTemplate);
    const roster = screen.getByRole("table");
    expect(within(roster).getAllByRole("cell")).toHaveLength(4);
    expect(within(roster).getByRole("cell", { name: "Integrated Unknown" })).toBeInTheDocument();
    expect(within(roster).getByRole("cell", { name: "24680" })).toBeInTheDocument();
    expect(within(roster).queryByText("Source details")).not.toBeInTheDocument();
    expect(within(roster).queryByText("Raw value (n): 24680")).not.toBeInTheDocument();
  });

  it("shows the valid no-Published Schedule state", () => {
    render(<App />);
    openProjectByName("Nautilus");

    const resources = screen.getByRole("region", { name: "Resources" });
    const scheduleView = screen.getByRole("region", { name: "Current Schedule" });
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
    expect(within(projectHeader()).getByRole("button", { name: "View Project Master" })).toBeEnabled();
  });

  it("shows compact canonical Mechanical and Cover / Leverage in Project Master Detail", () => {
    const targetId = toProjectId("read-only-target");
    const sourceId = toProjectId("read-only-source");
    const source: Project = {
      ...devProject002,
      id: sourceId,
      master: {
        ...devProject002.master,
        basicInformation: {
          ...devProject002.master.basicInformation,
          year: 2028,
          stnProjectName: "Shared Name",
          qciModelName: "SOURCE-QCI",
        },
      },
    };
    const target: Project = {
      ...devProject003,
      id: targetId,
      master: {
        ...devProject003.master,
        mechanical: {
          product: {
            productLengthMm: 320.5,
            productWidthMm: null,
            productHeightMm: 17.25,
            productWeightG: 0,
          },
          package: {
            packageLengthMm: 480.5,
            packageWidthMm: 310,
            packageHeightMm: 65.75,
            grossWeightG: 2500.5,
          },
        },
        cover: {
          aCover: toCatalogItemId("cover-plastic-paint"),
          bCover: toCatalogItemId("cover-plastic-texture"),
          cCover: toCatalogItemId("cover-al-plate"),
          dCover: toCatalogItemId("unresolved-cover"),
        },
        leverage: {
          pcbLeverage: targetId,
          aLeverage: sourceId,
          bLeverage: null,
          cLeverage: toProjectId("unavailable-source"),
          dLeverage: null,
        },
      },
    };
    const localState: PrototypeState = { projects: [target, source], schedules: [] };

    render(<App initialSelectedProjectId={targetId} initialState={localState} />);

    expect(within(projectHeader()).getByText("Project Name: Orca")).toBeInTheDocument();
    const detail = openProjectMasterDetail();
    const mechanical = within(detail).getByRole("region", { name: "Mechanical" });
    const coverLeverage = within(detail).getByRole("region", { name: "Cover / Leverage" });
    expect(mechanical.compareDocumentPosition(coverLeverage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(detail).queryByRole("heading", { name: "Resources" })).not.toBeInTheDocument();

    expect(within(mechanical).getByRole("heading", { name: "Product Dimension" })).toBeInTheDocument();
    expect(within(mechanical).getByRole("heading", { name: "Package Dimension" })).toBeInTheDocument();
    for (const value of ["320.5 mm", "—", "17.25 mm", "0 g", "480.5 mm", "310 mm", "65.75 mm", "2500.5 g"]) {
      expect(within(mechanical).getByText(value)).toBeInTheDocument();
    }

    expect(within(coverLeverage).getByText("New Design")).toBeInTheDocument();
    expect(within(coverLeverage).getByText("Plastic-Paint")).toBeInTheDocument();
    expect(within(coverLeverage).getByText("2028 | Shared Name | SOURCE-QCI")).toBeInTheDocument();
    expect(within(coverLeverage).getByText("Plastic-Texture")).toBeInTheDocument();
    expect(within(coverLeverage).getByText("Unavailable Project")).toBeInTheDocument();
    expect(within(coverLeverage).getByText("Al-plate")).toBeInTheDocument();
    expect(within(coverLeverage).queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows canonical-safe attention and exports only the current filtered canonical rows", () => {
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

    const exportedRows = exportedDashboardRows();
    expect(exportedRows).toHaveLength(2);
    expect(exportedRows.map((row) => row["STN Project Name"])).toEqual([
      "Manta", "Marlin",
    ]);
    expect(vi.mocked(XLSX.writeFile)).toHaveBeenCalledWith(
      expect.anything(),
      "Project_Portfolio_Summary.xlsx",
    );
    expect(exportedRows.every((row) => row.MDRR === "")).toBe(true);
    const headers = exportedDashboardGrid()[0]!;
    expect(headers).toHaveLength(48);
    expect(headers.slice(0, 11)).toEqual(["Status", "Year", "STN Project Name", "QCI Model Name", "Customer", "Category", "Product Line", "Panel Size", "CPU", "GPU", "PCB#"]);
    expect(headers.slice(-9)).toEqual(["SSL/GL", "MDRR", "QCI PM", "QCI PjM", "Acer PM", "ME Owner", "EE Owner", "Thermal Owner", "BIOS Owner"]);
    expect(headers).toEqual([...dashboardTable().querySelectorAll('th[scope="col"] span')].map(leaf => leaf.textContent));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Manta" } });
    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    expect(exportedDashboardRows()).toEqual([exportedRows[0]]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "not-a-project" } });
    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    expect(exportedDashboardRows()).toEqual([]);
    expect(exportedDashboardGrid()).toEqual([headers]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    expect(exportedDashboardRows()).toHaveLength(5);
  });

  it("keeps real XLSX workbook parsing available beside Project export spies", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["Function", "Member", "email"],
        ["QCI-ME-Owner", "Runtime Import", "runtime-import@example.test"],
      ]),
      "Roster",
    );
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const result = inspectTeamImport({
      fileName: "runtime.xlsx",
      extension: "xlsx",
      bytes,
    });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.sheet.rows[0]?.cells).toContainEqual(expect.objectContaining({
      headerText: "Member",
      rawValue: "Runtime Import",
    }));
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

  it("keeps a Create-added option after Project Cancel, shares it with Edit, and resets it on remount", () => {
    const runtimeProductLineId = toCatalogItemId("runtime-shared-product-line");
    const runtimePanelSizeId = toCatalogItemId("runtime-shared-panel-size");
    const createCatalogItemId = vi.fn()
      .mockReturnValueOnce(runtimeProductLineId)
      .mockReturnValueOnce(runtimePanelSizeId);
    const first = render(
      <App createCatalogItemId={createCatalogItemId} />,
    );
    let dialog = openCreateDialog();

    expect(within(dialog).getAllByRole("button", { name: /^Add new / }).map(
      (button) => button.getAttribute("aria-label"),
    )).toEqual([
      "Add new Product Line",
      "Add new Panel Size",
      "Add new CPU",
      "Add new GPU",
    ]);
    expect(within(dialog).getByRole("button", { name: "Add new Product Line" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Add new Panel Size" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Add new CPU" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Add new GPU" })).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "Add new Customer" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Add new Category" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Add new Project Status" })).not.toBeInTheDocument();

    addSelfServiceOption(dialog, "Product Line", "Session Shared Line");
    expect(within(dialog).getByLabelText("Product Line")).toHaveValue(runtimeProductLineId);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    openProjectByQci("ZOR");
    const detail = openEditMaster();
    expect(within(detail).getByRole("option", { name: "Session Shared Line" })).toBeInTheDocument();
    expect(within(detail).getByRole("button", { name: "Add new Product Line" })).toBeVisible();
    expect(within(detail).getByRole("button", { name: "Add new Panel Size" })).toBeVisible();
    expect(within(detail).getByRole("button", { name: "Add new CPU" })).toBeVisible();
    expect(within(detail).getByRole("button", { name: "Add new GPU" })).toBeVisible();
    expect(within(detail).queryByRole("button", { name: "Add new Customer" })).not.toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: "Add new Category" })).not.toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: /Add new .*Cover/ })).not.toBeInTheDocument();

    addSelfServiceOption(detail, "Panel Size", "Session Shared Panel");
    expect(within(detail).getByLabelText("Panel Size")).toHaveValue(runtimePanelSizeId);
    fireEvent.click(within(detail).getByRole("button", { name: "Cancel" }));
    const reopenedDetail = openEditMaster();
    expect(within(reopenedDetail).getByRole("option", { name: "Session Shared Panel" }))
      .toBeInTheDocument();

    first.unmount();
    render(<App createCatalogItemId={() => runtimeProductLineId} />);
    dialog = openCreateDialog();
    expect(within(dialog).queryByRole("option", { name: "Session Shared Line" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("option", { name: "Session Shared Panel" })).not.toBeInTheDocument();
  });

  it("creates with all four runtime catalog values and projects them into filters, search, and export", () => {
    const ids = [
      toCatalogItemId("runtime-line"),
      toCatalogItemId("runtime-panel"),
      toCatalogItemId("runtime-cpu"),
      toCatalogItemId("runtime-gpu"),
    ];
    const createCatalogItemId = vi.fn()
      .mockReturnValueOnce(ids[0])
      .mockReturnValueOnce(ids[1])
      .mockReturnValueOnce(ids[2])
      .mockReturnValueOnce(ids[3]);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(fixedUuid);
    render(<App createCatalogItemId={createCatalogItemId} />);
    const dialog = openCreateDialog();

    addSelfServiceOption(dialog, "Product Line", "Runtime Line Label");
    addSelfServiceOption(dialog, "Panel Size", "Runtime Panel Label");
    addSelfServiceOption(dialog, "CPU", "Runtime CPU Label");
    addSelfServiceOption(dialog, "GPU", "Runtime GPU Label");
    expect(within(dialog).getByLabelText("Product Line")).toHaveValue(ids[0]);
    expect(within(dialog).getByLabelText("Panel Size")).toHaveValue(ids[1]);
    expect(within(dialog).getByLabelText("CPU")).toHaveValue(ids[2]);
    expect(within(dialog).getByLabelText("GPU")).toHaveValue(ids[3]);
    fireEvent.change(within(dialog).getByLabelText("Year"), { target: { value: "2033" } });
    fireEvent.change(within(dialog).getByLabelText("STN Project Name"), {
      target: { value: "Runtime Catalog Project" },
    });
    fireEvent.change(within(dialog).getByLabelText("QCI Model Name"), {
      target: { value: "ZRC" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(within(projectHeader()).getByText("Product Line: Runtime Line Label")).toBeVisible();
    expect(within(projectHeader()).getByText("Panel Size: Runtime Panel Label")).toBeVisible();
    expect(within(projectHeader()).getByText("CPU: Runtime CPU Label")).toBeVisible();
    expect(within(projectHeader()).getByText("GPU: Runtime GPU Label")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));

    const filters = screen.getByRole("region", { name: "Search / Filters" });
    for (const [field, label] of [
      ["Product Line", "Runtime Line Label"],
      ["Panel Size", "Runtime Panel Label"],
      ["CPU", "Runtime CPU Label"],
      ["GPU", "Runtime GPU Label"],
    ] as const) {
      expect(within(filters).getByLabelText(field)).toContainElement(
        within(filters).getByRole("option", { name: label }),
      );
    }
    const search = within(filters).getByRole("searchbox");
    for (const searchableLabel of [
      "Runtime Line Label",
      "Runtime CPU Label",
      "Runtime GPU Label",
    ]) {
      fireEvent.change(search, { target: { value: searchableLabel } });
      expect(within(dashboardTable()).getByText("Runtime Catalog Project")).toBeInTheDocument();
    }
    fireEvent.change(search, { target: { value: "Runtime Panel Label" } });
    expect(screen.getByText("No projects match the current search and filters")).toBeVisible();
    fireEvent.change(search, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    const exportedRows = exportedDashboardRows();
    expect(exportedRows.find((row) => row["STN Project Name"] === "Runtime Catalog Project"))
      .toMatchObject({
        "Product Line": "Runtime Line Label",
        "Panel Size": "Runtime Panel Label",
        CPU: "Runtime CPU Label",
        GPU: "Runtime GPU Label",
      });
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
    randomUuid.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /A1 Close/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "A1 Close" })).toBeInTheDocument();
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
    randomUuid.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
    expect(projectHeader()).toHaveAttribute("data-project-id", fixedUuid);
  });

  it("keeps Project Master, Resources, and Current Schedule in Workspace order", () => {
    render(<App />);
    openProjectByName("Manta");

    const projectMaster = projectHeader();
    const resources = screen.getByRole("region", { name: "Resources" });
    const currentSchedule = screen.getByRole("region", { name: "Current Schedule" });
    expect(projectMaster.compareDocumentPosition(resources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(resources.compareDocumentPosition(currentSchedule) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Mechanical", level: 2 }))
      .not.toBeInTheDocument();

    fireEvent.click(within(projectMaster).getByRole("button", { name: "View Project Master" }));
    expect(screen.getByRole("heading", { name: "Project Master Detail", level: 1 })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Current Schedule" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse Basic Information" })).toHaveTextContent("−");
    expect(screen.getByRole("button", { name: "Collapse Mechanical" })).toHaveTextContent("−");
    expect(screen.getByRole("button", { name: "Collapse Cover / Leverage" })).toHaveTextContent("−");
    expect(screen.queryByRole("heading", { name: "Resources" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to Project Workspace" }));
    expect(projectHeader()).toBeVisible();
    expect(screen.getByRole("region", { name: "Resources" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Current Schedule" })).toBeVisible();
  });

  it("initializes the approved expansion in Edit while keeping Create at its current scope", () => {
    const { state, target } = expandedProjectMasterState();
    render(<App initialSelectedProjectId={target.id} initialState={state} />);
    const detail = openEditMaster();
    expect(within(detail).queryByRole("button", { name: "Back to Project Workspace" }))
      .not.toBeInTheDocument();

    expect(within(detail).getByLabelText("Product Length (mm)")).toHaveValue("320.5");
    expect(within(detail).getByLabelText("Product Weight (g)")).toHaveValue("0");
    expect(within(detail).getByLabelText("Gross Weight (g)")).toHaveValue("2500.5");
    expect(within(detail).getByLabelText("A Cover Material")).toHaveValue("cover-plastic-paint");
    expect(within(detail).getByLabelText("D Cover Material")).toHaveValue("unresolved-cover");
    expect(within(detail).queryByLabelText("PCB Material")).not.toBeInTheDocument();
    expect(within(detail).getByRole("button", { name: /PCB Leverage Project/ })).toHaveTextContent("Current Project (New Design)");
    expect(within(detail).getByRole("button", { name: /A Cover Leverage Project/ })).toHaveTextContent("SOURCE-QCI-A");
    expect(within(detail).getByRole("button", { name: /B Cover Leverage Project/ })).toHaveTextContent("Not specified");
    expect(within(detail).getByRole("button", { name: /C Cover Leverage Project/ })).toHaveTextContent("Unavailable Project");

    fireEvent.click(within(detail).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to Project Workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "← Dashboard" }));
    const createDialog = openCreateDialog();
    expect(within(createDialog).queryByRole("group", { name: "Mechanical" })).not.toBeInTheDocument();
    expect(within(createDialog).queryByRole("group", { name: "Cover / Leverage" })).not.toBeInTheDocument();
  });

  it("blocks invalid Mechanical Save and preserves decimal, blank, and zero values exactly", () => {
    const { state, target } = expandedProjectMasterState();
    render(<App initialSelectedProjectId={target.id} initialState={state} />);
    const detail = openEditMaster();
    const length = within(detail).getByLabelText("Product Length (mm)");
    fireEvent.change(length, { target: { value: "-1.5" } });
    fireEvent.click(within(detail).getByRole("button", { name: "Save Changes" }));

    expect(within(detail).getByText("Must be 0 or greater.")).toBeInTheDocument();
    expect(vi.mocked(updateProjectMaster)).not.toHaveBeenCalled();
    expect(within(detail).getByRole("button", { name: "Collapse Mechanical" })).toBeVisible();

    fireEvent.change(length, { target: { value: "1e309" } });
    fireEvent.click(within(detail).getByRole("button", { name: "Save Changes" }));
    expect(within(detail).getByText("Enter a valid number.")).toBeInTheDocument();
    expect(vi.mocked(updateProjectMaster)).not.toHaveBeenCalled();
    expect(within(detail).getByRole("button", { name: "Save Changes" })).toBeVisible();

    fireEvent.change(length, { target: { value: "321.75" } });
    fireEvent.change(within(detail).getByLabelText("Product Width (mm)"), {
      target: { value: "" },
    });
    fireEvent.change(within(detail).getByLabelText("Product Weight (g)"), {
      target: { value: "0" },
    });
    fireEvent.click(within(detail).getByRole("button", { name: "Save Changes" }));

    const candidate = vi.mocked(updateProjectMaster).mock.calls.at(-1)?.[1].master;
    expect(candidate?.mechanical.product).toMatchObject({
      productLengthMm: 321.75,
      productWidthMm: null,
      productWeightG: 0,
    });
    expect(within(detail).getByRole("button", { name: "Edit Master" })).toBeVisible();
  });

  it("uses catalog materials and exact ProjectId leverage choices without losing dangling IDs", () => {
    const { state, target, sourceB } = expandedProjectMasterState();
    render(<App initialSelectedProjectId={target.id} initialState={state} />);
    const detail = openEditMaster();

    expect(within(detail).getByLabelText("A Cover Material")).toHaveTextContent("Plastic-Paint");
    expect(within(detail).getByLabelText("A Cover Material")).toHaveTextContent("Mg-Al");
    expect(within(detail).getByRole("button", { name: /C Cover Leverage Project/ })).toHaveTextContent("Unavailable Project");
    expect(within(detail).getByRole("button", { name: /PCB Leverage Project/ })).toHaveTextContent(
      "Current Project (New Design)",
    );

    fireEvent.click(within(detail).getByRole("button", { name: /A Cover Leverage Project/ }));
    fireEvent.change(within(detail).getByLabelText("Search A Cover Leverage Project"), {
      target: { value: "source-qci-b" },
    });
    const leverageOptions = within(detail).getByRole("listbox", {
      name: "A Cover Leverage Project options",
    });
    const sourceOption = within(leverageOptions).getByRole("option", {
      name: "2029 | Shared Source | SOURCE-QCI-B",
    });
    expect(sourceOption).toBeInTheDocument();
    expect(within(leverageOptions).queryByRole("option", {
      name: "2028 | Shared Source | SOURCE-QCI-A",
    })).not.toBeInTheDocument();
    fireEvent.click(sourceOption);
    fireEvent.change(within(detail).getByLabelText("A Cover Material"), {
      target: { value: "" },
    });
    fireEvent.click(within(detail).getByRole("button", { name: "Save Changes" }));

    const candidate = vi.mocked(updateProjectMaster).mock.calls.at(-1)?.[1].master;
    expect(candidate?.cover.aCover).toBeNull();
    expect(candidate?.leverage.aLeverage).toBe(sourceB.id);
    expect(candidate?.leverage.pcbLeverage).toBe(target.id);
    expect(candidate?.leverage.bLeverage).toBeNull();
    expect(candidate?.leverage.cLeverage).toBe(toProjectId("unavailable-source"));
  });

  it("resolves a direct leverage source's current identity after that source is renamed", () => {
    const { state, target, sourceA } = expandedProjectMasterState();
    render(<App initialSelectedProjectId={target.id} initialState={state} />);
    let detail = openProjectMasterDetail();
    expect(within(detail).getByRole("region", { name: "Cover / Leverage" })).toHaveTextContent(
      "2028 | Shared Source | SOURCE-QCI-A",
    );

    fireEvent.click(within(detail).getByRole("button", { name: "Back to Project Workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "← Dashboard" }));
    openProjectByQci("SOURCE-QCI-A");
    detail = openEditMaster();
    fireEvent.change(within(detail).getByLabelText("STN Project Name"), {
      target: { value: "Renamed Direct Source" },
    });
    fireEvent.click(within(detail).getByRole("button", { name: "Save Changes" }));
    fireEvent.click(within(detail).getByRole("button", { name: "Back to Project Workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "← Dashboard" }));
    openProjectByQci(target.master.basicInformation.qciModelName!);

    detail = openProjectMasterDetail();
    expect(within(detail).getByRole("region", { name: "Cover / Leverage" })).toHaveTextContent(
      "2028 | Renamed Direct Source | SOURCE-QCI-A",
    );
    const reducedTarget = lastReducedState().projects.find(({ id }) => id === target.id);
    expect(reducedTarget?.master.leverage.aLeverage).toBe(sourceA.id);
  });

  it("edits through the Master command, preserves hidden fields, and retains ProjectId", () => {
    render(<App />);
    openProjectByQci("ZOR");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    addMilestone("milestone-a1-a-close");
    applyDateInput(screen.getByLabelText(/^Plan for A1 Close occurrence/), "2035-07-08");
    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-003");
    const detail = openEditMaster();

    const textChanges: Record<string, string> = {
      "STN Project Name": "Orca Revised", "QCI Model Name": "DEV-QCI-ALPHA-REVISED",
      "Acer Model Name": "Revised Acer Model", "Acer Marketing Name": "Revised Marketing",
      Year: "2031", SSID: "REVISED-SSID", RMN: "REVISED-RMN",
    };
    for (const [label, value] of Object.entries(textChanges)) {
      fireEvent.change(within(detail).getByLabelText(label), { target: { value } });
    }
    for (const [label, value] of [
      ["Customer", "dev-customer-acer"], ["Product Line", "dev-product-line-beta"],
      ["Panel Size", "dev-panel-size-18"], ["CPU", "dev-cpu-beta"], ["GPU", "dev-gpu-beta"],
      ["Project Status", "status-mp"],
    ]) {
      fireEvent.change(within(detail).getByLabelText(label), { target: { value } });
    }
    fireEvent.click(within(detail).getByRole("button", { name: "Save Changes" }));

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
      expect.objectContaining({ kind: "qciModelName", originalValue: "ZOR" }),
    ]));
    expect(within(detail).getByText("Project Name: Orca Revised")).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole("button", { name: "Back to Project Workspace" }));
    expect(projectHeader()).toHaveAttribute("data-project-id", "dev-project-003");
    expect(within(projectHeader()).getByText("Project Name: Orca Revised")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Working Draft" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Plan for A1 Close occurrence/)).toHaveValue("2035-07-08");
    expect(screen.getByRole("row", { name: /A1 Close/ })).toBeInTheDocument();
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
    openProjectByQci("ZOR");
    const detail = openEditMaster();
    fireEvent.change(within(detail).getByLabelText("STN Project Name"), { target: { value: "Blocked Candidate" } });
    fireEvent.click(within(detail).getByRole("button", { name: "Save Changes" }));

    expect(within(detail).getByRole("button", { name: "Save Changes" })).toBeVisible();
    expect(within(detail).getByText("Blocked for correction.")).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole("button", { name: "Cancel" }));
    expect(within(detail).getByText("Project Name: Orca")).toBeInTheDocument();

    fireEvent.click(within(detail).getByRole("button", { name: "Edit Master" }));
    fireEvent.change(within(detail).getByLabelText("STN Project Name"), { target: { value: "Advisory Candidate" } });
    fireEvent.click(within(detail).getByRole("button", { name: "Save Changes" }));
    expect(within(detail).queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();
    expect(within(detail).getByText("Project Name: Advisory Candidate")).toBeInTheDocument();
    expect(within(detail).getByText("Advisory saved.")).toBeInTheDocument();
  });

  it("cancels Edit and discards only transient form changes", () => {
    render(<App />);
    openProjectByQci("ZOR");
    const detail = openEditMaster();
    fireEvent.change(within(detail).getByLabelText("STN Project Name"), { target: { value: "Discard Me" } });
    fireEvent.change(within(detail).getByLabelText("QCI Model Name"), { target: { value: "DISCARD-QCI" } });
    fireEvent.change(within(detail).getByLabelText("Product Length (mm)"), { target: { value: "999.5" } });
    fireEvent.change(within(detail).getByLabelText("A Cover Material"), {
      target: { value: "cover-plastic-paint" },
    });
    fireEvent.click(within(detail).getByRole("button", { name: /A Cover Leverage Project/ }));
    fireEvent.change(within(detail).getByLabelText("Search A Cover Leverage Project"), {
      target: { value: "Manta" },
    });
    fireEvent.click(within(detail).getByRole("option", { name: /Manta/ }));
    fireEvent.click(within(detail).getByRole("button", { name: "Cancel" }));

    expect(within(detail).getByText("Project Name: Orca")).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole("button", { name: "Edit Master" }));
    expect(within(detail).getByLabelText("STN Project Name")).toHaveValue("Orca");
    expect(within(detail).getByLabelText("QCI Model Name")).toHaveValue("ZOR");
    expect(within(detail).getByLabelText("Product Length (mm)")).toHaveValue("");
    expect(within(detail).getByLabelText("A Cover Material")).toHaveValue("cover-mg-al");
    expect(within(detail).getByRole("button", { name: /A Cover Leverage Project/ }))
      .toHaveTextContent("Not specified");
  });
});
