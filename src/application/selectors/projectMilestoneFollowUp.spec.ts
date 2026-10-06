import { describe, expect, it } from "vitest";
import { createInitialMilestoneGovernanceRuntimeState } from "../governance/milestoneGovernanceInitializer";
import { selectEffectiveMilestoneGovernanceContext } from "../governance/effectiveMilestoneGovernanceContext";
import type { MilestoneGovernanceRuntimeState } from "../../domain/governance/milestoneGovernance";
import { createEmptyCanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import { toScheduleVersionNumber } from "../../domain/schedule/schedule";
import { toCanonicalScheduleWorkingDraftId, toMilestoneDefinitionId, toMilestoneId, toRequirementEnrollmentId, toRequirementWithdrawalId } from "../../domain/shared/ids";
import { devProject001, devProject002, devProject003 } from "../../fixtures/v2/canonicalProjectFixtures";
import { selectProjectMilestoneFollowUp } from "./projectMilestoneFollowUp";

const initial = createInitialMilestoneGovernanceRuntimeState();
const kickoff = toMilestoneDefinitionId("milestone-design-kickoff");
const sslgl = toMilestoneDefinitionId("milestone-ramp-fcs");
const assigned: MilestoneGovernanceRuntimeState = { ...initial, requirementEnrollments: [
  { id: toRequirementEnrollmentId("second-project"), projectId: devProject002.id, milestoneDefinitionId: kickoff, assignedByReleaseId: initial.currentReleaseId, source: "explicit-existing-project" },
  { id: toRequirementEnrollmentId("first-project-sslgl"), projectId: devProject001.id, milestoneDefinitionId: sslgl, assignedByReleaseId: initial.currentReleaseId, source: "explicit-existing-project" },
  { id: toRequirementEnrollmentId("first-project-kickoff"), projectId: devProject001.id, milestoneDefinitionId: kickoff, assignedByReleaseId: initial.currentReleaseId, source: "explicit-existing-project" },
] };
const savedTeam = devProject002.team!;
const prototype = { projects: [{ ...devProject001, team: savedTeam }, { ...devProject002, team: null }, devProject003], schedules: [devProject001, devProject002, devProject003].map(project => createEmptyCanonicalProjectSchedule(project.id)) };
function select(state = prototype, governance = assigned) {
  const context = selectEffectiveMilestoneGovernanceContext(governance);
  if (!context.ok) throw new Error(JSON.stringify(context));
  return selectProjectMilestoneFollowUp(state, governance, context.value);
}
const row = (definitionId = kickoff, applicability: "applicable" | "notApplicable" = "applicable") => ({ milestoneId: toMilestoneId("occurrence"), milestoneDefinitionId: definitionId, applicability, plan: null, actual: null });
const version = (number: number, milestones: ReturnType<typeof row>[]) => ({ versionNumber: toScheduleVersionNumber(number), versionNote: null, publishedAt: "2026-10-01T00:00:00Z", milestones });

describe("readonly grouped pending Project milestone follow-up", () => {
  it("groups exact pending IDs in canonical Project and shared definition order with human SSL/GL labels", () => {
    const before = structuredClone({ prototype, assigned });
    expect(select()).toEqual([
      { projectId: devProject001.id, projectName: "Manta", qciPmDisplay: "DEV QCI PM", pendingDefinitions: [
        { milestoneDefinitionId: kickoff, displayName: "Kickoff" }, { milestoneDefinitionId: sslgl, displayName: "SSL/GL" },
      ] },
      { projectId: devProject002.id, projectName: "Nautilus", qciPmDisplay: "Unassigned", pendingDefinitions: [{ milestoneDefinitionId: kickoff, displayName: "Kickoff" }] },
    ]);
    expect({ prototype, assigned }).toEqual(before);
  });

  it.each(["missing-team", "missing-pm", "blank-pm", "null-pm-name"])("retains pending with Unassigned for %s without falling back to another role or owner", missing => {
    const project = { ...devProject001, team: missing === "missing-team" ? null : { ...savedTeam, projectRoles: {
      ...savedTeam.projectRoles, qciPm: missing === "missing-pm" ? null : { ...savedTeam.projectRoles.qciPm!, name: missing === "null-pm-name" ? null : "  " },
    } } };
    expect(select({ ...prototype, projects: [project] })).toEqual([expect.objectContaining({ qciPmDisplay: "Unassigned", pendingDefinitions: expect.any(Array) })]);
    expect(select({ ...prototype, projects: [project] })[0].pendingDefinitions).toHaveLength(2);
  });

  it("reads the current saved Master and Team without persisting owner or completion state", () => {
    const project = { ...devProject001, master: { ...devProject001.master, basicInformation: { ...devProject001.master.basicInformation, stnProjectName: "Saved renamed Project" } },
      team: { ...savedTeam, projectRoles: { ...savedTeam.projectRoles, qciPm: { ...savedTeam.projectRoles.qciPm!, name: "Saved replacement PM" } } } };
    const state = { ...prototype, projects: [project] };
    const before = structuredClone({ state, assigned });
    expect(select(state)[0]).toMatchObject({ projectName: "Saved renamed Project", qciPmDisplay: "Saved replacement PM" });
    expect(Object.keys(select(state)[0]).sort()).toEqual(["pendingDefinitions", "projectId", "projectName", "qciPmDisplay"]);
    expect({ state, assigned }).toEqual(before);
  });

  it.each(["applicable", "notApplicable"] as const)("omits latest Published exact public %s and Projects with no pending requirements", applicability => {
    const state = { ...prototype, schedules: prototype.schedules.map(schedule => ({ ...schedule, publishedVersions: [version(1, []), version(3, [row(kickoff, applicability), { ...row(sslgl, applicability), milestoneId: toMilestoneId("sslgl") }]), version(2, [])] })) };
    expect(select(state)).toEqual([]);
  });

  it("keeps Draft-only and same-name local rows pending, and latest Published removal reopens the same group", () => {
    const local = toMilestoneDefinitionId("same-name-local");
    const definition = initial.releases[0].definitions.find(item => item.id === kickoff)!;
    const state = { ...prototype, schedules: prototype.schedules.map(schedule => ({ ...schedule,
      publishedVersions: [version(2, [row(kickoff)]), version(3, [row(local)])],
      localDefinitions: [{ ...definition, id: local, source: "manual" as const, confirmation: "confirmed" as const, evidenceIds: [] }],
      workingDraft: { workingDraftId: toCanonicalScheduleWorkingDraftId("draft"), milestones: [row(kickoff)], reviewSessionIds: [], importCandidates: [] },
    })) };
    expect(select(state).map(group => [group.projectId, group.pendingDefinitions.map(definition => definition.milestoneDefinitionId)])).toEqual([
      [devProject001.id, [kickoff, sslgl]], [devProject002.id, [kickoff]],
    ]);
  });

  it("withdrawal removes only the effective todo while history and input Schedule remain unchanged", () => {
    const governance = { ...assigned, requirementWithdrawals: assigned.requirementEnrollments.map((item, index) => ({ id: toRequirementWithdrawalId(`withdraw-${index}`), enrollmentId: item.id, withdrawnByReleaseId: assigned.currentReleaseId })) };
    const before = structuredClone({ prototype, governance });
    expect(select(prototype, governance)).toEqual([]);
    expect({ prototype, governance }).toEqual(before);
    expect(governance.requirementEnrollments).toHaveLength(3);
  });
});
