import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveProjectTeamForState } from "./application/commands/teamSaveState";
import { teamFunctionCatalog } from "./config/v2/referenceData";
import type { Project } from "./domain/project/project";
import {
  toPersonAssignmentId,
  toTeamFunctionId,
  type PersonAssignmentId,
  type TeamFunctionId,
} from "./domain/shared/ids";
import type { ProjectTeam, TeamSourceRow } from "./domain/team/team";
import type { ValidationIssue } from "./domain/validation/validationIssue";
import { devProject002 } from "./fixtures/v2/canonicalProjectFixtures";
import { App } from "./main";
import {
  TeamMemberWorkspace,
  type TeamMemberWorkspaceProps,
} from "./teamMemberWorkspace";

afterEach(cleanup);

const sourceEvidence: TeamSourceRow = {
  fileName: "team.xlsx",
  sheetName: "Team",
  rowNumber: 8,
  cells: [{
    columnIndex: 4,
    headerText: "Tel",
    rawType: "s",
    rawValue: "1234",
    formattedText: "1234",
    hidden: true,
  }],
};

function projectWithTeam(team: ProjectTeam | null): Project {
  return { ...devProject002, team };
}

function successfulSave(project: Project): TeamMemberWorkspaceProps["onSave"] {
  return (projectId, candidate) => saveProjectTeamForState(
    { projects: [project], schedules: [] },
    projectId,
    candidate,
    teamFunctionCatalog,
  );
}

function renderWorkspace({
  project = devProject002,
  onBack = vi.fn(),
  onSave = successfulSave(project),
  assignmentIds = ["new-assignment-1", "new-assignment-2"],
  functionIds = ["new-function-1", "new-function-2"],
}: {
  readonly project?: Project;
  readonly onBack?: () => void;
  readonly onSave?: TeamMemberWorkspaceProps["onSave"];
  readonly assignmentIds?: readonly string[];
  readonly functionIds?: readonly string[];
} = {}) {
  let assignmentIndex = 0;
  let functionIndex = 0;
  const createAssignmentId = vi.fn((): PersonAssignmentId =>
    toPersonAssignmentId(assignmentIds[assignmentIndex++] ?? `new-assignment-${assignmentIndex}`));
  const createFunctionId = vi.fn((): TeamFunctionId =>
    toTeamFunctionId(functionIds[functionIndex++] ?? `new-function-${functionIndex}`));
  const view = render(
    <TeamMemberWorkspace
      createAssignmentId={createAssignmentId}
      createFunctionId={createFunctionId}
      onBack={onBack}
      onSave={onSave}
      project={project}
      standardFunctionDefinitions={teamFunctionCatalog}
    />,
  );
  return { ...view, createAssignmentId, createFunctionId, onBack, onSave };
}

function startEditing(): void {
  fireEvent.click(screen.getByRole("button", { name: "Edit Team" }));
  expect(screen.getByRole("heading", { name: "Edit Team" })).toBeInTheDocument();
}

function onePersonTeam(overrides: Partial<ProjectTeam> = {}): ProjectTeam {
  return {
    projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
    functions: [{
      function: { kind: "standard", functionId: teamFunctionCatalog[0]!.id },
      applicability: "applicable",
      assignments: [{
        assignmentId: toPersonAssignmentId("one-person"),
        role: "member",
        name: "One Person",
        email: "one@example.test",
        extraCells: sourceEvidence.cells,
        sourceRows: [sourceEvidence],
      }],
    }],
    preservedUnclassifiedEntries: [],
    appliedTemplate: null,
    ...overrides,
  };
}

describe("Team Member workspace", () => {
  it("opens the selected Project saved Team read-only from Resources", () => {
    render(<App initialSelectedProjectId={devProject002.id} />);
    const openTeam = screen.getByRole("button", { name: "Open Team Member" });
    expect(openTeam).toBeEnabled();
    fireEvent.click(openTeam);
    expect(screen.getByRole("heading", { name: "Team Member" })).toBeInTheDocument();
    expect(screen.getByText("DEV QCI PM")).toBeInTheDocument();
    expect(screen.getByText("QCI-ME")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Current Schedule" })).not.toBeInTheDocument();
  });

  it("shows null Team as an empty state and renders preserved rows once", () => {
    const { rerender } = renderWorkspace({ project: projectWithTeam(null) });
    expect(screen.getByText("No Team members saved.")).toBeInTheDocument();
    const preservedTeam: ProjectTeam = {
      ...onePersonTeam(),
      functions: [],
      preservedUnclassifiedEntries: [{
        entryId: toPersonAssignmentId("preserved-one"),
        function: { kind: "custom", functionId: toTeamFunctionId("custom-qcmc"), displayName: "QCMC" },
        functionText: "QCMC",
        roleText: "Coordinator",
        name: "Preserved Person",
        email: "preserved@example.test",
        extraCells: sourceEvidence.cells,
        sourceRows: [sourceEvidence],
        restrictedRoleExclusion: null,
      }],
    };
    rerender(
      <TeamMemberWorkspace
        createAssignmentId={() => toPersonAssignmentId("unused")}
        createFunctionId={() => toTeamFunctionId("unused")}
        onBack={() => undefined}
        onSave={successfulSave(projectWithTeam(preservedTeam))}
        project={projectWithTeam(preservedTeam)}
        standardFunctionDefinitions={teamFunctionCatalog}
      />,
    );
    expect(screen.getAllByText("Preserved Person")).toHaveLength(1);
    expect(screen.getByText("QCMC")).toBeInTheDocument();
  });

  it("keeps edits local, uses rowId keys, and allocates separate IDs only on Add/new custom actions", () => {
    const before = JSON.stringify(devProject002.team);
    const onSave = vi.fn(successfulSave(devProject002));
    const { createAssignmentId, createFunctionId } = renderWorkspace({ onSave });
    startEditing();
    const rowsBefore = screen.getAllByTestId("team-candidate-row");
    expect(rowsBefore.every((row) => row.dataset.rowId?.startsWith("manual::"))).toBe(true);
    expect(createAssignmentId).not.toHaveBeenCalled();
    expect(createFunctionId).not.toHaveBeenCalled();
    const meName = screen.getByDisplayValue("DEV ME Owner");
    const meRow = meName.closest<HTMLElement>('[data-testid="team-candidate-row"]')!;
    fireEvent.change(within(meRow).getByLabelText("Function"), {
      target: { value: teamFunctionCatalog[1]!.id },
    });
    expect(within(meRow).getByLabelText("Function")).toHaveValue(teamFunctionCatalog[1]!.id);
    expect(screen.queryByRole("button", { name: "Confirm noncritical role" })).not.toBeInTheDocument();
    fireEvent.change(meName, { target: { value: "Edited ME Owner" } });
    fireEvent.change(screen.getByDisplayValue("dev.me.owner@example.test"), { target: { value: "edited.me@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Add person" }));
    expect(createAssignmentId).toHaveBeenCalledTimes(1);
    const added = screen.getByTestId("team-candidate-row-new-assignment-1");
    expect(added).toHaveAttribute("data-assignment-id", "new-assignment-1");
    expect(added).toHaveAttribute("data-row-id", "manual::new-assignment-1");
    fireEvent.change(within(added).getByLabelText("Function"), { target: { value: "__new_custom__" } });
    fireEvent.change(within(added).getByLabelText("New custom Function name"), { target: { value: "QCMC" } });
    fireEvent.click(within(added).getByRole("button", { name: "Create custom Function" }));
    expect(createFunctionId).toHaveBeenCalledTimes(1);
    fireEvent.click(within(added).getByRole("button", { name: "Remove person" }));
    expect(JSON.stringify(devProject002.team)).toBe(before);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save Team" })).toHaveAttribute("data-action-side", "right");
    expect(screen.getByRole("button", { name: "Cancel" }).parentElement).toHaveAttribute("data-action-side", "left");
  });

  it("shows row-targeted Blocking and one grouped Advisory summary, then explicitly fixes N/A locally", () => {
    const team = onePersonTeam({
      functions: [{
        function: { kind: "standard", functionId: teamFunctionCatalog[0]!.id },
        applicability: "notApplicable",
        assignments: [{ assignmentId: toPersonAssignmentId("n-a-person"), role: "member", name: "N/A Person", email: null }],
      }],
    });
    const project = projectWithTeam(team);
    const onSave = vi.fn(successfulSave(project));
    renderWorkspace({ project, onSave });
    startEditing();
    const blocking = screen.getByRole("region", { name: "Blocking issues" });
    expect(within(blocking).getByText(/Not Applicable Function/)).toBeInTheDocument();
    expect(within(blocking).getByRole("link")).toHaveAttribute("href", expect.stringMatching(/^#team-row-/));
    const advisories = screen.getByRole("region", { name: "Advisories" });
    expect(within(advisories).getByText(/Person has a name but no email address/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Team" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Mark Applicable" }));
    expect(screen.queryByText(/Not Applicable Function cannot contain assignments/)).not.toBeInTheDocument();
    expect(project.team?.functions[0]?.applicability).toBe("notApplicable");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		fireEvent.click(within(screen.getByRole("dialog", { name: "Discard unsaved Team edits" })).getByRole("button", { name: "Discard changes" }));
    expect(screen.getByText("Not Applicable")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

	it("does not create a broken row link for Function-level or aggregate issues", () => {
		const functionIssue: ValidationIssue = {
			code: "team.data.function-level",
			domain: "team",
			source: "data",
			severity: "blocking",
			message: "Function-level conflict.",
			target: { section: "team.function", entityId: teamFunctionCatalog[0]!.id },
		};
		const aggregateIssue: ValidationIssue = {
			code: "team.data.aggregate-advisory",
			domain: "team",
			source: "data",
			severity: "advisory",
			message: "Aggregate Team advisory.",
			target: { section: "team" },
		};
		const onSave = vi.fn(() => ({
			ok: false as const,
			reason: "projectMismatch" as const,
			issues: [functionIssue, aggregateIssue],
		}));
		renderWorkspace({ project: projectWithTeam(onePersonTeam()), onSave });
		startEditing();
		fireEvent.click(screen.getByRole("button", { name: "Save Team" }));

		const blocking = screen.getByRole("region", { name: "Blocking issues" });
		expect(within(blocking).getByText("Function-level conflict.")).toBeInTheDocument();
		expect(within(blocking).queryByRole("link")).not.toBeInTheDocument();
		const advisories = screen.getByRole("region", { name: "Advisories" });
		expect(within(advisories).getByText("Aggregate Team advisory.")).toBeInTheDocument();
		expect(within(advisories).queryByRole("link")).not.toBeInTheDocument();
	});

  it("requires a separate manual-clear confirmation and keeps the edit when clear is cancelled", () => {
    const project = projectWithTeam(onePersonTeam());
    const onSave = vi.fn(successfulSave(project));
    renderWorkspace({ project, onSave });
    startEditing();
    fireEvent.click(screen.getByRole("button", { name: "Remove person" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm manual clear" });
    expect(screen.queryByText(/whole replace/i)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel clear" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Edit Team" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm clear" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("submits an actually empty roster when manual clear confirms blank placeholder rows", () => {
    const project = projectWithTeam(null);
    const onSave = vi.fn(successfulSave(project));
    renderWorkspace({ project, onSave });
    startEditing();
    fireEvent.click(screen.getByRole("button", { name: "Add person" }));
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "owner" } });

    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm clear" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![1].rows).toEqual([]);
    const result = onSave.mock.results[0]!.value as ReturnType<TeamMemberWorkspaceProps["onSave"]>;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.team?.functions.flatMap(({ assignments }) => assignments)).toEqual([]);
  });

  it("does not submit blank placeholder rows alongside populated people", () => {
    const baseTeam = onePersonTeam();
    const project = projectWithTeam({
      ...baseTeam,
      functions: [{
        ...baseTeam.functions[0]!,
        assignments: [{ ...baseTeam.functions[0]!.assignments[0]!, role: "owner" }],
      }],
    });
    const onSave = vi.fn(successfulSave(project));
    renderWorkspace({ project, onSave });
    startEditing();
    fireEvent.click(screen.getByRole("button", { name: "Add person" }));
    const rows = screen.getAllByTestId("team-candidate-row");
    fireEvent.change(within(rows[1]!).getByLabelText("Role"), { target: { value: "owner" } });

    expect(screen.getByRole("button", { name: "Save Team" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![1].rows).toHaveLength(1);
    const result = onSave.mock.results[0]!.value as ReturnType<TeamMemberWorkspaceProps["onSave"]>;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.team?.functions.flatMap(({ assignments }) => assignments)).toHaveLength(1);
  });

  it("guards Back, preserves the candidate on Stay, and discards without Save", () => {
    const onBack = vi.fn();
    const onSave = vi.fn(successfulSave(devProject002));
    renderWorkspace({ onBack, onSave });
    startEditing();
    fireEvent.change(screen.getByDisplayValue("DEV ME Owner"), { target: { value: "Unsaved name" } });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    const dialog = screen.getByRole("dialog", { name: "Discard unsaved Team edits" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Stay" }));
    expect(screen.getByDisplayValue("Unsaved name")).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard & Leave" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

	it("guards dirty Cancel but lets clean Cancel and clean Back exit directly", () => {
		const onBack = vi.fn();
		const onSave = vi.fn(successfulSave(devProject002));
		renderWorkspace({ onBack, onSave });
		startEditing();
		fireEvent.change(screen.getByDisplayValue("DEV ME Owner"), { target: { value: "Dirty Cancel name" } });
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		let dialog = screen.getByRole("dialog", { name: "Discard unsaved Team edits" });
		fireEvent.click(within(dialog).getByRole("button", { name: "Stay" }));
		expect(screen.getByDisplayValue("Dirty Cancel name")).toBeInTheDocument();
		expect(onBack).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		dialog = screen.getByRole("dialog", { name: "Discard unsaved Team edits" });
		fireEvent.click(within(dialog).getByRole("button", { name: "Discard changes" }));
		expect(screen.getByRole("heading", { name: "Team Member" })).toBeInTheDocument();
		expect(screen.queryByText("Dirty Cancel name")).not.toBeInTheDocument();
		expect(onSave).not.toHaveBeenCalled();

		startEditing();
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(screen.queryByRole("dialog", { name: "Discard unsaved Team edits" })).not.toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Team Member" })).toBeInTheDocument();

		startEditing();
		fireEvent.click(screen.getByRole("button", { name: "Back" }));
		expect(screen.queryByRole("dialog", { name: "Discard unsaved Team edits" })).not.toBeInTheDocument();
		expect(onBack).toHaveBeenCalledTimes(1);
	});

  it("offers explicit noncritical confirmation only for a possible restricted row", () => {
    const team: ProjectTeam = {
      ...onePersonTeam(),
      functions: [],
      preservedUnclassifiedEntries: [{
        entryId: toPersonAssignmentId("possible-row"),
        function: { kind: "custom", functionId: toTeamFunctionId("custom-role"), displayName: "QCI PM backup Owner" },
        functionText: "QCI PM backup Owner",
        roleText: "backup",
        name: "Possible Person",
        email: "possible@example.test",
        extraCells: [],
        sourceRows: [sourceEvidence],
        restrictedRoleExclusion: null,
      }],
    };
    renderWorkspace({ project: projectWithTeam(team) });
    startEditing();
    const row = screen.getByTestId("team-candidate-row-possible-row");
    expect(within(row).getByRole("button", { name: "Confirm noncritical role" })).toBeEnabled();
    fireEvent.click(within(row).getByRole("button", { name: "Confirm noncritical role" }));
    expect(within(row).getByDisplayValue("backup")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Confirm noncritical role" })).not.toBeInTheDocument();
  });

  it("moves a corrected preserved row into one formal assignment with source evidence intact", () => {
    const team: ProjectTeam = {
      ...onePersonTeam(),
      functions: [],
      preservedUnclassifiedEntries: [{
        entryId: toPersonAssignmentId("preserved-corrected"),
        function: { kind: "custom", functionId: toTeamFunctionId("custom-qcmc"), displayName: "QCMC" },
        functionText: "QCMC source",
        roleText: "Coordinator",
        name: "Corrected Person",
        email: "corrected@example.test",
        extraCells: sourceEvidence.cells,
        sourceRows: [sourceEvidence],
        restrictedRoleExclusion: null,
      }],
    };
    const project = projectWithTeam(team);
    const onSave = vi.fn(successfulSave(project));
    renderWorkspace({ project, onSave });
    startEditing();
    fireEvent.change(screen.getByDisplayValue("Coordinator"), { target: { value: "member" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
    const result = onSave.mock.results[0]!.value;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.team?.preservedUnclassifiedEntries).toHaveLength(0);
    expect(result.project.team?.functions[0]?.assignments).toHaveLength(1);
    expect(result.project.team?.functions[0]?.assignments[0]?.sourceRows).toEqual([sourceEvidence]);
    expect(result.project.team?.functions[0]?.assignments[0]?.extraCells).toEqual(sourceEvidence.cells);
  });

  it("renames a custom Function without changing its ID or source label", () => {
    const team = onePersonTeam({
      functions: [{
        function: { kind: "custom", functionId: toTeamFunctionId("custom-stable"), displayName: "Old Custom" },
        applicability: "applicable",
        assignments: [{
          assignmentId: toPersonAssignmentId("custom-person"),
          role: "member",
          functionText: "Original Excel Label",
          name: "Custom Person",
          email: "custom@example.test",
        }],
      }],
    });
    const project = projectWithTeam(team);
    const onSave = vi.fn(successfulSave(project));
    renderWorkspace({ project, onSave });
    startEditing();
    fireEvent.change(screen.getByLabelText("Custom Function name"), { target: { value: "Renamed Custom" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
    const result = onSave.mock.results[0]!.value;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.team?.functions[0]?.function).toEqual({
      kind: "custom", functionId: "custom-stable", displayName: "Renamed Custom",
    });
    expect(result.project.team?.functions[0]?.assignments[0]?.functionText).toBe("Original Excel Label");
  });

  it("offers zero-person custom Functions by stable ID without merging equal display names", () => {
		const retainedA = toTeamFunctionId("retained-custom-a");
		const retainedB = toTeamFunctionId("retained-custom-b");
		const team = onePersonTeam({
			functions: [
				...onePersonTeam().functions,
				{
					function: { kind: "custom", functionId: retainedA, displayName: "Shared Custom" },
					applicability: "applicable",
					assignments: [],
				},
				{
					function: { kind: "custom", functionId: retainedB, displayName: "Shared Custom" },
					applicability: "pending",
					assignments: [],
				},
			],
		});
		const project = projectWithTeam(team);
		const onSave = vi.fn(successfulSave(project));
		renderWorkspace({ project, onSave });
		startEditing();
		const functionSelect = screen.getByLabelText("Function");
		const matchingOptions = within(functionSelect).getAllByRole("option", { name: "Shared Custom" });
		expect(matchingOptions).toHaveLength(2);
		expect(matchingOptions.map((option) => option.getAttribute("value"))).toEqual([
			retainedA,
			retainedB,
		]);
		fireEvent.change(functionSelect, { target: { value: retainedA } });
		fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
		const result = onSave.mock.results[0]!.value as ReturnType<TeamMemberWorkspaceProps["onSave"]>;
		expect(result.ok).toBe(true);
		if (!result.ok) return;
    expect(
      result.project.team?.functions.find(({ function: ref }) => ref.functionId === retainedA)?.assignments,
    ).toEqual([expect.objectContaining({ assignmentId: toPersonAssignmentId("one-person") })]);
  });

	it("recomputes canonical Advisories in read-only mode after a successful Save", () => {
		const initialProject = projectWithTeam(onePersonTeam({
			functions: [{
				...onePersonTeam().functions[0]!,
				assignments: [{
					...onePersonTeam().functions[0]!.assignments[0]!,
					email: null,
				}],
			}],
		}));
		function StatefulWorkspace(): React.ReactElement {
			const [project, setProject] = React.useState(initialProject);
			return (
				<TeamMemberWorkspace
					createAssignmentId={() => toPersonAssignmentId("unused")}
					createFunctionId={() => toTeamFunctionId("unused")}
					onBack={() => undefined}
					onSave={(projectId, candidate) => {
						const result = saveProjectTeamForState(
							{ projects: [project], schedules: [] },
							projectId,
							candidate,
							teamFunctionCatalog,
						);
						if (result.ok) setProject(result.project);
						return result;
					}}
					project={project}
					standardFunctionDefinitions={teamFunctionCatalog}
				/>
			);
		}
		render(<StatefulWorkspace />);
		startEditing();
		fireEvent.click(screen.getByRole("button", { name: "Save Team" }));

		let advisories = screen.getByRole("region", { name: "Advisories" });
		expect(within(advisories).getByText(/Person has a name but no email address/)).toBeInTheDocument();
		expect(within(advisories).getByText(/Restricted Team role has no assigned person/)).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Edit Team" }));
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		advisories = screen.getByRole("region", { name: "Advisories" });
		expect(within(advisories).getAllByText(/Person has a name but no email address/)).toHaveLength(1);
	});

  it("edits a visible extra cell without deleting its source row or hidden metadata", () => {
    const project = projectWithTeam(onePersonTeam());
    const onSave = vi.fn(successfulSave(project));
    renderWorkspace({ project, onSave });
    startEditing();
    fireEvent.click(screen.getByText("Source details"));
    fireEvent.change(screen.getByLabelText("Tel"), { target: { value: "5678" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
    const result = onSave.mock.results[0]!.value;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const assignment = result.project.team?.functions[0]?.assignments[0];
    expect(assignment?.extraCells[0]).toMatchObject({
      headerText: "Tel",
      rawValue: "5678",
      formattedText: "5678",
      hidden: true,
    });
    expect(assignment?.sourceRows).toEqual([sourceEvidence]);
  });

	it("shows immutable raw source evidence after Function edit, Save, and reopen", () => {
		const detailedSource: TeamSourceRow = {
			fileName: "source-team.xlsx",
			sheetName: "Original Sheet",
			rowNumber: 42,
			cells: [
				{
					columnIndex: 1,
					headerText: "Function",
					rawType: "s",
					rawValue: "Original Raw Function",
					formattedText: "Original Raw Function",
					hidden: false,
				},
				{
					columnIndex: 4,
					headerText: "Tel. No.",
					rawType: "n",
					rawValue: 12345,
					formattedText: "12,345",
					hidden: true,
				},
			],
		};
		const initialProject = projectWithTeam(onePersonTeam({
			functions: [{
				...onePersonTeam().functions[0]!,
				assignments: [{
					...onePersonTeam().functions[0]!.assignments[0]!,
					functionText: "Original Raw Function",
					extraCells: [detailedSource.cells[1]!],
					sourceRows: [detailedSource],
				}],
			}],
		}));
		function StatefulSourceWorkspace(): React.ReactElement {
			const [project, setProject] = React.useState(initialProject);
			return (
				<TeamMemberWorkspace
					createAssignmentId={() => toPersonAssignmentId("unused")}
					createFunctionId={() => toTeamFunctionId("unused")}
					onBack={() => undefined}
					onSave={(projectId, candidate) => {
						const result = saveProjectTeamForState(
							{ projects: [project], schedules: [] },
							projectId,
							candidate,
							teamFunctionCatalog,
						);
						if (result.ok) setProject(result.project);
						return result;
					}}
					project={project}
					standardFunctionDefinitions={teamFunctionCatalog}
				/>
			);
		}
		render(<StatefulSourceWorkspace />);
		startEditing();
		fireEvent.change(screen.getByLabelText("Function"), { target: { value: teamFunctionCatalog[1]!.id } });
		fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
		fireEvent.click(screen.getByText("Source details"));
		const details = screen.getByText("Source details").parentElement!;
		expect(within(details).getByText("Original Function: Original Raw Function")).toBeInTheDocument();
		expect(within(details).getByText("File: source-team.xlsx")).toBeInTheDocument();
		expect(within(details).getByText("Sheet: Original Sheet")).toBeInTheDocument();
		expect(within(details).getByText("Row: 42")).toBeInTheDocument();
		expect(within(details).getByText("Column 4 (Tel. No.)")).toBeInTheDocument();
		expect(within(details).getByText("Raw value (n): 12345")).toBeInTheDocument();
		expect(within(details).getByText("Formatted text: 12,345")).toBeInTheDocument();
		expect(within(details).getByText("Hidden: yes")).toBeInTheDocument();
		expect(screen.getByText("QCI-EE")).toBeInTheDocument();
	});

	it("labels a manual-only row without inventing imported source", () => {
		const team = onePersonTeam({
			functions: [{
				...onePersonTeam().functions[0]!,
				assignments: [{
					...onePersonTeam().functions[0]!.assignments[0]!,
					extraCells: [],
					sourceRows: [],
				}],
			}],
		});
		renderWorkspace({ project: projectWithTeam(team) });
		fireEvent.click(screen.getByText("Source details"));
		const details = screen.getByText("Source details").parentElement!;
		expect(within(details).getByText("No imported source.")).toBeInTheDocument();
		expect(within(details).queryByText(/^File:/)).not.toBeInTheDocument();
		expect(within(details).queryByText(/^Sheet:/)).not.toBeInTheDocument();
		expect(within(details).queryByText(/^Row:/)).not.toBeInTheDocument();
	});

  it("keeps cross-Function rows distinct when their canonical assignmentId matches", () => {
    const shared = toPersonAssignmentId("shared-assignment");
    const team: ProjectTeam = {
      ...onePersonTeam(),
      functions: [0, 1].map((index) => ({
        function: { kind: "standard" as const, functionId: teamFunctionCatalog[index]!.id },
        applicability: "applicable" as const,
        assignments: [{ assignmentId: shared, role: "member" as const, name: `Person ${index + 1}`, email: `person${index + 1}@example.test` }],
      })),
    };
    renderWorkspace({ project: projectWithTeam(team) });
    startEditing();
    const rows = screen.getAllByTestId("team-candidate-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.dataset.assignmentId).toBe("shared-assignment");
    expect(rows[1]?.dataset.assignmentId).toBe("shared-assignment");
    expect(rows[0]?.dataset.rowId).not.toBe(rows[1]?.dataset.rowId);
    fireEvent.change(within(rows[0]!).getByLabelText("Name"), { target: { value: "Only first" } });
    expect(within(rows[1]!).getByDisplayValue("Person 2")).toBeInTheDocument();
  });

  it("clears edit state on Project change and keeps failed Save local without replacement", () => {
    const failure: ValidationIssue = {
      code: "team.data.project-mismatch", domain: "team", source: "data", severity: "blocking",
      message: "Project changed before Save.", target: { section: "team" },
    };
    const onSave = vi.fn(() => ({ ok: false as const, reason: "projectMismatch" as const, issues: [failure] }));
    const view = renderWorkspace({ onSave });
    startEditing();
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
    expect(screen.getByText("Project changed before Save.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit Team" })).toBeInTheDocument();
    view.rerender(
      <TeamMemberWorkspace
        createAssignmentId={() => toPersonAssignmentId("unused")}
        createFunctionId={() => toTeamFunctionId("unused")}
        onBack={() => undefined}
        onSave={onSave}
        project={{ ...devProject002, id: "another-project" as Project["id"], team: null }}
        standardFunctionDefinitions={teamFunctionCatalog}
      />,
    );
    expect(screen.queryByRole("heading", { name: "Edit Team" })).not.toBeInTheDocument();
    expect(screen.getByText("No Team members saved.")).toBeInTheDocument();
  });
});
