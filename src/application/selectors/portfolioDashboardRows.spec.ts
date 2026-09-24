import { describe, expect, it } from "vitest";

import {
  mdrrMilestoneDefinition,
  milestoneDefinitions,
  portfolioMilestoneDefinitions,
} from "../../config/v2/referenceData";
import type { CanonicalProjectSchedule, CanonicalPublishedScheduleMilestone } from "../../domain/schedule/officialSchedule";
import { toScheduleVersionNumber, type ScheduleVersionNumber } from "../../domain/schedule/schedule";
import { parseDateOnly, type DateOnly } from "../../domain/shared/dateOnly";
import { toMilestoneDefinitionId, toMilestoneId } from "../../domain/shared/ids";
import { canonicalProjectFixtures, devProject002, devProject003 } from "../../fixtures/v2/canonicalProjectFixtures";
import { canonicalScheduleFixtures } from "../../fixtures/v2/canonicalScheduleFixtures";
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
    workingDraft: null,
  };
}

describe("canonical Portfolio Dashboard read projection", () => {
  it("keeps Current Published Portfolio cells unchanged beside a malformed Draft", () => {
    const base = publishedSchedule(devProject002.id, [
      {
        milestoneId: toMilestoneId("portfolio-official"),
        milestoneDefinitionId: toMilestoneDefinitionId(
          "milestone-a-a2-a-g-o",
        ),
        applicability: "applicable",
        plan: null,
        actual: null,
      },
    ]);
    expect(Object.hasOwn(base, "workingDraft")).toBe(true);
    const baseline = selectedRow(
      fixtureState([devProject002], [base]),
      devProject002.id,
    );
    const malformed = {
      ...base,
      workingDraft: {
        milestones: [{
          ...base.publishedVersions[0]!.milestones[0]!,
          milestoneDefinitionId: toMilestoneDefinitionId("missing-definition"),
        }],
      },
    } as unknown as CanonicalProjectSchedule;
    const withDraft = selectedRow(
      fixtureState([devProject002], [malformed]),
      devProject002.id,
    );

    expect(withDraft.schedule).toEqual(baseline.schedule);
  });

  it("projects every Published result through the 34 Portfolio definitions and MDRR", () => {
    const rows = selectPortfolioDashboardRows(fixtureState());
    const expectedIds = [
      ...portfolioMilestoneDefinitions.map((definition) => definition.id),
      mdrrMilestoneDefinition.id,
    ];

    for (const row of rows) {
      if (row.schedule.kind !== "published") continue;
      const ids = row.schedule.cells.map((cell) => cell.milestoneDefinitionId);
      expect(ids).toHaveLength(35);
      expect(ids).toEqual(expectedIds);
      expect(new Set(ids).size).toBe(35);
      expect(ids.slice(0, 34).every((id) => milestoneDefinitions.some(
        (definition) => definition.id === id && definition.showInPortfolio,
      ))).toBe(true);
      expect(mdrrMilestoneDefinition.showInPortfolio).toBe(false);
    }
  });

  it("keeps all five canonical Projects in fixture ProjectId order and resolves their Master category and PCB number", () => {
    const rows = selectPortfolioDashboardRows(fixtureState());

    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.projectId)).toEqual(canonicalProjectFixtures.map((project) => project.id));
    expect(rows.map((row) => ({
      projectId: row.projectId,
      name: row.project.projectName,
      category: row.category,
      productLine: row.project.productLine,
      cpu: row.project.cpu,
      gpu: row.project.gpu,
    }))).toEqual([
      { projectId: "dev-project-001", name: "Manta", category: "Aspire", productLine: "Aspire (Refresh ID)", cpu: "Intel Novalake HX 28C/24C", gpu: "GN22-X2/X4" },
      { projectId: "dev-project-002", name: "Nautilus", category: "Gamepad", productLine: "Game pad", cpu: "AMD HawkPoint 1 FP8 (New PCBA)-two DIMM", gpu: "GN20-X6" },
      { projectId: "dev-project-003", name: "Orca", category: "Gaming", productLine: "Helios Neo", cpu: "Intel Novalake HX 28C/24C", gpu: "GN22-X7/X9" },
      { projectId: "dev-project-004", name: "Beluga", category: "Gaming", productLine: "Nitro Edge", cpu: "AMD HawkPoint 1 FP8 (New PCBA)-two DIMM", gpu: "GN22-X7/X9" },
      { projectId: "dev-project-005", name: "Marlin", category: "WOA", productLine: "Aspire (Refresh ID)", cpu: "nVIDIA N1", gpu: "GN22-X2/X4" },
    ]);
    expect(rows[1]).toMatchObject({ pcbNumber: "DEV-PCB-002" });
    expect(rows[2]).toMatchObject({ pcbNumber: "DEV-PCB-003" });
  });

  it("uses maximum Published version rather than final array entry in a local edge-case schedule", () => {
    const currentMilestone = {
      milestoneId: toMilestoneId("local-current-c1-go"),
      milestoneDefinitionId: toMilestoneDefinitionId("milestone-c1-c-g-o"),
      applicability: "applicable" as const,
      plan: dateOnly("2026-10-05"),
      actual: null,
    };
    const outOfOrder: CanonicalProjectSchedule = {
      projectId: devProject003.id,
      publishedVersions: [
        { versionNumber: toScheduleVersionNumber(3), versionNote: null, publishedAt: "2026-09-10T00:00:00Z", milestones: [currentMilestone] },
        { versionNumber: toScheduleVersionNumber(1), versionNote: null, publishedAt: "2026-08-25T00:00:00Z", milestones: [{ ...currentMilestone, plan: dateOnly("2026-09-30") }] },
      ],
      workingDraft: null,
    };
    const localState = fixtureState([devProject003], [outOfOrder]);
    const row = selectedRow(localState, devProject003.id);

    expect(row.schedule.kind).toBe("published");
    if (row.schedule.kind !== "published") return;
    expect(row.schedule.versionLabel).toBe("Published v03");
    expect(row.schedule.cells.find((cell) => cell.milestoneDefinitionId === toMilestoneDefinitionId("milestone-c1-c-g-o"))?.occurrences[0]?.plan).toBe("2026/10/05");
  });

  it("preserves no-Published, zero-milestone Published, and unavailable Schedule reads without hiding rows", () => {
    const noPublished: CanonicalProjectSchedule = {
      projectId: devProject002.id,
      publishedVersions: [],
      workingDraft: null,
    };
    const zeroMilestone: CanonicalProjectSchedule = {
      projectId: devProject003.id,
      publishedVersions: [{ versionNumber: toScheduleVersionNumber(1), versionNote: null, publishedAt: "2026-09-12T00:00:00Z", milestones: [] }],
      workingDraft: null,
    };
    const base = fixtureState([devProject002, devProject003], [noPublished, zeroMilestone]);
    expect(selectedRow(base, devProject002.id).schedule).toEqual({ kind: "noPublishedSchedule" });
    expect(selectedRow(base, devProject003.id).schedule).toMatchObject({ kind: "published", milestoneCount: 0 });
    const zero = selectedRow(base, devProject003.id).schedule;
    if (zero.kind === "published") expect(zero.cells.every((cell) => cell.occurrences.length === 0)).toBe(true);

    const invalid: CanonicalProjectSchedule = {
      ...noPublished,
      publishedVersions: [{
        versionNumber: 0 as ScheduleVersionNumber,
        versionNote: null,
        publishedAt: "2026-09-12T00:00:00Z",
        milestones: [],
      }],
    };
    const state = fixtureState([devProject002, devProject003], [invalid, zeroMilestone]);
    const rows = selectPortfolioDashboardRows(state);
    expect(rows).toHaveLength(2);
    expect(selectedRow(state, devProject002.id).schedule.kind).toBe("unavailable");
    expect(selectedRow(state, devProject003.id).schedule.kind).toBe("published");
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

  it("projects Published MDRR while a conflicting Working Draft and Project team cannot alter the row", () => {
    const mdrr = {
      milestoneId: toMilestoneId("portfolio-mdrr"),
      milestoneDefinitionId: toMilestoneDefinitionId("milestone-mdrr"),
      applicability: "applicable" as const,
      plan: dateOnly("2026-10-05"),
      actual: null,
    };
    const published = publishedSchedule(devProject003.id, [mdrr]);
    const withDraft: CanonicalProjectSchedule = {
      ...published,
      workingDraft: {
        milestones: [{
          ...mdrr,
          plan: dateOnly("2099-01-01"),
          actual: dateOnly("2099-01-02"),
        }],
      },
    };
    const row = selectedRow(
      fixtureState([devProject003], [published]),
      devProject003.id,
    );
    const draftRow = selectedRow(
      fixtureState([devProject003], [withDraft]),
      devProject003.id,
    );
    const changedTeamRow = selectedRow(
      fixtureState([{ ...devProject003, team: null }], [published]),
      devProject003.id,
    );

    expect(row.schedule.kind).toBe("published");
    if (row.schedule.kind !== "published") return;
    expect(row.schedule.cells.find(
      (cell) => cell.milestoneDefinitionId === mdrrMilestoneDefinition.id,
    )?.occurrences).toEqual([{
      milestoneId: mdrr.milestoneId,
      applicability: "applicable",
      plan: "2026/10/05",
      actual: "-",
    }]);
    expect(row.project.mdrr).toBe("-");
    expect(draftRow).toEqual(row);
    expect(changedTeamRow).toEqual(row);
  });

  it("does not mutate input Project, Schedule, version, or milestone arrays", () => {
    const state = fixtureState();
    const before = structuredClone(state);

    selectPortfolioDashboardRows(state);

    expect(state).toEqual(before);
  });
});
