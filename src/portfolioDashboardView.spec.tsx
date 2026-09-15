import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { selectPortfolioDashboardRows } from "./application/selectors/portfolioDashboardRows";
import { canonicalProjectFixtures } from "./fixtures/v2/canonicalProjectFixtures";
import { canonicalScheduleFixtures } from "./fixtures/v2/canonicalScheduleFixtures";
import { toMilestoneDefinitionId, toMilestoneId } from "./domain/shared/ids";
import { PortfolioDashboardView } from "./portfolioDashboardView";

afterEach(cleanup);
const rows = selectPortfolioDashboardRows({ projects: canonicalProjectFixtures, schedules: canonicalScheduleFixtures });
function setup() {
  const callbacks = { onCreateProject: vi.fn(), onExport: vi.fn(), onOpenProject: vi.fn() };
  render(<PortfolioDashboardView rows={rows} {...callbacks} />);
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

  it("keeps approved heading/actions and three truthful attention cards instead of fake counts", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Project Information", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Portfolio overview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export to Excel" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Create Project" })).toHaveTextContent("+ Create Project");
    const attention = screen.getByRole("region", { name: "Needs Attention" });
    // Detects an unauthorized fourth indicator, a missing card, or changed visual order.
    const cards = within(attention).getAllByRole("group");
    expect(cards).toHaveLength(3);
    ["Blocking Issues", "Milestone Due", "Overdue"].forEach((title, index) => {
      expect(cards[index]).toHaveAccessibleName(title);
    });
    expect(within(attention).getByRole("heading", { name: "Needs Attention" })).toBeInTheDocument();
    expect(within(attention).getByText("Portfolio indicators await approved business rules.")).toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: /Working Draft|Publish|warning|Edit Team|Import Team/ })).not.toBeInTheDocument();
    expect(screen.queryByText("DEV Project 003 QCI PM")).not.toBeInTheDocument();
    expect(screen.getByText("Scroll horizontally to view Schedule and Team Member")).toBeInTheDocument();
  });

  it("exposes only seven canonical filters in visual order and explains both disabled controls", () => {
    setup();
    const filters = screen.getByRole("region", { name: "Search / Filters" });
    expect(within(filters).getAllByRole("searchbox")).toHaveLength(1);
    expect(within(filters).getByRole("searchbox")).toHaveAttribute("placeholder", "Search STN Project Name, QCI Model Name, Product Line, Customer, CPU, GPU");
    const labels = ["Year", "Customer", "Status", "Category", "Product Line", "Panel Size", "CPU", "GPU", "QCI PM"];
    const controls = within(filters).getAllByRole("combobox");
    expect(controls).toHaveLength(9);
    labels.forEach((label, index) => {
      expect(controls[index]).toHaveAccessibleName(label);
      if (label === "Category" || label === "QCI PM") {
        expect(controls[index]).toBeDisabled();
        expect(controls[index]).toHaveAttribute("aria-describedby");
        expect(controls[index]).toHaveAccessibleDescription(/Not available in V2.2|Migration pending/);
        expect(within(controls[index]).getAllByRole("option")).toHaveLength(1);
      } else expect(controls[index]).toBeEnabled();
    });
    expect(within(screen.getByRole("combobox", { name: "Status" })).getAllByRole("option").map((option) => option.textContent)).toEqual(["All", "RFQ", "On Going", "Pending", "Kick off", "MP"]);
    expect(within(screen.getByRole("combobox", { name: "GPU" })).getAllByRole("option").map((option) => option.textContent)).toEqual(["All", "DEV GPU Alpha", "DEV GPU Beta"]);
  });

  it("wires canonical Status and GPU predicates to the real table and result count", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Projects", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Showing 5 of 5 projects")).toBeInTheDocument();
    select("Status", "Pending");
    expect(visibleIds()).toEqual(["dev-project-003"]);
    expect(screen.getByText("Showing 1 of 5 projects")).toBeInTheDocument();
    select("Status", "");
    select("GPU", "DEV GPU Beta");
    expect(visibleIds()).toEqual(["dev-project-003", "dev-project-005"]);
    expect(screen.getByText("Showing 2 of 5 projects")).toBeInTheDocument();
  });

  it("combines Customer and GPU with AND, removes only the chosen chip, and clears all filters", () => {
    setup();
    select("Customer", "Acer");
    select("GPU", "DEV GPU Beta");
    expect(visibleIds()).toEqual([]);
    expect(screen.getByText("Showing 0 of 5 projects")).toBeInTheDocument();
    expect(screen.getByText("No projects match the current search and filters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Customer: Acer" })).toHaveTextContent("Customer: Acer ×");
    expect(screen.getByRole("button", { name: "Remove GPU: DEV GPU Beta" })).toHaveTextContent("GPU: DEV GPU Beta ×");
    fireEvent.click(screen.getByRole("button", { name: "Remove Customer: Acer" }));
    expect(screen.getByRole("combobox", { name: "GPU" })).toHaveValue("DEV GPU Beta");
    expect(visibleIds()).toEqual(["dev-project-003", "dev-project-005"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(visibleIds()).toEqual(["dev-project-001", "dev-project-002", "dev-project-003", "dev-project-004", "dev-project-005"]);
    expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
  });

  it("combines search with filters and retains the complete shell for zero search results", () => {
    setup();
    select("GPU", "DEV GPU Beta");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  qci-alpha-02  " } });
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
