import { describe, expect, it } from "vitest";

import { toProjectId } from "../../domain/shared/ids";
import { getMissingStandardFunctions } from "../../domain/team/teamTemplate";
import {
  canonicalProjectFixtures,
  devProject001,
  devProject002,
  devProject003,
  devProject004,
  devProject005,
} from "./canonicalProjectFixtures";
import {
  devBiosTeamFunctionDefinition,
  devTeamTemplateV1,
  devTeamTemplateV2,
  devThermalTeamFunctionDefinition,
  validSavedTeamFixture,
} from "./teamTemplateFixtures";

describe("canonical V2 Project fixtures", () => {
  it("contains exactly five unique Projects in stable ProjectId order", () => {
    expect(canonicalProjectFixtures).toEqual([
      devProject001,
      devProject002,
      devProject003,
      devProject004,
      devProject005,
    ]);
    expect(canonicalProjectFixtures.map((project) => project.id)).toEqual([
      toProjectId("dev-project-001"),
      toProjectId("dev-project-002"),
      toProjectId("dev-project-003"),
      toProjectId("dev-project-004"),
      toProjectId("dev-project-005"),
    ]);
    expect(new Set(canonicalProjectFixtures.map(({ id }) => id)).size).toBe(5);
  });

  it("contains Project/Master/Team data without embedded Schedule authority", () => {
    for (const project of canonicalProjectFixtures) {
      expect(Object.keys(project)).toEqual([
        "id",
        "master",
        "identityAliases",
        "team",
      ]);
      expect(Object.hasOwn(project, "schedule")).toBe(false);
    }

    expect(
      canonicalProjectFixtures.map(
        (project) => project.master.basicInformation.stnProjectName,
      ),
    ).toEqual(["Manta", "Nautilus", "Orca", "Beluga", "Marlin"]);
    expect(devProject001.master.basicInformation.stnProjectName).toBe("Manta");
    expect(devProject001.team).toBeNull();
    expect(devProject002.team).toBe(validSavedTeamFixture);
  });

  it("keeps marine display names separate from immutable Project identity", () => {
    expect(devProject002.master.basicInformation.stnProjectName).toBe("Nautilus");
    expect(devProject003.master.basicInformation.stnProjectName).toBe("Orca");
    expect(devProject002.id).not.toBe(devProject003.id);
  });

  it("preserves Project 003 aliases and saved Template v1 Team", () => {
    expect(devProject003.identityAliases).toEqual([
      {
        kind: "stnProjectName",
        originalValue: "DEV Project Alpha Legacy",
        normalizedValue: "dev project alpha legacy",
      },
    ]);
    expect(devProject003.team?.appliedTemplate).toEqual({
      templateId: devTeamTemplateV1.id,
      versionNumber: devTeamTemplateV1.versionNumber,
    });
    expect(
      getMissingStandardFunctions(devProject003.team!, devTeamTemplateV2).map(
        ({ functionId }) => functionId,
      ),
    ).toEqual([
      devThermalTeamFunctionDefinition.id,
      devBiosTeamFunctionDefinition.id,
    ]);
  });

  it("preserves Project 004 Template v2 Team and hidden Master values", () => {
    expect(devProject004.team?.appliedTemplate).toEqual({
      templateId: devTeamTemplateV2.id,
      versionNumber: devTeamTemplateV2.versionNumber,
    });
    expect(devProject004.master.platformHardware.pcbNumber).toBe("DEV-PCB-004");
    expect(devProject004.master.other.remark).toBe(
      "DEV Working Draft review scenario",
    );
  });

  it("preserves Project 005 marine name and advisory Team data", () => {
    expect(devProject005.master.basicInformation.stnProjectName).toBe("Marlin");
    expect(devProject005.team?.appliedTemplate).toEqual({
      templateId: devTeamTemplateV2.id,
      versionNumber: devTeamTemplateV2.versionNumber,
    });
    const customFunctions =
      devProject005.team?.functions.filter(
        ({ function: value }) => value.kind === "custom",
      ) ?? [];
    expect(customFunctions).toHaveLength(1);
  });

  it("keeps all nested Team assignment IDs unique", () => {
    const assignmentIds = canonicalProjectFixtures.flatMap((project) => {
      if (project.team === null) return [];

      return [
        project.team.projectRoles.qciPm?.assignmentId,
        project.team.projectRoles.qciPjm?.assignmentId,
        project.team.projectRoles.acerPm?.assignmentId,
        ...project.team.functions.flatMap(({ assignments }) =>
          assignments.map(({ assignmentId }) => assignmentId),
        ),
      ].filter((id): id is NonNullable<typeof id> => id !== undefined);
    });

    expect(new Set(assignmentIds).size).toBe(assignmentIds.length);
  });
});
