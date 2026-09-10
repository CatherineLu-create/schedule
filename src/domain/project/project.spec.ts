import { describe, expect, expectTypeOf, it } from "vitest";

import { devProject002 } from "../../fixtures/v2/canonicalProjectFixtures";
import { toPersonAssignmentId, toProjectId } from "../shared/ids";
import type { ProjectTeam } from "../team/team";
import type { Project } from "./project";
import type { ProjectIdentityAlias } from "./projectIdentity";
import type { ProjectMaster } from "./projectMaster";

function makeMaster(stnProjectName: string): ProjectMaster {
  return {
    basicInformation: {
      status: null,
      year: 2027,
      customer: null,
      category: null,
      productLine: null,
      panelSize: null,
      stnProjectName,
      qciModelName: null,
    },
    platformHardware: {
      cpu: null,
      gpu: null,
      pcbNumber: null,
      housingNumber: null,
    },
    leverage: {
      pcbLeverage: null,
      aLeverage: null,
      bLeverage: null,
      cLeverage: null,
      dLeverage: null,
    },
    cover: {
      aCover: null,
      bCover: null,
      cCover: null,
      dCover: null,
    },
    modelRegulatory: {
      acerModelName: null,
      acerMarketingName: null,
      ssid: null,
      rmn: null,
    },
    mechanical: {
      product: {
        productLengthMm: null,
        productWidthMm: null,
        productHeightMm: null,
        productWeightG: null,
      },
      package: {
        packageLengthMm: null,
        packageWidthMm: null,
        packageHeightMm: null,
        grossWeightG: null,
      },
    },
    other: { remark: null },
  };
}

function makeTeam(label: string): ProjectTeam {
  const assignment = {
    assignmentId: toPersonAssignmentId(`assignment-${label}`),
    name: `${label} Person`,
    email: null,
  };

  return {
    projectRoles: {
      qciPm: assignment,
      qciPjm: null,
      acerPm: null,
    },
    functions: [],
    appliedTemplate: null,
  };
}

describe("Project aggregate", () => {
  it("owns only Project/Master identity, aliases, and current Team state", () => {
    expect(Object.keys(devProject002)).toEqual([
      "id",
      "master",
      "identityAliases",
      "team",
    ]);
    expectTypeOf<keyof Project>().toEqualTypeOf<
      "id" | "master" | "identityAliases" | "team"
    >();
    expect(devProject002.id).not.toBe(
      devProject002.master.basicInformation.stnProjectName,
    );
  });

  it("keeps Project identity independent from Master and Team values", () => {
    const project: Project = {
      id: toProjectId("project-fixture-alpha"),
      master: makeMaster("Fixture Project Alpha"),
      identityAliases: [],
      team: makeTeam("project-alpha"),
    };

    expect(project.id).toBe("project-fixture-alpha");
    expect(project.master.basicInformation.stnProjectName).toBe(
      "Fixture Project Alpha",
    );
    expect(project.team?.projectRoles.qciPm?.name).toBe(
      "project-alpha Person",
    );
  });

  it("retains readonly identity-alias semantics", () => {
    const alias: ProjectIdentityAlias = {
      kind: "stnProjectName",
      originalValue: "Fixture Project Previous",
      normalizedValue: "fixture project previous",
    };
    const project: Project = {
      id: toProjectId("project-fixture-alias"),
      master: makeMaster("Fixture Project Current"),
      identityAliases: [alias],
      team: null,
    };

    expect(project.identityAliases).toEqual([alias]);
    expectTypeOf(project.identityAliases).toEqualTypeOf<
      readonly ProjectIdentityAlias[]
    >();
  });
});
