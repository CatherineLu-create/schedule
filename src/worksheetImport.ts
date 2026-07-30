export type WorksheetRow = unknown[];

export function cleanCellText(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).replace(/^[\s\u3000]+|[\s\u3000]+$/g, "");
}

export function isBlankCell(value: unknown) {
  return cleanCellText(value) === "";
}

function isBlankRow(row: WorksheetRow) {
  return row.every(isBlankCell);
}

function hasColumnValue(rows: WorksheetRow[], columnIndex: number) {
  return rows.some((row) => !isBlankCell(row[columnIndex]));
}

export function removeBlankRowsAndColumns(rows: WorksheetRow[]) {
  const nonblankRows = rows.filter((row) => !isBlankRow(row));
  const columnCount = nonblankRows.reduce((max, row) => Math.max(max, row.length), 0);
  const retainedColumnIndexes = Array.from({ length: columnCount }, (_item, index) => index).filter((index) =>
    hasColumnValue(nonblankRows, index),
  );

  return nonblankRows.map((row) => retainedColumnIndexes.map((index) => row[index]));
}
