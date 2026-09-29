# PIP V2 Schedule Baseline Milestone Revision Implementation Plan

> **Superseded behavior note (2026-09-29 human UI review):** The later approved correction keeps Working Drafts sparse, restores Design / ME Portion / Thermal to the active Add and Portfolio catalog, and uses 30 active definitions. The automatic 23-definition baseline merge and synthesis-only ID factory described below are historical planning context and are not the final implemented behavior.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the active Schedule baseline with complete A1/C1/C2, existing RAMP, and MDRR definitions; merge missing baseline occurrences into newly created Working Drafts; preserve historical definition IDs and Published snapshots; align Portfolio columns; and show concrete milestone names in Needs Attention.

**Architecture:** Separate the complete compatibility catalog from an explicit active baseline collection. Keep Published data immutable, and enhance only Working Draft creation to clone Current Published occurrences and append missing active baseline definitions as Not Applicable with blank dates. Continue exact-definition Portfolio projection and type-driven attention, while resolving concrete definition names only in the attention presentation layer.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Vite, Tailwind utility classes.

**Spec:** User-approved “Schedule Baseline Milestone Revision — PLAN-ONLY PHASE” brief dated 2026-09-29, following the read-only repository investigation at published checkpoint `0efe6e91fc94c0a2ba307eb9565b22895ff91350`.

## Global Constraints

- Work only in `D:\011superpowers-schedule-user-trial` on branch `user-trial-pages` from clean checkpoint `0efe6e91fc94c0a2ba307eb9565b22895ff91350`.
- Do not reset, discard, checkout, restore, rebase, commit, push, or merge unless a later human instruction explicitly authorizes it.
- Preserve `Project`, Project Master, Team, Dashboard Category/QCI PM filters, Schedule ownership, Current Published authority, Working Draft/Publish lifecycle semantics, Demo scenario dates/meaning, dependencies, backend/persistence, GitHub Pages configuration, and Vite base `/schedule/`.
- Never rewrite or fabricate Published history. A first Schedule remains an empty owner until the user starts a Working Draft.
- Preserve all legacy definitions needed to resolve historical Published/Draft occurrences; compatibility-only definitions must remain valid but must not drive the active baseline, Add menu, or normal Portfolio columns.
- Use the existing `MilestoneApplicability` union; newly synthesized baseline rows are `notApplicable` with `plan: null` and `actual: null`.
- Keep attention type-driven with the exact participating IDs `type-g-o`, `type-smt`, `type-close`, and `type-mdrr`. RAMP G/O and RAMP SMT continue to participate.
- Do not implement a parser, aliases, Project Master Export, a second Schedule authority, or a new persistence layer.
- Use TDD: establish RED, implement the minimum production change, and rerun the focused test to GREEN for each task.

## Final Catalog Structure

The smallest clean separation is three exported collections in `src/config/v2/referenceData.ts`:

```ts
export const activeBaselineMilestoneDefinitions: readonly MilestoneDefinition[];
export const compatibilityOnlyMilestoneDefinitions: readonly MilestoneDefinition[];
export const portfolioMilestoneDefinitions: readonly MilestoneDefinition[];
export const milestoneDefinitions: readonly MilestoneDefinition[];
```

- `activeBaselineMilestoneDefinitions`: the 23 ordered definitions below, including MDRR.
- `compatibilityOnlyMilestoneDefinitions`: the 13 retained historical definitions below; set `active: false` and `showInPortfolio: false`, but keep their IDs resolvable in the complete catalog.
- `portfolioMilestoneDefinitions`: the 22 active baseline definitions with `showInPortfolio: true`; MDRR stays excluded by its retained historical flag and remains the existing explicit Portfolio exception.
- `milestoneDefinitions`: the complete 36-definition validation catalog: active baseline plus compatibility-only definitions.

### Exact Active Baseline

| Order | Definition ID | Display Label | Stage | Type ID | Active Baseline? | Compatibility-only? |
|---:|---|---|---|---|---|---|
| 10 | `milestone-a1-a-g-o` | A1 G/O | A1-stage | `type-g-o` | Yes | No |
| 20 | `milestone-a1-a-smt` | A1 SMT | A1-stage | `type-smt` | Yes | No |
| 30 | `milestone-a1-a-test` | A1 Test | A1-stage | `type-test` | Yes | No |
| 40 | `milestone-a1-a-close` | A1 Close | A1-stage | `type-close` | Yes | No |
| 50 | `milestone-c1-c-g-o` | C1 G/O | C1-stage | `type-g-o` | Yes | No |
| 60 | `milestone-c1-c-smt` | C1 SMT | C1-stage | `type-smt` | Yes | No |
| 70 | `milestone-c1-c-pre-build` | C1 Pre-Build | C1-stage | `type-pre-build` | Yes | No |
| 80 | `milestone-c1-c-main-build` | C1 System Build | C1-stage | `type-system-build` | Yes | No |
| 90 | `milestone-c1-c-test` | C1 Test | C1-stage | `type-test` | Yes | No |
| 100 | `milestone-c1-close` | C1 Close | C1-stage | `type-close` | Yes | No |
| 110 | `milestone-c2-c-g-o` | C2 G/O | C2-stage | `type-g-o` | Yes | No |
| 120 | `milestone-c2-c-smt` | C2 SMT | C2-stage | `type-smt` | Yes | No |
| 130 | `milestone-c2-c-pre-build` | C2 Pre-Build | C2-stage | `type-pre-build` | Yes | No |
| 140 | `milestone-c2-c-main-build` | C2 System Build | C2-stage | `type-system-build` | Yes | No |
| 150 | `milestone-c2-c-test` | C2 Test | C2-stage | `type-test` | Yes | No |
| 160 | `milestone-c2-c-close` | C2 Close | C2-stage | `type-close` | Yes | No |
| 170 | `milestone-ramp-g-o` | RAMP G/O | RAMP-stage | `type-g-o` | Yes | No |
| 180 | `milestone-ramp-me-signoff` | ME signoff | RAMP-stage | `type-me-signoff` | Yes | No |
| 190 | `milestone-ramp-smt` | RAMP SMT | RAMP-stage | `type-smt` | Yes | No |
| 200 | `milestone-ramp-pre-build` | RAMP Pre-build | RAMP-stage | `type-pre-build` | Yes | No |
| 210 | `milestone-ramp-main-build` | RAMP Main build | RAMP-stage | `type-main-build` | Yes | No |
| 220 | `milestone-ramp-fcs` | FCS | RAMP-stage | `type-fcs` | Yes | No |
| 230 | `milestone-mdrr` | MDRR | MDRR | `type-mdrr` | Yes | No |

RAMP labels remain unchanged. `milestone-mdrr` retains `showInPortfolio: false` and its explicit MDRR column behavior.

### Exact Compatibility-only Definitions

| Order | Definition ID | Retained Label | Stage | Type ID |
|---:|---|---|---|---|
| 240 | `milestone-design-kickoff` | Kickoff | Design | `type-kickoff` |
| 250 | `milestone-design-id-fix` | ID fix | Design | `type-id-fix` |
| 260 | `milestone-me-portion-me-drawing` | ME drawing | ME Portion | `type-me-drawing` |
| 270 | `milestone-me-portion-mockup-dfm` | Mockup & DFM | ME Portion | `type-mockup-dfm` |
| 280 | `milestone-me-portion-tooling-start-t1` | Tooling start + T1 | ME Portion | `type-tooling` |
| 290 | `milestone-me-portion-me-material-c` | ME material for C | ME Portion | `type-me-material` |
| 300 | `milestone-thermal-module-c` | Thermal module for C | Thermal | `type-thermal-module` |
| 310 | `milestone-a-a2-a-g-o` | A G/O | A/A2-stage | `type-g-o` |
| 320 | `milestone-a-a2-a-smt` | A-SMT | A/A2-stage | `type-smt` |
| 330 | `milestone-a-a2-a-test` | A-Test | A/A2-stage | `type-test` |
| 340 | `milestone-a-a2-a-close` | A-Close | A/A2-stage | `type-close` |
| 350 | `milestone-c2-bios-frozen` | BIOS frozen | C2-stage | `type-bios-frozen` |
| 360 | `milestone-c2-golden-run` | Golden Run | C2-stage | `type-golden-run` |

These definitions stay in `milestoneDefinitions` so old Published/Draft occurrences remain valid. They are not Add choices and are not normal Portfolio columns. Existing occurrences remain visible in Schedule read/edit surfaces because those surfaces render the occurrence’s resolved definition, not the Add-choice list.

## Reusable and New Identities

- Reuse 15 existing baseline definition IDs: the existing A1 G/O/SMT/Test, all six C1, and all six C2 IDs.
- Add only `milestone-a1-a-close`.
- Reuse `type-g-o`, `type-smt`, `type-test`, `type-close`, `type-pre-build`, and `type-mdrr`.
- Add `type-system-build` with display name `System Build` and assign it only to the reused C1/C2 Main Build definition IDs.
- Keep `milestone-ramp-main-build -> type-main-build`, `milestone-ramp-g-o -> type-g-o`, and `milestone-ramp-smt -> type-smt` unchanged.
- Keep all existing StageGroup IDs unchanged.

## Proposed Portfolio Column Change

### Before

35 Schedule mappings:

- Design 2
- ME Portion 4
- Thermal 1
- A1/A 3
- conditional A2 4
- C1 6
- C2 8
- RAMP 6
- MDRR 1

Dashboard domain counts are currently `11 Project / 35 Schedule / 7 Team`, for 53 total columns.

### After

23 exact-definition Schedule mappings:

| Group | Column key | Label | Definition ID |
|---|---|---|---|
| A1 | `schedule:a1-stage:a-g-o` | A1 G/O | `milestone-a1-a-g-o` |
| A1 | `schedule:a1-stage:a-smt` | A1 SMT | `milestone-a1-a-smt` |
| A1 | `schedule:a1-stage:a-test` | A1 Test | `milestone-a1-a-test` |
| A1 | `schedule:a1-stage:a-close` | A1 Close | `milestone-a1-a-close` |
| C1 | `schedule:c1-stage:c-g-o` | C1 G/O | `milestone-c1-c-g-o` |
| C1 | `schedule:c1-stage:c-smt` | C1 SMT | `milestone-c1-c-smt` |
| C1 | `schedule:c1-stage:c-pre-build` | C1 Pre-Build | `milestone-c1-c-pre-build` |
| C1 | `schedule:c1-stage:c-main-build` | C1 System Build | `milestone-c1-c-main-build` |
| C1 | `schedule:c1-stage:c-test` | C1 Test | `milestone-c1-c-test` |
| C1 | `schedule:c1-stage:c1-close` | C1 Close | `milestone-c1-close` |
| C2 | `schedule:c2-stage:c-g-o` | C2 G/O | `milestone-c2-c-g-o` |
| C2 | `schedule:c2-stage:c-smt` | C2 SMT | `milestone-c2-c-smt` |
| C2 | `schedule:c2-stage:c-pre-build` | C2 Pre-Build | `milestone-c2-c-pre-build` |
| C2 | `schedule:c2-stage:c-main-build` | C2 System Build | `milestone-c2-c-main-build` |
| C2 | `schedule:c2-stage:c-test` | C2 Test | `milestone-c2-c-test` |
| C2 | `schedule:c2-stage:c-close` | C2 Close | `milestone-c2-c-close` |
| RAMP-stage | `schedule:ramp-stage:ramp-g-o` | RAMP G/O | `milestone-ramp-g-o` |
| RAMP-stage | `schedule:ramp-stage:me-signoff` | ME signoff | `milestone-ramp-me-signoff` |
| RAMP-stage | `schedule:ramp-stage:ramp-smt` | RAMP SMT | `milestone-ramp-smt` |
| RAMP-stage | `schedule:ramp-stage:ramp-pre-build` | RAMP Pre-build | `milestone-ramp-pre-build` |
| RAMP-stage | `schedule:ramp-stage:ramp-main-build` | RAMP Main build | `milestone-ramp-main-build` |
| RAMP-stage | `schedule:ramp-stage:fcs` | FCS | `milestone-ramp-fcs` |
| MDRR | `schedule:mdrr:mdrr` | MDRR | `milestone-mdrr` |

The resulting domain counts are `11 Project / 23 Schedule / 7 Team`, for 41 total columns. Remove the A2 conditional-schema rule; the resulting active schema is fixed and exact-definition-backed. Preserve existing keys for reused definitions so width state remains as stable as possible; only A1 Close adds a new key.

## Review Focus

- A Published snapshot containing compatibility-only occurrences must remain valid, clone unchanged into Draft, and keep those occurrences after baseline rows are merged; Tasks 1 and 2 add direct regressions.
- Multiple existing occurrences of one active baseline definition must all be preserved and must prevent synthesis of an extra baseline row; Task 2 covers this mutation-sensitive case.
- A failing or duplicate injected `MilestoneId` must make Working Draft creation fail without replacing canonical Schedule state; Task 2 validates the merged draft before returning success.
- Sparse canonical and Demo Published histories must remain byte-for-byte unchanged while their first Working Draft becomes baseline-complete; Task 3 covers both fixture families.
- RAMP G/O/SMT must remain attention-participating, while C1/C2 System Build stays excluded, and multiple same-type matches must render concrete names under one Project; Task 5 covers selector and presentation behavior.

---

### Task 1: Separate the Active Baseline from the Compatibility Catalog

**Files:**
- Modify: `src/config/v2/referenceData.ts:60-665`
- Modify: `src/config/v2/referenceData.spec.ts:220-440`

**Interfaces:**
- Consumes: existing `MilestoneDefinition`, StageGroup IDs, catalog helpers, and stable definition/type IDs.
- Produces: `activeBaselineMilestoneDefinitions`, `compatibilityOnlyMilestoneDefinitions`, the narrowed `portfolioMilestoneDefinitions`, the complete `milestoneDefinitions`, new `milestone-a1-a-close`, and new `type-system-build`.

- [ ] **Step 1: Write failing catalog identity and separation tests**

Require the exact 23-row active table and 13-row compatibility table above. Assert:

```ts
expect(activeBaselineMilestoneDefinitions).toHaveLength(23);
expect(portfolioMilestoneDefinitions).toHaveLength(22);
expect(compatibilityOnlyMilestoneDefinitions).toHaveLength(13);
expect(milestoneDefinitions).toHaveLength(36);
expect(activeBaselineMilestoneDefinitions.map(({ id }) => id)).toEqual([
  "milestone-a1-a-g-o",
  "milestone-a1-a-smt",
  "milestone-a1-a-test",
  "milestone-a1-a-close",
  // exact C1, C2, RAMP, MDRR order from the table above
]);
```

Also prove that the active and compatibility ID sets are disjoint, their union exactly equals the complete catalog, IDs and display orders are unique, and compatibility definitions are inactive/Portfolio-hidden but still reviewed and resolvable.

- [ ] **Step 2: Write failing label/type stability tests**

Assert exact labels and types for all 23 active definitions, including:

```ts
expect(byId("milestone-a1-a-close")).toMatchObject({
  name: "A1 Close",
  stageGroupId: "stage-a1",
  milestoneTypeId: "type-close",
  displayOrder: 40,
});
expect(byId("milestone-c1-c-main-build")).toMatchObject({
  name: "C1 System Build",
  milestoneTypeId: "type-system-build",
});
expect(byId("milestone-c2-c-main-build")).toMatchObject({
  name: "C2 System Build",
  milestoneTypeId: "type-system-build",
});
```

Assert `type-system-build` exists exactly once with display name `System Build`, while all RAMP definitions retain their current labels and type IDs. Assert `dashboardAttentionMilestoneTypeIds` remains exactly the existing four IDs.

- [ ] **Step 3: Run the catalog tests to verify RED**

Run:

```powershell
npm run test:run -- --maxWorkers=1 src/config/v2/referenceData.spec.ts
```

Expected: FAIL because the active/compatibility collections, A1 Close, System Build type, normalized labels, and final order do not exist.

- [ ] **Step 4: Implement the catalog separation and normalization**

Keep the existing `MilestoneDefinition` schema. Add `type-system-build`, retain `type-main-build`, define the exact active and compatibility collections above, and compose the complete catalog without deleting a historical ID. Do not add parser aliases in this change.

- [ ] **Step 5: Run Task 1 tests to GREEN**

Run the Step 3 command again. Expected: PASS.

---

### Task 2: Merge the Complete Baseline When Creating a Working Draft

**Files:**
- Modify: `src/application/commands/canonicalScheduleCommands.ts:20-175`
- Modify: `src/application/commands/canonicalScheduleCommands.spec.ts:35-205, 440-670`

**Interfaces:**
- Consumes: complete validation `CanonicalScheduleCommandContext`, `activeBaselineMilestoneDefinitions`, Current Published occurrences, and an injected Milestone ID factory.
- Produces:

```ts
export interface StartScheduleWorkingDraftInput {
  readonly activeBaselineDefinitions: readonly MilestoneDefinition[];
  readonly createMilestoneId: () => MilestoneId;
}

export function startScheduleWorkingDraft(
  schedule: CanonicalProjectSchedule,
  input: StartScheduleWorkingDraftInput,
  context: CanonicalScheduleCommandContext,
): StartScheduleWorkingDraftResult;
```

- [ ] **Step 1: Write failing complete-baseline creation tests**

For a Schedule with no Published version, inject deterministic IDs and assert that the new Draft contains all active baseline definitions exactly once, in active-baseline order, and every synthesized occurrence equals:

```ts
{
  milestoneId: expectedGeneratedId,
  milestoneDefinitionId: expectedDefinitionId,
  applicability: "notApplicable",
  plan: null,
  actual: null,
}
```

Assert no Published version is created or changed.

- [ ] **Step 2: Write failing merge/preservation tests**

Use a Current Published version containing:

- one active A1 G/O occurrence with dates;
- two existing occurrences for one other active definition;
- one compatibility-only Design occurrence.

Assert Draft creation clones all four occurrences unchanged, does not generate another occurrence for either present active definition, appends only missing active definitions, calls the ID factory exactly once per missing definition, and does not modify the input Schedule or Published arrays.

- [ ] **Step 3: Write failing lifecycle/error tests**

Assert:

- an already-existing Working Draft is returned unchanged and the factory is not called;
- a malformed Published definition fails before ID generation;
- a factory returning a duplicate Milestone ID makes the merged Draft fail normal draft validation and returns `validation-failed` without a replacement Schedule;
- repeated calls after a successful Schedule replacement do not add more baseline rows because the existing Draft path is idempotent.

- [ ] **Step 4: Run the command tests to verify RED**

Run:

```powershell
npm run test:run -- --maxWorkers=1 src/application/commands/canonicalScheduleCommands.spec.ts
```

Expected: FAIL because `startScheduleWorkingDraft()` currently only clones Current Published and accepts no baseline/ID-factory input.

- [ ] **Step 5: Implement the baseline merge**

At Working Draft creation only:

1. Validate the input Schedule against the complete compatibility catalog.
2. Clone every Current Published occurrence with no field changes, or start from an empty array.
3. Build a set of definition IDs already represented by the cloned occurrences.
4. Iterate `activeBaselineDefinitions` in its canonical order.
5. For each missing definition, call `createMilestoneId()` once, append a Not Applicable/null-date occurrence, and add that definition ID to the set.
6. Validate the completed Draft against the complete catalog before returning success.
7. Leave an already-existing Draft unchanged.

Do not sort or delete the stored occurrences; Schedule selectors continue to present them by `displayOrder` while preserving snapshot order for equal definitions.

- [ ] **Step 6: Run Task 2 tests to GREEN**

Run the Step 4 command again. Expected: PASS.

---

### Task 3: Wire Canonical Baseline Creation and Narrow the Add Menu

**Files:**
- Modify: `src/main.tsx:50-145, 285-345, 400-425`
- Modify: `src/application/commands/canonicalScheduleCommandIntegration.spec.ts:25-350`
- Modify: `src/scheduleWorkspace.spec.tsx:520-565`
- Modify: `src/legacy/characterization/runtime.spec.tsx:400-975`
- Verify unchanged: `src/fixtures/v2/canonicalScheduleFixtures.ts`
- Verify unchanged: `src/fixtures/userTrialDemoSeed.ts`
- Modify: `src/fixtures/v2/canonicalScheduleFixtures.spec.ts:15-80`
- Modify: `src/fixtures/userTrialDemoSeed.spec.ts:70-145`

**Interfaces:**
- Consumes: Task 1 `activeBaselineMilestoneDefinitions` and Task 2 `StartScheduleWorkingDraftInput`.
- Produces: runtime Working Draft creation using the active baseline and the existing `globalThis.crypto.randomUUID()`/`toMilestoneId()` convention; Add choices limited to the same 23 active definitions.

- [ ] **Step 1: Write failing command-integration tests**

Update integration calls to inject deterministic IDs. Assert:

- an empty canonical Schedule starts a 23-row Not Applicable Draft;
- Manta’s sparse Published snapshot retains its four exact occurrences, including compatibility-only Design/ME rows, and gains only the missing active definitions;
- its existing A1 G/O is not duplicated;
- edit/update/publish continues through the existing reducer/command flow and publishes the merged Draft only after explicit Publish.

- [ ] **Step 2: Write failing runtime and Add-menu tests**

In the real `App` path:

- open an empty canonical Project, start Edit, and require 23 ordered active baseline rows with Not Applicable and blank date inputs;
- confirm the Add selector contains exactly the 23 active labels in baseline order and omits Design, ME, Thermal, A/A2, BIOS Frozen, and Golden Run;
- switch A1 G/O from Not Applicable to Applicable using the existing applicability control and confirm the normal update command receives the exact existing `milestoneId`;
- open Manta and prove its compatibility-only Published rows remain visible after starting the merged Draft.

Do not change the component API merely to test the list; `ScheduleWorkspace` continues to receive a definition collection through its existing prop.

- [ ] **Step 3: Write sparse-history fixture regressions**

Keep fixture production files unchanged. Assert:

- canonical Published fixture arrays remain exactly as seeded and canonical fixtures still contain no Working Draft;
- Demo Published versions retain one scenario occurrence and their exact dates/IDs;
- running the canonical start command against a canonical or Demo Schedule produces the complete Draft without mutating the sparse Published snapshot.

- [ ] **Step 4: Run the integration/runtime slice to verify RED**

Run:

```powershell
npm run test:run -- --maxWorkers=1 src/application/commands/canonicalScheduleCommandIntegration.spec.ts src/scheduleWorkspace.spec.tsx src/fixtures/v2/canonicalScheduleFixtures.spec.ts src/fixtures/userTrialDemoSeed.spec.ts src/legacy/characterization/runtime.spec.tsx
```

Expected: FAIL because App does not supply the baseline/ID factory and the Add menu still receives the complete compatibility catalog.

- [ ] **Step 5: Wire the runtime boundary**

Call Task 2 with:

```ts
{
  activeBaselineDefinitions: activeBaselineMilestoneDefinitions,
  createMilestoneId: () => toMilestoneId(globalThis.crypto.randomUUID()),
}
```

This reuses the existing manual Add ID convention; deterministic tests inject their own factory. Continue passing the complete `milestoneDefinitions` through `CanonicalScheduleCommandContext` for validation, but pass `activeBaselineMilestoneDefinitions` to `ScheduleWorkspace` for Add choices.

- [ ] **Step 6: Run Task 3 tests to GREEN**

Run the Step 4 command again. Expected: PASS.

---

### Task 4: Replace Legacy Portfolio Columns with the Active Baseline Schema

**Files:**
- Modify: `src/portfolioDashboardColumns.ts:1-190`
- Modify: `src/portfolioDashboardColumns.spec.ts:1-90`
- Modify: `src/application/selectors/portfolioDashboardRows.spec.ts:85-120, 185-295`
- Modify: `src/portfolioDashboardTable.spec.tsx:55-135, 210-320`
- Modify: `src/portfolioDashboardView.spec.tsx:245-310`
- Modify: `src/legacy/characterization/runtime.spec.tsx:830-940, 1135-1165`
- Verify unchanged unless required by typing: `src/application/selectors/portfolioDashboardRows.ts`
- Verify unchanged unless required by rendering expectations: `src/portfolioDashboardTable.tsx`

**Interfaces:**
- Consumes: Task 1 `portfolioMilestoneDefinitions` with 22 active Portfolio definitions plus the existing explicit MDRR definition.
- Produces: the exact 23 mappings in the before/after table, fixed `11/23/7` domain counts, and no conditional A2 schema.

- [ ] **Step 1: Write failing exact-schema tests**

Replace the 35-column expectations with the exact 23 mapping keys, labels, definition IDs, subgroup order, and counts above. Require:

```ts
expect(portfolioDomainGroups).toEqual([
  { key: "project", label: "PROJECT INFORMATION", colSpan: 11 },
  { key: "schedule", label: "SCHEDULE", colSpan: 23 },
  { key: "team", label: "TEAM MEMBER", colSpan: 7 },
]);
expect(portfolioColumns).toHaveLength(41);
```

Assert no compatibility-only definition ID appears in normal Portfolio mappings and A1 Close appears exactly once.

- [ ] **Step 2: Write failing projection and rendering tests**

Require every Published Portfolio read to expose the 22 active Portfolio cells followed by MDRR. Cover:

- A1/C1/C2 exact-ID isolation for repeated G/O/SMT/Close types;
- A1 Close’s own cell;
- C1/C2 System Build labels with their reused definition IDs;
- Not Applicable presentation remaining `N/A` for normal columns;
- MDRR’s existing explicit blank rule remaining unchanged;
- compatibility-only Published occurrences remaining valid Schedule data but not gaining normal Portfolio columns.

- [ ] **Step 3: Replace A2 conditional-schema characterizations**

Delete only the obsolete `hasApplicableA2` behavior expectations. Replace them with a regression that filtering rows cannot change the fixed active Schedule column schema.

- [ ] **Step 4: Run the Portfolio slice to verify RED**

Run:

```powershell
npm run test:run -- --maxWorkers=1 src/portfolioDashboardColumns.spec.ts src/application/selectors/portfolioDashboardRows.spec.ts src/portfolioDashboardTable.spec.tsx src/portfolioDashboardView.spec.tsx src/legacy/characterization/runtime.spec.tsx
```

Expected: FAIL because the old 35-column schema and conditional A2 behavior remain.

- [ ] **Step 5: Implement the fixed active Portfolio schema**

Replace the mapping list with the exact 23 entries above, remove A2-specific schema filtering, and keep exact `MilestoneDefinitionId` cell matching. Do not create type-summary columns and do not change Project or Team columns.

- [ ] **Step 6: Run Task 4 tests to GREEN**

Run the Step 4 command again. Expected: PASS.

---

### Task 5: Show Concrete Definition Names in Needs Attention

**Files:**
- Modify: `src/portfolioDashboardView.tsx:45-150`
- Modify: `src/portfolioDashboardView.spec.tsx:20-165`
- Modify: `src/application/selectors/dashboardAttention.spec.ts:140-220`
- Modify: `src/legacy/characterization/runtime.spec.tsx:1000-1135`
- Verify unchanged: `src/application/selectors/dashboardAttention.ts`

**Interfaces:**
- Consumes: unchanged `DashboardAttentionMatch.milestoneDefinitionId`, complete `milestoneDefinitions`, unchanged Due/Overdue groups, and Current Published-only selector results.
- Produces: attention presentation items with the concrete definition label instead of only the generic type label.

- [ ] **Step 1: Write attention-classification regression tests**

Without modifying the selector, add one Published schedule containing due RAMP G/O and RAMP SMT plus nonparticipating Test, Pre-Build, C1/C2 System Build, RAMP Main Build, ME signoff, and FCS. Assert only RAMP G/O and RAMP SMT join the existing G/O/SMT/Close/MDRR matches. Retain exact four-type-set, 14-day, overdue, Actual, Not Applicable, unique-Project, and Working Draft isolation assertions.

- [ ] **Step 2: Write failing concrete-name presentation tests**

Use one Project with multiple qualifying definitions of the same type and assert:

- the Project button appears once;
- every match is listed;
- the detail contains `A1 G/O`, `C1 G/O`, `C2 SMT`, `RAMP G/O`, or `MDRR` plus its Plan date as applicable;
- repeated generic-only `G/O` labels are not used as the detail identity;
- navigation still sends the exact `ProjectId` once.

- [ ] **Step 3: Run the attention slice to verify RED**

Run:

```powershell
npm run test:run -- --maxWorkers=1 src/application/selectors/dashboardAttention.spec.ts src/portfolioDashboardView.spec.tsx src/legacy/characterization/runtime.spec.tsx
```

Expected: selector classification remains mostly GREEN, while concrete-name presentation assertions fail because the view resolves `milestoneTypeCatalog` labels.

- [ ] **Step 4: Implement the presentation-only label change**

In `attentionProjectPresentations()`, resolve each retained `milestoneDefinitionId` through the complete definition map and expose `definitionLabel: definition.name`. Render that concrete label with the existing Plan date. Remove the now-unused type-label lookup from the view. Do not change `selectDashboardAttention()` or its result type.

- [ ] **Step 5: Run Task 5 tests to GREEN**

Run the Step 3 command again. Expected: PASS.

---

### Task 6: Update Current Documentation and Verify the Complete Revision

**Files:**
- Modify: `README.md` current Schedule/Portfolio/attention sections only
- Modify: `src/fixtures/v2/README.md:68-150`
- Verify: every production/test file listed above

**Interfaces:**
- Consumes: completed active baseline, compatibility catalog, merge behavior, Portfolio schema, and attention presentation.
- Produces: current-state documentation and final verification evidence only.

- [ ] **Step 1: Update current-state documentation**

Document:

- the 23-definition active baseline and separate complete compatibility catalog;
- Working Draft baseline merge and Not Applicable/null-date defaults;
- sparse Published and Demo history preservation;
- exact stage-specific Portfolio columns and 23-column Schedule schema;
- type-driven attention with RAMP G/O/SMT included and concrete definition names shown;
- no active parser/resolver and no persistence change.

Do not modify historical specifications or prior plans.

- [ ] **Step 2: Run the complete focused matrix**

Run:

```powershell
npm run test:run -- --maxWorkers=1 src/config/v2/referenceData.spec.ts src/application/commands/canonicalScheduleCommands.spec.ts src/application/commands/canonicalScheduleCommandIntegration.spec.ts src/application/selectors/scheduleSelectors.spec.ts src/application/selectors/dashboardAttention.spec.ts src/application/selectors/portfolioDashboardRows.spec.ts src/portfolioDashboardColumns.spec.ts src/portfolioDashboardTable.spec.tsx src/portfolioDashboardView.spec.tsx src/scheduleWorkspace.spec.tsx src/fixtures/v2/canonicalScheduleFixtures.spec.ts src/fixtures/userTrialDemoSeed.spec.ts src/legacy/characterization/runtime.spec.tsx
```

Expected: all focused files and tests pass.

- [ ] **Step 3: Run the full suite and production build**

Run:

```powershell
npm run test:run -- --maxWorkers=1
npm run build
```

Expected: both commands exit 0; no generated build artifact becomes tracked.

- [ ] **Step 4: Run whitespace and protected-scope audits**

Run:

```powershell
git diff --check
git status --short
git diff --stat
git diff -- package.json package-lock.json vite.config.ts .github src/domain/project src/domain/team src/application/commands/teamCommands.ts src/application/selectors/dashboardProjectRows.ts src/portfolioDashboardFilters.ts docs/superpowers/specs
```

Expected: no protected-scope diff; no dependency, deployment, Project/Team, Dashboard filter, historical-spec, persistence, or Project Master Export change.

- [ ] **Step 5: Perform the completed-change review**

Review the implementation against these failure modes:

- full 23-row baseline for empty and sparse Published owners;
- no duplicate synthesized definition and no Published mutation;
- compatibility-only occurrence validity/visibility without Add/Portfolio exposure;
- System Build versus RAMP Main Build type separation;
- RAMP attention participation and concrete attention labels;
- fixed 23-column Portfolio schema and exact-ID isolation;
- Demo dates/meaning and sparse Published history unchanged.

Fix Critical/Important findings test-first without broadening scope. Report Minor findings explicitly.

- [ ] **Step 6: Stop at the human-verification checkpoint**

Report files changed, active/compatibility definition tables, baseline merge evidence, focused/full test results, build, diff check, reviewer findings, manual verification steps, and git status. Do not commit, push, merge, or start another feature without explicit authorization.

## Manual Verification Targets

1. Open a Project with no Published Schedule, start Edit, and confirm all 23 active baseline rows appear in the exact approved order as Not Applicable with blank dates.
2. Open Manta or a Demo Project, start Edit, and confirm its Published occurrence is unchanged while missing baseline rows are added only to the Working Draft.
3. Confirm compatibility-only Published rows remain visible in the Schedule but are absent from the Add menu and normal Portfolio columns.
4. Mark one synthesized row Applicable, enter dates, Publish, and confirm Current Schedule and the exact stage-specific Portfolio column update.
5. Confirm C1/C2 System Build labels use the reused definition IDs and do not appear in Needs Attention.
6. Confirm RAMP G/O and RAMP SMT still appear in Upcoming/Overdue when otherwise eligible.
7. Confirm one Project with multiple qualifying G/O/SMT/Close/MDRR milestones appears once with each concrete definition name and date listed beneath it.
8. Confirm Demo scenario dates, Project identity, Dashboard filters, Project Master, Team, `/schedule/`, and deployment behavior remain unchanged.

## Implementation Size and Risks

**Estimated size: Medium.** The domain schema and lifecycle state machine remain unchanged, but the work spans reference catalog separation, deterministic Working Draft initialization, runtime ID injection, a fixed Portfolio schema migration, attention presentation, fixtures/characterizations, and documentation.

No unresolved business ambiguity remains in the approved direction. The main architecture risks are accidental deletion of compatibility IDs, generating duplicate Milestone IDs during a multi-row merge, unintentionally rewriting sparse Published fixtures, and allowing Portfolio or attention presentation to regress from exact definition identity to same-name/type matching. The tasks above pin each risk with focused tests.
