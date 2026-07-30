import {
  emptyScheduleFilters,
  filterScheduleRows,
  isScheduleRowCompleteOrNotApplicable,
  removeScheduleFilter,
  scheduleFilterChips,
  scheduleFilterOptions,
  updateScheduleFilter,
  type FilterableScheduleItem,
} from "./scheduleFilters";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const rows: FilterableScheduleItem[] = [
  { id: "row-a", phase: "EVT", stage: "Design", milestone: "BIOS", plan: "2026-01-15", actual: "" },
  { id: "row-b", phase: "DVT", stage: "Build", milestone: "Thermal", plan: "2026-02-10", actual: "2026-02-15" },
  { id: "row-c", phase: "EVT", stage: "Build", milestone: "BIOS Update", plan: "not a date", actual: "2026-03-05" },
  { id: "row-d", phase: "", stage: "", milestone: "Camera", plan: "", actual: "" },
];

const options = scheduleFilterOptions(rows);

assertEqual(options.phase.join(","), "EVT,DVT", "phase options are unique and skip blanks");
assertEqual(options.stage.join(","), "Design,Build", "stage options are unique and skip blanks");

const combined = filterScheduleRows(rows, {
  ...emptyScheduleFilters,
  phase: "EVT",
  stage: "Build",
  milestone: " bios ",
});

assertEqual(combined.length, 1, "filters combine with AND logic");
assertEqual(combined[0].id, "row-c", "filtered rows preserve stable row id");

const planRange = filterScheduleRows(rows, {
  ...emptyScheduleFilters,
  planFrom: "2026-02-01",
  planTo: "2026-02-28",
});

assertEqual(planRange.length, 1, "plan date range filters rows");
assertEqual(planRange[0].id, "row-b", "plan range excludes invalid and out-of-range dates");

const completed = filterScheduleRows(rows, {
  ...emptyScheduleFilters,
  actualFrom: "2026-03-01",
});

assertEqual(completed.length, 1, "actual date boundary applies");
assertEqual(completed[0].id, "row-c", "actual date range preserves matching row");

const chips = scheduleFilterChips({
  ...emptyScheduleFilters,
  phase: "EVT",
  planFrom: "2026-01-01",
  planTo: "2026-03-31",
});

assertEqual(chips.length, 2, "related date boundaries collapse into chips");
assertEqual(chips[0].label, "Phase: EVT", "phase chip is labelled");
assertEqual(chips[1].label, "Plan: 2026-01-01 to 2026-03-31", "plan chip shows date range");

const updated = updateScheduleFilter(emptyScheduleFilters, "milestone", " BIOS ");

assertEqual(updated.milestone, " BIOS ", "filter updates preserve entered search text");
assertEqual(removeScheduleFilter(updated, "milestone").milestone, "", "individual filter removal clears value");

assertEqual(isScheduleRowCompleteOrNotApplicable("2026/08/15"), true, "slash date grays row");
assertEqual(isScheduleRowCompleteOrNotApplicable("2026-08-15"), true, "dash date grays row");
assertEqual(isScheduleRowCompleteOrNotApplicable("Aug 15, 2026 done"), true, "date with notes grays row");
assertEqual(isScheduleRowCompleteOrNotApplicable(" - "), true, "dash not-applicable value grays row");
assertEqual(isScheduleRowCompleteOrNotApplicable(" * "), true, "asterisk not-applicable value grays row");
assertEqual(isScheduleRowCompleteOrNotApplicable("NA"), true, "NA grays row");
assertEqual(isScheduleRowCompleteOrNotApplicable("n/a"), true, "N/A match is case-insensitive");
assertEqual(isScheduleRowCompleteOrNotApplicable(""), false, "empty actual remains normal");
assertEqual(isScheduleRowCompleteOrNotApplicable("TBC"), false, "TBC remains normal");
assertEqual(isScheduleRowCompleteOrNotApplicable("TBD"), false, "TBD remains normal");
assertEqual(isScheduleRowCompleteOrNotApplicable("Import Warning"), false, "warning text remains normal");
assertEqual(isScheduleRowCompleteOrNotApplicable("NA pending"), false, "partial NA text does not match");
