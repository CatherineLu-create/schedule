import { describe, expect, it } from "vitest";

import { selectDashboardAttention } from "../application/selectors/dashboardAttention";
import { selectPortfolioDashboardRows } from "../application/selectors/portfolioDashboardRows";
import { milestoneDefinitions } from "../config/v2/referenceData";
import { validateCanonicalProjectSchedule } from "../domain/schedule/officialSchedule";
import { parseDateOnly, type DateOnly } from "../domain/shared/dateOnly";
import {
  emptyPortfolioDashboardFilters,
  filterPortfolioDashboardRows,
} from "../portfolioDashboardFilters";
import { canonicalProjectFixtures } from "./v2/canonicalProjectFixtures";
import {
  createUserTrialDemoSeed,
  userTrialDemoProjectIds,
} from "./userTrialDemoSeed";

const REFERENCE_DATE = dateOnly("2026-09-23");

function dateOnly(value: string): DateOnly {
  const parsed = parseDateOnly(value);
  if (parsed === null) throw new Error(`Invalid test DateOnly: ${value}`);
  return parsed;
}

describe("createUserTrialDemoSeed", () => {
  it("creates only the four stable, deterministic Project and Schedule records", () => {
    const seed = createUserTrialDemoSeed(REFERENCE_DATE);

    expect(seed).toEqual(createUserTrialDemoSeed(REFERENCE_DATE));
    expect(Object.keys(seed)).toEqual(["projects", "schedules"]);
    expect(seed.projects.map(({ id }) => id)).toEqual([
      "user-trial-demo-project-go-due-soon",
      "user-trial-demo-project-smt-overdue",
      "user-trial-demo-project-mdrr-due-soon",
      "user-trial-demo-project-completed-milestone",
    ]);
    expect(seed.projects.map(({ master }) => master.basicInformation.stnProjectName)).toEqual([
      "DEMO - G/O Due Soon",
      "DEMO - SMT Overdue",
      "DEMO - MDRR Due Soon",
      "DEMO - Completed Milestone",
    ]);
    expect(seed.projects.map(({ master }) => master.basicInformation.qciModelName)).toEqual([
      "DEMO-GO-DUE-SOON",
      "DEMO-SMT-OVERDUE",
      "DEMO-MDRR-DUE-SOON",
      "DEMO-COMPLETED-MILESTONE",
    ]);
    expect(seed.projects.every(({ master }) => master.basicInformation.year === 2026)).toBe(true);
    expect(seed.projects.every(({ identityAliases }) => identityAliases.length === 0)).toBe(true);
    expect(seed.projects.every(({ team }) => team === null)).toBe(true);

    const rows = selectPortfolioDashboardRows(seed);
    expect(rows.map(({ project }) => project.customer)).toEqual([
      "DEMO",
      "DEMO",
      "DEMO",
      "DEMO",
    ]);
    expect(rows.map(({ project }) => project.productLine)).toEqual([
      "Aspire (Refresh ID)",
      "Aspire (Refresh ID)",
      "Aspire (Refresh ID)",
      "Aspire (Refresh ID)",
    ]);
    expect(seed.schedules.map(({ projectId }) => projectId)).toEqual(
      seed.projects.map(({ id }) => id),
    );
    expect(seed.schedules.every(({ publishedVersions, workingDraft }) =>
      publishedVersions.length === 1
      && publishedVersions[0]?.versionNumber === 1
      && workingDraft === null)).toBe(true);
    expect(seed.schedules.map(({ publishedVersions }) =>
      publishedVersions[0]?.milestones[0]?.milestoneId)).toEqual([
      "user-trial-demo-milestone-go-due-soon",
      "user-trial-demo-milestone-smt-overdue",
      "user-trial-demo-milestone-mdrr-due-soon",
      "user-trial-demo-milestone-completed-smt",
    ]);

    const canonicalIds = new Set(canonicalProjectFixtures.map(({ id }) => id));
    expect(seed.projects.every(({ id }) => !canonicalIds.has(id))).toBe(true);
  });

  it("builds exact fixed-date Published milestones and derives attention canonically", () => {
    const seed = createUserTrialDemoSeed(REFERENCE_DATE);

    expect(seed.schedules.map(({ projectId, publishedVersions }) => {
      const milestone = publishedVersions[0]?.milestones[0];
      return {
        projectId,
        milestoneDefinitionId: milestone?.milestoneDefinitionId,
        plan: milestone?.plan,
        actual: milestone?.actual,
      };
    })).toEqual([
      {
        projectId: "user-trial-demo-project-go-due-soon",
        milestoneDefinitionId: "milestone-a1-a-g-o",
        plan: "2026-09-28",
        actual: null,
      },
      {
        projectId: "user-trial-demo-project-smt-overdue",
        milestoneDefinitionId: "milestone-a1-a-smt",
        plan: "2026-09-16",
        actual: null,
      },
      {
        projectId: "user-trial-demo-project-mdrr-due-soon",
        milestoneDefinitionId: "milestone-mdrr",
        plan: "2026-10-03",
        actual: null,
      },
      {
        projectId: "user-trial-demo-project-completed-milestone",
        milestoneDefinitionId: "milestone-a1-a-smt",
        plan: "2026-09-20",
        actual: "2026-09-21",
      },
    ]);
    for (const schedule of seed.schedules) {
      expect(validateCanonicalProjectSchedule(schedule, milestoneDefinitions)).toEqual([]);
    }

    const attention = selectDashboardAttention(seed, REFERENCE_DATE);
    expect(attention.kind).toBe("available");
    if (attention.kind !== "available") {
      throw new Error("Expected available demo attention");
    }
    expect(attention.due.projectIds).toEqual([
      userTrialDemoProjectIds.goDueSoon,
      userTrialDemoProjectIds.mdrrDueSoon,
    ]);
    expect(attention.due.projectCount).toBe(2);
    expect(attention.overdue.projectIds).toEqual([
      userTrialDemoProjectIds.smtOverdue,
    ]);
    expect(attention.overdue.projectCount).toBe(1);
    expect(attention.due.projectIds).not.toContain(
      userTrialDemoProjectIds.completedMilestone,
    );
    expect(attention.overdue.projectIds).not.toContain(
      userTrialDemoProjectIds.completedMilestone,
    );
  });

  it("remains searchable through the normal Portfolio filter path", () => {
    const rows = selectPortfolioDashboardRows(
      createUserTrialDemoSeed(REFERENCE_DATE),
    );

    expect(filterPortfolioDashboardRows(
      rows,
      "DEMO -",
      emptyPortfolioDashboardFilters,
    ).map(({ project }) => project.projectName)).toEqual([
      "DEMO - G/O Due Soon",
      "DEMO - SMT Overdue",
      "DEMO - MDRR Due Soon",
      "DEMO - Completed Milestone",
    ]);
  });
});
