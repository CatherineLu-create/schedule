# Project Master and Schedule Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Project Master classification fields and Current Schedule filters while preserving existing prototype behavior.

**Architecture:** Extend existing project helpers for `year`, `customer`, and `productLine`; introduce schedule row IDs and reusable filter helpers; wire the helpers into the published and draft schedule views. Keep all state local to the existing React app.

**Tech Stack:** React, TypeScript, Vite, local assertion-style TypeScript tests, `npm run build`.

## Global Constraints

Implement only the requested Project Master field additions and Current Schedule filters.
Keep all existing prototype behavior local to the browser.
Do not implement backend, saved preferences, cross-project filtering, cross-version filtering, version comparison, or Project Master version history.
Schedule filters must not mutate underlying schedule data or create drafts.
Publishing must publish the full Working Draft, not only filtered rows.

---

### Task 1: Project Master Fields

**Files:**
- Modify: `src/projectMaster.ts`
- Modify: `src/projectMaster.test.ts`
- Modify: `src/main.tsx`

**Interfaces:**
- Produces: `ProjectForm` with `year`, `customer`, `productLine`.
- Updates: `buildProjectFromForm(input)`, `updateProjectFromForm(project, input)`, `toProjectForm(project)`.

- [ ] **Step 1: Add failing tests**

Extend `src/projectMaster.test.ts` so create/edit/to-form preserve year, customer, and productLine.

- [ ] **Step 2: Run build to verify red**

Run: `npm run build`
Expected: TypeScript errors because the fields are missing from `ProjectForm`.

- [ ] **Step 3: Implement helper changes**

Add the three fields to `ProjectForm`, preserve them in create/edit/to-form, and keep Excel import mapping intact.

- [ ] **Step 4: Wire UI fields**

Add a `Project Classification` fieldset in `ProjectDialog` and show Year, Customer, Product Line in `ProjectWorkspace`.

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: PASS.

### Task 2: Schedule Filter Helpers

**Files:**
- Create: `src/scheduleFilters.ts`
- Create: `src/scheduleFilters.test.ts`
- Modify: `src/scheduleWarnings.ts`
- Modify: `src/scheduleWarnings.test.ts`

**Interfaces:**
- Produces: `ScheduleFilterState`, `emptyScheduleFilters`, `filterScheduleRows(rows, filters)`, `scheduleFilterChips(filters)`, `scheduleFilterOptions(rows)`, `updateScheduleFilter(filters, key, value)`, `removeScheduleFilter(filters, key)`.
- Updates warning helpers to accept `rowId: string` instead of row index.

- [ ] **Step 1: Add failing tests**

Test AND filtering, phase/stage options, milestone partial matching, date boundaries, Actual completed/not completed, chips, and row ID preservation.

- [ ] **Step 2: Run build to verify red**

Run: `npm run build`
Expected: FAIL because `scheduleFilters.ts` does not exist and warning helper signatures are still index based.

- [ ] **Step 3: Implement helpers**

Implement schedule filters and update warning keys to use row IDs.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: PASS after adapting existing warning tests.

### Task 3: Schedule UI Integration

**Files:**
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes helpers from `src/scheduleFilters.ts`.
- Consumes row-ID warning helpers from `src/scheduleWarnings.ts`.

- [ ] **Step 1: Add schedule row IDs**

Add `id` to `ScheduleItem` when mapping `scheduleOutput.records`.

- [ ] **Step 2: Published schedule filters**

Add filter state, controls, chips, Clear All, result count, and filtered rendering to `ScheduleSection`.

- [ ] **Step 3: Working draft filters**

Add the same controls to `WorkingDraft`. Use row IDs for editing and warning resolution. Publish the full `draftSchedule`.

- [ ] **Step 4: Run final build**

Run: `npm run build`
Expected: PASS.
