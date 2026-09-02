declare const dateOnlyBrand: unique symbol;

export type DateOnly = string & { readonly [dateOnlyBrand]: "DateOnly" };

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const monthLengths = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return monthLengths[month - 1] ?? 0;
}

export function parseDateOnly(value: string): DateOnly | null {
  const match = DATE_ONLY_PATTERN.exec(value);

  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    return null;
  }

  return value as DateOnly;
}

export function compareDateOnly(left: DateOnly, right: DateOnly): -1 | 0 | 1 {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

export function addDays(value: DateOnly, days: number): DateOnly {
  if (!Number.isSafeInteger(days)) {
    throw new RangeError("Day offset must be a safe integer");
  }

  const calendar = new Date(0);
  calendar.setUTCFullYear(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
    Number(value.slice(8, 10)),
  );
  calendar.setUTCDate(calendar.getUTCDate() + days);

  const year = calendar.getUTCFullYear();

  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError("DateOnly result is outside the supported range");
  }

  const month = String(calendar.getUTCMonth() + 1).padStart(2, "0");
  const day = String(calendar.getUTCDate()).padStart(2, "0");

  return `${String(year).padStart(4, "0")}-${month}-${day}` as DateOnly;
}

export function formatDateOnly(value: DateOnly): string {
  return `${value.slice(0, 4)}/${value.slice(5, 7)}/${value.slice(8, 10)}`;
}
