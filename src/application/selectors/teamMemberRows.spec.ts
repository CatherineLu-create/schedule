import { describe, expect, it } from "vitest";

import {
  toPersonAssignmentId,
  toTeamFunctionId,
} from "../../domain/shared/ids";
import type {
  ProjectTeam,
  TeamSourceCell,
  TeamSourceRow,
} from "../../domain/team/team";
import { selectTeamMemberRows } from "./teamMemberRows";

describe("selectTeamMemberRows", () => {
  it("projects Project Role, Function assignment, and preserved entry once from one Team", () => {
    const sourceRows: readonly TeamSourceRow[] = [
      {
        fileName: "synthetic.xlsx",
        sheetName: "Roster",
        rowNumber: 12,
        cells: [
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
    ];
    const extraCells: readonly TeamSourceCell[] = sourceRows[0]!.cells;
    const functionRef = {
      kind: "custom" as const,
      functionId: toTeamFunctionId("synthetic-function-one"),
      displayName: "Current Custom Name",
    };
    const team: ProjectTeam = {
      projectRoles: {
        qciPm: {
          assignmentId: toPersonAssignmentId("synthetic-project-role"),
          name: "Synthetic PM",
          email: "pm@example.test",
          functionText: "QCI-PM-Owner",
          extraCells,
          sourceRows,
        },
        qciPjm: null,
        acerPm: null,
      },
      functions: [
        {
          function: functionRef,
          applicability: "applicable",
          assignments: [
            {
              assignmentId: toPersonAssignmentId("synthetic-function-assignment"),
              role: "owner",
              name: "Synthetic Owner",
              email: "owner@example.test",
              functionText: "Original Custom Label",
              extraCells,
              sourceRows,
            },
          ],
        },
      ],
      preservedUnclassifiedEntries: [
        {
          entryId: toPersonAssignmentId("synthetic-preserved"),
          function: functionRef,
          functionText: "Original Custom Label",
          roleText: "Unclear Coordinator",
          name: "Synthetic Unknown",
          email: null,
          extraCells,
          sourceRows,
          restrictedRoleExclusion: null,
        },
      ],
      appliedTemplate: null,
    };

    const rows = selectTeamMemberRows(team);

    expect(rows.map((row) => row.kind)).toEqual([
      "projectRole",
      "functionAssignment",
      "preserved",
    ]);
    expect(rows.map((row) => row.rowId)).toEqual([
      "synthetic-project-role",
      "synthetic-function-assignment",
      "synthetic-preserved",
    ]);
    expect(rows.map((row) => row.name)).toEqual([
      "Synthetic PM",
      "Synthetic Owner",
      "Synthetic Unknown",
    ]);
    expect(rows.map((row) => row.functionText)).toEqual([
      "QCI-PM-Owner",
      "Original Custom Label",
      "Original Custom Label",
    ]);
    expect(rows[0]).toMatchObject({
      kind: "projectRole",
      projectRole: "qciPm",
      roleText: "QCI PM",
    });
    expect(rows[1]).toMatchObject({
      kind: "functionAssignment",
      role: "owner",
      roleText: "owner",
    });
    expect(rows[2]).toMatchObject({
      kind: "preserved",
      roleText: "Unclear Coordinator",
    });
    expect(rows.every((row) => row.sourceRows === sourceRows)).toBe(true);
    expect(rows.every((row) => row.extraCells === extraCells)).toBe(true);
    expect(team.functions[0]?.assignments).toHaveLength(1);
    expect(team.preservedUnclassifiedEntries).toHaveLength(1);
  });

  it("returns no rows for null Team and safe empty evidence for historical assignments", () => {
    const historical: ProjectTeam = {
      projectRoles: {
        qciPm: {
          assignmentId: toPersonAssignmentId("historical-role"),
          name: "Synthetic PM",
          email: null,
        },
        qciPjm: null,
        acerPm: null,
      },
      functions: [
        {
          function: {
            kind: "standard",
            functionId: toTeamFunctionId("historical-standard"),
          },
          applicability: "pending",
          assignments: [
            {
              assignmentId: toPersonAssignmentId("historical-assignment"),
              role: "leader",
              name: "Synthetic Leader",
              email: null,
            },
          ],
        },
      ],
      appliedTemplate: null,
    };

    expect(selectTeamMemberRows(null)).toEqual([]);
    expect(selectTeamMemberRows(historical)).toMatchObject([
      { kind: "projectRole", sourceRows: [], extraCells: [] },
      { kind: "functionAssignment", sourceRows: [], extraCells: [] },
    ]);
  });

  it("does not mutate source rows or extra cells while projecting", () => {
    const cell = Object.freeze({
      columnIndex: 4,
      headerText: "Tel. No.",
      rawType: "n",
      rawValue: 987654,
      formattedText: "987654",
      hidden: true,
    });
    const cells = Object.freeze([cell]);
    const source = Object.freeze({
      fileName: "synthetic.xlsx",
      sheetName: "Roster",
      rowNumber: 20,
      cells,
    });
    const sourceRows = Object.freeze([source]);
    const team: ProjectTeam = {
      projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
      functions: [],
      preservedUnclassifiedEntries: [
        {
          entryId: toPersonAssignmentId("frozen-preserved"),
          function: {
            kind: "custom",
            functionId: toTeamFunctionId("frozen-function"),
            displayName: "Frozen Function",
          },
          functionText: "Original Frozen Function",
          roleText: "Unknown",
          name: "Synthetic Person",
          email: null,
          extraCells: cells,
          sourceRows,
          restrictedRoleExclusion: null,
        },
      ],
      appliedTemplate: null,
    };

    const rows = selectTeamMemberRows(team);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.sourceRows).toBe(sourceRows);
    expect(rows[0]?.extraCells).toBe(cells);
    expect(sourceRows[0]?.cells[0]).toBe(cell);
    expect(cell.rawValue).toBe(987654);
  });
});
