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
  category: "Canonical category", pcbNumber: "PCB-77", schedule: { kind: "noPublishedSchedule" },
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

  // Mutation: keeping only first/last repeated occurrence, conflating same labels, clearing N/A dates, or exposing MDRR.
  it("renders every stable-ID occurrence in snapshot order with dates and applicability", () => {
    const schedule: PortfolioCurrentPublishedRead = {
      kind: "published", versionLabel: "Published v03", milestoneCount: 4, cells: [
        { milestoneDefinitionId: toMilestoneDefinitionId("milestone-c2-c-g-o"), occurrences: [
          { milestoneId: toMilestoneId("later-id"), applicability: "notApplicable", plan: "2026/10/05", actual: "2026/10/06" },
          { milestoneId: toMilestoneId("earlier-id"), applicability: "applicable", plan: "-", actual: "-" },
        ] },
        { milestoneDefinitionId: toMilestoneDefinitionId("milestone-mdrr"), occurrences: [
          { milestoneId: toMilestoneId("hidden-mdrr"), applicability: "applicable", plan: "2099/01/01", actual: "2099/01/02" },
        ] },
      ],
    };
    const row = rowWith(schedule);
    const before = structuredClone(row);
    render(<PortfolioDashboardTable rows={[row]} onOpenProject={() => {}} />);
    const cell = leaf("schedule:c2-stage:c-g-o");
    expect(cell).toHaveAccessibleDescription("Published v03 · C G/O");
    expect([...cell.querySelectorAll('[data-milestone-id]')].map((element) => element.getAttribute("data-milestone-id"))).toEqual(["later-id", "earlier-id"]);
    expect(within(cell).getByText("Not applicable")).toBeInTheDocument();
    expect(within(cell).getByText("Applicable")).toBeInTheDocument();
    for (const value of ["P: 2026/10/05", "A: 2026/10/06", "P: —", "A: —"]) expect(within(cell).getByText(value)).toBeInTheDocument();
    expect(leaf("schedule:c1-stage:c-g-o")).toHaveTextContent(/^—$/);
    expect(leaf("schedule:mdrr:mdrr")).toHaveTextContent(/^—$/);
    expect(screen.queryByText(/2099/)).not.toBeInTheDocument();
    expect(row).toEqual(before);
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

  // Mutation: fabricating Team owners from any supplied Project field.
  it("renders seven honest Team placeholders", () => {
    render(<PortfolioDashboardTable rows={[baseRow]} onOpenProject={() => {}} />);
    const teamCells = [...renderedRow().querySelectorAll('td[data-domain="team"]')];
    expect(teamCells).toHaveLength(7);
    for (const cell of teamCells) expect(cell).toHaveTextContent(/^—$/);
    expect(screen.getByRole("columnheader", { name: "TEAM MEMBER" })).toHaveAccessibleDescription("Migration pending");
    expect(screen.queryByRole("button", { name: /Import Team Member/ })).not.toBeInTheDocument();
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
