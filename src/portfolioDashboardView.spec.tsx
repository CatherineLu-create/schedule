import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DashboardAttentionRead } from "./application/selectors/dashboardAttention";
import { selectPortfolioDashboardRows } from "./application/selectors/portfolioDashboardRows";
import { canonicalProjectFixtures } from "./fixtures/v2/canonicalProjectFixtures";
import { canonicalScheduleFixtures } from "./fixtures/v2/canonicalScheduleFixtures";
import { parseDateOnly, type DateOnly } from "./domain/shared/dateOnly";
import { toMilestoneDefinitionId, toMilestoneId } from "./domain/shared/ids";
import { PortfolioDashboardView } from "./portfolioDashboardView";

afterEach(cleanup);
const rows = selectPortfolioDashboardRows({ projects: canonicalProjectFixtures, schedules: canonicalScheduleFixtures });
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
        plan: dateOnly("2026-09-28"),
      },
      {
        projectId: rows[0]!.projectId,
        milestoneId: toMilestoneId("view-manta-mdrr"),
        milestoneDefinitionId: toMilestoneDefinitionId("milestone-mdrr"),
        plan: dateOnly("2026-10-03"),
      },
      {
        projectId: rows[1]!.projectId,
        milestoneId: toMilestoneId("view-nautilus-close"),
        milestoneDefinitionId: toMilestoneDefinitionId("milestone-a-a2-a-close"),
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
      plan: dateOnly("2026-09-16"),
    }],
  },
};
function setup(attention: DashboardAttentionRead = zeroAttention) {
  const callbacks = { onCreateProject: vi.fn(), onExport: vi.fn(), onOpenProject: vi.fn() };
  render(<PortfolioDashboardView attention={attention} rows={rows} {...callbacks} />);
  return callbacks;
}
function visibleIds() {
  return Array.from(screen.getByRole("table").querySelectorAll("tbody [data-project-id]"), (row) => row.getAttribute("data-project-id"));
}
function select(label: string, value: string) {
  fireEvent.change(screen.getByRole("combobox", { name: label }), { target: { value } });
}

describe("Portfolio Dashboard shell", () => {
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
    expect(within(due).getByText("G/O · 2026/09/28")).toBeVisible();
    expect(within(due).getByText("MDRR · 2026/10/03")).toBeVisible();
    expect(within(due).getByText("Close · 2026/09/30")).toBeVisible();
    expect(within(overdue).getAllByRole("button", { name: "Open Project Manta" }))
      .toHaveLength(1);
    expect(within(overdue).getByText("SMT · 2026/09/16")).toBeVisible();

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
    expect(within(overdue).getByText("SMT · 2026/09/16")).toBeVisible();
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
    expect(screen.getByRole("heading", { name: "Projects", level: 2 })).toBeInTheDocument();
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
    expect(screen.getByRole("heading", { name: "Projects" })).toBeVisible();
  });

  it("keeps A2 visible while filtering hides the Project that makes A2 applicable", () => {
    const source = rows[0]!;
    expect(source.schedule.kind).toBe("published");
    if (source.schedule.kind !== "published") {
      throw new Error("Expected Manta to have a Current Published Schedule");
    }
    const a2Row = {
      ...source,
      schedule: {
        ...source.schedule,
        cells: [
          ...source.schedule.cells,
          {
            milestoneDefinitionId: toMilestoneDefinitionId(
              "milestone-a-a2-a-g-o",
            ),
            occurrences: [
              {
                milestoneId: toMilestoneId("view-applicable-a2"),
                applicability: "applicable" as const,
                plan: "-",
                actual: "-",
              },
            ],
          },
        ],
      },
    };

    render(
      <PortfolioDashboardView
        attention={zeroAttention}
        rows={[a2Row, rows[1]!]}
        onCreateProject={() => {}}
        onExport={() => {}}
        onOpenProject={() => {}}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "A2" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Nautilus" },
    });
    expect(visibleIds()).toEqual(["dev-project-002"]);
    expect(screen.getByRole("columnheader", { name: "A2" })).toBeInTheDocument();
  });

  it("exports through the owner callback without filtered rows and preserves Create and exact-ID opens", () => {
    const callbacks = setup();
    select("Status", "Pending");
    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    expect(callbacks.onExport.mock.calls).toEqual([[]]);
    fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
    expect(callbacks.onCreateProject.mock.calls).toEqual([[]]);
    fireEvent.click(screen.getByRole("button", { name: "Open Project Orca" }));
    fireEvent.click(screen.getByRole("table").querySelector('[data-project-id="dev-project-003"]')!);
    expect(callbacks.onOpenProject.mock.calls).toEqual([["dev-project-003"], ["dev-project-003"]]);
  });
});
