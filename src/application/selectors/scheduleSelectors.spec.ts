import { describe, expect, expectTypeOf, it } from "vitest";

import type { Project } from "../../domain/project/project";
import type { ProjectMaster } from "../../domain/project/projectMaster";
import type { CanonicalScheduleWorkingDraftMilestone } from "../../domain/schedule/canonicalScheduleWorkingDraft";
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
  type MilestoneDefinitionId,
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
  resolveCanonicalScheduleOwner,
  selectCurrentPublishedSchedule,
  selectScheduleWorkingDraft,
  validateCanonicalScheduleState,
  type CurrentPublishedScheduleRead,
  type PublishedScheduleMilestoneRow,
  type ScheduleWorkingDraftMilestoneRow,
  type ScheduleWorkingDraftRead,
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

function draftMilestone(
  id: string,
  milestoneDefinitionId: MilestoneDefinitionId =
    toMilestoneDefinitionId("milestone-design-kickoff"),
  overrides: Partial<CanonicalScheduleWorkingDraftMilestone> = {},
): CanonicalScheduleWorkingDraftMilestone {
  return {
    milestoneId: toMilestoneId(id),
    milestoneDefinitionId,
    applicability: "applicable",
    plan: null,
    actual: null,
    ...overrides,
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

function expectDraftUnavailable(
  read: ScheduleWorkingDraftRead,
  code: string,
  workingDraftExists: boolean,
): void {
  expect(read.kind).toBe("unavailable");
  if (read.kind !== "unavailable") throw new Error("Expected unavailable Draft");
  expect(read.workingDraftExists).toBe(workingDraftExists);
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
  it.each([
    {
      name: "absent Project",
      projects: [] as readonly Project[],
      schedules: [schedule(toProjectId("selected-owner"))],
      code: "schedule.integrity.project-not-found",
    },
    {
      name: "missing Schedule",
      projects: [project("selected-owner")],
      schedules: [] as readonly CanonicalProjectSchedule[],
      code: "schedule.integrity.missing-schedule",
    },
    {
      name: "duplicate Schedule",
      projects: [project("selected-owner")],
      schedules: [
        schedule(toProjectId("selected-owner")),
        schedule(toProjectId("selected-owner")),
      ],
      code: "schedule.integrity.duplicate-schedule",
    },
  ])("resolves $name as unavailable", ({ projects, schedules, code }) => {
    const result = resolveCanonicalScheduleOwner(
      state(projects, schedules),
      toProjectId("selected-owner"),
    );

    expect(result.kind).toBe("unavailable");
    if (result.kind !== "unavailable") throw new Error("Expected unavailable");
    expect(result.issues.map((issue) => issue.code)).toEqual([code]);
  });

  it("returns the exact renamed Project owner despite unrelated defects", () => {
    const selected = project("selected-owner", "Renamed Project");
    const selectedSchedule = schedule(selected.id);
    const unrelated = project("unrelated-owner");
    const malformed = withInvalidVersionNumber(unrelated.id, 0);
    const duplicate = schedule(toProjectId("duplicate-owner"));
    const result = resolveCanonicalScheduleOwner(
      state(
        [selected, unrelated, project("duplicate-owner")],
        [selectedSchedule, malformed, duplicate, { ...duplicate }],
      ),
      selected.id,
    );

    expect(result).toEqual({ kind: "available", schedule: selectedSchedule });
    if (result.kind === "available") {
      expect(result.schedule).toBe(selectedSchedule);
    }
  });

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

describe("canonical Working Draft read", () => {
  it.each([
    {
      name: "absent Project",
      stateValue: state([], []),
      projectId: toProjectId("absent"),
      code: "schedule.integrity.project-not-found",
    },
    {
      name: "missing Schedule",
      stateValue: state([project("missing")], []),
      projectId: toProjectId("missing"),
      code: "schedule.integrity.missing-schedule",
    },
    {
      name: "duplicate Schedule",
      stateValue: state(
        [project("duplicate")],
        [schedule(toProjectId("duplicate")), schedule(toProjectId("duplicate"))],
      ),
      projectId: toProjectId("duplicate"),
      code: "schedule.integrity.duplicate-schedule",
    },
  ] as const)("reports $name as owner unavailable", ({ stateValue, projectId, code }) => {
    expectDraftUnavailable(selectScheduleWorkingDraft(stateValue, projectId), code, false);
  });

  it("distinguishes no Draft, malformed Draft, and a valid Draft", () => {
    const owner = project("draft-owner");
    expect(selectScheduleWorkingDraft(state([owner], [schedule(owner.id)]), owner.id))
      .toEqual({ kind: "noWorkingDraft" });

    const malformed = {
      ...schedule(owner.id),
      workingDraft: {
        milestones: [draftMilestone("bad", toMilestoneDefinitionId("missing"))],
      },
    };
    expectDraftUnavailable(
      selectScheduleWorkingDraft(state([owner], [malformed]), owner.id),
      "schedule.draft.integrity.unresolved-milestone-definition",
      true,
    );
    expect(malformed.workingDraft.milestones).toHaveLength(1);

    const draft = Object.freeze({ milestones: Object.freeze([draftMilestone("valid")]) });
    const read = selectScheduleWorkingDraft(
      state([owner], [{ ...schedule(owner.id), workingDraft: draft }]), owner.id,
    );
    expect(read.kind).toBe("workingDraft");
    if (read.kind !== "workingDraft") throw new Error("Expected Draft");
    expect(read.draft).toBe(draft);
    expect(read.milestoneRows[0]).toEqual(expect.objectContaining({
      milestoneId: toMilestoneId("valid"), phase: "-", plan: null, actual: null,
    }));
  });

  it("reports duplicate Draft milestone identity without normalizing rows", () => {
    const owner = project("duplicate-draft-row");
    const draft = Object.freeze({ milestones: Object.freeze([
      draftMilestone("same"), draftMilestone("same"),
    ]) });
    const read = selectScheduleWorkingDraft(
      state([owner], [{ ...schedule(owner.id), workingDraft: draft }]), owner.id,
    );
    expectDraftUnavailable(read, "schedule.draft.integrity.duplicate-milestone-id", true);
    expect(draft.milestones).toHaveLength(2);
  });

  it("keeps a selected Draft readable despite unrelated ownership and content defects", () => {
    const selected = project("selected", "Renamed selected Project");
    const selectedDraft = Object.freeze({ milestones: Object.freeze([draftMilestone("selected-row")]) });
    const malformedOwner = project("malformed");
    const duplicateOwner = project("duplicate-unrelated");
    const duplicate = schedule(duplicateOwner.id);
    const read = selectScheduleWorkingDraft(state(
      [selected, malformedOwner, duplicateOwner],
      [
        { ...schedule(selected.id), workingDraft: selectedDraft },
        { ...withInvalidVersionNumber(malformedOwner.id, 0), workingDraft: {
          milestones: [draftMilestone("bad", toMilestoneDefinitionId("missing"))],
        } },
        duplicate, { ...duplicate }, schedule(toProjectId("orphan")),
      ],
    ), selected.id);
    expect(read.kind).toBe("workingDraft");
    if (read.kind !== "workingDraft") throw new Error("Expected Draft");
    expect(read.draft).toBe(selectedDraft);
  });

  it("scopes equal raw milestone IDs to the selected Project", () => {
    const first = project("first");
    const second = project("second");
    const value = state([first, second], [
      { ...schedule(first.id), workingDraft: { milestones: [
        draftMilestone("same-raw-id", undefined, { plan: dateOnly("2030-01-01") }),
      ] } },
      { ...schedule(second.id), workingDraft: { milestones: [
        draftMilestone("same-raw-id", undefined, { plan: dateOnly("2040-02-02") }),
      ] } },
    ]);
    const firstRead = selectScheduleWorkingDraft(value, first.id);
    const secondRead = selectScheduleWorkingDraft(value, second.id);
    expect(firstRead.kind).toBe("workingDraft");
    expect(secondRead.kind).toBe("workingDraft");
    if (firstRead.kind !== "workingDraft" || secondRead.kind !== "workingDraft") {
      throw new Error("Expected Project-scoped Drafts");
    }
    expect(firstRead.milestoneRows[0]?.plan).toBe(dateOnly("2030-01-01"));
    expect(secondRead.milestoneRows[0]?.plan).toBe(dateOnly("2040-02-02"));
  });

  it("projects ordered canonical rows with raw editable dates and no mutation", () => {
    expectTypeOf<ScheduleWorkingDraftMilestoneRow["plan"]>()
      .toEqualTypeOf<DateOnly | null>();
    expectTypeOf<ScheduleWorkingDraftMilestoneRow["actual"]>()
      .toEqualTypeOf<DateOnly | null>();
    const owner = project("projection-owner");
    const later = Object.freeze(draftMilestone("later", toMilestoneDefinitionId("milestone-c1-c-smt"), {
      plan: dateOnly("2026-10-15"), actual: null,
    }));
    const earlier = Object.freeze(draftMilestone("earlier", toMilestoneDefinitionId("milestone-design-kickoff"), {
      applicability: "notApplicable", plan: null, actual: dateOnly("2026-09-11"),
    }));
    const draft = Object.freeze({ milestones: Object.freeze([later, earlier]) });
    const read = selectScheduleWorkingDraft(
      state([owner], [{ ...schedule(owner.id), workingDraft: draft }]), owner.id,
    );
    expect(read.kind).toBe("workingDraft");
    if (read.kind !== "workingDraft") throw new Error("Expected Draft");
    expect(read.draft).toBe(draft);
    expect(read.milestoneRows).toEqual([
      { milestoneId: earlier.milestoneId, phase: "-", stage: "Design", milestone: "Kickoff",
        applicability: "notApplicable", plan: null, actual: dateOnly("2026-09-11") },
      { milestoneId: later.milestoneId, phase: "-", stage: "C1-stage", milestone: "C-SMT",
        applicability: "applicable", plan: dateOnly("2026-10-15"), actual: null },
    ]);
    expect(draft.milestones).toEqual([later, earlier]);
  });

  it("keeps valid Draft independent from malformed Published history", () => {
    const owner = project("bad-published");
    const draft = { milestones: [draftMilestone("valid-draft-row")] };
    const current = state([owner], [{ ...withInvalidVersionNumber(owner.id, 0), workingDraft: draft }]);
    const read = selectScheduleWorkingDraft(current, owner.id);
    expect(read.kind).toBe("workingDraft");
    if (read.kind !== "workingDraft") throw new Error("Expected Draft");
    expect(read.draft).toBe(draft);
    expectUnavailableCode(selectCurrentPublishedSchedule(current, owner.id),
      "schedule.integrity.invalid-version-number");
  });
});

describe("Draft diagnostics and Official isolation", () => {
  it("does not add diagnostics for a valid Draft", () => {
    const owner = project("healthy-draft");
    expect(validateCanonicalScheduleState(state([owner], [
      { ...schedule(owner.id), workingDraft: { milestones: [draftMilestone("valid")] } },
    ]))).toEqual([]);
  });

  it("accumulates ownership, Published, and Draft defects globally", () => {
    const missing = project("missing");
    const duplicateOwner = project("duplicate");
    const duplicate = schedule(duplicateOwner.id);
    const malformedOwner = project("malformed");
    const malformed = { ...withInvalidVersionNumber(malformedOwner.id, 0), workingDraft: {
      milestones: [draftMilestone("same"), draftMilestone("same", toMilestoneDefinitionId("missing"))],
    } };
    const current = state(
      [missing, duplicateOwner, malformedOwner],
      [duplicate, { ...duplicate }, malformed, schedule(toProjectId("orphan"))],
    );
    expect(validateCanonicalScheduleState(current).map(({ code }) => code))
      .toEqual(expect.arrayContaining([
        "schedule.integrity.missing-schedule",
        "schedule.integrity.duplicate-schedule",
        "schedule.integrity.orphan-schedule",
        "schedule.integrity.invalid-version-number",
        "schedule.draft.integrity.duplicate-milestone-id",
        "schedule.draft.integrity.unresolved-milestone-definition",
      ]));
    expect(malformed.workingDraft.milestones).toHaveLength(2);
  });

  it("keeps no-Published Official truth healthy beside a malformed Draft", () => {
    const owner = project("no-published");
    const malformed = { ...schedule(owner.id), workingDraft: {
      milestones: [draftMilestone("bad", toMilestoneDefinitionId("missing"))],
    } };
    expect(selectCurrentPublishedSchedule(state([owner], [malformed]), owner.id))
      .toEqual({ kind: "noPublishedSchedule" });
  });
});
