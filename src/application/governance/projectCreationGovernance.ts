import type { CommandResult, MilestoneGovernanceRuntimeState, ProjectMilestoneRequirementEnrollment } from "../../domain/governance/milestoneGovernance";
import type { Project } from "../../domain/project/project";
import type { CanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import type { RequirementEnrollmentId } from "../../domain/shared/ids";
import type { PrototypeAction } from "../state/prototypeReducer";
import type { PrototypeState } from "../state/prototypeState";
import { selectEffectiveMilestoneGovernanceContext } from "./effectiveMilestoneGovernanceContext";

export type ProjectCreationGovernanceFailureCode =
  | "project-already-exists"
  | "schedule-owner-already-exists"
  | "invalid-empty-schedule"
  | "missing-current-release"
  | "duplicate-enrollment-id"
  | "invalid-new-project-requirement";

export function prepareProjectCreationCommit(
  prototype: PrototypeState,
  governance: MilestoneGovernanceRuntimeState,
  input: { readonly project: Project; readonly schedule: CanonicalProjectSchedule },
  createEnrollmentId: () => RequirementEnrollmentId,
): CommandResult<{
  readonly prototypeAction: Extract<PrototypeAction, { readonly type: "projectAdded" }>;
  readonly governanceState: MilestoneGovernanceRuntimeState;
}, ProjectCreationGovernanceFailureCode> {
  const failure = (code: ProjectCreationGovernanceFailureCode, message: string) => ({
    ok: false as const, code, issues: [{ code: `governance.creation.${code}`, domain: "governance" as const,
      source: "data" as const, severity: "blocking" as const, message, target: { section: "projectCreation", entityId: input.project.id } }],
  });
  const { project, schedule } = input;
  if (prototype.projects.some(existing => existing.id === project.id)) {
    return failure("project-already-exists", "A Project with this Project ID already exists.");
  }
  if (schedule.projectId !== project.id || Object.hasOwn(project, "schedule")) {
    return failure("invalid-empty-schedule", "A new Project requires its own separate empty Schedule.");
  }
  if (prototype.schedules.some(existing => existing.projectId === schedule.projectId)) {
    return failure("schedule-owner-already-exists", "A Schedule with this Project ID already exists.");
  }
  if (schedule.workingDraft !== null || [schedule.publishedVersions, schedule.localDefinitions, schedule.evidenceLedger,
    schedule.reviewSessions, schedule.reviewDecisions, schedule.reviewClosures].some(records => records.length > 0)) {
    return failure("invalid-empty-schedule", "A new Project Schedule must be empty.");
  }

  const releases = governance.releases.filter(release => release.id === governance.currentReleaseId);
  if (releases.length !== 1) return failure("missing-current-release", "A valid current governance release is required to create a Project.");
  const release = releases[0];
  const requirements = release.newProjectRequirementDefinitionIds;
  if (new Set(requirements).size !== requirements.length || requirements.some(id => {
    const definitions = release.definitions.filter(definition => definition.id === id);
    return definitions.length !== 1 || !definitions[0].active || definitions[0].reviewStatus !== "reviewed"
      || !release.addableDefinitionIds.includes(id);
  })) {
    return failure("invalid-new-project-requirement", "Current new-Project requirements must reference distinct, addable public milestones.");
  }
  const context = selectEffectiveMilestoneGovernanceContext(governance);
  if (!context.ok) return failure("missing-current-release", "A valid current governance release is required to create a Project.");

  // Even dormant history and unpublished references reserve this ID namespace.
  const reserved = new Set([
    ...governance.requirementEnrollments.map(enrollment => enrollment.id),
    ...governance.requirementWithdrawals.map(withdrawal => withdrawal.enrollmentId),
    ...(governance.draft?.withdrawalEnrollmentIds ?? []),
  ]);
  const enrollments: ProjectMilestoneRequirementEnrollment[] = [];
  for (const milestoneDefinitionId of requirements) {
    const id = createEnrollmentId();
    if (!id.trim() || reserved.has(id)) {
      return failure("duplicate-enrollment-id", "Could not allocate a unique requirement ID. Please retry creating the Project.");
    }
    reserved.add(id);
    enrollments.push(Object.freeze({ id, projectId: project.id, milestoneDefinitionId,
      assignedByReleaseId: release.id, source: "new-project-at-creation" }));
  }
  return { ok: true, value: {
    prototypeAction: { type: "projectAdded", project, schedule },
    governanceState: { ...governance, requirementEnrollments: [...governance.requirementEnrollments, ...enrollments] },
  } };
}
