import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./main";
import { canonicalProjectFixtures } from "./fixtures/v2/canonicalProjectFixtures";
import { canonicalScheduleFixtures } from "./fixtures/v2/canonicalScheduleFixtures";

afterEach(cleanup);
const error = "Project Remark must be 500 characters or fewer.";
function create(name: string, type: "new" | "regression", remark: string) {
  fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
  const dialog = screen.getByRole("dialog", { name: "Create Project" });
  expect(within(dialog).getByRole("textbox", { name: "Project Remark" })).toHaveValue("");
  for (const [label, value] of [["Year", "2030"], ["STN Project Name", name], ["Product Line", "dev-product-line-beta"], ["Project Type", type], ["Project Remark", remark]]) {
    fireEvent.change(within(dialog).getByLabelText(label!), { target: { value } });
  }
  const input = within(dialog).getByRole("textbox", { name: "Project Remark" });
  expect(input.tagName).toBe("TEXTAREA");
  expect(input).not.toBeRequired();
  expect(within(dialog).getByText(/500 characters/)).toBeVisible();
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  return dialog;
}
function detail() {
  fireEvent.click(screen.getByRole("button", { name: "View Project Master" }));
  return screen.getByRole("region", { name: "Project Master Detail" });
}

describe("Project Remark create and edit", () => {
  it.each([
    ["Remark blank", "new", " \n ", "\u2014"],
    ["Remark multiline", "new", "  Customer BIOS\nEVT sample only  ", "Customer BIOS\nEVT sample only"],
    [" manta ", "regression", "  Internal evaluation  ", "Internal evaluation"],
  ] as const)("creates %s with its optional Remark", (name, type, remark, saved) => {
    render(<App />);
    create(name, type, remark);
    expect(screen.queryByRole("dialog", { name: "Create Project" })).toBeNull();
    expect(within(detail()).getByLabelText("Project Remark").textContent).toBe(saved);
  });

  it("rejects 501 characters in Create, then accepts 500 after trimming", () => {
    render(<App />);
    const dialog = create("Remark limit", "new", "x".repeat(501));
    expect(within(dialog).getByText(error)).toBeVisible();
    const field = within(dialog).getByLabelText("Project Remark");
    expect(field).toHaveValue("x".repeat(501));
    fireEvent.change(field, { target: { value: " \n" + "x".repeat(500) + "  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(detail()).getByLabelText("Project Remark").textContent).toBe("x".repeat(500));
  });

  it("edits and clears Remark on an orphan Regression; invalid edits leave saved data intact", () => {
    const source = canonicalProjectFixtures[0]!;
    const project = { ...source, master: { ...source.master, basicInformation: {
      ...source.master.basicInformation, projectType: "regression" as const, remark: "Saved\nRemark",
    } } };
    const snapshot = structuredClone(project);
    render(<App initialState={{ projects: [project], schedules: canonicalScheduleFixtures }} initialSelectedProjectId={project.id} />);
    const view = detail();
    const click = (name: string) => fireEvent.click(within(view).getByRole("button", { name }));
    const change = (value: string) => fireEvent.change(within(view).getByLabelText("Project Remark"), { target: { value } });
    click("Edit Master");
    expect(within(view).getByLabelText("Project Remark")).toHaveValue("Saved\nRemark");
    change("x".repeat(501));
    click("Collapse Basic Information");
    click("Save Changes");
    expect(within(view).getByText(error)).toBeVisible();
    expect(within(view).getByLabelText("Project Remark")).toHaveValue("x".repeat(501));
    click("Cancel");
    expect(within(view).getByLabelText("Project Remark").textContent).toBe("Saved\nRemark");
    click("Edit Master");
    change("  Updated\nSecond line  ");
    click("Save Changes");
    expect(within(view).getByLabelText("Project Remark").textContent).toBe("Updated\nSecond line");
    expect(within(view).getByText("Project Type: Regression")).toBeVisible();
    click("Edit Master");
    change(" \n ");
    click("Save Changes");
    expect(within(view).getByLabelText("Project Remark")).toHaveTextContent("\u2014");
    expect(project).toEqual(snapshot);
  });
});


describe("legacy Remark isolation", () => {
  const legacyRemark = "User Trial demo seed: DEMO - G/O Due Soon";
  const source = canonicalProjectFixtures[0]!;
  const projectWithRemarks = (remark: string | null | undefined) => ({ ...source, master: { ...source.master,
    basicInformation: { ...source.master.basicInformation, remark }, other: { remark: legacyRemark } } });

  it.each([undefined, null])("keeps legacy metadata out of Detail and Edit when formal Remark is %s", remark => {
    const project = projectWithRemarks(remark);
    render(<App initialState={{ projects: [project], schedules: canonicalScheduleFixtures }} initialSelectedProjectId={project.id} />);
    const view = detail();
    expect(within(view).getByLabelText("Project Remark")).toHaveTextContent("\u2014");
    expect(screen.queryByText(legacyRemark)).not.toBeInTheDocument();
    fireEvent.click(within(view).getByRole("button", { name: "Edit Master" }));
    const input = within(view).getByRole("textbox", { name: "Project Remark" });
    expect(input).toHaveValue("");
    fireEvent.change(input, { target: { value: "Customer requested special BIOS" } });
    fireEvent.click(within(view).getByRole("button", { name: "Save Changes" }));
    expect(within(view).getByLabelText("Project Remark")).toHaveTextContent("Customer requested special BIOS");
    expect(screen.queryByText(legacyRemark)).not.toBeInTheDocument();
    fireEvent.click(within(view).getByRole("button", { name: "Edit Master" }));
    fireEvent.change(within(view).getByRole("textbox", { name: "Project Remark" }), { target: { value: "" } });
    fireEvent.click(within(view).getByRole("button", { name: "Save Changes" }));
    expect(within(view).getByLabelText("Project Remark")).toHaveTextContent("\u2014");
    expect(screen.queryByText(legacyRemark)).not.toBeInTheDocument();
  });

  it("starts a new Project Remark blank even when existing Projects contain both Remark fields", () => {
    render(<App initialState={{ projects: [projectWithRemarks("Existing PM note")], schedules: canonicalScheduleFixtures }} />);
    create("Fresh project without inherited notes", "new", "");
    const view = detail();
    expect(within(view).getByLabelText("Project Remark")).toHaveTextContent("\u2014");
    expect(screen.queryByText(legacyRemark)).not.toBeInTheDocument();
    expect(screen.queryByText("Existing PM note")).not.toBeInTheDocument();
  });
});
