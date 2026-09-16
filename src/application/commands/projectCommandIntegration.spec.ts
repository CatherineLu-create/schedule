import { describe, expect, it } from "vitest";

import { statusCatalog } from "../../config/v2/referenceData";
import { createEmptyCanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import { toProjectId } from "../../domain/shared/ids";
import {
  canonicalProjectFixtures,
  devProject001,
  devProject002,
  devProject003,
} from "../../fixtures/v2/canonicalProjectFixtures";
import { canonicalScheduleFixtures } from "../../fixtures/v2/canonicalScheduleFixtures";
import {
  customerReferenceFixtures,
  productLineReferenceFixtures,
} from "../../fixtures/v2/referenceFixtures";
import { devTeamTemplateV2 } from "../../fixtures/v2/teamTemplateFixtures";
import { selectOfficialProjectSources } from "../selectors/portfolioSources";
import { prototypeReducer } from "../state/prototypeReducer";
import type { PrototypeState } from "../state/prototypeState";
import { createProject, updateProjectMaster } from "./projectCommands";

const canonicalState: PrototypeState = {
  projects: canonicalProjectFixtures,
  schedules: canonicalScheduleFixtures,
};

function createInput(projectId: string, stnProjectName: string) {
  return {
    projectId: toProjectId(projectId),
    master: {
      ...devProject001.master,
      basicInformation: {
        ...devProject001.master.basicInformation,
        year: 2028,
        productLine: productLineReferenceFixtures[1]!.id,
        stnProjectName,
      },
    },
    qciPm: null,
  };
}

const createContext = {
  existingProjects: canonicalState.projects,
  defaults: {
    customerId: customerReferenceFixtures[0]!.id,
    statusId: statusCatalog[0]!.id,
    teamTemplate: devTeamTemplateV2,
  },
};

describe("canonical Project command integration", () => {
  it("atomically adds a completed Project and exactly one empty same-ID Schedule", () => {
    const created = createProject(
      createInput("integration-created-project", "DEV Integration Project"),
      createContext,
    );
    expect(created.status).toBe("created");
    if (created.status !== "created") return;

    const schedule = createEmptyCanonicalProjectSchedule(created.project.id);
    const next = prototypeReducer(canonicalState, {
      type: "projectAdded",
      project: created.project,
      schedule,
    });

    expect(next.projects).toHaveLength(canonicalState.projects.length + 1);
    expect(next.schedules).toHaveLength(canonicalState.schedules.length + 1);
    expect(next.schedules.at(-1)).toBe(schedule);
    expect(next.schedules.at(-1)).toEqual({
      projectId: created.project.id,
      publishedVersions: [],
      workingDraft: null,
    });
    expect(
      selectOfficialProjectSources(next, created.project.id)?.master,
    ).toBe(created.project.master);
  });

  it("leaves both collections unchanged for rejected Create", () => {
    const result = createProject(
      {
        ...createInput("integration-rejected", "DEV Rejected"),
        master: {
          ...devProject001.master,
          basicInformation: {
            ...devProject001.master.basicInformation,
            year: null,
            productLine: null,
            stnProjectName: "",
          },
        },
      },
      createContext,
    );

    expect(result.status).toBe("rejected");
    expect(canonicalState.projects).toBe(canonicalProjectFixtures);
    expect(canonicalState.schedules).toBe(canonicalScheduleFixtures);
  });

  it("leaves both collections unchanged for duplicate review-required Create", () => {
    const result = createProject(
      {
        ...createInput("integration-duplicate", "Nautilus"),
        master: {
          ...devProject002.master,
          basicInformation: {
            ...devProject002.master.basicInformation,
          },
        },
      },
      createContext,
    );

    expect(result.status).toBe("reviewRequired");
    expect(canonicalState.projects).toBe(canonicalProjectFixtures);
    expect(canonicalState.schedules).toBe(canonicalScheduleFixtures);
  });

  it("replaces Master data while preserving canonical Schedule ownership", () => {
    const master = {
      ...devProject001.master,
      basicInformation: {
        ...devProject001.master.basicInformation,
        stnProjectName: "Manta Renamed",
      },
    };
    const updated = updateProjectMaster(devProject001, {
      master,
      completenessFields: [],
    });

    const next = prototypeReducer(canonicalState, {
      type: "projectReplaced",
      project: updated.project,
    });

    expect(next.schedules).toBe(canonicalScheduleFixtures);
    expect(next.schedules[0]?.projectId).toBe(devProject001.id);
    expect(selectOfficialProjectSources(next, devProject001.id)?.master).toBe(
      master,
    );
  });

  it("keeps locally duplicated business names separated by immutable ProjectId", () => {
    const duplicateNameProject = {
      ...devProject003,
      master: {
        ...devProject003.master,
        basicInformation: {
          ...devProject003.master.basicInformation,
          stnProjectName: devProject002.master.basicInformation.stnProjectName,
        },
      },
    };
    const localState = {
      projects: [devProject002, duplicateNameProject],
      schedules: canonicalScheduleFixtures.slice(1, 3),
    };
    expect(devProject002.id).not.toBe(devProject003.id);
    expect(devProject002.master.basicInformation.stnProjectName).toBe(
      duplicateNameProject.master.basicInformation.stnProjectName,
    );
    expect(selectOfficialProjectSources(localState, devProject002.id)?.projectId).toBe(
      devProject002.id,
    );
    expect(selectOfficialProjectSources(localState, devProject003.id)?.projectId).toBe(
      devProject003.id,
    );
  });
});
