import { describe, expect, it } from "vitest";

import {
  addDays,
  compareDateOnly,
  formatDateOnly,
  parseDateOnly,
  type DateOnly,
} from "./dateOnly";

function dateOnly(value: string): DateOnly {
  const parsed = parseDateOnly(value);

  if (parsed === null) {
    throw new Error(`Invalid test date: ${value}`);
  }

  return parsed;
}

describe("DateOnly", () => {
  it("accepts canonical real calendar dates and leap days", () => {
    expect(parseDateOnly("2026-09-02")).toBe("2026-09-02");
    expect(parseDateOnly("2024-02-29")).toBe("2024-02-29");
  });

  it.each([
    "2026-02-29",
    "2026-02-30",
    "2026-04-31",
    "2026-00-10",
    "2026-13-10",
    "2026-01-00",
    "2026-01-32",
    "0000-01-01",
    "2026-9-02",
    "26-09-02",
    "2026/09/02",
    "2026-09-02T00:00:00Z",
    " 2026-09-02 ",
  ])("rejects malformed or impossible date %s", (value) => {
    expect(parseDateOnly(value)).toBeNull();
  });

  it("compares canonical dates without locale or time semantics", () => {
    expect(
      compareDateOnly(dateOnly("2026-09-01"), dateOnly("2026-09-02")),
    ).toBe(-1);
    expect(
      compareDateOnly(dateOnly("2026-09-02"), dateOnly("2026-09-02")),
    ).toBe(0);
    expect(
      compareDateOnly(dateOnly("2027-01-01"), dateOnly("2026-12-31")),
    ).toBe(1);
  });

  it("adds calendar days across month, year, and leap-day boundaries", () => {
    expect(addDays(dateOnly("2026-01-31"), 1)).toBe("2026-02-01");
    expect(addDays(dateOnly("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDays(dateOnly("2024-02-28"), 1)).toBe("2024-02-29");
    expect(addDays(dateOnly("2024-03-01"), -1)).toBe("2024-02-29");
  });

  it("rejects a non-integer calendar-day offset", () => {
    expect(() => addDays(dateOnly("2026-09-02"), 1.5)).toThrow(
      "Day offset must be a safe integer",
    );
  });

  it("keeps date arithmetic inside the four-digit calendar range", () => {
    expect(() => addDays(dateOnly("9999-12-31"), 1)).toThrow(
      "DateOnly result is outside the supported range",
    );
  });

  it("formats dates for UI without browser locale behavior", () => {
    expect(formatDateOnly(dateOnly("2026-09-02"))).toBe("2026/09/02");
  });
});
