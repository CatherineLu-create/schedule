import { describe, expect, it } from "vitest";
import { milestoneDefinitions, milestoneTypeCatalog, stageGroupCatalog } from "../../config/v2/referenceData";
import type { CommandResult } from "../../domain/governance/milestoneGovernance";
import { createEmptyCanonicalProjectSchedule, type CanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import type { ConfirmProjectLocalMilestoneDefinitionInput, ScheduleReviewFailureCode } from "../../domain/schedule/scheduleReview";
import { toCanonicalScheduleWorkingDraftId, toMilestoneDefinitionId, toMilestoneId, toMilestoneTypeId, toScheduleEvidenceId, toStageGroupId } from "../../domain/shared/ids";
import { devProject001, devProject003 } from "../../fixtures/v2/canonicalProjectFixtures";
import { devSchedule001 } from "../../fixtures/v2/canonicalScheduleFixtures";
import { initialGovernanceContext, publishedRetirementFixture } from "../../test/governanceTestUtils";
import { selectEffectiveMilestoneGovernanceContext } from "../governance/effectiveMilestoneGovernanceContext";
import { addScheduleWorkingDraftMilestone, startScheduleWorkingDraft } from "./canonicalScheduleCommands";
import { confirmProjectLocalMilestoneDefinition } from "./scheduleReviewCommands";

function value<T>(result: CommandResult<T, string>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}

function input(overrides: Partial<ConfirmProjectLocalMilestoneDefinitionInput> = {}): ConfirmProjectLocalMilestoneDefinitionInput {
  return {
    definitionId: toMilestoneDefinitionId("local-acceptance"), name: "Local acceptance",
    stageGroupId: toStageGroupId("stage-a1"), milestoneTypeId: toMilestoneTypeId("type-test"),
    source: "manual", evidenceIds: [], ...overrides,
  };
}

function freeze<T>(object: T): T {
  if (object !== null && typeof object === "object") {
    for (const child of Object.values(object)) freeze(child);
    Object.freeze(object);
  }
  return object;
}

function expectOnlyRegistryChanged(before: CanonicalProjectSchedule, after: CanonicalProjectSchedule) {
  expect(after).not.toBe(before);
  for (const key of Object.keys(before) as (keyof CanonicalProjectSchedule)[]) {
    if (key !== "localDefinitions") expect(after[key]).toBe(before[key]);
  }
  expect(after.localDefinitions.slice(0, -1)).toEqual(before.localDefinitions);
}

function expectRejected(
  request: ConfirmProjectLocalMilestoneDefinitionInput,
  field: string,
  code: ScheduleReviewFailureCode = "invalid-local-classification",
  schedule = createEmptyCanonicalProjectSchedule(devProject001.id),
  governance = initialGovernanceContext(),
) {
  const before = structuredClone({ schedule, governance, request, milestoneDefinitions, milestoneTypeCatalog, stageGroupCatalog });
  freeze(schedule); freeze(governance); freeze(request);
  const result = confirmProjectLocalMilestoneDefinition(schedule, request, governance);
  expect(result).toMatchObject({ ok: false, code, issues: [expect.objectContaining({
    domain: "schedule", source: "data", severity: "blocking",
    target: { section: "schedule.localDefinitions", entityId: request.definitionId, field },
  })] });
  expect({ schedule, governance, request, milestoneDefinitions, milestoneTypeCatalog, stageGroupCatalog }).toEqual(before);
  return result;
}

describe("confirmProjectLocalMilestoneDefinition", () => {
  it("confirms_manual_local_definition_with_existing_stage_and_type", () => {
    const schedule = freeze(structuredClone(devSchedule001));
    const governance = freeze(initialGovernanceContext());
    const request = freeze(input());
    const untouched = structuredClone({ schedule, governance, request, devProject001, devProject003, milestoneDefinitions, stageGroupCatalog, milestoneTypeCatalog });
    const next = value(confirmProjectLocalMilestoneDefinition(schedule, request, governance));
    expect(next.localDefinitions).toEqual([{
      id: "local-acceptance", name: "Local acceptance", stageGroupId: "stage-a1", milestoneTypeId: "type-test",
      displayOrder: 370, source: "manual", confirmation: "confirmed", evidenceIds: [],
    }]);
    expectOnlyRegistryChanged(schedule, next);
    expect({ schedule, governance, request, devProject001, devProject003, milestoneDefinitions, stageGroupCatalog, milestoneTypeCatalog }).toEqual(untouched);
  });

  it("trims_local_definition_name_and_rejects_blank", () => {
    const schedule = createEmptyCanonicalProjectSchedule(devProject001.id);
    const next = value(confirmProjectLocalMilestoneDefinition(schedule, input({ name: " \t Local acceptance \n " }), initialGovernanceContext()));
    expect(next.localDefinitions[0].name).toBe("Local acceptance");
    expectRejected(input({ name: " \t\n " }), "name");
  });

  it("rejects_unknown_stage", () => {
    expectRejected(input({ stageGroupId: toStageGroupId("stage-new") }), "stageGroupId");
  });
  it("rejects_unknown_milestone_type", () => {
    expectRejected(input({ milestoneTypeId: toMilestoneTypeId("type-new") }), "milestoneTypeId");
  });
  it.each(["Other", "Misc", "Unclassified", "A1-stage", "G/O"])("rejects_catch_all_or_fabricated_classification: %s", label => {
    expectRejected(input({ stageGroupId: toStageGroupId(label) }), "stageGroupId");
    expectRejected(input({ milestoneTypeId: toMilestoneTypeId(label) }), "milestoneTypeId");
    expectRejected(input({ stageGroupId: toStageGroupId(`stage-${label.toLowerCase()}`) }), "stageGroupId");
    expectRejected(input({ milestoneTypeId: toMilestoneTypeId(`type-${label.toLowerCase()}`) }), "milestoneTypeId");
  });

  it("accepts_existing_classifications_used_by_compatibility_definitions", () => {
    const next = value(confirmProjectLocalMilestoneDefinition(createEmptyCanonicalProjectSchedule(devProject001.id),
      input({ stageGroupId: toStageGroupId("stage-a-a2"), milestoneTypeId: toMilestoneTypeId("type-bios-frozen") }), initialGovernanceContext()));
    expect(next.localDefinitions[0]).toMatchObject({ stageGroupId: "stage-a-a2", milestoneTypeId: "type-bios-frozen" });
  });

  it("rejects_local_definition_id_collision_with_same_project_local", () => {
    const schedule = value(confirmProjectLocalMilestoneDefinition(createEmptyCanonicalProjectSchedule(devProject001.id), input(), initialGovernanceContext()));
    expectRejected(input({ name: "Different work" }), "definitionId", "id-collision", schedule);
  });
  it.each(["milestone-a1-a-test", "milestone-c2-golden-run"])("rejects_local_definition_id_collision_with_public_historical_definition: %s", id => {
    expectRejected(input({ definitionId: toMilestoneDefinitionId(id) }), "definitionId", "id-collision");
  });
  it("does_not_accept_retired_public_definition_id_as_local_workaround", () => {
    const fixture = publishedRetirementFixture();
    const governance = value(selectEffectiveMilestoneGovernanceContext(fixture.state));
    expect(governance.addablePublicDefinitions.some(definition => definition.id === fixture.grant.milestoneDefinitionId)).toBe(false);
    expectRejected(input({ definitionId: fixture.grant.milestoneDefinitionId }), "definitionId", "id-collision", fixture.schedule, governance);
  });
  it("rejects_blank_definition_identity_without_generating_or_normalizing_one", () => {
    expectRejected(input({ definitionId: " \t " as ConfirmProjectLocalMilestoneDefinitionInput["definitionId"] }), "definitionId", "id-collision");
    const next = value(confirmProjectLocalMilestoneDefinition(createEmptyCanonicalProjectSchedule(devProject001.id),
      input({ definitionId: toMilestoneDefinitionId(" opaque exact ID ") }), initialGovernanceContext()));
    expect(next.localDefinitions[0].id).toBe(" opaque exact ID ");
  });

  it("does_not_make_local_definition_public_or_cross_project_addable", () => {
    const governance = initialGovernanceContext();
    const before = structuredClone(governance);
    const local = value(confirmProjectLocalMilestoneDefinition(createEmptyCanonicalProjectSchedule(devProject001.id), input(), governance));
    expect(local.localDefinitions.map(definition => definition.id)).toEqual(["local-acceptance"]);
    for (const schedule of [local, createEmptyCanonicalProjectSchedule(devProject003.id)]) {
      const context = { governance, localDefinitions: local.localDefinitions, retiredDraftOccurrenceGrants: [] };
      const started = startScheduleWorkingDraft(schedule, { workingDraftId: toCanonicalScheduleWorkingDraftId("public-only-add") }, context);
      if (!started.ok) throw new Error(JSON.stringify(started));
      const added = addScheduleWorkingDraftMilestone(started.schedule, { milestoneId: toMilestoneId("local-add"), milestoneDefinitionId: input().definitionId }, context);
      expect(added.ok).toBe(false);
      expect(started.schedule.workingDraft?.milestones).toEqual([]);
    }
    expect(governance).toEqual(before);
    for (const definitions of [governance.addablePublicDefinitions, governance.definitionsForHistoricalResolution, governance.portfolioColumnDefinitions]) {
      expect(definitions.some(definition => definition.id === input().definitionId)).toBe(false);
    }
  });

  it("manual_local_creation_requires_no_import_session_or_evidence", () => {
    const next = value(confirmProjectLocalMilestoneDefinition(createEmptyCanonicalProjectSchedule(devProject001.id), input(), initialGovernanceContext()));
    expect(next).toMatchObject({ workingDraft: null, publishedVersions: [], evidenceLedger: [], reviewSessions: [], reviewDecisions: [], reviewClosures: [] });
    expect(next.localDefinitions[0]).toMatchObject({ source: "manual", evidenceIds: [] });
  });

  it.each(["manual", "import"] as const)("supplied_evidence_ids_are_preserved_without_fabricating_new_evidence: %s", source => {
    const evidenceIds = [toScheduleEvidenceId("reference-b"), toScheduleEvidenceId("reference-a"), toScheduleEvidenceId("reference-b")];
    const next = value(confirmProjectLocalMilestoneDefinition(createEmptyCanonicalProjectSchedule(devProject001.id), input({ source, evidenceIds }), initialGovernanceContext()));
    expect(next.localDefinitions[0]).toMatchObject({ source, evidenceIds: ["reference-b", "reference-a", "reference-b"] });
    expect(next.localDefinitions[0].evidenceIds).not.toBe(evidenceIds);
    evidenceIds.push(toScheduleEvidenceId("later-caller-change"));
    expect(next.localDefinitions[0].evidenceIds).toEqual(["reference-b", "reference-a", "reference-b"]);
    expect(next.evidenceLedger).toEqual([]);
    expect(next.reviewSessions).toEqual([]);
    expect(next.reviewDecisions).toEqual([]);
  });
  it("rejects_unknown_source", () => {
    expectRejected({ ...input(), source: "guessed" } as unknown as ConfirmProjectLocalMilestoneDefinitionInput, "source");
  });

  it("command_failure_is_atomic_and_does_not_touch_published_or_draft_occurrences", () => {
    const context = { governance: initialGovernanceContext(), localDefinitions: [], retiredDraftOccurrenceGrants: [] };
    const started = startScheduleWorkingDraft(structuredClone(devSchedule001), { workingDraftId: toCanonicalScheduleWorkingDraftId("atomic-draft") }, context);
    if (!started.ok) throw new Error(JSON.stringify(started));
    expect(started.draft.milestones.length).toBeGreaterThan(0);
    expectRejected(input({ name: " " }), "name", "invalid-local-classification", started.schedule, context.governance);
  });

  it("confirmed_local_definition_does_not_create_occurrence_implicitly", () => {
    const context = { governance: initialGovernanceContext(), localDefinitions: [], retiredDraftOccurrenceGrants: [] };
    const started = startScheduleWorkingDraft(structuredClone(devSchedule001), { workingDraftId: toCanonicalScheduleWorkingDraftId("untouched-draft") }, context);
    if (!started.ok) throw new Error(JSON.stringify(started));
    const before = freeze(started.schedule);
    const next = value(confirmProjectLocalMilestoneDefinition(before, input(), context.governance));
    expectOnlyRegistryChanged(before, next);
    expect(next.workingDraft?.milestones.some(milestone => milestone.milestoneDefinitionId === input().definitionId)).toBe(false);
  });

  it("keeps_distinct_opaque_identity_namespaces_independent", () => {
    const id = devSchedule001.publishedVersions[0].milestones[0].milestoneId;
    const next = value(confirmProjectLocalMilestoneDefinition(devSchedule001,
      input({ definitionId: toMilestoneDefinitionId(id), evidenceIds: [toScheduleEvidenceId(id)] }), initialGovernanceContext()));
    expect(next.localDefinitions[0].id).toBe(id);
  });

  it("appends_deterministic_display_order_after_all_public_history_and_existing_locals", () => {
    const governance = initialGovernanceContext();
    const first = value(confirmProjectLocalMilestoneDefinition(createEmptyCanonicalProjectSchedule(devProject001.id), input(), governance));
    const second = value(confirmProjectLocalMilestoneDefinition(first, input({ definitionId: toMilestoneDefinitionId("local-second") }), governance));
    expect(second.localDefinitions.map(definition => definition.displayOrder)).toEqual([370, 380]);
    expect(second.localDefinitions[0]).toBe(first.localDefinitions[0]);
    expect(first.localDefinitions).toHaveLength(1);
    expect(value(confirmProjectLocalMilestoneDefinition(first, input({ definitionId: toMilestoneDefinitionId("local-second") }), governance))).toEqual(second);
  });

  it.each([Number.MAX_SAFE_INTEGER, Number.POSITIVE_INFINITY, Number.NaN])("rejects_unrepresentable_display_order_atomically: %s", order => {
    const governance = initialGovernanceContext();
    const local = value(confirmProjectLocalMilestoneDefinition(createEmptyCanonicalProjectSchedule(devProject001.id), input(), governance));
    const schedule = { ...local, localDefinitions: [{ ...local.localDefinitions[0], displayOrder: order }] };
    expectRejected(input({ definitionId: toMilestoneDefinitionId("local-overflow") }), "displayOrder", "invalid-local-classification", schedule, governance);
    expectRejected(input(), "displayOrder", "invalid-local-classification", createEmptyCanonicalProjectSchedule(devProject001.id), {
      ...governance, definitionsForHistoricalResolution: governance.definitionsForHistoricalResolution.map((definition, index) => index === 0 ? { ...definition, displayOrder: order } : definition),
    });
  });
});
