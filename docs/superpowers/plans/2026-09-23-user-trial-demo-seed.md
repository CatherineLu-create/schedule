# PIP V2 User Trial Demo Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four reference-date-relative User Trial demo Projects and Current Published Schedules so the existing canonical Dashboard visibly demonstrates G/O Due, SMT Overdue, MDRR Due, and completed-milestone exclusion.

**Architecture:** A pure `createUserTrialDemoSeed(referenceDate)` factory returns only demo `Project` and `CanonicalProjectSchedule` collections. The browser entry point captures one local-calendar `DateOnly`, merges that seed after the unchanged canonical fixture collections, and passes the same date into `App`, so Dashboard attention continues through `selectDashboardAttention()` and Current Published Schedule authority without demo branches.

**Tech Stack:** React, TypeScript, Vite, Vitest, React Testing Library, and the existing in-memory `PrototypeState` architecture.

**Spec:** User-provided Change 1B plan brief dated 2026-09-23. Change 1A attention authority remains documented by `docs/superpowers/specs/2026-09-23-user-trial-dashboard-due-overdue-activation-design.md`.

## Global Constraints

- Work only in `D:\011superpowers-schedule-user-trial` on branch `user-trial-pages`, based on commit `d39030fb55224990daf228885ec64a4f04341fdf`.
- Do not change the Change 1A Due/Overdue selector, its four participating type IDs, its unique-Project counting, or its unavailable-result semantics.
- `Project.team` remains saved Team authority; demo Projects use `team: null` and add no Team behavior.
- `PrototypeState.schedules` remains Schedule authority; every demo Project owns exactly one canonical Schedule.
- Each demo Schedule contains one Published v1 snapshot and `workingDraft: null`.
- The seed factory receives an explicit `DateOnly` and contains no `Date.now()`, `new Date()`, UTC calendar conversion, or implicit clock read.
- All relative milestone dates use the existing `addDays()` helper.
- The real browser bootstrap captures one `toLocalDateOnly(new Date())` value and passes that exact value to both seed generation and `App.referenceDate`.
- Canonical Project/Schedule fixture modules and their deterministic tests remain unchanged.
- The only shared reference-fixture addition is a stable customer item whose display name is `DEMO`; it contains no moving data.
- Do not add `Project.isDemo`, another Project/Schedule model, stored attention flags, Dashboard card data, or demo-aware selector logic.
- Do not add a badge, backend, persistence, lifecycle change, Team change, or Project Master Mechanical/Cover/Leverage work.
- Keep GitHub Pages base `/schedule/`, dependencies, deployment workflow, master branch, and historical Task 2.2/2.3 specs unchanged.
- Do not commit, push, or merge during implementation unless the human later requests a verified checkpoint.
- Every production change follows RED -> GREEN with fixed test dates.

## Planned File Map

- Create `src/fixtures/userTrialDemoSeed.ts`: pure demo-only state fragment factory and stable demo Project IDs.
- Create `src/fixtures/userTrialDemoSeed.spec.ts`: deterministic construction, canonical selector, search/read-path, and isolation tests.
- Modify `src/fixtures/v2/referenceFixtures.ts`: add the deterministic `DEMO` customer catalog item required by the existing Project Master model.
- Modify `src/fixtures/v2/referenceFixtures.spec.ts`: include the new stable customer ID/display name in the exact reference-fixture contract.
- Modify `src/main.tsx`: expose the small runtime state merge helper and wire the real `#root` bootstrap with one shared reference-date snapshot.
- Modify `src/legacy/characterization/runtime.spec.tsx`: verify merged runtime visibility, search, Workspace navigation, Published Schedule display, and card wiring.
- Modify `src/fixtures/v2/README.md`: document that the moving User Trial seed is separate from canonical deterministic fixtures.

## Review Focus

- Calling the seed twice with the same fixed date must produce deeply equal content and stable IDs; Task 1 tests both calls.
- A hidden Portfolio milestone definition such as MDRR must remain present in its normal Workspace Published Schedule and qualify through the unchanged selector; Tasks 1 and 2 test this.
- The completed SMT must retain both Plan and Actual and be absent from both attention groups; Task 1 tests the exact dates and exclusion.
- Default test usage of `<App />` must keep the canonical five-Project fixture baseline, while only the real browser bootstrap receives the merged User Trial state; Task 2 tests both paths.
- Search/filter and Project Workspace access must operate from normal Portfolio rows rather than demo-specific UI logic; Task 2 searches `DEMO -` and opens a row through the existing action.

---

### Task 1: Isolated deterministic Demo Seed factory

**Files:**
- Create: `src/fixtures/userTrialDemoSeed.ts`
- Create: `src/fixtures/userTrialDemoSeed.spec.ts`
- Modify: `src/fixtures/v2/referenceFixtures.ts`
- Modify: `src/fixtures/v2/referenceFixtures.spec.ts`

**Interfaces:**
- Consumes:
  - `DateOnly` and `addDays(referenceDate, offset)`;
  - existing `Project`, `ProjectMaster`, and `CanonicalProjectSchedule` types;
  - existing ID constructors and `toScheduleVersionNumber(1)`;
  - milestone definitions `milestone-a1-a-g-o`, `milestone-a1-a-smt`, and `milestone-mdrr`;
  - existing status and product-line catalog items plus the new deterministic demo customer item.
- Produces:

```ts
export const userTrialDemoProjectIds: {
  readonly goDueSoon: ProjectId;
  readonly smtOverdue: ProjectId;
  readonly mdrrDueSoon: ProjectId;
  readonly completedMilestone: ProjectId;
};

export function createUserTrialDemoSeed(
  referenceDate: DateOnly,
): PrototypeState;
```

`PrototypeState` is used only as the existing `{ projects, schedules }` shape. The return value is a demo state fragment, not a second authority or stored runtime state.

- [ ] **Step 1: Write the failing customer and factory contract tests**

Add the exact customer reference expectation:

```ts
ids: ["dev-customer-acer", "dev-customer-b", "user-trial-demo-customer"],
names: ["Acer", "DEV Customer B", "DEMO"],
```

In the new seed test, use `referenceDate = dateOnly("2026-09-23")` and assert:

- four Projects appear in this exact order with IDs:
  - `user-trial-demo-project-go-due-soon`;
  - `user-trial-demo-project-smt-overdue`;
  - `user-trial-demo-project-mdrr-due-soon`;
  - `user-trial-demo-project-completed-milestone`;
- their single Published milestones use the matching stable IDs:
  - `user-trial-demo-milestone-go-due-soon`;
  - `user-trial-demo-milestone-smt-overdue`;
  - `user-trial-demo-milestone-mdrr-due-soon`;
  - `user-trial-demo-milestone-completed-smt`;
- names are exactly the four approved `DEMO - ...` names;
- every Project resolves Customer display to `DEMO`, has the reference year `2026`, a valid existing Product Line, one of the stable QCI names `DEMO-GO-DUE-SOON`, `DEMO-SMT-OVERDUE`, `DEMO-MDRR-DUE-SOON`, or `DEMO-COMPLETED-MILESTONE`, `identityAliases: []`, and `team: null`;
- four Schedules own those same IDs one-to-one, each has one Published v1 and `workingDraft: null`;
- a second call with the same reference date is deeply equal to the first call;
- seed Project IDs do not overlap the canonical Project fixture IDs.

Production mutations caught: insertion into canonical Project fixtures, generated/random IDs, hidden clock reads, unresolved Customer display, and Schedule ownership mismatch.

- [ ] **Step 2: Write the failing fixed-date Published Schedule and selector integration tests**

Assert the exact single-milestone snapshots:

| Project | Definition | Plan | Actual |
|---|---|---|---|
| `DEMO - G/O Due Soon` | `milestone-a1-a-g-o` | `2026-09-28` | `null` |
| `DEMO - SMT Overdue` | `milestone-a1-a-smt` | `2026-09-16` | `null` |
| `DEMO - MDRR Due Soon` | `milestone-mdrr` | `2026-10-03` | `null` |
| `DEMO - Completed Milestone` | `milestone-a1-a-smt` | `2026-09-20` | `2026-09-21` |

Run `validateCanonicalProjectSchedule(schedule, milestoneDefinitions)` for every Schedule and expect no issues. Pass the seed by itself to `selectDashboardAttention(seed, referenceDate)` and assert:

```ts
due.projectIds === [
  userTrialDemoProjectIds.goDueSoon,
  userTrialDemoProjectIds.mdrrDueSoon,
];
due.projectCount === 2;
overdue.projectIds === [userTrialDemoProjectIds.smtOverdue];
overdue.projectCount === 1;
```

Assert the completed Project ID is absent from both groups. Also select normal Portfolio rows, search for `DEMO -` through `filterPortfolioDashboardRows()`, and expect all four results without any demo-aware filtering branch.

Production mutations caught: duplicate business-rule logic in the seed, missing Actual, wrong offsets, Draft-backed data, MDRR omission, and hard-coded Dashboard results.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```powershell
npm run test:run -- src/fixtures/v2/referenceFixtures.spec.ts src/fixtures/userTrialDemoSeed.spec.ts
```

Expected: FAIL because the customer item and `userTrialDemoSeed` module do not exist.

- [ ] **Step 4: Add the deterministic DEMO customer reference**

Append this item to `customerReferenceFixtures` without changing existing items:

```ts
{
  id: toCatalogItemId("user-trial-demo-customer"),
  displayName: "DEMO",
  aliases: [],
  active: true,
  reviewStatus: "reviewed",
}
```

This is the smallest way to make the existing CatalogItem-backed Customer field display `DEMO`; it adds no domain field and remains deterministic.

- [ ] **Step 5: Implement the pure seed factory**

Use stable constants for the four Project IDs and stable demo-specific milestone IDs. Build each complete existing `ProjectMaster` shape with only these useful populated fields:

- `status: status-on-going`;
- `year: Number(referenceDate.slice(0, 4))`;
- `customer: user-trial-demo-customer`;
- `productLine: demo-product-line-aspire-refresh-id`;
- approved Project name and a stable scenario-specific QCI model name;
- a short demo scenario remark.

Keep category, panel, hardware, regulatory, leverage, cover, and mechanical values null through shared local empty-section constants. Do not add schema fields.

For each matching Schedule, construct Published v1 with `versionNote: "User Trial demo seed"`, `publishedAt` derived deterministically as `referenceDate + "T00:00:00.000Z"`, exactly one applicable milestone, and `workingDraft: null`. Generate only milestone Plan/Actual values through:

```ts
addDays(referenceDate, 5);
addDays(referenceDate, -7);
addDays(referenceDate, 10);
addDays(referenceDate, -3);
addDays(referenceDate, -2);
```

The `publishedAt` value is inert provenance metadata; no attention rule reads or compares it.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the same command. Expected: both fixture test files pass with zero failures.

---

### Task 2: Real User Trial bootstrap and canonical UI integration

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/legacy/characterization/runtime.spec.tsx`

**Interfaces:**
- Consumes: `createUserTrialDemoSeed(referenceDate)` plus unchanged `canonicalProjectFixtures` and `canonicalScheduleFixtures`.
- Produces:

```ts
export function createUserTrialPrototypeState(
  referenceDate: DateOnly,
): PrototypeState;
```

- Preserves: `AppProps`, `App` default canonical fixture state for existing component tests, all Project/Portfolio selectors, Current Published access, and Dashboard attention behavior.

- [ ] **Step 1: Write the failing runtime bootstrap integration test**

Import `createUserTrialPrototypeState` and build the state with fixed `2026-09-23`. Before rendering, call `selectDashboardAttention(runtimeState, referenceDate)` and assert that the expected demo IDs participate while the completed ID does not. Render:

```tsx
<App
  initialState={runtimeState}
  referenceDate={referenceDate}
/>
```

Then verify through public UI behavior:

- the Project summary reports nine total Projects at this checkpoint;
- the numeric Due/Overdue cards match the canonical selector result for the merged state, rather than assuming all future base fixtures contribute zero;
- searching `DEMO -` returns exactly the four demo Projects;
- Customer filter options include `DEMO`;
- clicking `DEMO - MDRR Due Soon` opens its normal Project Workspace;
- the header shows Project Name, Customer `DEMO`, year, and Product Line;
- Current Schedule shows `Published v01`, `MDRR`, and Plan `2026/10/03` through the existing read path.

Keep the existing default `<App referenceDate={dashboardReferenceDate} />` characterization at five canonical Projects. This catches accidental global replacement of deterministic fixtures.

- [ ] **Step 2: Run runtime characterization and verify RED**

Run:

```powershell
npm run test:run -- src/legacy/characterization/runtime.spec.tsx
```

Expected: FAIL because `createUserTrialPrototypeState` and the live demo merge do not exist.

- [ ] **Step 3: Implement the explicit state merge helper**

In `main.tsx`, add:

```ts
export function createUserTrialPrototypeState(
  referenceDate: DateOnly,
): PrototypeState {
  const demoSeed = createUserTrialDemoSeed(referenceDate);
  return {
    projects: [...canonicalProjectFixtures, ...demoSeed.projects],
    schedules: [...canonicalScheduleFixtures, ...demoSeed.schedules],
  };
}
```

Do not mutate either fixture array. Keep `initialPrototypeState` as the existing canonical-only default for direct `App` consumers and established tests.

- [ ] **Step 4: Share one runtime DateOnly snapshot at the browser boundary**

Replace only the real root render block with:

```tsx
const rootElement = document.getElementById("root");
if (rootElement !== null) {
  const referenceDate = toLocalDateOnly(new Date());
  ReactDOM.createRoot(rootElement).render(
    <App
      initialState={createUserTrialPrototypeState(referenceDate)}
      referenceDate={referenceDate}
    />,
  );
}
```

This is the sole new runtime clock read. `App` receives the value, so its existing nullish fallback does not read another clock, and both seed dates and attention calculations use the same `DateOnly` value.

- [ ] **Step 5: Run runtime and seed integration tests and verify GREEN**

Run:

```powershell
npm run test:run -- src/fixtures/userTrialDemoSeed.spec.ts src/legacy/characterization/runtime.spec.tsx
```

Expected: both files pass; no existing canonical-only runtime assertion changes except the newly added explicit merged-state test.

---

### Task 3: Isolation documentation, complete verification, and review

**Files:**
- Modify: `src/fixtures/v2/README.md`
- Preserve unchanged: `src/fixtures/v2/canonicalProjectFixtures.ts`, `src/fixtures/v2/canonicalScheduleFixtures.ts`, their tests, Change 1A selector/rules, deployment files, dependencies, and historical specs.

**Interfaces:** None; documentation records runtime seed ownership without becoming domain authority.

- [ ] **Step 1: Document the seed boundary**

Add a short User Trial section stating:

- `canonicalProjectFixtures` and `canonicalScheduleFixtures` remain fixed automated baselines;
- `createUserTrialDemoSeed(referenceDate)` owns only the four moving-date demo records;
- the browser bootstrap merges the two collections without mutation;
- all Dashboard results still derive through Current Published Schedule and `selectDashboardAttention()`.

- [ ] **Step 2: Run all focused Change 1B and protected Change 1A tests**

Run:

```powershell
npm run test:run -- src/fixtures/v2/referenceFixtures.spec.ts src/fixtures/v2/canonicalProjectFixtures.spec.ts src/fixtures/v2/canonicalScheduleFixtures.spec.ts src/fixtures/userTrialDemoSeed.spec.ts src/application/selectors/dashboardAttention.spec.ts src/legacy/characterization/runtime.spec.tsx
```

Expected: all named files pass with zero failures; canonical fixture tests remain unchanged and green.

- [ ] **Step 3: Run the complete test suite**

Run the complete suite with bounded worker concurrency, which avoids the already-observed low-memory fork startup timeouts without changing project configuration:

```powershell
npm run test:run -- --maxWorkers=1
```

Expected: every test file passes with exit code `0`.

- [ ] **Step 4: Run the production build**

Run:

```powershell
npm run build
```

Expected: TypeScript and Vite exit `0`; no generated build artifact becomes tracked and GitHub Pages base remains `/schedule/`.

- [ ] **Step 5: Audit scope and isolation**

Run:

```powershell
git diff --check
git status --short
git diff --stat
git diff -- src/application/selectors/dashboardAttention.ts src/fixtures/v2/canonicalProjectFixtures.ts src/fixtures/v2/canonicalScheduleFixtures.ts vite.config.ts package.json package-lock.json
rg -n "Date\.now|new Date|toISOString\(\).*slice|isDemo|workingDraft" src/fixtures/userTrialDemoSeed.ts src/main.tsx
```

Expected:

- no whitespace errors;
- no Change 1A selector, canonical Project/Schedule fixture, dependency, or deployment diff;
- no hidden seed clock or `isDemo` field;
- seed Schedules contain only `workingDraft: null`;
- the only `new Date()` relevant to Change 1B is the single browser-boundary snapshot passed to both seed and App;
- changed files are limited to this plan and the seven planned implementation/test/documentation files.

- [ ] **Step 6: Request one independent completed-change review**

Review the completed diff against this plan and the Change 1B brief. Categorize findings as Critical, Important, or Minor, with special attention to canonical-fixture mutation, separate clock reads, Customer resolution, stable ownership IDs, Completed exclusion, selector hard-coding, Demo leakage into Change 1A, and unrelated Project Master/deployment changes. Fix Critical and Important findings test-first; report Minor findings without broadening scope.

- [ ] **Step 7: Preserve the human-verification checkpoint**

Do not commit, push, or merge. Report exact focused/full/build results, reviewer findings, manual checks, diff/status, and that no later User Trial task was started. Wait for explicit human checkpoint authorization.
