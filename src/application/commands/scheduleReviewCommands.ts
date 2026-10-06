import type { CommandResult } from "../../domain/governance/milestoneGovernance";
import { getCurrentPublishedVersion, type CanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import { createScheduleImportCandidate, type ConfirmProjectLocalMilestoneDefinitionInput, type ScheduleReviewFailureCode,
  type ConfirmScheduleImportDecisionInput, type GovernanceSimulationPack, type ScheduleReviewIdBundle,
  type ScheduleImportDecisionPreview, type ScheduleImportCandidate, type ScheduleReviewSession, type ScheduleEvidenceRecord,
  type DateApplyAction, type MapDraftLocalOccurrenceToPublicInput, type ConfirmMapDraftLocalOccurrenceToPublicInput,
  type LocalToPublicPreview } from "../../domain/schedule/scheduleReview";
import type { EffectiveMilestoneGovernanceContext } from "../governance/effectiveMilestoneGovernanceContext";
import type { CanonicalScheduleCommandContext } from "./canonicalScheduleCommands";
import { resolveScheduleDefinitions } from "../governance/scheduleDefinitionResolution";
import { validateScheduleWorkingDraft, type CanonicalScheduleWorkingDraftMilestone } from "../../domain/schedule/canonicalScheduleWorkingDraft";
import { parseDateOnly, type DateOnly } from "../../domain/shared/dateOnly";
import type { ScheduleReviewDecisionId } from "../../domain/shared/ids";
import type { ValidationIssue } from "../../domain/validation/validationIssue";
import { governanceSimulationPacks, simulationSourceDescriptor } from "../../fixtures/v2/governanceSimulationFixtures";

export function confirmProjectLocalMilestoneDefinition(
  schedule: CanonicalProjectSchedule,
  input: ConfirmProjectLocalMilestoneDefinitionInput,
  context: EffectiveMilestoneGovernanceContext,
): CommandResult<CanonicalProjectSchedule, ScheduleReviewFailureCode> {
  const failure = (
    code: "id-collision" | "invalid-local-classification",
    field: keyof ConfirmProjectLocalMilestoneDefinitionInput | "displayOrder",
    message: string,
  ): CommandResult<CanonicalProjectSchedule, ScheduleReviewFailureCode> => ({
    ok: false,
    code,
    issues: [{
      code: `schedule.local-definition.${code}`,
      domain: "schedule", source: "data", severity: "blocking", message,
      target: { section: "schedule.localDefinitions", entityId: input.definitionId, field },
    }],
  });

  if (typeof input.definitionId !== "string" || !input.definitionId.trim()
    || schedule.localDefinitions.some(definition => definition.id === input.definitionId)
    || context.definitionsForHistoricalResolution.some(definition => definition.id === input.definitionId)) {
    return failure("id-collision", "definitionId", "A nonempty injected local definition ID must be distinct from same-Project local and all public historical definition IDs.");
  }
  if (typeof input.name !== "string" || !input.name.trim()) {
    return failure("invalid-local-classification", "name", "A local milestone definition requires a nonempty name.");
  }
  if (!context.selectableStageGroups.some(stage => stage.id === input.stageGroupId)) {
    return failure("invalid-local-classification", "stageGroupId", "Select an existing Stage Group ID.");
  }
  if (input.milestoneTypeId !== null && !context.selectableMilestoneTypes.some(type => type.id === input.milestoneTypeId)) {
    return failure("invalid-local-classification", "milestoneTypeId", "Select an existing Milestone Type ID.");
  }
  if (input.source !== "manual" && input.source !== "import") {
    return failure("invalid-local-classification", "source", "A local milestone definition source must be manual or import.");
  }

  let maximumOrder = 0;
  for (const definition of [...context.definitionsForHistoricalResolution, ...schedule.localDefinitions]) {
    if (!Number.isFinite(definition.displayOrder)) {
      return failure("invalid-local-classification", "displayOrder", "Existing definition ordering must be finite to append a local milestone.");
    }
    maximumOrder = Math.max(maximumOrder, definition.displayOrder);
  }
  const displayOrder = maximumOrder + 10;
  if (displayOrder > Number.MAX_SAFE_INTEGER || displayOrder <= maximumOrder) {
    return failure("invalid-local-classification", "displayOrder", "No safe display order is available after existing definitions.");
  }

  return { ok: true, value: {
    ...schedule,
    localDefinitions: [...schedule.localDefinitions, {
      id: input.definitionId,
      name: input.name.trim(),
      stageGroupId: input.stageGroupId,
      milestoneTypeId: input.milestoneTypeId,
      displayOrder,
      source: input.source,
      confirmation: "confirmed",
      evidenceIds: [...input.evidenceIds],
    }],
  } };
}

function importIssue(code: string, entityId: string, field: string, message: string, source: "import" | "data" = "import"): ValidationIssue {
  return { code, domain: "schedule", source, severity: "blocking", message,
    target: { section: "schedule.workingDraft", entityId, field } };
}

function reviewFailure(code: ScheduleReviewFailureCode, entityId: string, field: string, message: string) {
  return { ok: false as const, code, issues: [importIssue(`schedule.import.${code}`, entityId, field, message)] };
}

function unknownRawTypeFindings(schedule: CanonicalProjectSchedule, candidate: ScheduleImportCandidate, context: CanonicalScheduleCommandContext): readonly ValidationIssue[] {
  const raw = schedule.evidenceLedger.find(evidence => evidence.id === candidate.evidenceId)?.rawValues.milestoneType;
  if (!raw || raw.presence === "missing" || !raw.raw.trim()) return [];
  const text = raw.raw.trim().toLocaleLowerCase();
  const known = context.governance.milestoneTypesForHistoricalResolution.some(type =>
    type.id === raw.raw || [type.displayName, ...type.aliases].some(label => label.toLocaleLowerCase() === text));
  return known ? [] : [importIssue("schedule.import.invalid-local-classification", candidate.id, "milestoneType", "The explicit source Type is unknown. It cannot be treated as No Type.")];
}

function scheduleDefinitions(schedule: CanonicalProjectSchedule, context: CanonicalScheduleCommandContext) {
  return resolveScheduleDefinitions(context.governance, schedule.localDefinitions.filter(definition =>
    context.localDefinitions.some(local => local.id === definition.id && local.name === definition.name
      && local.stageGroupId === definition.stageGroupId && local.milestoneTypeId === definition.milestoneTypeId)));
}

function hasRetainedIdentity(schedule: CanonicalProjectSchedule, row: CanonicalScheduleWorkingDraftMilestone, context: CanonicalScheduleCommandContext): boolean {
  return !!getCurrentPublishedVersion(schedule)?.milestones.some(current => current.milestoneId === row.milestoneId && current.milestoneDefinitionId === row.milestoneDefinitionId)
    || context.retiredDraftOccurrenceGrants.some(grant => grant.projectId === schedule.projectId
      && grant.workingDraftId === schedule.workingDraft?.workingDraftId && grant.milestoneId === row.milestoneId
      && grant.milestoneDefinitionId === row.milestoneDefinitionId);
}

function occurrenceEligibility(schedule: CanonicalProjectSchedule, row: CanonicalScheduleWorkingDraftMilestone, context: CanonicalScheduleCommandContext): ScheduleReviewFailureCode | null {
  if (!scheduleDefinitions(schedule, context).some(definition => definition.id === row.milestoneDefinitionId)) return "target-not-found";
  if (context.governance.definitionsForHistoricalResolution.some(definition => definition.id === row.milestoneDefinitionId)
    && !context.governance.addablePublicDefinitions.some(definition => definition.id === row.milestoneDefinitionId)
    && !hasRetainedIdentity(schedule, row, context)) return "retired-definition-not-retained";
  return null;
}

function currentSessions(schedule: CanonicalProjectSchedule): readonly ScheduleReviewSession[] {
  const draft = schedule.workingDraft;
  return draft === null ? [] : schedule.reviewSessions.filter(session => session.workingDraftId === draft.workingDraftId
    && draft.reviewSessionIds.includes(session.id) && !schedule.reviewClosures.some(closure => closure.sessionId === session.id));
}

function validInjectedIds(ids: readonly string[], existing: readonly string[]): boolean {
  return new Set(ids).size === ids.length && ids.every(id => typeof id === "string" && !!id.trim() && !existing.includes(id));
}

/** Loads evidence only. Occurrences and local definitions require their own explicit confirmation. */
export function loadBuiltInScheduleSimulation(
  schedule: CanonicalProjectSchedule,
  input: { readonly pack: GovernanceSimulationPack; readonly ids: ScheduleReviewIdBundle },
  context: CanonicalScheduleCommandContext,
): CommandResult<CanonicalProjectSchedule, ScheduleReviewFailureCode> {
  const draft = schedule.workingDraft;
  if (draft === null) return reviewFailure("no-working-draft", schedule.projectId, "workingDraft", "Start a Working Draft before loading simulation evidence.");
  const records = governanceSimulationPacks[input.pack];
  const existingEvidence = new Set(currentSessions(schedule).flatMap(session => session.evidenceIds));
  const fingerprints = new Set(schedule.evidenceLedger.filter(evidence => existingEvidence.has(evidence.id)).map(evidence => evidence.candidateFingerprint));
  if (records.every(record => fingerprints.has(record.candidateFingerprint))) return { ok: true, value: schedule };

  const ids = input.ids;
  const priorCandidates = [...draft.importCandidates.map(candidate => candidate.id), ...schedule.reviewSessions.flatMap(session => session.candidateIds ?? []),
    ...schedule.reviewDecisions.flatMap(decision => "candidateId" in decision ? [decision.candidateId] : [])];
  if (ids.evidenceIds.length !== records.length || ids.candidateIds.length !== records.length
    || !validInjectedIds([ids.sessionId], [...schedule.reviewSessions.map(session => session.id), ...schedule.reviewClosures.map(closure => closure.sessionId)])
    || !validInjectedIds(ids.evidenceIds, schedule.evidenceLedger.map(evidence => evidence.id))
    || !validInjectedIds(ids.candidateIds, priorCandidates)) {
    return reviewFailure("id-collision", ids.sessionId, "ids", "Supply distinct, nonempty, unused IDs for one session and every evidence/candidate record.");
  }

  const publicIds = new Set(context.governance.definitionsForHistoricalResolution.map(definition => definition.id));
  const addableIds = new Set(context.governance.addablePublicDefinitions.map(definition => definition.id));
  const definitions = scheduleDefinitions(schedule, context);
  const locals = definitions.filter(definition => !publicIds.has(definition.id));
  const retired = context.governance.definitionsForHistoricalResolution.filter(definition => !addableIds.has(definition.id));
  const evidence: ScheduleEvidenceRecord[] = [];
  const candidates: ScheduleImportCandidate[] = [];
  for (const [index, record] of records.entries()) {
    const retained = draft.milestones.find(row => retired.some(definition => definition.id === row.milestoneDefinitionId) && occurrenceEligibility(schedule, row, context) === null);
    const definition = record.targetRole === "public" ? context.governance.addablePublicDefinitions[record.publicIndex ?? 0]
      : record.targetRole === "local" ? locals[0]
        : record.targetRole === "retired-existing" ? retired.find(definition => definition.id === retained?.milestoneDefinitionId)
          : retired.find(definition => !draft.milestones.some(row => row.milestoneDefinitionId === definition.id && occurrenceEligibility(schedule, row, context) === null));
    if (definition === undefined) {
      const code = record.targetRole === "local" ? "invalid-local-classification" : record.targetRole === "public" ? "definition-not-addable" : "retired-definition-not-retained";
      return reviewFailure(code, ids.sessionId, "pack", record.targetRole === "local"
        ? "This scenario requires a confirmed same-Project local definition; confirm one first."
        : "This scenario's public or exact retired occurrence prerequisite is unavailable in the selected Project.");
    }
    const rawValues = Object.freeze({ ...record.rawValues,
      milestoneName: Object.freeze({ presence: "present" as const, raw: definition.name }),
      stage: Object.freeze({ presence: "present" as const, raw: definition.stageGroupId }),
      milestoneType: Object.freeze(definition.milestoneTypeId === null ? { presence: "missing" as const } : { presence: "present" as const, raw: definition.milestoneTypeId }),
      plan: Object.freeze({ ...record.rawValues.plan }), actual: Object.freeze({ ...record.rawValues.actual }), applicability: Object.freeze({ ...record.rawValues.applicability }),
    });
    const entry: ScheduleEvidenceRecord = Object.freeze({ id: ids.evidenceIds[index], sourceKind: "built-in-simulation",
      sourceDescriptor: simulationSourceDescriptor, rawValues, candidateFingerprint: record.candidateFingerprint });
    evidence.push(entry);
    candidates.push(createScheduleImportCandidate(entry, ids.candidateIds[index], definition.id));
  }
  const session: ScheduleReviewSession = { id: ids.sessionId, workingDraftId: draft.workingDraftId, source: "built-in-simulation",
    evidenceIds: [...ids.evidenceIds], candidateIds: [...ids.candidateIds] };
  return { ok: true, value: { ...schedule, evidenceLedger: [...schedule.evidenceLedger, ...evidence], reviewSessions: [...schedule.reviewSessions, session],
    workingDraft: { ...draft, reviewSessionIds: [...draft.reviewSessionIds, session.id], importCandidates: [...draft.importCandidates, ...candidates] } } };
}

function occurrenceDateIssues(row: CanonicalScheduleWorkingDraftMilestone): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const field of ["plan", "actual"] as const) {
    if (row[field] !== null && (typeof row[field] !== "string" || parseDateOnly(row[field]) === null)) {
      issues.push(importIssue("schedule.import.invalid-date", row.milestoneId, field, "A date must be a valid DateOnly."));
    }
  }
  if (row.applicability !== "applicable" && row.applicability !== "notApplicable") {
    issues.push(importIssue("schedule.import.unrecognized-applicability", row.milestoneId, "applicability", "Confirm an explicit legal applicability value."));
  } else if (row.applicability === "notApplicable" && (row.plan !== null || row.actual !== null)) {
    issues.push(importIssue("schedule.import.not-applicable-with-date", row.milestoneId, "applicability", "N/A requires both dates to be cleared."));
  } else if (row.applicability === "applicable" && row.plan === null) {
    issues.push(importIssue(row.actual === null ? "schedule.data.missing-plan-and-actual" : "schedule.data.actual-without-plan", row.milestoneId, "plan", "An applicable occurrence requires a Plan date.", "data"));
  }
  return issues;
}

/** Shared by review previews and the actual Schedule Publish boundary. */
export function collectSchedulePublishBlockingFindings(schedule: CanonicalProjectSchedule, context: CanonicalScheduleCommandContext): readonly ValidationIssue[] {
  const draft = schedule.workingDraft;
  if (draft === null) return [];
  const issues = [...validateScheduleWorkingDraft(draft, scheduleDefinitions(schedule, context))];
  const current = getCurrentPublishedVersion(schedule);
  for (const row of draft.milestones) {
    issues.push(...occurrenceDateIssues(row));
    if (occurrenceEligibility(schedule, row, context) === "retired-definition-not-retained") {
      issues.push(importIssue("schedule.import.retired-definition-not-retained", row.milestoneId, "milestoneDefinitionId", "Retired definition requires exact current lineage or D1 grant."));
    }
    const repeated = draft.milestones.filter(other => other.milestoneDefinitionId === row.milestoneDefinitionId);
    if (repeated.length > 1 && !repeated.every(other => current?.milestones.some(old => old.milestoneId === other.milestoneId && old.milestoneDefinitionId === other.milestoneDefinitionId))) {
      issues.push(importIssue("schedule.import.duplicate-target-definition", row.milestoneId, "milestoneDefinitionId", "Only already retained historical occurrences may repeat a definition."));
    }
  }
  const sessions = currentSessions(schedule);
  for (const candidate of draft.importCandidates) {
    const related = sessions.filter(session => session.evidenceIds.includes(candidate.evidenceId));
    // A closed/older session is audit history, not current unresolved work.
    if (related.length === 0 && schedule.reviewSessions.some(session => session.evidenceIds.includes(candidate.evidenceId))) continue;
    if (related.length !== 1 || schedule.evidenceLedger.filter(evidence => evidence.id === candidate.evidenceId).length !== 1) {
      issues.push(importIssue("schedule.import.target-not-found", candidate.id, "evidenceId", "Candidate evidence and current session must resolve exactly."));
    }
    if (candidate.status === "pending") {
      issues.push(importIssue("schedule.import.pending-decision", candidate.id, "status", "This candidate still needs an explicit decision."), ...candidate.rawFindings, ...unknownRawTypeFindings(schedule, candidate, context));
    }
  }
  return issues;
}

interface ImportOperation {
  readonly candidate: ScheduleImportCandidate;
  readonly session: ScheduleReviewSession;
  readonly before: CanonicalScheduleWorkingDraftMilestone | null;
  readonly after: CanonicalScheduleWorkingDraftMilestone | null;
  readonly blockers: readonly ValidationIssue[];
  readonly failureCode: ScheduleReviewFailureCode;
}

function validateScheduleImportOperation(schedule: CanonicalProjectSchedule, input: ConfirmScheduleImportDecisionInput, context: CanonicalScheduleCommandContext): CommandResult<ImportOperation, ScheduleReviewFailureCode> {
  const draft = schedule.workingDraft;
  if (draft === null) return reviewFailure("no-working-draft", schedule.projectId, "workingDraft", "A Working Draft is required.");
  const matching = draft.importCandidates.filter(candidate => candidate.id === input.candidateId);
  if (matching.length !== 1) return reviewFailure("candidate-not-found", input.candidateId, "candidateId", "Resolve exactly one current candidate.");
  const candidate = matching[0];
  if (candidate.status === "confirmed") return reviewFailure("already-confirmed", candidate.id, "status", "This candidate has already been confirmed.");
  const sessions = currentSessions(schedule).filter(session => session.evidenceIds.includes(candidate.evidenceId));
  if (sessions.length !== 1 || schedule.evidenceLedger.filter(evidence => evidence.id === candidate.evidenceId).length !== 1) {
    return reviewFailure("candidate-not-found", candidate.id, "evidenceId", "Candidate must belong to one open current-Draft session and immutable evidence record.");
  }
  const session = sessions[0];
  const target = input.target;
  const rows = draft.milestones.filter(row => row.milestoneId === target.milestoneId);
  const before = target.kind === "updateExistingOccurrence" && rows.length === 1 ? rows[0] : null;
  const reject = (code: ScheduleReviewFailureCode, field: string, message: string): CommandResult<ImportOperation, ScheduleReviewFailureCode> => ({
    ok: true, value: { candidate, session, before, after: null, blockers: reviewFailure(code, candidate.id, field, message).issues, failureCode: code },
  });
  const classificationFindings = unknownRawTypeFindings(schedule, candidate, context);
  if (classificationFindings.length) return { ok: true, value: { candidate, session, before, after: null, blockers: classificationFindings, failureCode: "invalid-local-classification" } };
  if (target.kind === "updateExistingOccurrence" && rows.length !== 1) return reject(rows.length ? "duplicate-milestone-id" : "target-not-found", "milestoneId", "Update requires one exact existing occurrence.");
  const definitionId = target.kind === "createPublicOccurrence" ? target.definitionId : target.kind === "createLocalOccurrence" ? target.localDefinitionId : before!.milestoneDefinitionId;
  if ((candidate.sourceDefinitionId !== undefined && candidate.sourceDefinitionId !== definitionId)
    || (target.kind === "updateExistingOccurrence" && target.expectedDefinitionId !== undefined && target.expectedDefinitionId !== definitionId)) {
    return reject("target-definition-mismatch", "milestoneDefinitionId", "The selected exact definition does not match the source or expected occurrence identity.");
  }
  if (before !== null) {
    const eligibility = occurrenceEligibility(schedule, before, context);
    if (eligibility !== null) return reject(eligibility, "milestoneDefinitionId", "This exact occurrence is not currently resolvable or retained.");
  } else {
    if (target.kind === "createPublicOccurrence" && !context.governance.addablePublicDefinitions.some(definition => definition.id === definitionId)) {
      return reject("definition-not-addable", "milestoneDefinitionId", "Creating public occurrences requires a currently addable public definition.");
    }
    if (target.kind === "createLocalOccurrence" && (!scheduleDefinitions(schedule, context).some(definition => definition.id === definitionId)
      || !schedule.localDefinitions.some(definition => definition.id === definitionId)
      || context.governance.definitionsForHistoricalResolution.some(definition => definition.id === definitionId))) {
      return reject("invalid-local-classification", "milestoneDefinitionId", "Confirm a legal same-Project local definition before importing its occurrence.");
    }
    const milestoneIds = [...draft.milestones.map(row => row.milestoneId), ...schedule.publishedVersions.flatMap(version => version.milestones.map(row => row.milestoneId)),
      ...schedule.reviewDecisions.map(decision => decision.targetMilestoneId), ...context.retiredDraftOccurrenceGrants.filter(grant => grant.projectId === schedule.projectId).map(grant => grant.milestoneId)];
    if (!validInjectedIds([target.milestoneId], milestoneIds)) return reject("duplicate-milestone-id", "milestoneId", "Supply a nonempty new occurrence ID distinct from existing and historical identities.");
    if (draft.milestones.some(row => row.milestoneDefinitionId === definitionId)) return reject("duplicate-target-definition", "milestoneDefinitionId", "This definition already has a Draft occurrence; select its exact occurrence to update.");
    if ([input.plan, input.actual, input.applicability].some(action => action?.kind === "keepExisting")) return reject("invalid-action-for-new-occurrence", "actions", "A new occurrence has no existing value to keep.");
  }
  const date = (action: DateApplyAction, existing: DateOnly | null): DateOnly | null | undefined => {
    if (action?.kind === "clear") return null;
    if (action?.kind === "keepExisting") return existing;
    if (action?.kind === "set" && typeof action.value === "string" && parseDateOnly(action.value) !== null) return action.value;
    return undefined;
  };
  const plan = date(input.plan, before?.plan ?? null);
  const actual = date(input.actual, before?.actual ?? null);
  const applicability = input.applicability?.kind === "keepExisting" ? before?.applicability
    : input.applicability?.kind === "set" ? input.applicability.value : undefined;
  if (plan === undefined || actual === undefined || (applicability !== "applicable" && applicability !== "notApplicable")) {
    return reject("invalid-date-or-applicability", "actions", "Provide explicit valid date and applicability actions; mapping alone cannot resolve raw findings.");
  }
  const after = { milestoneId: target.milestoneId, milestoneDefinitionId: definitionId, plan, actual, applicability };
  return { ok: true, value: { candidate, session, before, after, blockers: occurrenceDateIssues(after), failureCode: "invalid-date-or-applicability" } };
}

function applyOccurrenceAndCandidate(schedule: CanonicalProjectSchedule, operation: ImportOperation): CanonicalProjectSchedule {
  const draft = schedule.workingDraft!;
  return { ...schedule, workingDraft: { ...draft,
    milestones: operation.before === null ? [...draft.milestones, operation.after!] : draft.milestones.map(row => row.milestoneId === operation.before!.milestoneId ? operation.after! : row),
    importCandidates: draft.importCandidates.map(candidate => candidate.id === operation.candidate.id ? { ...candidate, status: "confirmed" as const } : candidate),
  } };
}

export function previewScheduleImportDecision(schedule: CanonicalProjectSchedule, input: ConfirmScheduleImportDecisionInput, context: CanonicalScheduleCommandContext): CommandResult<ScheduleImportDecisionPreview, ScheduleReviewFailureCode> {
  const result = validateScheduleImportOperation(schedule, input, context);
  if (!result.ok) return result;
  const operation = result.value;
  const hypothetical = operation.blockers.length === 0 ? applyOccurrenceAndCandidate(schedule, operation) : schedule;
  return { ok: true, value: { beforeOccurrence: operation.before, afterOccurrence: operation.after,
    operationBlockingFindings: operation.blockers, remainingPublishBlockingFindings: collectSchedulePublishBlockingFindings(hypothetical, context) } };
}

export function confirmScheduleImportDecision(schedule: CanonicalProjectSchedule, input: ConfirmScheduleImportDecisionInput & { readonly decisionId: ScheduleReviewDecisionId }, context: CanonicalScheduleCommandContext): CommandResult<CanonicalProjectSchedule, ScheduleReviewFailureCode> {
  const result = validateScheduleImportOperation(schedule, input, context);
  if (!result.ok) return result;
  const operation = result.value;
  if (operation.blockers.length) return { ok: false, code: operation.failureCode, issues: operation.blockers };
  if (!validInjectedIds([input.decisionId], schedule.reviewDecisions.map(decision => decision.id))) return reviewFailure("id-collision", input.decisionId, "decisionId", "Supply a nonempty unused decision ID.");
  const next = applyOccurrenceAndCandidate(schedule, operation);
  return { ok: true, value: { ...next, reviewDecisions: [...schedule.reviewDecisions, Object.freeze({
    id: input.decisionId, sessionId: operation.session.id, evidenceId: operation.candidate.evidenceId, candidateId: operation.candidate.id,
    targetMilestoneId: operation.after!.milestoneId, targetDefinitionId: operation.after!.milestoneDefinitionId,
    dateActions: Object.freeze({ plan: Object.freeze({ ...input.plan }), actual: Object.freeze({ ...input.actual }) }), applicabilityAction: Object.freeze({ ...input.applicability }),
  })] } };
}

export function previewDraftLocalOccurrenceToPublic(
  schedule: CanonicalProjectSchedule,
  input: MapDraftLocalOccurrenceToPublicInput,
  context: CanonicalScheduleCommandContext,
): CommandResult<LocalToPublicPreview, ScheduleReviewFailureCode> {
  const draft = schedule.workingDraft;
  if (draft === null) return reviewFailure("no-working-draft", schedule.projectId, "workingDraft", "A Working Draft is required.");
  const rows = draft.milestones.filter(row => row.milestoneId === input.milestoneId);
  if (rows.length !== 1) return reviewFailure(rows.length ? "duplicate-milestone-id" : "target-not-found", input.milestoneId, "milestoneId", "Mapping requires one exact current Draft occurrence.");
  const beforeOccurrence = rows[0];
  if (beforeOccurrence.milestoneDefinitionId !== input.localDefinitionId || input.localDefinitionId === input.publicDefinitionId) {
    return reviewFailure("target-definition-mismatch", input.milestoneId, "localDefinitionId", "The occurrence must still reference the selected distinct local definition.");
  }
  if (schedule.localDefinitions.filter(definition => definition.id === input.localDefinitionId).length !== 1
    || context.governance.definitionsForHistoricalResolution.some(definition => definition.id === input.localDefinitionId)
    || !scheduleDefinitions(schedule, context).some(definition => definition.id === input.localDefinitionId)) {
    return reviewFailure("invalid-local-classification", input.milestoneId, "localDefinitionId", "Mapping requires a legal confirmed definition from this Project's local registry.");
  }
  if (!context.governance.addablePublicDefinitions.some(definition => definition.id === input.publicDefinitionId)) {
    return reviewFailure("definition-not-addable", input.milestoneId, "publicDefinitionId", "Mapping creates a new public reference and requires a currently addable public definition.");
  }
  if (draft.milestones.some(row => row.milestoneDefinitionId === input.publicDefinitionId)) {
    return reviewFailure("duplicate-target-definition", input.milestoneId, "publicDefinitionId", "The target public definition already has a Draft occurrence; mapping cannot merge rows.");
  }
  return { ok: true, value: { beforeOccurrence, afterOccurrence: { ...beforeOccurrence, milestoneDefinitionId: input.publicDefinitionId } } };
}

export function mapDraftLocalOccurrenceToPublic(
  schedule: CanonicalProjectSchedule,
  input: ConfirmMapDraftLocalOccurrenceToPublicInput,
  context: CanonicalScheduleCommandContext,
): CommandResult<CanonicalProjectSchedule, ScheduleReviewFailureCode> {
  // Re-resolve against the supplied current context; a previous preview grants no eligibility.
  const preview = previewDraftLocalOccurrenceToPublic(schedule, input, context);
  if (!preview.ok) return preview;
  const assertion = input.assertion;
  if (assertion === null || typeof assertion !== "object" || Array.isArray(assertion)
    || assertion.workContent !== true || assertion.stage !== true || assertion.type !== true || assertion.completionCriteria !== true) {
    return reviewFailure("invalid-equivalence-assertion", input.milestoneId, "assertion", "All four equivalence assertions must be explicitly true.");
  }
  const draft = schedule.workingDraft!;
  const reservedSessionIds = [...draft.reviewSessionIds, ...schedule.reviewSessions.map(session => session.id),
    ...schedule.reviewClosures.map(closure => closure.sessionId), ...schedule.reviewDecisions.map(decision => decision.sessionId)];
  if (!validInjectedIds([input.sessionId], reservedSessionIds)
    || !validInjectedIds([input.decisionId], schedule.reviewDecisions.map(decision => decision.id))) {
    return reviewFailure("id-collision", input.milestoneId, "ids", "Supply nonempty unused session and decision IDs.");
  }
  const session: ScheduleReviewSession = Object.freeze({ id: input.sessionId, workingDraftId: draft.workingDraftId,
    source: "manual-local-mapping", evidenceIds: Object.freeze([]) });
  const decision = Object.freeze({ id: input.decisionId, sessionId: session.id, targetMilestoneId: input.milestoneId,
    fromLocalDefinitionId: input.localDefinitionId, toPublicDefinitionId: input.publicDefinitionId,
    assertion: Object.freeze({ workContent: assertion.workContent, stage: assertion.stage, type: assertion.type, completionCriteria: assertion.completionCriteria }),
  });
  return { ok: true, value: { ...schedule,
    reviewSessions: [...schedule.reviewSessions, session], reviewDecisions: [...schedule.reviewDecisions, decision],
    workingDraft: { ...draft, reviewSessionIds: [...draft.reviewSessionIds, session.id],
      milestones: draft.milestones.map(row => row === preview.value.beforeOccurrence ? preview.value.afterOccurrence : row) },
  } };
}
