import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { App } from "./main";

vi.mock("xlsx", async importOriginal => ({ ...await importOriginal<typeof import("xlsx")>(), writeFile: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const identity = ["Year", "STN Project Name", "QCI Model Name"];
const master = ["Acer Model Name", "Acer Marketing Name", "Customer", "Category", "Product Line", "Panel Size", "CPU", "GPU", "PCB#", "SSID", "RMN", "Project Status"];
const mechanical = ["Product Length (mm)", "Product Width (mm)", "Product Height (mm)", "Product Weight (g)", "Package Length (mm)", "Package Width (mm)", "Package Height (mm)", "Gross Weight (g)"];
const cover = ["PCB Leverage Project", "A Cover Material", "A Cover Leverage Project", "B Cover Material", "B Cover Leverage Project", "C Cover Material", "C Cover Leverage Project", "D Cover Material", "D Cover Leverage Project"];
const headers = [...identity, ...master, ...mechanical, ...cover];
const enter = () => fireEvent.click(screen.getByRole("button", { name: "Reports" }));
const reportTable = () => screen.getByRole("table", { name: "Project Master Report" });
const tableHeaders = () => within(reportTable()).getAllByRole("columnheader").map(cell => cell.textContent);
const visibleNames = () => [...screen.getByRole("table").querySelectorAll("tbody tr[data-project-id]")].map(row => row.querySelector('[data-column-key="stnProjectName"], [data-column-key="name"]')?.textContent);
function exportedGrid() {
  fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
  const [book, filename] = vi.mocked(XLSX.writeFile).mock.calls.at(-1)!;
  expect(filename).toMatch(/^PIP_Project_Master_Report_\d{8}\.xlsx$/);
  expect(book.SheetNames).toEqual(["Project Master Report"]);
  const sheet = book.Sheets[book.SheetNames[0]];
  expect(sheet["!autofilter"]).toEqual({ ref: sheet["!ref"] });
  expect(sheet["!merges"]).toBeUndefined();
  expect(sheet["!freeze"]).toBeUndefined();
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" });
  const parsed = XLSX.read(bytes, { type: "array" });
  expect(parsed.Sheets[parsed.SheetNames[0]]["!autofilter"]).toEqual({ ref: sheet["!ref"] });
  return XLSX.utils.sheet_to_json<string[]>(parsed.Sheets[parsed.SheetNames[0]], { header: 1, defval: "" });
}

describe("RPT-01 Reports runtime", () => {
  it("opens directly with default groups, correct navigation and Chinese Governance unchanged", () => {
    render(<App />);
    const nav = screen.getByRole("navigation", { name: "PIP navigation" });
    expect(within(nav).getAllByRole("button").map(button => button.textContent)).toEqual(["Reports", "Governance"]);
    enter();
    expect(screen.getByRole("heading", { name: "Project Master Report" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("");
    screen.getAllByRole("combobox").forEach(control => expect(control).toHaveValue(""));
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    screen.getAllByRole("checkbox").forEach(control => expect(control).toBeChecked());
    expect(tableHeaders()).toEqual(headers);
    expect(screen.getByText("5 Projects")).toBeInTheDocument();
    expect(visibleNames()).toEqual(["Manta", "Nautilus", "Orca", "Beluga", "Marlin"]);
    expect(exportedGrid()[0]).toEqual(headers);
    fireEvent.click(screen.getByRole("button", { name: "Back to Dashboard" }));
    expect(screen.getByRole("table", { name: "Projects" })).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("button", { name: "Governance" }));
    expect(screen.getByRole("heading", { name: "公版管理" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "回到 Dashboard" }));
    expect(screen.getByRole("table", { name: "Projects" })).toBeInTheDocument();
  });

  it("resets on each entry, shares Dashboard filtering semantics, and exports zero matches", () => {
    render(<App />);
    fireEvent.change(screen.getByRole("combobox", { name: "Product Line" }), { target: { value: "Aspire (Refresh ID)" } });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  MANTA " } });
    const dashboardNames = visibleNames();
    enter();
    expect(visibleNames()).toHaveLength(5);
    fireEvent.change(screen.getByRole("combobox", { name: "Product Line" }), { target: { value: "Aspire (Refresh ID)" } });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  MANTA " } });
    expect(visibleNames()).toEqual(dashboardNames);
    expect(screen.getByText("1 Project")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Nautilus" } });
    expect(screen.getByText("No projects found")).toBeInTheDocument();
    expect(screen.getByText("0 Projects")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export to Excel" })).toBeEnabled();
    expect(exportedGrid()).toEqual([headers]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Mechanical" }));
    enter();
    expect(screen.getByRole("searchbox")).toHaveValue("");
    screen.getAllByRole("combobox").forEach(control => expect(control).toHaveValue(""));
    screen.getAllByRole("checkbox").forEach(control => expect(control).toBeChecked());
    fireEvent.click(screen.getByRole("button", { name: "Governance" }));
    enter();
    expect(visibleNames()).toHaveLength(5);
  });

  it("removes each complete group from preview and workbook; disables export only with no groups", () => {
    render(<App />); enter();
    const groups = [{ name: "Project Master", columns: master }, { name: "Mechanical", columns: mechanical }, { name: "Cover & Leverage", columns: cover }];
    for (const group of groups) {
      fireEvent.click(screen.getByRole("checkbox", { name: group.name }));
      const expected = headers.filter(header => !group.columns.includes(header));
      expect(tableHeaders()).toEqual(expected);
      const output = exportedGrid();
      expect(output[0]).toEqual(expected);
      const viewport = screen.getByRole("region", { name: "Project Master Report table" });
      viewport.scrollLeft = 1800;
      fireEvent.scroll(viewport);
      expect(exportedGrid()).toEqual(output);
      fireEvent.click(screen.getByRole("checkbox", { name: group.name }));
    }
    for (const checkbox of screen.getAllByRole("checkbox")) fireEvent.click(checkbox);
    expect(tableHeaders()).toEqual(identity);
    expect(screen.getByRole("button", { name: "Export to Excel" })).toBeDisabled();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no matching project" } });
    expect(screen.getByRole("button", { name: "Export to Excel" })).toBeDisabled();
  });
});
