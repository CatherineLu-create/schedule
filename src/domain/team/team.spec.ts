import { describe, expect, expectTypeOf, it } from "vitest";

import {
  toPersonAssignmentId,
  toTeamFunctionId,
} from "../shared/ids";
import {
  functionApplicabilities,
  functionAssignmentRoles,
  removeProjectFunction,
  type CustomProjectFunctionRef,
  type FunctionApplicability,
  type FunctionAssignmentRole,
  type FunctionPersonAssignment,
  type ProjectFunctionTeam,
  type ProjectRoleAssignment,
  type ProjectRoles,
  type ProjectTeam,
  type PreservedUnclassifiedEntry,
  type StandardProjectFunctionRef,
  type TeamSourceCell,
  type TeamSourceRow,
} from "./team";

const qciPm: ProjectRoleAssignment = {
  assignmentId: toPersonAssignmentId("assignment-project-qci-pm"),
  name: "Fixture Person",
  email: "fixture.person@example.test",
};

describe("Project Team domain model", () => {
  it("owns the three Project Role slots and permits all of them to be null", () => {
    const roles: ProjectRoles = {
      qciPm: null,
      qciPjm: null,
      acerPm: null,
    };

    expect(roles).toEqual({ qciPm: null, qciPjm: null, acerPm: null });
  });

  it("allows QCI PM while QCI PjM and Acer PM remain unassigned", () => {
    const roles: ProjectRoles = {
      qciPm,
      qciPjm: null,
      acerPm: null,
    };

    expect(roles.qciPm).toBe(qciPm);
    expect(roles.qciPjm).toBeNull();
    expect(roles.acerPm).toBeNull();
  });

  it("allows the same human in multiple Project Roles without requiring email", () => {
    const roles: ProjectRoles = {
      qciPm: {
        assignmentId: toPersonAssignmentId("assignment-qci-pm-alex"),
        name: "Alex Fixture",
        email: null,
      },
      qciPjm: {
        assignmentId: toPersonAssignmentId("assignment-qci-pjm-alex"),
        name: "Alex Fixture",
        email: null,
      },
      acerPm: null,
    };

    expect(roles.qciPm?.name).toBe(roles.qciPjm?.name);
    expect(roles.qciPm?.assignmentId).not.toBe(
      roles.qciPjm?.assignmentId,
    );
    expect(roles.qciPm?.email).toBeNull();
  });

  it("defines exactly the three Function applicability states", () => {
    expect(functionApplicabilities).toEqual([
      "applicable",
      "notApplicable",
      "pending",
    ]);
    expectTypeOf<FunctionApplicability>().toEqualTypeOf<
      "applicable" | "notApplicable" | "pending"
    >();
  });

  it("defines exactly the Leader, Owner, and Member assignment roles", () => {
    expect(functionAssignmentRoles).toEqual(["leader", "owner", "member"]);
    expectTypeOf<FunctionAssignmentRole>().toEqualTypeOf<
      "leader" | "owner" | "member"
    >();
  });

  it("keeps an unknown source row outside the three canonical assignment roles", () => {
    const sourceRows: readonly TeamSourceRow[] = [
      {
        fileName: "synthetic.xlsx",
        sheetName: "Roster",
        rowNumber: 4,
        cells: [
          {
            columnIndex: 1,
            headerText: "Function",
            rawType: "s",
            rawValue: "Custom Lab",
            formattedText: "Custom Lab",
            hidden: false,
          },
          {
            columnIndex: 4,
            headerText: "Tel. No.",
            rawType: "n",
            rawValue: 123456,
            formattedText: "123456",
            hidden: true,
          },
        ],
      },
      {
        fileName: "synthetic.xlsx",
        sheetName: "Roster",
        rowNumber: 7,
        cells: [
          {
            columnIndex: 1,
            headerText: "Function",
            rawType: "s",
            rawValue: "Custom Lab",
            formattedText: "Custom Lab",
            hidden: false,
          },
        ],
      },
    ];
    const extraCells: readonly TeamSourceCell[] = [
      sourceRows[0]!.cells[1]!,
      {
        columnIndex: 5,
        headerText: "Note",
        rawType: "s",
        rawValue: "synthetic note",
        formattedText: "synthetic note",
        hidden: false,
      },
      {
        columnIndex: 6,
        headerText: "Note",
        rawType: "s",
        rawValue: "second note",
        formattedText: "second note",
        hidden: false,
      },
    ];
    const functionRef: CustomProjectFunctionRef = {
      kind: "custom",
      functionId: toTeamFunctionId("synthetic-custom-lab-id"),
      displayName: "Custom Lab",
    };
    const preserved: PreservedUnclassifiedEntry = {
      entryId: toPersonAssignmentId("synthetic-preserved-row"),
      function: functionRef,
      functionText: "Custom Lab",
      roleText: "Unclear Coordinator",
      name: "Synthetic Person",
      email: null,
      extraCells,
      sourceRows,
      restrictedRoleExclusion: {
        functionText: "Custom Lab",
        roleText: "Unclear Coordinator",
      },
    };
    const team: ProjectTeam = {
      projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
      functions: [
        {
          function: functionRef,
          applicability: "applicable",
          assignments: [],
        },
      ],
      preservedUnclassifiedEntries: [preserved],
      appliedTemplate: null,
    };

    expect(functionAssignmentRoles).toEqual(["leader", "owner", "member"]);
    expect(team.functions[0]?.assignments).toEqual([]);
    expect(team.preservedUnclassifiedEntries).toEqual([preserved]);
    expect(preserved.sourceRows.map((row) => row.rowNumber)).toEqual([4, 7]);
    expect(preserved.extraCells.map((cell) => cell.columnIndex)).toEqual([
      4,
      5,
      6,
    ]);
    expect(preserved.extraCells[0]).toMatchObject({
      rawType: "n",
      rawValue: 123456,
      hidden: true,
    });
    expect(preserved.restrictedRoleExclusion).toEqual({
      functionText: "Custom Lab",
      roleText: "Unclear Coordinator",
    });
  });

  it("allows the same person to hold different Function roles", () => {
    const assignments: readonly FunctionPersonAssignment[] = [
      {
        assignmentId: toPersonAssignmentId("assignment-alice-leader"),
        role: "leader",
        name: "Alice Fixture",
        email: "alice@example.test",
      },
      {
        assignmentId: toPersonAssignmentId("assignment-alice-owner"),
        role: "owner",
        name: "Alice Fixture",
        email: "alice@example.test",
      },
      {
        assignmentId: toPersonAssignmentId("assignment-alice-member"),
        role: "member",
        name: "Alice Fixture",
        email: "alice@example.test",
      },
    ];

    expect(assignments.map((assignment) => assignment.role)).toEqual([
      "leader",
      "owner",
      "member",
    ]);
  });

  it("keeps multiple Owners and Leaders representable for later validation", () => {
    const functionTeam: ProjectFunctionTeam = {
      function: {
        kind: "standard",
        functionId: toTeamFunctionId("function-fixture-engineering"),
      },
      applicability: "applicable",
      assignments: [
        {
          assignmentId: toPersonAssignmentId("assignment-owner-one"),
          role: "owner",
          name: "Owner One",
          email: null,
        },
        {
          assignmentId: toPersonAssignmentId("assignment-owner-two"),
          role: "owner",
          name: "Owner Two",
          email: null,
        },
        {
          assignmentId: toPersonAssignmentId("assignment-leader-one"),
          role: "leader",
          name: "Leader One",
          email: null,
        },
        {
          assignmentId: toPersonAssignmentId("assignment-leader-two"),
          role: "leader",
          name: "Leader Two",
          email: null,
        },
      ],
    };

    expect(
      functionTeam.assignments.filter((assignment) => assignment.role === "owner"),
    ).toHaveLength(2);
    expect(
      functionTeam.assignments.filter((assignment) => assignment.role === "leader"),
    ).toHaveLength(2);
  });

  it("keeps N/A with people and Applicable without Owner representable", () => {
    const notApplicableWithPeople: ProjectFunctionTeam = {
      function: {
        kind: "standard",
        functionId: toTeamFunctionId("function-fixture-na"),
      },
      applicability: "notApplicable",
      assignments: [
        {
          assignmentId: toPersonAssignmentId("assignment-na-member"),
          role: "member",
          name: "Fixture Member",
          email: null,
        },
      ],
    };
    const applicableWithoutOwner: ProjectFunctionTeam = {
      function: {
        kind: "standard",
        functionId: toTeamFunctionId("function-fixture-no-owner"),
      },
      applicability: "applicable",
      assignments: [],
    };

    expect(notApplicableWithPeople.assignments).toHaveLength(1);
    expect(applicableWithoutOwner.assignments).toEqual([]);
  });

  it("keeps Leader-only and Member-only applicable Functions representable", () => {
    const leaderOnly: ProjectFunctionTeam = {
      function: {
        kind: "standard",
        functionId: toTeamFunctionId("function-fixture-leader-only"),
      },
      applicability: "applicable",
      assignments: [
        {
          assignmentId: toPersonAssignmentId("assignment-leader-only"),
          role: "leader",
          name: "Fixture Leader",
          email: null,
        },
      ],
    };
    const memberOnly: ProjectFunctionTeam = {
      function: {
        kind: "standard",
        functionId: toTeamFunctionId("function-fixture-member-only"),
      },
      applicability: "applicable",
      assignments: [
        {
          assignmentId: toPersonAssignmentId("assignment-member-only"),
          role: "member",
          name: "Fixture Member",
          email: null,
        },
      ],
    };

    expect(leaderOnly.assignments.map((assignment) => assignment.role)).toEqual([
      "leader",
    ]);
    expect(memberOnly.assignments.map((assignment) => assignment.role)).toEqual([
      "member",
    ]);
  });

  it("distinguishes standard and custom Functions using stable IDs", () => {
    const standard: StandardProjectFunctionRef = {
      kind: "standard",
      functionId: toTeamFunctionId("function-standard-fixture"),
    };
    const firstCustom: CustomProjectFunctionRef = {
      kind: "custom",
      functionId: toTeamFunctionId("function-custom-fixture-one"),
      displayName: "Fixture Review",
    };
    const secondCustom: CustomProjectFunctionRef = {
      kind: "custom",
      functionId: toTeamFunctionId("function-custom-fixture-two"),
      displayName: "Fixture Review",
    };

    expect(standard.kind).toBe("standard");
    expect(firstCustom.kind).toBe("custom");
    expect(firstCustom.displayName).toBe(secondCustom.displayName);
    expect(firstCustom.functionId).not.toBe(secondCustom.functionId);
  });

  it("retains custom Functions and permits missing applied-template metadata", () => {
    const customFunction: ProjectFunctionTeam = {
      function: {
        kind: "custom",
        functionId: toTeamFunctionId("function-project-specific"),
        displayName: "Project-specific Fixture",
      },
      applicability: "pending",
      assignments: [],
    };
    const team: ProjectTeam = {
      projectRoles: { qciPm, qciPjm: null, acerPm: null },
      functions: [customFunction],
      appliedTemplate: null,
    };

    expect(team.functions).toEqual([customFunction]);
    expect(team.appliedTemplate).toBeNull();
  });

  describe("Project Function removal", () => {
    const standardFunction: ProjectFunctionTeam = {
      function: {
        kind: "standard",
        functionId: toTeamFunctionId("function-standard-retained"),
      },
      applicability: "notApplicable",
      assignments: [],
    };
    const customFunction: ProjectFunctionTeam = {
      function: {
        kind: "custom",
        functionId: toTeamFunctionId("function-custom-removable"),
        displayName: "Removable Fixture",
      },
      applicability: "applicable",
      assignments: [],
    };
    const retainedCustomFunction: ProjectFunctionTeam = {
      function: {
        kind: "custom",
        functionId: toTeamFunctionId("function-custom-retained"),
        displayName: "Retained Fixture",
      },
      applicability: "pending",
      assignments: [],
    };
    const team: ProjectTeam = {
      projectRoles: { qciPm, qciPjm: null, acerPm: null },
      functions: [standardFunction, customFunction, retainedCustomFunction],
      appliedTemplate: null,
    };

    it("removes a custom Function without mutating unrelated Team data", () => {
      const updated = removeProjectFunction(
        team,
        customFunction.function.functionId,
      );

      expect(updated).not.toBe(team);
      expect(updated.functions).toEqual([
        standardFunction,
        retainedCustomFunction,
      ]);
      expect(updated.projectRoles).toBe(team.projectRoles);
      expect(updated.appliedTemplate).toBe(team.appliedTemplate);
      expect(team.functions).toEqual([
        standardFunction,
        customFunction,
        retainedCustomFunction,
      ]);
    });

    it("rejects removal of a standard Function without changing Team data", () => {
      expect(() =>
        removeProjectFunction(team, standardFunction.function.functionId),
      ).toThrow(/standard Project Function/i);
      expect(team.functions).toEqual([
        standardFunction,
        customFunction,
        retainedCustomFunction,
      ]);
    });

    it("rejects custom Function removal while an assignment references it", () => {
      const assignedCustom: ProjectFunctionTeam = {
        ...customFunction,
        assignments: [
          {
            assignmentId: toPersonAssignmentId("synthetic-assigned-custom"),
            role: "member",
            name: "Synthetic Member",
            email: "member@example.test",
          },
        ],
      };
      const assignedTeam: ProjectTeam = {
        ...team,
        functions: [standardFunction, assignedCustom],
      };

      expect(() =>
        removeProjectFunction(assignedTeam, customFunction.function.functionId),
      ).toThrow(/custom Project Function.*people/i);
      expect(assignedTeam.functions[1]).toBe(assignedCustom);
      expect(assignedCustom.assignments).toHaveLength(1);
    });

    it("rejects custom Function removal while a preserved row references it", () => {
      const preserved: PreservedUnclassifiedEntry = {
        entryId: toPersonAssignmentId("synthetic-preserved-custom"),
        function: customFunction.function,
        functionText: "Removable Fixture",
        roleText: "Unclear Role",
        name: "Synthetic Person",
        email: null,
        extraCells: [],
        sourceRows: [],
        restrictedRoleExclusion: null,
      };
      const preservedTeam: ProjectTeam = {
        ...team,
        preservedUnclassifiedEntries: [preserved],
      };

      expect(() =>
        removeProjectFunction(preservedTeam, customFunction.function.functionId),
      ).toThrow(/custom Project Function.*people/i);
      expect(preservedTeam.functions).toBe(team.functions);
      expect(preservedTeam.preservedUnclassifiedEntries).toEqual([preserved]);
    });

    it("rejects removal when a custom and standard Function share an ID", () => {
      const collidingId = toTeamFunctionId("function-colliding-fixture");
      const customWithCollidingId: ProjectFunctionTeam = {
        function: {
          kind: "custom",
          functionId: collidingId,
          displayName: "Colliding Fixture",
        },
        applicability: "applicable",
        assignments: [],
      };
      const standardWithCollidingId: ProjectFunctionTeam = {
        function: { kind: "standard", functionId: collidingId },
        applicability: "pending",
        assignments: [],
      };
      const collidingTeam: ProjectTeam = {
        ...team,
        functions: [customWithCollidingId, standardWithCollidingId],
      };

      expect(() => removeProjectFunction(collidingTeam, collidingId)).toThrow(
        /standard Project Function/i,
      );
      expect(collidingTeam.functions).toEqual([
        customWithCollidingId,
        standardWithCollidingId,
      ]);
    });

    it("returns the original Team when the Function ID is not present", () => {
      const updated = removeProjectFunction(
        team,
        toTeamFunctionId("function-not-present"),
      );

      expect(updated).toBe(team);
    });
  });
});
