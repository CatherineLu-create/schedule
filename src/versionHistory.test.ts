import { createInitialVersionHistory, publishVersion, selectVersion } from "./versionHistory";

type ScheduleItem = {
  phase: string;
  stage: string;
  milestone: string;
  plan: string;
  actual: string;
};

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const v1Schedule: ScheduleItem[] = [
  { phase: "Phase 1", stage: "EVT", milestone: "MDRR", plan: "Original plan", actual: "-" },
];
const v2Schedule: ScheduleItem[] = [
  { phase: "Phase 1", stage: "DVT", milestone: "MDRR", plan: "Updated plan", actual: "Done" },
];

const initial = createInitialVersionHistory(v1Schedule);
const published = publishVersion(initial, v2Schedule);

assertEqual(published.versions.length, 2, "publish creates a new version");
assertEqual(published.selectedVersion, "v2", "latest published version is selected by default");
assertEqual(published.currentSchedule[0].plan, "Updated plan", "latest version displays latest schedule");

const older = selectVersion(published, "v1");

assertEqual(older.selectedVersion, "v1", "previous version can be selected");
assertEqual(older.currentSchedule[0].plan, "Original plan", "previous version displays its own schedule");
assertEqual(older.versions.length, 2, "selecting older version does not remove latest version");

const backToLatest = selectVersion(older, "v2");

assertEqual(backToLatest.currentSchedule[0].plan, "Updated plan", "latest version remains selectable");

const invalidSelection = selectVersion(backToLatest, "missing");

assertEqual(invalidSelection.selectedVersion, "v2", "invalid version selection does not overwrite state");

const initialWarningMeta: { warnings: Record<string, true> } = { warnings: { "0:plan": true } };
const initialWithMeta = createInitialVersionHistory(v1Schedule, initialWarningMeta);
const publishedWithMeta = publishVersion(initialWithMeta, v2Schedule, { warnings: {} });
const olderWithMeta = selectVersion(publishedWithMeta, "v1");

assertEqual(
  (olderWithMeta.currentMeta as { warnings: Record<string, true> }).warnings["0:plan"],
  true,
  "older version keeps warning metadata",
);

const latestWithMeta = selectVersion(olderWithMeta, "v2");

assertEqual(
  Object.keys((latestWithMeta.currentMeta as { warnings: Record<string, true> }).warnings).length,
  0,
  "latest corrected version has no warning metadata",
);
