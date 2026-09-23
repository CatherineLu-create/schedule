# PIP V2 User Trial Dashboard Due / Overdue Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate deterministic Dashboard Due and Overdue unique-Project counts from canonical Current Published Schedule data without changing any canonical authority or starting Demo Seed work.

**Architecture:** A pure `selectDashboardAttention(state, referenceDate)` selector reads every canonical Project through the existing `selectCurrentPublishedSchedule()` path, classifies qualifying raw Published milestones with DateOnly helpers, and returns either complete Due/Overdue groups or an unavailable result. `App` owns one session-snapshot local-calendar reference date and passes the derived read model into `PortfolioDashboardView`, which only renders counts and keeps Blocking Issues inactive.

**Tech Stack:** React, TypeScript, Vite, Vitest, React Testing Library, Tailwind CSS, and the existing in-memory `PrototypeState` architecture.

**Spec:** `docs/superpowers/specs/2026-09-23-user-trial-dashboard-due-overdue-activation-design.md`

## Global Constraints

- Work only in `D:\011superpowers-schedule-user-trial` on branch `user-trial-pages`.
- The approved spec remains part of this bounded change even though it is currently untracked.
- Do not commit, push, merge, or start Change 1B.
- `Project.team` remains saved Team authority; this feature does not read or change it.
- `PrototypeState.schedules` remains Schedule authority.
- Only Current Published Schedule is official truth; Working Draft must never influence attention until Publish succeeds.
- The selector receives an explicit `DateOnly` and contains no `Date.now()`, `new Date()`, UTC string slicing, or implicit clock read.
- Runtime takes one local-calendar snapshot from `getFullYear()`, `getMonth()`, and `getDate()` at the App boundary.
- Only Milestone Type IDs `type-g-o`, `type-smt`, `type-close`, and `type-mdrr` participate.
- Due is inclusive from `referenceDate` through `addDays(referenceDate, 14)`; Overdue is strictly earlier than `referenceDate`.
- Applicable, non-null Plan, and null Actual are mandatory for either category.
- Counts derive from unique ordered Project ID arrays, never match-array length.
- Match arrays retain every qualifying milestone in Project order and raw Current Published snapshot order.
- A Project may occur once in each category, but never twice within one category.
- Any unavailable Current Published read makes the portfolio attention read unavailable; no-Published and empty-Published are healthy zero-contribution states.
- Search and filters affect only the table, never portfolio attention counts.
- `Blocking Issues` remains `—` with `Calculation not active`.
- No Project/Schedule schema changes, stored flags, backend, persistence, Demo data, or unrelated Dashboard refactor.
- Historical Task 2.2/2.3/V2.2 specs remain unchanged.
- Every production change follows RED → GREEN; all test dates are fixed `DateOnly` literals.

## Review Focus

- A Published definition whose `showInPortfolio` is false but type is `type-mdrr` must still qualify; Task 2 tests this directly.
- Multiple unavailable Project reads must not yield a partial number; Task 2 tests the unavailable union and retained issues.
- Raw Published milestone order must survive independently of catalog display order; Task 2 tests match ordering with deliberately reversed definitions.
- A long-lived App session must not re-read the clock after state updates; Task 4 tests the injected fixed reference date across a reducer-driven publish transition.
- Dashboard table filtering must not alter attention values; Task 3 tests counts before and after a zero-row search.

---

### Task 1: Local-calendar DateOnly boundary helper

**Files:**
- Modify: `src/domain/shared/dateOnly.ts`
- Modify: `src/domain/shared/dateOnly.spec.ts`

**Interfaces:**
- Consumes: existing `parseDateOnly(value: string): DateOnly | null`.
- Produces:

```ts
export function toLocalDateOnly(value: Date): DateOnly;
```

- [ ] **Step 1: Write the failing helper tests**

Add `toLocalDateOnly` to the test import and add these behavior tests before production code:

```ts
it("converts local calendar components without UTC semantics", () => {
  expect(toLocalDateOnly(new Date(2026, 8, 23, 23, 59, 59))).toBe("2026-09-23");
});

it("rejects an invalid local Date", () => {
  expect(() => toLocalDateOnly(new Date(Number.NaN))).toThrow(
    "Date must contain a supported local calendar date",
  );
});
```

Production mutation caught: replacing local getters with `toISOString().slice(0, 10)`, or silently returning an invalid branded string.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm run test:run -- src/domain/shared/dateOnly.spec.ts
```

Expected: FAIL because `toLocalDateOnly` is not exported.

- [ ] **Step 3: Implement the minimal conversion**

Build `YYYY-MM-DD` from `value.getFullYear()`, `value.getMonth() + 1`, and `value.getDate()`, pad month/day to two digits and year to four digits, pass the result through `parseDateOnly`, and throw `RangeError("Date must contain a supported local calendar date")` when parsing returns null. Do not use UTC getters or ISO serialization.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same command. Expected: all `dateOnly.spec.ts` tests pass with no warnings.

---

### Task 2: Canonical Dashboard attention selector

**Files:**
- Modify: `src/config/v2/referenceData.ts`
- Create: `src/application/selectors/dashboardAttention.ts`
- Create: `src/application/selectors/dashboardAttention.spec.ts`

**Interfaces:**
- Consumes:
  - `selectCurrentPublishedSchedule(state, projectId)`;
  - `milestoneDefinitions` and the four configured existing Milestone Type IDs;
  - `addDays()` and `compareDateOnly()`;
  - raw `CanonicalPublishedScheduleVersion.milestones`.
- Produces:

```ts
export const dashboardAttentionMilestoneTypeIds: readonly MilestoneTypeId[];

export interface DashboardAttentionMatch {
  readonly projectId: ProjectId;
  readonly milestoneId: MilestoneId;
  readonly milestoneDefinitionId: MilestoneDefinitionId;
  readonly plan: DateOnly;
}

export interface DashboardAttentionGroup {
  readonly projectIds: readonly ProjectId[];
  readonly projectCount: number;
  readonly matches: readonly DashboardAttentionMatch[];
}

export type DashboardAttentionRead =
  | {
      readonly kind: "available";
      readonly referenceDate: DateOnly;
      readonly due: DashboardAttentionGroup;
      readonly overdue: DashboardAttentionGroup;
    }
  | {
      readonly kind: "unavailable";
      readonly referenceDate: DateOnly;
      readonly issues: readonly ValidationIssue[];
    };

export function selectDashboardAttention(
  state: PrototypeState,
  referenceDate: DateOnly,
): DashboardAttentionRead;
```

- [ ] **Step 1: Write all selector acceptance tests before the selector exists**

Use small canonical Project/Schedule builders with literal dates and `referenceDate = dateOnly("2026-09-23")`. Tests must call the public selector and assert literal IDs/counts/dates rather than reimplementing its predicates.

Add named tests that prove:

1. `2026-09-23` and `2026-10-07` are Due, `2026-10-08` is neither, and `2026-09-22` is Overdue.
2. Past Plan with Actual, null Plan, `notApplicable`, and a `type-test` definition inside the window are excluded.
3. G/O, SMT, Close, and hidden MDRR definitions qualify by exact stable type ID.
4. Two Due milestones for one Project retain both matches but produce one Project ID/count.
5. One Due and one Overdue milestone for one Project produce count 1 in both independent groups.
6. Two Projects retain `state.projects` order while their match details retain raw Published snapshot order.
7. A Due/Overdue-looking Working Draft cannot change a non-qualifying Published result, and a non-qualifying Draft cannot hide a qualifying Published result.
8. Calling `publishScheduleWorkingDraft()` and selecting the returned Schedule changes attention to the new Current Published snapshot.
9. No-Published and empty-Published Schedules contribute zero; no qualifying Projects return available groups with numeric counts `0`.
10. Missing/duplicate/malformed canonical Schedule ownership returns `kind: "unavailable"` and never a partial count.

Production mutations caught: label matching, `showInPortfolio` filtering, Draft reads, last-array-element version selection, exclusive Due boundaries, milestone-count cards, skipped Actual checks, and partial counts from unavailable reads.

- [ ] **Step 2: Run the selector test and verify RED**

Run:

```powershell
npm run test:run -- src/application/selectors/dashboardAttention.spec.ts
```

Expected: FAIL because `dashboardAttention.ts` and its public contract do not exist.

- [ ] **Step 3: Expose the exact configured participating IDs**

In `referenceData.ts`, export a readonly array built from the existing private IDs, without adding catalog values:

```ts
export const dashboardAttentionMilestoneTypeIds: readonly MilestoneTypeId[] = [
  milestoneTypeIds.go,
  milestoneTypeIds.smt,
  milestoneTypeIds.close,
  milestoneTypeIds.mdrr,
];
```

- [ ] **Step 4: Implement the pure selector**

Create a module-level definition lookup and eligible-ID `Set`. In `selectDashboardAttention`:

1. calculate `dueThrough = addDays(referenceDate, 14)` once;
2. iterate `state.projects` in canonical order;
3. call `selectCurrentPublishedSchedule(state, project.id)` exactly once per Project;
4. aggregate existing issues for unavailable reads, skip healthy no-Published reads, and inspect only `read.version.milestones` for Published reads;
5. resolve each definition by `milestoneDefinitionId` and classify only applicable milestones with Plan and without Actual;
6. append each qualifying match to its category while adding the Project ID no more than once per category;
7. after all Projects, return `unavailable` when any issues exist; otherwise return both groups with `projectCount: projectIds.length`.

The classification predicates are exactly:

```ts
const relativeToReference = compareDateOnly(milestone.plan, referenceDate);
const due = relativeToReference >= 0
  && compareDateOnly(milestone.plan, dueThrough) <= 0;
const overdue = relativeToReference < 0;
```

There is no Working Draft access and no formatted Portfolio-row dependency.

- [ ] **Step 5: Run selector tests and verify GREEN**

Run the same focused command. Expected: all selector acceptance tests pass.

---

### Task 3: Active Dashboard attention presentation

**Files:**
- Modify: `src/portfolioDashboardView.tsx`
- Modify: `src/portfolioDashboardView.spec.tsx`

**Interfaces:**
- Consumes: `attention: DashboardAttentionRead` supplied by App.
- Preserves: existing rows, actions, search/filter state, table projection, card order, and all callbacks.

- [ ] **Step 1: Replace inactive-state expectations with failing active-read tests**

Update the test setup to accept a `DashboardAttentionRead`, defaulting to an available zero-count result with fixed `referenceDate: dateOnly("2026-09-23")`.

Add or migrate tests to prove:

- the three cards remain exactly `Blocking Issues`, `Milestone Due`, `Overdue` in order;
- Blocking Issues still displays `—` and `Calculation not active`;
- an available read displays literal numeric Due/Overdue counts and supporting text `Next 14 days · unique projects` / `Past due · unique projects`;
- the section text is exactly `Due and Overdue use Current Published Schedule.`;
- available zero groups render numeric `0`, never `—`;
- an unavailable read renders `—` and `Calculation unavailable` for Due/Overdue;
- changing search/filters to hide all table rows leaves attention counts unchanged.

Production mutation caught: deriving cards from filtered rows, using match length, leaving old inactive copy, changing Blocking Issues, or converting unavailable into zero.

- [ ] **Step 2: Run the component test and verify RED**

Run:

```powershell
npm run test:run -- src/portfolioDashboardView.spec.tsx
```

Expected: FAIL because the view has no attention prop and still renders inactive Due/Overdue cards.

- [ ] **Step 3: Implement read-model-only rendering**

Add `attention` to `PortfolioDashboardViewProps`. Construct the three presentation cards from that input:

- Blocking Issues: fixed `—` / `Calculation not active`;
- available Due: `String(attention.due.projectCount)` / `Next 14 days · unique projects`;
- available Overdue: `String(attention.overdue.projectCount)` / `Past due · unique projects`;
- unavailable Due/Overdue: `—` / `Calculation unavailable`.

Replace the old section sentence with `Due and Overdue use Current Published Schedule.`. Do not give the view state, a reference date, or selector logic.

- [ ] **Step 4: Run component tests and verify GREEN**

Run the same focused command. Expected: all Dashboard view tests pass.

---

### Task 4: App boundary wiring and Publish-sensitive runtime integration

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/legacy/characterization/runtime.spec.tsx`

**Interfaces:**
- Consumes:
  - `toLocalDateOnly(new Date())` exactly once through a lazy React state initializer when no test reference date is supplied;
  - `selectDashboardAttention(state, dashboardReferenceDate)` on canonical state changes.
- Extends:

```ts
export interface AppProps {
  readonly initialState?: PrototypeState;
  readonly initialSelectedProjectId?: ProjectId | null;
  readonly referenceDate?: DateOnly;
}
```

- [ ] **Step 1: Write failing runtime wiring tests**

Migrate the characterization that currently forbids numeric cards so it renders `<App referenceDate={dateOnly("2026-09-23")} />` and expects:

- Blocking Issues remains inactive;
- the canonical fixture state displays Due `0` and Overdue `0`;
- old Due/Overdue `calculation not active` copy is absent;
- existing Project table structure and behavior remain present.

Extend the existing `keeps Portfolio Published-only while editing, then reflects Publish` runtime test. Render `<App referenceDate={dateOnly("2026-09-23")} />`; the canonical fixture's Manta G/O Plan `2026-10-15` is outside the window, so expect Due `0`. Open Manta, start Edit, apply `2026-09-28` to `Plan for A G/O occurrence`, return to Dashboard, and assert Due is still `0`. Reopen Manta, use the existing Publish button and `Publish Working Draft` confirmation, return to Dashboard, and assert Due becomes `1`. This proves the real reducer-driven Publish transition updates the derived result without remounting App or changing the injected reference date.

Production mutation caught: missing App wiring, implicit machine date in tests, Draft leakage, stale memoized attention, and clock re-read after Publish.

- [ ] **Step 2: Run runtime characterization and verify RED**

Run:

```powershell
npm run test:run -- src/legacy/characterization/runtime.spec.tsx
```

Expected: FAIL because App does not accept/reference an explicit date or pass attention into the view.

- [ ] **Step 3: Wire the runtime boundary**

In `App`, capture the session date once:

```ts
const [dashboardReferenceDate] = React.useState<DateOnly>(
  () => referenceDate ?? toLocalDateOnly(new Date()),
);
const dashboardAttention = selectDashboardAttention(
  state,
  dashboardReferenceDate,
);
```

Pass `attention={dashboardAttention}` to `PortfolioDashboardView`. Keep selector evaluation outside the view and preserve all existing Dashboard/Workspace actions.

- [ ] **Step 4: Run runtime characterization and verify GREEN**

Run the same focused command. Expected: all runtime characterization tests pass.

---

### Task 5: Current documentation migration and complete verification

**Files:**
- Modify: `src/fixtures/v2/README.md`
- Modify: `README.md`
- Preserve unchanged: historical specs under `docs/superpowers/specs/2026-09-10-*`, `2026-09-11-*`, and `2026-09-12-*`.

**Interfaces:** None; documentation describes the active implementation without becoming authority.

- [ ] **Step 1: Update only stale current-state statements**

In `src/fixtures/v2/README.md`, replace the statement that Due/Overdue is inactive with a statement that MDRR is hidden from Portfolio columns but participates, by stable type ID, in Current Published Dashboard attention derivation.

In root `README.md`, replace only the stale Needs Attention descriptions with the current three-card structure: Blocking Issues inactive; Milestone Due and Overdue active unique-Project counts derived from Current Published Schedule. Do not rewrite unrelated historical or prototype sections.

- [ ] **Step 2: Run focused Change 1A tests**

Run:

```powershell
npm run test:run -- src/domain/shared/dateOnly.spec.ts src/application/selectors/dashboardAttention.spec.ts src/portfolioDashboardView.spec.tsx src/legacy/characterization/runtime.spec.tsx
```

Expected: all named files and tests pass with zero failures.

- [ ] **Step 3: Run the full suite**

Run:

```powershell
npm run test:run
```

Expected: all 53+ test files pass with zero failures. Because the baseline runner was slow and emitted worker-termination timeouts in this environment, allow it to finish and record the complete exit code/output; do not change Vitest configuration as part of Change 1A.

- [ ] **Step 4: Run the production build**

Run:

```powershell
npm run build
```

Expected: TypeScript and Vite production build exit `0`; GitHub Pages base remains `/schedule/`.

- [ ] **Step 5: Audit the bounded diff**

Verify:

```powershell
git diff --check
git status --short
git diff --stat
rg -n "Date\.now|toISOString\(\).*slice|workingDraft|DEMO|type-g-o|type-smt|type-close|type-mdrr" src/application/selectors/dashboardAttention.ts src/main.tsx
git diff -- vite.config.ts package.json package-lock.json docs/superpowers/specs/2026-09-10-task-2.2-schedule-official-read-runtime-migration-design.md docs/superpowers/specs/2026-09-11-task-2.3-schedule-working-draft-publish-lifecycle-design.md docs/superpowers/specs/2026-09-12-pip-v2.2-dashboard-canonical-portfolio-design.md
```

Expected: no whitespace errors; no Demo Seed, selector clock, Draft read, dependency, deployment, or historical-spec changes; only the approved activation spec, this plan, focused production/tests, and two current documentation files are changed.

- [ ] **Step 6: Request one independent completed-change review**

Review against the approved spec and this plan, categorizing Critical/Important/Minor. Fix Critical and Important findings through a fresh failing test first; report Minor findings without scope expansion unless they reveal incorrect user-visible behavior.

- [ ] **Step 7: Preserve the human-verification boundary**

Do not commit, push, or merge. Report exact automated results, reviewer findings, manual Dashboard checks, diff/status, and that Change 1B was not started.
