import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PortfolioCurrentPublishedRead, PortfolioDashboardRow } from "./application/selectors/portfolioDashboardRows";
import { toMilestoneDefinitionId, toMilestoneId, toProjectId } from "./domain/shared/ids";
import { PortfolioDashboardTable } from "./portfolioDashboardTable";

afterEach(cleanup);
const baseRow: PortfolioDashboardRow = {
  projectId: toProjectId("local-project-id"),
  project: {
    projectId: toProjectId("local-project-id"),
    year: "2029", customer: "Canonical customer", productLine: "Canonical product line",
    projectName: "Canonical STN name", qciModelName: "Canonical QCI model", acerModelName: "Hidden Acer model",
    acerMarketingName: "Hidden marketing name", panelSize: "Canonical panel size", cpu: "Canonical CPU", gpu: "Canonical GPU",
    ssid: "Hidden SSID", rmn: "Hidden RMN", projectStatus: "Canonical status", currentStage: "-", mdrr: "-",
  },
  category: "Canonical category",
  qciPm: { value: "canonical.pm@example.test", label: "Canonical QCI PM" },
  pcbNumber: "PCB-77",
  schedule: { kind: "noPublishedSchedule" },
};
function rowWith(schedule: PortfolioCurrentPublishedRead): PortfolioDashboardRow {
  return { ...baseRow, projectId: toProjectId("exact-id-not-the-name"), project: { ...baseRow.project, projectName: "Same display name" }, schedule };
}
function renderedRow() {
  const row = screen.getByRole("table", { name: "Projects" }).querySelector("tbody tr");
  expect(row, "the supplied canonical Project must remain rendered").not.toBeNull();
  return row as HTMLTableRowElement;
}
function scheduleCells() { return [...renderedRow().querySelectorAll<HTMLTableCellElement>('td[data-domain="schedule"]')]; }
function leaf(key: string) { return renderedRow().querySelector<HTMLTableCellElement>(`td[data-column-key="${key}"]`)!; }

describe("PortfolioDashboardTable", () => {
  // Mutation: rendering the rejected flat Project-only table or a diagnostic column.
  it("renders the data-driven grouped schema without unused A2 or legacy Team terminology", () => {
    render(<PortfolioDashboardTable rows={[baseRow]} onOpenProject={() => {}} />);
    const table = screen.getByRole("table", { name: "Projects" });
    const headerRows = table.querySelectorAll("thead tr");
    expect(headerRows).toHaveLength(3);
    expect([...headerRows[0].children].map((header) => [header.textContent, header.getAttribute("colspan")])).toEqual([
      ["PROJECT INFORMATION", "11"], ["SCHEDULE", "31"], ["TEAM MEMBER", "7"],
    ]);
    expect([...headerRows[1].children].map((header) => header.textContent)).toEqual([
      "Core fields", "Design", "ME Portion", "Thermal", "A", "C1-stage", "C2-stage", "RAMP-stage", "MDRR", "Project Roles", "Standard Function Owners",
    ]);
    const headers = [...headerRows[2].querySelectorAll("th")];
    expect(headers).toHaveLength(49);
    expect(headers.slice(0, 11).map((header) => header.textContent)).toEqual(["Status", "Year", "STN Project Name", "QCI Model Name", "Customer", "Category", "Product Line", "Panel Size", "CPU", "GPU", "PCB#"]);
    expect(headers.filter((header) => header.dataset.columnKey?.startsWith("schedule:"))).toHaveLength(31);
    expect(headers.some((header) => header.dataset.columnKey?.startsWith("schedule:a-a2-stage:"))).toBe(false);
    expect(screen.queryByRole("columnheader", { name: "A1-stage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "A/A2-stage" })).not.toBeInTheDocument();
    expect(headers.slice(-7).map((header) => header.textContent)).toEqual(["QCI PM", "QCI PjM", "Acer PM", "ME Owner", "EE Owner", "Thermal Owner", "BIOS Owner"]);
    expect([...table.querySelectorAll("thead th")].every((header) => ["colgroup", "col"].includes(header.getAttribute("scope") ?? ""))).toBe(true);
    expect(screen.queryByText(/Current Published|Schedule Status|Diagnostic/)).not.toBeInTheDocument();
    expect(screen.getAllByTestId("portfolio-table-scroll")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Projects table scroll area" })).toContainElement(table);
    expect(screen.queryByRole("scrollbar")).not.toBeInTheDocument();
  });

  // Mutation: showing A2 permanently, hiding an applicable A2 with null dates, or matching by display text.
  it("shows the stable-ID A2 group only when a Current Published A2 occurrence is applicable", () => {
    const a2DefinitionId = toMilestoneDefinitionId("milestone-a-a2-a-g-o");
    const applicable: PortfolioCurrentPublishedRead = {
      kind: "published",
      versionLabel: "Published v01",
      milestoneCount: 1,
      cells: [{
        milestoneDefinitionId: a2DefinitionId,
        occurrences: [{
          milestoneId: toMilestoneId("applicable-a2-with-null-dates"),
          applicability: "applicable",
          plan: "-",
          actual: "-",
        }],
      }],
    };
    const notApplicable: PortfolioCurrentPublishedRead = {
      ...applicable,
      cells: [{
        milestoneDefinitionId: a2DefinitionId,
        occurrences: [{
          milestoneId: toMilestoneId("not-applicable-a2"),
          applicability: "notApplicable",
          plan: "2027/01/01",
          actual: "2027/01/02",
        }],
      }],
    };
    const { rerender } = render(<PortfolioDashboardTable rows={[rowWith(notApplicable)]} onOpenProject={() => {}} />);

    expect(screen.queryByRole("columnheader", { name: "A2" })).not.toBeInTheDocument();
    expect(scheduleCells()).toHaveLength(31);

    rerender(<PortfolioDashboardTable rows={[rowWith(applicable)]} onOpenProject={() => {}} />);
    expect(screen.getByRole("columnheader", { name: "A2" })).toHaveAttribute("colspan", "4");
    expect(scheduleCells()).toHaveLength(35);
    expect(leaf("schedule:a-a2-stage:a-g-o")).toHaveTextContent("Applicable");
    expect(leaf("schedule:a-a2-stage:a-g-o")).toHaveTextContent("P: —");
  });

  it("shows mixed Published A2 values across exact Projects only while an applicable occurrence exists", () => {
    const a2DefinitionId = toMilestoneDefinitionId("milestone-a-a2-a-g-o");
    const withProjectId = (id: string, schedule: PortfolioCurrentPublishedRead): PortfolioDashboardRow => ({
      ...rowWith(schedule), projectId: toProjectId(id),
      project: { ...baseRow.project, projectId: toProjectId(id) },
    });
    const applicable = withProjectId("applicable-project", {
      kind: "published", versionLabel: "Published v01", milestoneCount: 1,
      cells: [{ milestoneDefinitionId: a2DefinitionId, occurrences: [{
        milestoneId: toMilestoneId("applicable-a2"), applicability: "applicable", plan: "-", actual: "-",
      }] }],
    });
    const notApplicable = withProjectId("not-applicable-project", {
      kind: "published", versionLabel: "Published v02", milestoneCount: 1,
      cells: [{ milestoneDefinitionId: a2DefinitionId, occurrences: [{
        milestoneId: toMilestoneId("not-applicable-a2"), applicability: "notApplicable", plan: "2027/01/01", actual: "2027/01/02",
      }] }],
    });
    const noPublished = withProjectId("no-published-project", { kind: "noPublishedSchedule" });
    const { rerender } = render(<PortfolioDashboardTable rows={[applicable, notApplicable, noPublished]} onOpenProject={() => {}} />);
    expect(screen.getByRole("columnheader", { name: "A2" })).toHaveAttribute("colspan", "4");
    const a2Cell = (id: string) => screen.getByRole("table", { name: "Projects" })
      .querySelector(`[data-project-id="${id}"] [data-column-key="schedule:a-a2-stage:a-g-o"]`);
    expect(a2Cell("applicable-project")).toHaveTextContent("P: —");
    expect(a2Cell("applicable-project")).toHaveTextContent("A: —");
    expect(a2Cell("not-applicable-project")?.querySelector('[data-milestone-id="not-applicable-a2"]')).toHaveTextContent(/^N\/A$/);
    expect(a2Cell("no-published-project")).toHaveTextContent(/^—$/);
    rerender(<PortfolioDashboardTable rows={[notApplicable]} onOpenProject={() => {}} />);
    expect(screen.queryByRole("columnheader", { name: "A2" })).not.toBeInTheDocument();
  });

  // Mutation: restoring unconditional inline sticky positioning or dropping the approved 1024px CSS breakpoint.
  it("keeps all four Project context columns sticky only from the desktop breakpoint", () => {
    render(<PortfolioDashboardTable rows={[baseRow]} onOpenProject={() => {}} />);
    const stickyKeys = ["projectStatus", "year", "name", "qciProjectName"];

    for (const key of stickyKeys) {
      const header = screen.getByRole("columnheader", { name: new RegExp(`^${key === "projectStatus" ? "Status" : key === "year" ? "Year" : key === "name" ? "STN Project Name" : "QCI Model Name"}`) });
      const cell = leaf(key);
      expect(header).toHaveClass("lg:sticky");
      expect(cell).toHaveClass("lg:sticky");
      expect(header).toHaveClass("lg:left-[var(--portfolio-sticky-left)]", "lg:z-30");
      expect(cell).toHaveClass("lg:left-[var(--portfolio-sticky-left)]", "lg:z-10");
      expect(header.classList.contains("sticky")).toBe(false);
      expect(cell.classList.contains("sticky")).toBe(false);
      expect(header.style.position).toBe("");
      expect(cell.style.position).toBe("");
    }
  });

  // Mutation: leaving narrow viewports covered by fixed Project cells so native scrolling cannot reveal later domains.
  it("leaves the native scroll path unobstructed below 1024px", () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    render(<PortfolioDashboardTable rows={[baseRow]} onOpenProject={() => {}} />);
    const scrollOwner = screen.getByTestId("portfolio-table-scroll");
    fireEvent.scroll(scrollOwner, { target: { scrollLeft: 1490 } });

    expect(scrollOwner).toHaveProperty("scrollLeft", 1490);
    for (const key of ["projectStatus", "year", "name", "qciProjectName"]) {
      expect(leaf(key).style.position).not.toBe("sticky");
    }
    expect(leaf("schedule:c2-stage:c-g-o")).toBeInTheDocument();
    expect(leaf("team:qciPm")).toBeInTheDocument();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth });
  });

  // Mutation: forcing long leaf labels onto one overflowing line or removing the full-label tooltip/accessibility text.
  it("contains long Schedule labels within two lines while preserving the full label", () => {
    render(<PortfolioDashboardTable rows={[baseRow]} onOpenProject={() => {}} />);
    const header = screen.getByRole("columnheader", { name: "Thermal module for C" });
    const label = within(header).getByText("Thermal module for C");

    expect(header).not.toHaveClass("whitespace-nowrap");
    expect(label).toHaveClass("line-clamp-2", "whitespace-normal", "break-words");
    expect(label).not.toHaveClass("block");
    expect(label).toHaveAttribute("title", "Thermal module for C");
    expect(header).toHaveAccessibleName("Thermal module for C");
  });

  // Mutation: collapsing unavailable, valid empty history, or zero milestones to one empty state.
  it.each([
    [{ kind: "unavailable", issues: [] }, "Schedule data unavailable", "unavailable"],
    [{ kind: "noPublishedSchedule" }, "No published schedule", "noPublishedSchedule"],
    [{ kind: "published", versionLabel: "Published v03", milestoneCount: 0, cells: [] }, "Published v03 · No milestones", "publishedEmpty"],
  ] as const)("preserves existing-cell accessibility for %s", (schedule, description, state) => {
    render(<PortfolioDashboardTable rows={[rowWith(schedule)]} onOpenProject={() => {}} />);
    expect(scheduleCells()).toHaveLength(31);
    for (const cell of scheduleCells()) {
      expect(cell).toHaveTextContent(/^—$/);
      expect(cell).toHaveAccessibleDescription(description);
      expect(cell).toHaveAttribute("title", description);
      expect(cell).toHaveAttribute("data-schedule-state", state);
    }
  });

  // Mutation: retaining descriptions/state attributes while rendering every empty state with the same color treatment.
  it("visually distinguishes unavailable, no Published history, and Published-empty Schedule segments", () => {
    const reads: readonly PortfolioCurrentPublishedRead[] = [
      { kind: "unavailable", issues: [] },
      { kind: "noPublishedSchedule" },
      { kind: "published", versionLabel: "Published v03", milestoneCount: 0, cells: [] },
    ];
    const { rerender } = render(<PortfolioDashboardTable rows={[rowWith(reads[0])]} onOpenProject={() => {}} />);
    const appearances = reads.map((read) => {
      rerender(<PortfolioDashboardTable rows={[rowWith(read)]} onOpenProject={() => {}} />);
      // Compare only the applied color treatment, without prescribing a particular palette or all layout classes.
      const cellTones = scheduleCells().map((cell) => [...cell.classList].filter((token) => /^(bg|text)-/.test(token)).sort().join(" "));
      expect(cellTones).toHaveLength(31);
      expect(new Set(cellTones).size).toBe(1);
      expect(cellTones[0]).not.toBe("");
      return cellTones[0];
    });
    expect(new Set(appearances).size).toBe(3);
  });

  // Mutation: keeping only first/last repeated occurrence or exposing stored N/A dates.
  it("renders repeated Published occurrences including MDRR in snapshot order and masks non-MDRR notApplicable dates", () => {
    const schedule: PortfolioCurrentPublishedRead = {
      kind: "published", versionLabel: "Published v03", milestoneCount: 4, cells: [
        { milestoneDefinitionId: toMilestoneDefinitionId("milestone-c2-c-g-o"), occurrences: [
          { milestoneId: toMilestoneId("later-id"), applicability: "notApplicable", plan: "2026/10/05", actual: "2026/10/06" },
          { milestoneId: toMilestoneId("earlier-id"), applicability: "applicable", plan: "-", actual: "-" },
        ] },
        { milestoneDefinitionId: toMilestoneDefinitionId("milestone-mdrr"), occurrences: [
          { milestoneId: toMilestoneId("mdrr-plan-only"), applicability: "applicable", plan: "2099/01/01", actual: "-" },
          { milestoneId: toMilestoneId("mdrr-completed"), applicability: "applicable", plan: "2099/02/01", actual: "2099/02/02" },
        ] },
      ],
    };
    const row = rowWith(schedule);
    const before = structuredClone(row);
    render(<PortfolioDashboardTable rows={[row]} onOpenProject={() => {}} />);
    const cell = leaf("schedule:c2-stage:c-g-o");
    expect(cell).toHaveAccessibleDescription("Published v03 · C G/O");
    expect([...cell.querySelectorAll('[data-milestone-id]')].map((element) => element.getAttribute("data-milestone-id"))).toEqual(["later-id", "earlier-id"]);
    const notApplicableOccurrence = cell.querySelector('[data-milestone-id="later-id"]');
    const applicableOccurrence = cell.querySelector('[data-milestone-id="earlier-id"]');
    expect(notApplicableOccurrence).not.toBeNull();
    expect(notApplicableOccurrence).toHaveTextContent(/^N\/A$/);
    expect(notApplicableOccurrence).not.toHaveTextContent("2026/10/05");
    expect(notApplicableOccurrence).not.toHaveTextContent("2026/10/06");
    expect(notApplicableOccurrence).not.toHaveTextContent("P:");
    expect(notApplicableOccurrence).not.toHaveTextContent("A:");
    expect(applicableOccurrence).toHaveTextContent("Applicable");
    expect(applicableOccurrence).toHaveTextContent("P: —");
    expect(applicableOccurrence).toHaveTextContent("A: —");
    expect(leaf("schedule:c1-stage:c-g-o")).toHaveTextContent(/^—$/);
    const mdrrCell = leaf("schedule:mdrr:mdrr");
    expect([...mdrrCell.querySelectorAll('[data-milestone-id]')].map(
      (element) => element.getAttribute("data-milestone-id"),
    )).toEqual(["mdrr-plan-only", "mdrr-completed"]);
    expect(mdrrCell.querySelector('[data-milestone-id="mdrr-plan-only"]'))
      .toHaveTextContent("P: 2099/01/01");
    expect(mdrrCell.querySelector('[data-milestone-id="mdrr-plan-only"]'))
      .toHaveTextContent("A: —");
    expect(mdrrCell.querySelector('[data-milestone-id="mdrr-completed"]'))
      .toHaveTextContent("P: 2099/02/01");
    expect(mdrrCell.querySelector('[data-milestone-id="mdrr-completed"]'))
      .toHaveTextContent("A: 2099/02/02");
    expect(row).toEqual(before);
  });

  it.each([
    ["Not Applicable", [{
      milestoneId: toMilestoneId("mdrr-not-applicable"),
      applicability: "notApplicable" as const,
      plan: "2027/01/03",
      actual: "2027/01/04",
    }]],
    ["entirely undated", [{
      milestoneId: toMilestoneId("mdrr-undated"),
      applicability: "applicable" as const,
      plan: "-",
      actual: "-",
    }]],
    ["missing", []],
  ])("renders one dash for %s Published MDRR", (_scenario, occurrences) => {
    const schedule: PortfolioCurrentPublishedRead = {
      kind: "published",
      versionLabel: "Published v05",
      milestoneCount: 1,
      cells: [{
        milestoneDefinitionId: toMilestoneDefinitionId("milestone-mdrr"),
        occurrences,
      }],
    };

    render(<PortfolioDashboardTable
      rows={[rowWith(schedule)]}
      onOpenProject={() => {}}
    />);

    const mdrrCell = leaf("schedule:mdrr:mdrr");
    expect(mdrrCell).toHaveTextContent(/^—$/);
    expect(mdrrCell.querySelectorAll("[data-milestone-id]")).toHaveLength(0);
  });

  it("shows dated applicable fields and one N/A for a notApplicable occurrence with null fields", () => {
    const schedule: PortfolioCurrentPublishedRead = {
      kind: "published", versionLabel: "Published v04", milestoneCount: 2, cells: [{
        milestoneDefinitionId: toMilestoneDefinitionId("milestone-c2-c-g-o"),
        occurrences: [
          { milestoneId: toMilestoneId("dated-applicable"), applicability: "applicable", plan: "2027/01/03", actual: "2027/01/04" },
          { milestoneId: toMilestoneId("null-not-applicable"), applicability: "notApplicable", plan: "-", actual: "-" },
        ],
      }],
    };
    const before = structuredClone(schedule);
    render(<PortfolioDashboardTable rows={[rowWith(schedule)]} onOpenProject={() => {}} />);
    const cell = leaf("schedule:c2-stage:c-g-o");
    expect(cell.querySelector('[data-milestone-id="dated-applicable"]')).toHaveTextContent("P: 2027/01/03");
    expect(cell.querySelector('[data-milestone-id="dated-applicable"]')).toHaveTextContent("A: 2027/01/04");
    expect(cell.querySelector('[data-milestone-id="null-not-applicable"]')).toHaveTextContent(/^N\/A$/);
    expect(schedule).toEqual(before);
  });

  // Mutation: wiring any of the eleven Project columns to a different field or a fixture value.
  it("maps each Project cell from its supplied canonical projection and leaves the row unchanged", () => {
    const before = structuredClone(baseRow);
    render(<PortfolioDashboardTable rows={[baseRow]} onOpenProject={() => {}} />);
    const expectedCells = [
      ["projectStatus", "Canonical status"], ["year", "2029"], ["name", "Canonical STN name"],
      ["qciProjectName", "Canonical QCI model"], ["customer", "Canonical customer"], ["category", "Canonical category"],
      ["productLine", "Canonical product line"], ["size", "Canonical panel size"], ["cpu", "Canonical CPU"],
      ["gpu", "Canonical GPU"], ["pcbNumber", "PCB-77"],
    ];
    expect([...renderedRow().querySelectorAll('td[data-domain="project"]')].map((cell) => [cell.getAttribute("data-column-key"), cell.textContent])).toEqual(expectedCells);
    expect(baseRow).toEqual(before);
  });

  // Mutation: changing canonical/export sentinels instead of only formatting their presentation.
  it("formats a Project null sentinel without mutating the supplied row", () => {
    const row = { ...baseRow, project: { ...baseRow.project, gpu: "-" } };
    const before = structuredClone(row);
    render(<PortfolioDashboardTable rows={[row]} onOpenProject={() => {}} />);
    expect(leaf("gpu")).toHaveTextContent(/^—$/);
    expect(row.project.gpu).toBe("-");
    expect(row).toEqual(before);
  });

  // Mutation: hiding the saved QCI PM behind the old Team placeholder or fabricating another Team owner.
  it("renders saved QCI PM and keeps the other six Team columns pending", () => {
    render(<PortfolioDashboardTable rows={[baseRow]} onOpenProject={() => {}} />);
    const teamCells = [...renderedRow().querySelectorAll('td[data-domain="team"]')];
    expect(teamCells).toHaveLength(7);
    expect(leaf("team:qciPm")).toHaveTextContent("Canonical QCI PM");
    expect(leaf("team:qciPm")).not.toHaveAttribute("title", "Migration pending");
    for (const cell of teamCells.slice(1)) {
      expect(cell).toHaveTextContent(/^—$/);
      expect(cell).toHaveAttribute("title", "Migration pending");
    }
    expect(screen.getByRole("columnheader", { name: "TEAM MEMBER" }))
      .toHaveAccessibleDescription("QCI PM active; other Team columns migration pending");
    expect(screen.queryByRole("button", { name: /Import Team Member/ })).not.toBeInTheDocument();
  });

  it("renders an em dash when no saved QCI PM is available", () => {
    render(<PortfolioDashboardTable rows={[{ ...baseRow, qciPm: null }]} onOpenProject={() => {}} />);
    expect(leaf("team:qciPm")).toHaveTextContent(/^—$/);
    expect(leaf("team:qciPm")).not.toHaveAttribute("title", "Migration pending");
  });

  // Mutation: passing a display name/whole object, or letting the button bubble a duplicate open.
  it("opens the exact ProjectId once for pointer and keyboard-operable button activation", () => {
    const onOpenProject = vi.fn();
    const row = rowWith({ kind: "noPublishedSchedule" });
    render(<PortfolioDashboardTable rows={[row]} onOpenProject={onOpenProject} />);
    fireEvent.click(leaf("year"));
    expect(onOpenProject).toHaveBeenLastCalledWith(toProjectId("exact-id-not-the-name"));
    expect(onOpenProject).toHaveBeenCalledTimes(1);
    const button = screen.getByRole("button", { name: "Open Project Same display name" });
    expect(button.tagName).toBe("BUTTON");
    button.focus();
    expect(button).toHaveFocus();
    // A native button's keyboard activation dispatches click with detail 0.
    fireEvent.click(button, { detail: 0 });
    expect(onOpenProject).toHaveBeenLastCalledWith(row.projectId);
    expect(onOpenProject).toHaveBeenCalledTimes(2);
  });

  // Mutation: using initial widths for sticky offsets or leaking resize listeners after mouseup/unmount.
  it("resizes with live sticky offsets, minimums, keyboard support and cleanup", () => {
    const { unmount } = render(<PortfolioDashboardTable rows={[baseRow]} onOpenProject={() => {}} />);
    expect(leaf("projectStatus").style.getPropertyValue("--portfolio-sticky-left")).toBe("0px");
    expect(leaf("year").style.getPropertyValue("--portfolio-sticky-left")).toBe("100px");
    expect(leaf("name").style.getPropertyValue("--portfolio-sticky-left")).toBe("176px");
    expect(leaf("qciProjectName").style.getPropertyValue("--portfolio-sticky-left")).toBe("391px");
    const handle = screen.getByRole("button", { name: "Resize Status column" });
    fireEvent.mouseDown(handle, { clientX: 50 });
    fireEvent.mouseMove(window, { clientX: 80 });
    expect(leaf("year").style.getPropertyValue("--portfolio-sticky-left")).toBe("130px");
    fireEvent.mouseUp(window);
    fireEvent.mouseMove(window, { clientX: 180 });
    expect(leaf("year").style.getPropertyValue("--portfolio-sticky-left")).toBe("130px");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(leaf("year").style.getPropertyValue("--portfolio-sticky-left")).toBe("120px");
    fireEvent.mouseDown(handle, { clientX: 50 });
    fireEvent.mouseMove(window, { clientX: -100 });
    expect(leaf("year").style.getPropertyValue("--portfolio-sticky-left")).toBe("92px");
    const removeListener = vi.spyOn(window, "removeEventListener");
    unmount();
    expect(removeListener).toHaveBeenCalledWith("mousemove", expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith("mouseup", expect.any(Function));
    removeListener.mockRestore();
  });

  // Mutation: removing the table schema or showing a misleading blank when filters return no rows.
  it("renders an explicit empty result across the currently visible 49 columns", () => {
    render(<PortfolioDashboardTable rows={[]} onOpenProject={() => {}} />);
    expect(screen.getByText("No projects match the current search and filters")).toHaveAttribute("colspan", "49");
  });
});
