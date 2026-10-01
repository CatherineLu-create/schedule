import type { DateOnly } from "../shared/dateOnly";
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

export interface ScheduleImportCandidate {
  readonly id: ScheduleImportCandidateId;
  readonly evidenceId: ScheduleEvidenceId;
  readonly parsedPlan: ParsedDateValue;
  readonly parsedActual: ParsedDateValue;
  readonly parsedApplicability: ParsedApplicabilityValue;
  readonly proposedDefinitionMatches: readonly MilestoneDefinitionId[];
  readonly rawFindings: readonly ValidationIssue[];
  readonly status: "pending" | "confirmed";
}

export interface ScheduleReviewSession {
  readonly id: ScheduleReviewSessionId;
  readonly workingDraftId: CanonicalScheduleWorkingDraftId;
  readonly source: "built-in-simulation" | "future-external-adapter" | "manual-local-mapping";
  readonly evidenceIds: readonly ScheduleEvidenceId[];
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
