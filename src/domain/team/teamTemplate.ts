import type {
  TeamFunctionId,
  TeamTemplateId,
} from "../shared/ids";
import type { ProjectFunctionTeam, ProjectTeam } from "./team";

declare const teamTemplateVersionNumberBrand: unique symbol;

export type TeamTemplateVersionNumber = number & {
  readonly [teamTemplateVersionNumberBrand]: "TeamTemplateVersionNumber";
};

export function toTeamTemplateVersionNumber(
  value: number,
): TeamTemplateVersionNumber {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(
      "Team Template version number must be a positive safe integer",
    );
  }

  return value as TeamTemplateVersionNumber;
}

export interface TeamFunctionDefinition {
  readonly id: TeamFunctionId;
  readonly displayName: string;
  readonly active: boolean;
}

export function renameTeamFunctionDefinition(
  definition: TeamFunctionDefinition,
  displayName: string,
): TeamFunctionDefinition {
  return { ...definition, displayName };
}

export interface TeamTemplateFunction {
  readonly functionId: TeamFunctionId;
  readonly displayOrder: number;
}

export interface TeamTemplate {
  readonly id: TeamTemplateId;
  readonly versionNumber: TeamTemplateVersionNumber;
  readonly functions: readonly TeamTemplateFunction[];
}

export function getMissingStandardFunctions(
  projectTeam: ProjectTeam,
  latestTemplate: TeamTemplate,
): readonly TeamTemplateFunction[] {
  const existingStandardFunctionIds = new Set(
    projectTeam.functions
      .filter((functionTeam) => functionTeam.function.kind === "standard")
      .map((functionTeam) => functionTeam.function.functionId),
  );

  return [...latestTemplate.functions]
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .filter(
      (templateFunction) =>
        !existingStandardFunctionIds.has(templateFunction.functionId),
    );
}

export function updateProjectTeamFromTemplate(
  projectTeam: ProjectTeam,
  latestTemplate: TeamTemplate,
): ProjectTeam {
  const additions: readonly ProjectFunctionTeam[] =
    getMissingStandardFunctions(projectTeam, latestTemplate).map(
      (templateFunction) => ({
        function: {
          kind: "standard",
          functionId: templateFunction.functionId,
        },
        applicability: "pending",
        assignments: [],
      }),
    );

  return {
    ...projectTeam,
    functions:
      additions.length === 0
        ? projectTeam.functions
        : [...projectTeam.functions, ...additions],
    appliedTemplate: {
      templateId: latestTemplate.id,
      versionNumber: latestTemplate.versionNumber,
    },
  };
}
