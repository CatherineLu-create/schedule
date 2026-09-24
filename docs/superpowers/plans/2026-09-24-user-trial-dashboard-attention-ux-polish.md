# PIP V2 User Trial Dashboard Attention UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show canonical Current Published MDRR values in the existing Portfolio column and make Upcoming/Overdue cards identify and open the Projects and milestones requiring attention.

**Architecture:** Extend the existing read-only Portfolio projection by stable `MilestoneDefinitionId` without changing Schedule authority or the MDRR catalog flag. Keep `selectDashboardAttention()` unchanged; group its retained matches with the already-projected Project rows inside `PortfolioDashboardView`, and invoke the existing `onOpenProject(ProjectId)` callback for navigation.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Vite, Tailwind utility classes.

**Spec:** User-approved Change 1C brief dated 2026-09-24. It supersedes only the earlier inactive MDRR Portfolio cell and count-only `Milestone Due` presentation; `docs/superpowers/specs/2026-09-23-user-trial-dashboard-due-overdue-activation-design.md` remains the authority for unchanged attention calculation semantics.

## Global Constraints

- Work only in `D:\011superpowers-schedule-user-trial` on `user-trial-pages` at Change 1A checkpoint `d39030fb55224990daf228885ec64a4f04341fdf` plus the accepted uncommitted Change 1B baseline.
- Preserve every accepted Change 1B seed/bootstrap behavior; do not reset, discard, rebase, commit, push, or merge unless a later human instruction explicitly authorizes it.
- Current Published Schedule remains official truth. Working Draft must not affect Portfolio MDRR or attention details until Publish succeeds.
- Do not modify `selectDashboardAttention()` classification, its 14-day window, unique-Project counting, explicit `referenceDate`, or unavailable-read behavior.
- Keep `mdrrMilestoneDefinition.showInPortfolio === false`; Change 1C is an explicit projection override for the already-existing MDRR visual column, not a Milestone Catalog redesign.
- Preserve Project, Schedule, and Team authority; Search/Filter behavior; Change 1B relative demo dates; `/schedule/`; deployment workflow; and inactive Blocking Issues.
- Add no backend, persistence, domain fields, demo flag, milestone type, new routing model, or Project Master Mechanical/Cover/Leverage work.
- Use TDD: establish the expected RED for each task, make the minimum production change, and rerun the focused test to GREEN before continuing.

## Planned File Map

- Modify `src/application/selectors/portfolioDashboardRows.ts`: include the canonical MDRR definition in the read-only Current Published Portfolio projection.
- Modify `src/application/selectors/portfolioDashboardRows.spec.ts`: replace the historical MDRR-exclusion characterization with Published projection and Working Draft isolation coverage.
- Modify `src/portfolioDashboardColumns.ts`: activate the existing MDRR column's Plan/Actual value mode while retaining its catalog-visibility metadata and explicit blank-display rule.
- Modify `src/portfolioDashboardColumns.spec.ts`: prove MDRR remains catalog-hidden but its existing visual column is projection-active.
- Modify `src/portfolioDashboardTable.tsx`: reuse normal `P:`/`A:` rendering for displayable MDRR and render `—` for MDRR N/A or no date.
- Modify `src/portfolioDashboardTable.spec.tsx`: cover MDRR Plan/Actual, N/A, undated, repeated-occurrence, and unaffected non-MDRR presentation.
- Modify `src/portfolioDashboardView.tsx`: group retained attention matches by Project, resolve milestone-type labels, render compact detail lists, rename the card, and call the existing navigation callback.
- Modify `src/portfolioDashboardView.spec.tsx`: cover grouping, labels/dates, unique count, zero/unavailable states, cross-category membership, and exact-ID navigation.
- Modify `src/legacy/characterization/runtime.spec.tsx`: update the renamed card characterizations and extend the Change 1B runtime scenario through MDRR projection, attention details, and attention-to-Workspace navigation.
- Modify `README.md`: update current Dashboard terminology and describe attention details/navigation and active MDRR projection.
- Modify `src/fixtures/v2/README.md`: add a current-state note that the User Trial Portfolio projects MDRR despite the retained historical catalog flag.
- Preserve unchanged `src/application/selectors/dashboardAttention.ts`, its rule tests, `src/config/v2/referenceData.ts`, canonical Project/Schedule fixtures, Change 1B seed factory, `src/main.tsx`, dependencies, deployment files, and historical specs/plans.

## Review Focus

- A Published MDRR plus a conflicting Working Draft must display only the Published dates; Task 1 adds the direct selector regression and Task 3 checks the real runtime path.
- MDRR N/A or an applicable MDRR with both dates blank must render one `—`, while a displayable MDRR must use the same `P:`/`A:` convention as other Schedule columns; Task 1 covers all three states.
- One Project with two qualifying Upcoming matches must render one Project button and two milestone lines without changing the unique count; Task 2 covers this directly.
- One Project in both Upcoming and Overdue must appear independently in each card, and each button must open the exact canonical `ProjectId`; Task 2 covers both grouping and callback behavior.
- Unavailable attention must not leak partial Project details, and zero available attention must remain numeric `0`; Task 2 preserves both existing states.

---

### Task 1: Activate the Existing Portfolio MDRR Projection

**Files:**
- Modify: `src/application/selectors/portfolioDashboardRows.ts:1-84`
- Modify: `src/application/selectors/portfolioDashboardRows.spec.ts:43-245`
- Modify: `src/portfolioDashboardColumns.ts:4-56`
- Modify: `src/portfolioDashboardColumns.spec.ts:7-35`
- Modify: `src/portfolioDashboardTable.tsx:32-55`
- Modify: `src/portfolioDashboardTable.spec.tsx:175-260`

**Interfaces:**
- Consumes: `selectCurrentPublishedSchedule(state, projectId)`, `portfolioMilestoneDefinitions`, `mdrrMilestoneDefinition`, and the existing `PortfolioScheduleMilestoneOccurrence` representation.
- Produces: the same `PortfolioDashboardRow` and table APIs, with a 35th projected cell for `milestone-mdrr`; no domain or canonical Schedule type changes.

- [ ] **Step 1: Write failing read-projection tests**

Update the exact projection test to expect the existing 34 Portfolio definitions followed by the stable MDRR definition:

```ts
const expectedIds = [
  ...portfolioMilestoneDefinitions.map(({ id }) => id),
  mdrrMilestoneDefinition.id,
];
expect(schedule.cells.map(({ milestoneDefinitionId }) => milestoneDefinitionId))
  .toEqual(expectedIds);
expect(mdrrMilestoneDefinition.showInPortfolio).toBe(false);
```

Replace the old “excludes MDRR” test with a Current Published/Working Draft isolation case. Give Published MDRR Plan `2026-10-05` and Actual `null`, then attach a Working Draft MDRR with a conflicting date. Assert the projected MDRR occurrence remains exactly:

```ts
{
  milestoneId: publishedMdrr.milestoneId,
  applicability: "applicable",
  plan: "2026/10/05",
  actual: "-",
}
```

- [ ] **Step 2: Write failing visual-schema and table tests**

In `portfolioDashboardColumns.spec.ts`, retain `portfolioVisible: false` and the single canonical `mdrrMilestoneDefinition`, but require the existing MDRR mapping to use `valueMode: "planActual"` and the explicit MDRR blank rule.

In `portfolioDashboardTable.spec.tsx`, require:

```text
Applicable Plan only       -> P: 2026/10/05; A: —
Applicable Plan + Actual   -> P: 2026/10/05; A: 2026/10/06
Not Applicable MDRR        -> —
Applicable with no dates   -> —
No Published MDRR          -> —
```

Also retain the existing proof that non-MDRR Not Applicable occurrences display `N/A` and repeated displayable occurrences preserve Published snapshot order.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```powershell
npm run test:run -- src/application/selectors/portfolioDashboardRows.spec.ts src/portfolioDashboardColumns.spec.ts src/portfolioDashboardTable.spec.tsx
```

Expected: failures show MDRR absent from `schedule.cells`, `valueMode` still `placeholder`, and the MDRR table cell still `—` for displayable Published dates.

- [ ] **Step 4: Extend the Portfolio row projection by stable ID**

Import `mdrrMilestoneDefinition` beside `portfolioMilestoneDefinitions` and use a selector-local immutable definition sequence:

```ts
const portfolioProjectedMilestoneDefinitions = [
  ...portfolioMilestoneDefinitions,
  mdrrMilestoneDefinition,
] as const;
```

Map `currentPublished.version.milestones` by exact `milestoneDefinitionId` through that sequence. Do not inspect display names, Working Draft, legacy Project `mdrr`, or `showInPortfolio` at runtime.

- [ ] **Step 5: Activate the existing MDRR mapping without changing reference data**

Let `scheduleMapping()` accept an optional presentation override while leaving all 34 existing calls unchanged. Configure only `schedule:mdrr:mdrr` with:

```ts
interface PortfolioScheduleColumnMapping {
  // existing fields stay unchanged
  readonly valueMode: "planActual" | "placeholder";
  readonly emptyWhenNotApplicableOrUndated?: boolean;
}

interface ScheduleMappingOptions {
  readonly portfolioVisible?: boolean;
  readonly valueMode?: PortfolioScheduleColumnMapping["valueMode"];
  readonly emptyWhenNotApplicableOrUndated?: boolean;
}

{
  portfolioVisible: false,
  valueMode: "planActual",
  emptyWhenNotApplicableOrUndated: true,
}
```

`portfolioVisible` continues to record the historical catalog relationship; `valueMode` now controls the approved existing visual column.

- [ ] **Step 6: Reuse the table's Plan/Actual convention**

Before rendering occurrences, apply the mapping's blank rule:

```ts
const displayableOccurrences = mapping.emptyWhenNotApplicableOrUndated
  ? occurrences.filter((occurrence) =>
      occurrence.applicability === "applicable"
      && (occurrence.plan !== "-" || occurrence.actual !== "-"))
  : occurrences;
```

Return `—` when no displayable MDRR occurrence remains. Otherwise pass those occurrences through the existing `Applicable`, `P:`, and `A:` markup unchanged.

- [ ] **Step 7: Run Task 1 tests to GREEN**

Run the Step 3 command again. Expected: all three files pass with zero failures.

---

### Task 2: Render and Navigate Grouped Attention Details

**Files:**
- Modify: `src/portfolioDashboardView.tsx:1-84`
- Modify: `src/portfolioDashboardView.spec.tsx:1-130`
- Preserve unchanged: `src/application/selectors/dashboardAttention.ts` and `src/application/selectors/dashboardAttention.spec.ts`

**Interfaces:**
- Consumes: `DashboardAttentionGroup.projectIds`, `.projectCount`, and `.matches`; complete unfiltered `PortfolioDashboardRow[]`; `milestoneDefinitions`; `milestoneTypeCatalog`; `formatDateOnly()`; existing `onOpenProject(projectId)`.
- Produces: presentation-only grouped Project details. It does not classify, filter, store, or recount attention.

- [ ] **Step 1: Replace count-only component fixtures with real retained matches**

Build fixed component fixtures whose Project IDs exist in supplied rows. Cover one Project with G/O and MDRR Upcoming matches, the same or another Project with SMT Overdue, and fixed Plans based on `2026-09-23`.

Assert:

- card order remains Blocking Issues, Upcoming Milestones, Overdue;
- section microcopy is `Upcoming and Overdue use Current Published Schedule.`;
- counts continue to come from `projectCount`;
- one Project button renders once per category even with two same-category matches;
- milestone lines render `G/O · 2026/09/28`, `MDRR · 2026/10/03`, and `SMT · 2026/09/16`;
- one Project may render once in each active card;
- clicking the scoped Project button calls `onOpenProject` once with the exact `ProjectId`;
- table search still does not alter card count/details;
- available zero renders numeric `0` with no fabricated detail;
- unavailable renders `—`, `Calculation unavailable`, and no partial detail;
- Blocking Issues remains `—` / `Calculation not active` with no detail list.

- [ ] **Step 2: Run the component test and verify RED**

Run:

```powershell
npm run test:run -- src/portfolioDashboardView.spec.tsx
```

Expected: `Upcoming Milestones`, Project buttons, and milestone detail lines are absent from the count-only view.

- [ ] **Step 3: Add a presentation-only grouping helper inside the view module**

Resolve display metadata from stable IDs without adding it to the business selector:

```ts
interface AttentionProjectPresentation {
  readonly projectId: ProjectId;
  readonly projectName: string;
  readonly milestones: readonly {
    readonly milestoneId: MilestoneId;
    readonly typeLabel: string;
    readonly planLabel: string;
  }[];
}
```

Build maps for Project rows, definitions, and milestone types. Iterate `group.projectIds` for unique Project order; for each Project, retain all `group.matches` in selector order, resolve `match.milestoneDefinitionId -> milestoneTypeId -> displayName`, and format `match.plan` with `formatDateOnly()`. This helper must not compare dates, inspect Actual/applicability, or derive counts.

Treat a missing Project row, definition, or milestone type as a violated canonical presentation invariant and throw a descriptive error; do not fabricate a label or silently drop a retained match.

- [ ] **Step 4: Render compact details and reuse navigation**

Rename only the second card:

```text
Milestone Due -> Upcoming Milestones
```

Keep supporting text:

```text
Next 14 days · unique projects
```

Replace the stale section microcopy with:

```text
Upcoming and Overdue use Current Published Schedule.
```

For available Upcoming and Overdue groups, render each Project once as a compact button followed by its milestone list. Use the existing callback directly:

```tsx
<button type="button" onClick={() => onOpenProject(project.projectId)}>
  {project.projectName}
</button>
```

Render each retained match as `${typeLabel} · ${planLabel}`. Preserve existing tones, three-card structure, numeric values, unavailable behavior, and inactive Blocking Issues.

- [ ] **Step 5: Run Task 2 tests to GREEN**

Run the Step 2 command again. Expected: all component tests pass with zero failures.

---

### Task 3: Integrate the Accepted Demo Baseline, Update Current Docs, and Verify

**Files:**
- Modify: `src/legacy/characterization/runtime.spec.tsx:730-1030`
- Modify: `README.md:29-35,82-97,110-122`
- Modify: `src/fixtures/v2/README.md:119-132`
- Preserve unchanged: `src/main.tsx`, `src/fixtures/userTrialDemoSeed.ts`, `src/fixtures/userTrialDemoSeed.spec.ts`, `src/fixtures/v2/referenceFixtures.ts`, `src/fixtures/v2/referenceFixtures.spec.ts`, and all historical specs/plans.

**Interfaces:**
- Consumes: Change 1B `createUserTrialPrototypeState(referenceDate)` and the unchanged App wiring that already passes `attention`, full Portfolio rows, and `openProject` into `PortfolioDashboardView`.
- Produces: characterization of the complete User Trial Dashboard without changing runtime state construction.

- [ ] **Step 1: Extend runtime characterizations before changing production behavior**

Update all existing `Milestone Due` role/name assertions to `Upcoming Milestones`.

In the Change 1B fixed-date runtime test (`referenceDate = 2026-09-23`), assert:

```text
Upcoming Milestones count: 2 demo Projects
DEMO - G/O Due Soon: G/O · 2026/09/28
DEMO - MDRR Due Soon: MDRR · 2026/10/03
Overdue count: 1 demo Project
DEMO - SMT Overdue: SMT · 2026/09/16
DEMO - Completed Milestone: absent from both cards
Portfolio MDRR cell: P: 2026/10/03 and A: —
```

Click the MDRR Project Name inside the Upcoming card and assert the normal Project Workspace header and Published v01 Schedule render. Keep the existing nine-Project, four-DEMO search, DEMO customer option, and canonical attention assertions.

- [ ] **Step 2: Run runtime and protected selector tests**

Run:

```powershell
npm run test:run -- src/application/selectors/dashboardAttention.spec.ts src/fixtures/userTrialDemoSeed.spec.ts src/legacy/characterization/runtime.spec.tsx
```

Expected before Tasks 1–2 are complete: runtime presentation failures only. Expected after Tasks 1–2: all tests pass and protected selector/seed semantics remain green.

- [ ] **Step 3: Update only current-state documentation**

In `README.md`, rename the active card to `Upcoming Milestones` and state that the two active cards show grouped Project names, qualifying milestone type/date, and navigate to Workspace. Note that the existing Portfolio MDRR column now reads Current Published Schedule.

In `src/fixtures/v2/README.md`, retain the historical `showInPortfolio = false` fact but replace the now-stale “MDRR remains hidden” sentence with a dated/current User Trial projection note. State explicitly that this exception neither changes catalog authority nor the attention selector.

Do not edit the 2026-09-12 Dashboard design/plan, Task 2.2/2.3 records, or the 2026-09-23 Change 1A design; they remain historical decisions superseded only by the approved User Trial presentation changes.

- [ ] **Step 4: Run the complete focused matrix**

Run:

```powershell
npm run test:run -- src/config/v2/referenceData.spec.ts src/application/selectors/portfolioDashboardRows.spec.ts src/portfolioDashboardColumns.spec.ts src/portfolioDashboardTable.spec.tsx src/portfolioDashboardView.spec.tsx src/portfolioDashboardFilters.spec.ts src/application/selectors/dashboardAttention.spec.ts src/fixtures/userTrialDemoSeed.spec.ts src/legacy/characterization/runtime.spec.tsx
```

Expected: all nine files pass; reference data still marks MDRR catalog-hidden, Change 1A rules remain green, Change 1B seed remains deterministic, and Search/Filters remain unchanged.

- [ ] **Step 5: Run the complete suite and production build**

Run:

```powershell
npm run test:run -- --maxWorkers=1
npm run build
```

Expected: both commands exit `0`; no generated artifact becomes tracked and the Vite base remains `/schedule/`.

- [ ] **Step 6: Audit the combined uncommitted baseline and Change 1C scope**

At execution start, record `git status --short`, `git diff --stat`, and `git hash-object` for the protected Change 1B plan, seed factory/tests, reference fixture/tests, and `src/main.tsx`. At completion, compare those hashes and run:

```powershell
git diff --check
git status --short
git diff --stat
git diff -- src/application/selectors/dashboardAttention.ts src/config/v2/referenceData.ts src/fixtures/v2/canonicalProjectFixtures.ts src/fixtures/v2/canonicalScheduleFixtures.ts vite.config.ts package.json package-lock.json
rg -n "Date\.now|new Date|isDemo|Coming Soon" src/application/selectors/portfolioDashboardRows.ts src/portfolioDashboardColumns.ts src/portfolioDashboardTable.tsx src/portfolioDashboardView.tsx
```

Expected:

- no whitespace errors;
- protected Change 1B hashes unchanged;
- no Change 1A selector, reference catalog, canonical fixture, dependency, or deployment diff;
- no new clock, demo branch, domain field, or forbidden `Coming Soon` label;
- only this plan plus the eleven listed implementation/test/current-documentation files differ from the accepted baseline.

- [ ] **Step 7: Request one independent completed-change review**

Review the combined working tree against this plan and the Change 1C brief. Categorize findings as Critical, Important, or Minor, focusing on Published-only MDRR, N/A/undated display, Working Draft leakage, unique grouping, match-order retention, exact-ID navigation, unavailable-state honesty, Change 1A/1B regression, historical-doc preservation, and unrelated scope. Fix Critical and Important findings test-first; report Minor findings without broadening scope.

- [ ] **Step 8: Preserve the human-verification checkpoint**

Do not commit, push, merge, or start Project Master work. Report focused/full/build results, reviewer findings, manual checks, combined diff/status, and the unchanged Change 1B protected hashes. Wait for explicit human checkpoint authorization.
