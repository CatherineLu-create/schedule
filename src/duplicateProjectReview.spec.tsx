import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DashboardProjectRow } from "./application/selectors/dashboardProjectRows";
import type { DuplicateProjectDecisionRequest } from "./application/workflow/workflowInterpretation";
import { toProjectId } from "./domain/shared/ids";
import { DuplicateProjectReview } from "./duplicateProjectReview";

afterEach(cleanup);

function projectRow(
  id: string,
  projectName: string,
  qciModelName: string,
): DashboardProjectRow {
  return {
    projectId: toProjectId(id),
    year: "2027",
    customer: "Acer",
    productLine: "DEV Line Alpha",
    projectName,
    qciModelName,
    acerModelName: "-",
    acerMarketingName: "-",
    panelSize: '16"',
    cpu: "DEV CPU Alpha",
    gpu: "DEV GPU Alpha",
    ssid: "-",
    rmn: "-",
    projectStatus: "RFQ",
    currentStage: "-",
    mdrr: "-",
  };
}

function duplicateDecision(rows: readonly DashboardProjectRow[]): DuplicateProjectDecisionRequest {
  return {
    kind: "duplicateProject",
    matchingProjectIds: rows.map((row) => row.projectId),
    issues: [],
    actions: [
      { id: "reviewExisting", direction: "backward" },
      { id: "createAnyway", direction: "forward" },
    ],
  };
}

describe("DuplicateProjectReview", () => {
  it("opens the sole resolvable Project when Review Existing is chosen", () => {
    const row = projectRow("one-project", "Only Project", "ONLY-QCI");
    const onSelectProject = vi.fn();

    render(
      <DuplicateProjectReview
        decision={duplicateDecision([row])}
        matchingRows={[row]}
        onBackToForm={vi.fn()}
        onCreateAnyway={vi.fn()}
        onSelectProject={onSelectProject}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review Existing" }));

    expect(onSelectProject).toHaveBeenCalledExactlyOnceWith(row.projectId);
    expect(screen.queryByRole("button", { name: /Only Project/ })).not.toBeInTheDocument();
  });

  it("shows every resolvable match and waits for an explicit ProjectId choice", () => {
    const first = projectRow("first-project", "Shared Name", "FIRST-QCI");
    const second = projectRow("second-project", "Shared Name", "SECOND-QCI");
    const onSelectProject = vi.fn();

    render(
      <DuplicateProjectReview
        decision={duplicateDecision([first, second])}
        matchingRows={[first, second]}
        onBackToForm={vi.fn()}
        onCreateAnyway={vi.fn()}
        onSelectProject={onSelectProject}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review Existing" }));

    expect(onSelectProject).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /FIRST-QCI/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /SECOND-QCI/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /SECOND-QCI/ }));

    expect(onSelectProject).toHaveBeenCalledExactlyOnceWith(second.projectId);
  });

  it("keeps Back to form and Create Anyway actionable when no match resolves", () => {
    const onBackToForm = vi.fn();
    const onCreateAnyway = vi.fn();
    const onSelectProject = vi.fn();

    render(
      <DuplicateProjectReview
        decision={duplicateDecision([])}
        matchingRows={[]}
        onBackToForm={onBackToForm}
        onCreateAnyway={onCreateAnyway}
        onSelectProject={onSelectProject}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review Existing" }));

    expect(screen.getByText("No matching Projects are currently available.")).toBeInTheDocument();
    expect(onSelectProject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Back to form" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Anyway" }));

    expect(onBackToForm).toHaveBeenCalledTimes(1);
    expect(onCreateAnyway).toHaveBeenCalledTimes(1);
  });
});
