import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { initialGovernanceContext, publishedRetirementFixture } from "../../test/governanceTestUtils";
import { selectEffectiveMilestoneGovernanceContext, selectEffectiveRetiredDraftOccurrenceGrants } from "../governance/effectiveMilestoneGovernanceContext";
import type { MilestoneGovernanceRuntimeState } from "../../domain/governance/milestoneGovernance";
import type { ProjectLocalMilestoneDefinition } from "../../domain/schedule/scheduleReview";

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
  toCanonicalScheduleWorkingDraftId,
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
const definitionC = definition("definition-c", 30);
const legacyDefinition = {
  ...definition("definition-legacy", 40),
  active: false,
} as const;
const definitions = [definitionA, definitionB, definitionC, legacyDefinition] as const;

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
  governance: { ...initialGovernanceContext(), definitionsForHistoricalResolution: definitions, addablePublicDefinitions: [definitionA, definitionB, definitionC] },
  localDefinitions: [],
  retiredDraftOccurrenceGrants: [],
};

function schedule(
  publishedVersions: readonly CanonicalPublishedScheduleVersion[] = [],
): CanonicalProjectSchedule {
  return {
    localDefinitions: [],
    evidenceLedger: [],
    reviewSessions: [],
    reviewDecisions: [],
    reviewClosures: [],
    projectId: toProjectId("command-project"),
    publishedVersions,
    workingDraft: null,
  };
}

function scheduleWithDraft(
  milestones: readonly CanonicalScheduleWorkingDraftMilestone[],
  publishedVersions: readonly CanonicalPublishedScheduleVersion[] = [],
): CanonicalProjectSchedule {
  return { ...schedule(publishedVersions), workingDraft: {
    workingDraftId: toCanonicalScheduleWorkingDraftId("command-test-draft"),
    milestones,
    reviewSessionIds: [],
    importCandidates: [],
  } };
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

function releaseBackedCommandContext(state: MilestoneGovernanceRuntimeState): CanonicalScheduleCommandContext {
  const governance = selectEffectiveMilestoneGovernanceContext(state);
  const grants = selectEffectiveRetiredDraftOccurrenceGrants(state);
  if (!governance.ok || !grants.ok) throw new Error("Expected valid released command authority");
  return { governance: governance.value, localDefinitions: [], retiredDraftOccurrenceGrants: grants.value };
}

describe("canonical Schedule Working Draft lifecycle commands", () => {
  it("normal Add rejects compatibility and retired definitions even when resolved", () => {
    const empty = scheduleWithDraft([]);
    for (const rejectedId of [legacyDefinition.id, definitionA.id]) {
      const restricted = { ...context, governance: { ...context.governance, addablePublicDefinitions: [definitionB] } };
      const before = structuredClone(empty);
      expect(addScheduleWorkingDraftMilestone(empty, { milestoneId: toMilestoneId("new"), milestoneDefinitionId: rejectedId }, restricted)).toMatchObject({ ok: false, reason: "validation-failed" });
      expect(empty).toEqual(before);
    }
  });
  it("a local registry entry cannot authorize a nonaddable public identity", () => {
    const local: ProjectLocalMilestoneDefinition = { id: legacyDefinition.id, name: "Unrelated local", stageGroupId: toStageGroupId("stage-a1"), milestoneTypeId: toMilestoneTypeId("type-g-o"), displayOrder: 1, source: "manual", confirmation: "confirmed", evidenceIds: [] };
    const malformed = { ...scheduleWithDraft([draftMilestone("unretained", legacyDefinition.id)]), localDefinitions: [local] };
    const malformedContext = { ...context, localDefinitions: [local] };
    expect(updateScheduleWorkingDraftMilestone(malformed, { milestoneId: toMilestoneId("unretained"), field: "plan", value: null }, malformedContext).ok).toBe(false);
    expect(publishScheduleWorkingDraft(malformed, { publishedAt: "now" }, malformedContext).ok).toBe(false);
  });
  it("resolves only legal same-Project local IDs for edit and Publish", () => {
    const local: ProjectLocalMilestoneDefinition = { id: toMilestoneDefinitionId("confirmed-local"), name: "Confirmed local", stageGroupId: toStageGroupId("stage-a1"), milestoneTypeId: toMilestoneTypeId("type-smt"), displayOrder: 1, source: "manual", confirmation: "confirmed", evidenceIds: [] };
    const item = { ...scheduleWithDraft([draftMilestone("local-row", local.id)]), localDefinitions: [local] };
    const localContext = { ...context, localDefinitions: [local] };
    const input = { milestoneId: toMilestoneId("local-row"), field: "plan", value: dateOnly("2026-10-02") } as const;
    const updated = updateScheduleWorkingDraftMilestone(item, input, localContext);
    expect(updated.ok).toBe(true);
    if (!updated.ok) throw new Error("Expected local edit");
    const published = publishScheduleWorkingDraft(updated.schedule, { publishedAt: "now" }, localContext);
    expect(published.ok).toBe(true);
    if (!published.ok) throw new Error("Expected local Publish");
    expect(published.version.milestones[0]).toMatchObject({ milestoneId: "local-row", milestoneDefinitionId: "confirmed-local", plan: "2026-10-02" });
    expect(updateScheduleWorkingDraftMilestone({ ...item, localDefinitions: [] }, input, localContext).ok).toBe(false);
    expect(updateScheduleWorkingDraftMilestone(item, input, context).ok).toBe(false);
    const invalid = { ...local, milestoneTypeId: toMilestoneTypeId("unknown-type") };
    expect(publishScheduleWorkingDraft({ ...item, localDefinitions: [invalid] }, { publishedAt: "now" }, { ...context, localDefinitions: [invalid] }).ok).toBe(false);
  });
  it("D1 permits exact same-Draft edits and Publish but does not permit Add or leak identities", () => {
    const fixture = publishedRetirementFixture();
    const item = fixture.schedule;
    const grant = fixture.grant;
    const granted = releaseBackedCommandContext(fixture.state);
    expect(granted.retiredDraftOccurrenceGrants).toEqual([grant]);
    const input = { milestoneId: grant.milestoneId, field: "plan", value: dateOnly("2026-10-02") } as const;
    const updated = updateScheduleWorkingDraftMilestone(item, input, granted);
    expect(updated.ok).toBe(true);
    if (!updated.ok) throw new Error("Expected D1 edit");
    const published = publishScheduleWorkingDraft(updated.schedule, { publishedAt: "now" }, granted);
    expect(published.ok).toBe(true);
    if (!published.ok) throw new Error("Expected D1 Publish");
    const withoutGrant = { ...granted, retiredDraftOccurrenceGrants: [] };
    const cloned = startScheduleWorkingDraft(published.schedule, { workingDraftId: toCanonicalScheduleWorkingDraftId("after-publish") }, withoutGrant);
    if (!cloned.ok) throw new Error("Expected retained clone");
    expect(updateScheduleWorkingDraftMilestone(cloned.schedule, input, withoutGrant).ok).toBe(true);
    expect(publishScheduleWorkingDraft(cloned.schedule, { publishedAt: "later" }, withoutGrant).ok).toBe(true);
    for (const invalidGrant of [
      { ...grant, projectId: toProjectId("other") },
      { ...grant, workingDraftId: toCanonicalScheduleWorkingDraftId("other") },
      { ...grant, milestoneId: toMilestoneId("other") },
      { ...grant, milestoneDefinitionId: definitionB.id },
    ]) {
      const invalidContext = { ...granted, retiredDraftOccurrenceGrants: [invalidGrant] };
      expect(updateScheduleWorkingDraftMilestone(item, input, invalidContext).ok).toBe(false);
      expect(publishScheduleWorkingDraft(item, { publishedAt: "now" }, invalidContext).ok).toBe(false);
    }
    const removed = removeScheduleWorkingDraftMilestone(item, { milestoneId: grant.milestoneId }, granted);
    if (!removed.ok) throw new Error("Expected remove");
    expect(addScheduleWorkingDraftMilestone(removed.schedule, { milestoneId: grant.milestoneId, milestoneDefinitionId: grant.milestoneDefinitionId }, granted).ok).toBe(false);
    const discarded = cancelScheduleWorkingDraft(item);
    if (!discarded.ok) throw new Error("Expected discard");
    const restarted = startScheduleWorkingDraft(discarded.schedule, { workingDraftId: toCanonicalScheduleWorkingDraftId("restart") }, granted);
    if (!restarted.ok) throw new Error("Expected restart");
    expect(addScheduleWorkingDraftMilestone(restarted.schedule, { milestoneId: grant.milestoneId, milestoneDefinitionId: grant.milestoneDefinitionId }, granted).ok).toBe(false);
  });
  // Mutation: accepting a raw matching tuple whose issuing release has no current authority.
  it.each(["unknown", "bundled", "future", "nonRetiring"] as const)("rejects Edit and Publish atomically with a %s issuing-release reference", kind => {
    const fixture = publishedRetirementFixture();
    const state = { ...fixture.state, retiredDraftOccurrenceGrants: [{ ...fixture.grant, retiredByReleaseId: fixture.invalidIssuingReleaseIds[kind] }] };
    const item = freezeScheduleGraph(fixture.schedule);
    const before = structuredClone({ state, item });
    const derived = releaseBackedCommandContext(state);
    expect(derived.retiredDraftOccurrenceGrants).toEqual([]);
    for (const [result, code] of [
      [updateScheduleWorkingDraftMilestone(item, { milestoneId: fixture.grant.milestoneId, field: "plan", value: dateOnly("2026-10-02") }, derived), "schedule.draft.definition-not-addable-or-retained"],
      [publishScheduleWorkingDraft(item, { publishedAt: "2026-10-01T03:00:00Z" }, derived), "schedule.import.retired-definition-not-retained"],
    ] as const) {
      expect(result).toMatchObject({ ok: false, reason: "validation-failed", issues: [expect.objectContaining({ code })] });
      expect(result).not.toHaveProperty("schedule");
      expect(result).not.toHaveProperty("version");
    }
    expect({ state, item }).toEqual(before);
  });
  it("only exact Current Published lineage retains nonaddable rows, preserving repeats", () => {
    const first = publishedMilestone("retained-1", legacyDefinition.id);
    const second = publishedMilestone("retained-2", legacyDefinition.id);
    const retained = scheduleWithDraft([first, second], [version(1, [first, second])]);
    expect(publishScheduleWorkingDraft(retained, { publishedAt: "now" }, context).ok).toBe(true);
    const olderOnly = scheduleWithDraft([first], [version(1, [first]), version(2, [])]);
    expect(publishScheduleWorkingDraft(olderOnly, { publishedAt: "now" }, context).ok).toBe(false);
    const wrongOccurrence = scheduleWithDraft([{ ...first, milestoneId: toMilestoneId("recreated") }], retained.publishedVersions);
    expect(publishScheduleWorkingDraft(wrongOccurrence, { publishedAt: "now" }, context).ok).toBe(false);
    expect(addScheduleWorkingDraftMilestone(scheduleWithDraft([draftMilestone("present")]), { milestoneId: toMilestoneId("duplicate-definition"), milestoneDefinitionId: definitionA.id }, context).ok).toBe(false);
  });
  it("starts_empty_draft_without_published_schedule_and_uses_injected_working_draft_id", () => {
    const id = toCanonicalScheduleWorkingDraftId("draft-empty-1");
    const result = startScheduleWorkingDraft(schedule(), { workingDraftId: id }, context);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected created Draft");
    expect(result.status).toBe("created");
    expect(result.draft).toEqual({
      workingDraftId: id,
      milestones: [],
      reviewSessionIds: [],
      importCandidates: [],
    });
    expect(result.schedule.publishedVersions).toEqual([]);
  });

  it("clones_only_current_published_occurrences", () => {
    const current = version(3, [publishedMilestone("current", definitionB.id)]);
    const older = version(1, [publishedMilestone("older", definitionA.id)]);
    const result = startScheduleWorkingDraft(
      schedule([older, current]),
      { workingDraftId: toCanonicalScheduleWorkingDraftId("draft-clone-1") },
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected created Draft");
    expect(result.draft.milestones).toEqual(current.milestones);
    expect(result.draft.milestones[0]).not.toBe(current.milestones[0]);
    expect(result.draft.milestones).toHaveLength(1);
  });

  it("returns_existing_working_draft_unchanged", () => {
    const first = startScheduleWorkingDraft(
      schedule(),
      { workingDraftId: toCanonicalScheduleWorkingDraftId("draft-original") },
      context,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected created Draft");
    const second = startScheduleWorkingDraft(
      first.schedule,
      { workingDraftId: toCanonicalScheduleWorkingDraftId("draft-different") },
      context,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("Expected existing Draft");
    expect(second.status).toBe("existing");
    expect(second.schedule).toBe(first.schedule);
    expect(second.draft).toBe(first.draft);
    expect(second.draft.workingDraftId).toBe(toCanonicalScheduleWorkingDraftId("draft-original"));
  });
  it("starts an empty sparse Draft without Published history and reuses it", () => {
    const original = schedule([]);
    const first = startScheduleWorkingDraft(original, { workingDraftId: toCanonicalScheduleWorkingDraftId("first") }, context);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected created Draft");
    expect(first.status).toBe("created");
    expect(first.draft.milestones).toEqual([]);
    expect(first.schedule.publishedVersions).toBe(original.publishedVersions);
    expect(original.workingDraft).toBeNull();

    const second = startScheduleWorkingDraft(first.schedule, { workingDraftId: toCanonicalScheduleWorkingDraftId("second") }, context);
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("Expected existing Draft");
    expect(second.status).toBe("existing");
    expect(second.schedule).toBe(first.schedule);
    expect(second.draft).toBe(first.draft);
  });

  it("clones only repeated and legacy Current Published occurrences", () => {
    const publishedRows = Object.freeze([
      Object.freeze(publishedMilestone("lineage", definitionA.id)),
      Object.freeze(publishedMilestone("repeat-one", definitionB.id)),
      Object.freeze(publishedMilestone("repeat-two", definitionB.id)),
      Object.freeze(publishedMilestone("legacy", legacyDefinition.id)),
    ]);
    const v3 = Object.freeze(version(3, publishedRows));
    const v1 = Object.freeze(version(1, [publishedMilestone("old")]));
    const original = Object.freeze(schedule(Object.freeze([v3, v1])));
    const result = startScheduleWorkingDraft(original, { workingDraftId: toCanonicalScheduleWorkingDraftId("clone") }, context);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected created Draft");
    expect(result.status).toBe("created");
    expect(result.schedule).not.toBe(original);
    expect(result.schedule.publishedVersions).toBe(original.publishedVersions);
    expect(result.draft.milestones).not.toBe(v3.milestones);
    expect(result.draft.milestones.slice(0, 4)).toEqual(publishedRows);
    for (const [index, publishedRow] of publishedRows.entries()) {
      expect(result.draft.milestones[index]).not.toBe(publishedRow);
    }
    expect(result.draft.milestones).toHaveLength(4);
    expect(original.workingDraft).toBeNull();
  });

  it("returns an existing Draft before validating malformed Published history", () => {
    const draft = Object.freeze({
      workingDraftId: toCanonicalScheduleWorkingDraftId("existing"),
      milestones: Object.freeze([draftMilestone("edited")]),
      reviewSessionIds: Object.freeze([]),
      importCandidates: Object.freeze([]),
    });
    const input = Object.freeze({ ...schedule([invalidVersion(0)]), workingDraft: draft });
    const result = startScheduleWorkingDraft(input, { workingDraftId: toCanonicalScheduleWorkingDraftId("ignored") }, context);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected existing Draft");
    expect(result.status).toBe("existing");
    expect(result.schedule).toBe(input);
    expect(result.draft).toBe(draft);
  });

  it("rejects malformed Published history before creating a new Draft", () => {
    const original = Object.freeze(schedule(Object.freeze([invalidVersion(0)])));
    const result = startScheduleWorkingDraft(original, { workingDraftId: toCanonicalScheduleWorkingDraftId("rejected") }, context);
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
      milestoneId: toMilestoneId("added"), milestoneDefinitionId: definitionB.id,
    }, context);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected Add success");
    expect(result.milestone).toEqual({
      milestoneId: toMilestoneId("added"),
      milestoneDefinitionId: definitionB.id,
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

  it("remove/re-add of an addable definition uses a new identity", () => {
    const first = addScheduleWorkingDraftMilestone(
      freezeScheduleGraph(scheduleWithDraft([
        draftMilestone("original", definitionA.id),
      ])),
      { milestoneId: toMilestoneId("second-definition-id"), milestoneDefinitionId: definitionB.id },
      context,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected Add success");
    const removed = removeScheduleWorkingDraftMilestone(
      first.schedule, { milestoneId: toMilestoneId("second-definition-id") }, context,
    );
    expect(removed.ok).toBe(true);
    if (!removed.ok) throw new Error("Expected Remove success");
    const readded = addScheduleWorkingDraftMilestone(
      removed.schedule,
      { milestoneId: toMilestoneId("recreated-new-id"), milestoneDefinitionId: definitionB.id },
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

  it.each([
    { label: "missing-plan", values: { plan: null }, code: "schedule.data.missing-plan-and-actual" },
    { label: "actual-without-plan", values: { plan: null, actual: dateOnly("2026-10-02") }, code: "schedule.data.actual-without-plan" },
    { label: "N/A-with-date", values: { applicability: "notApplicable" as const }, code: "schedule.import.not-applicable-with-date" },
    { label: "invalid-date", values: { plan: "2026-02-30" as DateOnly }, code: "schedule.import.invalid-date" },
  ])("real Publish rejects current Draft date blockers without import candidates: $label", ({ values, code }) => {
    const original = freezeScheduleGraph(scheduleWithDraft([draftMilestone("invalid-current-date", definitionA.id, values)], [version(1)]));
    const before = structuredClone(original);
    const result = publishScheduleWorkingDraft(original, { publishedAt: "must-not-publish" }, context);
    expect(result).toMatchObject({ ok: false, reason: "validation-failed", issues: expect.arrayContaining([expect.objectContaining({ code })]) });
    expect(result).not.toHaveProperty("schedule");
    expect(result).not.toHaveProperty("version");
    expect(original).toEqual(before);
  });

  it("publishes [v3, v1] as a separate immutable v4 snapshot", () => {
    const original = freezeScheduleGraph(scheduleWithDraft(
      [draftMilestone("lineage", definitionA.id, {
        applicability: "applicable",
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
