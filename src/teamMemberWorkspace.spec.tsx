import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import * as XLSX from "xlsx";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveProjectTeamForState } from "./application/commands/teamSaveState";
import { teamFunctionCatalog } from "./config/v2/referenceData";
import type { Project } from "./domain/project/project";
import {
  toPersonAssignmentId,
  toProjectId,
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

function browserFile(fileName: string, bytes: ArrayBuffer): File {
  return {
    name: fileName,
    arrayBuffer: vi.fn(async () => bytes),
  } as unknown as File;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function deferredBrowserFile(fileName: string) {
  const bytes = deferred<ArrayBuffer>();
  const file = {
    name: fileName,
    arrayBuffer: vi.fn(() => bytes.promise),
  } as unknown as File;
  return { file, bytes };
}

function csvBytes(name: string): ArrayBuffer {
  const encoded = new TextEncoder().encode([
    "Function,Member,email",
    `Custom Lab-Member,${name},${name.toLowerCase().replaceAll(" ", "-")}@example.test`,
  ].join("\n"));
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
}

async function resolveFile(
  pending: ReturnType<typeof deferredBrowserFile>,
  name: string,
): Promise<void> {
  await act(async () => {
    pending.bytes.resolve(csvBytes(name));
    await pending.bytes.promise;
  });
}

function csvImportFile(fileName: string, rows: readonly string[]): File {
  const bytes = new TextEncoder().encode(rows.join("\n"));
  return browserFile(
    fileName,
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
}

function workbookImportFile(
  fileName: string,
  bookType: "xls" | "xlsx",
  sheets: readonly { readonly name: string; readonly rows: readonly (readonly unknown[])[] }[],
): File {
  const workbook = XLSX.utils.book_new();
  for (const definition of sheets) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(definition.rows.map((row) => [...row])),
      definition.name,
    );
  }
  const written = XLSX.write(workbook, { type: "array", bookType });
  const bytes = written instanceof ArrayBuffer
    ? written
    : new Uint8Array(written).buffer;
  return browserFile(fileName, bytes);
}

function selectImportFile(file: File): void {
  fireEvent.change(screen.getByLabelText("Import Team Member file"), {
    target: { files: [file] },
  });
}

async function waitForImportPreview(): Promise<HTMLElement> {
  return screen.findByRole("heading", { name: "Import Team preview" });
}

describe("Team Member workspace", () => {
  it("opens the selected Project saved Team read-only from Resources", () => {
    render(<App initialSelectedProjectId={devProject002.id} />);
    const resources = screen.getByRole("region", { name: "Resources" });
    const openTeam = within(resources).getByRole("button", { name: "Open Team Member" });
    expect(openTeam).toBeEnabled();
    fireEvent.click(openTeam);
    expect(screen.getByRole("heading", { name: "Team Member" })).toBeInTheDocument();
    expect(screen.getByText("DEV QCI PM")).toBeInTheDocument();
    expect(screen.getByText("QCI-ME-Owner")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Current Schedule" })).not.toBeInTheDocument();
  });

  it("renders the read-only roster as the four-column Excel mental model", () => {
    renderWorkspace({ project: projectWithTeam(onePersonTeam()) });

    const actionContent = screen.getByTestId("team-action-content");
    const mainContent = screen.getByTestId("team-main-content");
    expect(actionContent).toHaveAttribute("data-content-alignment", "team-roster");
    expect(mainContent).toHaveAttribute("data-content-alignment", "team-roster");
    expect(actionContent).toHaveClass("px-4");
    expect(mainContent).toHaveClass("px-4");
    const table = screen.getByRole("table", { name: "Team roster" });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Function",
      "Member",
      "email",
      "Tel. No.",
    ]);
    expect(within(table).getByRole("cell", { name: "QCI-ME-Member" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "One Person" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "one@example.test" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "1234" })).toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: "Role" })).not.toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: "Details" })).not.toBeInTheDocument();
    expect(screen.queryByText("Source details")).not.toBeInTheDocument();
    expect(within(table).getByTestId("team-read-row")).toHaveClass("leading-6");
  });

  it("groups the saved roster as QCI then QCMC then OTHER without hiding or duplicating rows", () => {
    const team: ProjectTeam = {
      projectRoles: {
        qciPm: { assignmentId: toPersonAssignmentId("group-qci-pm"), name: "QCI PM Person", email: "qci.pm@example.test" },
        qciPjm: { assignmentId: toPersonAssignmentId("group-qci-pjm"), name: "QCI PjM Person", email: "qci.pjm@example.test" },
        acerPm: { assignmentId: toPersonAssignmentId("group-acer-pm"), name: "Customer PM Person", email: "customer.pm@example.test" },
      },
      functions: [
        {
          function: { kind: "standard", functionId: teamFunctionCatalog[0]!.id },
          applicability: "applicable",
          assignments: [{ assignmentId: toPersonAssignmentId("group-qci-function"), role: "member", name: "QCI Function Person", email: "qci.function@example.test" }],
        },
        {
          function: { kind: "custom", functionId: toTeamFunctionId("group-qcmc"), displayName: "QCMC-EE IQC" },
          applicability: "applicable",
          assignments: [{ assignmentId: toPersonAssignmentId("group-qcmc-person"), role: "owner", name: "QCMC Person", email: "qcmc@example.test" }],
        },
        {
          function: { kind: "custom", functionId: toTeamFunctionId("group-not-prefix"), displayName: "Supplier QCI Lab" },
          applicability: "applicable",
          assignments: [{ assignmentId: toPersonAssignmentId("group-not-prefix-person"), role: "member", name: "Non-prefix Person", email: "non-prefix@example.test" }],
        },
      ],
      preservedUnclassifiedEntries: [{
        entryId: toPersonAssignmentId("group-unknown-preserved"),
        function: { kind: "custom", functionId: toTeamFunctionId("group-unknown"), displayName: "Mystery Lab" },
        functionText: "Mystery Lab",
        roleText: "Coordinator",
        name: "Unknown Preserved Person",
        email: "unknown@example.test",
        extraCells: [],
        sourceRows: [sourceEvidence],
        restrictedRoleExclusion: null,
      }],
      appliedTemplate: null,
    };
    renderWorkspace({ project: projectWithTeam(team) });

    const table = screen.getByRole("table", { name: "Team roster" });
    const qci = within(table).getByRole("rowgroup", { name: "QCI" });
    const qcmc = within(table).getByRole("rowgroup", { name: "QCMC" });
    const other = within(table).getByRole("rowgroup", { name: "OTHER" });
    expect(qci.compareDocumentPosition(qcmc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(qcmc.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(qci).getByText("QCI PM Person")).toBeInTheDocument();
    expect(within(qci).getByText("QCI PjM Person")).toBeInTheDocument();
    expect(within(qci).getByText("QCI Function Person")).toBeInTheDocument();
    expect(within(qcmc).getByText("QCMC Person")).toBeInTheDocument();
    expect(within(other).getByText("Customer PM Person")).toBeInTheDocument();
    expect(within(other).getByText("Non-prefix Person")).toBeInTheDocument();
    expect(within(other).getByText("Unknown Preserved Person")).toBeInTheDocument();
    for (const name of [
      "QCI PM Person",
      "QCI PjM Person",
      "QCI Function Person",
      "QCMC Person",
      "Customer PM Person",
      "Non-prefix Person",
      "Unknown Preserved Person",
    ]) {
      expect(within(table).getAllByText(name)).toHaveLength(1);
    }
  });

  it("reopens added people beside an existing base Function and puts only unseen Functions at the site tail", async () => {
    const baseTeam: ProjectTeam = {
      projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
      functions: [
        {
          function: { kind: "standard", functionId: teamFunctionCatalog[0]!.id },
          applicability: "applicable",
          assignments: [
            { assignmentId: toPersonAssignmentId("me-member"), role: "member", name: "ME Existing Member", email: "me.member@example.test" },
            { assignmentId: toPersonAssignmentId("me-owner"), role: "owner", name: "ME Owner", email: "me.owner@example.test" },
            { assignmentId: toPersonAssignmentId("me-leader"), role: "leader", name: "ME Leader", email: "me.leader@example.test" },
          ],
        },
        {
          function: { kind: "custom", functionId: toTeamFunctionId("qci-packing"), displayName: "QCI-Packing" },
          applicability: "applicable",
          assignments: [
            { assignmentId: toPersonAssignmentId("packing-member"), role: "member", name: "Packing Existing Member", email: "packing.member@example.test" },
            { assignmentId: toPersonAssignmentId("packing-owner"), role: "owner", name: "Packing Owner", email: "packing.owner@example.test" },
            { assignmentId: toPersonAssignmentId("packing-leader"), role: "leader", name: "Packing Leader", email: "packing.leader@example.test" },
          ],
        },
        {
          function: { kind: "custom", functionId: toTeamFunctionId("qcmc-lab"), displayName: "QCMC-Lab" },
          applicability: "applicable",
          assignments: [{ assignmentId: toPersonAssignmentId("qcmc-owner"), role: "owner", name: "QCMC Owner", email: "qcmc.owner@example.test" }],
        },
      ],
      preservedUnclassifiedEntries: [],
      appliedTemplate: null,
    };
    const initialProject = projectWithTeam(baseTeam);
    const assignmentIds = ["new-me", "new-packing", "new-qci-function", "new-qcmc"];
    let assignmentIndex = 0;
    let functionIndex = 0;
    function StatefulOrderingWorkspace(): React.ReactElement {
      const [project, setProject] = React.useState(initialProject);
      return (
        <TeamMemberWorkspace
          createAssignmentId={() => toPersonAssignmentId(assignmentIds[assignmentIndex++]!)}
          createFunctionId={() => toTeamFunctionId(`new-function-${functionIndex++}`)}
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
    render(<StatefulOrderingWorkspace />);
    startEditing();
    for (const [functionText, name] of [
      ["QCI-ME-Member", "ME Added Member"],
      ["QCI-Packing-Member", "Packing Added Member"],
      ["QCI-NewThing-Member", "New Function Member"],
      ["QCMC-Lab-Member", "QCMC Added Member"],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: "Add person" }));
      const row = screen.getAllByTestId("team-candidate-row").find(
        (candidateRow) => candidateRow.getAttribute("data-assignment-id") === assignmentIds[assignmentIndex - 1],
      )!;
      fireEvent.change(within(row).getByLabelText("Function"), { target: { value: functionText } });
      fireEvent.change(within(row).getByLabelText("Name"), { target: { value: name } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Team Member" })).toBeInTheDocument());

    const table = screen.getByRole("table", { name: "Team roster" });
    const qciRows = within(within(table).getByRole("rowgroup", { name: "QCI" }))
      .getAllByTestId("team-read-row").map((row) => row.textContent);
    expect(qciRows).toEqual([
      expect.stringContaining("ME Leader"),
      expect.stringContaining("ME Owner"),
      expect.stringContaining("ME Existing Member"),
      expect.stringContaining("ME Added Member"),
      expect.stringContaining("Packing Leader"),
      expect.stringContaining("Packing Owner"),
      expect.stringContaining("Packing Existing Member"),
      expect.stringContaining("Packing Added Member"),
      expect.stringContaining("New Function Member"),
    ]);
    const qcmcRows = within(within(table).getByRole("rowgroup", { name: "QCMC" }))
      .getAllByTestId("team-read-row").map((row) => row.textContent);
    expect(qcmcRows).toEqual([
      expect.stringContaining("QCMC Owner"),
      expect.stringContaining("QCMC Added Member"),
    ]);
    expect(within(table).getAllByTestId("team-read-row")).toHaveLength(11);
  });

  it("keeps a new Function after an older preserved-only Function when Save reopens read-only", async () => {
    const baseTeam: ProjectTeam = {
      projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
      functions: [{
        function: { kind: "custom", functionId: toTeamFunctionId("qci-alpha"), displayName: "QCI-Alpha" },
        applicability: "applicable",
        assignments: [{
          assignmentId: toPersonAssignmentId("old-alpha"),
          role: "member",
          name: "Old Alpha",
          email: "old.alpha@example.test",
        }],
      }],
      preservedUnclassifiedEntries: [{
        entryId: toPersonAssignmentId("old-zeta"),
        function: { kind: "custom", functionId: toTeamFunctionId("qci-zeta"), displayName: "QCI-Zeta" },
        functionText: "QCI-Zeta",
        roleText: "Coordinator",
        name: "Old Zeta",
        email: "old.zeta@example.test",
        extraCells: [],
        sourceRows: [sourceEvidence],
        restrictedRoleExclusion: null,
      }],
      appliedTemplate: null,
    };
    const initialProject = projectWithTeam(baseTeam);
    const savedProjectRef: { current?: Project } = {};
    const assignmentIds = ["first-added-unknown", "second-added-formal"];
    const functionIds = ["qci-unknown", "qci-newest"];
    let assignmentIndex = 0;
    let functionIndex = 0;
    function StatefulPreservedOrderingWorkspace(): React.ReactElement {
      const [project, setProject] = React.useState(initialProject);
      return (
        <TeamMemberWorkspace
          createAssignmentId={() => toPersonAssignmentId(assignmentIds[assignmentIndex++]!)}
          createFunctionId={() => toTeamFunctionId(functionIds[functionIndex++]!)}
          onBack={() => undefined}
          onSave={(projectId, candidate) => {
            const result = saveProjectTeamForState(
              { projects: [project], schedules: [] },
              projectId,
              candidate,
              teamFunctionCatalog,
            );
            if (result.ok) {
              savedProjectRef.current = result.project;
              setProject(result.project);
            }
            return result;
          }}
          project={project}
          standardFunctionDefinitions={teamFunctionCatalog}
        />
      );
    }
    render(<StatefulPreservedOrderingWorkspace />);
    startEditing();
    fireEvent.click(screen.getByRole("button", { name: "Add person" }));
    const added = screen.getAllByTestId("team-candidate-row").find(
      (row) => row.getAttribute("data-assignment-id") === "first-added-unknown",
    )!;
    fireEvent.change(within(added).getByLabelText("Function"), { target: { value: "QCI-Unknown" } });
    fireEvent.change(within(added).getByLabelText("Name"), { target: { value: "First Added Unknown" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Team Member" })).toBeInTheDocument());

    const qci = within(screen.getByRole("table", { name: "Team roster" }))
      .getByRole("rowgroup", { name: "QCI" });
    expect(within(qci).getAllByTestId("team-read-row").map((row) => row.textContent)).toEqual([
      expect.stringContaining("Old Alpha"),
      expect.stringContaining("Old Zeta"),
      expect.stringContaining("First Added Unknown"),
    ]);

    startEditing();
    fireEvent.click(screen.getByRole("button", { name: "Add person" }));
    const secondAdded = screen.getAllByTestId("team-candidate-row").find(
      (row) => row.getAttribute("data-assignment-id") === "second-added-formal",
    )!;
    fireEvent.change(within(secondAdded).getByLabelText("Function"), { target: { value: "QCI-Newest-Member" } });
    fireEvent.change(within(secondAdded).getByLabelText("Name"), { target: { value: "Second Added Formal" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Team Member" })).toBeInTheDocument());

    const secondQci = within(screen.getByRole("table", { name: "Team roster" }))
      .getByRole("rowgroup", { name: "QCI" });
    expect(within(secondQci).getAllByTestId("team-read-row").map((row) => row.textContent)).toEqual([
      expect.stringContaining("Old Alpha"),
      expect.stringContaining("Old Zeta"),
      expect.stringContaining("First Added Unknown"),
      expect.stringContaining("Second Added Formal"),
    ]);

    cleanup();
    expect(savedProjectRef.current).toBeDefined();
    renderWorkspace({ project: savedProjectRef.current! });
    const reopenedQci = within(screen.getByRole("table", { name: "Team roster" }))
      .getByRole("rowgroup", { name: "QCI" });
    expect(within(reopenedQci).getAllByTestId("team-read-row").map((row) => row.textContent)).toEqual([
      expect.stringContaining("Old Alpha"),
      expect.stringContaining("Old Zeta"),
      expect.stringContaining("First Added Unknown"),
      expect.stringContaining("Second Added Formal"),
    ]);
  });

  it("keeps stable canonical Function order when an existing custom Function is renamed", async () => {
    const initialProject = projectWithTeam({
      projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
      functions: [
        {
          function: { kind: "custom", functionId: toTeamFunctionId("rename-alpha"), displayName: "QCI-Alpha" },
          applicability: "applicable",
          assignments: [{ assignmentId: toPersonAssignmentId("rename-alpha-person"), role: "member", name: "Old Alpha", email: "alpha@example.test" }],
        },
        {
          function: { kind: "custom", functionId: toTeamFunctionId("rename-zeta"), displayName: "QCI-Zeta" },
          applicability: "applicable",
          assignments: [{ assignmentId: toPersonAssignmentId("rename-zeta-person"), role: "member", name: "Old Zeta", email: "zeta@example.test" }],
        },
      ],
      preservedUnclassifiedEntries: [],
      appliedTemplate: null,
    });
    const savedProjectRef: { current?: Project } = {};
    function StatefulRenameWorkspace(): React.ReactElement {
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
            if (result.ok) {
              savedProjectRef.current = result.project;
              setProject(result.project);
            }
            return result;
          }}
          project={project}
          standardFunctionDefinitions={teamFunctionCatalog}
        />
      );
    }
    render(<StatefulRenameWorkspace />);
    startEditing();
    const alphaRow = screen.getByDisplayValue("Old Alpha").closest<HTMLElement>('[data-testid="team-candidate-row"]')!;
    fireEvent.change(within(alphaRow).getByLabelText("Function"), { target: { value: "QCI-Renamed-Member" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Team Member" })).toBeInTheDocument());

    const names = () => within(within(screen.getByRole("table", { name: "Team roster" }))
      .getByRole("rowgroup", { name: "QCI" }))
      .getAllByTestId("team-read-row").map((row) => row.textContent);
    expect(names()).toEqual([
      expect.stringContaining("Old Alpha"),
      expect.stringContaining("Old Zeta"),
    ]);
    expect(savedProjectRef.current?.team?.functions.map(({ function: ref }) => ref.functionId)).toEqual([
      toTeamFunctionId("rename-alpha"),
      toTeamFunctionId("rename-zeta"),
    ]);

    cleanup();
    renderWorkspace({ project: savedProjectRef.current! });
    expect(names()).toEqual([
      expect.stringContaining("Old Alpha"),
      expect.stringContaining("Old Zeta"),
    ]);
  });

  it("shows current canonical Function identity instead of a conflicting historical label", () => {
    const team = onePersonTeam({
      functions: [{
        function: { kind: "standard", functionId: teamFunctionCatalog[1]!.id },
        applicability: "applicable",
        assignments: [{
          assignmentId: toPersonAssignmentId("historically-reassigned"),
          role: "owner",
          functionText: "QCI-ME-Owner",
          name: "Reassigned Person",
          email: "reassigned@example.test",
          extraCells: [],
          sourceRows: [sourceEvidence],
        }],
      }],
    });
    renderWorkspace({ project: projectWithTeam(team) });

    const roster = screen.getByRole("table", { name: "Team roster" });
    expect(within(roster).getByRole("cell", { name: "QCI-EE-Owner" })).toBeInTheDocument();
    expect(within(roster).queryByRole("cell", { name: "QCI-ME-Owner" })).not.toBeInTheDocument();
    startEditing();
    expect(screen.getByLabelText("Function")).toHaveValue("QCI-EE-Owner");
  });

  it("does not duplicate the role suffix of an already-full custom Function label", () => {
    const team = onePersonTeam({
      functions: [{
        function: {
          kind: "custom",
          functionId: toTeamFunctionId("custom-full-label"),
          displayName: "Custom Lab-Member",
        },
        applicability: "applicable",
        assignments: [{
          assignmentId: toPersonAssignmentId("custom-full-label-person"),
          role: "member",
          functionText: "Custom Lab-Member",
          name: "Custom Full Label Person",
          email: "custom.full@example.test",
        }],
      }],
    });
    renderWorkspace({ project: projectWithTeam(team) });

    expect(screen.getByRole("cell", { name: "Custom Lab-Member" })).toBeInTheDocument();
    expect(screen.queryByText("Custom Lab-Member-Member")).not.toBeInTheDocument();
    startEditing();
    expect(screen.getByLabelText("Function")).toHaveValue("Custom Lab-Member");
  });

  it("replaces a stale full-label role suffix with the current canonical role", () => {
    const team = onePersonTeam({
      functions: [{
        function: {
          kind: "custom",
          functionId: toTeamFunctionId("custom-stale-role-label"),
          displayName: "Custom Lab-Member",
        },
        applicability: "applicable",
        assignments: [{
          assignmentId: toPersonAssignmentId("custom-current-owner"),
          role: "owner",
          functionText: "Custom Lab-Member",
          name: "Current Owner",
          email: "current.owner@example.test",
        }],
      }],
    });
    renderWorkspace({ project: projectWithTeam(team) });

    expect(screen.getByRole("cell", { name: "Custom Lab-Owner" })).toBeInTheDocument();
    expect(screen.queryByText("Custom Lab-Member-Owner")).not.toBeInTheDocument();
    startEditing();
    expect(screen.getByLabelText("Function")).toHaveValue("Custom Lab-Owner");
  });

  it("uses one compact manual table with full Function text and no native email gate", () => {
    const project = projectWithTeam(onePersonTeam());
    const onSave = vi.fn(successfulSave(project));
    const { createFunctionId } = renderWorkspace({ project, onSave });
    startEditing();

    const table = screen.getByRole("table", { name: "Team roster editor" });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Function",
      "Member",
      "email",
      "Tel. No.",
      "Actions",
    ]);
    const functionInput = within(table).getByLabelText("Function");
    expect(functionInput).toHaveValue("QCI-ME-Member");
    expect(functionInput.tagName).toBe("INPUT");
    expect(functionInput).toHaveAttribute("list");
    expect(within(table).queryByLabelText("Role")).not.toBeInTheDocument();
    expect(screen.queryByText("Source details")).not.toBeInTheDocument();
    const email = within(table).getByLabelText("Email");
    expect(email).toHaveAttribute("type", "text");
    expect(email).toHaveAttribute("inputmode", "email");

    fireEvent.change(functionInput, { target: { value: "QCI-ME-Owner" } });
    expect(createFunctionId).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const candidate = onSave.mock.calls[0]![1];
    expect(candidate.rows[0]).toMatchObject({
      functionText: "QCI-ME-Owner",
      functionRef: { kind: "standard", functionId: teamFunctionCatalog[0]!.id },
      roleText: "owner",
      restrictedKey: "qciMeOwner",
    });
  });

  it("clears stale Function identity when a populated row Function is blanked", () => {
    const project = projectWithTeam(onePersonTeam());
    const onSave = vi.fn(successfulSave(project));
    const { createFunctionId } = renderWorkspace({ project, onSave });
    startEditing();
    const functionInput = screen.getByLabelText("Function");

    fireEvent.change(functionInput, { target: { value: "" } });

    expect(functionInput).toHaveValue("");
    expect(screen.getByRole("region", { name: "Blocking issues" })).toHaveTextContent(
      "Team row must be assigned to one Function before Save.",
    );
    expect(screen.getByRole("button", { name: "Save Team" })).toBeDisabled();
    expect(createFunctionId).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(functionInput, { target: { value: "QCI-EE-Member" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![1].rows[0]).toMatchObject({
      functionText: "QCI-EE-Member",
      functionRef: { kind: "standard", functionId: teamFunctionCatalog[1]!.id },
      roleText: "member",
      sourceRows: [sourceEvidence],
    });
  });

  it("keeps manual actions and grouped issues before a long roster", () => {
    const assignments = Array.from({ length: 50 }, (_, index) => ({
      assignmentId: toPersonAssignmentId(`layout-person-${index}`),
      role: "member" as const,
      name: `Layout Person ${index + 1}`,
      email: null,
    }));
    const team = onePersonTeam({
      functions: [{
        function: { kind: "standard", functionId: teamFunctionCatalog[0]!.id },
        applicability: "notApplicable",
        assignments,
      }],
    });
    renderWorkspace({ project: projectWithTeam(team) });
    startEditing();

    const save = screen.getByRole("button", { name: "Save Team" });
    const blocking = screen.getByRole("region", { name: "Blocking issues" });
    const advisories = screen.getByRole("region", { name: "Advisories" });
    const table = screen.getByRole("table", { name: "Team roster editor" });
    expect(save.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(blocking.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(advisories.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(advisories).getByText(/Person has a name but no email address\. \(50\)/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Save Team" })).toHaveLength(1);
    const actionBar = screen.getByTestId("team-action-bar");
    expect(actionBar).toHaveClass(
      "sticky",
      "top-0",
      "z-40",
      "border-b",
      "border-slate-200",
      "bg-white",
      "shadow-sm",
    );
    const actionContent = screen.getByTestId("team-action-content");
    expect(actionContent).toHaveClass(
      "px-4",
      "grid-cols-2",
      "sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
    );
    const status = within(actionBar).getByRole("status", { name: "Team issue status" });
    expect(status).toHaveClass(
      "col-span-2",
      "row-start-2",
      "sm:col-span-1",
      "sm:col-start-2",
      "sm:row-start-1",
    );
    expect(status).toHaveTextContent("Blocking 50");
    expect(status).toHaveTextContent("Advisories 57");
    expect(screen.getAllByTestId("team-action-bar")).toHaveLength(1);
    expect(actionBar.closest('section[aria-label="Team Member workspace"]')).toHaveClass(
      "h-dvh",
      "overflow-y-auto",
    );
    expect(blocking).not.toHaveClass("sticky");
    expect(blocking).not.toHaveClass("fixed");
    expect(advisories).not.toHaveClass("sticky");
    expect(advisories).not.toHaveClass("fixed");
  });

  it("groups repeated Blocking issues into one compact summary with a count", () => {
    const assignments = Array.from({ length: 50 }, (_, index) => ({
      assignmentId: toPersonAssignmentId(`invalid-na-person-${index}`),
      role: "member" as const,
      functionText: "NA-Member",
      name: `Invalid NA Person ${index + 1}`,
      email: `invalid.na.${index + 1}@example.test`,
      extraCells: [],
      sourceRows: [],
    }));
    const team = onePersonTeam({
      functions: [{
        function: {
          kind: "custom",
          functionId: toTeamFunctionId("invalid-na-function"),
          displayName: "NA",
        },
        applicability: "applicable",
        assignments,
      }],
    });
    renderWorkspace({ project: projectWithTeam(team) });
    startEditing();

    const blocking = screen.getByRole("region", { name: "Blocking issues" });
    expect(within(blocking).getAllByRole("listitem")).toHaveLength(1);
    expect(within(blocking).getByText(
      /NA \/ N\/A represents applicability and cannot be used as a Function name\. \(50\)/,
    )).toBeInTheDocument();
    expect(within(blocking).getAllByRole("link", { name: "Go to row" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Save Team" })).toBeDisabled();
  });

  it("blocks an NA Function in the manual editor without allocating a custom identity", () => {
    const project = projectWithTeam(onePersonTeam());
    const onSave = vi.fn(successfulSave(project));
    const { createFunctionId } = renderWorkspace({ project, onSave });
    startEditing();
    fireEvent.change(screen.getByLabelText("Function"), { target: { value: " N/A-Owner " } });

    expect(screen.getByRole("region", { name: "Blocking issues" })).toHaveTextContent(
      "NA / N/A represents applicability and cannot be used as a Function name.",
    );
    expect(screen.getByRole("button", { name: "Save Team" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Mark Applicable" })).not.toBeInTheDocument();
    expect(createFunctionId).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("groups repeated invalid N/A member names while keeping the full Save gate", () => {
    const team = onePersonTeam({
      functions: [{
        function: { kind: "standard", functionId: teamFunctionCatalog[0]!.id },
        applicability: "applicable",
        assignments: Array.from({ length: 3 }, (_, index) => ({
          assignmentId: toPersonAssignmentId(`invalid-member-name-${index}`),
          role: "member" as const,
          name: index === 0 ? "NA" : index === 1 ? "n/a" : " N/A ",
          email: `invalid.member.${index}@example.test`,
        })),
      }],
    });
    renderWorkspace({ project: projectWithTeam(team) });
    startEditing();

    const blocking = screen.getByRole("region", { name: "Blocking issues" });
    expect(within(blocking).getAllByRole("listitem")).toHaveLength(1);
    expect(within(blocking).getByText(
      /NA \/ N\/A cannot be used as a member name\. Leave Member blank if no person is assigned\. \(3\)/,
    )).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Team" })).toBeDisabled();
  });

  it("keeps in-progress spaces while typing a free-text custom Function", () => {
    const project = projectWithTeam(onePersonTeam());
    const onSave = vi.fn(successfulSave(project));
    const { createFunctionId } = renderWorkspace({ project, onSave });
    startEditing();
    const functionInput = screen.getByLabelText("Function");

    for (const value of ["New", "New ", "New C", "New Custom-Member"]) {
      fireEvent.change(functionInput, { target: { value } });
      expect(functionInput).toHaveValue(value);
    }

    expect(createFunctionId).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
    expect(onSave.mock.calls[0]![1].rows[0]).toMatchObject({
      functionText: "New Custom-Member",
      functionRef: { kind: "custom", displayName: "New Custom" },
      roleText: "member",
    });
  });

  it("edits Tel. No. without deleting sibling extra cells or immutable source evidence", () => {
    const noteCell = {
      columnIndex: 5,
      headerText: "Note",
      rawType: "s",
      rawValue: "keep me",
      formattedText: "keep me",
      hidden: false,
    } as const;
    const team = onePersonTeam({
      functions: [{
        ...onePersonTeam().functions[0]!,
        assignments: [{
          ...onePersonTeam().functions[0]!.assignments[0]!,
          extraCells: [sourceEvidence.cells[0]!, noteCell],
          sourceRows: [sourceEvidence],
        }],
      }],
    });
    const project = projectWithTeam(team);
    const onSave = vi.fn(successfulSave(project));
    renderWorkspace({ project, onSave });
    startEditing();

    fireEvent.change(screen.getByLabelText("Tel. No."), { target: { value: "5678" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));

    const candidate = onSave.mock.calls[0]![1];
    expect(candidate.rows[0]!.extraCells).toEqual([
      expect.objectContaining({ headerText: "Tel", rawValue: "5678", formattedText: "5678", hidden: true }),
      noteCell,
    ]);
    expect(candidate.rows[0]!.sourceRows).toEqual([sourceEvidence]);
  });

  it("reuses the compact table for import preview while retaining source evidence in data", async () => {
    const onSave = vi.fn(successfulSave(devProject002));
    renderWorkspace({ onSave });
    selectImportFile(csvImportFile("compact.csv", [
      "Function,Member,email,Tel. No.,Hidden Note",
      "QCI-ME-Owner,Compact Import,compact@example.test,24680,retain-in-data",
    ]));
    await waitForImportPreview();

    const table = screen.getByRole("table", { name: "Team roster editor" });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Function",
      "Member",
      "email",
      "Tel. No.",
      "Actions",
    ]);
    expect(within(table).getByLabelText("Function")).toHaveValue("QCI-ME-Owner");
    expect(within(table).getByLabelText("Tel. No.")).toHaveValue("24680");
    expect(within(table).queryByLabelText("Role")).not.toBeInTheDocument();
    expect(screen.queryByText("Source details")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save imported Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace & Save" }));
    const candidate = onSave.mock.calls[0]![1];
    expect(candidate.rows[0]!.sourceRows[0]).toMatchObject({
      fileName: "compact.csv",
      sheetName: "Sheet1",
      rowNumber: 2,
      cells: expect.arrayContaining([
        expect.objectContaining({ headerText: "Function", rawValue: "QCI-ME-Owner", rawType: "s" }),
        expect.objectContaining({ headerText: "Tel. No.", rawValue: "24680", formattedText: "24680" }),
        expect.objectContaining({ headerText: "Hidden Note", rawValue: "retain-in-data" }),
      ]),
    });
  });

  it("keeps fifty people in one compact row-addressable table", () => {
    const assignments = Array.from({ length: 50 }, (_, index) => ({
      assignmentId: toPersonAssignmentId(`person-${index + 1}`),
      role: "member" as const,
      name: `Synthetic Person ${index + 1}`,
      email: `person.${index + 1}@example.test`,
      extraCells: [],
      sourceRows: [],
    }));
    const team = onePersonTeam({
      functions: [{
        function: { kind: "standard", functionId: teamFunctionCatalog[0]!.id },
        applicability: "applicable",
        assignments,
      }],
    });
    renderWorkspace({ project: projectWithTeam(team) });
    startEditing();

    const table = screen.getByRole("table", { name: "Team roster editor" });
    expect(within(table).getAllByTestId("team-candidate-row")).toHaveLength(50);
    expect(within(table).getAllByRole("row")).toHaveLength(51);
    expect(within(table).queryAllByText("Source details")).toHaveLength(0);
    expect(within(table).queryAllByLabelText("Role")).toHaveLength(0);
    expect(within(table).getAllByTestId("team-candidate-row")[0]).toHaveClass("leading-6");

    const lastName = within(table).getByDisplayValue("Synthetic Person 50");
    const lastRow = lastName.closest<HTMLElement>('[data-row-id="manual::function::team-function-qci-me::0::member::49"]')!;
    fireEvent.change(lastName, { target: { value: "Only last row changed" } });
    fireEvent.click(within(lastRow).getByRole("button", { name: "Remove person" }));
    expect(within(table).getAllByTestId("team-candidate-row")).toHaveLength(49);
    expect(within(table).getByDisplayValue("Synthetic Person 49")).toBeInTheDocument();
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
    expect(within(screen.getByRole("rowgroup", { name: "QCMC" })).getByRole(
      "cell",
      { name: "QCMC" },
    )).toBeInTheDocument();
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
      target: { value: "QCI-EE-Owner" },
    });
    expect(within(meRow).getByLabelText("Function")).toHaveValue("QCI-EE-Owner");
    expect(screen.queryByRole("button", { name: "Confirm noncritical role" })).not.toBeInTheDocument();
    fireEvent.change(meName, { target: { value: "Edited ME Owner" } });
    fireEvent.change(screen.getByDisplayValue("dev.me.owner@example.test"), { target: { value: "edited.me@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Add person" }));
    expect(createAssignmentId).toHaveBeenCalledTimes(1);
    const added = screen.getAllByTestId("team-candidate-row").find(
      (row) => row.getAttribute("data-assignment-id") === "new-assignment-1",
    )!;
    expect(added).toHaveAttribute("data-assignment-id", "new-assignment-1");
    expect(added).toHaveAttribute("data-row-id", "manual::new-assignment-1");
    expect(within(added).getByLabelText("Function")).toHaveValue("");
    expect(within(added).getByLabelText("Name")).toHaveValue("");
    expect(within(added).getByLabelText("Email")).toHaveValue("");
    expect(within(added).getByLabelText("Tel. No.")).toHaveValue("");
    expect(createFunctionId).not.toHaveBeenCalled();
    fireEvent.change(within(added).getByLabelText("Function"), { target: { value: "QCMC-Member" } });
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
    const row = screen.getByDisplayValue("N/A Person").closest<HTMLElement>('[data-testid="team-candidate-row"]')!;
    expect(within(row).getByText("N/A", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Team issue status" })).toHaveTextContent("Blocking 1");
    fireEvent.click(within(row).getByRole("button", { name: "Mark Applicable" }));
    expect(screen.queryByText(/Not Applicable Function cannot contain assignments/)).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Team issue status" })).toHaveTextContent("Blocking 0");
    expect(project.team?.functions[0]?.applicability).toBe("notApplicable");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		fireEvent.click(within(screen.getByRole("dialog", { name: "Discard unsaved Team edits" })).getByRole("button", { name: "Discard changes" }));
    expect(project.team?.functions[0]?.applicability).toBe("notApplicable");
    expect(screen.getByRole("table", { name: "Team roster" })).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText("Function"), { target: { value: "QCI-ME-Owner" } });

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
    const blankRow = screen.getAllByTestId("team-candidate-row")[1]!;
    fireEvent.change(within(blankRow).getByLabelText("Function"), { target: { value: "QCI-ME-Owner" } });

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

  it("keeps dirty navigation outside native email validity and presents its guard in the viewport", () => {
    renderWorkspace();
    startEditing();

    const email = screen.getAllByLabelText("Email")[0]!;
    expect(email).toHaveAttribute("type", "text");
    expect(email).toHaveAttribute("inputmode", "email");
    fireEvent.change(email, { target: { value: "arbitrary human text" } });

    const cancel = screen.getByRole("button", { name: "Cancel" });
    const back = screen.getByRole("button", { name: "Back" });
    const save = screen.getByRole("button", { name: "Save Team" });
    expect(cancel).toHaveAttribute("type", "button");
    expect(back).toHaveAttribute("type", "button");
    expect(save).toHaveAttribute("type", "button");

    fireEvent.click(cancel);
    const dialog = screen.getByRole("dialog", { name: "Discard unsaved Team edits" });
    expect(dialog).toHaveClass("fixed", "inset-0");
    expect(within(dialog).getByRole("button", { name: "Stay" })).toHaveAttribute("type", "button");
    expect(within(dialog).getByRole("button", { name: "Discard changes" })).toHaveAttribute("type", "button");
    fireEvent.click(within(dialog).getByRole("button", { name: "Stay" }));
    expect(email).toHaveValue("arbitrary human text");
    fireEvent.click(back);
    const backDialog = screen.getByRole("dialog", { name: "Discard unsaved Team edits" });
    expect(backDialog).toHaveClass("fixed", "inset-0");
    expect(within(backDialog).getByRole("button", { name: "Discard & Leave" })).toHaveAttribute("type", "button");
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
    const row = screen.getAllByTestId("team-candidate-row").find(
      (candidateRow) => candidateRow.getAttribute("data-assignment-id") === "possible-row",
    )!;
    expect(within(row).getByRole("button", { name: "Confirm noncritical role" })).toBeEnabled();
    fireEvent.click(within(row).getByRole("button", { name: "Confirm noncritical role" }));
    expect(within(row).getByDisplayValue("QCI PM backup Owner")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Confirm noncritical role" })).not.toBeInTheDocument();
  });

  it("moves a corrected preserved row into one Owner and reopens one roster row with source evidence", async () => {
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
    const initialProject = projectWithTeam(team);
    let savedProject: Project | null = null;
    function StatefulPreservedWorkspace(): React.ReactElement {
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
            if (result.ok) {
              savedProject = result.project;
              setProject(result.project);
            }
            return result;
          }}
          project={project}
          standardFunctionDefinitions={teamFunctionCatalog}
        />
      );
    }
    render(<StatefulPreservedWorkspace />);
    startEditing();
    fireEvent.change(screen.getByLabelText("Function"), { target: { value: "QCMC-Owner" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Team Member" })).toBeInTheDocument());
    expect(savedProject).not.toBeNull();
    expect(savedProject!.team?.preservedUnclassifiedEntries).toHaveLength(0);
    expect(savedProject!.team?.functions[0]?.assignments).toHaveLength(1);
    expect(savedProject!.team?.functions[0]?.assignments[0]).toMatchObject({
      role: "owner",
      sourceRows: [sourceEvidence],
      extraCells: sourceEvidence.cells,
    });
    const roster = screen.getByRole("table");
    expect(within(roster).getAllByRole("cell")).toHaveLength(4);
    expect(within(roster).getByRole("cell", { name: "Corrected Person" })).toBeInTheDocument();
    expect(within(roster).getByRole("cell", { name: "QCMC-Owner" })).toBeInTheDocument();
    expect(within(roster).getByRole("cell", { name: "1234" })).toBeInTheDocument();
    expect(screen.queryByText("Source details")).not.toBeInTheDocument();
  });

  it("edits custom Function full text without changing its stable ID", () => {
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
    fireEvent.change(screen.getByLabelText("Function"), { target: { value: "Renamed Custom-Member" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
    const result = onSave.mock.results[0]!.value;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.team?.functions[0]?.function).toEqual({
      kind: "custom", functionId: "custom-stable", displayName: "Renamed Custom",
    });
    expect(result.project.team?.functions[0]?.assignments[0]?.functionText).toBe("Renamed Custom-Member");
  });

  it("keeps the current stable custom Function ID on a role-only edit when display names collide", () => {
		const retainedA = toTeamFunctionId("retained-custom-a");
		const retainedB = toTeamFunctionId("retained-custom-b");
		const team = onePersonTeam({
			functions: [
				{
					function: { kind: "custom", functionId: retainedA, displayName: "Shared Custom" },
					applicability: "applicable",
					assignments: [],
				},
				{
					function: { kind: "custom", functionId: retainedB, displayName: "Shared Custom" },
					applicability: "pending",
					assignments: [{
            assignmentId: toPersonAssignmentId("shared-custom-person"),
            role: "member",
            name: "Shared Custom Person",
            email: "shared.custom@example.test",
            functionText: "Shared Custom-Member",
          }],
				},
			],
		});
		const project = projectWithTeam(team);
		const onSave = vi.fn(successfulSave(project));
		renderWorkspace({ project, onSave });
		startEditing();
		const functionInput = screen.getByDisplayValue("Shared Custom-Member");
    const datalist = document.getElementById(functionInput.getAttribute("list")!)!;
    expect(datalist.querySelectorAll('option[value="Shared Custom-Member"]')).toHaveLength(1);
		fireEvent.change(functionInput, { target: { value: "Shared Custom-Owner" } });
		fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
		const result = onSave.mock.results[0]!.value as ReturnType<TeamMemberWorkspaceProps["onSave"]>;
		expect(result.ok).toBe(true);
		if (!result.ok) return;
    expect(
      result.project.team?.functions.find(({ function: ref }) => ref.functionId === retainedB)?.assignments,
    ).toEqual([expect.objectContaining({
      assignmentId: toPersonAssignmentId("shared-custom-person"),
      role: "owner",
    })]);
    expect(
      result.project.team?.functions.find(({ function: ref }) => ref.functionId === retainedA)?.assignments,
    ).toEqual([]);
  });

  it.each([
    { selectedId: "retained-custom-a", optionNumber: 1 },
    { selectedId: "retained-custom-b", optionNumber: 2 },
  ])("selects same-named zero-person custom Function $selectedId by stable identity", ({ selectedId, optionNumber }) => {
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
    fireEvent.click(screen.getByRole("button", { name: "Add person" }));
    const addedRow = screen.getAllByTestId("team-candidate-row").at(-1)!;
    fireEvent.change(within(addedRow).getByLabelText("Name"), { target: { value: "New Shared Person" } });
    fireEvent.change(within(addedRow).getByLabelText("Email"), { target: { value: "new.shared@example.test" } });

    const identitySelect = within(addedRow).getByLabelText("Choose existing Function identity");
    const option = within(identitySelect).getByRole("option", {
      name: `Shared Custom-Member (existing Function ${optionNumber})`,
    });
    fireEvent.change(identitySelect, { target: { value: option.getAttribute("value") } });
    expect(within(addedRow).getByLabelText("Function")).toHaveValue("Shared Custom-Member");
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));

    const result = onSave.mock.results[0]!.value as ReturnType<TeamMemberWorkspaceProps["onSave"]>;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.project.team?.functions.find(({ function: ref }) => ref.functionId === selectedId)?.assignments,
    ).toEqual([expect.objectContaining({
      name: "New Shared Person",
      role: "member",
    })]);
  });

  it("reuses a saved custom Function whose display name is already a full role label", () => {
    const existingFunctionId = toTeamFunctionId("existing-full-custom");
    const team = onePersonTeam({
      functions: [{
        function: {
          kind: "custom",
          functionId: existingFunctionId,
          displayName: "Custom Lab-Member",
        },
        applicability: "pending",
        assignments: [{
          assignmentId: toPersonAssignmentId("existing-full-custom-person"),
          role: "member",
          name: "Existing Full Custom Person",
          email: "existing.full.custom@example.test",
          functionText: "Custom Lab-Member",
        }],
      }],
    });
    const project = projectWithTeam(team);
    const onSave = vi.fn(successfulSave(project));
    const { createFunctionId } = renderWorkspace({ project, onSave });
    startEditing();
    fireEvent.click(screen.getByRole("button", { name: "Add person" }));
    const addedRow = screen.getAllByTestId("team-candidate-row").at(-1)!;
    fireEvent.change(within(addedRow).getByLabelText("Function"), {
      target: { value: "Custom Lab-Member" },
    });
    fireEvent.change(within(addedRow).getByLabelText("Name"), {
      target: { value: "Added Full Custom Person" },
    });
    fireEvent.change(within(addedRow).getByLabelText("Email"), {
      target: { value: "added.full.custom@example.test" },
    });

    expect(createFunctionId).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));

    const result = onSave.mock.results[0]!.value as ReturnType<TeamMemberWorkspaceProps["onSave"]>;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.team?.functions).toEqual([
      expect.objectContaining({
        function: {
          kind: "custom",
          functionId: existingFunctionId,
          displayName: "Custom Lab-Member",
        },
        applicability: "pending",
        assignments: [
          expect.objectContaining({ name: "Existing Full Custom Person" }),
          expect.objectContaining({ name: "Added Full Custom Person", role: "member" }),
        ],
      }),
    ]);
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
    fireEvent.change(screen.getByLabelText("Tel. No."), { target: { value: "5678" } });
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

	it("preserves immutable raw source evidence after Function edit, Save, and reopen without Details UI", () => {
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
		let savedProject: Project | null = null;
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
						if (result.ok) {
							savedProject = result.project;
							setProject(result.project);
						}
						return result;
					}}
					project={project}
					standardFunctionDefinitions={teamFunctionCatalog}
				/>
			);
		}
		render(<StatefulSourceWorkspace />);
		startEditing();
		fireEvent.change(screen.getByLabelText("Function"), { target: { value: "QCI-EE-Member" } });
		fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
		expect(savedProject).not.toBeNull();
		const assignment = savedProject!.team?.functions
			.find(({ function: ref }) => ref.functionId === teamFunctionCatalog[1]!.id)
			?.assignments[0];
		expect(assignment?.sourceRows).toEqual([detailedSource]);
		expect(assignment?.sourceRows?.[0]).toMatchObject({
			fileName: "source-team.xlsx",
			sheetName: "Original Sheet",
			rowNumber: 42,
			cells: [
				expect.objectContaining({ headerText: "Function", rawValue: "Original Raw Function", rawType: "s", hidden: false }),
				expect.objectContaining({ headerText: "Tel. No.", rawValue: 12345, rawType: "n", formattedText: "12,345", hidden: true }),
			],
		});
		expect(screen.getByRole("cell", { name: "QCI-EE-Member" })).toBeInTheDocument();
		expect(screen.queryByText("Source details")).not.toBeInTheDocument();
		expect(screen.queryByText("File: source-team.xlsx")).not.toBeInTheDocument();
	});

	it("keeps a manual-only row source-free without exposing or inventing Details UI", () => {
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
		const project = projectWithTeam(team);
		const onSave = vi.fn(successfulSave(project));
		renderWorkspace({ project, onSave });
		expect(screen.queryByText("Source details")).not.toBeInTheDocument();
		expect(screen.queryByText("No imported source.")).not.toBeInTheDocument();
		startEditing();
		fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
		expect(onSave.mock.calls[0]![1].rows[0]!.sourceRows).toEqual([]);
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

  it.each([
    ["csv", () => csvImportFile("team.csv", ["Function,Member,email", "QCI-ME-Owner,CSV Person,csv@example.test"])],
    ["xls", () => workbookImportFile("team.xls", "xls", [{ name: "Roster", rows: [["Function", "Member", "email"], ["QCI-ME-Owner", "XLS Person", "xls@example.test"]] }])],
    ["xlsx", () => workbookImportFile("team.xlsx", "xlsx", [{ name: "Roster", rows: [["Function", "Member", "email"], ["QCI-ME-Owner", "XLSX Person", "xlsx@example.test"]] }])],
  ] as const)("accepts a real %s file and enters an unsaved import preview", async (extension, makeFile) => {
    const project = projectWithTeam(null);
    const onSave = vi.fn(successfulSave(project));
    renderWorkspace({ project, onSave });

    selectImportFile(makeFile());

    await waitForImportPreview();
    expect(screen.getAllByText(`File: team.${extension}`).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue(new RegExp(`${extension.toUpperCase()} Person`, "i"))).toBeInTheDocument();
    expect(project.team).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("rejects an unsupported extension before reading bytes", async () => {
    const file = browserFile("team.txt", new ArrayBuffer(4));
    renderWorkspace({ project: projectWithTeam(null) });

    selectImportFile(file);

    expect(await screen.findByText(/Only CSV, XLS, and XLSX Team files are supported/)).toBeInTheDocument();
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it("preserves an exact dirty manual edit when import reading fails", async () => {
    const file = {
      name: "broken.csv",
      arrayBuffer: vi.fn(async () => { throw new Error("Synthetic read failure"); }),
    } as unknown as File;
    renderWorkspace();
    startEditing();
    fireEvent.change(screen.getByDisplayValue("DEV ME Owner"), { target: { value: "Unsaved exact edit" } });

    selectImportFile(file);
    const consent = screen.getByRole("dialog", { name: "Replace unsaved Team edits" });
    fireEvent.click(within(consent).getByRole("button", { name: "Continue with import" }));

    expect(await screen.findByText(/Synthetic read failure/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Unsaved exact edit")).toBeInTheDocument();
  });

  it("requires explicit sheet selection and never merges matching sheets", async () => {
    renderWorkspace({ project: projectWithTeam(null) });
    selectImportFile(workbookImportFile("two-sheets.xlsx", "xlsx", [
      { name: "Roster A", rows: [["Function", "Member", "email"], ["QCI-ME-Owner", "Sheet A Person", "a@example.test"]] },
      { name: "Roster B", rows: [["Function", "Member", "email"], ["QCI-EE-Owner", "Sheet B Person", "b@example.test"]] },
    ]));

    const choice = await screen.findByRole("region", { name: "Choose Team import sheet" });
    expect(screen.getByTestId("team-action-bar")).toHaveClass("sticky", "top-0", "z-40");
    expect(screen.getAllByTestId("team-action-bar")).toHaveLength(1);
    expect(within(choice).getByText(/Roster A.*1 person row/)).toBeInTheDocument();
    expect(within(choice).getByText(/Roster B.*1 person row/)).toBeInTheDocument();
    expect(screen.queryByText("Sheet A Person")).not.toBeInTheDocument();
    expect(screen.queryByText("Sheet B Person")).not.toBeInTheDocument();
    fireEvent.click(within(choice).getByRole("button", { name: "Use Roster B" }));

    await waitForImportPreview();
    expect(screen.getByDisplayValue("Sheet B Person")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Sheet A Person")).not.toBeInTheDocument();
  });

  it("asks before superseding a dirty manual edit and Cancel Import restores it exactly", async () => {
    renderWorkspace();
    startEditing();
    fireEvent.change(screen.getByDisplayValue("DEV ME Owner"), { target: { value: "Preserved manual edit" } });
    const file = csvImportFile("replacement.csv", [
      "Function,Member,email",
      "QCI-ME-Owner,Imported Replacement,replacement@example.test",
    ]);

    selectImportFile(file);
    let consent = screen.getByRole("dialog", { name: "Replace unsaved Team edits" });
    fireEvent.click(within(consent).getByRole("button", { name: "Keep current edit" }));
    expect(screen.getByDisplayValue("Preserved manual edit")).toBeInTheDocument();
    expect(file.arrayBuffer).not.toHaveBeenCalled();

    selectImportFile(file);
    consent = screen.getByRole("dialog", { name: "Replace unsaved Team edits" });
    fireEvent.click(within(consent).getByRole("button", { name: "Continue with import" }));
    await waitForImportPreview();
    expect(screen.getByDisplayValue("Imported Replacement")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel Import" }));
    expect(screen.getByDisplayValue("Preserved manual edit")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Import Team preview" })).not.toBeInTheDocument();
  });

  it("keeps import preview corrections and explicit exclusions local", async () => {
    const project = projectWithTeam(onePersonTeam());
    const onSave = vi.fn(successfulSave(project));
    renderWorkspace({ project, onSave });
    selectImportFile(csvImportFile("preview.csv", [
      "Function,Member,email,Note",
      "QCI-ME-Owner,Imported One,one-import@example.test,Original note",
      "QCI-EE-Owner,Imported Two,two-import@example.test,Exclude me",
    ]));
    await waitForImportPreview();

    fireEvent.change(screen.getByDisplayValue("Imported One"), { target: { value: "Corrected Imported One" } });
    const secondRow = screen.getByDisplayValue("Imported Two").closest<HTMLElement>('[data-testid="team-candidate-row"]')!;
    expect(within(secondRow).getByRole("button", { name: "Exclude from import" })).toBeInTheDocument();
    expect(within(secondRow).queryByRole("button", { name: "Remove person" })).not.toBeInTheDocument();
    fireEvent.click(within(secondRow).getByRole("button", { name: "Exclude from import" }));

    expect(screen.getByDisplayValue("Corrected Imported One")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Imported Two")).not.toBeInTheDocument();
    expect(screen.getByText("Excluded imported rows: 1")).toBeInTheDocument();
    const excluded = screen.getByRole("region", { name: "Excluded imported rows" });
    expect(excluded).toHaveTextContent("Name: Imported Two");
    expect(excluded).toHaveTextContent("Function: QCI-EE-Owner");
    expect(excluded).not.toHaveTextContent("File: preview.csv");
    expect(excluded).not.toHaveTextContent("Row: 3");
    expect(screen.queryByText("Source details")).not.toBeInTheDocument();
    expect(project.team).toEqual(onePersonTeam());
    expect(onSave).not.toHaveBeenCalled();
  });

  it("uses Remove person for a manual row added inside an import preview", async () => {
    renderWorkspace({ project: projectWithTeam(null) });
    selectImportFile(csvImportFile("mixed-preview.csv", [
      "Function,Member,email",
      "QCI-ME-Owner,Imported Person,imported@example.test",
    ]));
    await waitForImportPreview();

    const importedRow = screen.getByDisplayValue("Imported Person").closest<HTMLElement>('[data-testid="team-candidate-row"]')!;
    expect(within(importedRow).getByRole("button", { name: "Exclude from import" })).toBeInTheDocument();
    expect(within(importedRow).queryByRole("button", { name: "Remove person" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add person" }));
    const rows = screen.getAllByTestId("team-candidate-row");
    const manualRow = rows[rows.length - 1]!;
    expect(within(manualRow).getByRole("button", { name: "Remove person" })).toBeInTheDocument();
    expect(within(manualRow).queryByRole("button", { name: "Exclude from import" })).not.toBeInTheDocument();
    expect(within(manualRow).getAllByRole("button")).toHaveLength(1);
  });

  it("keeps excluded import evidence reviewable and omits that row from Save", async () => {
    const project = projectWithTeam(null);
    const onSave = vi.fn(successfulSave(project));
    renderWorkspace({ project, onSave });
    selectImportFile(csvImportFile("exclude-save.csv", [
      "Function,Member,email,Note",
      "QCI-ME-Owner,Kept Person,kept@example.test,Keep evidence",
      "QCI-EE-Owner,Excluded Person,excluded@example.test,Excluded evidence",
    ]));
    await waitForImportPreview();

    const excludedRow = screen.getByDisplayValue("Excluded Person").closest<HTMLElement>('[data-testid="team-candidate-row"]')!;
    fireEvent.click(within(excludedRow).getByRole("button", { name: "Exclude from import" }));
    const evidence = screen.getByRole("region", { name: "Excluded imported rows" });
    expect(evidence).toHaveTextContent("Excluded Person");
    expect(evidence).toHaveTextContent("QCI-EE-Owner");

    fireEvent.click(screen.getByRole("button", { name: "Save imported Team" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const savedCandidate = onSave.mock.calls[0]![1];
    expect(savedCandidate.rows).toHaveLength(1);
    expect(savedCandidate.rows[0]).toMatchObject({
      name: "Kept Person",
      sourceRows: [expect.objectContaining({ fileName: "exclude-save.csv", rowNumber: 2 })],
    });
    expect(savedCandidate.excludedSourceRowIds).toHaveLength(1);
  });

  it("keeps import actions and grouped issues before the preview roster", async () => {
    renderWorkspace();
    selectImportFile(csvImportFile("layout.csv", [
      "Function,Member,email",
      "QCI-ME-Owner,Import Missing Email,",
    ]));
    await waitForImportPreview();

    const save = screen.getByRole("button", { name: "Save imported Team" });
    const advisories = screen.getByRole("region", { name: "Advisories" });
    const table = screen.getByRole("table", { name: "Team roster editor" });
    expect(save.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(advisories.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(advisories).getByText(/Person has a name but no email address/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Save imported Team" })).toHaveLength(1);
    expect(screen.getByTestId("team-action-bar")).toHaveClass(
      "sticky",
      "top-0",
      "z-40",
      "border-b",
      "border-slate-200",
      "bg-white",
      "shadow-sm",
    );
    expect(screen.getByTestId("team-action-content")).toHaveClass("px-4");
    expect(screen.getByTestId("team-main-content")).toHaveClass("px-4");
    expect(screen.getByRole("status", { name: "Team issue status" })).toHaveTextContent("Advisories 7");
    expect(screen.getAllByTestId("team-action-bar")).toHaveLength(1);
  });

  it("blocks a zero-effective-row import without invoking manual clear or replacement", async () => {
    const project = projectWithTeam(onePersonTeam());
    const onSave = vi.fn(successfulSave(project));
    renderWorkspace({ project, onSave });
    selectImportFile(csvImportFile("empty.csv", ["Function,Member,email"]));
    await waitForImportPreview();

    fireEvent.click(screen.getByRole("button", { name: "Save imported Team" }));

    expect(screen.getByText(/Import must contain at least one effective roster row/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Confirm manual clear" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Confirm whole Team replacement" })).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("treats an imported row whose current person fields were cleared as zero-effective while retaining its source row", async () => {
    const project = projectWithTeam(onePersonTeam());
    const onSave = vi.fn(successfulSave(project));
    renderWorkspace({ project, onSave });
    selectImportFile(csvImportFile("cleared-import.csv", [
      "Function,Member,email,Tel. No.",
      "QCI-ME-Owner,Cleared Person,cleared@example.test,24680",
    ]));
    await waitForImportPreview();

    const importedRow = screen.getByTestId("team-candidate-row");
    fireEvent.change(within(importedRow).getByLabelText("Name"), { target: { value: "" } });
    fireEvent.change(within(importedRow).getByLabelText("Email"), { target: { value: "" } });
    fireEvent.change(within(importedRow).getByLabelText("Tel. No."), { target: { value: "" } });

    expect(screen.getByText("Effective roster rows: 0")).toBeInTheDocument();
    expect(within(importedRow).getByRole("button", { name: "Exclude from import" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save imported Team" }));

    expect(screen.getByText(/Import must contain at least one effective roster row/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Confirm whole Team replacement" })).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows exact whole-replace context and saves the import rather than merging", async () => {
    const project = projectWithTeam(onePersonTeam());
    const onSave = vi.fn(successfulSave(project));
    renderWorkspace({ project, onSave });
    selectImportFile(csvImportFile("replacement.csv", [
      "Function,Member,email",
      "Custom Lab-Member,Imported Same,same@example.test",
      "Custom Lab-Member,Imported Same,same@example.test",
      "Custom Lab-Member,Imported Same,other@example.test",
    ]));
    await waitForImportPreview();
    expect(screen.getByText("Raw parsed rows: 3")).toBeInTheDocument();
    expect(screen.getByText("Effective roster rows: 2")).toBeInTheDocument();
    expect(project.team?.functions[0]?.assignments[0]?.name).toBe("One Person");

    fireEvent.click(screen.getByRole("button", { name: "Save imported Team" }));
    let dialog = screen.getByRole("dialog", { name: "Confirm whole Team replacement" });
    expect(dialog).toHaveClass("fixed", "inset-0");
    expect(within(dialog).getByText("Project: Nautilus")).toBeInTheDocument();
    expect(within(dialog).getByText("File: replacement.csv")).toBeInTheDocument();
    expect(within(dialog).getByText("Existing roster rows: 1")).toBeInTheDocument();
    expect(within(dialog).getByText("Incoming roster rows: 2")).toBeInTheDocument();
    expect(within(dialog).getByText(/People absent from the incoming import will disappear/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Existing system and manual edits do not merge automatically/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Back to preview" }));
    expect(screen.getAllByDisplayValue("Imported Same")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Save imported Team" }));
    dialog = screen.getByRole("dialog", { name: "Confirm whole Team replacement" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Replace & Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![1].origin).toBe("import");
    const result = onSave.mock.results[0]!.value as ReturnType<TeamMemberWorkspaceProps["onSave"]>;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.team?.functions.flatMap(({ assignments }) => assignments).map(({ name }) => name)).toEqual([
      "Imported Same",
      "Imported Same",
    ]);
    expect(result.project.team?.functions.flatMap(({ assignments }) => assignments).some(({ name }) => name === "One Person")).toBe(false);
  });

  it("imports directly into an empty Team without a fake replacement confirmation", async () => {
    const project = projectWithTeam(null);
    const onSave = vi.fn(successfulSave(project));
    renderWorkspace({ project, onSave });
    selectImportFile(csvImportFile("first.csv", [
      "Function,Member,email",
      "QCI-ME-Owner,First Imported,first@example.test",
    ]));
    await waitForImportPreview();

    fireEvent.click(screen.getByRole("button", { name: "Save imported Team" }));

    expect(screen.queryByRole("dialog", { name: "Confirm whole Team replacement" })).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("treats an empty browser picker result as no state change", () => {
    renderWorkspace({ project: projectWithTeam(null) });
    fireEvent.change(screen.getByLabelText("Import Team Member file"), {
      target: { files: [] },
    });

    expect(screen.getByText("No Team members saved.")).toBeInTheDocument();
    expect(screen.queryByText(/Reading Team import/)).not.toBeInTheDocument();
  });

  it("ignores a late file completion after Cancel Import", async () => {
    const pending = deferredBrowserFile("late.csv");
    const onSave = vi.fn(successfulSave(projectWithTeam(null)));
    renderWorkspace({ project: projectWithTeam(null), onSave });
    selectImportFile(pending.file);
    expect(screen.getByRole("heading", { name: "Reading Team import" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel Import" }));

    await resolveFile(pending, "Late Person");

    expect(screen.getByText("No Team members saved.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Import Team preview" })).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps the import discard guard open while a pending read completes", async () => {
    const pending = deferredBrowserFile("guard-pending.csv");
    renderWorkspace({ project: projectWithTeam(null) });
    selectImportFile(pending.file);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("dialog", { name: "Discard unsaved Team import" })).toBeInTheDocument();

    await resolveFile(pending, "Buffered Person");

    const dialog = screen.getByRole("dialog", { name: "Discard unsaved Team import" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Stay" }));
    expect(await screen.findByDisplayValue("Buffered Person")).toBeInTheDocument();
  });

  it("keeps the import discard guard open while a pending read fails", async () => {
    const pending = deferredBrowserFile("guard-failure.csv");
    renderWorkspace({ project: projectWithTeam(null) });
    selectImportFile(pending.file);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    await act(async () => {
      pending.bytes.reject(new Error("Buffered read failure"));
      await expect(pending.bytes.promise).rejects.toThrow("Buffered read failure");
    });

    const dialog = screen.getByRole("dialog", { name: "Discard unsaved Team import" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Stay" }));
    expect(await screen.findByText("Buffered read failure")).toBeInTheDocument();
    expect(screen.getByText("No Team members saved.")).toBeInTheDocument();
  });

  it("accepts the live import completion under React StrictMode effect rehearsal", async () => {
    const project = projectWithTeam(null);
    render(
      <React.StrictMode>
        <TeamMemberWorkspace
          createAssignmentId={() => toPersonAssignmentId("strict-assignment")}
          createFunctionId={() => toTeamFunctionId("strict-function")}
          onBack={() => undefined}
          onSave={successfulSave(project)}
          project={project}
          standardFunctionDefinitions={teamFunctionCatalog}
        />
      </React.StrictMode>,
    );
    selectImportFile(csvImportFile("strict.csv", [
      "Function,Member,email",
      "Custom Lab-Member,Strict Person,strict@example.test",
    ]));

    await waitFor(() => expect(screen.getByDisplayValue("Strict Person")).toBeInTheDocument());
  });

  it("ignores a Project A completion after the workspace opens Project B", async () => {
    const pending = deferredBrowserFile("project-a.csv");
    const projectA = projectWithTeam(null);
    const projectB = { ...projectA, id: toProjectId("project-b"), team: null };
    const onSave = vi.fn(successfulSave(projectA));
    const view = renderWorkspace({ project: projectA, onSave });
    selectImportFile(pending.file);
    view.rerender(
      <TeamMemberWorkspace
        createAssignmentId={() => toPersonAssignmentId("project-b-assignment")}
        createFunctionId={() => toTeamFunctionId("project-b-function")}
        onBack={() => undefined}
        onSave={onSave}
        project={projectB}
        standardFunctionDefinitions={teamFunctionCatalog}
      />,
    );

    await resolveFile(pending, "Project A Person");

    expect(screen.getByText("No Team members saved.")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Project A Person")).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps a newer selection when an older read resolves later", async () => {
    const older = deferredBrowserFile("older.csv");
    renderWorkspace({ project: projectWithTeam(null) });
    selectImportFile(older.file);
    selectImportFile(csvImportFile("newer.csv", [
      "Function,Member,email",
      "Custom Lab-Member,Newer Person,newer@example.test",
    ]));
    await waitForImportPreview();
    expect(screen.getByDisplayValue("Newer Person")).toBeInTheDocument();

    await resolveFile(older, "Older Person");

    expect(screen.getByDisplayValue("Newer Person")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Older Person")).not.toBeInTheDocument();
  });

  it("ignores request A after request B starts and is then cancelled", async () => {
    const first = deferredBrowserFile("first.csv");
    const second = deferredBrowserFile("second.csv");
    const onSave = vi.fn(successfulSave(projectWithTeam(null)));
    renderWorkspace({ project: projectWithTeam(null), onSave });
    selectImportFile(first.file);
    selectImportFile(second.file);
    fireEvent.click(screen.getByRole("button", { name: "Cancel Import" }));

    await resolveFile(second, "Second Person");
    await resolveFile(first, "First Person");

    expect(screen.getByText("No Team members saved.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Import Team preview" })).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("ignores an old editor read after Save and reopening the editor", async () => {
    const pending = deferredBrowserFile("old-editor.csv");
    const onSave = vi.fn(successfulSave(devProject002));
    renderWorkspace({ onSave });
    startEditing();
    fireEvent.change(screen.getByDisplayValue("DEV ME Owner"), { target: { value: "Saved before late read" } });
    selectImportFile(pending.file);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace unsaved Team edits" })).getByRole("button", { name: "Continue with import" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel Import" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Team" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    startEditing();

    await resolveFile(pending, "Old Editor Person");

    expect(screen.getByRole("heading", { name: "Edit Team" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Old Editor Person")).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("requires consent before file reselection discards corrected import preview", async () => {
    renderWorkspace({ project: projectWithTeam(null) });
    selectImportFile(csvImportFile("first.csv", [
      "Function,Member,email",
      "Custom Lab-Member,First Preview,first@example.test",
    ]));
    await waitForImportPreview();
    fireEvent.change(screen.getByDisplayValue("First Preview"), { target: { value: "Corrected First Preview" } });

    selectImportFile(csvImportFile("second.csv", [
      "Function,Member,email",
      "Custom Lab-Member,Second Preview,second@example.test",
    ]));
    let consent = screen.getByRole("dialog", { name: "Replace unsaved Team edits" });
    fireEvent.click(within(consent).getByRole("button", { name: "Keep current edit" }));
    expect(screen.getByDisplayValue("Corrected First Preview")).toBeInTheDocument();

    selectImportFile(csvImportFile("second.csv", [
      "Function,Member,email",
      "Custom Lab-Member,Second Preview,second@example.test",
    ]));
    consent = screen.getByRole("dialog", { name: "Replace unsaved Team edits" });
    fireEvent.click(within(consent).getByRole("button", { name: "Continue with import" }));
    await waitFor(() => expect(screen.getByDisplayValue("Second Preview")).toBeInTheDocument());
    expect(screen.queryByDisplayValue("Corrected First Preview")).not.toBeInTheDocument();
  });

  it("uses a fresh import session after unmounting and reopening the same Project", async () => {
    const file = () => csvImportFile("same.csv", [
      "Function,Member,email",
      "Custom Lab-Member,Same Person,same@example.test",
    ]);
    const first = renderWorkspace({ project: projectWithTeam(null) });
    selectImportFile(file());
    await waitForImportPreview();
    const firstRowId = screen.getByTestId("team-candidate-row").dataset.rowId;
    first.unmount();
    renderWorkspace({ project: projectWithTeam(null) });
    selectImportFile(file());
    await waitForImportPreview();
    const secondRowId = screen.getByTestId("team-candidate-row").dataset.rowId;

    expect(firstRowId).toBeTruthy();
    expect(secondRowId).toBeTruthy();
    expect(secondRowId).not.toBe(firstRowId);
  });

  it("guards Back from import preview and never sends a stale candidate to Save", async () => {
    const onBack = vi.fn();
    const onSave = vi.fn(successfulSave(projectWithTeam(null)));
    renderWorkspace({ project: projectWithTeam(null), onBack, onSave });
    selectImportFile(csvImportFile("guarded.csv", [
      "Function,Member,email",
      "Custom Lab-Member,Guarded Person,guarded@example.test",
    ]));
    await waitForImportPreview();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    const dialog = screen.getByRole("dialog", { name: "Discard unsaved Team import" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Stay" }));
    expect(screen.getByDisplayValue("Guarded Person")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Discard unsaved Team import" })).getByRole("button", { name: "Discard & Leave" }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
