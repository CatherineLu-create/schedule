import { describe, expect, expectTypeOf, it } from "vitest";

import {
  toPersonAssignmentId,
  toProjectId,
  toScheduleDraftId,
  toScheduleVersionId,
} from "../shared/ids";
import {
  toScheduleVersionNumber,
  type ProjectSchedule,
} from "../schedule/schedule";
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

function makeTeam(role: "qciPm" | "qciPjm", label: string): ProjectTeam {
  const assignment = {
    assignmentId: toPersonAssignmentId(`assignment-${label}`),
    name: `${label} Person`,
    email: null,
  };

  return {
    projectRoles: {
      qciPm: role === "qciPm" ? assignment : null,
      qciPjm: role === "qciPjm" ? assignment : null,
      acerPm: null,
    },
    functions: [],
    appliedTemplate: null,
  };
}

describe("Project aggregate", () => {
  it("defines the canonical aggregate module and its five owned values", async () => {
    const projectDomain = await import("./project");
    const master = makeMaster("Fixture Project Alpha");
    const alias: ProjectIdentityAlias = {
      kind: "stnProjectName",
      originalValue: "Fixture Project Previous",
      normalizedValue: "fixture project previous",
    };
    const project: Project = {
      id: toProjectId("project-fixture-alpha"),
      master,
      identityAliases: [alias],
      schedule: { publishedVersions: [], workingDraft: null },
      team: null,
    };

    expect(projectDomain).toBeDefined();
    expect(Object.keys(project)).toEqual([
      "id",
      "master",
      "identityAliases",
      "schedule",
      "team",
    ]);
    expect(project.id).toBe("project-fixture-alpha");
    expect(project.id).not.toBe(master.basicInformation.stnProjectName);
    expect(project.identityAliases).toEqual([alias]);
    expectTypeOf(project.identityAliases).toEqualTypeOf<
      readonly ProjectIdentityAlias[]
    >();
  });

  it("represents an empty Schedule and an uninitialized Team", () => {
    const project: Project = {
      id: toProjectId("project-fixture-empty"),
      master: makeMaster("Fixture Empty Project"),
      identityAliases: [],
      schedule: { publishedVersions: [], workingDraft: null },
      team: null,
    };

    expect(project.schedule).toEqual({
      publishedVersions: [],
      workingDraft: null,
    });
    expect(project.team).toBeNull();
  });

  it("allows two Projects to own independent Schedule histories, Drafts, and Teams", () => {
    const scheduleA: ProjectSchedule = {
      publishedVersions: [
        {
          id: toScheduleVersionId("schedule-a-v1"),
          versionNumber: toScheduleVersionNumber(1),
          versionNote: "Project A initial",
          publishedAt: "2026-09-02T01:00:00Z",
          milestones: [],
        },
      ],
      workingDraft: {
        id: toScheduleDraftId("draft-a"),
        basePublishedVersionId: toScheduleVersionId("schedule-a-v1"),
        milestones: [],
        importFindings: [],
      },
    };
    const scheduleB: ProjectSchedule = {
      publishedVersions: [
        {
          id: toScheduleVersionId("schedule-b-v1"),
          versionNumber: toScheduleVersionNumber(1),
          versionNote: "Project B initial",
          publishedAt: "2026-09-02T02:00:00Z",
          milestones: [],
        },
        {
          id: toScheduleVersionId("schedule-b-v2"),
          versionNumber: toScheduleVersionNumber(2),
          versionNote: "Project B updated",
          publishedAt: "2026-09-02T03:00:00Z",
          milestones: [],
        },
      ],
      workingDraft: {
        id: toScheduleDraftId("draft-b"),
        basePublishedVersionId: toScheduleVersionId("schedule-b-v2"),
        milestones: [],
        importFindings: [],
      },
    };
    const projectA: Project = {
      id: toProjectId("project-a"),
      master: makeMaster("Fixture Project A"),
      identityAliases: [],
      schedule: scheduleA,
      team: makeTeam("qciPm", "project-a"),
    };
    const projectB: Project = {
      id: toProjectId("project-b"),
      master: makeMaster("Fixture Project B"),
      identityAliases: [],
      schedule: scheduleB,
      team: makeTeam("qciPjm", "project-b"),
    };

    expect(projectA.master).not.toBe(projectB.master);
    expect(projectA.schedule).not.toBe(projectB.schedule);
    expect(projectA.schedule.workingDraft?.id).toBe("draft-a");
    expect(projectB.schedule.workingDraft?.id).toBe("draft-b");
    expect(projectA.schedule.publishedVersions).toHaveLength(1);
    expect(projectB.schedule.publishedVersions).toHaveLength(2);
    expect(projectA.team).not.toBe(projectB.team);
    expect(projectA.team?.projectRoles.qciPm?.name).toBe("project-a Person");
    expect(projectB.team?.projectRoles.qciPjm?.name).toBe("project-b Person");
  });
});
