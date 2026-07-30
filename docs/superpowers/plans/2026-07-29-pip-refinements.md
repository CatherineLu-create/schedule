# PIP Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the requested Dashboard, Schedule warning, and Team Members Excel import refinements in the existing local React prototype.

**Architecture:** Keep the current Vite/React structure and add focused helpers for schedule warnings and worksheet-to-team-member conversion. Store all data in local React state and generic version history entries so published versions remain independent.

**Tech Stack:** React, TypeScript, Vite, `xlsx`, local assertion-style TypeScript tests, `npm run build`.

## Global Constraints

Keep the existing low-fidelity enterprise style.
Do not implement backend, database, API, authentication, permissions, cloud storage, multiple worksheet selection, complex formula handling, formatting replication, merged-cell reconstruction, or permanent storage after browser refresh.
Do not remove existing prototype functions.
Use the first worksheet by default for Team Member imports.
Use local prototype state only.

---

### Task 1: Schedule Warning State

**Files:**
- Create: `src/scheduleWarnings.ts`
- Test: `src/scheduleWarnings.test.ts`
- Modify: `src/versionHistory.ts`
- Test: `src/versionHistory.test.ts`

**Interfaces:**
- Produces: `type ScheduleWarningKey = string`, `createScheduleWarningKey(rowIndex: number, field: string): string`, `createInitialScheduleWarnings(): Record<string, true>`, `resolveScheduleWarning(warnings, rowIndex, field, value): Record<string, true>`, `countScheduleWarnings(warnings): number`, `hasScheduleWarning(warnings, rowIndex, field): boolean`.
- Produces: `VersionEntry<TScheduleItem, TMeta = unknown>` and `VersionHistory<TScheduleItem, TMeta = unknown>` with optional `meta`.

- [ ] **Step 1: Write failing schedule warning tests**

```ts
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
assertEqual(hasScheduleWarning(warnings, 0, "plan"), true, "initial warning is visible");
assertEqual(countScheduleWarnings(warnings), 1, "initial warning blocks publish");
const unresolved = resolveScheduleWarning(warnings, 0, "plan", " ");
assertEqual(hasScheduleWarning(unresolved, 0, "plan"), true, "blank value keeps warning");
const resolved = resolveScheduleWarning(warnings, 0, "plan", "Corrected plan");
assertEqual(hasScheduleWarning(resolved, 0, "plan"), false, "valid value resolves warning");
assertEqual(countScheduleWarnings(resolved), 0, "resolved warning no longer blocks publish");
```

- [ ] **Step 2: Run build to verify failure**

Run: `npm run build`
Expected: FAIL because `src/scheduleWarnings.ts` does not exist.

- [ ] **Step 3: Implement warning helpers and generic version metadata**

Add schedule warning helpers exactly matching the interface above. Update `createInitialVersionHistory(schedule, meta?)`, `publishVersion(history, schedule, meta?)`, and `selectVersion` so meta is stored per version and restored with selected versions.

- [ ] **Step 4: Update version history tests**

Extend `src/versionHistory.test.ts` with:

```ts
const initialWithMeta = createInitialVersionHistory(v1Schedule, { warnings: { "0:plan": true } });
const publishedWithMeta = publishVersion(initialWithMeta, v2Schedule, { warnings: {} });
const olderWithMeta = selectVersion(publishedWithMeta, "v1");
assertEqual((olderWithMeta.currentMeta as { warnings: Record<string, true> }).warnings["0:plan"], true, "older version keeps warning metadata");
const latestWithMeta = selectVersion(olderWithMeta, "v2");
assertEqual(Object.keys((latestWithMeta.currentMeta as { warnings: Record<string, true> }).warnings).length, 0, "latest corrected version has no warning metadata");
```

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: PASS.

### Task 2: Team Members Excel Import Helpers

**Files:**
- Modify: `src/teamMembers.ts`
- Test: `src/teamMembers.test.ts`

**Interfaces:**
- Produces: `type TeamMembersState = { fields: string[]; members: TeamMember[]; sourceFileName?: string }`.
- Produces: `normalizeImportedHeaders(rawHeaders: unknown[]): string[]`.
- Produces: `teamMembersFromWorksheetRows(rows: unknown[][], idPrefix: string, sourceFileName: string): TeamMembersState`.

- [ ] **Step 1: Add failing import helper tests**

Append assertions that blank headers become `Column N`, duplicates are suffixed, all columns remain present, and imported rows preserve values.

- [ ] **Step 2: Run build to verify failure**

Run: `npm run build`
Expected: FAIL because new helper exports do not exist.

- [ ] **Step 3: Implement import helpers**

Normalize headers from the first row. Convert remaining rows into `members` with ids `${idPrefix}-${index + 1}` and string cell values. Preserve `sourceFileName`.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: PASS.

### Task 3: React UI Integration

**Files:**
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes schedule warning helpers from `src/scheduleWarnings.ts`.
- Consumes Team Members helpers from `src/teamMembers.ts`.

- [ ] **Step 1: Move dashboard chips and export button**

Render chips in the Filters title row. Move `exportDashboardProjectListToExcel(filteredProjects)` to the dashboard header before Create Project. Remove the lower Export Summary block.

- [ ] **Step 2: Wire schedule warnings**

Store `currentMeta.warnings` with version history. Resolve warnings on draft cell edit. Disable Publish and show unresolved count while warnings remain. Render warning icons from warning metadata in both workspace and draft tables.

- [ ] **Step 3: Wire Team Member file parsing**

Change the file input `onChange` handler to call `XLSX.read(await file.arrayBuffer())`, convert the first worksheet with `XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" })`, confirm replacement when existing data is present, and update local state with the converted table.

- [ ] **Step 4: Preserve editable table operations**

Keep edit cell, add row, delete row, add field, and delete custom field behavior. Show `sourceFileName` when present. Keep horizontal table scrolling.

- [ ] **Step 5: Run final build**

Run: `npm run build`
Expected: PASS.
