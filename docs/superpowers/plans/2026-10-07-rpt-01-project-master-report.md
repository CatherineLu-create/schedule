# RPT-01 Project Master Report Implementation Plan

> Use superpowers:executing-plans to implement this plan with focused tests and a final independent review.

**Goal:** Add the read-only Project Master Report specified in the user's PIP V2 RPT-01 request, then commit a feature checkpoint without merging or pushing.

**Architecture:** Reuse the exact Portfolio Dashboard rows, filter predicates, options and controls with independent transient Reports state. An explicit ordered column registry reads current canonical Project.master and existing display selectors. The web table and one-sheet Excel workbook consume that same registry; there is no persisted report state or copied business model.

**Tech stack:** Existing React, TypeScript, Tailwind, SheetJS and Vitest; no new dependencies.

**Spec:** User-provided PIP V2 Task RPT-01, sections 1–17, is the authoritative design and delivery instruction.

## Constraints and field inventory

- Baseline verified: local, tracking and live origin/user-trial-pages all equal `8c7c53dd5dfb0a45bb9c64f1490b73cd86594081`; protected worktree clean, divergence 0/0.
- Use existing separate worktree `D:/011superpowers-schedule-user-feedback-batch1`, new branch `feature/rpt-01-project-master-report`.
- Preserve `/schedule/`, all canonical authorities, Dashboard export and Governance workflows/Chinese content.
- Identity: Year, STN Project Name, QCI Model Name.
- Project Master: Acer Model Name, Acer Marketing Name; Customer, Category, Product Line; Panel Size, CPU, GPU, PCB#; SSID, RMN; Project Status. User explicitly confirmed Category and PCB# are included, while Housing Number and Remark are excluded because they are not currently exposed/approved as user-facing fields.
- Mechanical: product length, width, height, weight; package length, width, height, gross weight, using existing units/null semantics.
- Cover & Leverage: PCB Leverage; A Cover material/leverage, then B, C, D in current Detail order. Reuse direct-reference resolution against all current projects, including sources outside the filtered set.
- One normal header row, Auto Filter, no merges or freeze panes; headers-only export when zero projects; export disabled only when zero content groups.
- Navigation is Reports then Governance; Reports opens directly and gets fresh filters/default groups on entry. Existing return paths remain.

## Review focus

1. Leverage sources outside the filtered set, renamed projects, missing references and chains must retain current direct-source semantics.
2. Catalog label changes and blank/whitespace measurements/text must use existing display rules unchanged.
3. Every content-group combination must preserve web/export order and identity exactly once.
4. Switching pages and clicking Reports again must reset transient state without inheriting Dashboard state.
5. Sticky header and identity columns must share a real scroll container and avoid overlap; overflow must be automatic.

## Tasks

### Task 1: Shared controls and report presentation/export

- [x] Add failing runtime tests for navigation, default report fields, group toggles and headers-only workbook shape.
- [x] Extract `PortfolioSearchFilters` from `portfolioDashboardView.tsx`, preserving markup and behavior; both views own their state and use `filterPortfolioDashboardRows`.
- [x] Extract unchanged measurement/cover formatting into `projectMasterDisplay.ts` and reuse it in Detail and Reports.
- [x] Create `projectMasterReportColumns.ts` with ordered group definitions, column getters and current-state cell resolution; create `projectMasterReportExport.ts` with workbook/date filename functions.
- [x] Verify canonical values, complete field inventory, all group combinations, XLSX round trip, Auto Filter and absence of panes/merges.

### Task 2: Report page and navigation

- [x] Create `projectMasterReportView.tsx` with independent search/filters/default groups, count, shared controls, accessible wide table and Export to Excel.
- [x] Wire Reports in `main.tsx`, replace only the Governance navigation label, preserve existing back paths. Remount Reports on each navigation click.
- [x] Update existing tests that locate the renamed top-nav button; leave Chinese internal assertions intact.
- [x] Verify filter parity, remount/reset, export independent of scroll, live references and read-only behavior.

### Task 3: Verification and checkpoint

- [x] Run focused Reports/Dashboard/Detail tests and the complete existing suite, including legacy .test.ts files excluded by default config where executable.
- [x] Run production build; inspect scope and protected branch/worktree state.
- [x] Request independent review, address material findings and record results.
- [x] Complete the feature checkpoint with a clear commit subject and report hash, files, checks, acceptance coverage and limitations. Preserve the branch/worktree; do not merge or push.

## Execution record

- Baseline default test command initially could not start because sandbox blocked Vite process spawning (`EPERM`); rerun with process access authorized.
- User's detailed design and explicit implementation/checkpoint instructions authorize implementation here; no redundant design approval is requested.
- Reports runtime RED confirmed: three new tests fail because the Reports navigation/action is absent at baseline.
- Baseline unconstrained parallel run reported timeouts; stopped that identified runner and reran the unchanged suite with two workers to reduce contention.
- Unchanged baseline verification passed: 86 files, 1,517 tests (`npm run test:run -- --maxWorkers=2`, excluding the new Reports runtime test).
- Focused verification passed: 5 files, 44 tests, including 15 new Reports tests, Dashboard filter/export regression and Project Master Detail regression.
- Production build passed with `/schedule/` retained. Existing large-bundle warning remains; no dependencies or build configuration changed.
- All six standalone legacy `.test.ts` assertion scripts passed using the installed Rolldown bundler and temporary outputs. These are not selected by the existing Vitest configuration.
- Independent read-only review found one material issue: the 440px frozen identity region hid content on narrow screens. Reproduced with a failing real-Chrome assertion, then fixed using responsive widths while preserving all three frozen columns. The same browser assertion passed after rebuild. No other material findings or deferred minor findings.
- Browser checks against the production preview passed at 1440px and 390px: horizontal identity/header freezing, sticky header during vertical scroll, automatic overflow, no overflow for identity-only desktop columns, disabled export without groups, and reset on entry. Screenshots were inspected. Narrow identity width is 208px inside a 326px table viewport, leaving content readable.
- Review dispositions: mixed existing blank markers and measurement display strings are retained to honor canonical display semantics; root-source traversal is excluded as expressly deferred by the user. No source cleanup or new fallbacks were introduced.
- Final complete suite passed after the responsive fix: `npm run test:run -- --maxWorkers=2` — 88 files, 1,532 tests, 291.30 seconds, exit 0. The previous full run also passed all 1,532 tests.
- Final scope review and `git diff --check` passed. Protected User Trial worktree remains clean; local, tracking and live remote branch heads remain at the requested baseline. No merge or push was performed.

## Known limitations

No known functional deviations from RPT-01. Vite reports a large JavaScript bundle warning (approximately 918 kB minified); the production build succeeds. Browser verification used Chrome at desktop and narrow widths; Excel shape was verified through real XLSX serialization/round-trip and worksheet XML checks.

## Acceptance evidence

| Checks | Evidence |
| --- | --- |
| A: navigation | App runtime test asserts Reports then Governance, no Dashboard item in that navigation, direct report entry, English return button and unchanged Chinese Governance heading/return. Existing Governance tests retain their Chinese workflow assertions. |
| B: initialization | App runtime test enters from a filtered Dashboard, verifies blank/default Reports search/filters, all three groups checked, then repeats entry from Reports and Governance. |
| C: project selection | Parameterized view tests compare each of the nine controls' options and resulting Project IDs to the same Dashboard selector under AND search, count and export selection; chip removal/Clear all retain current semantics. |
| D: table | App test pins all 32 headers and row identities. Production Chrome checks horizontal and vertical geometry of frozen cells/headers and automatic overflow at desktop and narrow widths. |
| E: groups | App test toggles every group and compares preview/export headers; column tests cover all eight combinations, identity uniqueness, exact field count, hidden-field exclusions and zero-group disablement. |
| F: values | Rich canonical fixture tests current catalog labels, untrimmed display text, existing blank markers, zero/decimal/null measurements, all cover values, renamed direct sources outside the result set, self, null and dangling references. A three-project chain confirms no root traversal; source state is unchanged. |
| G: Excel | Real SheetJS round-trip tests assert a single Project Master Report worksheet, row/column order, Auto Filter, header-only empty exports and XML absence of pane/merged-cell tags. App export is identical before/after web scroll. |
| H: regressions | Full existing suite and six legacy scripts; focused unchanged Dashboard export tests; build with /schedule/. Diff confirms no domain, command, selector, Governance workflow, Dashboard export/table/filter predicate, dependency or build configuration changes. |

## Changed files

Production additions:
- `src/portfolioSearchFilters.tsx`
- `src/projectMasterDisplay.ts`
- `src/projectMasterReportColumns.ts`
- `src/projectMasterReportExport.ts`
- `src/projectMasterReportView.tsx`

Production integration / unchanged-behavior extractions:
- `src/main.tsx`
- `src/portfolioDashboardView.tsx`
- `src/projectMasterDetail.tsx`

New Reports tests:
- `src/projectMasterReport.spec.tsx`
- `src/projectMasterReport.runtime.spec.tsx`

Existing tests updated only to locate the renamed top-navigation button:
- `src/governanceAdvancedTools.spec.tsx`
- `src/governanceWorkspace.spec.tsx`
- `src/scheduleImportReviewPanel.spec.tsx`
- `src/legacy/characterization/governanceBatch1Runtime.spec.tsx`
- `src/legacy/characterization/projectMilestoneFollowUpRuntime.spec.tsx`
- `src/legacy/characterization/runtime.spec.tsx`

Documentation: this plan and verification record.
