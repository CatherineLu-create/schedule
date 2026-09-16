import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { MilestoneDefinition } from "../../domain/schedule/milestoneCatalog";
import type {
  CanonicalScheduleWorkingDraftMilestone,
} from "../../domain/schedule/canonicalScheduleWorkingDraft";
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
  toMilestoneTypeId,
  toProjectId,
  toStageGroupId,
  type MilestoneDefinitionId,
} from "../../domain/shared/ids";
import {
  addScheduleWorkingDraftMilestone,
  cancelScheduleWorkingDraft,
  getNextPublishedScheduleVersionNumber,
  publishScheduleWorkingDraft,
  removeScheduleWorkingDraftMilestone,
  startScheduleWorkingDraft,
  updateScheduleWorkingDraftMilestone,
  type AddScheduleWorkingDraftMilestoneInput,
  type CanonicalScheduleCommandContext,
  type PublishScheduleWorkingDraftInput,
  type UpdateScheduleWorkingDraftMilestoneInput,
} from "./canonicalScheduleCommands";

function dateOnly(value: string): DateOnly {
  const parsed = parseDateOnly(value);
  if (parsed === null) throw new Error(`Invalid test DateOnly: ${value}`);
  return parsed;
}

function definition(id: string, displayOrder: number): MilestoneDefinition {
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
  };
}

const definitionA = definition("definition-a", 10);
const definitionB = definition("definition-b", 20);
const definitions = [definitionA, definitionB] as const;

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

function publishedMilestone(
  id: string,
  milestoneDefinitionId: MilestoneDefinitionId = definitionA.id,
): CanonicalPublishedScheduleMilestone {
  return { ...draftMilestone(id, milestoneDefinitionId) };
}

function version(
  versionNumber: number,
  milestones: readonly CanonicalPublishedScheduleMilestone[] = [],
): CanonicalPublishedScheduleVersion {
  return {
    versionNumber: toScheduleVersionNumber(versionNumber),
    versionNote: null,
    publishedAt: `published-${versionNumber}`,
    milestones,
  };
}

function invalidVersion(versionNumber: number): CanonicalPublishedScheduleVersion {
  return { ...version(1), versionNumber: versionNumber as ScheduleVersionNumber };
}

const context: CanonicalScheduleCommandContext = {
  milestoneDefinitions: definitions,
};

function schedule(
  publishedVersions: readonly CanonicalPublishedScheduleVersion[] = [],
): CanonicalProjectSchedule {
  return {
    projectId: toProjectId("command-project"),
    publishedVersions,
    workingDraft: null,
  };
}

function scheduleWithDraft(
  milestones: readonly CanonicalScheduleWorkingDraftMilestone[],
  publishedVersions: readonly CanonicalPublishedScheduleVersion[] = [],
): CanonicalProjectSchedule {
  return { ...schedule(publishedVersions), workingDraft: { milestones } };
}

function freezeScheduleGraph(
  value: CanonicalProjectSchedule,
): CanonicalProjectSchedule {
  for (const publishedVersion of value.publishedVersions) {
    for (const milestone of publishedVersion.milestones) Object.freeze(milestone);
    Object.freeze(publishedVersion.milestones);
    Object.freeze(publishedVersion);
  }
  Object.freeze(value.publishedVersions);
  if (value.workingDraft !== null) {
    for (const milestone of value.workingDraft.milestones) Object.freeze(milestone);
    Object.freeze(value.workingDraft.milestones);
    Object.freeze(value.workingDraft);
  }
  return Object.freeze(value);
}

describe("canonical Schedule Working Draft lifecycle commands", () => {
  it("starts an empty Draft without Published history and reuses it", () => {
    const original = schedule([]);
    const first = startScheduleWorkingDraft(original, context);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected created Draft");
    expect(first.status).toBe("created");
    expect(first.draft.milestones).toEqual([]);
    expect(first.schedule.publishedVersions).toBe(original.publishedVersions);
    expect(original.workingDraft).toBeNull();

    const second = startScheduleWorkingDraft(first.schedule, context);
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("Expected existing Draft");
    expect(second.status).toBe("existing");
    expect(second.schedule).toBe(first.schedule);
    expect(second.draft).toBe(first.draft);
  });

  it("copies the maximum Current Published snapshot without aliases", () => {
    const v3Row = Object.freeze(publishedMilestone("lineage"));
    const v3 = Object.freeze(version(3, Object.freeze([v3Row])));
    const v1 = Object.freeze(version(1, [publishedMilestone("old")]));
    const original = Object.freeze(schedule(Object.freeze([v3, v1])));
    const result = startScheduleWorkingDraft(original, context);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected created Draft");
    expect(result.status).toBe("created");
    expect(result.schedule).not.toBe(original);
    expect(result.schedule.publishedVersions).toBe(original.publishedVersions);
    expect(result.draft.milestones).not.toBe(v3.milestones);
    expect(result.draft.milestones[0]).not.toBe(v3Row);
    expect(result.draft.milestones[0]).toEqual(v3Row);
    expect(result.draft.milestones[0]?.milestoneId).toBe(v3Row.milestoneId);
    expect(original.workingDraft).toBeNull();
  });

  it("returns an existing Draft before validating malformed Published history", () => {
    const draft = Object.freeze({ milestones: Object.freeze([draftMilestone("edited")]) });
    const input = Object.freeze({ ...schedule([invalidVersion(0)]), workingDraft: draft });
    const result = startScheduleWorkingDraft(input, context);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected existing Draft");
    expect(result.status).toBe("existing");
    expect(result.schedule).toBe(input);
    expect(result.draft).toBe(draft);
  });

  it("rejects malformed Published history before creating a new Draft", () => {
    const original = Object.freeze(schedule(Object.freeze([invalidVersion(0)])));
    const result = startScheduleWorkingDraft(original, context);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected Start failure");
    expect(result.reason).toBe("validation-failed");
    expect(result.issues.map(({ code }) => code)).toContain(
      "schedule.integrity.invalid-version-number",
    );
    expect(original.workingDraft).toBeNull();
    expect("schedule" in result).toBe(false);
  });

  it.each([
    ["applicability", "notApplicable"],
    ["plan", dateOnly("2026-10-01")],
    ["actual", dateOnly("2026-10-02")],
  ] as const)("updates only %s", (field, value) => {
    const original = freezeScheduleGraph(
      scheduleWithDraft([draftMilestone("target")], [version(1)]),
    );
    const originalDraft = original.workingDraft!;
    const originalMilestones = originalDraft.milestones;
    const originalMilestone = originalDraft.milestones[0]!;
    const result = updateScheduleWorkingDraftMilestone(
      original,
      { milestoneId: toMilestoneId("target"), field, value } as UpdateScheduleWorkingDraftMilestoneInput,
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected Update success");
    expect(result.schedule).not.toBe(original);
    expect(result.draft).not.toBe(originalDraft);
    expect(result.draft.milestones).not.toBe(originalMilestones);
    expect(result.draft.milestones[0]).not.toBe(originalMilestone);
    expect(result.draft.milestones[0]).toEqual({ ...originalMilestone, [field]: value });
    expect(result.draft.milestones[0]?.milestoneId).toBe(originalMilestone.milestoneId);
    expect(result.draft.milestones[0]?.milestoneDefinitionId)
      .toBe(originalMilestone.milestoneDefinitionId);
    expect(result.schedule.publishedVersions).toBe(original.publishedVersions);
    expect(original.workingDraft).toBe(originalDraft);
    expect(originalDraft.milestones[0]).toBe(originalMilestone);
  });

  it.each(["plan", "actual"] as const)("clears a non-null %s to null", (field) => {
    const originalMilestone = draftMilestone("target", definitionA.id, {
      plan: dateOnly("2026-11-01"),
      actual: dateOnly("2026-11-02"),
    });
    const original = freezeScheduleGraph(scheduleWithDraft([originalMilestone]));
    const result = updateScheduleWorkingDraftMilestone(
      original,
      { milestoneId: originalMilestone.milestoneId, field, value: null },
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected clear success");
    expect(result.draft.milestones[0]).toEqual({ ...originalMilestone, [field]: null });
    const otherField = field === "plan" ? "actual" : "plan";
    expect(result.draft.milestones[0]?.[otherField]).toBe(originalMilestone[otherField]);
    expect(original.workingDraft?.milestones[0]).toBe(originalMilestone);
  });

  it("changes applicability without clearing existing dates", () => {
    const originalRow = draftMilestone("target", definitionA.id, {
      plan: dateOnly("2026-10-01"), actual: dateOnly("2026-10-02"),
    });
    const original = freezeScheduleGraph(scheduleWithDraft([originalRow]));
    const result = updateScheduleWorkingDraftMilestone(
      original,
      { milestoneId: originalRow.milestoneId, field: "applicability", value: "notApplicable" },
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected Update success");
    expect(result.draft.milestones[0]).toEqual({ ...originalRow, applicability: "notApplicable" });
    expect(original.workingDraft?.milestones[0]).toBe(originalRow);
  });

  it("returns distinct Update failures", () => {
    const withoutDraft = freezeScheduleGraph(schedule([]));
    expect(updateScheduleWorkingDraftMilestone(
      withoutDraft,
      { milestoneId: toMilestoneId("missing"), field: "plan", value: null },
      context,
    )).toEqual({ ok: false, reason: "no-working-draft", issues: [] });
    expect(withoutDraft.workingDraft).toBeNull();
    const withDraft = freezeScheduleGraph(
      scheduleWithDraft([draftMilestone("present")]),
    );
    const draft = withDraft.workingDraft;
    expect(updateScheduleWorkingDraftMilestone(
      withDraft,
      { milestoneId: toMilestoneId("missing"), field: "plan", value: null },
      context,
    )).toEqual({ ok: false, reason: "milestone-not-found", issues: [] });
    expect(withDraft.workingDraft).toBe(draft);
    expect(withDraft.workingDraft?.milestones[0]?.milestoneId)
      .toBe(toMilestoneId("present"));
  });

  it("exposes only approved caller-authority fields", () => {
    expectTypeOf<UpdateScheduleWorkingDraftMilestoneInput["field"]>()
      .toEqualTypeOf<"applicability" | "plan" | "actual">();
    expectTypeOf<keyof AddScheduleWorkingDraftMilestoneInput>()
      .toEqualTypeOf<"milestoneId" | "milestoneDefinitionId">();
    expectTypeOf<keyof PublishScheduleWorkingDraftInput>()
      .toEqualTypeOf<"publishedAt">();
  });

  it("adds a caller-identified catalog milestone with canonical defaults", () => {
    const officialRow = Object.freeze(publishedMilestone("official-existing"));
    const officialVersion = Object.freeze(version(1, Object.freeze([officialRow])));
    const history = Object.freeze([officialVersion]);
    const original = freezeScheduleGraph(
      scheduleWithDraft([draftMilestone("existing")], history),
    );
    const originalDraft = original.workingDraft!;
    const originalMilestones = originalDraft.milestones;
    const result = addScheduleWorkingDraftMilestone(original, {
      milestoneId: toMilestoneId("added"), milestoneDefinitionId: definitionA.id,
    }, context);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected Add success");
    expect(result.milestone).toEqual({
      milestoneId: toMilestoneId("added"),
      milestoneDefinitionId: definitionA.id,
      applicability: "applicable",
      plan: null,
      actual: null,
    });
    expect(result.draft.milestones).toHaveLength(2);
    expect(result.schedule).not.toBe(original);
    expect(result.draft).not.toBe(originalDraft);
    expect(result.draft.milestones).not.toBe(originalMilestones);
    expect(result.draft.milestones[0]).toBe(originalMilestones[0]);
    expect(result.schedule.publishedVersions).toBe(history);
    expect(result.schedule.publishedVersions[0]).toBe(officialVersion);
    expect(result.schedule.publishedVersions[0]?.milestones[0]).toBe(officialRow);
    expect(originalDraft.milestones).toHaveLength(1);
  });

  it.each([
    ["duplicate ID", toMilestoneId("existing"), definitionA.id,
      "schedule.draft.integrity.duplicate-milestone-id"],
    ["unresolved definition", toMilestoneId("new"), toMilestoneDefinitionId("missing"),
      "schedule.draft.integrity.unresolved-milestone-definition"],
  ] as const)("rejects Add with %s", (_name, milestoneId, milestoneDefinitionId, code) => {
    const original = freezeScheduleGraph(
      scheduleWithDraft([draftMilestone("existing")]),
    );
    const originalDraft = original.workingDraft;
    const originalMilestones = original.workingDraft?.milestones;
    const result = addScheduleWorkingDraftMilestone(
      original, { milestoneId, milestoneDefinitionId }, context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected Add failure");
    expect(result.reason).toBe("validation-failed");
    expect(result.issues.map((issue) => issue.code)).toContain(code);
    expect(original.workingDraft?.milestones).toHaveLength(1);
    expect(original.workingDraft).toBe(originalDraft);
    expect(original.workingDraft?.milestones).toBe(originalMilestones);
    expect(original.workingDraft?.milestones[0]?.milestoneId)
      .toBe(toMilestoneId("existing"));
    expect("schedule" in result).toBe(false);
  });

  it("allows a duplicate definition but remove/re-add uses a new identity", () => {
    const first = addScheduleWorkingDraftMilestone(
      freezeScheduleGraph(scheduleWithDraft([
        draftMilestone("original", definitionA.id),
      ])),
      { milestoneId: toMilestoneId("same-definition-second-id"), milestoneDefinitionId: definitionA.id },
      context,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected duplicate-definition Add success");
    const removed = removeScheduleWorkingDraftMilestone(
      first.schedule, { milestoneId: toMilestoneId("same-definition-second-id") }, context,
    );
    expect(removed.ok).toBe(true);
    if (!removed.ok) throw new Error("Expected Remove success");
    const readded = addScheduleWorkingDraftMilestone(
      removed.schedule,
      { milestoneId: toMilestoneId("recreated-new-id"), milestoneDefinitionId: definitionA.id },
      context,
    );
    expect(readded.ok).toBe(true);
    if (!readded.ok) throw new Error("Expected re-add success");
    expect(readded.draft.milestones.map(({ milestoneId }) => milestoneId)).toEqual([
      toMilestoneId("original"), toMilestoneId("recreated-new-id"),
    ]);
  });

  it("does not allocate a milestone identity inside Add", () => {
    const randomUuid = vi.spyOn(globalThis.crypto, "randomUUID");
    try {
      const result = addScheduleWorkingDraftMilestone(
        freezeScheduleGraph(scheduleWithDraft([])),
        { milestoneId: toMilestoneId("caller-id"), milestoneDefinitionId: definitionA.id },
        context,
      );
      expect(result.ok).toBe(true);
      expect(randomUuid).not.toHaveBeenCalled();
    } finally {
      randomUuid.mockRestore();
    }
  });

  it("removes one Draft milestone without changing Published", () => {
    const officialRow = Object.freeze(publishedMilestone("official-remove-boundary"));
    const officialVersion = Object.freeze(version(2, Object.freeze([officialRow])));
    const history = Object.freeze([officialVersion]);
    const original = freezeScheduleGraph(
      scheduleWithDraft(
        [draftMilestone("keep"), draftMilestone("remove")], history,
      ),
    );
    const originalDraft = original.workingDraft;
    const originalMilestones = original.workingDraft?.milestones;
    const result = removeScheduleWorkingDraftMilestone(
      original, { milestoneId: toMilestoneId("remove") }, context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected Remove success");
    expect(result.schedule).not.toBe(original);
    expect(result.draft).not.toBe(originalDraft);
    expect(result.draft.milestones).not.toBe(originalMilestones);
    expect(result.draft.milestones[0]).toBe(original.workingDraft?.milestones[0]);
    expect(result.draft.milestones.map(({ milestoneId }) => milestoneId))
      .toEqual([toMilestoneId("keep")]);
    expect(result.schedule.publishedVersions).toBe(history);
    expect(result.schedule.publishedVersions[0]).toBe(officialVersion);
    expect(result.schedule.publishedVersions[0]?.milestones[0]).toBe(officialRow);
    expect(original.workingDraft?.milestones).toHaveLength(2);
    expect(original.workingDraft).toBe(originalDraft);
    expect(original.workingDraft?.milestones).toBe(originalMilestones);
  });

  it("returns exact no-Draft and missing-milestone failures", () => {
    const empty = freezeScheduleGraph(schedule([]));
    expect(addScheduleWorkingDraftMilestone(empty, {
      milestoneId: toMilestoneId("new"), milestoneDefinitionId: definitionA.id,
    }, context)).toEqual({ ok: false, reason: "no-working-draft", issues: [] });
    expect(removeScheduleWorkingDraftMilestone(empty, {
      milestoneId: toMilestoneId("missing"),
    }, context)).toEqual({ ok: false, reason: "no-working-draft", issues: [] });
    const withDraft = freezeScheduleGraph(
      scheduleWithDraft([draftMilestone("present")]),
    );
    const draft = withDraft.workingDraft;
    expect(removeScheduleWorkingDraftMilestone(withDraft, {
      milestoneId: toMilestoneId("missing"),
    }, context)).toEqual({ ok: false, reason: "milestone-not-found", issues: [] });
    expect(withDraft.workingDraft?.milestones).toHaveLength(1);
    expect(withDraft.workingDraft).toBe(draft);
  });

  it.each([
    ["Update", (value: CanonicalProjectSchedule) => updateScheduleWorkingDraftMilestone(
      value, { milestoneId: toMilestoneId("target"), field: "plan", value: null }, context,
    )],
    ["Add", (value: CanonicalProjectSchedule) => addScheduleWorkingDraftMilestone(
      value, { milestoneId: toMilestoneId("new"), milestoneDefinitionId: definitionA.id }, context,
    )],
    ["Remove", (value: CanonicalProjectSchedule) => removeScheduleWorkingDraftMilestone(
      value, { milestoneId: toMilestoneId("target") }, context,
    )],
  ] as const)("blocks %s when the current Draft is malformed", (_name, command) => {
    const original = freezeScheduleGraph(scheduleWithDraft([
      draftMilestone("bad", toMilestoneDefinitionId("missing")),
    ]));
    const originalDraft = original.workingDraft;
    const originalMilestones = original.workingDraft?.milestones;
    const result = command(original);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected malformed-Draft failure");
    expect(result.reason).toBe("validation-failed");
    expect(result.issues.map(({ code }) => code)).toContain(
      "schedule.draft.integrity.unresolved-milestone-definition",
    );
    expect(original.workingDraft?.milestones[0]?.milestoneId).toBe(toMilestoneId("bad"));
    expect(original.workingDraft).toBe(originalDraft);
    expect(original.workingDraft?.milestones).toBe(originalMilestones);
    expect("schedule" in result).toBe(false);
  });

  it("discards even a malformed Draft and rejects a second Cancel", () => {
    const published = Object.freeze([Object.freeze(version(1))]);
    const malformed = freezeScheduleGraph(scheduleWithDraft([
      draftMilestone("bad", toMilestoneDefinitionId("missing")),
    ], published));
    const malformedDraft = malformed.workingDraft;
    const first = cancelScheduleWorkingDraft(malformed);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected Cancel success");
    expect(first.schedule.workingDraft).toBeNull();
    expect(first.schedule.publishedVersions).toBe(published);
    expect(malformed.workingDraft).toBe(malformedDraft);
    expect(cancelScheduleWorkingDraft(first.schedule)).toEqual({
      ok: false, reason: "no-working-draft", issues: [],
    });
  });

  it("derives next version from max and rejects an unsafe successor", () => {
    expect(getNextPublishedScheduleVersionNumber(schedule([]))).toEqual({
      ok: true, versionNumber: toScheduleVersionNumber(1),
    });
    expect(getNextPublishedScheduleVersionNumber(schedule([version(3), version(1)])))
      .toEqual({ ok: true, versionNumber: toScheduleVersionNumber(4) });
    expect(getNextPublishedScheduleVersionNumber(
      schedule([version(Number.MAX_SAFE_INTEGER)]),
    )).toEqual({ ok: false, reason: "next-version-unavailable" });
  });

  it("publishes [v3, v1] as a separate immutable v4 snapshot", () => {
    const original = freezeScheduleGraph(scheduleWithDraft(
      [draftMilestone("lineage", definitionA.id, {
        applicability: "notApplicable",
        plan: dateOnly("2030-01-15"),
        actual: dateOnly("2030-01-16"),
      })],
      [version(3), version(1)],
    ));
    const draft = original.workingDraft!;
    const history = original.publishedVersions;
    const v3 = history[0];
    const v1 = history[1];
    const result = publishScheduleWorkingDraft(
      original, { publishedAt: "2026-09-11T12:00:00Z" }, context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected Publish success");
    expect(result.version.versionNumber).toBe(4);
    expect(result.version.versionNote).toBeNull();
    expect(result.version.publishedAt).toBe("2026-09-11T12:00:00Z");
    expect(result.schedule.publishedVersions).not.toBe(history);
    expect(result.schedule.publishedVersions[0]).toBe(v3);
    expect(result.schedule.publishedVersions[1]).toBe(v1);
    expect(result.schedule.publishedVersions).toHaveLength(3);
    expect(original.publishedVersions).toBe(history);
    expect(original.publishedVersions).toHaveLength(2);
    expect(result.schedule.workingDraft).toBeNull();
    expect(result.version.milestones).not.toBe(draft.milestones);
    expect(result.version.milestones[0]).not.toBe(draft.milestones[0]);
    expect(result.version.milestones[0]).toEqual(draft.milestones[0]);
    expect(result.version.milestones[0]?.milestoneId).toBe(draft.milestones[0]?.milestoneId);
  });

  it("publishes an empty first Draft as v1 and blocks overflow", () => {
    const empty = freezeScheduleGraph(scheduleWithDraft([]));
    const emptyDraft = empty.workingDraft;
    const published = publishScheduleWorkingDraft(
      empty, { publishedAt: "first-publication" }, context,
    );
    expect(published.ok).toBe(true);
    if (!published.ok) throw new Error("Expected first Publish success");
    expect(published.version.versionNumber).toBe(1);
    expect(published.version.milestones).toEqual([]);
    expect(published.version.versionNote).toBeNull();
    expect(published.version.publishedAt).toBe("first-publication");
    expect(empty.workingDraft).toBe(emptyDraft);
    expect(empty.publishedVersions).toHaveLength(0);

    const overflow = freezeScheduleGraph(
      scheduleWithDraft([], [version(Number.MAX_SAFE_INTEGER)]),
    );
    const overflowDraft = overflow.workingDraft;
    const overflowHistory = overflow.publishedVersions;
    expect(publishScheduleWorkingDraft(
      overflow, { publishedAt: "overflow-attempt" }, context,
    )).toEqual({ ok: false, reason: "next-version-unavailable", issues: [] });
    expect(overflow.workingDraft).toBe(overflowDraft);
    expect(overflow.publishedVersions).toBe(overflowHistory);
    expect(overflow.publishedVersions).toHaveLength(1);
  });

  it("returns no Draft before inspecting malformed Published history", () => {
    const input = freezeScheduleGraph({
      ...schedule([invalidVersion(0)]),
      workingDraft: null,
    });
    const history = input.publishedVersions;
    expect(publishScheduleWorkingDraft(input, { publishedAt: "published-now" }, context))
      .toEqual({ ok: false, reason: "no-working-draft", issues: [] });
    expect(input.publishedVersions).toBe(history);
  });

  it("aggregates Published and Draft issues before Publish", () => {
    const input = freezeScheduleGraph(scheduleWithDraft(
      [
        draftMilestone("draft-bad", toMilestoneDefinitionId("missing")),
      ],
      [invalidVersion(0)],
    ));
    const draft = input.workingDraft;
    const history = input.publishedVersions;
    const oldVersion = history[0];
    const oldRows = draft?.milestones;
    const result = publishScheduleWorkingDraft(
      input, { publishedAt: "published-now" }, context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected Publish failure");
    expect(result.reason).toBe("validation-failed");
    expect(result.issues.map(({ code }) => code)).toEqual([
      "schedule.integrity.invalid-version-number",
      "schedule.draft.integrity.unresolved-milestone-definition",
    ]);
    expect(input.workingDraft).toBe(draft);
    expect(input.publishedVersions).toBe(history);
    expect(input.publishedVersions[0]).toBe(oldVersion);
    expect(input.workingDraft?.milestones).toBe(oldRows);
    expect(input.workingDraft?.milestones[0]?.milestoneDefinitionId)
      .toBe(toMilestoneDefinitionId("missing"));
    expect("schedule" in result).toBe(false);
  });

  it("rejects an invalid Draft without changing Draft or Published history", () => {
    const row = draftMilestone("duplicate");
    const original = freezeScheduleGraph(scheduleWithDraft(
      [row, { ...row }],
      [version(1)],
    ));
    const draft = original.workingDraft;
    const history = original.publishedVersions;
    const oldVersion = history[0];
    const oldRows = draft?.milestones;
    const result = publishScheduleWorkingDraft(
      original, { publishedAt: "rejected" }, context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected Publish failure");
    expect(result.reason).toBe("validation-failed");
    expect(result.issues.map(({ code }) => code)).toContain(
      "schedule.draft.integrity.duplicate-milestone-id",
    );
    expect(original.publishedVersions).toBe(history);
    expect(original.workingDraft).toBe(draft);
    expect(original.publishedVersions[0]).toBe(oldVersion);
    expect(original.workingDraft?.milestones).toBe(oldRows);
    expect(original.workingDraft?.milestones.map(({ milestoneId }) => milestoneId))
      .toEqual([toMilestoneId("duplicate"), toMilestoneId("duplicate")]);
    expect("schedule" in result).toBe(false);
  });

  it("rejects malformed Published history without changing the Draft or history", () => {
    const original = freezeScheduleGraph(scheduleWithDraft(
      [draftMilestone("valid")],
      [invalidVersion(0)],
    ));
    const draft = original.workingDraft;
    const history = original.publishedVersions;
    const oldVersion = history[0];
    const oldRows = draft?.milestones;
    const result = publishScheduleWorkingDraft(
      original, { publishedAt: "rejected-publication" }, context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected Publish failure");
    expect(result.reason).toBe("validation-failed");
    expect(result.issues.map(({ code }) => code)).toContain(
      "schedule.integrity.invalid-version-number",
    );
    expect(original.publishedVersions).toBe(history);
    expect(original.workingDraft).toBe(draft);
    expect(original.publishedVersions[0]).toBe(oldVersion);
    expect(original.workingDraft?.milestones).toBe(oldRows);
    expect(original.workingDraft?.milestones[0]?.milestoneId)
      .toBe(toMilestoneId("valid"));
    expect("schedule" in result).toBe(false);
  });

  it("does not create another version on a second Publish", () => {
    const first = publishScheduleWorkingDraft(
      freezeScheduleGraph(scheduleWithDraft([draftMilestone("lineage")])),
      { publishedAt: "first" }, context,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected first Publish");
    const secondInput = freezeScheduleGraph(first.schedule);
    const firstHistory = secondInput.publishedVersions;
    const firstVersion = firstHistory[0];
    const firstRows = firstVersion?.milestones;
    expect(publishScheduleWorkingDraft(
      secondInput, { publishedAt: "second" }, context,
    )).toEqual({ ok: false, reason: "no-working-draft", issues: [] });
    expect(secondInput.publishedVersions).toBe(firstHistory);
    expect(secondInput.publishedVersions[0]).toBe(firstVersion);
    expect(secondInput.publishedVersions[0]?.milestones).toBe(firstRows);
    expect(secondInput.publishedVersions).toHaveLength(1);
  });
});
