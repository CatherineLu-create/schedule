export type ScheduleFilterState = {
  phase: string;
  stage: string;
  milestone: string;
  planFrom: string;
  planTo: string;
  actualFrom: string;
  actualTo: string;
};

export type ScheduleFilterKey = keyof ScheduleFilterState;

export type FilterableScheduleItem = {
  id: string;
  phase: string;
  stage: string;
  milestone: string;
  plan: string;
  actual: string;
};

export type ScheduleFilterChip = {
  key: ScheduleFilterKey | "planRange" | "actualRange";
  label: string;
};

export const emptyScheduleFilters: ScheduleFilterState = {
  phase: "",
  stage: "",
  milestone: "",
  planFrom: "",
  planTo: "",
  actualFrom: "",
  actualTo: "",
};

function uniqueNonblank(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function parseDateValue(value: string) {
  const timestamp = Date.parse(value.trim());

  return Number.isNaN(timestamp) ? null : timestamp;
}

function matchesDateRange(value: string, from: string, to: string) {
  if (!from && !to) {
    return true;
  }

  const valueDate = parseDateValue(value);

  if (valueDate === null) {
    return false;
  }

  const fromDate = from ? parseDateValue(from) : null;
  const toDate = to ? parseDateValue(to) : null;

  return (fromDate === null || valueDate >= fromDate) && (toDate === null || valueDate <= toDate);
}

export function scheduleFilterOptions(rows: FilterableScheduleItem[]) {
  return {
    phase: uniqueNonblank(rows.map((row) => row.phase)),
    stage: uniqueNonblank(rows.map((row) => row.stage)),
  };
}

export function filterScheduleRows<TScheduleItem extends FilterableScheduleItem>(
  rows: TScheduleItem[],
  filters: ScheduleFilterState,
) {
  const milestoneSearch = filters.milestone.trim().toLowerCase();

  return rows.filter((row) => {
    return (
      (!filters.phase || row.phase === filters.phase) &&
      (!filters.stage || row.stage === filters.stage) &&
      (!milestoneSearch || row.milestone.toLowerCase().includes(milestoneSearch)) &&
      matchesDateRange(row.plan, filters.planFrom, filters.planTo) &&
      matchesDateRange(row.actual, filters.actualFrom, filters.actualTo)
    );
  });
}

export function updateScheduleFilter<TKey extends ScheduleFilterKey>(
  filters: ScheduleFilterState,
  key: TKey,
  value: ScheduleFilterState[TKey],
): ScheduleFilterState {
  return {
    ...filters,
    [key]: value,
  };
}

export function removeScheduleFilter(filters: ScheduleFilterState, key: ScheduleFilterKey | "planRange" | "actualRange") {
  if (key === "planRange") {
    return {
      ...filters,
      planFrom: "",
      planTo: "",
    };
  }

  if (key === "actualRange") {
    return {
      ...filters,
      actualFrom: "",
      actualTo: "",
    };
  }

  return {
    ...filters,
    [key]: emptyScheduleFilters[key],
  };
}

function rangeLabel(from: string, to: string) {
  if (from && to) {
    return `${from} to ${to}`;
  }

  return from ? `from ${from}` : `to ${to}`;
}

export function scheduleFilterChips(filters: ScheduleFilterState): ScheduleFilterChip[] {
  const chips: ScheduleFilterChip[] = [];
  const milestone = filters.milestone.trim();

  if (filters.phase) {
    chips.push({ key: "phase", label: `Phase: ${filters.phase}` });
  }

  if (filters.stage) {
    chips.push({ key: "stage", label: `Stage: ${filters.stage}` });
  }

  if (milestone) {
    chips.push({ key: "milestone", label: `Milestone: ${milestone}` });
  }

  if (filters.planFrom || filters.planTo) {
    chips.push({ key: "planRange", label: `Plan: ${rangeLabel(filters.planFrom, filters.planTo)}` });
  }

  if (filters.actualFrom || filters.actualTo) {
    chips.push({ key: "actualRange", label: `Actual Date: ${rangeLabel(filters.actualFrom, filters.actualTo)}` });
  }

  return chips;
}

export function isScheduleRowCompleteOrNotApplicable(actual: string) {
  const trimmedActual = actual.trim();
  const normalizedActual = trimmedActual.toLowerCase();

  if (!trimmedActual || normalizedActual === "tbc" || normalizedActual === "tbd") {
    return false;
  }

  if (normalizedActual === "-" || normalizedActual === "*" || normalizedActual === "na" || normalizedActual === "n/a") {
    return true;
  }

  const dateLikeMatch = trimmedActual.match(
    /\b(?:\d{4}[/-]\d{1,2}[/-]\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i,
  );

  return Boolean(dateLikeMatch && parseDateValue(dateLikeMatch[0]) !== null);
}
