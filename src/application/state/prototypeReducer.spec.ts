import { describe, expect, it } from "vitest";

import type { Project } from "../../domain/project/project";
import type { ProjectMaster } from "../../domain/project/projectMaster";
import {
  createEmptyCanonicalProjectSchedule,
  type CanonicalProjectSchedule,
} from "../../domain/schedule/officialSchedule";
import { toScheduleVersionNumber } from "../../domain/schedule/schedule";
import { toProjectId, type ProjectId } from "../../domain/shared/ids";
import { prototypeReducer, type PrototypeAction } from "./prototypeReducer";
import type { PrototypeState } from "./prototypeState";

function makeProject(id: string, stnProjectName: string): Project {
  return {
    id: toProjectId(id),
    master: {
      basicInformation: { stnProjectName },
    } as ProjectMaster,
    identityAliases: [],
    team: null,
  } as Project;
}

function makeState(
  projects: readonly Project[],
  schedules: readonly CanonicalProjectSchedule[],
): PrototypeState {
  return { projects, schedules } as PrototypeState;
}

function nonEmptySchedule(projectId: ProjectId): CanonicalProjectSchedule {
  return {
    projectId,
    publishedVersions: [
      {
        versionNumber: toScheduleVersionNumber(1),
        versionNote: null,
        publishedAt: "2026-09-10T00:00:00Z",
        milestones: [],
      },
    ],
    workingDraft: null,
  };
}

function expectAtomicRejection(
  state: PrototypeState,
  action: PrototypeAction,
): void {
  const projects = state.projects;
  const schedules = state.schedules;
  const projectValues = structuredClone(state.projects);
  const scheduleValues = structuredClone(state.schedules);

  expect(() => prototypeReducer(state, action)).toThrow();
  expect(state.projects).toBe(projects);
  expect(state.schedules).toBe(schedules);
  expect(state.projects).toEqual(projectValues);
  expect(state.schedules).toEqual(scheduleValues);
}

describe("prototypeReducer projectAdded", () => {
  it("atomically appends one Project and its same-ID empty Schedule", () => {
    const existing = makeProject("dev-project-001", "Fixture Project Alpha");
    const existingSchedule = createEmptyCanonicalProjectSchedule(existing.id);
    const added = makeProject("dev-project-002", "Fixture Project Beta");
    const addedSchedule = createEmptyCanonicalProjectSchedule(added.id);
    const state = makeState(
      Object.freeze([existing]),
      Object.freeze([existingSchedule]),
    );

    const next = prototypeReducer(state, {
      type: "projectAdded",
      project: added,
      schedule: addedSchedule,
    });

    expect(next.projects).toEqual([existing, added]);
    expect(next.schedules).toEqual([existingSchedule, addedSchedule]);
    expect(next.projects).not.toBe(state.projects);
    expect(next.schedules).not.toBe(state.schedules);
    expect(state.projects).toEqual([existing]);
    expect(state.schedules).toEqual([existingSchedule]);
  });

  it("rejects an existing ProjectId without changing either collection", () => {
    const existing = makeProject("dev-project-001", "Fixture Project Alpha");
    const state = makeState(
      Object.freeze([existing]),
      Object.freeze([createEmptyCanonicalProjectSchedule(existing.id)]),
    );
    const duplicate = makeProject("dev-project-001", "Different Name");

    expectAtomicRejection(state, {
      type: "projectAdded",
      project: duplicate,
      schedule: createEmptyCanonicalProjectSchedule(duplicate.id),
    });
  });

  it("rejects a Schedule owned by a different ProjectId atomically", () => {
    const added = makeProject("dev-project-002", "Fixture Project Beta");
    const state = makeState([], []);

    expectAtomicRejection(state, {
      type: "projectAdded",
      project: added,
      schedule: createEmptyCanonicalProjectSchedule(
        toProjectId("dev-project-other"),
      ),
    });
  });

  it("rejects duplicate Schedule ownership atomically", () => {
    const added = makeProject("dev-project-002", "Fixture Project Beta");
    const state = makeState(
      [],
      [createEmptyCanonicalProjectSchedule(added.id)],
    );

    expectAtomicRejection(state, {
      type: "projectAdded",
      project: added,
      schedule: createEmptyCanonicalProjectSchedule(added.id),
    });
  });

  it("rejects a non-empty creation Schedule atomically", () => {
    const added = makeProject("dev-project-002", "Fixture Project Beta");
    const state = makeState([], []);

    expectAtomicRejection(state, {
      type: "projectAdded",
      project: added,
      schedule: nonEmptySchedule(added.id),
    });
  });

  it("rejects a non-null Draft on Project creation atomically", () => {
    const project = makeProject("new-project", "New Project");
    const state = makeState([], []);
    const contaminated = {
      ...createEmptyCanonicalProjectSchedule(project.id),
      workingDraft: { milestones: [] },
    } as unknown as CanonicalProjectSchedule;

    expectAtomicRejection(state, {
      type: "projectAdded",
      project,
      schedule: contaminated,
    });
  });

  it("rejects a Project payload contaminated with an own schedule property", () => {
    const project = makeProject("dev-project-002", "Fixture Project Beta");
    const contaminated = {
      ...project,
      schedule: { publishedVersions: [], workingDraft: null },
    } as Project;
    const state = makeState([], []);

    expectAtomicRejection(state, {
      type: "projectAdded",
      project: contaminated,
      schedule: createEmptyCanonicalProjectSchedule(project.id),
    });
  });
});

describe("prototypeReducer projectReplaced", () => {
  it("replaces Project data while preserving Schedule ownership by reference", () => {
    const original = makeProject("dev-project-001", "Fixture Project Alpha");
    const schedule = nonEmptySchedule(original.id);
    const replacement = makeProject(
      "dev-project-001",
      "Fixture Project Alpha Renamed",
    );
    const schedules = Object.freeze([schedule]);
    const state = makeState(Object.freeze([original]), schedules);

    const next = prototypeReducer(state, {
      type: "projectReplaced",
      project: replacement,
    });

    expect(next.projects).toEqual([replacement]);
    expect(next.schedules).toBe(schedules);
    expect(next.schedules[0]?.projectId).toBe(original.id);
  });

  it("rejects replacement of an unknown ProjectId without mutation", () => {
    const existing = makeProject("dev-project-001", "Fixture Project Alpha");
    const state = makeState(
      Object.freeze([existing]),
      Object.freeze([createEmptyCanonicalProjectSchedule(existing.id)]),
    );
    const unknown = makeProject("dev-project-999", "Unknown Project");

    expectAtomicRejection(state, {
      type: "projectReplaced",
      project: unknown,
    });
  });

  it("rejects a contaminated replacement and preserves both collections", () => {
    const existing = makeProject("dev-project-001", "Fixture Project Alpha");
    const state = makeState(
      Object.freeze([existing]),
      Object.freeze([createEmptyCanonicalProjectSchedule(existing.id)]),
    );
    const contaminated = {
      ...makeProject("dev-project-001", "Fixture Project Updated"),
      schedule: { publishedVersions: [], workingDraft: null },
    } as Project;

    expectAtomicRejection(state, {
      type: "projectReplaced",
      project: contaminated,
    });
  });
});
