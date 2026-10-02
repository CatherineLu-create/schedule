import { parseDateOnly, type DateOnly } from "../shared/dateOnly";
import type { CanonicalScheduleWorkingDraftMilestone } from "./canonicalScheduleWorkingDraft";
import type { CanonicalPublishedScheduleMilestone } from "./officialSchedule";
import type {
  CanonicalScheduleWorkingDraftId,
  MilestoneDefinitionId,
  MilestoneId,
  MilestoneTypeId,
  ScheduleEvidenceId,
  ScheduleImportCandidateId,
  ScheduleReviewDecisionId,
  ScheduleReviewSessionId,
  StageGroupId,
} from "../shared/ids";
import type { ValidationIssue } from "../validation/validationIssue";
import type { ScheduleVersionNumber } from "./schedule";

export type RawImportCell =
  | { readonly presence: "missing" }
  | { readonly presence: "present"; readonly raw: string };

export interface RawScheduleImportValues {
  readonly milestoneName: RawImportCell;
  readonly stage: RawImportCell;
  readonly milestoneType: RawImportCell;
  readonly plan: RawImportCell;
  readonly actual: RawImportCell;
  readonly applicability: RawImportCell;
}

export interface ScheduleEvidenceRecord {
  readonly id: ScheduleEvidenceId;
  readonly sourceKind: "built-in-simulation" | "future-external-adapter";
  readonly sourceDescriptor: string;
  readonly rawValues: RawScheduleImportValues;
  readonly candidateFingerprint: string;
}

export type ParsedDateValue =
  | { readonly kind: "missing" }
  | { readonly kind: "blank"; readonly raw: string }
  | { readonly kind: "parsed"; readonly raw: string; readonly value: DateOnly }
  | { readonly kind: "ambiguous"; readonly raw: string }
  | { readonly kind: "invalid"; readonly raw: string };

export type ParsedApplicabilityValue =
  | { readonly kind: "missing" }
  | { readonly kind: "blank"; readonly raw: string }
  | { readonly kind: "explicitApplicable"; readonly raw: string }
  | { readonly kind: "explicitNotApplicable"; readonly raw: string }
  | { readonly kind: "unrecognized"; readonly raw: string };

export type DateApplyAction =
  | { readonly kind: "keepExisting" }
  | { readonly kind: "set"; readonly value: DateOnly }
  | { readonly kind: "clear" };

export type ApplicabilityApplyAction =
  | { readonly kind: "keepExisting" }
  | { readonly kind: "set"; readonly value: "applicable" | "notApplicable" };

export interface LocalToPublicEquivalenceAssertion {
  readonly workContent: true;
  readonly stage: true;
  readonly type: true;
  readonly completionCriteria: true;
}

export interface MapDraftLocalOccurrenceToPublicInput {
  readonly milestoneId: MilestoneId;
  readonly localDefinitionId: MilestoneDefinitionId;
  readonly publicDefinitionId: MilestoneDefinitionId;
}

export interface ConfirmMapDraftLocalOccurrenceToPublicInput extends MapDraftLocalOccurrenceToPublicInput {
  readonly sessionId: ScheduleReviewSessionId;
  readonly decisionId: ScheduleReviewDecisionId;
  readonly assertion: LocalToPublicEquivalenceAssertion;
}

export interface LocalToPublicPreview {
  readonly beforeOccurrence: CanonicalScheduleWorkingDraftMilestone;
  readonly afterOccurrence: CanonicalScheduleWorkingDraftMilestone;
}

export interface ProjectLocalMilestoneDefinition {
  readonly id: MilestoneDefinitionId;
  readonly name: string;
  readonly stageGroupId: StageGroupId;
  readonly milestoneTypeId: MilestoneTypeId;
  readonly displayOrder: number;
  readonly source: "manual" | "import";
  readonly confirmation: "confirmed";
  readonly evidenceIds: readonly ScheduleEvidenceId[];
}

export interface ConfirmProjectLocalMilestoneDefinitionInput {
  readonly definitionId: MilestoneDefinitionId;
  readonly name: string;
  readonly stageGroupId: StageGroupId;
  readonly milestoneTypeId: MilestoneTypeId;
  readonly source: "manual" | "import";
  readonly evidenceIds: readonly ScheduleEvidenceId[];
}

export type ScheduleReviewFailureCode =
  | "no-working-draft" | "candidate-not-found" | "already-confirmed"
  | "target-not-found" | "target-definition-mismatch" | "duplicate-milestone-id"
  | "duplicate-target-definition" | "invalid-action-for-new-occurrence"
  | "invalid-date-or-applicability" | "invalid-local-classification"
  | "definition-not-addable" | "retired-definition-not-retained"
  | "stale-governance-context" | "id-collision" | "invalid-equivalence-assertion";

export interface ScheduleImportCandidate {
  readonly id: ScheduleImportCandidateId;
  readonly evidenceId: ScheduleEvidenceId;
  readonly parsedPlan: ParsedDateValue;
  readonly parsedActual: ParsedDateValue;
  readonly parsedApplicability: ParsedApplicabilityValue;
  readonly proposedDefinitionMatches: readonly MilestoneDefinitionId[];
  readonly rawFindings: readonly ValidationIssue[];
  readonly status: "pending" | "confirmed";
  /** Exact identity supplied by a typed fixture, never inferred from its labels or fingerprint. */
  readonly sourceDefinitionId?: MilestoneDefinitionId;
}

export interface ScheduleReviewSession {
  readonly id: ScheduleReviewSessionId;
  readonly workingDraftId: CanonicalScheduleWorkingDraftId;
  readonly source: "built-in-simulation" | "future-external-adapter" | "manual-local-mapping";
  readonly evidenceIds: readonly ScheduleEvidenceId[];
  /** New loaders retain candidate identity reservations even after a pending Draft is discarded. */
  readonly candidateIds?: readonly ScheduleImportCandidateId[];
}

export interface ImportDecisionEvent {
  readonly id: ScheduleReviewDecisionId;
  readonly sessionId: ScheduleReviewSessionId;
  readonly evidenceId: ScheduleEvidenceId;
  readonly candidateId: ScheduleImportCandidateId;
  readonly targetMilestoneId: MilestoneId;
  readonly targetDefinitionId: MilestoneDefinitionId;
  readonly dateActions: { readonly plan: DateApplyAction; readonly actual: DateApplyAction };
  readonly applicabilityAction: ApplicabilityApplyAction;
}

export interface LocalToPublicEquivalenceDecisionEvent {
  readonly id: ScheduleReviewDecisionId;
  readonly sessionId: ScheduleReviewSessionId;
  readonly targetMilestoneId: MilestoneId;
  readonly fromLocalDefinitionId: MilestoneDefinitionId;
  readonly toPublicDefinitionId: MilestoneDefinitionId;
  readonly assertion: LocalToPublicEquivalenceAssertion;
}

export type ScheduleReviewDecisionEvent =
  | ImportDecisionEvent
  | LocalToPublicEquivalenceDecisionEvent;

export type ScheduleReviewClosureEvent =
  | { readonly sessionId: ScheduleReviewSessionId; readonly kind: "published"; readonly versionNumber: ScheduleVersionNumber }
  | { readonly sessionId: ScheduleReviewSessionId; readonly kind: "discarded" };

export interface ScheduleReviewTraceItem {
  readonly decision: ScheduleReviewDecisionEvent;
  readonly closure: ScheduleReviewClosureEvent | null;
  readonly finalOccurrence: CanonicalPublishedScheduleMilestone | null;
  readonly retention: "unpublished" | "discarded" | "retained" | "not-retained";
}

export type ReviewTarget =
  | { readonly kind: "createPublicOccurrence"; readonly definitionId: MilestoneDefinitionId; readonly milestoneId: MilestoneId }
  | { readonly kind: "createLocalOccurrence"; readonly localDefinitionId: MilestoneDefinitionId; readonly milestoneId: MilestoneId }
  | { readonly kind: "updateExistingOccurrence"; readonly milestoneId: MilestoneId;
      /** Optional stale-preview guard; the occurrence still resolves by its exact MilestoneId. */
      readonly expectedDefinitionId?: MilestoneDefinitionId };

export interface ConfirmScheduleImportDecisionInput {
  readonly candidateId: ScheduleImportCandidateId;
  readonly target: ReviewTarget;
  readonly applicability: ApplicabilityApplyAction;
  readonly plan: DateApplyAction;
  readonly actual: DateApplyAction;
}

export interface ScheduleImportDecisionPreview {
  readonly beforeOccurrence: CanonicalScheduleWorkingDraftMilestone | null;
  readonly afterOccurrence: CanonicalScheduleWorkingDraftMilestone | null;
  readonly operationBlockingFindings: readonly ValidationIssue[];
  readonly remainingPublishBlockingFindings: readonly ValidationIssue[];
}

export type GovernanceSimulationPack = "basic-success" | "fixable-validation" | "retired-existing-update" | "retired-no-reference-negative";

export interface ScheduleReviewIdBundle {
  readonly sessionId: ScheduleReviewSessionId;
  readonly evidenceIds: readonly ScheduleEvidenceId[];
  readonly candidateIds: readonly ScheduleImportCandidateId[];
}

/** Parses only an already typed raw cell. No external format or adapter is implied. */
export function parseScheduleImportDate(cell: RawImportCell): ParsedDateValue {
  if (cell.presence === "missing") return { kind: "missing" };
  const raw = cell.raw;
  if (!raw.trim()) return { kind: "blank", raw };
  const value = parseDateOnly(raw);
  if (value !== null) return { kind: "parsed", raw, value };
  // An unqualified slash date has no agreed day/month convention.
  return { kind: /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw) ? "ambiguous" : "invalid", raw };
}

export function parseScheduleImportApplicability(cell: RawImportCell): ParsedApplicabilityValue {
  if (cell.presence === "missing") return { kind: "missing" };
  const raw = cell.raw;
  if (!raw.trim()) return { kind: "blank", raw };
  if (raw === "Applicable") return { kind: "explicitApplicable", raw };
  if (raw === "N/A") return { kind: "explicitNotApplicable", raw };
  return { kind: "unrecognized", raw };
}

export function createScheduleImportCandidate(
  evidence: ScheduleEvidenceRecord,
  id: ScheduleImportCandidateId,
  sourceDefinitionId?: MilestoneDefinitionId,
): ScheduleImportCandidate {
  const parsedPlan = parseScheduleImportDate(evidence.rawValues.plan);
  const parsedActual = parseScheduleImportDate(evidence.rawValues.actual);
  const parsedApplicability = parseScheduleImportApplicability(evidence.rawValues.applicability);
  const rawFindings: ValidationIssue[] = [];
  for (const [field, parsed] of [["plan", parsedPlan], ["actual", parsedActual], ["applicability", parsedApplicability]] as const) {
    if (parsed.kind !== "invalid" && parsed.kind !== "ambiguous" && parsed.kind !== "unrecognized") continue;
    const suffix = parsed.raw === "-" || parsed.raw === "*" ? "legacy-sentinel"
      : parsed.kind === "unrecognized" ? "unrecognized-applicability" : `${parsed.kind}-date`;
    rawFindings.push({ code: `schedule.import.${suffix}`, domain: "schedule", source: "import", severity: "blocking",
      message: "Raw evidence requires an explicit date or applicability decision.", target: { section: "schedule.importCandidates", entityId: id, field } });
  }
  return { id, evidenceId: evidence.id, parsedPlan, parsedActual, parsedApplicability,
    proposedDefinitionMatches: sourceDefinitionId === undefined ? [] : [sourceDefinitionId], rawFindings, status: "pending",
    ...(sourceDefinitionId === undefined ? {} : { sourceDefinitionId }) };
}

export interface ScheduleImportActionSuggestions {
  readonly plan: DateApplyAction | null;
  readonly actual: DateApplyAction | null;
  readonly applicability: ApplicabilityApplyAction | null;
}

/** Null means PM action is still required; suggestions are never applied by loading or previewing. */
export function suggestScheduleImportActions(
  candidate: ScheduleImportCandidate,
  before: CanonicalScheduleWorkingDraftMilestone | null,
): ScheduleImportActionSuggestions {
  if (candidate.parsedApplicability.kind === "explicitNotApplicable") {
    return { plan: { kind: "clear" }, actual: { kind: "clear" }, applicability: { kind: "set", value: "notApplicable" } };
  }
  const date = (parsed: ParsedDateValue): DateApplyAction | null => {
    if (parsed.kind === "parsed") return { kind: "set", value: parsed.value };
    if (parsed.kind === "missing" || parsed.kind === "blank") return { kind: before === null ? "clear" : "keepExisting" };
    return null;
  };
  const parsed = candidate.parsedApplicability;
  const applicability: ApplicabilityApplyAction | null = parsed.kind === "explicitApplicable" ? { kind: "set", value: "applicable" }
    : (parsed.kind === "missing" || parsed.kind === "blank") && before !== null ? { kind: "keepExisting" } : null;
  return { plan: date(candidate.parsedPlan), actual: date(candidate.parsedActual), applicability };
}
