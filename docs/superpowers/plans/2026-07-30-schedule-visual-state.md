# Schedule Visual State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Actual Status filtering and derive gray schedule row styling from Actual values.

**Architecture:** Update the existing schedule filter helper to remove Actual Status and add a pure row-state helper. Wire row styling into the existing published and draft schedule table renderers without changing schedule data.

**Tech Stack:** React, TypeScript, Vite, local assertion-style TypeScript tests, `npm run build`.

## Global Constraints

Implement only the Current Schedule visual-state changes and Dashboard subtitle change.
Keep existing schedule editing, filtering, warning resolution, versioning, publishing, and Dashboard behavior unchanged.
Do not store a separate completed flag.
Do not modify Actual values for styling.

---

### Task 1: Filter Helper and Row State

**Files:**
- Modify: `src/scheduleFilters.ts`
- Modify: `src/scheduleFilters.test.ts`

**Interfaces:**
- Removes: `actualStatus` and `ActualStatusFilter`.
- Produces: `isScheduleRowCompleteOrNotApplicable(actual: string): boolean`.

- [ ] **Step 1: Update tests first**

Remove Actual Status test cases and add assertions for dates, date plus notes, `-`, `NA`, `N/A`, empty, `TBC`, `TBD`, invalid text.

- [ ] **Step 2: Run build to verify red**

Run: `npm run build`
Expected: FAIL because helper does not exist and old Actual Status state still exists.

- [ ] **Step 3: Implement helper changes**

Remove Actual Status from filter state, chips, and filtering logic. Add row-state helper.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: PASS after UI is updated in Task 2.

### Task 2: UI Wiring

**Files:**
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `isScheduleRowCompleteOrNotApplicable(actual)`.

- [ ] **Step 1: Remove Actual Status UI**

Delete the Actual Status select and import/type references.

- [ ] **Step 2: Apply row style**

Apply readable gray text class to published and draft schedule rows when the helper returns true. Keep warning icons visible.

- [ ] **Step 3: Add Dashboard subtitle**

Render muted small `Dashboard` text under `Project Information`.

- [ ] **Step 4: Run final build**

Run: `npm run build`
Expected: PASS.
