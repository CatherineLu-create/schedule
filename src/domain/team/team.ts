import type {
  PersonAssignmentId,
  TeamFunctionId,
  TeamTemplateId,
} from "../shared/ids";
import type { TeamTemplateVersionNumber } from "./teamTemplate";

export const functionApplicabilities = [
  "applicable",
  "notApplicable",
  "pending",
] as const;

export type FunctionApplicability =
  (typeof functionApplicabilities)[number];

export const functionAssignmentRoles = [
  "leader",
  "owner",
  "member",
] as const;

export type FunctionAssignmentRole =
  (typeof functionAssignmentRoles)[number];

export interface TeamSourceCell {
  readonly columnIndex: number;
  readonly headerText: string | null;
  readonly rawType: string;
  readonly rawValue: string | number | boolean | null;
  readonly formattedText: string | null;
  readonly hidden: boolean;
}

export interface TeamSourceRow {
  readonly fileName: string;
  readonly sheetName: string;
  readonly rowNumber: number;
  readonly cells: readonly TeamSourceCell[];
}

export interface ProjectRoleAssignment {
  readonly assignmentId: PersonAssignmentId;
  readonly name: string | null;
  readonly email: string | null;
  readonly functionText?: string;
  readonly extraCells?: readonly TeamSourceCell[];
  readonly sourceRows?: readonly TeamSourceRow[];
}

export interface ProjectRoles {
  readonly qciPm: ProjectRoleAssignment | null;
  readonly qciPjm: ProjectRoleAssignment | null;
  readonly acerPm: ProjectRoleAssignment | null;
}

export interface FunctionPersonAssignment {
  readonly assignmentId: PersonAssignmentId;
  readonly role: FunctionAssignmentRole;
  readonly name: string | null;
  readonly email: string | null;
  readonly functionText?: string;
  readonly extraCells?: readonly TeamSourceCell[];
  readonly sourceRows?: readonly TeamSourceRow[];
}

export interface StandardProjectFunctionRef {
  readonly kind: "standard";
  readonly functionId: TeamFunctionId;
}

export interface CustomProjectFunctionRef {
  readonly kind: "custom";
  readonly functionId: TeamFunctionId;
  readonly displayName: string;
}

export type ProjectFunctionRef =
  | StandardProjectFunctionRef
  | CustomProjectFunctionRef;

export interface ProjectFunctionTeam {
  readonly function: ProjectFunctionRef;
  readonly applicability: FunctionApplicability;
  readonly assignments: readonly FunctionPersonAssignment[];
}

export interface AppliedTeamTemplate {
  readonly templateId: TeamTemplateId;
  readonly versionNumber: TeamTemplateVersionNumber;
}

export interface PreservedUnclassifiedEntry {
  readonly entryId: PersonAssignmentId;
  readonly function: ProjectFunctionRef;
  readonly functionText: string;
  readonly roleText: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly extraCells: readonly TeamSourceCell[];
  readonly sourceRows: readonly TeamSourceRow[];
  readonly restrictedRoleExclusion: {
    readonly functionText: string;
    readonly roleText: string;
  } | null;
}

export interface ProjectTeam {
  readonly projectRoles: ProjectRoles;
  readonly functions: readonly ProjectFunctionTeam[];
  readonly preservedUnclassifiedEntries?: readonly PreservedUnclassifiedEntry[];
  readonly appliedTemplate: AppliedTeamTemplate | null;
}

export function removeProjectFunction(
  team: ProjectTeam,
  functionId: TeamFunctionId,
): ProjectTeam {
  const matchingFunctions = team.functions.filter(
    (functionTeam) => functionTeam.function.functionId === functionId,
  );

  if (matchingFunctions.length === 0) {
    return team;
  }

  if (
    matchingFunctions.some(
      (functionTeam) => functionTeam.function.kind === "standard",
    )
  ) {
    throw new Error("Standard Project Function cannot be removed");
  }

  if (
    matchingFunctions.some((functionTeam) => functionTeam.assignments.length > 0) ||
    (team.preservedUnclassifiedEntries ?? []).some(
      (entry) => entry.function.functionId === functionId,
    )
  ) {
    throw new Error("Custom Project Function cannot be removed while it contains people");
  }

  return {
    ...team,
    functions: team.functions.filter(
      (functionTeam) => functionTeam.function.functionId !== functionId,
    ),
  };
}
