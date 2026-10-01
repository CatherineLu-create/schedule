import type { MilestoneDefinition } from "../schedule/milestoneCatalog";
import type {
  CanonicalScheduleWorkingDraftId,
  GovernanceDraftId,
  GovernanceReleaseId,
  MilestoneDefinitionId,
  MilestoneId,
  ProjectId,
  RequirementEnrollmentId,
  RequirementWithdrawalId,
} from "../shared/ids";
import type { ValidationIssue } from "../validation/validationIssue";

export interface MilestoneGovernanceRelease {
  readonly id: GovernanceReleaseId;
  readonly publishedAt: string | null;
  readonly definitions: readonly MilestoneDefinition[];
  readonly addableDefinitionIds: readonly MilestoneDefinitionId[];
  readonly portfolioColumnDefinitionIds: readonly MilestoneDefinitionId[];
  readonly additionalAttentionDefinitionIds: readonly MilestoneDefinitionId[];
  readonly newProjectRequirementDefinitionIds: readonly MilestoneDefinitionId[];
}

export interface ProjectMilestoneRequirementEnrollment {
  readonly id: RequirementEnrollmentId;
  readonly projectId: ProjectId;
  readonly milestoneDefinitionId: MilestoneDefinitionId;
  readonly assignedByReleaseId: GovernanceReleaseId;
  readonly source: "explicit-existing-project" | "new-project-at-creation";
}

export interface ProjectMilestoneRequirementWithdrawal {
  readonly id: RequirementWithdrawalId;
  readonly enrollmentId: RequirementEnrollmentId;
  readonly withdrawnByReleaseId: GovernanceReleaseId;
}

export interface RetiredDraftOccurrenceGrant {
  readonly projectId: ProjectId;
  readonly workingDraftId: CanonicalScheduleWorkingDraftId;
  readonly milestoneId: MilestoneId;
  readonly milestoneDefinitionId: MilestoneDefinitionId;
  readonly retiredByReleaseId: GovernanceReleaseId;
}

export interface MilestoneGovernanceDraft {
  readonly id: GovernanceDraftId;
  readonly baseReleaseId: GovernanceReleaseId;
  readonly candidateRelease: Omit<MilestoneGovernanceRelease, "id" | "publishedAt">;
  readonly existingProjectAssignments: readonly {
    readonly projectId: ProjectId;
    readonly milestoneDefinitionId: MilestoneDefinitionId;
  }[];
  readonly withdrawalEnrollmentIds: readonly RequirementEnrollmentId[];
}

export interface MilestoneGovernanceRuntimeState {
  readonly releases: readonly MilestoneGovernanceRelease[];
  readonly currentReleaseId: GovernanceReleaseId;
  readonly draft: MilestoneGovernanceDraft | null;
  readonly requirementEnrollments: readonly ProjectMilestoneRequirementEnrollment[];
  readonly requirementWithdrawals: readonly ProjectMilestoneRequirementWithdrawal[];
  readonly retiredDraftOccurrenceGrants: readonly RetiredDraftOccurrenceGrant[];
}

export type GovernanceValidationIssue = ValidationIssue & { readonly domain: "governance" };

function continuityIssue(
  code: string,
  definitionId: MilestoneDefinitionId,
  field: string,
  message: string,
): GovernanceValidationIssue {
  return {
    code,
    domain: "governance",
    source: "data",
    severity: "blocking",
    message,
    target: { section: "definitions", entityId: definitionId, field },
  };
}

/** Keeps every published definition ID resolvable with its original meaning. */
export function validateMilestoneGovernanceReleaseContinuity(
  previous: MilestoneGovernanceRelease,
  candidate: MilestoneGovernanceRelease,
): readonly GovernanceValidationIssue[] {
  const candidateById = new Map<MilestoneDefinitionId, MilestoneDefinition[]>();
  for (const definition of candidate.definitions) {
    const matching = candidateById.get(definition.id) ?? [];
    matching.push(definition);
    candidateById.set(definition.id, matching);
  }

  const issues: GovernanceValidationIssue[] = [];
  for (const published of previous.definitions) {
    const matching = candidateById.get(published.id);
    if (!matching?.length) {
      issues.push(continuityIssue(
        "governance.definition.historical-resolution-dropped",
        published.id,
        "id",
        "A published milestone definition must remain resolvable by its original ID.",
      ));
      continue;
    }

    for (const candidateDefinition of matching) {
      for (const field of ["name", "stageGroupId", "milestoneTypeId"] as const) {
        if (candidateDefinition[field] !== published[field]) {
          issues.push(continuityIssue(
            "governance.definition.semantic-identity-changed",
            published.id,
            field,
            `A published milestone definition cannot change its ${field} under the same ID.`,
          ));
        }
      }
    }
  }

  return issues;
}
