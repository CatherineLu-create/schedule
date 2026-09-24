import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { selectDashboardProjectRow } from "./application/selectors/dashboardProjectRows";
import {
  selectProjectLeverageDisplay,
  selectProjectReferenceOptions,
} from "./application/selectors/projectReferenceOptions";
import type { PrototypeState } from "./application/state/prototypeState";
import { canonicalProjectFixtures } from "./fixtures/v2/canonicalProjectFixtures";
import { toProjectMasterForm } from "./projectMasterForm";
import { ProjectMasterDetail } from "./projectMasterDetail";

afterEach(cleanup);

const project = canonicalProjectFixtures[0]!;
const state: PrototypeState = { projects: canonicalProjectFixtures, schedules: [] };
const row = selectDashboardProjectRow(state, project.id)!;
const leverageDisplay = selectProjectLeverageDisplay(state, project.id)!;
const projectReferenceOptions = selectProjectReferenceOptions(state);

const readProps = {
  feedback: [],
  leverageDisplay,
  mode: "read" as const,
  onBack: vi.fn(),
  onBeginEdit: vi.fn(),
  project,
  projectReferenceOptions,
  row,
};

describe("ProjectMasterDetail", () => {
  it("uses the approved section order and transient default expansion state", () => {
    render(<ProjectMasterDetail {...readProps} />);

    expect(screen.getByRole("region", { name: "Project Master Detail" }))
      .toHaveClass("max-w-6xl");
    expect(screen.getAllByRole("heading", { level: 2 }).map(({ textContent }) => textContent))
      .toEqual(["Basic Information", "Mechanical", "Cover / Leverage"]);

    const basic = screen.getByRole("button", { name: "Collapse Basic Information" });
    const mechanical = screen.getByRole("button", { name: "Collapse Mechanical" });
    const cover = screen.getByRole("button", { name: "Collapse Cover / Leverage" });

    expect(basic).toHaveTextContent("−");
    expect(basic).toHaveAttribute("aria-expanded", "true");
    expect(mechanical).toHaveTextContent("−");
    expect(mechanical).toHaveAttribute("aria-expanded", "true");
    expect(cover).toHaveTextContent("−");
    expect(cover).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(`Project Name: ${row.projectName}`)).toBeVisible();
    expect(screen.getByRole("region", { name: "Mechanical" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Cover / Leverage" })).toBeVisible();
  });

  it("expands and collapses sections without persisting or changing canonical values", () => {
    render(<ProjectMasterDetail {...readProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Collapse Mechanical" }));
    expect(document.getElementById("project-master-mechanical-content")).not.toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Expand Mechanical" }));
    expect(screen.getByRole("button", { name: "Collapse Mechanical" }))
      .toHaveTextContent("−");
    expect(screen.getByRole("region", { name: "Mechanical" })).toBeVisible();
    expect(screen.getByText("Product Dimension")).toBeVisible();
  });

  it("keeps Back and Edit Master in read mode but omits Back during inline edit", () => {
    const onBack = vi.fn();
    const onBeginEdit = vi.fn();
    const { rerender } = render(
      <ProjectMasterDetail {...readProps} onBack={onBack} onBeginEdit={onBeginEdit} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Back to Project Workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Master" }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onBeginEdit).toHaveBeenCalledOnce();

    rerender(
      <ProjectMasterDetail
        fieldErrors={{}}
        form={toProjectMasterForm(project.master)}
        issues={[]}
        leverageDisplay={leverageDisplay}
        mode="edit"
        onCancel={() => {}}
        onChange={() => {}}
        onSave={() => {}}
        project={project}
        projectReferenceOptions={projectReferenceOptions}
        row={row}
      />,
    );

    expect(screen.queryByRole("button", { name: "Back to Project Workspace" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  it("automatically expands Mechanical when validation errors would otherwise be hidden", () => {
    render(
      <ProjectMasterDetail
        fieldErrors={{ productLengthMm: "Must be 0 or greater." }}
        form={{ ...toProjectMasterForm(project.master), productLengthMm: "-1" }}
        issues={[]}
        leverageDisplay={leverageDisplay}
        mode="edit"
        onCancel={() => {}}
        onChange={() => {}}
        onSave={() => {}}
        project={project}
        projectReferenceOptions={projectReferenceOptions}
        row={row}
      />,
    );

    expect(screen.getByRole("button", { name: "Collapse Mechanical" }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Must be 0 or greater.")).toBeVisible();
    expect(screen.getByLabelText("Product Length (mm)")).toHaveValue("-1");
  });

  it("omits Workspace Resources from Project Master Detail", () => {
    render(<ProjectMasterDetail {...readProps} />);

    expect(screen.queryByRole("heading", { name: "Resources" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Expand Resources" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Team Member" })).not.toBeInTheDocument();
  });
});
