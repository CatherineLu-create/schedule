import { describe, expect, expectTypeOf, it } from "vitest";

import { parseDateOnly, type DateOnly } from "../shared/dateOnly";
import {
  toMilestoneDefinitionId,
  toMilestoneId,
  toMilestoneTypeId,
  toProjectId,
  toStageGroupId,
  type MilestoneDefinitionId,
  type MilestoneId,
  type ProjectId,
} from "../shared/ids";
import type { MilestoneDefinition } from "./milestoneCatalog";
import {
  createEmptyCanonicalProjectSchedule,
  getCurrentPublishedVersion,
  orderPublishedMilestonesByDefinition,
  validateCanonicalProjectSchedule,
  type CanonicalProjectSchedule,
  type CanonicalPublishedScheduleMilestone,
  type CanonicalPublishedScheduleVersion,
} from "./officialSchedule";
import {
  toScheduleVersionNumber,
  type ScheduleVersionNumber,
} from "./schedule";

function dateOnly(value: string): DateOnly {
  const parsed = parseDateOnly(value);

  if (parsed === null) {
    throw new Error(`Invalid test date: ${value}`);
  }

  return parsed;
}

function definition(
  id: string,
  displayOrder: number,
  overrides: Partial<MilestoneDefinition> = {},
): MilestoneDefinition {
  return {
    id: toMilestoneDefinitionId(id),
    name: id,
    stageGroupId: toStageGroupId(`stage-${id}`),
    milestoneTypeId: toMilestoneTypeId(`type-${id}`),
    displayOrder,
    active: true,
    reviewStatus: "reviewed",
    aliases: [],
    showInPortfolio: false,
    ...overrides,
  };
}

const definitionA = definition("definition-a", 20, { name: "Shared Name" });
const definitionB = definition("definition-b", 10);
const definitionC = definition("definition-c", 20);
const definitions = [definitionA, definitionB, definitionC] as const;

function milestone(
  id: string,
  milestoneDefinitionId: MilestoneDefinitionId = definitionA.id,
  overrides: Partial<CanonicalPublishedScheduleMilestone> = {},
): CanonicalPublishedScheduleMilestone {
  return {
    milestoneId: toMilestoneId(id),
    milestoneDefinitionId,
    applicability: "applicable",
    plan: dateOnly("2026-09-15"),
    actual: null,
    ...overrides,
  };
}

function version(
  versionNumber: number,
  milestones: readonly CanonicalPublishedScheduleMilestone[] = [],
): CanonicalPublishedScheduleVersion {
  return {
    versionNumber: toScheduleVersionNumber(versionNumber),
    versionNote: null,
    publishedAt: `publication-${versionNumber}`,
    milestones,
  };
}

function schedule(
  projectId: string,
  publishedVersions: readonly CanonicalPublishedScheduleVersion[],
): CanonicalProjectSchedule {
  return {
    projectId: toProjectId(projectId),
    publishedVersions,
  };
}

function issueCodes(value: CanonicalProjectSchedule): string[] {
  return validateCanonicalProjectSchedule(value, definitions).map(
    (issue) => issue.code,
  );
}

describe("canonical official Schedule model", () => {
  it("contains only the approved ownership and Published snapshot fields", () => {
    const row = milestone("milestone-a");
    const published = version(1, [row]);
    const empty = createEmptyCanonicalProjectSchedule(
      toProjectId("project-empty"),
    );

    expect(empty).toEqual({
      projectId: "project-empty",
      publishedVersions: [],
    });
    expect(Object.keys(empty)).toEqual(["projectId", "publishedVersions"]);
    expect(Object.keys(published)).toEqual([
      "versionNumber",
      "versionNote",
      "publishedAt",
      "milestones",
    ]);
    expect(Object.keys(row)).toEqual([
      "milestoneId",
      "milestoneDefinitionId",
      "applicability",
      "plan",
      "actual",
    ]);
    expectTypeOf<keyof CanonicalProjectSchedule>().toEqualTypeOf<
      "projectId" | "publishedVersions"
    >();
    expectTypeOf<keyof CanonicalPublishedScheduleVersion>().toEqualTypeOf<
      "versionNumber" | "versionNote" | "publishedAt" | "milestones"
    >();
    expectTypeOf<keyof CanonicalPublishedScheduleMilestone>().toEqualTypeOf<
      | "milestoneId"
      | "milestoneDefinitionId"
      | "applicability"
      | "plan"
      | "actual"
    >();
    expectTypeOf(empty.projectId).toEqualTypeOf<ProjectId>();
    expectTypeOf(row.milestoneId).toEqualTypeOf<MilestoneId>();
  });

  it("selects Current Published by maximum version number without mutation", () => {
    const publishedV1 = Object.freeze(version(1));
    const publishedV3 = Object.freeze(version(3));
    const history = Object.freeze([publishedV3, publishedV1]);
    const ownedSchedule = Object.freeze(
      schedule("project-current", history),
    );

    expect(getCurrentPublishedVersion(createEmptyCanonicalProjectSchedule(
      toProjectId("project-none"),
    ))).toBeNull();
    expect(
      getCurrentPublishedVersion(schedule("project-one", [publishedV1])),
    ).toBe(publishedV1);
    expect(getCurrentPublishedVersion(ownedSchedule)).toBe(publishedV3);
    expect(ownedSchedule.publishedVersions).toBe(history);
    expect(history).toEqual([publishedV3, publishedV1]);
    expect(issueCodes(ownedSchedule)).toEqual([]);
  });
});

describe("canonical Schedule read integrity", () => {
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid version number %s",
    (invalidVersionNumber) => {
      const invalid = {
        ...version(1),
        versionNumber: invalidVersionNumber as ScheduleVersionNumber,
      };

      const issues = validateCanonicalProjectSchedule(
        schedule("project-invalid-version", [invalid]),
        definitions,
      );

      expect(issues).toEqual([
        expect.objectContaining({
          code: "schedule.integrity.invalid-version-number",
          domain: "schedule",
          source: "data",
          severity: "blocking",
        }),
      ]);
    },
  );

  it("rejects duplicate version numbers without choosing by array position", () => {
    expect(
      issueCodes(schedule("project-duplicate-version", [version(2), version(2)])),
    ).toEqual(["schedule.integrity.duplicate-version-number"]);
  });

  it("rejects a duplicate milestoneId only within the same version", () => {
    const first = milestone("milestone-lineage", definitionA.id);
    const duplicate = milestone("milestone-lineage", definitionB.id);

    expect(
      issueCodes(
        schedule("project-duplicate-milestone", [version(1, [first, duplicate])]),
      ),
    ).toEqual(["schedule.integrity.duplicate-milestone-id"]);
    expect(
      issueCodes(
        schedule("project-valid-lineage", [
          version(1, [first]),
          version(2, [duplicate]),
        ]),
      ),
    ).toEqual([]);
  });

  it("keeps milestone identity separate from definition classification", () => {
    const first = milestone("milestone-first", definitionA.id);
    const second = milestone("milestone-second", definitionA.id);

    const issues = validateCanonicalProjectSchedule(
      schedule("project-same-name", [version(1, [first, second])]),
      definitions,
    );

    expect(first.milestoneId).not.toBe(second.milestoneId);
    expect(first.milestoneDefinitionId).toBe(second.milestoneDefinitionId);
    expect(definitionA.name).toBe("Shared Name");
    expect(issues).toEqual([]);
  });

  it("allows different Projects to reuse a raw milestoneId", () => {
    const sharedId = "milestone-shared-raw-value";
    const first = schedule("project-first", [
      version(1, [milestone(sharedId)]),
    ]);
    const second = schedule("project-second", [
      version(1, [milestone(sharedId)]),
    ]);

    expect(first.projectId).not.toBe(second.projectId);
    expect(first.publishedVersions[0]?.milestones[0]?.milestoneId).toBe(
      second.publishedVersions[0]?.milestones[0]?.milestoneId,
    );
    expect(validateCanonicalProjectSchedule(first, definitions)).toEqual([]);
    expect(validateCanonicalProjectSchedule(second, definitions)).toEqual([]);
  });

  it("rejects unresolved milestone definitions", () => {
    const unresolved = milestone(
      "milestone-unresolved",
      toMilestoneDefinitionId("definition-missing"),
    );

    expect(
      issueCodes(schedule("project-unresolved", [version(1, [unresolved])])),
    ).toEqual(["schedule.integrity.unresolved-milestone-definition"]);
  });

  it("does not invent validation beyond approved read integrity", () => {
    const inactiveUnreviewed = definition("definition-inactive", 40, {
      active: false,
      reviewStatus: "unreviewed",
    });
    const noDates = milestone("milestone-no-dates", inactiveUnreviewed.id, {
      plan: null,
      actual: null,
    });
    const reverseDates = milestone(
      "milestone-reverse-dates",
      definitionA.id,
      {
        applicability: "notApplicable",
        plan: dateOnly("2027-01-01"),
        actual: dateOnly("2026-01-01"),
      },
    );
    const versions = [
      { ...version(3, [noDates]), publishedAt: "not-an-instant" },
      version(1, [reverseDates]),
    ];

    expect(
      validateCanonicalProjectSchedule(
        schedule("project-no-invented-rules", versions),
        [...definitions, inactiveUnreviewed],
      ),
    ).toEqual([]);
  });
});

describe("Published milestone presentation order", () => {
  it("uses definition displayOrder and preserves snapshot order for ties", () => {
    const firstEqual = Object.freeze(milestone("milestone-a", definitionA.id));
    const lower = Object.freeze(milestone("milestone-b", definitionB.id));
    const secondEqual = Object.freeze(milestone("milestone-c", definitionC.id));
    const snapshot = Object.freeze([firstEqual, lower, secondEqual]);

    const ordered = orderPublishedMilestonesByDefinition(snapshot, definitions);

    expect(ordered.map((row) => row.milestoneId)).toEqual([
      "milestone-b",
      "milestone-a",
      "milestone-c",
    ]);
    expect(ordered).not.toBe(snapshot);
    expect(ordered[1]).toBe(firstEqual);
    expect(ordered[2]).toBe(secondEqual);
    expect(snapshot).toEqual([firstEqual, lower, secondEqual]);
  });
});
