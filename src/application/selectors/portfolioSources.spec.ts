import { describe, expect, expectTypeOf, it } from "vitest";

import type { Project } from "../../domain/project/project";
import type { ProjectMaster } from "../../domain/project/projectMaster";
import { toProjectId, type ProjectId } from "../../domain/shared/ids";
import type { ProjectTeam } from "../../domain/team/team";
import { canonicalScheduleFixtures } from "../../fixtures/v2/canonicalScheduleFixtures";
import { prototypeReducer } from "../state/prototypeReducer";
import type { PrototypeState } from "../state/prototypeState";
import {
  selectOfficialProjectSources,
  type OfficialProjectSources,
} from "./portfolioSources";

function makeMaster(stnProjectName: string): ProjectMaster {
  return {
    basicInformation: { stnProjectName },
  } as ProjectMaster;
}

function makeTeam(label: string): ProjectTeam {
  return {
    projectRoles: { qciPm: null, qciPjm: null, acerPm: null },
    functions: [],
    appliedTemplate: null,
  };
}

function makeProject(
  id: string,
  master: ProjectMaster,
  team: ProjectTeam | null,
): Project {
  return {
    id: toProjectId(id),
    master,
    identityAliases: [],
    team,
  };
}

describe("selectOfficialProjectSources", () => {
  it("exposes exactly immutable ProjectId, current Master, and current Team", () => {
    expectTypeOf<OfficialProjectSources>().toEqualTypeOf<{
      readonly projectId: ProjectId;
      readonly master: ProjectMaster;
      readonly team: ProjectTeam | null;
    }>();

    const master = makeMaster("Fixture Project Alpha");
    const team = makeTeam("Alpha");
    const project = makeProject("dev-project-001", master, team);
    const state: PrototypeState = {
      projects: [project],
      schedules: [canonicalScheduleFixtures[0]!],
    };

    const source = selectOfficialProjectSources(state, project.id);

    expect(source).toEqual({ projectId: project.id, master, team });
    expect(source).not.toHaveProperty("latestPublishedSchedule");
    expect(source).not.toHaveProperty("schedule");
  });

  it("derives Project replacement changes while preserving Schedule state", () => {
    const first = makeProject(
      "dev-project-001",
      makeMaster("Fixture Project Alpha"),
      makeTeam("Alpha"),
    );
    const second = makeProject(
      "dev-project-002",
      makeMaster("Fixture Project Beta"),
      makeTeam("Beta"),
    );
    const schedules = canonicalScheduleFixtures.slice(0, 2);
    const state: PrototypeState = { projects: [first, second], schedules };
    const replacement = {
      ...first,
      master: makeMaster("Fixture Project Alpha Renamed"),
    };

    const next = prototypeReducer(state, {
      type: "projectReplaced",
      project: replacement,
    });

    expect(selectOfficialProjectSources(next, first.id)?.master).toBe(
      replacement.master,
    );
    expect(selectOfficialProjectSources(next, second.id)?.master).toBe(
      second.master,
    );
    expect(next.schedules).toBe(schedules);
  });

  it("keeps duplicate display names isolated by ProjectId", () => {
    const first = makeProject(
      "dev-project-001",
      makeMaster("Duplicate Fixture Name"),
      null,
    );
    const second = makeProject(
      "dev-project-002",
      makeMaster("Duplicate Fixture Name"),
      null,
    );
    const state: PrototypeState = {
      projects: [first, second],
      schedules: canonicalScheduleFixtures.slice(0, 2),
    };

    expect(selectOfficialProjectSources(state, first.id)?.projectId).toBe(
      first.id,
    );
    expect(selectOfficialProjectSources(state, second.id)?.projectId).toBe(
      second.id,
    );
  });

  it("returns null when the requested Project does not exist", () => {
    const state: PrototypeState = { projects: [], schedules: [] };

    expect(
      selectOfficialProjectSources(state, toProjectId("dev-project-999")),
    ).toBeNull();
  });
});
