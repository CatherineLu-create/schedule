import { describe, expect, it } from "vitest";

import { milestoneDefinitions, portfolioMilestoneDefinitions } from "../../config/v2/referenceData";
import type { CanonicalProjectSchedule, CanonicalPublishedScheduleMilestone } from "../../domain/schedule/officialSchedule";
import { toScheduleVersionNumber, type ScheduleVersionNumber } from "../../domain/schedule/schedule";
import { parseDateOnly, type DateOnly } from "../../domain/shared/dateOnly";
import { toMilestoneDefinitionId, toMilestoneId } from "../../domain/shared/ids";
import { canonicalProjectFixtures, devProject002, devProject003 } from "../../fixtures/v2/canonicalProjectFixtures";
import { canonicalScheduleFixtures, devSchedule003 } from "../../fixtures/v2/canonicalScheduleFixtures";
import type { PrototypeState } from "../state/prototypeState";
import { selectPortfolioDashboardRows } from "./portfolioDashboardRows";

function dateOnly(value: string): DateOnly {
  const parsed = parseDateOnly(value);
  if (parsed === null) throw new Error(`Invalid test DateOnly: ${value}`);
  return parsed;
}

function fixtureState(
  projects = canonicalProjectFixtures,
  schedules = canonicalScheduleFixtures,
): PrototypeState {
  return { projects, schedules };
}

function selectedRow(state: PrototypeState, projectId: string) {
  const row = selectPortfolioDashboardRows(state).find(
    (candidate) => candidate.projectId === projectId,
  );
  if (row === undefined) throw new Error(`Missing projected row ${projectId}`);
  return row;
}

function publishedSchedule(
  projectId: typeof devProject002.id,
  milestones: readonly CanonicalPublishedScheduleMilestone[],
): CanonicalProjectSchedule {
  return {
    projectId,
    publishedVersions: [{
      versionNumber: toScheduleVersionNumber(1),
      versionNote: null,
      publishedAt: "2026-09-12T00:00:00Z",
      milestones,
    }],
  };
}

describe("canonical Portfolio Dashboard read projection", () => {
  it("projects every published result through the 34 ordered unique portfolio definitions", () => {
    const rows = selectPortfolioDashboardRows(fixtureState());
    const expectedIds = portfolioMilestoneDefinitions.map((definition) => definition.id);

    for (const row of rows) {
      if (row.schedule.kind !== "published") continue;
      const ids = row.schedule.cells.map((cell) => cell.milestoneDefinitionId);
      expect(ids).toHaveLength(34);
      expect(ids).toEqual(expectedIds);
      expect(new Set(ids).size).toBe(34);
      expect(ids.every((id) => milestoneDefinitions.some((definition) => definition.id === id && definition.showInPortfolio))).toBe(true);
    }
  });

  it("keeps all five canonical Projects in fixture ProjectId order and resolves their Master category and PCB number", () => {
    const rows = selectPortfolioDashboardRows(fixtureState());

    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.projectId)).toEqual(canonicalProjectFixtures.map((project) => project.id));
    expect(rows[1]).toMatchObject({ category: "DEV Notebook", pcbNumber: "DEV-PCB-002" });
    expect(rows[2]).toMatchObject({ category: "DEV Creator", pcbNumber: "DEV-PCB-003" });
  });

  it("uses maximum Published version rather than final array entry for devSchedule003", () => {
    const row = selectedRow(fixtureState(), devSchedule003.projectId);

    expect(row.schedule.kind).toBe("published");
    if (row.schedule.kind !== "published") return;
    expect(row.schedule.versionLabel).toBe("Published v03");
    expect(row.schedule.cells.find((cell) => cell.milestoneDefinitionId === toMilestoneDefinitionId("milestone-c1-c-g-o"))?.occurrences[0]?.plan).toBe("2026/10/05");
  });

  it("preserves no-Published, zero-milestone Published, and unavailable Schedule reads without hiding rows", () => {
    const base = fixtureState();
    expect(selectedRow(base, "dev-project-001").schedule).toEqual({ kind: "noPublishedSchedule" });
    expect(selectedRow(base, "dev-project-004").schedule).toMatchObject({ kind: "published", milestoneCount: 0 });
    const zero = selectedRow(base, "dev-project-004").schedule;
    if (zero.kind === "published") expect(zero.cells.every((cell) => cell.occurrences.length === 0)).toBe(true);

    const invalid: CanonicalProjectSchedule = {
      ...canonicalScheduleFixtures[1]!,
      publishedVersions: [{
        ...canonicalScheduleFixtures[1]!.publishedVersions[0]!,
        versionNumber: 0 as ScheduleVersionNumber,
      }],
    };
    const state = fixtureState(canonicalProjectFixtures, [
      canonicalScheduleFixtures[0]!, invalid, canonicalScheduleFixtures[2]!, canonicalScheduleFixtures[3]!, canonicalScheduleFixtures[4]!,
    ]);
    const rows = selectPortfolioDashboardRows(state);
    expect(rows).toHaveLength(5);
    expect(selectedRow(state, "dev-project-002").schedule.kind).toBe("unavailable");
    expect(selectedRow(state, "dev-project-003").schedule.kind).toBe("published");
  });

  it("preserves repeated same-definition snapshot occurrences in order and retains notApplicable dated values", () => {
    const first = {
      milestoneId: toMilestoneId("portfolio-repeat-1"),
      milestoneDefinitionId: toMilestoneDefinitionId("milestone-design-kickoff"),
      applicability: "notApplicable" as const,
      plan: dateOnly("2026-10-05"),
      actual: dateOnly("2026-10-06"),
    };
    const second = { ...first, milestoneId: toMilestoneId("portfolio-repeat-2"), plan: dateOnly("2026-10-07") };
    const state = fixtureState([devProject002], [publishedSchedule(devProject002.id, [first, second])]);
    const schedule = selectedRow(state, devProject002.id).schedule;

    expect(schedule.kind).toBe("published");
    if (schedule.kind !== "published") return;
    const occurrences = schedule.cells[0]!.occurrences;
    expect(occurrences).toEqual([
      { milestoneId: first.milestoneId, applicability: "notApplicable", plan: "2026/10/05", actual: "2026/10/06" },
      { milestoneId: second.milestoneId, applicability: "notApplicable", plan: "2026/10/07", actual: "2026/10/06" },
    ]);
  });

  it("rejects label-based matching: a C2 C G/O occurrence must not populate the same-named C1 C G/O cell", () => {
    // Mutation caught: replacing exact milestoneDefinitionId matching with definition-label matching.
    const c2Go = {
      milestoneId: toMilestoneId("portfolio-c2-go-only"),
      milestoneDefinitionId: toMilestoneDefinitionId("milestone-c2-c-g-o"),
      applicability: "applicable" as const,
      plan: dateOnly("2026-10-20"),
      actual: null,
    };
    const state = fixtureState([devProject002], [publishedSchedule(devProject002.id, [c2Go])]);
    const schedule = selectedRow(state, devProject002.id).schedule;

    expect(schedule.kind).toBe("published");
    if (schedule.kind !== "published") return;
    expect(schedule.cells.find((cell) => cell.milestoneDefinitionId === toMilestoneDefinitionId("milestone-c1-c-g-o"))?.occurrences).toEqual([]);
    expect(schedule.cells.find((cell) => cell.milestoneDefinitionId === toMilestoneDefinitionId("milestone-c2-c-g-o"))?.occurrences).toEqual([
      {
        milestoneId: c2Go.milestoneId,
        applicability: "applicable",
        plan: "2026/10/20",
        actual: "-",
      },
    ]);
  });

  it("excludes MDRR and keeps the inherited Dashboard MDRR placeholder while Project team changes cannot alter a row", () => {
    const mdrr = {
      milestoneId: toMilestoneId("portfolio-mdrr"),
      milestoneDefinitionId: toMilestoneDefinitionId("milestone-mdrr"),
      applicability: "applicable" as const,
      plan: dateOnly("2026-10-05"),
      actual: null,
    };
    const state = fixtureState([devProject003], [publishedSchedule(devProject003.id, [mdrr])]);
    const changedTeamState = fixtureState([{ ...devProject003, team: null }], [publishedSchedule(devProject003.id, [mdrr])]);
    const row = selectedRow(state, devProject003.id);

    expect(row.schedule.kind).toBe("published");
    if (row.schedule.kind === "published") expect(row.schedule.cells.some((cell) => cell.milestoneDefinitionId === toMilestoneDefinitionId("milestone-mdrr"))).toBe(false);
    expect(row.project.mdrr).toBe("-");
    expect(selectedRow(changedTeamState, devProject003.id)).toEqual(row);
  });

  it("does not mutate input Project, Schedule, version, or milestone arrays", () => {
    const state = fixtureState();
    const before = structuredClone(state);

    selectPortfolioDashboardRows(state);

    expect(state).toEqual(before);
  });
});
