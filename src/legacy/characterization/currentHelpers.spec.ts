import { describe, expect, it } from "vitest";

import { resizeColumnWidth } from "../../dashboardColumns";
import { filterScheduleRows, type ScheduleFilterState } from "../../scheduleFilters";
import { normalizeImportedHeaders } from "../../teamMembers";
import { createInitialVersionHistory, publishVersion, selectVersion } from "../../versionHistory";
import { removeBlankRowsAndColumns } from "../../worksheetImport";

describe("worksheet import cleanup", () => {
  it("removes fully blank rows and columns without inventing field values", () => {
    const rows = [
      ["  ", "\u3000", ""],
      ["Name", "", "Role"],
      ["Ada", "", "PM"],
      ["\t", null, " "],
    ];

    expect(removeBlankRowsAndColumns(rows)).toEqual([
      ["Name", "Role"],
      ["Ada", "PM"],
    ]);
  });

  it("normalizes blank and duplicate worksheet headers", () => {
    expect(normalizeImportedHeaders([" Name ", "", "Name", undefined])).toEqual([
      "Name",
      "Column 2",
      "Name 2",
      "Column 4",
    ]);
  });
});

describe("schedule filtering", () => {
  it("combines compatible filters with AND logic and preserves the matching row identity", () => {
    const rows = [
      {
        id: "project-17-row-1",
        phase: "EVT",
        stage: "Build",
        milestone: "BIOS frozen",
        plan: "2026-01-31",
        actual: "2026-02-10",
      },
      {
        id: "project-17-row-2",
        phase: "EVT",
        stage: "Build",
        milestone: "BIOS frozen",
        plan: "2026-02-12",
        actual: "2026-02-18",
      },
      {
        id: "project-17-row-3",
        phase: "EVT",
        stage: "Validation",
        milestone: "BIOS frozen",
        plan: "2026-02-14",
        actual: "2026-02-20",
      },
    ];
    const sourceSnapshot = rows.map((row) => ({ ...row }));
    const filters: ScheduleFilterState = {
      phase: "EVT",
      stage: "Build",
      milestone: " bios ",
      planFrom: "2026-02-01",
      planTo: "2026-02-28",
      actualFrom: "2026-02-01",
      actualTo: "2026-02-28",
    };

    const result = filterScheduleRows(rows, filters);

    expect(result).toEqual([rows[1]]);
    expect(result[0]).toBe(rows[1]);
    expect(rows).toEqual(sourceSnapshot);
  });
});

describe("dashboard column resizing", () => {
  it.each([
    { currentWidth: 140, deltaX: 60, minWidth: 100, expected: 200 },
    { currentWidth: 140, deltaX: -80, minWidth: 100, expected: 100 },
  ])("resizes to $expected without crossing the minimum width", ({ currentWidth, deltaX, minWidth, expected }) => {
    expect(resizeColumnWidth(currentWidth, deltaX, minWidth)).toBe(expected);
  });
});

describe("generic version history", () => {
  it("appends a version without mutating the previous history", () => {
    const firstSchedule = [{ id: "project-17-row-1", plan: "Initial" }];
    const initial = createInitialVersionHistory(firstSchedule, { projectId: "project-17" });
    const secondSchedule = [{ id: "project-17-row-1", plan: "Revised" }];

    const published = publishVersion(initial, secondSchedule, { projectId: "project-17" });

    expect(initial.versions).toHaveLength(1);
    expect(initial.selectedVersion).toBe("v1");
    expect(published).not.toBe(initial);
    expect(published.versions.map((entry) => entry.version)).toEqual(["v1", "v2"]);
    expect(published.selectedVersion).toBe("v2");
    expect(published.currentSchedule).toBe(secondSchedule);
  });

  it("selects an older version without removing later versions", () => {
    const firstSchedule = [{ id: "project-17-row-1", plan: "Initial" }];
    const initial = createInitialVersionHistory(firstSchedule, { projectId: "project-17" });
    const published = publishVersion(initial, [{ id: "project-17-row-1", plan: "Revised" }], {
      projectId: "project-17",
    });

    const selected = selectVersion(published, "v1");

    expect(selected.selectedVersion).toBe("v1");
    expect(selected.currentSchedule).toBe(firstSchedule);
    expect(selected.currentMeta).toEqual({ projectId: "project-17" });
    expect(selected.versions).toBe(published.versions);
    expect(published.selectedVersion).toBe("v2");
    expect(published.versions).toHaveLength(2);
  });
});
