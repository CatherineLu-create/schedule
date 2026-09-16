import { describe, expect, expectTypeOf, it } from "vitest";

import type { Project } from "../../domain/project/project";
import type { ProjectMaster } from "../../domain/project/projectMaster";
import type {
  CanonicalProjectSchedule,
  CanonicalPublishedScheduleMilestone,
  CanonicalPublishedScheduleVersion,
} from "../../domain/schedule/officialSchedule";
import {
  toScheduleVersionNumber,
  type ScheduleVersionNumber,
} from "../../domain/schedule/schedule";
import { parseDateOnly, type DateOnly } from "../../domain/shared/dateOnly";
import {
  toMilestoneDefinitionId,
  toMilestoneId,
  toProjectId,
  type MilestoneId,
  type ProjectId,
} from "../../domain/shared/ids";
import {
  canonicalProjectFixtures,
  devProject001,
} from "../../fixtures/v2/canonicalProjectFixtures";
import {
  canonicalScheduleFixtures,
  devSchedule001,
} from "../../fixtures/v2/canonicalScheduleFixtures";
import type { PrototypeState } from "../state/prototypeState";
import {
  selectCurrentPublishedSchedule,
  validateCanonicalScheduleState,
  type CurrentPublishedScheduleRead,
  type PublishedScheduleMilestoneRow,
} from "./scheduleSelectors";

function dateOnly(value: string): DateOnly {
  const parsed = parseDateOnly(value);

  if (parsed === null) {
    throw new Error(`Invalid test DateOnly: ${value}`);
  }

  return parsed;
}

function project(id: string, name = id): Project {
  return {
    id: toProjectId(id),
    master: {
      basicInformation: { stnProjectName: name },
    } as ProjectMaster,
    identityAliases: [],
    team: null,
  };
}

function milestone(
  id: string,
  definitionId = "milestone-design-kickoff",
  overrides: Partial<CanonicalPublishedScheduleMilestone> = {},
): CanonicalPublishedScheduleMilestone {
  return {
    milestoneId: toMilestoneId(id),
    milestoneDefinitionId: toMilestoneDefinitionId(definitionId),
    applicability: "applicable",
    plan: null,
    actual: null,
    ...overrides,
  };
}

function version(
  value: number,
  milestones: readonly CanonicalPublishedScheduleMilestone[] = [],
): CanonicalPublishedScheduleVersion {
  return {
    versionNumber: toScheduleVersionNumber(value),
    versionNote: null,
    publishedAt: `published-${value}`,
    milestones,
  };
}

function schedule(
  owner: ProjectId,
  publishedVersions: readonly CanonicalPublishedScheduleVersion[] = [],
): CanonicalProjectSchedule {
  return {
    projectId: owner,
    publishedVersions,
    workingDraft: null,
  };
}

function state(
  projects: readonly Project[],
  schedules: readonly CanonicalProjectSchedule[],
): PrototypeState {
  return { projects, schedules };
}

function withInvalidVersionNumber(
  owner: ProjectId,
  value: number,
): CanonicalProjectSchedule {
  return schedule(owner, [
    {
      ...version(1),
      versionNumber: value as ScheduleVersionNumber,
    },
  ]);
}

function expectUnavailableCode(
  read: CurrentPublishedScheduleRead,
  code: string,
): void {
  expect(read.kind).toBe("unavailable");

  if (read.kind !== "unavailable") {
    throw new Error(`Expected unavailable, received ${read.kind}`);
  }

  expect(read.issues.map((issue) => issue.code)).toContain(code);
}

describe("canonical Schedule state validation", () => {
  it("accepts healthy one-to-one canonical Project and Schedule ownership", () => {
    expect(
      validateCanonicalScheduleState(
        state(canonicalProjectFixtures, canonicalScheduleFixtures),
      ),
    ).toEqual([]);
  });

  it("reports a Project with no Schedule", () => {
    const owner = project("project-missing-schedule");

    expect(validateCanonicalScheduleState(state([owner], []))).toEqual([
      expect.objectContaining({
        code: "schedule.integrity.missing-schedule",
        domain: "schedule",
        source: "data",
        severity: "blocking",
        target: expect.objectContaining({ entityId: owner.id }),
      }),
    ]);
  });

  it("reports duplicate Schedule ownership without choosing an entry", () => {
    const owner = project("project-duplicate-schedule");
    const ownedSchedule = schedule(owner.id);

    expect(
      validateCanonicalScheduleState(
        state([owner], [ownedSchedule, { ...ownedSchedule }]),
      ).map((issue) => issue.code),
    ).toEqual(["schedule.integrity.duplicate-schedule"]);
  });

  it("reports an orphan Schedule whose ProjectId does not exist", () => {
    const orphan = schedule(toProjectId("project-orphan"));

    expect(
      validateCanonicalScheduleState(state([], [orphan])).map(
        (issue) => issue.code,
      ),
    ).toEqual(["schedule.integrity.orphan-schedule"]);
  });

  it("includes local integrity issues from a canonical Schedule", () => {
    const owner = project("project-local-invalid");

    expect(
      validateCanonicalScheduleState(
        state([owner], [withInvalidVersionNumber(owner.id, 0)]),
      ).map((issue) => issue.code),
    ).toEqual(["schedule.integrity.invalid-version-number"]);
  });

  it("reports every ownership and local defect without normalizing state", () => {
    const duplicateOwner = project("project-all-duplicate");
    const missingOwner = project("project-all-missing");
    const duplicate = schedule(duplicateOwner.id);
    const orphanId = toProjectId("project-all-orphan");
    const invalidOrphan = withInvalidVersionNumber(orphanId, 0);

    const issues = validateCanonicalScheduleState(
      state(
        [duplicateOwner, missingOwner],
        [duplicate, { ...duplicate }, invalidOrphan],
      ),
    );

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "schedule.integrity.missing-schedule",
        "schedule.integrity.duplicate-schedule",
        "schedule.integrity.orphan-schedule",
        "schedule.integrity.invalid-version-number",
      ]),
    );
    expect(issues).toHaveLength(4);
  });
});

describe("selected canonical Schedule ownership", () => {
  it("returns project-not-found when the selected ProjectId is absent", () => {
    const absentId = toProjectId("project-absent");

    expectUnavailableCode(
      selectCurrentPublishedSchedule(
        state([], [schedule(absentId)]),
        absentId,
      ),
      "schedule.integrity.project-not-found",
    );
  });

  it("returns missing-schedule for a selected Project with no Schedule", () => {
    const owner = project("project-selected-missing");

    expectUnavailableCode(
      selectCurrentPublishedSchedule(state([owner], []), owner.id),
      "schedule.integrity.missing-schedule",
    );
  });

  it("returns duplicate-schedule rather than choosing a selected entry", () => {
    const owner = project("project-selected-duplicate");
    const first = schedule(owner.id);

    expectUnavailableCode(
      selectCurrentPublishedSchedule(
        state([owner], [first, { ...first }]),
        owner.id,
      ),
      "schedule.integrity.duplicate-schedule",
    );
  });

  it("keeps Schedule ownership stable when the Project is renamed", () => {
    const renamedProject: Project = {
      ...canonicalProjectFixtures[1]!,
      master: {
        ...canonicalProjectFixtures[1]!.master,
        basicInformation: {
          ...canonicalProjectFixtures[1]!.master.basicInformation,
          stnProjectName: "Renamed without changing identity",
        },
      },
    };

    expect(
      selectCurrentPublishedSchedule(
        state([renamedProject], [canonicalScheduleFixtures[1]!]),
        renamedProject.id,
      ),
    ).toEqual({ kind: "noPublishedSchedule" });
  });
});

describe("selected Schedule isolation from unrelated defects", () => {
  it("keeps a valid selected Schedule readable when an unrelated orphan exists", () => {
    const selectedProject = project("project-selected-orphan-isolation");
    const selectedSchedule = schedule(selectedProject.id);
    const orphan = schedule(toProjectId("project-unrelated-orphan"));
    const currentState = state([selectedProject], [selectedSchedule, orphan]);

    expect(
      validateCanonicalScheduleState(currentState).map((issue) => issue.code),
    ).toContain("schedule.integrity.orphan-schedule");
    expect(
      selectCurrentPublishedSchedule(currentState, selectedProject.id),
    ).toEqual({ kind: "noPublishedSchedule" });
  });

  it("keeps a valid selected Schedule readable when another Schedule is malformed", () => {
    const selectedProject = project("project-selected-local-isolation");
    const malformedProject = project("project-unrelated-malformed");
    const currentState = state(
      [selectedProject, malformedProject],
      [
        schedule(selectedProject.id),
        withInvalidVersionNumber(malformedProject.id, 0),
      ],
    );

    expect(
      validateCanonicalScheduleState(currentState).map((issue) => issue.code),
    ).toContain("schedule.integrity.invalid-version-number");
    expect(
      selectCurrentPublishedSchedule(currentState, selectedProject.id),
    ).toEqual({ kind: "noPublishedSchedule" });
  });

  it("does not let unrelated missing or duplicate ownership suppress the selected read", () => {
    const selectedProject = project("project-selected-owner-isolation");
    const missingProject = project("project-unrelated-missing");
    const duplicateProject = project("project-unrelated-duplicate");
    const duplicate = schedule(duplicateProject.id);
    const currentState = state(
      [selectedProject, missingProject, duplicateProject],
      [schedule(selectedProject.id), duplicate, { ...duplicate }],
    );

    expect(
      validateCanonicalScheduleState(currentState).map((issue) => issue.code),
    ).toEqual(
      expect.arrayContaining([
        "schedule.integrity.missing-schedule",
        "schedule.integrity.duplicate-schedule",
      ]),
    );
    expect(
      selectCurrentPublishedSchedule(currentState, selectedProject.id),
    ).toEqual({ kind: "noPublishedSchedule" });
  });
});

describe("Current Published selection", () => {
  it.each(["valid", "malformed"] as const)(
    "keeps healthy Current Published unchanged beside a %s Draft",
    (draftKind) => {
      const owner = project(`official-${draftKind}`);
      const current = version(3, [milestone("official-row")]);
      const base = schedule(owner.id, [current]);
      const baseline = selectCurrentPublishedSchedule(
        state([owner], [base]),
        owner.id,
      );
      expect(baseline.kind).toBe("published");
      if (baseline.kind !== "published") throw new Error("Expected baseline");

      const workingDraft = draftKind === "valid"
        ? { milestones: [{ ...current.milestones[0]! }] }
        : {
            milestones: [{
              ...current.milestones[0]!,
              milestoneDefinitionId: toMilestoneDefinitionId("missing"),
            }],
          };
      const scheduleWithDraft = {
        ...base,
        workingDraft,
      } as unknown as CanonicalProjectSchedule;
      const read = selectCurrentPublishedSchedule(
        state([owner], [scheduleWithDraft]),
        owner.id,
      );

      expect(read.kind).toBe("published");
      if (read.kind !== "published") throw new Error("Expected Published read");
      expect(read.version).toBe(current);
      expect(read.milestoneRows).toEqual(baseline.milestoneRows);
    },
  );

  it("distinguishes a valid empty Published history from unavailable data", () => {
    const owner = project("project-no-published");

    expect(
      selectCurrentPublishedSchedule(
        state([owner], [schedule(owner.id)]),
        owner.id,
      ),
    ).toEqual({ kind: "noPublishedSchedule" });
  });

  it("returns the exact sole Published snapshot object", () => {
    const owner = project("project-one-published");
    const publishedV1 = Object.freeze(version(1));
    const read = selectCurrentPublishedSchedule(
      state([owner], [schedule(owner.id, [publishedV1])]),
      owner.id,
    );

    expect(read.kind).toBe("published");
    if (read.kind === "published") {
      expect(read.version).toBe(publishedV1);
    }
  });

  it("returns the exact maximum non-contiguous version regardless of array order", () => {
    const owner = project("project-max-published");
    const publishedV3 = Object.freeze(version(3));
    const publishedV1 = Object.freeze(version(1));
    const history = Object.freeze([publishedV3, publishedV1]);
    const ownedSchedule = Object.freeze(schedule(owner.id, history));

    const read = selectCurrentPublishedSchedule(
      state([owner], [ownedSchedule]),
      owner.id,
    );

    expect(read.kind).toBe("published");
    if (read.kind === "published") {
      expect(read.version).toBe(publishedV3);
      expect(read.version.versionNumber).toBe(3);
      expect(read.versionLabel).toBe("Published v03");
    }
    expect(ownedSchedule.publishedVersions).toBe(history);
    expect(history).toEqual([publishedV3, publishedV1]);
  });

  it("returns a valid published result when Current Published has zero milestones", () => {
    const owner = project("project-zero-milestones");
    const publishedV1 = version(1, []);
    const read = selectCurrentPublishedSchedule(
      state([owner], [schedule(owner.id, [publishedV1])]),
      owner.id,
    );

    expect(read).toEqual({
      kind: "published",
      version: publishedV1,
      versionLabel: "Published v01",
      milestoneRows: [],
    });
  });
});

describe("selected Schedule local integrity", () => {
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "returns unavailable for invalid version number %s",
    (invalidVersionNumber) => {
      const owner = project(`project-invalid-${invalidVersionNumber}`);

      expectUnavailableCode(
        selectCurrentPublishedSchedule(
          state(
            [owner],
            [withInvalidVersionNumber(owner.id, invalidVersionNumber)],
          ),
          owner.id,
        ),
        "schedule.integrity.invalid-version-number",
      );
    },
  );

  it("returns unavailable for duplicate version numbers", () => {
    const owner = project("project-duplicate-version");

    expectUnavailableCode(
      selectCurrentPublishedSchedule(
        state([owner], [schedule(owner.id, [version(2), version(2)])]),
        owner.id,
      ),
      "schedule.integrity.duplicate-version-number",
    );
  });

  it("returns unavailable for a duplicate milestoneId inside one snapshot", () => {
    const owner = project("project-duplicate-milestone");
    const first = milestone("milestone-duplicate");
    const duplicate = milestone(
      "milestone-duplicate",
      "milestone-c1-c-smt",
    );

    expectUnavailableCode(
      selectCurrentPublishedSchedule(
        state(
          [owner],
          [schedule(owner.id, [version(1, [first, duplicate])])],
        ),
        owner.id,
      ),
      "schedule.integrity.duplicate-milestone-id",
    );
  });

  it("returns unavailable for an unresolved milestone definition", () => {
    const owner = project("project-unresolved-definition");
    const unresolved = milestone(
      "milestone-unresolved",
      "milestone-definition-missing",
    );

    expectUnavailableCode(
      selectCurrentPublishedSchedule(
        state(
          [owner],
          [schedule(owner.id, [version(1, [unresolved])])],
        ),
        owner.id,
      ),
      "schedule.integrity.unresolved-milestone-definition",
    );
  });

  it("allows the same milestoneId to preserve lineage across versions", () => {
    const owner = project("project-valid-lineage");
    const continuingMilestone = milestone("milestone-continuing");
    const read = selectCurrentPublishedSchedule(
      state(
        [owner],
        [
          schedule(owner.id, [
            version(3, [continuingMilestone]),
            version(1, [{ ...continuingMilestone }]),
          ]),
        ],
      ),
      owner.id,
    );

    expect(read.kind).toBe("published");
    if (read.kind === "published") {
      expect(read.version.versionNumber).toBe(3);
      expect(read.milestoneRows[0]?.milestoneId).toBe(
        continuingMilestone.milestoneId,
      );
    }
  });
});

describe("Current Published milestone projection", () => {
  it("projects catalog labels, applicability, dates, and definition order without mutation", () => {
    expectTypeOf<PublishedScheduleMilestoneRow>().toEqualTypeOf<{
      readonly milestoneId: MilestoneId;
      readonly phase: string;
      readonly stage: string;
      readonly milestone: string;
      readonly applicability: "applicable" | "notApplicable";
      readonly plan: string;
      readonly actual: string;
    }>();

    const owner = project("project-projection");
    const laterDefinition = Object.freeze(
      milestone("milestone-c1", "milestone-c1-c-smt", {
        applicability: "applicable",
        plan: null,
        actual: dateOnly("2026-10-15"),
      }),
    );
    const earlierDefinition = Object.freeze(
      milestone("milestone-design", "milestone-design-kickoff", {
        applicability: "notApplicable",
        plan: dateOnly("2026-10-05"),
        actual: null,
      }),
    );
    const snapshot = Object.freeze([laterDefinition, earlierDefinition]);
    const publishedV3 = Object.freeze(version(3, snapshot));

    const read = selectCurrentPublishedSchedule(
      state([owner], [schedule(owner.id, [publishedV3])]),
      owner.id,
    );

    expect(read).toEqual({
      kind: "published",
      version: publishedV3,
      versionLabel: "Published v03",
      milestoneRows: [
        {
          milestoneId: earlierDefinition.milestoneId,
          phase: "-",
          stage: "Design",
          milestone: "Kickoff",
          applicability: "notApplicable",
          plan: "2026/10/05",
          actual: "-",
        },
        {
          milestoneId: laterDefinition.milestoneId,
          phase: "-",
          stage: "C1-stage",
          milestone: "C-SMT",
          applicability: "applicable",
          plan: "-",
          actual: "2026/10/15",
        },
      ],
    });
    expect(snapshot).toEqual([laterDefinition, earlierDefinition]);
  });

  it("projects the single Published Manta demo fixture without replacing its snapshot", () => {
    const read = selectCurrentPublishedSchedule(
      state([canonicalProjectFixtures[0]!], [devSchedule001]),
      devSchedule001.projectId,
    );

    expect(read.kind).toBe("published");
    if (read.kind === "published") {
      expect(read.version).toBe(devSchedule001.publishedVersions[0]);
      expect(read.version.versionNumber).toBe(1);
      expect(read.versionLabel).toBe("Published v01");
    }
  });
});
