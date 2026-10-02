import { describe, expect, it } from "vitest";
import { createEmptyCanonicalProjectSchedule, type CanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import type { CommandResult } from "../../domain/governance/milestoneGovernance";
import { parseDateOnly } from "../../domain/shared/dateOnly";
import { toCanonicalScheduleWorkingDraftId, toMilestoneDefinitionId, toMilestoneId, toScheduleEvidenceId, toScheduleImportCandidateId, toScheduleReviewDecisionId, toScheduleReviewSessionId } from "../../domain/shared/ids";
import { devProject001 } from "../../fixtures/v2/canonicalProjectFixtures";
import { initialGovernanceContext } from "../../test/governanceTestUtils";
import { cancelScheduleWorkingDraft, publishScheduleWorkingDraft, removeScheduleWorkingDraftMilestone, startScheduleWorkingDraft, updateScheduleWorkingDraftMilestone, type CanonicalScheduleCommandContext } from "../commands/canonicalScheduleCommands";
import { confirmProjectLocalMilestoneDefinition, confirmScheduleImportDecision, loadBuiltInScheduleSimulation, mapDraftLocalOccurrenceToPublic } from "../commands/scheduleReviewCommands";
import { createInitialSelfServiceReferenceCatalogs } from "../reference-data/selfServiceCatalogs";
import { selectDashboardAttention } from "./dashboardAttention";
import { selectPortfolioDashboardRows } from "./portfolioDashboardRows";
import { selectCurrentPublishedSchedule } from "./scheduleSelectors";
import { selectScheduleReviewTrace } from "./scheduleReviewTrace";

function value<T>(result: CommandResult<T, string>): T {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}
function successful<T extends { readonly ok: boolean }>(result: T): Extract<T, { readonly ok: true }> {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result as Extract<T, { readonly ok: true }>;
}
function context(schedule: CanonicalProjectSchedule): CanonicalScheduleCommandContext {
  return { governance: initialGovernanceContext(), localDefinitions: schedule.localDefinitions, retiredDraftOccurrenceGrants: [] };
}
const sessionId = toScheduleReviewSessionId("trace-import-session");
const manualId = toScheduleReviewSessionId("trace-manual-session");
function reviewed(local = false) {
  let schedule = createEmptyCanonicalProjectSchedule(devProject001.id);
  if (local) {
    const definition = initialGovernanceContext().addablePublicDefinitions[3];
    schedule = value(confirmProjectLocalMilestoneDefinition(schedule, { definitionId: toMilestoneDefinitionId("trace-local"), name: definition.name, stageGroupId: definition.stageGroupId, milestoneTypeId: definition.milestoneTypeId, source: "manual", evidenceIds: [] }, context(schedule).governance));
  }
  schedule = successful(startScheduleWorkingDraft(schedule, { workingDraftId: toCanonicalScheduleWorkingDraftId("trace-draft") }, context(schedule))).schedule;
  schedule = value(loadBuiltInScheduleSimulation(schedule, { pack: local ? "basic-success" : "fixable-validation", ids: {
    sessionId, evidenceIds: [0, 1, 2].map(i => toScheduleEvidenceId(`trace-e${i}`)), candidateIds: [0, 1, 2].map(i => toScheduleImportCandidateId(`trace-c${i}`)),
  } }, context(schedule)));
  for (let i = 0; i < 3; i++) {
    const candidate = schedule.workingDraft!.importCandidates[i];
    const definitionId = candidate.sourceDefinitionId!;
    schedule = value(confirmScheduleImportDecision(schedule, {
      candidateId: candidate.id, decisionId: toScheduleReviewDecisionId(`trace-d${i}`),
      target: schedule.localDefinitions.some(definition => definition.id === definitionId)
        ? { kind: "createLocalOccurrence", localDefinitionId: definitionId, milestoneId: toMilestoneId(`trace-row-${i}`) }
        : { kind: "createPublicOccurrence", definitionId, milestoneId: toMilestoneId(`trace-row-${i}`) },
      plan: { kind: "set", value: parseDateOnly("2026-10-15")! }, actual: { kind: "clear" }, applicability: { kind: "set", value: "applicable" },
    }, context(schedule)));
  }
  return schedule;
}
function publish(schedule: CanonicalProjectSchedule) {
  return successful(publishScheduleWorkingDraft(schedule, { publishedAt: "2026-10-01T04:00:00Z" }, context(schedule))).schedule;
}
function edited(schedule: CanonicalProjectSchedule, date: string) {
  return successful(updateScheduleWorkingDraftMilestone(schedule, { milestoneId: toMilestoneId("trace-row-0"), field: "plan", value: parseDateOnly(date) }, context(schedule))).schedule;
}
function mapped(schedule: CanonicalProjectSchedule) {
  return value(mapDraftLocalOccurrenceToPublic(schedule, { milestoneId: toMilestoneId("trace-row-1"), localDefinitionId: toMilestoneDefinitionId("trace-local"), publicDefinitionId: initialGovernanceContext().addablePublicDefinitions[3].id,
    sessionId: manualId, decisionId: toScheduleReviewDecisionId("trace-mapping"), assertion: { workContent: true, stage: true, type: true, completionCriteria: true },
  }, context(schedule)));
}

describe("GOV-08 review trace projection", () => {
  it("trace_distinguishes_confirmed_and_final_plan", () => {
    const confirmed = reviewed();
    const auditBefore = structuredClone({ evidence: confirmed.evidenceLedger, decisions: confirmed.reviewDecisions });
    const published = publish(edited(confirmed, "2026-10-20"));
    const trace = selectScheduleReviewTrace(published, sessionId);
    expect(trace[0]).toMatchObject({ retention: "retained", decision: { dateActions: { plan: { kind: "set", value: "2026-10-15" } } }, closure: { kind: "published", versionNumber: 1 }, finalOccurrence: { plan: "2026-10-20" } });
    expect(trace[0].decision).toBe(confirmed.reviewDecisions[0]);
    expect(trace[0].finalOccurrence).toBe(published.publishedVersions[0].milestones[0]);
    expect({ evidence: published.evidenceLedger, decisions: published.reviewDecisions }).toEqual(auditBefore);
    const restarted = successful(startScheduleWorkingDraft(published, { workingDraftId: toCanonicalScheduleWorkingDraftId("later-draft") }, context(published))).schedule;
    const later = publish(edited(restarted, "2026-11-01"));
    expect(selectScheduleReviewTrace(later, sessionId)[0].finalOccurrence?.plan).toBe("2026-10-20");
  });
  it("trace_reports_confirmed_row_not_retained", () => {
    const confirmed = reviewed();
    const removed = successful(removeScheduleWorkingDraftMilestone(confirmed, { milestoneId: toMilestoneId("trace-row-0") }, context(confirmed))).schedule;
    const published = publish(removed);
    expect(selectScheduleReviewTrace(published, sessionId)[0]).toMatchObject({ retention: "not-retained", closure: { kind: "published", versionNumber: 1 }, finalOccurrence: null });
    expect(published.reviewDecisions).toBe(confirmed.reviewDecisions);
  });
  it("unpublished_trace_has_no_final_occurrence", () => {
    const schedule = reviewed();
    expect(selectScheduleReviewTrace(schedule, sessionId)).toHaveLength(3);
    expect(selectScheduleReviewTrace(schedule, sessionId).every(item => item.retention === "unpublished" && item.closure === null && item.finalOccurrence === null)).toBe(true);
    expect(selectScheduleReviewTrace(schedule, toScheduleReviewSessionId("unknown"))).toEqual([]);
  });
  it("discarded_trace_has_no_final_occurrence", () => {
    const confirmed = reviewed();
    const discarded = successful(cancelScheduleWorkingDraft(confirmed)).schedule;
    expect(selectScheduleReviewTrace(discarded, sessionId)).toHaveLength(3);
    expect(selectScheduleReviewTrace(discarded, sessionId).every(item => item.retention === "discarded" && item.closure?.kind === "discarded" && item.finalOccurrence === null)).toBe(true);
    const manual = successful(cancelScheduleWorkingDraft(mapped(reviewed(true)))).schedule;
    expect(selectScheduleReviewTrace(manual, manualId)[0]).toMatchObject({ retention: "discarded", finalOccurrence: null });
  });
  it("trace_does_not_match_by_name_or_date", () => {
    const original = publish(reviewed());
    const target = original.publishedVersions[0].milestones[0];
    const schedule = { ...original, publishedVersions: [{ ...original.publishedVersions[0], milestones: [{ ...target, milestoneId: toMilestoneId("same-definition-and-dates-different-id") }, ...original.publishedVersions[0].milestones.slice(1)] }] };
    expect(selectScheduleReviewTrace(schedule, sessionId)[0]).toMatchObject({ retention: "not-retained", finalOccurrence: null });
  });
  it("import_decision_trace_uses_target_definition_id_after_local_mapping", () => {
    const published = publish(mapped(reviewed(true)));
    const imported = selectScheduleReviewTrace(published, sessionId)[1];
    expect(imported).toMatchObject({ decision: { targetMilestoneId: "trace-row-1", targetDefinitionId: "trace-local" }, closure: { kind: "published", versionNumber: 1 }, retention: "not-retained", finalOccurrence: null });
  });
  it("local_to_public_trace_uses_to_public_definition_id_and_mapping_then_publish_is_retained", () => {
    const published = publish(mapped(reviewed(true)));
    const trace = selectScheduleReviewTrace(published, manualId);
    expect(trace).toHaveLength(1);
    expect(trace[0]).toMatchObject({ decision: { toPublicDefinitionId: initialGovernanceContext().addablePublicDefinitions[3].id }, closure: { kind: "published", versionNumber: 1 }, retention: "retained" });
    expect(trace[0].finalOccurrence).toBe(published.publishedVersions[0].milestones[1]);
    const remapped = { ...published, publishedVersions: [{ ...published.publishedVersions[0], milestones: published.publishedVersions[0].milestones.map((row, i) => i === 1 ? { ...row, milestoneDefinitionId: toMilestoneDefinitionId("trace-local") } : row) }] };
    expect(selectScheduleReviewTrace(remapped, manualId)[0]).toMatchObject({ retention: "not-retained", finalOccurrence: null });
  });
  it("trace_resolves_only_exact_closure_version_with_no_current_version_fallback", () => {
    const published = publish(reviewed());
    const missing = { ...published, publishedVersions: [] };
    expect(selectScheduleReviewTrace(missing, sessionId)[0]).toMatchObject({ retention: "not-retained", finalOccurrence: null });
    const later = { ...published, reviewClosures: published.reviewClosures.map(closure => closure.kind === "published" ? { ...closure, versionNumber: 42 as typeof closure.versionNumber } : closure) };
    expect(selectScheduleReviewTrace(later, sessionId)[0]).toMatchObject({ retention: "not-retained", finalOccurrence: null });
  });
  it("real_Dashboard_Portfolio_Attention_read_only_final_Published_and_trace_creates_no_second_authority", () => {
    const confirmed = reviewed();
    const definition = initialGovernanceContext().addablePublicDefinitions[0];
    const governance = { ...initialGovernanceContext(), portfolioColumnDefinitions: [definition], additionalAttentionDefinitionIds: new Set([definition.id]) };
    const catalogs = createInitialSelfServiceReferenceCatalogs();
    const catalogBefore = structuredClone(catalogs);
    const reads = (schedule: CanonicalProjectSchedule) => {
      const state = { projects: [devProject001], schedules: [schedule] };
      return { dashboard: selectCurrentPublishedSchedule(state, devProject001.id, governance), portfolio: selectPortfolioDashboardRows(state, catalogs, governance), attention: selectDashboardAttention(state, parseDateOnly("2026-10-10")!, governance) };
    };
    expect(reads(confirmed).dashboard.kind).toBe("noPublishedSchedule");
    const published = publish(edited(confirmed, "2026-10-20"));
    const official = reads(published);
    expect(official.dashboard).toMatchObject({ kind: "published", version: { milestones: [expect.objectContaining({ plan: "2026-10-20" }), expect.anything(), expect.anything()] } });
    expect(official.portfolio[0].schedule).toMatchObject({ kind: "published", cells: [{ milestoneDefinitionId: definition.id, occurrences: [{ milestoneId: "trace-row-0", applicability: "applicable", plan: "2026/10/20", actual: "-" }] }] });
    expect(official.attention).toMatchObject({ kind: "available", due: { matches: [expect.objectContaining({ plan: "2026-10-20", milestoneId: "trace-row-0" })] } });
    const snapshot = structuredClone(published);
    expect(selectScheduleReviewTrace(published, sessionId)[0].finalOccurrence?.plan).toBe("2026-10-20");
    expect(published).toEqual(snapshot);
    const withoutAudit = { ...published, evidenceLedger: [], reviewSessions: [], reviewDecisions: [], reviewClosures: [] };
    expect(reads(withoutAudit)).toEqual(official);
    const laterDraft = successful(startScheduleWorkingDraft(published, { workingDraftId: toCanonicalScheduleWorkingDraftId("official-unaffected-draft") }, context(published))).schedule;
    const removed = successful(removeScheduleWorkingDraftMilestone(laterDraft, { milestoneId: toMilestoneId("trace-row-0") }, context(laterDraft))).schedule;
    expect(reads(removed)).toEqual(official);
    expect(reads(successful(cancelScheduleWorkingDraft(removed)).schedule)).toEqual(official);
    const removalPublished = reads(publish(removed));
    expect(removalPublished.portfolio[0].schedule).toMatchObject({ kind: "published", cells: [{ milestoneDefinitionId: definition.id, occurrences: [] }] });
    expect(removalPublished.attention).toMatchObject({ kind: "available", due: { matches: [] }, overdue: { matches: [] } });
    expect(catalogs).toEqual(catalogBefore);
  });
});
