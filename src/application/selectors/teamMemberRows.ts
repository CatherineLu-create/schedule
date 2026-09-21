import type { PersonAssignmentId } from "../../domain/shared/ids";
import type {
  FunctionAssignmentRole,
  ProjectFunctionRef,
  ProjectRoles,
  ProjectTeam,
  TeamSourceCell,
  TeamSourceRow,
} from "../../domain/team/team";

interface TeamMemberRowBase {
  readonly rowId: PersonAssignmentId;
  readonly functionText: string | null;
  readonly roleText: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly extraCells: readonly TeamSourceCell[];
  readonly sourceRows: readonly TeamSourceRow[];
}

export type TeamMemberRow =
  | (TeamMemberRowBase & {
      readonly kind: "projectRole";
      readonly projectRole: keyof ProjectRoles;
    })
  | (TeamMemberRowBase & {
      readonly kind: "functionAssignment";
      readonly function: ProjectFunctionRef;
      readonly role: FunctionAssignmentRole;
    })
  | (TeamMemberRowBase & {
      readonly kind: "preserved";
      readonly function: ProjectFunctionRef;
    });

const projectRoleLabels = {
  qciPm: "QCI PM",
  qciPjm: "QCI PjM",
  acerPm: "Acer PM",
} as const;

const projectRoleKeys = ["qciPm", "qciPjm", "acerPm"] as const;

export function selectTeamMemberRows(
  team: ProjectTeam | null,
): readonly TeamMemberRow[] {
  if (team === null) {
    return [];
  }

  const projectRoles: TeamMemberRow[] = projectRoleKeys.flatMap((key) => {
    const assignment = team.projectRoles[key];
    return assignment === null
      ? []
      : [{
          kind: "projectRole",
          rowId: assignment.assignmentId,
          projectRole: key,
          functionText: assignment.functionText ?? null,
          roleText: projectRoleLabels[key],
          name: assignment.name,
          email: assignment.email,
          extraCells: assignment.extraCells ?? [],
          sourceRows: assignment.sourceRows ?? [],
        }];
  });

  const functionAssignments: TeamMemberRow[] = team.functions.flatMap(
    (functionTeam) =>
      functionTeam.assignments.map((assignment) => ({
        kind: "functionAssignment",
        rowId: assignment.assignmentId,
        function: functionTeam.function,
        functionText: assignment.functionText ??
          (functionTeam.function.kind === "custom"
            ? functionTeam.function.displayName
            : null),
        role: assignment.role,
        roleText: assignment.role,
        name: assignment.name,
        email: assignment.email,
        extraCells: assignment.extraCells ?? [],
        sourceRows: assignment.sourceRows ?? [],
      })),
  );

  const preserved: TeamMemberRow[] = (
    team.preservedUnclassifiedEntries ?? []
  ).map((entry) => ({
    kind: "preserved",
    rowId: entry.entryId,
    function: entry.function,
    functionText: entry.functionText,
    roleText: entry.roleText,
    name: entry.name,
    email: entry.email,
    extraCells: entry.extraCells,
    sourceRows: entry.sourceRows,
  }));

  return [...projectRoles, ...functionAssignments, ...preserved];
}
