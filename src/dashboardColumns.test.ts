import { projectListColumns, resizeColumnWidth } from "./dashboardColumns";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

assertEqual(resizeColumnWidth(140, 60, 100), 200, "dragging right increases width");
assertEqual(resizeColumnWidth(140, -20, 100), 120, "dragging left decreases width");
assertEqual(resizeColumnWidth(140, -80, 100), 100, "column width cannot go below minimum");
assertEqual(projectListColumns.some((column) => column.key === "customer"), true, "customer remains a dashboard column");
assertEqual(projectListColumns.some((column) => column.label === "QCI Model Name"), true, "QCI model name label is used");
assertEqual(projectListColumns.some((column) => column.label === "Panel Size"), true, "panel size label is used");
