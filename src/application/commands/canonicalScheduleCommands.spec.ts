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
  toScheduleEvidenceId,
  toScheduleImportCandidateId,
  toScheduleReviewSessionId,
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
import { confirmProjectLocalMilestoneDefinition, loadBuiltInScheduleSimulation } from "./scheduleReviewCommands";

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

describe("version history and publication metadata", () => {
  const draftId = toCanonicalScheduleWorkingDraftId("history-draft");
  const publishInput = { publishedAt: "2026-10-14T00:00:00Z", versionNote: "  Restore schedule based on v08  " };
  it("records empty/current/historical bases and clones exactly without touching history", () => {
    const old = version(8, [publishedMilestone("old")]);
    const item = freezeScheduleGraph(schedule([version(10), old, version(9)]));
    for (const [source, base, expected] of [[schedule(), undefined, null], [item, undefined, 10], [item, toScheduleVersionNumber(8), 8]] as const) {
      const result = startScheduleWorkingDraft(source, { workingDraftId: draftId, basePublishedVersionNumber: base }, context);
      expect(result).toMatchObject({ ok: true, draft: { basePublishedVersionNumber: expected } });
      if (!result.ok) throw new Error("Expected Draft");
      expect(result.schedule.publishedVersions).toBe(source.publishedVersions);
      expect(result.draft.milestones).toEqual(expected === 8 ? old.milestones : []);
      if (expected === 8) expect(result.draft.milestones[0]).not.toBe(old.milestones[0]);
      expect(result.draft.reviewSessionIds).toEqual([]);
      expect(result.draft.importCandidates).toEqual([]);
      expect(result.schedule.evidenceLedger).toBe(source.evidenceLedger);
    }
  });
  it("rejects a missing base and explicit replacement while preserving implicit idempotence", () => {
    expect(startScheduleWorkingDraft(schedule(), { workingDraftId: draftId, basePublishedVersionNumber: toScheduleVersionNumber(8) }, context))
      .toMatchObject({ ok: false, reason: "published-version-not-found" });
    const item = freezeScheduleGraph(scheduleWithDraft([], [version(8)]));
    expect(startScheduleWorkingDraft(item, { workingDraftId: draftId, basePublishedVersionNumber: toScheduleVersionNumber(8) }, context))
      .toMatchObject({ ok: false, reason: "working-draft-exists" });
    expect(startScheduleWorkingDraft(item, { workingDraftId: draftId }, context)).toMatchObject({ ok: true, status: "existing", schedule: item });
  });
  it.each([8, 10])("publishes base v%s against unordered/gapped history as v11 with trimmed note", base => {
    const { versionNote: _note, ...legacy } = version(8);
    const item = freezeScheduleGraph(schedule([version(10), legacy]));
    const started = startScheduleWorkingDraft(item, { workingDraftId: draftId, basePublishedVersionNumber: toScheduleVersionNumber(base) }, context);
    if (!started.ok) throw new Error("Expected Draft");
    const result = publishScheduleWorkingDraft(started.schedule, publishInput, context);
    expect(result).toMatchObject({ ok: true, version: { versionNumber: 11, versionNote: "Restore schedule based on v08" }, schedule: { workingDraft: null } });
    if (!result.ok) throw new Error("Expected Publish");
    expect(result.schedule.publishedVersions.slice(0, 2)).toEqual(item.publishedVersions);
    expect(result.schedule.publishedVersions[1]).toBe(legacy);
    expect(Object.isFrozen(result.version)).toBe(true);
  });
  it.each([undefined, null, 42, "", " \t\n", "x".repeat(201)])("rejects invalid Publish Note %j without mutation", value => {
    const item = freezeScheduleGraph(scheduleWithDraft([], [version(10)]));
    const before = structuredClone(item);
    const result = publishScheduleWorkingDraft(item, { ...publishInput, versionNote: value as string }, context);
    expect(result).toMatchObject({ ok: false, reason: "validation-failed", issues: [expect.objectContaining({ code: typeof value === "string" && value.length > 200 ? "schedule.publish.note-too-long" : "schedule.publish.note-required" })] });
    expect(result).not.toHaveProperty("schedule");
    expect(item).toEqual(before);
  });
  it("accepts exactly 200 trimmed characters on first Publish", () => {
    expect(publishScheduleWorkingDraft(scheduleWithDraft([]), { ...publishInput, versionNote: `  ${"x".repeat(200)}  ` }, context))
      .toMatchObject({ ok: true, version: { versionNumber: 1, versionNote: "x".repeat(200) } });
  });
  it("aggregates missing note and exact future Actual blocker independently", () => {
    const item = scheduleWithDraft([draftMilestone("future", definitionA.id, { actual: dateOnly("2026-10-15") })]);
    const result = publishScheduleWorkingDraft(item, { ...publishInput, versionNote: " " }, context);
    expect(result).toMatchObject({ ok: false, issues: expect.arrayContaining([
      expect.objectContaining({ code: "schedule.publish.note-required" }),
      expect.objectContaining({ code: "schedule.data.future-actual", message: "Actual date cannot be later than today." }),
    ]) });
  });
  it("faithfully inherits retired occurrences, permits removal only, then publishes cleanup", () => {
    const rows = [publishedMilestone("retired-a", legacyDefinition.id), publishedMilestone("retired-b", legacyDefinition.id)];
    const item = freezeScheduleGraph(schedule([version(8, rows), version(10)]));
    const started = startScheduleWorkingDraft(item, { workingDraftId: draftId, basePublishedVersionNumber: toScheduleVersionNumber(8) }, context);
    if (!started.ok) throw new Error("Expected Draft");
    expect(started.draft.milestones).toEqual(rows);
    expect(publishScheduleWorkingDraft(started.schedule, publishInput, context)).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "schedule.import.retired-definition-not-retained" })]) });
    expect(updateScheduleWorkingDraftMilestone(started.schedule, { milestoneId: rows[0].milestoneId, field: "plan", value: null }, context).ok).toBe(false);
    let cleaned = started.schedule;
    for (const row of rows) {
      const result = removeScheduleWorkingDraftMilestone(cleaned, { milestoneId: row.milestoneId }, context);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Expected removal cleanup");
      cleaned = result.schedule;
    }
    expect(addScheduleWorkingDraftMilestone(cleaned, { milestoneId: rows[0].milestoneId, milestoneDefinitionId: legacyDefinition.id }, context).ok).toBe(false);
    expect(publishScheduleWorkingDraft(cleaned, publishInput, context)).toMatchObject({ ok: true, version: { versionNumber: 11, milestones: [] } });
    expect(item.publishedVersions[0].milestones).toEqual(rows);
    expect(cleaned.publishedVersions).toBe(item.publishedVersions);
  });
});

const context: CanonicalScheduleCommandContext = {
  referenceDate: parseDateOnly("2026-10-14")!,
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
  return { referenceDate: parseDateOnly("2026-10-14")!, governance: governance.value, localDefinitions: [], retiredDraftOccurrenceGrants: grants.value };
}

function confirmedLocalSchedule(original = scheduleWithDraft([])) {
  const confirmed = confirmProjectLocalMilestoneDefinition(original, {
    definitionId: toMilestoneDefinitionId("manual-local"), name: "Manual local",
    stageGroupId: toStageGroupId("stage-a1"), milestoneTypeId: toMilestoneTypeId("type-test"),
    source: "manual", evidenceIds: [],
  }, context.governance);
  if (!confirmed.ok) throw new Error(JSON.stringify(confirmed));
  return {
    schedule: confirmed.value,
    context: { ...context, localDefinitions: confirmed.value.localDefinitions },
    input: { milestoneId: toMilestoneId("explicit-local-row"), milestoneDefinitionId: toMilestoneDefinitionId("manual-local") },
  };
}

describe("normal Add of a confirmed same-Project local definition", () => {
  it("adds_confirmed_same_project_local_definition_to_working_draft", () => {
    const fixture = confirmedLocalSchedule(scheduleWithDraft([draftMilestone("existing")], [version(1, [publishedMilestone("official")])]));
    const original = freezeScheduleGraph(fixture.schedule);
    const before = structuredClone({ schedule: original, context: fixture.context });
    const result = addScheduleWorkingDraftMilestone(original, fixture.input, fixture.context);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.milestone).toEqual({
      milestoneId: "explicit-local-row", milestoneDefinitionId: "manual-local",
      applicability: "applicable", plan: null, actual: null,
    });
    expect(result.draft.milestones).toHaveLength(2);
    expect(result.draft.milestones[0]).toBe(original.workingDraft!.milestones[0]);
    expect(result.draft.milestones[1]).toBe(result.milestone);
    expect(result.schedule.localDefinitions).toBe(original.localDefinitions);
    expect(result.schedule.localDefinitions).toEqual(before.schedule.localDefinitions);
    expect(result.schedule.publishedVersions).toBe(original.publishedVersions);
    expect({ schedule: original, context: fixture.context }).toEqual(before);
  });

  it("confirming_local_definition_does_not_add_occurrence_implicitly", () => {
    const original = freezeScheduleGraph(scheduleWithDraft([draftMilestone("existing")]));
    const confirmed = confirmedLocalSchedule(original).schedule;
    expect(confirmed.localDefinitions).toHaveLength(1);
    expect(confirmed.workingDraft).toBe(original.workingDraft);
    expect(confirmed.workingDraft!.milestones).toHaveLength(1);
    expect(confirmed.workingDraft!.milestones.map(row => row.milestoneDefinitionId)).toEqual(["definition-a"]);
  });

  it("rejects_local_definition_not_owned_by_this_schedule", () => {
    const fixture = confirmedLocalSchedule();
    const foreign = freezeScheduleGraph({ ...scheduleWithDraft([]), projectId: toProjectId("foreign-project") });
    const before = structuredClone({ foreign, owner: fixture.schedule, context: fixture.context });
    expect(addScheduleWorkingDraftMilestone(foreign, fixture.input, fixture.context)).toMatchObject({ ok: false, reason: "validation-failed" });
    expect({ foreign, owner: fixture.schedule, context: fixture.context }).toEqual(before);
  });

  it("rejects_unknown_local_definition_id", () => {
    const fixture = confirmedLocalSchedule();
    const before = structuredClone(fixture.schedule);
    // A display name is not an identity or an authorization to infer one.
    const result = addScheduleWorkingDraftMilestone(fixture.schedule,
      { ...fixture.input, milestoneDefinitionId: toMilestoneDefinitionId("Manual local") }, fixture.context);
    expect(result).toMatchObject({ ok: false, reason: "validation-failed" });
    expect(fixture.schedule).toEqual(before);
  });

  it("rejects_retired_or_compatibility_public_definition_as_normal_add", () => {
    const fixture = confirmedLocalSchedule();
    const restricted = { ...fixture.context, governance: { ...fixture.context.governance, addablePublicDefinitions: [definitionB] } };
    for (const milestoneDefinitionId of [definitionA.id, legacyDefinition.id]) {
      const existing = { ...fixture.schedule, publishedVersions: [version(1, [publishedMilestone("retained-public", milestoneDefinitionId)])] };
      const forged = { ...existing, localDefinitions: [{ ...existing.localDefinitions[0], id: milestoneDefinitionId }] };
      for (const original of [existing, forged]) {
        const addContext = { ...restricted, localDefinitions: original.localDefinitions };
        const before = structuredClone(original);
        expect(addScheduleWorkingDraftMilestone(original, { ...fixture.input, milestoneDefinitionId }, addContext))
          .toMatchObject({ ok: false, reason: "validation-failed" });
        expect(original).toEqual(before);
      }
    }
  });

  it("confirmed_local_add_preserves_public_add_behavior", () => {
    const fixture = confirmedLocalSchedule();
    const local = addScheduleWorkingDraftMilestone(fixture.schedule, fixture.input, fixture.context);
    expect(local.ok).toBe(true);
    if (!local.ok) throw new Error(JSON.stringify(local));
    const added = addScheduleWorkingDraftMilestone(local.schedule,
      { milestoneId: toMilestoneId("public-after-local"), milestoneDefinitionId: definitionA.id }, fixture.context);
    expect(added.ok).toBe(true);
    if (!added.ok) throw new Error(JSON.stringify(added));
    expect(added.milestone).toEqual({ milestoneId: "public-after-local", milestoneDefinitionId: "definition-a", applicability: "applicable", plan: null, actual: null });
    expect(added.draft.milestones[0]).toBe(local.milestone);
    expect(added.draft.milestones).toHaveLength(2);
    expect(added.schedule.localDefinitions).toBe(fixture.schedule.localDefinitions);
  });

  it("local_add_preserves_duplicate_definition_guard", () => {
    const fixture = confirmedLocalSchedule();
    const added = addScheduleWorkingDraftMilestone(fixture.schedule, fixture.input, fixture.context);
    expect(added.ok).toBe(true);
    if (!added.ok) throw new Error(JSON.stringify(added));
    const before = structuredClone(added.schedule);
    const result = addScheduleWorkingDraftMilestone(added.schedule,
      { ...fixture.input, milestoneId: toMilestoneId("another-local-row") }, fixture.context);
    expect(result).toMatchObject({ ok: false, reason: "validation-failed", issues: [expect.objectContaining({ code: "schedule.draft.definition-not-addable-or-retained" })] });
    expect(added.schedule).toEqual(before);
  });

  it("local_add_preserves_milestone_id_collision_guard", () => {
    const fixture = confirmedLocalSchedule(scheduleWithDraft([draftMilestone("existing")]));
    const before = structuredClone(fixture.schedule);
    const result = addScheduleWorkingDraftMilestone(fixture.schedule,
      { ...fixture.input, milestoneId: toMilestoneId("existing") }, fixture.context);
    expect(result).toMatchObject({ ok: false, reason: "validation-failed" });
    if (result.ok) throw new Error("Expected MilestoneId collision");
    expect(result.issues.map(issue => issue.code)).toContain("schedule.draft.integrity.duplicate-milestone-id");
    expect(fixture.schedule).toEqual(before);
  });

  it.each([false, true])("local_add_does_not_create_review_evidence_or_decisions: existing review=%s", withReview => {
    const fixture = confirmedLocalSchedule();
    let original = fixture.schedule;
    if (withReview) {
      const loaded = loadBuiltInScheduleSimulation(original, { pack: "basic-success", ids: {
        sessionId: toScheduleReviewSessionId("existing-session"),
        evidenceIds: ["e1", "e2", "e3"].map(toScheduleEvidenceId),
        candidateIds: ["c1", "c2", "c3"].map(toScheduleImportCandidateId),
      } }, fixture.context);
      if (!loaded.ok) throw new Error(JSON.stringify(loaded));
      original = loaded.value;
      expect(original.evidenceLedger).toHaveLength(3);
      expect(original.workingDraft!.importCandidates).toHaveLength(3);
    }
    const before = structuredClone(original);
    const added = addScheduleWorkingDraftMilestone(original, fixture.input, fixture.context);
    expect(added.ok).toBe(true);
    if (!added.ok) throw new Error(JSON.stringify(added));
    for (const key of ["evidenceLedger", "reviewSessions", "reviewDecisions", "reviewClosures"] as const) {
      expect(added.schedule[key]).toBe(original[key]);
      expect(added.schedule[key]).toEqual(before[key]);
    }
    expect(added.draft.reviewSessionIds).toBe(original.workingDraft!.reviewSessionIds);
    expect(added.draft.importCandidates).toBe(original.workingDraft!.importCandidates);
    expect(added.draft.importCandidates).toEqual(before.workingDraft!.importCandidates);
    expect(original).toEqual(before);
  });

  it.each(["no draft", "invalid draft"])("local_add_is_failure_atomic: %s", kind => {
    const fixture = confirmedLocalSchedule(kind === "no draft" ? schedule([version(1)])
      : scheduleWithDraft([draftMilestone("unresolved", toMilestoneDefinitionId("unknown"))], [version(1)]));
    const original = freezeScheduleGraph(fixture.schedule);
    const before = structuredClone({ schedule: original, context: fixture.context, input: fixture.input });
    const result = addScheduleWorkingDraftMilestone(original, fixture.input, fixture.context);
    expect(result).toMatchObject({ ok: false, reason: kind === "no draft" ? "no-working-draft" : "validation-failed" });
    expect(result).not.toHaveProperty("schedule");
    expect({ schedule: original, context: fixture.context, input: fixture.input }).toEqual(before);
  });

  it.each([
    ["unconfirmed", { confirmation: "pending" }],
    ["blank identity", { id: " " }],
    ["blank name", { name: " " }],
    ["illegal Stage", { stageGroupId: "unknown-stage" }],
    ["illegal Type", { milestoneTypeId: "unknown-type" }],
  ] as const)("rejects malformed owned local: %s", (_label, overrides) => {
    const fixture = confirmedLocalSchedule();
    const local = { ...fixture.schedule.localDefinitions[0], ...overrides } as ProjectLocalMilestoneDefinition;
    const original = { ...fixture.schedule, localDefinitions: [local] };
    const addContext = { ...fixture.context, localDefinitions: [{ ...local, confirmation: "confirmed" as const }] };
    const before = structuredClone({ original, addContext });
    expect(addScheduleWorkingDraftMilestone(original, { ...fixture.input, milestoneDefinitionId: local.id }, addContext))
      .toMatchObject({ ok: false, reason: "validation-failed" });
    expect({ original, addContext }).toEqual(before);
  });

  it.each(["same", "different"])("rejects_duplicate_local_registry_identity: %s names", names => {
    const fixture = confirmedLocalSchedule();
    const duplicate = { ...fixture.schedule.localDefinitions[0], name: names === "same" ? "Manual local" : "Different local" };
    const original = { ...fixture.schedule, localDefinitions: [...fixture.schedule.localDefinitions, duplicate] };
    const before = structuredClone(original);
    expect(addScheduleWorkingDraftMilestone(original, fixture.input, fixture.context))
      .toMatchObject({ ok: false, reason: "validation-failed" });
    expect(original).toEqual(before);
  });

  it.each(["missing", "name", "stageGroupId", "milestoneTypeId"] as const)("rejects_forged_or_missing_local_context: %s", field => {
    const fixture = confirmedLocalSchedule();
    const local = fixture.schedule.localDefinitions[0];
    const addContext = { ...fixture.context, localDefinitions: field === "missing" ? [] : [{ ...local, [field]: "forged" }] };
    const before = structuredClone({ schedule: fixture.schedule, addContext });
    expect(addScheduleWorkingDraftMilestone(fixture.schedule, fixture.input, addContext))
      .toMatchObject({ ok: false, reason: "validation-failed" });
    expect({ schedule: fixture.schedule, addContext }).toEqual(before);
  });
});

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
    expect(publishScheduleWorkingDraft(malformed, { versionNote: "Schedule update", publishedAt: "now" }, malformedContext).ok).toBe(false);
  });
  it("resolves only legal same-Project local IDs for edit and Publish", () => {
    const local: ProjectLocalMilestoneDefinition = { id: toMilestoneDefinitionId("confirmed-local"), name: "Confirmed local", stageGroupId: toStageGroupId("stage-a1"), milestoneTypeId: toMilestoneTypeId("type-smt"), displayOrder: 1, source: "manual", confirmation: "confirmed", evidenceIds: [] };
    const item = { ...scheduleWithDraft([draftMilestone("local-row", local.id)]), localDefinitions: [local] };
    const localContext = { ...context, localDefinitions: [local] };
    const input = { milestoneId: toMilestoneId("local-row"), field: "plan", value: dateOnly("2026-10-02") } as const;
    const updated = updateScheduleWorkingDraftMilestone(item, input, localContext);
    expect(updated.ok).toBe(true);
    if (!updated.ok) throw new Error("Expected local edit");
    const published = publishScheduleWorkingDraft(updated.schedule, { versionNote: "Schedule update", publishedAt: "now" }, localContext);
    expect(published.ok).toBe(true);
    if (!published.ok) throw new Error("Expected local Publish");
    expect(published.version.milestones[0]).toMatchObject({ milestoneId: "local-row", milestoneDefinitionId: "confirmed-local", plan: "2026-10-02" });
    expect(updateScheduleWorkingDraftMilestone({ ...item, localDefinitions: [] }, input, localContext).ok).toBe(false);
    expect(updateScheduleWorkingDraftMilestone(item, input, context).ok).toBe(false);
    const invalid = { ...local, milestoneTypeId: toMilestoneTypeId("unknown-type") };
    expect(publishScheduleWorkingDraft({ ...item, localDefinitions: [invalid] }, { versionNote: "Schedule update", publishedAt: "now" }, { ...context, localDefinitions: [invalid] }).ok).toBe(false);
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
    const published = publishScheduleWorkingDraft(updated.schedule, { versionNote: "Schedule update", publishedAt: "now" }, granted);
    expect(published.ok).toBe(true);
    if (!published.ok) throw new Error("Expected D1 Publish");
    const withoutGrant = { ...granted, retiredDraftOccurrenceGrants: [] };
    const cloned = startScheduleWorkingDraft(published.schedule, { workingDraftId: toCanonicalScheduleWorkingDraftId("after-publish") }, withoutGrant);
    if (!cloned.ok) throw new Error("Expected retained clone");
    expect(updateScheduleWorkingDraftMilestone(cloned.schedule, input, withoutGrant).ok).toBe(true);
    expect(publishScheduleWorkingDraft(cloned.schedule, { versionNote: "Schedule update", publishedAt: "later" }, withoutGrant).ok).toBe(true);
    for (const invalidGrant of [
      { ...grant, projectId: toProjectId("other") },
      { ...grant, workingDraftId: toCanonicalScheduleWorkingDraftId("other") },
      { ...grant, milestoneId: toMilestoneId("other") },
      { ...grant, milestoneDefinitionId: definitionB.id },
    ]) {
      const invalidContext = { ...granted, retiredDraftOccurrenceGrants: [invalidGrant] };
      expect(updateScheduleWorkingDraftMilestone(item, input, invalidContext).ok).toBe(false);
      expect(publishScheduleWorkingDraft(item, { versionNote: "Schedule update", publishedAt: "now" }, invalidContext).ok).toBe(false);
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
      [publishScheduleWorkingDraft(item, { versionNote: "Schedule update", publishedAt: "2026-10-01T03:00:00Z" }, derived), "schedule.import.retired-definition-not-retained"],
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
    expect(publishScheduleWorkingDraft(retained, { versionNote: "Schedule update", publishedAt: "now" }, context).ok).toBe(true);
    const olderOnly = scheduleWithDraft([first], [version(1, [first]), version(2, [])]);
    expect(publishScheduleWorkingDraft(olderOnly, { versionNote: "Schedule update", publishedAt: "now" }, context).ok).toBe(false);
    const wrongOccurrence = scheduleWithDraft([{ ...first, milestoneId: toMilestoneId("recreated") }], retained.publishedVersions);
    expect(publishScheduleWorkingDraft(wrongOccurrence, { versionNote: "Schedule update", publishedAt: "now" }, context).ok).toBe(false);
    expect(addScheduleWorkingDraftMilestone(scheduleWithDraft([draftMilestone("present")]), { milestoneId: toMilestoneId("duplicate-definition"), milestoneDefinitionId: definitionA.id }, context).ok).toBe(false);
  });
  it("starts_empty_draft_without_published_schedule_and_uses_injected_working_draft_id", () => {
    const id = toCanonicalScheduleWorkingDraftId("draft-empty-1");
    const result = startScheduleWorkingDraft(schedule(), { workingDraftId: id }, context);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected created Draft");
    expect(result.status).toBe("created");
    expect(result.draft).toEqual({
      basePublishedVersionNumber: null,
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
      .toEqualTypeOf<"publishedAt" | "versionNote">();
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
    const result = publishScheduleWorkingDraft(original, { versionNote: "Schedule update", publishedAt: "must-not-publish" }, context);
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
      original, { versionNote: "Schedule update", publishedAt: "2026-09-11T12:00:00Z" }, { ...context, referenceDate: dateOnly("2030-01-16") },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected Publish success");
    expect(result.version.versionNumber).toBe(4);
    expect(result.version.versionNote).toBe("Schedule update");
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
      empty, { versionNote: "Schedule update", publishedAt: "first-publication" }, context,
    );
    expect(published.ok).toBe(true);
    if (!published.ok) throw new Error("Expected first Publish success");
    expect(published.version.versionNumber).toBe(1);
    expect(published.version.milestones).toEqual([]);
    expect(published.version.versionNote).toBe("Schedule update");
    expect(published.version.publishedAt).toBe("first-publication");
    expect(empty.workingDraft).toBe(emptyDraft);
    expect(empty.publishedVersions).toHaveLength(0);

    const overflow = freezeScheduleGraph(
      scheduleWithDraft([], [version(Number.MAX_SAFE_INTEGER)]),
    );
    const overflowDraft = overflow.workingDraft;
    const overflowHistory = overflow.publishedVersions;
    expect(publishScheduleWorkingDraft(
      overflow, { versionNote: "Schedule update", publishedAt: "overflow-attempt" }, context,
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
    expect(publishScheduleWorkingDraft(input, { versionNote: "Schedule update", publishedAt: "published-now" }, context))
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
      input, { versionNote: "Schedule update", publishedAt: "published-now" }, context,
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
      original, { versionNote: "Schedule update", publishedAt: "rejected" }, context,
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
      original, { versionNote: "Schedule update", publishedAt: "rejected-publication" }, context,
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
      { versionNote: "Schedule update", publishedAt: "first" }, context,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected first Publish");
    const secondInput = freezeScheduleGraph(first.schedule);
    const firstHistory = secondInput.publishedVersions;
    const firstVersion = firstHistory[0];
    const firstRows = firstVersion?.milestones;
    expect(publishScheduleWorkingDraft(
      secondInput, { versionNote: "Schedule update", publishedAt: "second" }, context,
    )).toEqual({ ok: false, reason: "no-working-draft", issues: [] });
    expect(secondInput.publishedVersions).toBe(firstHistory);
    expect(secondInput.publishedVersions[0]).toBe(firstVersion);
    expect(secondInput.publishedVersions[0]?.milestones).toBe(firstRows);
    expect(secondInput.publishedVersions).toHaveLength(1);
  });
});


describe("future Actual publication boundary", () => {
  const today = dateOnly("2026-10-14");
  const datedContext = { ...context, referenceDate: today };
  it("reports the exact future-Actual blocker even for an N/A occurrence", () => {
    const schedule = scheduleWithDraft([draftMilestone("na-future", definitionA.id, {
      applicability: "notApplicable", plan: null, actual: dateOnly("2026-10-15"),
    })], [version(1)]);
    const before = structuredClone(schedule);
    const result = publishScheduleWorkingDraft(schedule, { versionNote: "Schedule update", publishedAt: "audit" }, datedContext);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected blocked publication");
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "schedule.data.future-actual", severity: "blocking", message: "Actual date cannot be later than today." }));
    expect(schedule).toEqual(before);
  });
  it.each([["2026-10-31", "2026-11-01"], ["2026-12-31", "2027-01-01"]])(
    "blocks across %s to %s until the local calendar day advances", (previous, next) => {
      const schedule = scheduleWithDraft([draftMilestone("rollover", definitionA.id, { actual: dateOnly(next) })], [version(1)]);
      const before = structuredClone(schedule);
      const blocked = publishScheduleWorkingDraft(schedule, { versionNote: "Schedule update", publishedAt: "2027-01-02T00:00:00Z" }, { ...context, referenceDate: dateOnly(previous) });
      expect(blocked).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "schedule.data.future-actual", message: "Actual date cannot be later than today." })]) });
      expect(schedule).toEqual(before);
      const allowed = publishScheduleWorkingDraft(schedule, { versionNote: "Schedule update", publishedAt: "2026-01-01T00:00:00Z" }, { ...context, referenceDate: dateOnly(next) });
      expect(allowed).toMatchObject({ ok: true, version: { versionNumber: 2 } });
    });
  it.each(["2026-10-13", "2026-10-14"])("allows Actual %s", actual => {
    const item = scheduleWithDraft([draftMilestone("actual", definitionA.id, { actual: dateOnly(actual) })]);
    expect(publishScheduleWorkingDraft(item, { versionNote: "Schedule update", publishedAt: "audit-timestamp" }, datedContext).ok).toBe(true);
  });
  it("retains tomorrow in Draft, blocks Publish without mutation, then permits correction", () => {
    const original = scheduleWithDraft([draftMilestone("actual")], [version(1)]);
    const edit = updateScheduleWorkingDraftMilestone(original, { milestoneId: toMilestoneId("actual"), field: "actual", value: dateOnly("2026-10-15") }, datedContext);
    expect(edit.ok).toBe(true);
    if (!edit.ok) throw new Error("edit failed");
    const before = structuredClone(edit.schedule);
    const blocked = publishScheduleWorkingDraft(edit.schedule, { versionNote: "Schedule update", publishedAt: "audit-timestamp" }, datedContext);
    expect(blocked).toMatchObject({ ok: false, reason: "validation-failed", issues: [expect.objectContaining({ code: "schedule.data.future-actual", severity: "blocking", message: "Actual date cannot be later than today." })] });
    expect(edit.schedule).toEqual(before);
    expect(edit.schedule.publishedVersions).toBe(original.publishedVersions);
    const fixed = updateScheduleWorkingDraftMilestone(edit.schedule, { milestoneId: toMilestoneId("actual"), field: "actual", value: today }, datedContext);
    if (!fixed.ok) throw new Error("correction failed");
    expect(publishScheduleWorkingDraft(fixed.schedule, { versionNote: "Schedule update", publishedAt: "audit-timestamp" }, datedContext).ok).toBe(true);
  });
});
