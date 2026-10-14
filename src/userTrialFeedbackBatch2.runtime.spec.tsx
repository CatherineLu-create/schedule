import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { parseDateOnly, toLocalDateOnly } from "./domain/shared/dateOnly";
import { App } from "./main";
import { canonicalProjectFixtures } from "./fixtures/v2/canonicalProjectFixtures";
import { canonicalScheduleFixtures } from "./fixtures/v2/canonicalScheduleFixtures";
vi.mock("xlsx", async original => ({ ...await original<typeof import("xlsx")>(), writeFile: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });
function create(name: string, type: string) {
  fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
  const dialog = screen.getByRole("dialog", { name: "Create Project" });
  const field = (label: string, value: string) => fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
  field("Year", "2030"); field("STN Project Name", name);
  field("Product Line", "dev-product-line-beta"); field("Project Type", type);
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  return dialog;
}
function detail() {
  fireEvent.click(screen.getByRole("button", { name: "View Project Master" }));
  return screen.getByRole("region", { name: "Project Master Detail" });
}
describe("Feedback Batch 2 runtime", () => {
  it("does not reuse a New duplicate acknowledgment after returning to change the candidate", () => {
    render(<App />); create("Manta", "new");
    fireEvent.click(screen.getByRole("button", { name: "Back to form" }));
    const dialog = screen.getByRole("dialog", { name: "Create Project" });
    fireEvent.change(within(dialog).getByLabelText("STN Project Name"), { target: { value: "Unmatched changed candidate" } });
    fireEvent.change(within(dialog).getByLabelText("Project Type"), { target: { value: "regression" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText("Regression requires another Project with the same STN Project Name.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create Anyway" })).toBeNull();
  });
  it("requires explicit Type and blocks Regression without a counterpart", () => {
    render(<App />); const dialog = create("Unique feedback project", "");
    expect(within(dialog).getByText("Project Type is required.")).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText("Project Type"), { target: { value: "regression" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText("Regression requires another Project with the same STN Project Name.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create Anyway" })).toBeNull();
  });
  it.each([["Unique feedback project", "new", "New"], [" manta ", "regression", "Regression"]])("creates %s as %s", (name, type, label) => {
    render(<App />); create(name, type);
    expect(screen.queryByRole("dialog", { name: "Create Project" })).toBeNull();
    expect(within(detail()).getByText(`Project Type: ${label}`)).toBeVisible();
  });
  it("shows single-match identity immediately and preserves New through Create Anyway", () => {
    render(<App />); create("MANTA", "new");
    const matches = screen.getByRole("table", { name: "Matching Projects" });
    expect(within(matches).getAllByRole("columnheader").map(x => x.textContent)).toEqual(["Year", "Project Type", "STN Project Name", "QCI Model Name"]);
    expect(within(matches).getByText("Manta")).toBeVisible();
    expect(within(matches).getByText("\u2014")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Create Anyway" }));
    expect(within(detail()).getByText("Project Type: New")).toBeVisible();
  });
  it("keeps a blocked Detail edit open and Cancel preserves canonical data", () => {
    render(<App initialSelectedProjectId={canonicalProjectFixtures[0]!.id} />);
    const view = detail();
    expect(within(view).getByText("Project Type: \u2014")).toBeVisible();
    fireEvent.click(within(view).getByRole("button", { name: "Edit Master" }));
    fireEvent.change(within(view).getByLabelText("Project Type"), { target: { value: "regression" } });
    fireEvent.click(within(view).getByRole("button", { name: "Save Changes" }));
    expect(within(view).getByText("Regression requires another Project with the same STN Project Name.")).toBeVisible();
    expect(within(view).getByLabelText("Project Type")).toHaveValue("regression");
    fireEvent.click(within(view).getByRole("button", { name: "Cancel" }));
    expect(within(view).getByText("Project Type: \u2014")).toBeVisible();
  });
  it("projects Type after QCI, filters and exports the same rows with blank legacy values", () => {
    const projects = canonicalProjectFixtures.map((p, i) => i > 1 ? p : ({ ...p, master: { ...p.master, basicInformation: { ...p.master.basicInformation, projectType: i === 0 ? "new" as const : "regression" as const } } }));
    render(<App initialState={{ projects, schedules: canonicalScheduleFixtures }} />);
    const filter = screen.getByRole("combobox", { name: "Project Type" });
    expect(within(filter).getAllByRole("option").map(x => x.textContent)).toEqual(["All", "New", "Regression"]);
    const exported = () => {
      fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
      const book = vi.mocked(XLSX.writeFile).mock.calls.at(-1)![0];
      expect(book.SheetNames).toEqual(["All Projects"]);
      return XLSX.utils.sheet_to_json<string[]>(book.Sheets["All Projects"]!, { header: 1, defval: "" });
    };
    const all = exported(); expect(all).toHaveLength(6);
    expect(all[0]!.slice(3, 5)).toEqual(["QCI Model Name", "Project Type"]);
    expect(all.slice(1).map(x => x[4])).toEqual(["New", "Regression", "", "", ""]);
    fireEvent.change(filter, { target: { value: "Regression" } });
    expect(exported().slice(1).map(x => x[2])).toEqual(["Nautilus"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Manta" } });
    expect(exported()).toHaveLength(1);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(exported()).toHaveLength(6);
  });
});

it("uses local today at runtime, retains a future Actual Draft, then publishes a corrected value", () => {
 vi.useFakeTimers({ toFake: ["Date"] });
 // Local midnight on Oct 15 is still Oct 14 UTC in the User Trial timezone.
 vi.setSystemTime(new Date(2026, 9, 15, 0, 5));
 expect(toLocalDateOnly(new Date())).toBe("2026-10-15");
 const original = structuredClone(canonicalScheduleFixtures);
 render(<App initialSelectedProjectId={canonicalProjectFixtures[0]!.id} referenceDate={parseDateOnly("2020-01-01")!} />);
 fireEvent.click(screen.getByRole("button", { name: "Edit" }));
 const apply = (date: string) => {
  const input = screen.getByLabelText(/^Actual for Kickoff occurrence/);
  fireEvent.change(input, { target: { value: date } });
  fireEvent.click(screen.getByRole("button", { name: `Apply Date to ${input.getAttribute("aria-label")}` }));
 };
 apply("2026-10-16");
 expect(screen.getByLabelText(/^Actual for Kickoff occurrence/)).toHaveValue("2026-10-16");
 expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
 expect(screen.getByText("Actual date cannot be later than today.")).toBeVisible();
 expect(canonicalScheduleFixtures).toEqual(original);
 apply("2026-10-15");
 expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
 fireEvent.click(screen.getByRole("button", { name: "Publish" }));
 fireEvent.change(screen.getByLabelText("Publish Note"), { target: { value: "Local date validation" } });
 // Confirmation recomputes local today instead of using the preview/startup date.
 vi.setSystemTime(new Date(2026, 9, 14, 23, 59));
 fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" })).getByRole("button", { name: "Publish" }));
 expect(screen.getByRole("heading", { name: "Working Draft" })).toBeVisible();
 expect(screen.queryByText("Published v02")).toBeNull();
 vi.setSystemTime(new Date(2026, 9, 15, 0, 5));
 act(() => { window.dispatchEvent(new Event("focus")); });
 expect(screen.getByLabelText("Publish Note")).toHaveValue("Local date validation");
 fireEvent.click(within(screen.getByRole("dialog", { name: "Publish Working Draft" })).getByRole("button", { name: "Publish" }));
 expect(screen.getByText("Published v02")).toBeVisible();
});

it("refreshes publication readiness at local midnight without another edit", () => {
 vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 14, 23, 59));
 render(<App initialSelectedProjectId={canonicalProjectFixtures[0]!.id} />);
 fireEvent.click(screen.getByRole("button", { name: "Edit" }));
 const input = screen.getByLabelText(/^Actual for Kickoff occurrence/);
 fireEvent.change(input, { target: { value: "2026-10-15" } });
 fireEvent.click(screen.getByRole("button", { name: `Apply Date to ${input.getAttribute("aria-label")}` }));
 expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
 act(() => { vi.advanceTimersByTime(61000); });
 expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
});
