import type { DateOnly } from "../shared/dateOnly";
import type {
  MilestoneDefinitionId,
  MilestoneRowId,
  ScheduleDraftId,
  ScheduleVersionId,
} from "../shared/ids";
import type { ValidationIssue } from "../validation/validationIssue";

declare const scheduleVersionNumberBrand: unique symbol;

export type ScheduleVersionNumber = number & {
  readonly [scheduleVersionNumberBrand]: "ScheduleVersionNumber";
};

export function toScheduleVersionNumber(value: number): ScheduleVersionNumber {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(
      "Schedule version number must be a positive safe integer",
    );
  }

  return value as ScheduleVersionNumber;
}

export type MilestoneApplicability = "applicable" | "notApplicable";

export type ScheduleImportFinding = Omit<
  ValidationIssue,
  "domain" | "source"
> & {
  readonly domain: "schedule";
  readonly source: "import";
};

export interface PublishedScheduleMilestone {
  readonly rowId: MilestoneRowId;
  readonly milestoneDefinitionId: MilestoneDefinitionId;
  readonly applicability: MilestoneApplicability;
  readonly plan: DateOnly | null;
  readonly actual: DateOnly | null;
}

export interface RawMilestoneIdentity {
  readonly name: string;
  readonly stageGroupName: string | null;
  readonly milestoneTypeName: string | null;
}

export interface WorkingDraftMilestone {
  readonly rowId: MilestoneRowId;
  readonly milestoneDefinitionId: MilestoneDefinitionId | null;
  readonly rawMilestoneIdentity: RawMilestoneIdentity | null;
  readonly applicability: MilestoneApplicability;
  readonly plan: DateOnly | null;
  readonly actual: DateOnly | null;
}

export interface PublishedScheduleVersion {
  readonly id: ScheduleVersionId;
  readonly versionNumber: ScheduleVersionNumber;
  readonly versionNote: string | null;
  readonly publishedAt: string;
  readonly milestones: readonly PublishedScheduleMilestone[];
}

export interface ScheduleWorkingDraft {
  readonly id: ScheduleDraftId;
  readonly basePublishedVersionId: ScheduleVersionId | null;
  readonly milestones: readonly WorkingDraftMilestone[];
  readonly importFindings: readonly ScheduleImportFinding[];
}

export interface ProjectSchedule {
  readonly publishedVersions: readonly PublishedScheduleVersion[];
  readonly workingDraft: ScheduleWorkingDraft | null;
}

export function getLatestPublishedVersion(
  schedule: ProjectSchedule,
): PublishedScheduleVersion | null {
  return schedule.publishedVersions[schedule.publishedVersions.length - 1] ?? null;
}

export function getPublishedVersionById(
  schedule: ProjectSchedule,
  versionId: ScheduleVersionId,
): PublishedScheduleVersion | null {
  return (
    schedule.publishedVersions.find((version) => version.id === versionId) ??
    null
  );
}

export function appendPublishedVersion(
  schedule: ProjectSchedule,
  version: PublishedScheduleVersion,
): ProjectSchedule {
  return {
    ...schedule,
    publishedVersions: [...schedule.publishedVersions, version],
  };
}

export interface CreateWorkingDraftFromLatestPublishedInput {
  readonly id: ScheduleDraftId;
  readonly createRowId: (
    source: PublishedScheduleMilestone,
  ) => MilestoneRowId;
}

export function createWorkingDraftFromLatestPublished(
  schedule: ProjectSchedule,
  input: CreateWorkingDraftFromLatestPublishedInput,
): ScheduleWorkingDraft {
  const latestPublished = getLatestPublishedVersion(schedule);

  return {
    id: input.id,
    basePublishedVersionId: latestPublished?.id ?? null,
    milestones:
      latestPublished?.milestones.map((source) => ({
        rowId: input.createRowId(source),
        milestoneDefinitionId: source.milestoneDefinitionId,
        rawMilestoneIdentity: null,
        applicability: source.applicability,
        plan: source.plan,
        actual: source.actual,
      })) ?? [],
    importFindings: [],
  };
}

export function replaceWorkingDraft(
  schedule: ProjectSchedule,
  replacement: ScheduleWorkingDraft,
): ProjectSchedule {
  const expectedBasePublishedVersionId =
    getLatestPublishedVersion(schedule)?.id ?? null;

  if (
    replacement.basePublishedVersionId !== expectedBasePublishedVersionId
  ) {
    throw new Error(
      "Replacement Draft base must match the latest Published version",
    );
  }

  return {
    ...schedule,
    workingDraft: replacement,
  };
}

export function discardWorkingDraft(
  schedule: ProjectSchedule,
): ProjectSchedule {
  return {
    ...schedule,
    workingDraft: null,
  };
}
