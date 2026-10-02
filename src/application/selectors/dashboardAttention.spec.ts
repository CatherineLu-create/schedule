import { initialScheduleCommandContext } from "../../test/governanceTestUtils";
import { confirmProjectLocalMilestoneDefinition } from "../commands/scheduleReviewCommands";
import { describe, expect, it } from "vitest";
import { initialGovernanceContext } from "../../test/governanceTestUtils";
import type { ProjectLocalMilestoneDefinition } from "../../domain/schedule/scheduleReview";
import { toMilestoneTypeId, toStageGroupId } from "../../domain/shared/ids";
import { selectPortfolioDashboardRows } from "./portfolioDashboardRows";
import { createInitialSelfServiceReferenceCatalogs } from "../reference-data/selfServiceCatalogs";
import { devProject001 } from "../../fixtures/v2/canonicalProjectFixtures";

import {
  dashboardAttentionMilestoneTypeIds,
  milestoneDefinitions,
} from "../../config/v2/referenceData";
import type { Project } from "../../domain/project/project";
import type { ProjectMaster } from "../../domain/project/projectMaster";
import type { CanonicalScheduleWorkingDraftMilestone } from "../../domain/schedule/canonicalScheduleWorkingDraft";
import {
  createEmptyCanonicalProjectSchedule,
  type CanonicalProjectSchedule,
  type CanonicalPublishedScheduleMilestone,
  type CanonicalPublishedScheduleVersion,
} from "../../domain/schedule/officialSchedule";
import { toScheduleVersionNumber } from "../../domain/schedule/schedule";
import { parseDateOnly, type DateOnly } from "../../domain/shared/dateOnly";
import {
  toCanonicalScheduleWorkingDraftId,
  toMilestoneDefinitionId,
  toMilestoneId,
  toProjectId,
  type ProjectId,
} from "../../domain/shared/ids";
import { publishScheduleWorkingDraft } from "../commands/canonicalScheduleCommands";
import type { PrototypeState } from "../state/prototypeState";
import {
  selectDashboardAttention,
  type DashboardAttentionRead,
} from "./dashboardAttention";

const REFERENCE_DATE = dateOnly("2026-09-23");
const draftIdentity = {
  workingDraftId: toCanonicalScheduleWorkingDraftId("attention-draft"),
  reviewSessionIds: [],
  importCandidates: [],
};

function dateOnly(value: string): DateOnly {
  const parsed = parseDateOnly(value);
  if (parsed === null) throw new Error(`Invalid test DateOnly: ${value}`);
  return parsed;
}

function project(id: string): Project {
  return {
    id: toProjectId(id),
    master: {
      basicInformation: { stnProjectName: id },
    } as ProjectMaster,
    identityAliases: [],
    team: null,
  };
}

function milestone(
  id: string,
  definitionId: string,
  plan: string | null,
  overrides: Partial<CanonicalPublishedScheduleMilestone> = {},
): CanonicalPublishedScheduleMilestone {
  return {
    milestoneId: toMilestoneId(id),
    milestoneDefinitionId: toMilestoneDefinitionId(definitionId),
    applicability: "applicable",
    plan: plan === null ? null : dateOnly(plan),
    actual: null,
    ...overrides,
  };
}

function draftMilestone(
  id: string,
  definitionId: string,
  plan: string | null,
  overrides: Partial<CanonicalScheduleWorkingDraftMilestone> = {},
): CanonicalScheduleWorkingDraftMilestone {
  return {
    milestoneId: toMilestoneId(id),
    milestoneDefinitionId: toMilestoneDefinitionId(definitionId),
    applicability: "applicable",
    plan: plan === null ? null : dateOnly(plan),
    actual: null,
    ...overrides,
  };
}

function version(
  versionNumber: number,
  milestones: readonly CanonicalPublishedScheduleMilestone[],
): CanonicalPublishedScheduleVersion {
  return {
    versionNumber: toScheduleVersionNumber(versionNumber),
    versionNote: null,
    publishedAt: `published-v${String(versionNumber)}`,
    milestones,
  };
}

function schedule(
  projectId: ProjectId,
  milestones: readonly CanonicalPublishedScheduleMilestone[] = [],
  workingDraft: CanonicalProjectSchedule["workingDraft"] = null,
): CanonicalProjectSchedule {
  return {
    ...createEmptyCanonicalProjectSchedule(projectId),
    projectId,
    publishedVersions: [version(1, milestones)],
    workingDraft,
  };
}

function state(
  projects: readonly Project[],
  schedules: readonly CanonicalProjectSchedule[],
): PrototypeState {
  return { projects, schedules };
}

function expectAvailable(
  read: DashboardAttentionRead,
): Extract<DashboardAttentionRead, { readonly kind: "available" }> {
  expect(read.kind).toBe("available");
  if (read.kind !== "available") {
    throw new Error("Expected available Dashboard attention");
  }
  return read;
}

describe("Attention from real local confirmation and Publish", () => {
  const governance = initialGovernanceContext();
  function confirmed(owner: Project, type: string) {
    const result = confirmProjectLocalMilestoneDefinition(createEmptyCanonicalProjectSchedule(owner.id), {
      definitionId: toMilestoneDefinitionId(`confirmed-local-${type}`), name: `Local ${type}`,
      stageGroupId: toStageGroupId("stage-a1"), milestoneTypeId: toMilestoneTypeId(type), source: "manual", evidenceIds: [],
    }, governance);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result));
    return result.value;
  }
  function published(item: CanonicalProjectSchedule, milestones: readonly CanonicalScheduleWorkingDraftMilestone[]) {
    // Canonical test setup supplies occurrences; public-only Normal Add is deliberately unchanged.
    const result = publishScheduleWorkingDraft({ ...item, workingDraft: { ...draftIdentity, milestones } },
      { publishedAt: "2026-09-23T00:00:00Z" }, { governance, localDefinitions: item.localDefinitions, retiredDraftOccurrenceGrants: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result));
    return result.schedule;
  }

  it.each(["type-g-o", "type-smt", "type-close", "type-mdrr"])("real_command_created_local_automatic_type_resolves_in_current_published_attention: %s", type => {
    const owner = project(`confirmed-attention-${type}`);
    const registered = confirmed(owner, type);
    const definitionId = registered.localDefinitions[0].id;
    const first = published(registered, [draftMilestone("old-due", definitionId, "2026-09-23")]);
    const current = published(first, [draftMilestone("today", definitionId, "2026-09-23")]);
    const read = expectAvailable(selectDashboardAttention(state([owner], [current]), REFERENCE_DATE, governance));
    expect(read.due.projectIds).toEqual([owner.id]);
    expect(read.due.projectCount).toBe(1);
    expect(read.due.matches.map(match => [match.milestoneId, match.milestoneDefinitionId, match.milestoneName, match.plan])).toEqual([
      ["today", definitionId, `Local ${type}`, "2026-09-23"],
    ]);
    expect(read.overdue.matches).toEqual([]);
    expect(current.publishedVersions[0]).toBe(first.publishedVersions[0]);
    const portfolio = selectPortfolioDashboardRows(state([{ ...devProject001, id: owner.id }], [current]), createInitialSelfServiceReferenceCatalogs(), governance);
    expect(portfolio[0].schedule.kind).toBe("published");
    if (portfolio[0].schedule.kind !== "published") throw new Error("Expected Published portfolio");
    expect(portfolio[0].schedule.cells.map(cell => cell.milestoneDefinitionId)).toEqual(governance.portfolioColumnDefinitions.map(definition => definition.id));
    expect(portfolio[0].schedule.cells.some(cell => cell.milestoneDefinitionId === definitionId)).toBe(false);
  });

  it.each(["type-g-o", "type-smt", "type-close", "type-mdrr"])("historical_local_repeats_preserve_date_boundaries_NA_missing_plan_and_project_deduplication: %s", type => {
    const owner = project(`historical-attention-${type}`);
    const registered = confirmed(owner, type);
    const definitionId = registered.localDefinitions[0].id;
    // Historical input remains readable; these repeated/unfinished rows are not a new Publish success fixture.
    const current = { ...registered, publishedVersions: [version(1, [
      draftMilestone("today", definitionId, "2026-09-23"),
      draftMilestone("plus-14", definitionId, "2026-10-07"),
      draftMilestone("plus-15", definitionId, "2026-10-08"),
      draftMilestone("overdue", definitionId, "2026-09-22"),
      draftMilestone("complete", definitionId, "2026-09-22", { actual: dateOnly("2026-09-23") }),
      draftMilestone("not-applicable", definitionId, "2026-09-23", { applicability: "notApplicable" }),
      draftMilestone("no-plan", definitionId, null),
    ])] };
    const before = structuredClone(current);
    const read = expectAvailable(selectDashboardAttention(state([owner], [current]), REFERENCE_DATE, governance));
    expect(read.due.projectIds).toEqual([owner.id]);
    expect(read.due.projectCount).toBe(1);
    expect(read.due.matches.map(match => [match.milestoneId, match.milestoneDefinitionId, match.milestoneName, match.plan])).toEqual([
      ["today", definitionId, `Local ${type}`, "2026-09-23"],
      ["plus-14", definitionId, `Local ${type}`, "2026-10-07"],
    ]);
    expect(read.overdue.projectIds).toEqual([owner.id]);
    expect(read.overdue.matches.map(match => match.milestoneId)).toEqual(["overdue"]);
    expect(current).toEqual(before);
  });

  it("real_command_created_local_draft_only_occurrence_is_not_attention", () => {
    const owner = project("local-draft-only");
    const registered = confirmed(owner, "type-close");
    const draft = { ...registered, workingDraft: { ...draftIdentity, milestones: [draftMilestone("draft-due", registered.localDefinitions[0].id, "2026-09-23")] } };
    const read = expectAvailable(selectDashboardAttention(state([owner], [draft]), REFERENCE_DATE, governance));
    expect(read.due).toEqual({ projectIds: [], projectCount: 0, matches: [] });
    expect(read.overdue).toEqual({ projectIds: [], projectCount: 0, matches: [] });
  });

  it("real_command_created_local_test_type_is_not_automatic_attention", () => {
    const owner = project("local-test-only");
    const registered = confirmed(owner, "type-test");
    const current = published(registered, [draftMilestone("local-test", registered.localDefinitions[0].id, "2026-09-23")]);
    const read = expectAvailable(selectDashboardAttention(state([owner], [current]), REFERENCE_DATE, governance));
    expect(read.due.matches).toEqual([]);
    expect(read.overdue.matches).toEqual([]);
    expect(governance.additionalAttentionDefinitionIds.has(registered.localDefinitions[0].id)).toBe(false);
  });

  it("another_project_local_registry_cannot_resolve_attention_occurrence", () => {
    const owner = project("confirmed-local-source");
    const foreign = project("confirmed-local-foreign");
    const registered = confirmed(owner, "type-smt");
    const current = published(registered, [draftMilestone("local-smt", registered.localDefinitions[0].id, "2026-09-23")]);
    const other = { ...createEmptyCanonicalProjectSchedule(foreign.id), publishedVersions: current.publishedVersions };
    const read = selectDashboardAttention(state([owner, foreign], [registered, other]), REFERENCE_DATE, governance);
    expect(read).toMatchObject({ kind: "unavailable", issues: [expect.objectContaining({ code: "schedule.integrity.unresolved-milestone-definition" })] });
    expect("due" in read).toBe(false);
    expect(other.localDefinitions).toEqual([]);
  });
});

describe("selectDashboardAttention", () => {
  it.each(["type-g-o", "type-smt", "type-close", "type-mdrr"])("resolves Published same-Project local %s by exact identity", (type) => {
    const owner = project("local-owner");
    const local: ProjectLocalMilestoneDefinition = { id: toMilestoneDefinitionId("local-exact"), name: "Local concrete name", stageGroupId: toStageGroupId("stage-a1"), milestoneTypeId: toMilestoneTypeId(type), displayOrder: 1, source: "manual", confirmation: "confirmed", evidenceIds: [] };
    const item = { ...schedule(owner.id, [milestone("local-row", local.id, "2026-09-23")]), localDefinitions: [local] };
    const read = selectDashboardAttention(state([owner], [item]), REFERENCE_DATE, initialGovernanceContext());
    expect(read).toMatchObject({ kind: "available", due: { projectCount: 1, matches: [{ milestoneId: "local-row", milestoneDefinitionId: "local-exact", milestoneName: "Local concrete name" }] } });
    expect(selectDashboardAttention(state([owner], [{ ...item, publishedVersions: [], workingDraft: { ...draftIdentity, milestones: item.publishedVersions[0].milestones } }]), REFERENCE_DATE, initialGovernanceContext())).toMatchObject({ kind: "available", due: { projectCount: 0 } });
    expect(selectDashboardAttention(state([owner], [{ ...item, localDefinitions: [{ ...local, milestoneTypeId: toMilestoneTypeId("type-test") }] }]), REFERENCE_DATE, initialGovernanceContext())).toMatchObject({ kind: "available", due: { projectCount: 0 } });
    const portfolio = selectPortfolioDashboardRows(state([{ ...devProject001, id: owner.id }], [{ ...item, localDefinitions: [{ ...local, milestoneTypeId: toMilestoneTypeId("type-test") }] }]), createInitialSelfServiceReferenceCatalogs(), initialGovernanceContext());
    expect(portfolio[0].schedule.kind).toBe("published");
    if (portfolio[0].schedule.kind !== "published") throw new Error("Expected local Published projection");
    expect(portfolio[0].schedule.cells).toHaveLength(30);
    expect(portfolio[0].schedule.cells.some(cell => cell.milestoneDefinitionId === local.id)).toBe(false);
    for (const invalid of [
      { ...local, id: toMilestoneDefinitionId("same-name-wrong-id") },
      { ...local, stageGroupId: toStageGroupId("unknown-stage") },
      { ...local, milestoneTypeId: toMilestoneTypeId("unknown-type") },
    ]) expect(selectDashboardAttention(state([owner], [{ ...item, localDefinitions: [invalid] }]), REFERENCE_DATE, initialGovernanceContext()).kind).toBe("unavailable");
    const other = project("other-owner");
    expect(selectDashboardAttention(state([owner, other], [{ ...item, localDefinitions: [] }, { ...schedule(other.id), localDefinitions: [local] }]), REFERENCE_DATE, initialGovernanceContext()).kind).toBe("unavailable");
  });
  it("classifies both inclusive Due boundaries, excludes +15, and classifies past Plan as Overdue", () => {
    const owner = project("attention-boundaries");
    const read = expectAvailable(selectDashboardAttention(state([owner], [
      schedule(owner.id, [
        milestone("due-start", "milestone-a1-a-g-o", "2026-09-23"),
        milestone("due-end", "milestone-a1-a-smt", "2026-10-07"),
        milestone("outside", "milestone-a-a2-a-close", "2026-10-08"),
        milestone("overdue", "milestone-mdrr", "2026-09-22"),
      ]),
    ]), REFERENCE_DATE, initialGovernanceContext()));

    expect(read.referenceDate).toBe("2026-09-23");
    expect(read.due.matches.map(({ milestoneId }) => milestoneId)).toEqual([
      "due-start",
      "due-end",
    ]);
    expect(read.overdue.matches.map(({ milestoneId }) => milestoneId)).toEqual([
      "overdue",
    ]);
  });

  it("excludes completed, missing-Plan, Not Applicable, and non-participating milestones", () => {
    const owner = project("attention-exclusions");
    const read = expectAvailable(selectDashboardAttention(state([owner], [
      schedule(owner.id, [
        milestone("completed", "milestone-a1-a-g-o", "2026-09-22", {
          actual: dateOnly("2026-09-23"),
        }),
        milestone("missing-plan", "milestone-a1-a-smt", null),
        milestone("not-applicable", "milestone-a1-a-close", "2026-09-24", {
          applicability: "notApplicable",
        }),
        milestone("non-participating", "milestone-a1-a-test", "2026-09-24"),
        milestone("system-build", "milestone-c1-c-main-build", "2026-09-25"),
        milestone("ramp-main-build", "milestone-ramp-main-build", "2026-09-26"),
      ]),
    ]), REFERENCE_DATE, initialGovernanceContext()));

    expect(read.due).toMatchObject({ projectIds: [], projectCount: 0, matches: [] });
    expect(read.overdue).toMatchObject({ projectIds: [], projectCount: 0, matches: [] });
  });

  it("uses the exact four stable Milestone Type IDs including hidden MDRR", () => {
    expect(dashboardAttentionMilestoneTypeIds).toEqual([
      "type-g-o",
      "type-smt",
      "type-close",
      "type-mdrr",
    ]);
    const owner = project("attention-types");
    const read = expectAvailable(selectDashboardAttention(state([owner], [
      schedule(owner.id, [
        milestone("go", "milestone-a1-a-g-o", "2026-09-24"),
        milestone("smt", "milestone-a1-a-smt", "2026-09-25"),
        milestone("close", "milestone-a1-a-close", "2026-09-26"),
        milestone("ramp-go", "milestone-ramp-g-o", "2026-09-26"),
        milestone("ramp-smt", "milestone-ramp-smt", "2026-09-26"),
        milestone("mdrr", "milestone-mdrr", "2026-09-27"),
      ]),
    ]), REFERENCE_DATE, initialGovernanceContext()));

    expect(read.due.matches.map(({ milestoneId }) => milestoneId)).toEqual([
      "go",
      "smt",
      "close",
      "ramp-go",
      "ramp-smt",
      "mdrr",
    ]);
    expect(read.due.projectCount).toBe(1);
  });

  it("deduplicates Project IDs while retaining all matches in Project and Published snapshot order", () => {
    const first = project("attention-first");
    const second = project("attention-second");
    const read = expectAvailable(selectDashboardAttention(state(
      [second, first],
      [
        schedule(first.id, [
          milestone("first-mdrr", "milestone-mdrr", "2026-09-27"),
        ]),
        schedule(second.id, [
          milestone("second-smt", "milestone-a1-a-smt", "2026-09-25"),
          milestone("second-go", "milestone-a1-a-g-o", "2026-09-24"),
        ]),
      ],
    ), REFERENCE_DATE, initialGovernanceContext()));

    expect(read.due.projectIds).toEqual([second.id, first.id]);
    expect(read.due.projectCount).toBe(2);
    expect(read.due.matches.map(({ milestoneId }) => milestoneId)).toEqual([
      "second-smt",
      "second-go",
      "first-mdrr",
    ]);
  });

  it("allows one Project to contribute once to both Due and Overdue", () => {
    const owner = project("attention-both");
    const read = expectAvailable(selectDashboardAttention(state([owner], [
      schedule(owner.id, [
        milestone("due", "milestone-mdrr", "2026-10-03"),
        milestone("overdue", "milestone-a1-a-smt", "2026-09-16"),
      ]),
    ]), REFERENCE_DATE, initialGovernanceContext()));

    expect(read.due.projectIds).toEqual([owner.id]);
    expect(read.due.projectCount).toBe(1);
    expect(read.overdue.projectIds).toEqual([owner.id]);
    expect(read.overdue.projectCount).toBe(1);
  });

  it("uses maximum Published version number rather than array position", () => {
    const owner = project("attention-current-published");
    const ownerSchedule: CanonicalProjectSchedule = {
      ...createEmptyCanonicalProjectSchedule(owner.id),
      projectId: owner.id,
      publishedVersions: [
        version(3, [milestone("current", "milestone-a1-a-g-o", "2026-09-28")]),
        version(1, [milestone("old", "milestone-a1-a-smt", "2026-09-16")]),
      ],
      workingDraft: null,
    };

    const read = expectAvailable(selectDashboardAttention(
      state([owner], [ownerSchedule]),
      REFERENCE_DATE,
     initialGovernanceContext()));
    expect(read.due.matches.map(({ milestoneId }) => milestoneId)).toEqual(["current"]);
    expect(read.overdue.matches).toEqual([]);
  });

  it("ignores Working Draft changes in both qualification directions", () => {
    const draftWouldQualify = project("draft-would-qualify");
    const draftWouldHide = project("draft-would-hide");
    const read = expectAvailable(selectDashboardAttention(state(
      [draftWouldQualify, draftWouldHide],
      [
        schedule(
          draftWouldQualify.id,
          [milestone("published-outside", "milestone-a1-a-g-o", "2026-10-08")],
          { ...draftIdentity, milestones: [draftMilestone("published-outside", "milestone-a1-a-g-o", "2026-09-28")] },
        ),
        schedule(
          draftWouldHide.id,
          [milestone("published-due", "milestone-a1-a-smt", "2026-09-28")],
          { ...draftIdentity, milestones: [draftMilestone("published-due", "milestone-a1-a-smt", "2026-10-08")] },
        ),
      ],
    ), REFERENCE_DATE, initialGovernanceContext()));

    expect(read.due.projectIds).toEqual([draftWouldHide.id]);
    expect(read.due.matches.map(({ milestoneId }) => milestoneId)).toEqual([
      "published-due",
    ]);
  });

  it("uses the newly Current Published version after successful Publish", () => {
    const owner = project("attention-publish");
    const before = schedule(
      owner.id,
      [milestone("publish-target", "milestone-a1-a-g-o", "2026-10-08")],
      { ...draftIdentity, milestones: [draftMilestone("publish-target", "milestone-a1-a-g-o", "2026-09-28")] },
    );
    expect(expectAvailable(selectDashboardAttention(
      state([owner], [before]),
      REFERENCE_DATE,
     initialGovernanceContext())).due.projectCount).toBe(0);

    const published = publishScheduleWorkingDraft(
      before,
      { publishedAt: "2026-09-23T00:00:00Z" },
      initialScheduleCommandContext(),
    );
    expect(published.ok).toBe(true);
    if (!published.ok) throw new Error("Expected Publish to succeed");

    const afterRead = expectAvailable(selectDashboardAttention(
      state([owner], [published.schedule]),
      REFERENCE_DATE,
     initialGovernanceContext()));
    expect(afterRead.due.projectIds).toEqual([owner.id]);
    expect(afterRead.due.matches.map(({ plan }) => plan)).toEqual(["2026-09-28"]);
  });

  it("treats no-Published and empty-Published Schedules as available zero contribution", () => {
    const noPublished = project("attention-no-published");
    const emptyPublished = project("attention-empty-published");
    const read = expectAvailable(selectDashboardAttention(state(
      [noPublished, emptyPublished],
      [
        createEmptyCanonicalProjectSchedule(noPublished.id),
        schedule(emptyPublished.id),
      ],
    ), REFERENCE_DATE, initialGovernanceContext()));

    expect(read.due).toEqual({ projectIds: [], projectCount: 0, matches: [] });
    expect(read.overdue).toEqual({ projectIds: [], projectCount: 0, matches: [] });
  });

  it.each([
    {
      name: "missing Schedule ownership",
      badSchedules: (badOwner: Project): readonly CanonicalProjectSchedule[] => [],
      code: "schedule.integrity.missing-schedule",
    },
    {
      name: "duplicate Schedule ownership",
      badSchedules: (badOwner: Project): readonly CanonicalProjectSchedule[] => [
        schedule(badOwner.id),
        schedule(badOwner.id),
      ],
      code: "schedule.integrity.duplicate-schedule",
    },
    {
      name: "malformed Published definition",
      badSchedules: (badOwner: Project): readonly CanonicalProjectSchedule[] => [
        schedule(badOwner.id, [
          milestone("malformed", "missing-definition", "2026-09-28"),
        ]),
      ],
      code: "schedule.integrity.unresolved-milestone-definition",
    },
  ])("returns unavailable instead of a partial count for $name", ({ badSchedules, code }) => {
    const healthy = project("attention-healthy");
    const bad = project(`attention-bad-${code}`);
    const read = selectDashboardAttention(state(
      [healthy, bad],
      [
        schedule(healthy.id, [
          milestone("healthy-due", "milestone-a1-a-g-o", "2026-09-28"),
        ]),
        ...badSchedules(bad),
      ],
    ), REFERENCE_DATE, initialGovernanceContext());

    expect(read.kind).toBe("unavailable");
    if (read.kind !== "unavailable") {
      throw new Error("Expected unavailable Dashboard attention");
    }
    expect(read.referenceDate).toBe(REFERENCE_DATE);
    expect(read.issues.map((issue) => issue.code)).toContain(code);
    expect("due" in read).toBe(false);
    expect("overdue" in read).toBe(false);
  });

  it("retains issues from every unavailable Project read without exposing partial counts", () => {
    const healthy = project("attention-healthy-multiple-unavailable");
    const missing = project("attention-missing");
    const duplicate = project("attention-duplicate");
    const read = selectDashboardAttention(state(
      [healthy, missing, duplicate],
      [
        schedule(healthy.id, [
          milestone("healthy-due", "milestone-a1-a-g-o", "2026-09-28"),
        ]),
        schedule(duplicate.id),
        schedule(duplicate.id),
      ],
    ), REFERENCE_DATE, initialGovernanceContext());

    expect(read.kind).toBe("unavailable");
    if (read.kind !== "unavailable") {
      throw new Error("Expected unavailable Dashboard attention");
    }
    expect(read.issues.map(({ code, target }) => [code, target.entityId])).toEqual([
      ["schedule.integrity.missing-schedule", missing.id],
      ["schedule.integrity.duplicate-schedule", duplicate.id],
    ]);
    expect("due" in read).toBe(false);
    expect("overdue" in read).toBe(false);
  });
});
