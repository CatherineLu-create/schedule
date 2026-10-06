import { initialGovernanceContext } from "./test/governanceTestUtils";
import { createInitialSelfServiceReferenceCatalogs } from "./application/reference-data/selfServiceCatalogs";
import { createPortfolioVisibleSchema } from "./portfolioDashboardColumns";
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { selectDashboardAttention, type DashboardAttentionRead } from "./application/selectors/dashboardAttention";
import { selectPortfolioDashboardRows } from "./application/selectors/portfolioDashboardRows";
import { canonicalProjectFixtures } from "./fixtures/v2/canonicalProjectFixtures";
import { canonicalScheduleFixtures } from "./fixtures/v2/canonicalScheduleFixtures";
import { parseDateOnly, type DateOnly } from "./domain/shared/dateOnly";
import { toMilestoneDefinitionId, toMilestoneId, toProjectId } from "./domain/shared/ids";
import { PortfolioDashboardView } from "./portfolioDashboardView";

afterEach(cleanup);
const rows = selectPortfolioDashboardRows({ projects: canonicalProjectFixtures, schedules: canonicalScheduleFixtures }, createInitialSelfServiceReferenceCatalogs(), initialGovernanceContext());
function dateOnly(value: string): DateOnly {
  const parsed = parseDateOnly(value);
  if (parsed === null) throw new Error(`Invalid test DateOnly: ${value}`);
  return parsed;
}
const referenceDate = dateOnly("2026-09-23");
const zeroAttention: DashboardAttentionRead = {
  kind: "available",
  referenceDate,
  due: { projectIds: [], projectCount: 0, matches: [] },
  overdue: { projectIds: [], projectCount: 0, matches: [] },
};
const detailedAttention: DashboardAttentionRead = {
  kind: "available",
  referenceDate,
  due: {
    projectIds: [rows[0]!.projectId, rows[1]!.projectId],
    projectCount: 2,
    matches: [
      {
        projectId: rows[0]!.projectId,
        milestoneId: toMilestoneId("view-manta-go"),
        milestoneDefinitionId: toMilestoneDefinitionId("milestone-a1-a-g-o"),
        milestoneName: "A1 G/O",
        plan: dateOnly("2026-09-28"),
      },
      {
        projectId: rows[0]!.projectId,
        milestoneId: toMilestoneId("view-manta-mdrr"),
        milestoneDefinitionId: toMilestoneDefinitionId("milestone-mdrr"),
        milestoneName: "MDRR",
        plan: dateOnly("2026-10-03"),
      },
      {
        projectId: rows[0]!.projectId,
        milestoneId: toMilestoneId("view-manta-c1-go"),
        milestoneDefinitionId: toMilestoneDefinitionId("milestone-c1-c-g-o"),
        milestoneName: "C1 G/O",
        plan: dateOnly("2026-10-04"),
      },
      {
        projectId: rows[1]!.projectId,
        milestoneId: toMilestoneId("view-nautilus-close"),
        milestoneDefinitionId: toMilestoneDefinitionId("milestone-c1-close"),
        milestoneName: "C1 Close",
        plan: dateOnly("2026-09-30"),
      },
    ],
  },
  overdue: {
    projectIds: [rows[0]!.projectId],
    projectCount: 1,
    matches: [{
      projectId: rows[0]!.projectId,
      milestoneId: toMilestoneId("view-manta-smt"),
      milestoneDefinitionId: toMilestoneDefinitionId("milestone-a1-a-smt"),
      milestoneName: "A1 SMT",
      plan: dateOnly("2026-09-16"),
    }],
  },
};
function setup(attention: DashboardAttentionRead = zeroAttention) {
  const callbacks = { onCreateProject: vi.fn(), onExport: vi.fn(), onOpenProject: vi.fn() };
  render(<PortfolioDashboardView schema={createPortfolioVisibleSchema(initialGovernanceContext())} attention={attention} rows={rows} {...callbacks} />);
  return callbacks;
}
function visibleIds() {
  return Array.from(screen.getByRole("table").querySelectorAll("tbody [data-project-id]"), (row) => row.getAttribute("data-project-id"));
}
function select(label: string, value: string) {
  fireEvent.change(screen.getByRole("combobox", { name: label }), { target: { value } });
}

describe("Portfolio Dashboard shell", () => {
  it.each([
    ["Upcoming Milestones", "2", "Next 14 days · unique projects"],
    ["Overdue", "1", "Past due · unique projects"],
  ])("keeps %s count and supporting text in one compact inline summary", (title, count, supporting) => {
    setup(detailedAttention);
    const card = within(screen.getByRole("group", { name: title }));
    const value = card.getByText(count);
    const summary = value.parentElement!;
    expect(summary).toContainElement(card.getByText(supporting));
    expect(summary).toHaveTextContent(`${count} · ${supporting}`);
    expect(value.tagName).toBe("SPAN");
    expect(card.getByText(supporting).tagName).toBe("SPAN");
  });

  it.each(["Upcoming Milestones", "Overdue"])("renders %s as one wrapping Project row with all concrete milestone dates inline", (title) => {
    if (detailedAttention.kind !== "available") throw new Error("Expected available fixture");
    // The view must present the selector's matches, not apply its own date/category rules.
    const callbacks = setup({ ...detailedAttention, overdue: detailedAttention.due });
    const card = screen.getByRole("group", { name: title });
    const project = within(card).getByRole("button", { name: "Open Project Manta" });
    const row = project.parentElement!;
    expect(row).toHaveTextContent("Manta — A1 G/O · 2026/09/28 ｜ MDRR · 2026/10/03 ｜ C1 G/O · 2026/10/04");
    expect(within(row).getAllByText("Manta", { exact: true })).toHaveLength(1);
    expect(within(row).queryByRole("list")).not.toBeInTheDocument();
    expect(row).toHaveClass("whitespace-normal", "break-words");
    for (const label of ["A1 G/O · 2026/09/28", "MDRR · 2026/10/03", "C1 G/O · 2026/10/04"]) {
      const item = within(row).getByText(label);
      expect(item).toBeVisible();
      expect(item.tagName).toBe("SPAN");
    }
    const single = within(card).getByRole("button", { name: "Open Project Nautilus" }).parentElement!;
    expect(single).toHaveTextContent("Nautilus — C1 Close · 2026/09/30");
    fireEvent.click(project);
    expect(callbacks.onOpenProject).toHaveBeenCalledExactlyOnceWith(rows[0].projectId);
  });

  it("shows every qualifying Project without Top N, Show more, clipping or an internal card scrollbar", () => {
    const manyRows = Array.from({ length: 12 }, (_, index) => ({
      ...rows[0], projectId: toProjectId(`compact-project-${index}`),
      project: { ...rows[0].project, projectName: `Compact Project ${index + 1}` },
    }));
    const group = {
      projectIds: manyRows.map(row => row.projectId), projectCount: 12,
      matches: manyRows.map(row => ({
        projectId: row.projectId, milestoneId: toMilestoneId(`${row.projectId}-go`),
        milestoneDefinitionId: toMilestoneDefinitionId("milestone-a1-a-g-o"),
        milestoneName: "A1 G/O", plan: referenceDate,
      })),
    };
    render(<PortfolioDashboardView schema={createPortfolioVisibleSchema(initialGovernanceContext())}
      attention={{ kind: "available", referenceDate, due: group, overdue: group }} rows={manyRows}
      onCreateProject={() => {}} onExport={() => {}} onOpenProject={() => {}} />);
    for (const title of ["Upcoming Milestones", "Overdue"]) {
      const card = screen.getByRole("group", { name: title });
      expect(within(card).getAllByRole("button", { name: /^Open Project Compact Project / })).toHaveLength(12);
      expect(within(card).getAllByText("A1 G/O · 2026/09/23")).toHaveLength(12);
      expect(within(card).queryByText(/show more|top \d+/i)).not.toBeInTheDocument();
      for (const element of [card, ...card.querySelectorAll<HTMLElement>("*")]) {
        expect(element.className).not.toMatch(/(?:^|\s)(?:\S*:)?(?:max-h-|h-\d|overflow-(?:[xy]-)?(?:auto|scroll|hidden)|truncate|line-clamp-|whitespace-nowrap)/);
        expect(element.style.maxHeight).toBe("");
        expect(element.style.height).toBe("");
      }
    }
  });

  it("renders the real selector's exact SSL/GL presentation rather than stored FCS", () => {
    const original = canonicalScheduleFixtures[0];
    const attention = selectDashboardAttention({
      projects: [canonicalProjectFixtures[0]],
      schedules: [{ ...original, publishedVersions: [{ ...original.publishedVersions[0], milestones: [{
        milestoneId: toMilestoneId("compact-sslgl"),
        milestoneDefinitionId: toMilestoneDefinitionId("milestone-ramp-fcs"),
        applicability: "applicable", plan: referenceDate, actual: null,
      }] }] }],
    }, referenceDate, initialGovernanceContext());
    setup(attention);
    const card = within(screen.getByRole("group", { name: "Upcoming Milestones" }));
    expect(card.getByText("SSL/GL · 2026/09/23")).toBeVisible();
    expect(card.queryByText(/FCS/)).not.toBeInTheDocument();
  });

  it("presents the exact resolved local Attention name without a global catalog lookup", () => {
    setup({ ...zeroAttention, kind: "available", due: {
      projectIds: [rows[0].projectId], projectCount: 1,
      matches: [{ projectId: rows[0].projectId, milestoneId: toMilestoneId("local-occurrence"), milestoneDefinitionId: toMilestoneDefinitionId("local-definition"), milestoneName: "Project-specific close", plan: referenceDate }],
    } });
    expect(within(screen.getByRole("group", { name: "Upcoming Milestones" })).getByText("Project-specific close · 2026/09/23")).toBeInTheDocument();
  });
  it("contains desktop-only sticky table layers in the Dashboard stacking context below sibling dialogs", () => {
    setup();
    const dashboard = screen.getByRole("region", { name: "Portfolio Dashboard" });
    const stickyHeader = dashboard.querySelector('th[data-column-key="projectStatus"]');
    expect(stickyHeader).toHaveClass("lg:sticky", "lg:z-30");
    expect((stickyHeader as HTMLElement).style.position).toBe("");
    // At desktop width, removing this boundary lets the table's z-index 30 outrank App's sibling dialog z-index 10.
    expect(getComputedStyle(dashboard).isolation).toBe("isolate");
  });

  it("keeps approved heading/actions and active Upcoming and Overdue zero states", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Project Information", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Portfolio overview")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export to Excel" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Create Project" })).toHaveTextContent("+ Create Project");
    const attention = screen.getByRole("region", { name: "Needs Attention" });
    // Detects an unauthorized fourth indicator, a missing card, or changed visual order.
    const cards = within(attention).getAllByRole("group");
    expect(cards).toHaveLength(3);
    ["Blocking Issues", "Upcoming Milestones", "Overdue"].forEach((title, index) => {
      expect(cards[index]).toHaveAccessibleName(title);
    });
    expect(within(attention).getByRole("heading", { name: "Needs Attention" })).toBeInTheDocument();
    expect(within(attention).getByText("Upcoming and Overdue use Current Published Schedule.")).toBeInTheDocument();
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
    expect(within(due).queryByRole("button")).not.toBeInTheDocument();
    const overdue = within(attention).getByRole("group", { name: "Overdue" });
    expect(within(overdue).getByText("0")).toBeVisible();
    expect(within(overdue).getByText("Past due · unique projects")).toBeVisible();
    expect(within(attention).queryByText("Next 14 days · calculation not active")).not.toBeInTheDocument();
    expect(within(attention).queryByText("Past due · calculation not active")).not.toBeInTheDocument();
    expect(screen.queryByText("No items requiring attention.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Working Draft|Publish|warning|Edit Team|Import Team/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("DEV Project 003 QCI PM").length).toBeGreaterThan(0);
    expect(screen.getByText("Scroll horizontally to view Schedule and Team Member")).toBeInTheDocument();
  });

  it("groups retained matches by selector Project order and opens the exact Project independently of table search", () => {
    const callbacks = setup(detailedAttention);
    const attention = screen.getByRole("region", { name: "Needs Attention" });
    const due = within(attention).getByRole("group", { name: "Upcoming Milestones" });
    const overdue = within(attention).getByRole("group", { name: "Overdue" });
    expect(within(due).getByText("2")).toBeVisible();
    expect(within(overdue).getByText("1")).toBeVisible();
    expect(within(due).getAllByRole("button", { name: "Open Project Manta" }))
      .toHaveLength(1);
    expect(within(due).getByText("A1 G/O · 2026/09/28")).toBeVisible();
    expect(within(due).getByText("MDRR · 2026/10/03")).toBeVisible();
    expect(within(due).getByText("C1 G/O · 2026/10/04")).toBeVisible();
    expect(within(due).getByText("C1 Close · 2026/09/30")).toBeVisible();
    expect(within(overdue).getAllByRole("button", { name: "Open Project Manta" }))
      .toHaveLength(1);
    expect(within(overdue).getByText("A1 SMT · 2026/09/16")).toBeVisible();

    fireEvent.click(within(due).getByRole("button", {
      name: "Open Project Manta",
    }));
    expect(callbacks.onOpenProject).toHaveBeenCalledOnce();
    expect(callbacks.onOpenProject).toHaveBeenCalledWith(rows[0]!.projectId);

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "not-a-project" },
    });
    expect(screen.getByText("Showing 0 of 5 projects")).toBeInTheDocument();
    expect(within(due).getByText("2")).toBeVisible();
    expect(within(overdue).getByText("1")).toBeVisible();
    expect(within(due).getByText("MDRR · 2026/10/03")).toBeVisible();
    expect(within(overdue).getByText("A1 SMT · 2026/09/16")).toBeVisible();
  });

  it("renders unavailable attention without a misleading numeric zero", () => {
    setup({ kind: "unavailable", referenceDate, issues: [] });
    const attention = screen.getByRole("region", { name: "Needs Attention" });
    for (const title of ["Upcoming Milestones", "Overdue"]) {
      const card = within(attention).getByRole("group", { name: title });
      expect(within(card).getByText("—")).toBeVisible();
      expect(within(card).getByText("Calculation unavailable")).toBeVisible();
      expect(within(card).queryByText("0")).not.toBeInTheDocument();
      expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    }
  });

  it("exposes all nine canonical filters with Category and QCI PM options from current rows", () => {
    setup();
    const filters = screen.getByRole("region", { name: "Search / Filters" });
    expect(within(filters).getAllByRole("searchbox")).toHaveLength(1);
    expect(within(filters).getByRole("searchbox")).toHaveAttribute("placeholder", "Search STN Project Name, QCI Model Name, Product Line, Customer, CPU, GPU");
    const labels = ["Year", "Customer", "Status", "Category", "Product Line", "Panel Size", "CPU", "GPU", "QCI PM"];
    const controls = within(filters).getAllByRole("combobox");
    expect(controls).toHaveLength(9);
    labels.forEach((label, index) => {
      expect(controls[index]).toHaveAccessibleName(label);
      expect(controls[index]).toBeEnabled();
    });
    expect(within(screen.getByRole("combobox", { name: "Status" })).getAllByRole("option").map((option) => option.textContent)).toEqual(["All", "RFQ", "On Going", "Pending", "Kick off", "MP"]);
    expect(within(screen.getByRole("combobox", { name: "GPU" })).getAllByRole("option").map((option) => option.textContent)).toEqual(["All", "GN22-X2/X4", "GN20-X6", "GN22-X7/X9"]);
    expect(within(screen.getByRole("combobox", { name: "Category" })).getAllByRole("option").map((option) => option.textContent)).toEqual(["All", "Aspire", "Gamepad", "Gaming", "WOA"]);
    expect(within(screen.getByRole("combobox", { name: "QCI PM" })).getAllByRole("option").map((option) => [option.getAttribute("value"), option.textContent])).toEqual([
      ["", "All"],
      ["qci.pm@example.test", "DEV QCI PM"],
      ["project.003.qci.pm@example.test", "DEV Project 003 QCI PM"],
      ["project.004.qci.pm@example.test", "DEV Project 004 QCI PM"],
      ["project.005.qci.pm@example.test", "DEV Project 005 QCI PM"],
    ]);
  });

  it("filters by Category and visible QCI PM while preserving chip removal and Clear all", () => {
    setup();
    select("Category", "Gaming");
    expect(visibleIds()).toEqual(["dev-project-003", "dev-project-004"]);
    expect(screen.getByRole("button", { name: "Remove Category: Gaming" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remove Category: Gaming" }));
    expect(visibleIds()).toEqual(["dev-project-001", "dev-project-002", "dev-project-003", "dev-project-004", "dev-project-005"]);

    select("QCI PM", "project.003.qci.pm@example.test");
    expect(visibleIds()).toEqual(["dev-project-003"]);
    expect(screen.getByRole("button", { name: "Remove QCI PM: DEV Project 003 QCI PM" })).toBeVisible();
    const qciPmCell = screen.getByRole("table", { name: "Projects" })
      .querySelector('[data-project-id="dev-project-003"] [data-column-key="team:qciPm"]');
    expect(qciPmCell).toHaveTextContent("DEV Project 003 QCI PM");

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(visibleIds()).toEqual(["dev-project-001", "dev-project-002", "dev-project-003", "dev-project-004", "dev-project-005"]);
  });

  it("wires canonical Status and GPU predicates to the real table and result count", () => {
    setup();
    expect(screen.getByRole("heading", { name: "All Projects", level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Projects", level: 2 })).not.toBeInTheDocument();
    expect(screen.getByText("Showing 5 of 5 projects")).toBeInTheDocument();
    select("Status", "Pending");
    expect(visibleIds()).toEqual(["dev-project-003"]);
    expect(screen.getByText("Showing 1 of 5 projects")).toBeInTheDocument();
    select("Status", "");
    select("GPU", "GN22-X7/X9");
    expect(visibleIds()).toEqual(["dev-project-003", "dev-project-004"]);
    expect(screen.getByText("Showing 2 of 5 projects")).toBeInTheDocument();
  });

  it("combines Customer and GPU with AND, removes only the chosen chip, and clears all filters", () => {
    setup();
    select("Customer", "DEV Customer B");
    select("GPU", "GN20-X6");
    expect(visibleIds()).toEqual([]);
    expect(screen.getByText("Showing 0 of 5 projects")).toBeInTheDocument();
    expect(screen.getByText("No projects match the current search and filters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Customer: DEV Customer B" })).toHaveTextContent("Customer: DEV Customer B ×");
    expect(screen.getByRole("button", { name: "Remove GPU: GN20-X6" })).toHaveTextContent("GPU: GN20-X6 ×");
    fireEvent.click(screen.getByRole("button", { name: "Remove Customer: DEV Customer B" }));
    expect(screen.getByRole("combobox", { name: "GPU" })).toHaveValue("GN20-X6");
    expect(visibleIds()).toEqual(["dev-project-002"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(visibleIds()).toEqual(["dev-project-001", "dev-project-002", "dev-project-003", "dev-project-004", "dev-project-005"]);
    expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
  });

  it("combines search with filters and retains the complete shell for zero search results", () => {
    setup();
		select("GPU", "GN22-X7/X9");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  zor  " } });
    expect(visibleIds()).toEqual(["dev-project-003"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "not-a-project" } });
    expect(visibleIds()).toEqual([]);
    expect(screen.getByText("Showing 0 of 5 projects")).toBeInTheDocument();
    expect(screen.getByText("No projects match the current search and filters")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Needs Attention" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Search / Filters" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "All Projects" })).toBeVisible();
  });

  it("keeps the fixed active-baseline columns while filtering changes visible Projects", () => {
    render(
      <PortfolioDashboardView schema={createPortfolioVisibleSchema(initialGovernanceContext())}
        attention={zeroAttention}
        rows={[rows[0]!, rows[1]!]}
        onCreateProject={() => {}}
        onExport={() => {}}
        onOpenProject={() => {}}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "A1 Close" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "C2 System Build" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "A2" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Nautilus" },
    });
    expect(visibleIds()).toEqual(["dev-project-002"]);
    expect(screen.getByRole("columnheader", { name: "A1 Close" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "C2 System Build" })).toBeInTheDocument();
  });

  it("exports the current filtered Portfolio rows and schema and preserves Create and exact-ID opens", () => {
    const callbacks = setup();
    select("Status", "Pending");
    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    expect(callbacks.onExport.mock.calls).toEqual([[[rows[2]], createPortfolioVisibleSchema(initialGovernanceContext())]]);
    fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
    expect(callbacks.onCreateProject.mock.calls).toEqual([[]]);
    fireEvent.click(screen.getByRole("button", { name: "Open Project Orca" }));
    fireEvent.click(screen.getByRole("table").querySelector('[data-project-id="dev-project-003"]')!);
    expect(callbacks.onOpenProject.mock.calls).toEqual([["dev-project-003"], ["dev-project-003"]]);
  });

  it("exports all Projects without filters and an empty set when search and filters match none", () => {
    const callbacks = setup();
    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    expect(callbacks.onExport).toHaveBeenLastCalledWith(rows, createPortfolioVisibleSchema(initialGovernanceContext()));
    select("Status", "Pending");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Manta" } });
    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    expect(callbacks.onExport).toHaveBeenLastCalledWith([], createPortfolioVisibleSchema(initialGovernanceContext()));
  });
});
