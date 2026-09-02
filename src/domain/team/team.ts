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

export interface ProjectRoleAssignment {
  readonly assignmentId: PersonAssignmentId;
  readonly name: string | null;
  readonly email: string | null;
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

export interface ProjectTeam {
  readonly projectRoles: ProjectRoles;
  readonly functions: readonly ProjectFunctionTeam[];
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

  return {
    ...team,
    functions: team.functions.filter(
      (functionTeam) => functionTeam.function.functionId !== functionId,
    ),
  };
}
