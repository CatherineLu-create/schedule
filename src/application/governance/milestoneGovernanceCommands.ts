import { validateClassificationCatalogs } from "../../domain/governance/classificationCatalogs";
import {
  validateMilestoneGovernanceReleaseContinuity,
  type CommandResult,
  type GovernanceCommandFailureCode,
  type GovernanceDraftUpdate,
  type GovernancePublishDiff,
  type GovernancePublishPreview,
  type MilestoneGovernanceDraft,
  type MilestoneGovernanceRelease,
  type MilestoneGovernanceRuntimeState,
  type RetiredDraftOccurrenceGrantProposal,
} from "../../domain/governance/milestoneGovernance";
import { getCurrentPublishedVersion } from "../../domain/schedule/officialSchedule";
import type { GovernanceDraftId, GovernanceReleaseId, RequirementEnrollmentId, RequirementWithdrawalId } from "../../domain/shared/ids";
import type { ValidationIssue } from "../../domain/validation/validationIssue";
import type { PrototypeState } from "../state/prototypeState";

export type { CommandResult, GovernanceCommandFailureCode, GovernanceDraftUpdate } from "../../domain/governance/milestoneGovernance";

export interface GovernanceCommandFactories {
  readonly createReleaseId: () => GovernanceReleaseId;
  readonly createEnrollmentId: () => RequirementEnrollmentId;
  readonly createWithdrawalId: () => RequirementWithdrawalId;
  readonly nowIso: () => string;
}

type State = MilestoneGovernanceRuntimeState;
type Candidate = MilestoneGovernanceDraft["candidateRelease"];
type Result = CommandResult<State, GovernanceCommandFailureCode>;
type Assignment = MilestoneGovernanceDraft["existingProjectAssignments"][number];

function issue(code: string, message: string, section: string, entityId?: string): ValidationIssue {
  return { code, domain: "governance", source: "data", severity: "blocking", message, target: { section, entityId } };
}

function failure(code: GovernanceCommandFailureCode, message: string): Result {
  return { ok: false, code, issues: [issue(code, message, "draft")] };
}

function validId(id: string): boolean {
  return typeof id === "string" && id.trim().length > 0;
}

/** Copy nested aliases too: no published value may retain a caller-owned array. */
function copyCandidate(candidate: Candidate): Candidate {
  return {
    stageGroups: candidate.stageGroups.map(item => ({ ...item, aliases: [...item.aliases] })),
    milestoneTypes: candidate.milestoneTypes.map(item => ({ ...item, aliases: [...item.aliases] })),
    selectableStageGroupIds: [...candidate.selectableStageGroupIds],
    selectableMilestoneTypeIds: [...candidate.selectableMilestoneTypeIds],
    automaticAttentionTypeIds: [...candidate.automaticAttentionTypeIds],
    definitions: candidate.definitions.map(d => ({ ...d, aliases: [...d.aliases] })),
    addableDefinitionIds: [...candidate.addableDefinitionIds],
    portfolioColumnDefinitionIds: [...candidate.portfolioColumnDefinitionIds],
    additionalAttentionDefinitionIds: [...candidate.additionalAttentionDefinitionIds],
    newProjectRequirementDefinitionIds: [...candidate.newProjectRequirementDefinitionIds],
  };
}

function freezeRelease(release: MilestoneGovernanceRelease): MilestoneGovernanceRelease {
  for (const catalog of [release.stageGroups, release.milestoneTypes]) {
    for (const item of catalog) { Object.freeze(item.aliases); Object.freeze(item); }
    Object.freeze(catalog);
  }
  Object.freeze(release.selectableStageGroupIds);
  Object.freeze(release.selectableMilestoneTypeIds);
  Object.freeze(release.automaticAttentionTypeIds);
  for (const definition of release.definitions) {
    Object.freeze(definition.aliases);
    Object.freeze(definition);
  }
  Object.freeze(release.definitions);
  Object.freeze(release.addableDefinitionIds);
  Object.freeze(release.portfolioColumnDefinitionIds);
  Object.freeze(release.additionalAttentionDefinitionIds);
  Object.freeze(release.newProjectRequirementDefinitionIds);
  return Object.freeze(release);
}

export function startGovernanceDraft(state: State, draftId: GovernanceDraftId): Result {
  if (state.draft) return failure("draft-already-exists", "A governance draft already exists.");
  if (!validId(draftId)) return failure("invalid-reference", "The governance draft ID must not be blank.");
  const current = state.releases.find(r => r.id === state.currentReleaseId);
  if (!current) return failure("invalid-reference", "The current governance release must exist.");
  const classificationIssues = validateClassificationCatalogs(current);
  if (classificationIssues.length) return { ok: false, code: "invalid-reference", issues: classificationIssues };
  return { ok: true, value: { ...state, draft: {
    id: draftId,
    baseReleaseId: current.id,
    candidateRelease: copyCandidate(current),
    existingProjectAssignments: [],
    withdrawalEnrollmentIds: [],
  } } };
}

export function updateGovernanceDraft(state: State, update: GovernanceDraftUpdate): Result {
  const draft = state.draft;
  if (!draft) return failure("no-draft", "Start a governance draft before editing.");
  if (draft.baseReleaseId !== state.currentReleaseId) return failure("stale-base-release", "The governance draft base release has changed.");
  const replaceClassification = (candidateRelease: Candidate): Result => {
    const current = state.releases.find(release => release.id === state.currentReleaseId);
    if (!current) return failure("invalid-reference", "The current governance release must exist.");
    const issues = validateClassificationCatalogs(candidateRelease, current);
    if (issues.length) return { ok: false, code: issues[0].code as GovernanceCommandFailureCode, issues };
    return { ok: true, value: { ...state, draft: { ...draft, candidateRelease: copyCandidate(candidateRelease) } } };
  };
  switch (update.kind) {
    case "replace-candidate-release":
      return replaceClassification(update.candidateRelease);
    case "add-stage":
    case "add-type": {
      if (!validId(update.id) || typeof update.displayName !== "string" || !update.displayName.trim()) return failure("invalid-reference", "A classification requires a nonblank ID and label.");
      const candidate = draft.candidateRelease;
      const item = { id: update.id, displayName: update.displayName.trim(), active: true, reviewStatus: "reviewed" as const, aliases: [] };
      return update.kind === "add-stage"
        ? replaceClassification({ ...candidate, stageGroups: [...candidate.stageGroups, { ...item, id: update.id }], selectableStageGroupIds: [...candidate.selectableStageGroupIds, update.id] })
        : replaceClassification({ ...candidate, milestoneTypes: [...candidate.milestoneTypes, { ...item, id: update.id }], selectableMilestoneTypeIds: [...candidate.selectableMilestoneTypeIds, update.id] });
    }
    case "retire-stage": {
      const candidate = draft.candidateRelease;
      if (!candidate.selectableStageGroupIds.includes(update.id)) return failure("invalid-reference", "Only a selectable Stage can be retired.");
      return replaceClassification({ ...candidate, stageGroups: candidate.stageGroups.map(item => item.id === update.id ? { ...item, active: false } : item), selectableStageGroupIds: candidate.selectableStageGroupIds.filter(id => id !== update.id) });
    }
    case "retire-type": {
      const candidate = draft.candidateRelease;
      if (candidate.automaticAttentionTypeIds.includes(update.id)) return failure("protected-classification", "System automatic Types cannot be retired.");
      if (!candidate.selectableMilestoneTypeIds.includes(update.id)) return failure("invalid-reference", "Only a selectable ordinary Type can be retired.");
      return replaceClassification({ ...candidate, milestoneTypes: candidate.milestoneTypes.map(item => item.id === update.id ? { ...item, active: false } : item), selectableMilestoneTypeIds: candidate.selectableMilestoneTypeIds.filter(id => id !== update.id) });
    }
    case "replace-existing-project-assignments":
      return { ok: true, value: { ...state, draft: { ...draft, existingProjectAssignments: update.assignments.map(a => ({ ...a })) } } };
    case "replace-withdrawals":
      return { ok: true, value: { ...state, draft: { ...draft, withdrawalEnrollmentIds: [...update.enrollmentIds] } } };
  }
}

export function discardGovernanceDraft(state: State): State {
  return state.draft === null ? state : { ...state, draft: null };
}

function diffRelease(previous: MilestoneGovernanceRelease, candidate: Candidate): GovernancePublishDiff {
  const oldDefinitions = new Map(previous.definitions.map(d => [d.id, d]));
  return {
    addedStageGroupIds: candidate.stageGroups.filter(item => !previous.stageGroups.some(old => old.id === item.id)).map(item => item.id),
    retiredStageGroupIds: previous.selectableStageGroupIds.filter(id => !candidate.selectableStageGroupIds.includes(id)),
    addedMilestoneTypeIds: candidate.milestoneTypes.filter(item => !previous.milestoneTypes.some(old => old.id === item.id)).map(item => item.id),
    retiredMilestoneTypeIds: previous.selectableMilestoneTypeIds.filter(id => !candidate.selectableMilestoneTypeIds.includes(id)),
    addedDefinitionIds: candidate.definitions.filter(d => !oldDefinitions.has(d.id)).map(d => d.id),
    changedDefinitionIds: candidate.definitions.filter(d => {
      const old = oldDefinitions.get(d.id);
      return old && (old.name !== d.name || old.stageGroupId !== d.stageGroupId || old.milestoneTypeId !== d.milestoneTypeId ||
        old.displayOrder !== d.displayOrder || old.active !== d.active || old.reviewStatus !== d.reviewStatus ||
        old.showInPortfolio !== d.showInPortfolio || JSON.stringify(old.aliases) !== JSON.stringify(d.aliases));
    }).map(d => d.id),
    retiredDefinitionIds: previous.addableDefinitionIds.filter(id => !candidate.addableDefinitionIds.includes(id)),
    addableDefinitionIdsBefore: [...previous.addableDefinitionIds],
    addableDefinitionIdsAfter: [...candidate.addableDefinitionIds],
    portfolioDefinitionIdsBefore: [...previous.portfolioColumnDefinitionIds],
    portfolioDefinitionIdsAfter: [...candidate.portfolioColumnDefinitionIds],
    additionalAttentionIdsBefore: [...previous.additionalAttentionDefinitionIds],
    additionalAttentionIdsAfter: [...candidate.additionalAttentionDefinitionIds],
  };
}

interface PublishTransition {
  readonly preview: GovernancePublishPreview;
  readonly failureCode: GovernanceCommandFailureCode | null;
}

/** The sole semantic gate for both preview and publish; never allocates IDs/time. */
function buildGovernancePublishTransition(state: State, prototype: PrototypeState): PublishTransition {
  const blockingIssues: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  let failureCode: GovernanceCommandFailureCode | null = null;
  const block = (code: GovernanceCommandFailureCode, message: string, section: string, entityId?: string) => {
    failureCode ??= code;
    blockingIssues.push(issue(code, message, section, entityId));
  };
  const draft = state.draft;
  const currentIndex = state.releases.findIndex(r => r.id === state.currentReleaseId);
  const current = state.releases[currentIndex];
  const classificationIssues = draft ? validateClassificationCatalogs(draft.candidateRelease, current) : [];
  const candidate = draft && classificationIssues.length === 0 ? copyCandidate(draft.candidateRelease) : null;
  const preview: GovernancePublishPreview = {
    candidateRelease: candidate,
    diff: current && candidate ? diffRelease(current, candidate) : null,
    proposedAssignments: draft?.existingProjectAssignments.map(a => ({ ...a })) ?? [],
    proposedWithdrawalEnrollmentIds: [...(draft?.withdrawalEnrollmentIds ?? [])],
    proposedRetiredDraftOccurrenceGrants: [],
    blockingIssues,
    warnings,
  };
  if (classificationIssues.length) {
    blockingIssues.push(...classificationIssues);
    return { preview, failureCode: classificationIssues[0].code as GovernanceCommandFailureCode };
  }
  if (!draft || !candidate) {
    block("no-draft", "Start a governance draft before publishing.", "draft");
    return { preview, failureCode };
  }
  if (draft.baseReleaseId !== state.currentReleaseId) {
    block("stale-base-release", "The governance draft base release has changed.", "draft");
    return { preview, failureCode };
  }
  if (!current) {
    block("invalid-reference", "The current release must exist in governance history.", "releases");
    return { preview, failureCode };
  }
  const uniqueIds = (ids: readonly string[], section: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (!validId(id)) block("invalid-reference", "An ID must not be blank.", section, id);
      if (seen.has(id)) block("duplicate-id", "IDs must be unique within this collection.", section, id);
      seen.add(id);
    }
  };
  uniqueIds(state.releases.map(r => r.id), "releases");
  uniqueIds(candidate.definitions.map(d => d.id), "definitions");
  const definitions = new Map(candidate.definitions.map(d => [d.id, d]));
  const localDefinitionIds = new Set(prototype.schedules.flatMap(schedule =>
    schedule.localDefinitions.map(definition => definition.id)));
  const stages = new Set(candidate.stageGroups.map(s => s.id));
  const types = new Set(candidate.milestoneTypes.map(t => t.id));
  const historicalDefinitionIds = new Set(state.releases.flatMap(release => release.definitions.map(definition => definition.id)));
  for (const definition of candidate.definitions) {
    if (localDefinitionIds.has(definition.id)) {
      block("duplicate-id", "A public definition ID must not be used by any Project-local definition.", "definitions", definition.id);
    }
    if (!stages.has(definition.stageGroupId) || (definition.milestoneTypeId !== null && !types.has(definition.milestoneTypeId))) {
      block("invalid-reference", "Definitions must use a resolvable Stage and an optional resolvable Type.", "definitions", definition.id);
    } else if (!historicalDefinitionIds.has(definition.id) && (!candidate.selectableStageGroupIds.includes(definition.stageGroupId)
      || (definition.milestoneTypeId !== null && !candidate.selectableMilestoneTypeIds.includes(definition.milestoneTypeId)))) {
      block("invalid-reference", "New definitions require a selectable Stage and an optional selectable Type.", "definitions", definition.id);
    }
  }
  // Validate against every published identity, including older authoritative records.
  const candidateForContinuity = { ...candidate, id: current.id, publishedAt: current.publishedAt };
  for (const release of state.releases) {
    const classifications = validateClassificationCatalogs(candidate, release);
    if (classifications.length) failureCode ??= "invalid-reference";
    blockingIssues.push(...classifications);
    const findings = validateMilestoneGovernanceReleaseContinuity(release, candidateForContinuity);
    if (findings.length) failureCode ??= "invalid-reference";
    blockingIssues.push(...findings);
  }
  const dependencies = [...current.definitions, ...prototype.schedules.flatMap(schedule => schedule.localDefinitions)];
  for (const [ids, field, message] of [
    [preview.diff!.retiredStageGroupIds, "stageGroupId", "此階段仍被既有里程碑使用；停用後僅停止新定義選用，不會停用既有里程碑。"],
    [preview.diff!.retiredMilestoneTypeIds, "milestoneTypeId", "此類型仍被既有里程碑使用；停用後僅停止新定義選用，不會停用既有里程碑。"],
  ] as const) {
    for (const id of ids) if (dependencies.some(definition => definition[field] === id)) {
      warnings.push({ ...issue("classification-retained-dependency", message, "classification", id), severity: "advisory" });
    }
  }
  for (const field of ["addableDefinitionIds", "portfolioColumnDefinitionIds", "additionalAttentionDefinitionIds", "newProjectRequirementDefinitionIds"] as const) {
    uniqueIds(candidate[field], field);
    for (const id of candidate[field]) {
      if (!definitions.has(id)) block("invalid-reference", "Membership must resolve to a public definition.", field, id);
    }
  }
  const addable = new Set(candidate.addableDefinitionIds);
  for (const id of addable) {
    const definition = definitions.get(id);
    if (definition && (!definition.active || definition.reviewStatus !== "reviewed")) {
      block("invalid-reference", "Add requires an active, reviewed public definition.", "addableDefinitionIds", id);
    }
  }
  for (const id of candidate.newProjectRequirementDefinitionIds) {
    if (definitions.has(id) && !addable.has(id)) {
      block("retire-requirement-conflict", "Every new-project requirement must be addable after this release.", "newProjectRequirementDefinitionIds", id);
    }
  }

  const history = state.releases.slice(0, currentIndex + 1);
  const historyIds = new Set(history.map(r => r.id));
  const withdrawn = new Set(state.requirementWithdrawals.filter(w => historyIds.has(w.withdrawnByReleaseId)).map(w => w.enrollmentId));
  const effective = state.requirementEnrollments.filter(e => historyIds.has(e.assignedByReleaseId) && !withdrawn.has(e.id));
  uniqueIds(state.requirementEnrollments.map(e => e.id), "requirementEnrollments");
  uniqueIds(state.requirementWithdrawals.map(w => w.id), "requirementWithdrawals");
  uniqueIds(draft.withdrawalEnrollmentIds, "withdrawalEnrollmentIds");
  const explicitWithdrawals = new Set(draft.withdrawalEnrollmentIds);
  for (const id of explicitWithdrawals) {
    if (!effective.some(e => e.id === id)) block("invalid-reference", "Withdrawals must reference an effective enrollment.", "withdrawalEnrollmentIds", id);
  }
  const retained = effective.filter(e => !explicitWithdrawals.has(e.id));
  const projects = new Set(prototype.projects.map(p => p.id));
  const newlyRetired = new Set(preview.diff!.retiredDefinitionIds);
  const proposedGrants: RetiredDraftOccurrenceGrantProposal[] = [];
  for (const schedule of prototype.schedules) {
    const workingDraft = schedule.workingDraft;
    if (!workingDraft) continue;
    for (const row of workingDraft.milestones) {
      if (!newlyRetired.has(row.milestoneDefinitionId)) continue;
      if (!projects.has(schedule.projectId) || !validId(workingDraft.workingDraftId) || !validId(row.milestoneId)) {
        block("invalid-reference", "A Retire grant requires an existing Project and exact Draft occurrence IDs.", "retiredDraftOccurrenceGrants", row.milestoneId);
        continue;
      }
      proposedGrants.push({ projectId: schedule.projectId, workingDraftId: workingDraft.workingDraftId, milestoneId: row.milestoneId, milestoneDefinitionId: row.milestoneDefinitionId });
    }
  }
  // A stored grant only becomes authority when its issuing release is in current history.
  const priorGrants = state.retiredDraftOccurrenceGrants.filter(g => {
    const index = history.findIndex(r => r.id === g.retiredByReleaseId);
    return index > 0 && history[index - 1].addableDefinitionIds.includes(g.milestoneDefinitionId) &&
      !history[index].addableDefinitionIds.includes(g.milestoneDefinitionId);
  });
  const grants = [...priorGrants, ...proposedGrants];
  const currentPublishedContains = (assignment: Assignment) => prototype.schedules.some(s =>
    s.projectId === assignment.projectId && getCurrentPublishedVersion(s)?.milestones.some(row => row.milestoneDefinitionId === assignment.milestoneDefinitionId));
  const hasLegalPath = (assignment: Assignment) => addable.has(assignment.milestoneDefinitionId) || currentPublishedContains(assignment) ||
    prototype.schedules.some(s => s.projectId === assignment.projectId && s.workingDraft !== null &&
      s.workingDraft.milestones.some(row => row.milestoneDefinitionId === assignment.milestoneDefinitionId &&
        grants.some(g => g.projectId === s.projectId && g.workingDraftId === s.workingDraft!.workingDraftId &&
          g.milestoneId === row.milestoneId && g.milestoneDefinitionId === row.milestoneDefinitionId)));
  const pairKey = (a: Assignment) => JSON.stringify([a.projectId, a.milestoneDefinitionId]);
  const pairs = new Set<string>();
  for (const enrollment of retained) {
    const key = pairKey(enrollment);
    if (pairs.has(key)) block("duplicate-id", "At most one effective requirement is allowed per Project and definition.", "requirementEnrollments", enrollment.id);
    pairs.add(key);
    if (newlyRetired.has(enrollment.milestoneDefinitionId) && !hasLegalPath(enrollment)) {
      block("retire-requirement-conflict", "Retire leaves an effective requirement without a legal fulfillment path; explicitly withdraw it or preserve a path.", "requirementEnrollments", enrollment.id);
    }
  }
  for (const assignment of draft.existingProjectAssignments) {
    const key = pairKey(assignment);
    if (pairs.has(key)) block("duplicate-id", "At most one effective requirement is allowed per Project and definition.", "existingProjectAssignments", assignment.projectId);
    pairs.add(key);
    if (!projects.has(assignment.projectId) || !definitions.has(assignment.milestoneDefinitionId)) {
      block("invalid-reference", "Assignment Project and public definition must exist.", "existingProjectAssignments", assignment.projectId);
    } else if (!hasLegalPath(assignment)) {
      block("no-legal-fulfillment-path", "Assignment requires Add eligibility, Current Published lineage, or a present exact D1 Draft grant.", "existingProjectAssignments", assignment.projectId);
    }
  }
  const warned = new Set<string>();
  for (const assignment of [...retained, ...draft.existingProjectAssignments]) {
    if (newlyRetired.has(assignment.milestoneDefinitionId) && currentPublishedContains(assignment) && !warned.has(pairKey(assignment))) {
      warnings.push({ ...issue("retained-requirement-may-reopen", "This completed requirement retains Published lineage; removing it in a future Published Schedule may make it pending again.", "requirementEnrollments", assignment.projectId), severity: "advisory" });
      warned.add(pairKey(assignment));
    }
  }
  return { preview: { ...preview, proposedRetiredDraftOccurrenceGrants: proposedGrants }, failureCode };
}

export function previewGovernancePublish(state: State, prototype: PrototypeState): GovernancePublishPreview {
  return buildGovernancePublishTransition(state, prototype).preview;
}

function validIsoTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second] = match;
  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= daysInMonth &&
    Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60;
}

export function publishGovernanceDraft(state: State, prototype: PrototypeState, factories: GovernanceCommandFactories): Result {
  const { preview, failureCode } = buildGovernancePublishTransition(state, prototype);
  if (failureCode) return { ok: false, code: failureCode, issues: preview.blockingIssues };
  const releaseId = factories.createReleaseId();
  const publishedAt = factories.nowIso();
  if (!validId(releaseId) || !validIsoTimestamp(publishedAt)) return failure("invalid-reference", "Publish requires a nonblank release ID and a valid ISO timestamp.");
  // References reserve IDs too: a new release must not activate dormant history.
  const releaseIds = new Set([
    ...state.releases.map(r => r.id),
    ...state.requirementEnrollments.map(e => e.assignedByReleaseId),
    ...state.requirementWithdrawals.map(w => w.withdrawnByReleaseId),
    ...state.retiredDraftOccurrenceGrants.map(g => g.retiredByReleaseId),
  ]);
  if (releaseIds.has(releaseId)) return failure("duplicate-id", "The release ID is already stored or referenced.");
  // A fresh enrollment must not inherit a retained withdrawal's target ID.
  const enrollmentIds = new Set([
    ...state.requirementEnrollments.map(e => e.id),
    ...state.requirementWithdrawals.map(w => w.enrollmentId),
  ]);
  const withdrawalIds = new Set(state.requirementWithdrawals.map(w => w.id));
  const enrollments = [];
  const withdrawals = [];
  for (const enrollmentId of preview.proposedWithdrawalEnrollmentIds) {
    const id = factories.createWithdrawalId();
    if (!validId(id)) return failure("invalid-reference", "Withdrawal IDs must not be blank.");
    if (withdrawalIds.has(id)) return failure("duplicate-id", "The withdrawal ID already exists.");
    withdrawalIds.add(id);
    withdrawals.push(Object.freeze({ id, enrollmentId, withdrawnByReleaseId: releaseId }));
  }
  for (const assignment of preview.proposedAssignments) {
    const id = factories.createEnrollmentId();
    if (!validId(id)) return failure("invalid-reference", "Enrollment IDs must not be blank.");
    if (enrollmentIds.has(id)) return failure("duplicate-id", "The enrollment ID is already stored or referenced.");
    enrollmentIds.add(id);
    enrollments.push(Object.freeze({ ...assignment, id, assignedByReleaseId: releaseId, source: "explicit-existing-project" as const }));
  }
  const release = freezeRelease({ ...copyCandidate(preview.candidateRelease!), id: releaseId, publishedAt });
  const grants = preview.proposedRetiredDraftOccurrenceGrants.map(g => Object.freeze({ ...g, retiredByReleaseId: releaseId }));
  return { ok: true, value: {
    ...state,
    releases: [...state.releases, release],
    currentReleaseId: releaseId,
    requirementEnrollments: [...state.requirementEnrollments, ...enrollments],
    requirementWithdrawals: [...state.requirementWithdrawals, ...withdrawals],
    retiredDraftOccurrenceGrants: [...state.retiredDraftOccurrenceGrants, ...grants],
    draft: null,
  } };
}
