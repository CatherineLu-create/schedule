import { describe, expect, expectTypeOf, it } from "vitest";

import { parseDateOnly, type DateOnly } from "../shared/dateOnly";
import {
  toMilestoneDefinitionId,
  toMilestoneId,
  toMilestoneTypeId,
  toStageGroupId,
  type MilestoneDefinitionId,
} from "../shared/ids";
import type { MilestoneDefinition } from "./milestoneCatalog";
import {
  orderScheduleWorkingDraftMilestonesByDefinition,
  validateScheduleWorkingDraft,
  type CanonicalScheduleWorkingDraft,
  type CanonicalScheduleWorkingDraftMilestone,
} from "./canonicalScheduleWorkingDraft";

function dateOnly(value: string): DateOnly {
  const parsed = parseDateOnly(value);
  if (parsed === null) throw new Error(`Invalid test DateOnly: ${value}`);
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

const definitionA = definition("definition-a", 20);
const definitionB = definition("definition-b", 10);
const definitionC = definition("definition-c", 20);
const definitions = [definitionA, definitionB, definitionC] as const;

function draftMilestone(
  id: string,
  milestoneDefinitionId: MilestoneDefinitionId = definitionA.id,
  overrides: Partial<CanonicalScheduleWorkingDraftMilestone> = {},
): CanonicalScheduleWorkingDraftMilestone {
  return {
    milestoneId: toMilestoneId(id),
    milestoneDefinitionId,
    applicability: "applicable",
    plan: dateOnly("2026-09-15"),
    actual: null,
    ...overrides,
  };
}

describe("canonical Schedule Working Draft", () => {
  it("has only the approved readonly Draft keys", () => {
    expectTypeOf<keyof CanonicalScheduleWorkingDraft>()
      .toEqualTypeOf<"milestones">();
    expectTypeOf<keyof CanonicalScheduleWorkingDraftMilestone>()
      .toEqualTypeOf<
        | "milestoneId"
        | "milestoneDefinitionId"
        | "applicability"
        | "plan"
        | "actual"
      >();
    expectTypeOf<CanonicalScheduleWorkingDraft["milestones"]>()
      .toEqualTypeOf<readonly CanonicalScheduleWorkingDraftMilestone[]>();
  });

  it("accepts an empty Draft", () => {
    expect(validateScheduleWorkingDraft({ milestones: [] }, definitions))
      .toEqual([]);
  });

  it("accepts a normal Draft", () => {
    expect(validateScheduleWorkingDraft({
      milestones: [draftMilestone("normal", definitionB.id)],
    }, definitions)).toEqual([]);
  });

  it("reports only duplicate identity and unresolved classification", () => {
    const draft: CanonicalScheduleWorkingDraft = {
      milestones: [
        draftMilestone("same-id", definitionA.id),
        draftMilestone("same-id", toMilestoneDefinitionId("missing")),
      ],
    };
    const issues = validateScheduleWorkingDraft(draft, definitions);

    expect(issues.map(({ code }) => code)).toEqual([
      "schedule.draft.integrity.duplicate-milestone-id",
      "schedule.draft.integrity.unresolved-milestone-definition",
    ]);
    expect(issues.map(({ target }) => target)).toEqual([
      {
        section: "schedule.workingDraft",
        entityId: toMilestoneId("same-id"),
        field: "milestoneId",
      },
      {
        section: "schedule.workingDraft",
        entityId: toMilestoneId("same-id"),
        field: "milestoneDefinitionId",
      },
    ]);
    expect(draft.milestones).toHaveLength(2);
  });

  it("does not invent Draft business-completeness rules", () => {
    const inactiveUnreviewed = definition("inactive", 30, {
      active: false,
      reviewStatus: "unreviewed",
    });
    const draft: CanonicalScheduleWorkingDraft = {
      milestones: [
        draftMilestone("first", inactiveUnreviewed.id, {
          applicability: "notApplicable",
          plan: dateOnly("2026-12-31"),
          actual: dateOnly("2026-01-01"),
        }),
        draftMilestone("second", inactiveUnreviewed.id, {
          plan: null,
          actual: null,
        }),
      ],
    };
    expect(validateScheduleWorkingDraft(draft, [inactiveUnreviewed]))
      .toEqual([]);
  });

  it("orders by definition and preserves equal-order snapshot order", () => {
    const firstEqual = Object.freeze(
      draftMilestone("equal-first", definitionA.id),
    );
    const earlier = Object.freeze(draftMilestone("earlier", definitionB.id));
    const secondEqual = Object.freeze(
      draftMilestone("equal-second", definitionC.id),
    );
    const input = Object.freeze([firstEqual, earlier, secondEqual]);
    const ordered = orderScheduleWorkingDraftMilestonesByDefinition(
      input,
      definitions,
    );

    expect(ordered).toEqual([earlier, firstEqual, secondEqual]);
    expect(ordered).not.toBe(input);
    expect(input).toEqual([firstEqual, earlier, secondEqual]);
  });
});
