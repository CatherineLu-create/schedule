import { describe, expect, expectTypeOf, it } from "vitest";

import {
  toPersonAssignmentId,
  toTeamFunctionId,
  toTeamTemplateId,
} from "../shared/ids";
import type { ProjectFunctionTeam, ProjectTeam } from "./team";
import {
  getMissingStandardFunctions,
  renameTeamFunctionDefinition,
  toTeamTemplateVersionNumber,
  updateProjectTeamFromTemplate,
  type TeamFunctionDefinition,
  type TeamTemplate,
  type TeamTemplateFunction,
  type TeamTemplateVersionNumber,
} from "./teamTemplate";

describe("Team Template domain model", () => {
  it("keeps Function identity stable when its display name changes", () => {
    const original: TeamFunctionDefinition = {
      id: toTeamFunctionId("function-fixture-design"),
      displayName: "Fixture Design",
      active: true,
    };

    const renamed = renameTeamFunctionDefinition(
      original,
      "Renamed Fixture Design",
    );

    expect(renamed).toEqual({
      id: original.id,
      displayName: "Renamed Fixture Design",
      active: true,
    });
    expect(renamed).not.toBe(original);
    expect(original.displayName).toBe("Fixture Design");
  });

  it("represents an inactive central Function without deleting it", () => {
    const definition: TeamFunctionDefinition = {
      id: toTeamFunctionId("function-fixture-inactive"),
      displayName: "Inactive Fixture Function",
      active: false,
    };

    expect(definition.active).toBe(false);
  });

  it("accepts explicit positive-integer Template versions", () => {
    expect(toTeamTemplateVersionNumber(1)).toBe(1);
    expect(toTeamTemplateVersionNumber(6)).toBe(6);
    expectTypeOf<TeamTemplateVersionNumber>().toMatchTypeOf<number>();
  });

  it("uses the same branded version type in applied-template metadata", () => {
    expectTypeOf<
      NonNullable<ProjectTeam["appliedTemplate"]>["versionNumber"]
    >().toEqualTypeOf<TeamTemplateVersionNumber>();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid Template version %s",
    (value) => {
      expect(() => toTeamTemplateVersionNumber(value)).toThrow(
        /positive safe integer/i,
      );
    },
  );

  it("references standard Functions by stable ID and explicit display order", () => {
    const membership: TeamTemplateFunction = {
      functionId: toTeamFunctionId("function-fixture-engineering"),
      displayOrder: 20,
    };
    const template: TeamTemplate = {
      id: toTeamTemplateId("team-template-fixture-v2"),
      versionNumber: toTeamTemplateVersionNumber(2),
      functions: [membership],
    };

    expect(template).toEqual({
      id: "team-template-fixture-v2",
      versionNumber: 2,
      functions: [
        {
          functionId: "function-fixture-engineering",
          displayOrder: 20,
        },
      ],
    });
    expectTypeOf(template.functions).toEqualTypeOf<
      readonly TeamTemplateFunction[]
    >();
  });

  describe("missing standard Function detection", () => {
    const functionAlphaId = toTeamFunctionId("function-fixture-alpha");
    const functionBetaId = toTeamFunctionId("function-fixture-beta");
    const functionGammaId = toTeamFunctionId("function-fixture-gamma");
    const functionDeltaId = toTeamFunctionId("function-fixture-delta");
    const customGammaId = toTeamFunctionId("function-custom-fixture-gamma");

    const functionGamma: TeamTemplateFunction = {
      functionId: functionGammaId,
      displayOrder: 30,
    };
    const functionDelta: TeamTemplateFunction = {
      functionId: functionDeltaId,
      displayOrder: 40,
    };
    const template: TeamTemplate = {
      id: toTeamTemplateId("team-template-fixture-v6"),
      versionNumber: toTeamTemplateVersionNumber(6),
      functions: [
        functionDelta,
        { functionId: functionAlphaId, displayOrder: 10 },
        functionGamma,
        { functionId: functionBetaId, displayOrder: 20 },
      ],
    };
    const customGammaFunction = {
      function: {
        kind: "custom",
        functionId: customGammaId,
        displayName: "Fixture Gamma",
      },
      applicability: "applicable",
      assignments: [],
    } satisfies ProjectFunctionTeam;
    const team: ProjectTeam = {
      projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
      functions: [
        {
          function: { kind: "standard", functionId: functionAlphaId },
          applicability: "notApplicable",
          assignments: [],
        },
        {
          function: { kind: "standard", functionId: functionBetaId },
          applicability: "pending",
          assignments: [],
        },
        customGammaFunction,
      ],
      appliedTemplate: null,
    };

    it("returns missing standard Functions by ID in display order", () => {
      const missing = getMissingStandardFunctions(team, template);

      expect(missing).toEqual([functionGamma, functionDelta]);
      expect(missing[0]).toBe(functionGamma);
      expect(missing[1]).toBe(functionDelta);
    });

    it("does not match a custom and standard Function by shared display name", () => {
      const standardDefinition: TeamFunctionDefinition = {
        id: functionGammaId,
        displayName: "Fixture Gamma",
        active: true,
      };

      expect(customGammaFunction.function.displayName).toBe(
        standardDefinition.displayName,
      );
      expect(
        getMissingStandardFunctions(team, {
          ...template,
          functions: [functionGamma],
        }),
      ).toEqual([functionGamma]);
    });

    it("does not let a custom Function satisfy a standard ID", () => {
      const customWithStandardId: ProjectTeam = {
        projectRoles: team.projectRoles,
        functions: [
          {
            function: {
              kind: "custom",
              functionId: functionGammaId,
              displayName: "Fixture Gamma",
            },
            applicability: "applicable",
            assignments: [],
          },
        ],
        appliedTemplate: null,
      };

      expect(
        getMissingStandardFunctions(customWithStandardId, {
          ...template,
          functions: [functionGamma],
        }),
      ).toEqual([functionGamma]);
    });

    it("does not mutate Project Team or Template ordering", () => {
      const originalTeamFunctions = [...team.functions];
      const originalTemplateFunctions = [...template.functions];

      getMissingStandardFunctions(team, template);

      expect(team.functions).toEqual(originalTeamFunctions);
      expect(template.functions).toEqual(originalTemplateFunctions);
    });
  });

  describe("explicit Team Template update", () => {
    const functionAlphaId = toTeamFunctionId("function-update-alpha");
    const functionBetaId = toTeamFunctionId("function-update-beta");
    const functionGammaId = toTeamFunctionId("function-update-gamma");
    const functionDeltaId = toTeamFunctionId("function-update-delta");
    const omittedFunctionId = toTeamFunctionId("function-update-omitted");

    const ownerAssignment = {
      assignmentId: toPersonAssignmentId("assignment-update-owner"),
      role: "owner" as const,
      name: "Fixture Owner",
      email: "owner@example.test",
    };
    const existingAlpha: ProjectFunctionTeam = {
      function: { kind: "standard", functionId: functionAlphaId },
      applicability: "applicable",
      assignments: [ownerAssignment],
    };
    const existingBeta: ProjectFunctionTeam = {
      function: { kind: "standard", functionId: functionBetaId },
      applicability: "notApplicable",
      assignments: [],
    };
    const customFunction: ProjectFunctionTeam = {
      function: {
        kind: "custom",
        functionId: toTeamFunctionId("function-update-custom"),
        displayName: "Project-owned Fixture Function",
      },
      applicability: "pending",
      assignments: [],
    };
    const omittedStandard: ProjectFunctionTeam = {
      function: { kind: "standard", functionId: omittedFunctionId },
      applicability: "applicable",
      assignments: [],
    };
    const projectRoles = {
      qciPm: {
        assignmentId: toPersonAssignmentId("assignment-update-qci-pm"),
        name: "Fixture QCI PM",
        email: null,
      },
      qciPjm: null,
      acerPm: null,
    };
    const team: ProjectTeam = {
      projectRoles,
      functions: [
        existingAlpha,
        existingBeta,
        customFunction,
        omittedStandard,
      ],
      appliedTemplate: {
        templateId: toTeamTemplateId("team-template-fixture-v5"),
        versionNumber: toTeamTemplateVersionNumber(5),
      },
    };
    const latestTemplate: TeamTemplate = {
      id: toTeamTemplateId("team-template-fixture-v6"),
      versionNumber: toTeamTemplateVersionNumber(6),
      functions: [
        { functionId: functionDeltaId, displayOrder: 40 },
        { functionId: functionAlphaId, displayOrder: 10 },
        { functionId: functionGammaId, displayOrder: 30 },
        { functionId: functionBetaId, displayOrder: 20 },
      ],
    };

    it("adds only missing standards as pending with no assignments", () => {
      const updated = updateProjectTeamFromTemplate(team, latestTemplate);

      expect(updated.functions.slice(4)).toEqual([
        {
          function: { kind: "standard", functionId: functionGammaId },
          applicability: "pending",
          assignments: [],
        },
        {
          function: { kind: "standard", functionId: functionDeltaId },
          applicability: "pending",
          assignments: [],
        },
      ]);
      expect(updated.appliedTemplate).toEqual({
        templateId: "team-template-fixture-v6",
        versionNumber: 6,
      });
    });

    it("preserves Roles, existing assignments, applicability, custom Functions, and omitted standards", () => {
      const updated = updateProjectTeamFromTemplate(team, latestTemplate);

      expect(updated.projectRoles).toBe(projectRoles);
      expect(updated.functions.slice(0, 4)).toEqual([
        existingAlpha,
        existingBeta,
        customFunction,
        omittedStandard,
      ]);
      expect(updated.functions[0]).toBe(existingAlpha);
      expect(updated.functions[0]?.assignments).toBe(
        existingAlpha.assignments,
      );
      expect(updated.functions[1]?.applicability).toBe("notApplicable");
      expect(updated.functions).toContain(customFunction);
      expect(updated.functions).toContain(omittedStandard);
    });

    it("returns a new Team without mutating either input", () => {
      const originalFunctions = [...team.functions];
      const originalTemplateFunctions = [...latestTemplate.functions];

      const updated = updateProjectTeamFromTemplate(team, latestTemplate);

      expect(updated).not.toBe(team);
      expect(team.functions).toEqual(originalFunctions);
      expect(team.appliedTemplate).toEqual({
        templateId: "team-template-fixture-v5",
        versionNumber: 5,
      });
      expect(latestTemplate.functions).toEqual(originalTemplateFunctions);
    });

    it("updates only metadata when no standard Functions are missing", () => {
      const completeTeam: ProjectTeam = {
        ...team,
        functions: [
          existingAlpha,
          existingBeta,
          {
            function: { kind: "standard", functionId: functionGammaId },
            applicability: "applicable",
            assignments: [],
          },
          {
            function: { kind: "standard", functionId: functionDeltaId },
            applicability: "notApplicable",
            assignments: [],
          },
          customFunction,
          omittedStandard,
        ],
      };

      const updated = updateProjectTeamFromTemplate(
        completeTeam,
        latestTemplate,
      );

      expect(updated.functions).toBe(completeTeam.functions);
      expect(updated.projectRoles).toBe(completeTeam.projectRoles);
      expect(updated.appliedTemplate).toEqual({
        templateId: latestTemplate.id,
        versionNumber: latestTemplate.versionNumber,
      });
    });
  });
});
