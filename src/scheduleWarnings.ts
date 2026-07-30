export type ScheduleWarningKey = string;
export type ScheduleWarnings = Record<ScheduleWarningKey, true>;

export function createScheduleWarningKey(rowId: string, field: string): ScheduleWarningKey {
  return `${rowId}:${field}`;
}

export function createInitialScheduleWarnings(): ScheduleWarnings {
  return {
    [createScheduleWarningKey("schedule-row-1", "plan")]: true,
  };
}

export function hasScheduleWarning(warnings: ScheduleWarnings, rowId: string, field: string) {
  return Boolean(warnings[createScheduleWarningKey(rowId, field)]);
}

export function countScheduleWarnings(warnings: ScheduleWarnings) {
  return Object.keys(warnings).length;
}

export function resolveScheduleWarning(
  warnings: ScheduleWarnings,
  rowId: string,
  field: string,
  value: string,
): ScheduleWarnings {
  const warningKey = createScheduleWarningKey(rowId, field);

  if (!warnings[warningKey] || !value.trim()) {
    return warnings;
  }

  const { [warningKey]: _resolved, ...remainingWarnings } = warnings;

  return remainingWarnings;
}
