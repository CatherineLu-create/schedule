import {
  countScheduleWarnings,
  createInitialScheduleWarnings,
  hasScheduleWarning,
  resolveScheduleWarning,
} from "./scheduleWarnings";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const warnings = createInitialScheduleWarnings();

assertEqual(hasScheduleWarning(warnings, "schedule-row-1", "plan"), true, "initial warning is visible");
assertEqual(countScheduleWarnings(warnings), 1, "initial warning blocks publish");

const unresolved = resolveScheduleWarning(warnings, "schedule-row-1", "plan", " ");

assertEqual(hasScheduleWarning(unresolved, "schedule-row-1", "plan"), true, "blank value keeps warning");

const resolved = resolveScheduleWarning(warnings, "schedule-row-1", "plan", "Corrected plan");

assertEqual(hasScheduleWarning(resolved, "schedule-row-1", "plan"), false, "valid value resolves warning");
assertEqual(countScheduleWarnings(resolved), 0, "resolved warning no longer blocks publish");
