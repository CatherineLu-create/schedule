import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectReferenceOption } from "./application/selectors/projectReferenceOptions";
import { toProjectId, type ProjectId } from "./domain/shared/ids";
import type { ProjectSelection } from "./projectMasterForm";
import { ProjectReferencePicker } from "./projectMasterControls";

afterEach(cleanup);

const currentProjectId = toProjectId("project-current");
const firstProjectId = toProjectId("project-first");
const secondProjectId = toProjectId("project-second");

const options: readonly ProjectReferenceOption[] = [
  {
    projectId: currentProjectId,
    year: 2026,
    stnProjectName: "Current Project",
    qciModelName: "CURRENT-QCI",
    displayLabel: "2026 | Current Project | CURRENT-QCI",
    searchText: "2026 current project current-qci",
  },
  {
    projectId: firstProjectId,
    year: 2027,
    stnProjectName: "Shared Name",
    qciModelName: "QCI-A",
    displayLabel: "2027 | Shared Name | QCI-A",
    searchText: "2027 shared name qci-a",
  },
  {
    projectId: secondProjectId,
    year: 2028,
    stnProjectName: "Shared Name",
    qciModelName: "QCI-B",
    displayLabel: "2028 | Shared Name | QCI-B",
    searchText: "2028 shared name qci-b",
  },
];

function ControlledPicker({ initialValue = "" }: { readonly initialValue?: ProjectSelection }) {
  const [value, setValue] = React.useState<ProjectSelection>(initialValue);
  return (
    <ProjectReferencePicker
      currentProjectId={currentProjectId}
      label="PCB Leverage Project"
      onChange={setValue}
      options={options}
      value={value}
    />
  );
}

describe("ProjectReferencePicker", () => {
  it("keeps search and options hidden until its single persistent trigger opens", () => {
    render(<ControlledPicker />);

    const trigger = screen.getByRole("button", { name: /PCB Leverage Project/ });
    expect(trigger).toHaveTextContent("Not specified");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("combobox", { name: "Search PCB Leverage Project" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("combobox", { name: "Search PCB Leverage Project" }))
      .toHaveFocus();
    const listbox = screen.getByRole("listbox", { name: "PCB Leverage Project options" });
    expect(listbox).toBeInTheDocument();
    expect(listbox.parentElement).not.toHaveClass("absolute");
  });

  it("searches canonical identity fields and selects the exact duplicate-name ProjectId", () => {
    const onChange = vi.fn<(value: ProjectSelection) => void>();
    render(
      <ProjectReferencePicker
        currentProjectId={currentProjectId}
        label="A Cover Leverage Project"
        onChange={onChange}
        options={options}
        value=""
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /A Cover Leverage Project/ }));
    const search = screen.getByRole("combobox", { name: "Search A Cover Leverage Project" });
    fireEvent.change(search, { target: { value: "2028 qci-b" } });

    const listbox = screen.getByRole("listbox", { name: "A Cover Leverage Project options" });
    expect(within(listbox).queryByText("2027 | Shared Name | QCI-A")).not.toBeInTheDocument();
    fireEvent.click(within(listbox).getByRole("option", {
      name: "2028 | Shared Name | QCI-B",
    }));

    expect(onChange).toHaveBeenCalledWith(secondProjectId);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports Current Project (New Design), clearing to null, and dangling display", () => {
    const { rerender } = render(<ControlledPicker initialValue={currentProjectId} />);

    expect(screen.getByRole("button", { name: /PCB Leverage Project/ })).toHaveTextContent(
      "Current Project (New Design) · 2026 | Current Project | CURRENT-QCI",
    );

    fireEvent.click(screen.getByRole("button", { name: /PCB Leverage Project/ }));
    fireEvent.click(screen.getByRole("option", { name: "Not specified" }));
    expect(screen.getByRole("button", { name: /PCB Leverage Project/ }))
      .toHaveTextContent("Not specified");

    const danglingId = toProjectId("missing-project");
    rerender(<ControlledPicker key="dangling" initialValue={danglingId} />);
    expect(screen.getByRole("button", { name: /PCB Leverage Project/ }))
      .toHaveTextContent("Unavailable Project");
    expect(screen.queryByText(danglingId)).not.toBeInTheDocument();
  });

  it("moves through options with the keyboard, selects with Enter, and closes with Escape", () => {
    const onChange = vi.fn<(value: ProjectSelection) => void>();
    render(
      <ProjectReferencePicker
        currentProjectId={currentProjectId}
        label="D Cover Leverage Project"
        onChange={onChange}
        options={options}
        value=""
      />,
    );

    const trigger = screen.getByRole("button", { name: /D Cover Leverage Project/ });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const search = screen.getByRole("combobox", { name: "Search D Cover Leverage Project" });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(currentProjectId);
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Search D Cover Leverage Project" }),
      { key: "Escape" },
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
