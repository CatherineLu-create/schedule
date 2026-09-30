import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectReferenceOption } from "./application/selectors/projectReferenceOptions";
import type { CatalogItem } from "./domain/reference-data/catalog";
import {
  toCatalogItemId,
  toProjectId,
  type CatalogItemId,
  type ProjectId,
} from "./domain/shared/ids";
import type { CatalogSelection, ProjectSelection } from "./projectMasterForm";
import {
  ProjectCatalogSelect,
  ProjectReferencePicker,
  ProjectSelfServiceCatalogSelect,
} from "./projectMasterControls";

afterEach(cleanup);

const catalogOptions: readonly CatalogItem<CatalogItemId>[] = [
  {
    id: toCatalogItemId("catalog-existing"),
    displayName: "Existing Option",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
];

describe("Project self-service catalog select", () => {
  it("keeps governed catalog selects free of Add New behavior", () => {
    render(
      <ProjectCatalogSelect
        emptyLabel="Select Customer"
        label="Customer"
        onChange={() => {}}
        options={catalogOptions}
        value=""
      />,
    );

    expect(screen.queryByRole("button", { name: /add new/i })).not.toBeInTheDocument();
  });

  it("opens and cancels the inline editor without changing the selection", () => {
    const onChange = vi.fn<(value: CatalogSelection) => void>();
    render(
      <ProjectSelfServiceCatalogSelect
        emptyLabel="Select CPU"
        label="CPU"
        onAddOption={() => ({ ok: true, id: toCatalogItemId("unused") })}
        onChange={onChange}
        options={catalogOptions}
        value={catalogOptions[0]!.id}
      />,
    );

    const addNew = screen.getByRole("button", { name: "Add new CPU" });
    fireEvent.click(addNew);
    const input = screen.getByRole("textbox", { name: "New CPU" });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "Canceled CPU" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel adding CPU" }));

    expect(screen.queryByRole("textbox", { name: "New CPU" })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(addNew).toHaveFocus();
  });

  it("keeps invalid Add input open and preserves the current selection", () => {
    const onChange = vi.fn<(value: CatalogSelection) => void>();
    const onAddOption = vi.fn(() => ({
      ok: false as const,
      message: "This catalog option already exists.",
    }));
    render(
      <ProjectSelfServiceCatalogSelect
        emptyLabel="Select GPU"
        label="GPU"
        onAddOption={onAddOption}
        onChange={onChange}
        options={catalogOptions}
        value={catalogOptions[0]!.id}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add new GPU" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New GPU" }), {
      target: { value: "existing option" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add GPU option" }));

    expect(onAddOption).toHaveBeenCalledWith("existing option");
    expect(screen.getByText("This catalog option already exists.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "New GPU" })).toHaveValue("existing option");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("automatically selects a successful addition and closes the editor", () => {
    const onChange = vi.fn<(value: CatalogSelection) => void>();
    const runtimeId = toCatalogItemId("runtime-panel-size");
    render(
      <ProjectSelfServiceCatalogSelect
        emptyLabel="Select Panel Size"
        label="Panel Size"
        onAddOption={() => ({ ok: true, id: runtimeId })}
        onChange={onChange}
        options={catalogOptions}
        value=""
      />,
    );

    const addNew = screen.getByRole("button", { name: "Add new Panel Size" });
    fireEvent.click(addNew);
    fireEvent.change(screen.getByRole("textbox", { name: "New Panel Size" }), {
      target: { value: "14 inch" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Panel Size option" }));

    expect(onChange).toHaveBeenCalledWith(runtimeId);
    expect(screen.queryByRole("textbox", { name: "New Panel Size" })).not.toBeInTheDocument();
    expect(addNew).toHaveFocus();
  });
});

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
