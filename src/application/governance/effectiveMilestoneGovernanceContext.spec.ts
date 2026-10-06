import { describe, expect, it } from "vitest";
import { createInitialMilestoneGovernanceRuntimeState } from "./milestoneGovernanceInitializer";
import { selectEffectiveMilestoneGovernanceContext, selectEffectiveRetiredDraftOccurrenceGrants } from "./effectiveMilestoneGovernanceContext";
import { publishGovernanceDraft, startGovernanceDraft, updateGovernanceDraft } from "./milestoneGovernanceCommands";
import type { CommandResult, MilestoneGovernanceRuntimeState } from "../../domain/governance/milestoneGovernance";
import { toGovernanceDraftId, toGovernanceReleaseId, toMilestoneDefinitionId, toMilestoneId, toRequirementEnrollmentId, toRequirementWithdrawalId } from "../../domain/shared/ids";
import { createPortfolioVisibleSchema } from "../../portfolioDashboardColumns";
import { selectPortfolioDashboardRows } from "../selectors/portfolioDashboardRows";
import { selectDashboardAttention } from "../selectors/dashboardAttention";
import { createInitialSelfServiceReferenceCatalogs } from "../reference-data/selfServiceCatalogs";
import { createEmptyCanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import { devProject001 } from "../../fixtures/v2/canonicalProjectFixtures";
import { parseDateOnly } from "../../domain/shared/dateOnly";
import { toScheduleVersionNumber } from "../../domain/schedule/schedule";
import type { PrototypeState } from "../state/prototypeState";
import { publishedRetirementFixture } from "../../test/governanceTestUtils";

function value<T>(result: CommandResult<T, string>): T {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}
const baseline = createInitialMilestoneGovernanceRuntimeState();
const release = baseline.releases[0];
const referenceDate = parseDateOnly("2026-10-01")!;
const testDefinition = release.definitions.find(d => d.id === "milestone-a1-a-test")!;
const extra = { ...testDefinition, id: toMilestoneDefinitionId("released-extra-test"), name: "Release readiness" };
const emptySchedule = createEmptyCanonicalProjectSchedule(devProject001.id);
const prototype: PrototypeState = {
  projects: [devProject001], schedules: [{ ...emptySchedule, publishedVersions: [{
    versionNumber: toScheduleVersionNumber(1), versionNote: null, publishedAt: "2026-10-01T00:00:00Z",
    milestones: [{ milestoneId: toMilestoneId("existing-test"), milestoneDefinitionId: testDefinition.id, applicability: "applicable", plan: referenceDate, actual: null }],
  }] }],
};
const catalogs = createInitialSelfServiceReferenceCatalogs();
function changedDraft(): MilestoneGovernanceRuntimeState {
  const started = value(startGovernanceDraft(baseline, toGovernanceDraftId("consumer-draft")));
  return value(updateGovernanceDraft(started, { kind: "replace-candidate-release", candidateRelease: {
    ...started.draft!.candidateRelease,
    definitions: [...release.definitions, extra],
    addableDefinitionIds: [...release.addableDefinitionIds, extra.id],
    portfolioColumnDefinitionIds: [extra.id, testDefinition.id],
    additionalAttentionDefinitionIds: [testDefinition.id],
  } }));
}

describe("effective governance context", () => {
  it("keeps the exact SSL/GL system membership separate from unpublished and released admin additions", () => {
    const draft = changedDraft();
    const initial = value(selectEffectiveMilestoneGovernanceContext(baseline));
    const pending = value(selectEffectiveMilestoneGovernanceContext(draft));
    expect(initial.systemAutomaticAttentionDefinitionIds).toEqual(new Set(["milestone-ramp-fcs"]));
    expect(pending.systemAutomaticAttentionDefinitionIds).toEqual(new Set(["milestone-ramp-fcs"]));
    expect(pending.additionalAttentionDefinitionIds).toEqual(new Set());
    const next = value(publishGovernanceDraft(draft, prototype, {
      createReleaseId: () => toGovernanceReleaseId("ssl-gl-policy-release"),
      createEnrollmentId: () => toRequirementEnrollmentId("unused-ssl-gl-enrollment"),
      createWithdrawalId: () => toRequirementWithdrawalId("unused-ssl-gl-withdrawal"),
      nowIso: () => "2026-10-01T01:00:00.000Z",
    }));
    const context = value(selectEffectiveMilestoneGovernanceContext(next));
    expect(context.systemAutomaticAttentionDefinitionIds).toEqual(new Set(["milestone-ramp-fcs"]));
    expect(context.additionalAttentionDefinitionIds).toEqual(new Set([testDefinition.id]));
    expect([...context.automaticAttentionTypeIds]).toEqual(["type-g-o", "type-smt", "type-pre-build", "type-close"]);
    const original = release.definitions.find(definition => definition.id === "milestone-ramp-fcs")!;
    expect(original).toMatchObject({ name: "FCS", stageGroupId: "stage-ramp", milestoneTypeId: "type-fcs", displayOrder: 290 });
    expect(context.definitionsForHistoricalResolution.filter(definition => definition.id === original.id)).toEqual([original]);
    expect(context.milestoneTypesForHistoricalResolution).toEqual(initial.milestoneTypesForHistoricalResolution);
    expect(context.selectableMilestoneTypes.map(type => type.id)).toEqual(["type-g-o", "type-smt", "type-pre-build", "type-close", "type-test", "type-certification", "type-preparation"]);
    expect(context.milestoneTypesForHistoricalResolution.find(type => type.id === "type-fcs")).toMatchObject({ displayName: "FCS", active: false });
    expect(context.milestoneTypesForHistoricalResolution.some(type => type.id === "type-ssl-gl")).toBe(false);
    expect(createPortfolioVisibleSchema(context).scheduleMappings.find(mapping => mapping.milestoneDefinitionId === original.id)).toBeUndefined();
    expect(next.releases[0]).toBe(release);
    expect(next.releases.at(-1)!.definitions.find(definition => definition.id === original.id)).toEqual(original);
  });
  it("derives grants only from a real retirement in history through the current release", () => {
    const fixture = publishedRetirementFixture();
    const invalidGrants = Object.values(fixture.invalidIssuingReleaseIds).map(retiredByReleaseId => ({ ...fixture.grant, retiredByReleaseId }));
    const state = { ...fixture.state, retiredDraftOccurrenceGrants: [fixture.grant, ...invalidGrants] };
    const before = structuredClone(state);
    expect(value(selectEffectiveRetiredDraftOccurrenceGrants(state))).toEqual([fixture.grant]);
    expect(state).toEqual(before);
    // The same future grant becomes effective only once its real retirement is current history.
    expect(value(selectEffectiveRetiredDraftOccurrenceGrants({ ...state, currentReleaseId: fixture.invalidIssuingReleaseIds.future }))).toEqual([fixture.grant, invalidGrants[2]]);
    const draft = value(startGovernanceDraft(state, toGovernanceDraftId("unpublished-grant-authority")));
    expect(value(selectEffectiveRetiredDraftOccurrenceGrants(draft))).toEqual([fixture.grant]);
  });
  it("grant derivation keeps missing or invalid current context an explicit failure", () => {
    expect(selectEffectiveRetiredDraftOccurrenceGrants({ ...baseline, releases: [] })).toMatchObject({ ok: false, code: "missing-current-release" });
    expect(selectEffectiveRetiredDraftOccurrenceGrants({ ...baseline, releases: [release, release] })).toMatchObject({ ok: false, code: "invalid-release-reference" });
    expect(selectEffectiveRetiredDraftOccurrenceGrants({ ...baseline, releases: [{ ...release, addableDefinitionIds: [toMilestoneDefinitionId("missing")] }] })).toMatchObject({ ok: false, code: "invalid-release-reference" });
  });
  it("context_uses_current_immutable_release_not_governance_draft", () => {
    const context = value(selectEffectiveMilestoneGovernanceContext(changedDraft()));
    expect(context).toEqual(value(selectEffectiveMilestoneGovernanceContext(baseline)));
    expect(context.releaseId).toBe("governance-release-bundled-baseline");
    expect(context.addablePublicDefinitions).toHaveLength(30);
    expect(context.portfolioColumnDefinitions).toHaveLength(30);
    expect([...context.automaticAttentionTypeIds]).toEqual(["type-g-o", "type-smt", "type-pre-build", "type-close"]);
  });
  it("returns explicit missing/invalid failures without baseline fallback", () => {
    expect(selectEffectiveMilestoneGovernanceContext({ ...baseline, releases: [] })).toMatchObject({ ok: false, code: "missing-current-release" });
    expect(selectEffectiveMilestoneGovernanceContext({ ...baseline, currentReleaseId: toGovernanceReleaseId("missing") })).toMatchObject({ ok: false, code: "missing-current-release" });
    for (const invalid of [
      { ...release, portfolioColumnDefinitionIds: [toMilestoneDefinitionId("missing")] },
      { ...release, definitions: [...release.definitions, release.definitions[0]] },
      { ...release, addableDefinitionIds: [...release.addableDefinitionIds, release.addableDefinitionIds[0]] },
      { ...release, addableDefinitionIds: [release.definitions.find(definition => !definition.active)!.id] },
    ]) expect(selectEffectiveMilestoneGovernanceContext({ ...baseline, releases: [invalid] })).toMatchObject({ ok: false, code: "invalid-release-reference" });
    expect(selectEffectiveMilestoneGovernanceContext({ ...baseline, releases: [release, release] })).toMatchObject({ ok: false, code: "invalid-release-reference" });
  });
  it("groups interleaved released stages canonically and keeps keys independent of labels", () => {
    const initial = value(selectEffectiveMilestoneGovernanceContext(baseline));
    const context = { ...initial, portfolioColumnDefinitions: [release.definitions[0], testDefinition, release.definitions[1], extra] };
    const schema = createPortfolioVisibleSchema(context);
    expect(schema.columns.filter(column => column.domain === "schedule").map(column => column.key)).toEqual([
      "schedule:design:kickoff", "schedule:design:id-fix", "schedule:a1-stage:a-test", "schedule:released-extra-test",
    ]);
    const renamedPresentation = createPortfolioVisibleSchema({ ...context, portfolioColumnDefinitions: [{ ...extra, name: "Display-only alternate label" }] });
    expect(renamedPresentation.scheduleMappings[0].key).toBe("schedule:released-extra-test");
    expect(renamedPresentation.scheduleMappings[0].label).toBe("Display-only alternate label");
    expect(createPortfolioVisibleSchema({ ...initial, portfolioColumnDefinitions: [] }).domainGroups.map(group => group.colSpan)).toEqual([11, 7]);
  });
  it("keeps formal consumers unchanged until a real successful publish then shares released membership", () => {
    const before = structuredClone({ prototype, catalogs });
    const initial = value(selectEffectiveMilestoneGovernanceContext(baseline));
    const draft = changedDraft();
    const draftContext = value(selectEffectiveMilestoneGovernanceContext(draft));
    expect(createPortfolioVisibleSchema(draftContext)).toEqual(createPortfolioVisibleSchema(initial));
    expect(selectPortfolioDashboardRows(prototype, catalogs, draftContext)).toEqual(selectPortfolioDashboardRows(prototype, catalogs, initial));
    expect(selectDashboardAttention(prototype, referenceDate, draftContext)).toMatchObject({ kind: "available", due: { projectCount: 0 } });
    const next = value(publishGovernanceDraft(draft, prototype, {
      createReleaseId: () => toGovernanceReleaseId("consumer-release"),
      createEnrollmentId: () => toRequirementEnrollmentId("unused-enrollment"),
      createWithdrawalId: () => toRequirementWithdrawalId("unused-withdrawal"),
      nowIso: () => "2026-10-01T01:00:00.000Z",
    }));
    const context = value(selectEffectiveMilestoneGovernanceContext(next));
    expect(context.addablePublicDefinitions.map(d => d.id)).toContain(extra.id);
    const schema = createPortfolioVisibleSchema(context);
    expect(schema.scheduleMappings.map(m => [m.key, m.label])).toEqual([["schedule:a1-stage:a-test", "A1 Test"], ["schedule:released-extra-test", "Release readiness"]]);
    const rows = selectPortfolioDashboardRows(prototype, catalogs, context);
    expect(rows[0].schedule).toMatchObject({ kind: "published", milestoneCount: 1, cells: [{ milestoneDefinitionId: extra.id, occurrences: [] }, { milestoneDefinitionId: testDefinition.id, occurrences: [{ milestoneId: "existing-test" }] }] });
    expect(selectDashboardAttention(prototype, referenceDate, context)).toMatchObject({ kind: "available", due: { projectCount: 1, matches: [{ milestoneDefinitionId: testDefinition.id, milestoneName: "A1 Test" }] } });
    expect(context.definitionsForHistoricalResolution.find(d => d.id === testDefinition.id)?.milestoneTypeId).toBe(testDefinition.milestoneTypeId);
    expect({ prototype, catalogs }).toEqual(before);
  });
});
