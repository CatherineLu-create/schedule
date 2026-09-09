# Task 2.1 — Project/Master Runtime Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan slice-by-slice.
> Each slice stops for external review before any checkpoint commit.

**Goal:** Cut the production prototype's Project/Master read and write authority over to canonical V2 `Project` aggregates while preserving the current Dashboard and partial Project Master UI and explicitly gating Schedule and Team.

**Architecture:** Slice 1 adds a pure, framework-neutral projection from `PrototypeState.projects` through `selectOfficialProjectSources()` to readonly Dashboard/export rows. Slice 2 atomically replaces the legacy runtime collection and whole-object selection with `PrototypeState` plus `prototypeReducer`, `selectedProjectId`, Task 1.7 commands, and Task 1.8/1.9 workflow interpretations; narrow UI-only form and duplicate-review helpers keep the large root understandable but own no business state.

**Tech Stack:** TypeScript, React, ReactDOM, Vitest, React Testing Library, jsdom, Vite, Tailwind CSS, and SheetJS (`xlsx`).

**Spec:**
`docs/superpowers/specs/2026-09-08-project-master-runtime-migration-design.md`

## Global Constraints

- `Project` remains the canonical aggregate and Single Source of Truth.
- `PrototypeState.projects` becomes the sole writable production Project/Master collection.
- The runtime starts with exactly the five Projects in `canonicalProjectFixtures`; it does not merge or bootstrap the legacy Dashboard rows.
- `ProjectId` remains immutable primary identity. Project names and QCI names are not IDs.
- Selection stores only `selectedProjectId: ProjectId | null`; a selected canonical Project is derived with `getProjectById()` and is never stored as a second mutable business object.
- `DashboardProjectRow` is readonly presentation data. It is never a command input, reducer payload, form persistence model, or writable business authority.
- Official Portfolio values come only from current Master, latest Published Schedule, and current Team through `selectOfficialProjectSources()`.
- A Schedule Working Draft never contributes official Dashboard values. A Working Draft is not the same thing as transient unsaved Create/Edit form state.
- Dashboard retains the exact current labels and order: Year, Customer, Product Line, Project Name, QCI Model Name, Panel Size, CPU, GPU, Project Status, Current Stage, and MDRR.
- Dashboard Project Name remains a presentation label; its value is derived from `master.basicInformation.stnProjectName`.
- Missing or unresolved display values render as `"-"`. There is no legacy Dashboard fallback.
- Current Stage and MDRR both render as `"-"` because no approved derivation/selection rule exists at this revision.
- Search, filters, dialog state, form values, duplicate-review state, workflow feedback, active resource, and unsaved changes remain transient React/controller state and are not added to `Project` or `PrototypeState`.
- The existing shared 13-field Create/Edit UI remains: STN Project Name (the dialog relabel of Project Name), QCI Model Name, Acer Model Name, Acer Marketing Name, Year, Customer, Product Line, Panel Size, CPU, GPU, SSID, RMN, and Project Status.
- No field is added solely because it exists in the eight-section `ProjectMaster` schema. No full Master editor or Master completeness UI/policy is added.
- Customer, Product Line, Panel Size, CPU, and GPU controls consume the current V2 development reference fixtures. Project Status consumes `statusCatalog`. General text values remain text inputs.
- React does not duplicate required-field, duplicate-identity, validation, normalization, alias, or default business rules.
- Create uses `createProject()` and `interpretCreateProjectResult()`. Customer=Acer and Status=RFQ remain application-command defaults supplied through the existing `CreateProjectContext`, not UI fallback expressions.
- Create form mapping uses the committed `CreateProjectMasterInput` directly; it does not use `Partial<ProjectMaster>` or restore a narrow compatibility input.
- A browser UUID is allocated once when a Create attempt opens. Duplicate review and Create Anyway reuse that same `ProjectId`, complete Master candidate, `qciPm`, and original context.
- Review Existing is the backward duplicate action and Create Anyway is the forward action. One resolvable match opens directly after Review Existing; multiple matches require explicit immutable-ID selection; zero resolvable matches neither select by name nor create implicitly.
- Create Anyway calls the existing `confirmCreateProjectAnyway()` second-command boundary. It does not accept the first candidate directly.
- Successful Create dispatches `projectAdded`, selects the created ID, closes Create, and opens Workspace on Project Master.
- Edit starts from the current complete `project.master` and overwrites only the 13 visible fields. Every hidden Master leaf is preserved exactly.
- Edit uses `updateProjectMaster()` and `interpretUpdateProjectMasterResult()`. Blocking does not dispatch; Advisory-only and no-issue results complete through `projectReplaced`.
- Identity alias/history behavior stays inside `updateProjectMaster()`; UI code never edits `identityAliases`.
- Cancel discards transient editor values only. Master remains current saved, non-versioned state; no Master Working Draft is introduced.
- Project Master is the Workspace landing resource. Schedule and Team remain visible, disabled, and labeled `Migration pending`; active resource state cannot point at either disabled resource.
- Canonical Workspace must not read, initialize, render, or mutate the app-global legacy Schedule or legacy Team map as selected-Project data.
- Needs Attention retains its shell and displays `No items requiring attention.` without hardcoded Project-name warnings or a new warning engine.
- Export uses all canonical rows from the same Dashboard projector, independent of Dashboard filters. It does not use Draft or legacy values.
- Legacy files and isolated Schedule/Team implementations may remain physically present. This task performs no mass cleanup.
- Do not introduce a router, Provider, Context/store framework, repository, service, generic adapter, persistence, backend, authentication, or permissions architecture.
- Do not redesign the Project schema, reducer, identity normalization, validation, Schedule commands, or Team commands.
- Do not migrate Schedule or Team and do not begin Task 2.2 or any later slice.
- Every production behavior change follows RED → GREEN. A failure must demonstrate the missing approved behavior, not a typo, broken fixture, or unrelated import error.
- Each major slice ends with fresh verification and an exact changed-file/status report, then stops for external review with nothing staged, no commit, and no push.

---

## File Map

### Slice 1 — pure Dashboard projection boundary

- Create `src/application/selectors/dashboardProjectRows.ts` — defines the readonly Task 2.1 Dashboard/export row and pure single/collection projection functions. This module consumes canonical state, the official-source selector, and the existing V2 reference sources; it owns no state and imports no React.
- Create `src/application/selectors/dashboardProjectRows.spec.ts` — proves canonical projection, exact view-model typing, reference resolution, missing/unresolved behavior, official-Schedule boundaries, Draft isolation, fixed Current Stage/MDRR behavior, and collection projection.
- Inspect but do not modify `src/application/selectors/portfolioSources.ts` and `src/application/selectors/portfolioSources.spec.ts` — they remain the authority for latest-Published-only source selection.
- Inspect but do not modify `src/dashboardColumns.ts` — its keys, labels, order, and widths remain unchanged in Slice 1.
- Do not modify `src/main.tsx` in Slice 1; the new projection is intentionally unused by the production runtime until the atomic Slice 2 cutover.

### Slice 2 — atomic canonical runtime cutover

- Create `src/projectMasterForm.ts` — defines transient UI form types plus pure canonical-to-form, Create-input, and preserve-then-overwrite Edit mappings for exactly the current 13 fields. It owns no React or business state.
- Create `src/projectMasterForm.spec.ts` — proves complete Create input construction, command-default omission semantics, catalog ID preservation, canonical empty values, round-trip form initialization, and hidden-field preservation on Edit.
- Create `src/duplicateProjectReview.tsx` — focused presentation component for the existing Task 1.8 duplicate decision, including one/multiple/zero resolvable-match behavior. It owns only transient presentation mode.
- Create `src/duplicateProjectReview.spec.tsx` — tests the one-match direct open, multiple-match explicit choice, and zero-resolvable safe branch without manufacturing command results.
- Modify `src/main.tsx` — performs the atomic authority cutover, consumes Slice 1 rows, wires UUID selection, commands/interpreters/reducer, preserves Dashboard/dialog presentation, gates resources, empties Needs Attention, and switches export.
- Modify `src/legacy/characterization/runtime.spec.tsx` — deliberately replaces obsolete legacy-authority assertions with Task 2.1 runtime migration coverage. Keeping this path preserves the characterization safety-net role while changing its expected authority from 33 legacy rows to five canonical Projects.
- Inspect but do not modify `src/dashboardColumns.ts` and `src/dashboardColumns.test.ts` — current Dashboard labels/order already match the approved design.
- Inspect but do not modify `src/projectMaster.ts` and `src/projectMaster.test.ts` — legacy types/helpers remain for history and disconnected legacy coverage; active `App`/Dashboard/Create/Edit code stops importing their Project/Master write helpers.
- Inspect but do not modify `src/application/state/prototypeReducer.ts`, `src/application/commands/projectCommands.ts`, or `src/application/workflow/workflowInterpretation.ts` — Task 2.1 consumes their committed APIs without redesign.

### Why the two-slice boundary is safe

Slice 1 is independently reviewable because it introduces only pure reads and tests; production still has one legacy authority until Slice 2. Slice 2 may contain several internal TDD cycles, but there is no external-review stop inside it: root state, selection, Dashboard, Workspace, Create, Edit, export, and legacy Project/Master disconnection must all be green together before review. This prevents an approved checkpoint with two writable Project/Master universes.

---

## Locked New Interfaces

### Dashboard projection API

Create `src/application/selectors/dashboardProjectRows.ts` with exactly this public surface:

```ts
import type { ProjectId } from "../../domain/shared/ids";
import type { PrototypeState } from "../state/prototypeState";

export interface DashboardProjectRow {
  readonly projectId: ProjectId;
  readonly year: string;
  readonly customer: string;
  readonly productLine: string;
  readonly projectName: string;
  readonly qciModelName: string;
  readonly acerModelName: string;
  readonly acerMarketingName: string;
  readonly panelSize: string;
  readonly cpu: string;
  readonly gpu: string;
  readonly ssid: string;
  readonly rmn: string;
  readonly projectStatus: string;
  readonly currentStage: string;
  readonly mdrr: string;
}

export function selectDashboardProjectRow(
  state: PrototypeState,
  projectId: ProjectId,
): DashboardProjectRow | null;

export function selectDashboardProjectRows(
  state: PrototypeState,
): readonly DashboardProjectRow[];
```

The 11 Dashboard fields are `year`, `customer`, `productLine`, `projectName`, `qciModelName`, `panelSize`, `cpu`, `gpu`, `projectStatus`, `currentStage`, and `mdrr`. The four additional strings—`acerModelName`, `acerMarketingName`, `ssid`, and `rmn`—exist because the current Export Summary includes them; `projectId` is the immutable row identity. No other `ProjectMaster` field belongs in the row.

### Transient Project Master form API

Create `src/projectMasterForm.ts` with this public surface:

```ts
import type { CreateProjectMasterInput } from "./application/commands/projectCommands";
import type { ProjectMaster } from "./domain/project/projectMaster";
import type { CatalogItemId } from "./domain/shared/ids";

export type CatalogSelection = CatalogItemId | "";

export interface ProjectMasterForm {
  readonly stnProjectName: string;
  readonly qciModelName: string;
  readonly acerModelName: string;
  readonly acerMarketingName: string;
  readonly year: string;
  readonly customerId: CatalogSelection;
  readonly productLineId: CatalogSelection;
  readonly panelSizeId: CatalogSelection;
  readonly cpuId: CatalogSelection;
  readonly gpuId: CatalogSelection;
  readonly ssid: string;
  readonly rmn: string;
  readonly statusId: CatalogSelection;
}

export const emptyProjectMasterForm: ProjectMasterForm;

export function toProjectMasterForm(
  master: ProjectMaster,
): ProjectMasterForm;

export function toCreateProjectMasterInput(
  form: ProjectMasterForm,
): CreateProjectMasterInput;

export function overwriteProjectMasterFromForm(
  currentMaster: ProjectMaster,
  form: ProjectMasterForm,
): ProjectMaster;
```

`CatalogSelection` exists only for HTML select state. Empty text maps to canonical `null`; an empty Customer/Status selection is omitted from `CreateProjectMasterInput` so `createProject()` applies the existing injected Acer/RFQ defaults. An unknown non-empty canonical catalog ID remains in Edit form state and is preserved if untouched; the select renders a temporary `"-"` option for that current ID instead of converting it to `null`.

### Duplicate review component API

Create `src/duplicateProjectReview.tsx` with this public surface:

```tsx
import type { DashboardProjectRow } from "./application/selectors/dashboardProjectRows";
import type { DuplicateProjectDecisionRequest } from "./application/workflow/workflowInterpretation";
import type { ProjectId } from "./domain/shared/ids";

export interface DuplicateProjectReviewProps {
  readonly decision: DuplicateProjectDecisionRequest;
  readonly matchingRows: readonly DashboardProjectRow[];
  readonly onBackToForm: () => void;
  readonly onCreateAnyway: () => void;
  readonly onSelectProject: (projectId: ProjectId) => void;
}

export function DuplicateProjectReview(
  props: DuplicateProjectReviewProps,
): React.ReactElement;
```

The component consumes the interpreter's existing `reviewExisting` backward and `createAnyway` forward actions. It does not run commands, select by name, mutate a Project, or own canonical state.

---

## Slice 1 — Pure Dashboard Projection Boundary

### Task 1: Add the canonical Dashboard/export projector

**Files:**

- Create: `src/application/selectors/dashboardProjectRows.spec.ts`
- Create: `src/application/selectors/dashboardProjectRows.ts`
- Verify unchanged: `src/main.tsx`

**Interfaces:**

- Consumes: `selectOfficialProjectSources(state: PrototypeState, projectId: ProjectId): OfficialProjectSources | null`, `PrototypeState`, `ProjectId`, `statusCatalog`, and the five V2 development reference fixture collections.
- Produces: `DashboardProjectRow`, `selectDashboardProjectRow()`, and `selectDashboardProjectRows()` exactly as locked above.

- [ ] **Step 1: Add five focused projector tests before creating the production module.**

In `src/application/selectors/dashboardProjectRows.spec.ts`, add these exact cases:

1. `projects current canonical Master values into the preserved Dashboard and export fields`
2. `renders unresolved catalog IDs and missing canonical values as hyphens`
3. `keeps Current Stage and MDRR unsupported when no Published Schedule exists`
4. `ignores Working Draft data and does not infer from the latest Published Schedule`
5. `projects one row per canonical Project in canonical collection order`

Use a complete clone of `devProject002` for case 1 so non-empty `modelRegulatory` values exercise the export-only fields:

```ts
const displayProject: Project = {
  ...devProject002,
  master: {
    ...devProject002.master,
    modelRegulatory: {
      acerModelName: "Acer Display Model",
      acerMarketingName: "Acer Display Marketing",
      ssid: "DISPLAY-SSID",
      rmn: "DISPLAY-RMN",
    },
  },
};
const state: PrototypeState = { projects: [displayProject] };

expect(selectDashboardProjectRow(state, displayProject.id)).toEqual({
  projectId: displayProject.id,
  year: "2027",
  customer: "Acer",
  productLine: "DEV Line Alpha",
  projectName: "DEV Project Alpha",
  qciModelName: "DEV-QCI-ALPHA-01",
  acerModelName: "Acer Display Model",
  acerMarketingName: "Acer Display Marketing",
  panelSize: '16"',
  cpu: "DEV CPU Alpha",
  gpu: "DEV GPU Alpha",
  ssid: "DISPLAY-SSID",
  rmn: "DISPLAY-RMN",
  projectStatus: "On Going",
  currentStage: "-",
  mdrr: "-",
});
```

Use `toCatalogItemId("unresolved-dashboard-reference")` for unresolved values, legal `null` values for missing values, `devProject001` for no Published Schedule, and `devProject004` for a Project that has both latest Published and Working Draft data. Assert the row is unchanged if only `workingDraft` is replaced and assert both Schedule-derived values stay `"-"`; pair this with the existing `portfolioSources.spec.ts` regression in the review gate rather than mocking the official selector.

Add an `expectTypeOf<DashboardProjectRow>().toEqualTypeOf<...>()` assertion using the exact readonly interface from the locked API so a mutable or extra public field fails compilation.

- [ ] **Step 2: Run the focused spec and record a meaningful RED.**

Run:

```powershell
npm run test:run -- src/application/selectors/dashboardProjectRows.spec.ts
```

Expected RED: Vitest cannot resolve `./dashboardProjectRows` or its exports because the Task 2.1 projection boundary does not exist. Fix only fixture/import mistakes if the failure is unrelated, then rerun until the missing projector is the failure.

- [ ] **Step 3: Implement catalog and missing-value display helpers inside the new selector module.**

Use private helpers with these semantics:

```ts
function displayText(value: string | null): string {
  return value === null || value.trim().length === 0 ? "-" : value;
}

function displayYear(value: number | null): string {
  return value === null ? "-" : String(value);
}

function resolveCatalogDisplay(
  id: CatalogItemId | null,
  catalog: readonly CatalogItem<CatalogItemId>[],
): string {
  if (id === null) return "-";
  return catalog.find((item) => item.id === id)?.displayName ?? "-";
}
```

Import the existing V2 sources accurately:

```ts
import { statusCatalog } from "../../config/v2/referenceData";
import {
  cpuReferenceFixtures,
  customerReferenceFixtures,
  gpuReferenceFixtures,
  panelSizeReferenceFixtures,
  productLineReferenceFixtures,
} from "../../fixtures/v2/referenceFixtures";
```

Do not add fallback labels or copy any option list from `projectMaster.ts`.

- [ ] **Step 4: Implement the single-row selector through the official-source boundary.**

Use `selectOfficialProjectSources(state, projectId)`. Return `null` when it returns `null`. Construct the locked row from `sources.master`, resolve the six catalog-backed values from their existing sources, and set both Schedule fields explicitly to `"-"`:

```ts
export function selectDashboardProjectRow(
  state: PrototypeState,
  projectId: ProjectId,
): DashboardProjectRow | null {
  const sources = selectOfficialProjectSources(state, projectId);
  if (sources === null) return null;

  const basic = sources.master.basicInformation;
  const hardware = sources.master.platformHardware;
  const regulatory = sources.master.modelRegulatory;

  return {
    projectId,
    year: displayYear(basic.year),
    customer: resolveCatalogDisplay(basic.customer, customerReferenceFixtures),
    productLine: resolveCatalogDisplay(basic.productLine, productLineReferenceFixtures),
    projectName: displayText(basic.stnProjectName),
    qciModelName: displayText(basic.qciModelName),
    acerModelName: displayText(regulatory.acerModelName),
    acerMarketingName: displayText(regulatory.acerMarketingName),
    panelSize: resolveCatalogDisplay(basic.panelSize, panelSizeReferenceFixtures),
    cpu: resolveCatalogDisplay(hardware.cpu, cpuReferenceFixtures),
    gpu: resolveCatalogDisplay(hardware.gpu, gpuReferenceFixtures),
    ssid: displayText(regulatory.ssid),
    rmn: displayText(regulatory.rmn),
    projectStatus: resolveCatalogDisplay(basic.status, statusCatalog),
    currentStage: "-",
    mdrr: "-",
  };
}
```

Do not read `sources.latestPublishedSchedule` yet because neither Current Stage nor MDRR has an approved rule. Calling the official selector still fixes the eligible source boundary and prevents access to `workingDraft`.

- [ ] **Step 5: Implement collection projection without storing rows.**

Map `state.projects` in its canonical order and return each non-null row:

```ts
export function selectDashboardProjectRows(
  state: PrototypeState,
): readonly DashboardProjectRow[] {
  return state.projects.flatMap((project) => {
    const row = selectDashboardProjectRow(state, project.id);
    return row === null ? [] : [row];
  });
}
```

Do not cache or mutate this result in the selector module.

- [ ] **Step 6: Run the focused projector spec to GREEN.**

Run:

```powershell
npm run test:run -- src/application/selectors/dashboardProjectRows.spec.ts
```

Expected GREEN: one spec file and the five planned tests pass. Report Vitest's actual count and zero failures.

- [ ] **Step 7: Run the Slice 1 selector/Foundation regression matrix.**

Run each command fresh:

```powershell
npm run test:run -- src/application/selectors/dashboardProjectRows.spec.ts src/application/selectors/projectSelectors.spec.ts src/application/selectors/portfolioSources.spec.ts
npm run test:run -- src/application/commands/projectCommands.spec.ts src/application/workflow/workflowInterpretation.spec.ts
npm run test:run -- src/fixtures/v2/referenceFixtures.spec.ts src/fixtures/v2/canonicalProjectFixtures.spec.ts src/fixtures/v2/teamCandidateFixtures.spec.ts src/fixtures/v2/scheduleCandidateFixtures.spec.ts src/fixtures/v2/teamTemplateFixtures.spec.ts
npm run test:run
npm run build
git diff --check
git status --short
```

Expected: all focused and full tests pass; the production build passes; only the already-known Vite large-chunk warning is acceptable if unchanged; `git diff --check` has no whitespace errors.

- [ ] **Step 8: Prove Slice 1 stayed read-only and within scope.**

Run:

```powershell
git diff --name-only
git diff --stat
git diff -- src/main.tsx
git status --short
```

Required changed files exactly:

```text
src/application/selectors/dashboardProjectRows.spec.ts
src/application/selectors/dashboardProjectRows.ts
```

Required `src/main.tsx` diff: no output. Inspect the selector imports and body to confirm no React, command, reducer, Draft, state mutation, legacy Dashboard, or export-side effect is present.

### Slice 1 external review gate — do not commit yet

Report the two changed files, the RED evidence, focused test count, selector/Foundation regression results, full-suite result, build result and warning, `git diff --check`, and `git status --short`. STOP FOR EXTERNAL REVIEW with nothing staged, no commit, and no push. Do not begin Slice 2 until a separate human-reviewed prompt authorizes it.

---

## Slice 2 — Atomic Canonical Runtime Cutover

There is no external-review checkpoint between the following internal tasks. The Slice 2 executor may stop on a failure, but must not present a partially migrated runtime as a reviewable success. Slice 2 is reviewable only after all Project/Master reads and writes use canonical state together.

### Task 2: Add pure transient form mappings

**Files:**

- Create: `src/projectMasterForm.spec.ts`
- Create: `src/projectMasterForm.ts`

**Interfaces:**

- Consumes: committed `ProjectMaster` and `CreateProjectMasterInput` shapes.
- Produces: `CatalogSelection`, `ProjectMasterForm`, `emptyProjectMasterForm`, `toProjectMasterForm()`, `toCreateProjectMasterInput()`, and `overwriteProjectMasterFromForm()` exactly as locked above.

- [ ] **Step 1: Write four form-mapping tests before the module exists.**

Add these exact cases to `src/projectMasterForm.spec.ts`:

1. `builds a complete Create Master from exactly the 13 visible form fields`
2. `omits blank Customer and Status so command-owned defaults remain authoritative`
3. `initializes Edit form from canonical values and preserves an unresolved catalog ID`
4. `overwrites only visible Edit fields and preserves every hidden Master section`

For the Create assertion, use a fully populated form and prove the result has all eight canonical sections. Assert visible strings map to their canonical locations, catalog selections stay `CatalogItemId`, and these hidden fields use existing legal `null` values:

```ts
expect(input.basicInformation.category).toBeNull();
expect(input.platformHardware.pcbNumber).toBeNull();
expect(input.platformHardware.housingNumber).toBeNull();
expect(Object.values(input.leverage).every((value) => value === null)).toBe(true);
expect(Object.values(input.cover).every((value) => value === null)).toBe(true);
expect(Object.values(input.mechanical.product).every((value) => value === null)).toBe(true);
expect(Object.values(input.mechanical.package).every((value) => value === null)).toBe(true);
expect(input.other.remark).toBeNull();
```

For blank Customer/Status, assert the returned `basicInformation` does not own either optional property:

```ts
expect(input.basicInformation).not.toHaveProperty("customer");
expect(input.basicInformation).not.toHaveProperty("status");
```

For preserve-then-overwrite, clone `devProject003.master` into a rich starting Master and give every hidden group representative non-null values: a catalog-backed `category`, `pcbNumber`, `housingNumber`, at least two leverage ProjectIds, all four cover IDs from `coverCatalog`, all eight mechanical measurements, and a non-empty `other.remark`. Change all 13 visible values, then assert `category`, `pcbNumber`, `housingNumber`, `leverage`, `cover`, `mechanical`, and `other` equal that rich original. This prevents a reconstruction-from-null implementation from passing accidentally. Assert no `identityAliases`, Schedule, or Team value appears in this helper's input/output.

- [ ] **Step 2: Run the form spec to verify a missing-module RED.**

Run:

```powershell
npm run test:run -- src/projectMasterForm.spec.ts
```

Expected RED: `./projectMasterForm` does not exist. Correct only test setup or fixture mistakes if needed.

- [ ] **Step 3: Implement exact empty/text/year/catalog conversions.**

Define the empty form without domain defaults:

```ts
export const emptyProjectMasterForm: ProjectMasterForm = {
  stnProjectName: "",
  qciModelName: "",
  acerModelName: "",
  acerMarketingName: "",
  year: "",
  customerId: "",
  productLineId: "",
  panelSizeId: "",
  cpuId: "",
  gpuId: "",
  ssid: "",
  rmn: "",
  statusId: "",
};
```

Use these private conversion rules:

```ts
const textOrNull = (value: string): string | null =>
  value.trim().length === 0 ? null : value;

const catalogOrNull = (value: CatalogSelection): CatalogItemId | null =>
  value === "" ? null : value;

function yearOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
```

`yearOrNull` is serialization, not a second business validator. `createProject()` remains the authority that rejects a missing Year.

- [ ] **Step 4: Implement `toCreateProjectMasterInput()` with complete canonical shape and only approved empty values.**

Use conditional spreads for Customer/Status so blanks are omitted rather than defaulted in UI code:

```ts
basicInformation: {
  year: yearOrNull(form.year),
  category: null,
  productLine: catalogOrNull(form.productLineId),
  panelSize: catalogOrNull(form.panelSizeId),
  stnProjectName: textOrNull(form.stnProjectName),
  qciModelName: textOrNull(form.qciModelName),
  ...(form.customerId === "" ? {} : { customer: form.customerId }),
  ...(form.statusId === "" ? {} : { status: form.statusId }),
},
```

Populate `platformHardware.cpu/gpu` and all four `modelRegulatory` fields from visible form values. Set only the non-exposed canonical leaves listed in Step 1 to `null`. Do not invent empty strings, hyphens, default catalog IDs, leverage targets, cover selections, measurements, remarks, or QCI PM values.

- [ ] **Step 5: Implement canonical form initialization and preserve-then-overwrite Edit.**

`toProjectMasterForm()` converts canonical `null` to `""`, year to a decimal string, and keeps any non-null catalog ID even if current fixtures cannot resolve it.

`overwriteProjectMasterFromForm()` must start with the existing object graph and replace only visible fields:

```ts
return {
  ...currentMaster,
  basicInformation: {
    ...currentMaster.basicInformation,
    status: catalogOrNull(form.statusId),
    year: yearOrNull(form.year),
    customer: catalogOrNull(form.customerId),
    productLine: catalogOrNull(form.productLineId),
    panelSize: catalogOrNull(form.panelSizeId),
    stnProjectName: textOrNull(form.stnProjectName),
    qciModelName: textOrNull(form.qciModelName),
  },
  platformHardware: {
    ...currentMaster.platformHardware,
    cpu: catalogOrNull(form.cpuId),
    gpu: catalogOrNull(form.gpuId),
  },
  modelRegulatory: {
    acerModelName: textOrNull(form.acerModelName),
    acerMarketingName: textOrNull(form.acerMarketingName),
    ssid: textOrNull(form.ssid),
    rmn: textOrNull(form.rmn),
  },
};
```

Do not construct `Project`, touch aliases, or invoke validation in this module.

- [ ] **Step 6: Run the focused form spec to GREEN.**

Run:

```powershell
npm run test:run -- src/projectMasterForm.spec.ts
```

Expected GREEN: one spec file and the four planned tests pass.

### Task 3: Add the focused duplicate-review presentation component

**Files:**

- Create: `src/duplicateProjectReview.spec.tsx`
- Create: `src/duplicateProjectReview.tsx`

**Interfaces:**

- Consumes: existing `DuplicateProjectDecisionRequest` plus readonly projected matching rows.
- Produces: `DuplicateProjectReview` with the locked props above.

- [ ] **Step 1: Write three component tests for one, multiple, and zero resolvable rows.**

Add these exact cases:

1. `opens the sole resolvable Project when Review Existing is chosen`
2. `shows every resolvable match and waits for an explicit ProjectId choice`
3. `keeps Back to form and Create Anyway actionable when no match resolves`

Use projected rows with distinct `projectId`, Year, Product Line, Project Name, and QCI Model Name. Use the existing interpreter-produced decision shape:

```ts
const decision: DuplicateProjectDecisionRequest = {
  kind: "duplicateProject",
  matchingProjectIds: rows.map((row) => row.projectId),
  issues: [],
  actions: [
    { id: "reviewExisting", direction: "backward" },
    { id: "createAnyway", direction: "forward" },
  ],
};
```

In the one-match test, click Review Existing and assert `onSelectProject` receives the sole ID without another selection screen. In the multiple test, assert no selection occurs on Review Existing, both QCI names appear, then click the second match and assert its exact ID. In the zero test, assert no selection or implicit Create, then independently assert Back to form and Create Anyway invoke their supplied callbacks.

- [ ] **Step 2: Run the component spec to RED.**

Run:

```powershell
npm run test:run -- src/duplicateProjectReview.spec.tsx
```

Expected RED: the component module/export is absent.

- [ ] **Step 3: Implement the UI-only duplicate component.**

Use local `showMatches` React state only. Render `decision.issues` as non-blocking feedback. Render the two entries in `decision.actions` with labels `Review Existing` and `Create Anyway`, preserving their backward/forward orientation. The Review Existing handler is exact:

```ts
if (matchingRows.length === 1) {
  onSelectProject(matchingRows[0]!.projectId);
  return;
}
setShowMatches(true);
```

When multiple rows resolve, render a button per row whose visible context includes `year`, `productLine`, `projectName`, and `qciModelName`; pass only `row.projectId` on selection. When zero resolve, render `No matching Projects are currently available.` plus Back to form and Create Anyway. Never inspect names for identity and never call a command.

- [ ] **Step 4: Run the component spec to GREEN.**

Run:

```powershell
npm run test:run -- src/duplicateProjectReview.spec.tsx
```

Expected GREEN: one spec file and the three planned tests pass.

### Task 4: Establish runtime migration RED coverage

**Files:**

- Modify: `src/legacy/characterization/runtime.spec.tsx`
- Modify only for testability in this task: `src/main.tsx`

**Interfaces:**

- Consumes: the current DOM bootstrap behavior, then the exported `App` component after the testability adjustment.
- Produces: 11 isolated runtime tests covering the approved authority cutover. It does not add a new test framework.

- [ ] **Step 1: Change the existing characterization's initial assertion to the canonical five-Project expectation and run it before production authority changes.**

Keep the current dynamic-import bootstrap for this first RED. Assert the table body has five rows and includes `DEV Empty Project` while omitting `Manta_16`:

```ts
expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(6);
expect(screen.getByText("DEV Empty Project")).toBeInTheDocument();
expect(screen.queryByText("Manta_16")).not.toBeInTheDocument();
```

Run:

```powershell
npm run test:run -- src/legacy/characterization/runtime.spec.tsx
```

Expected meaningful RED: the legacy runtime still renders its JSON-backed Projects, so the canonical name/count assertions fail. A missing import or invalid fixture is not sufficient.

- [ ] **Step 2: Make only the minimal App export/bootstrap testability adjustment.**

Change `function App()` to `export function App()`. Replace the unconditional non-null root assertion at the bottom of `src/main.tsx` with:

```tsx
const rootElement = document.getElementById("root");
if (rootElement !== null) {
  ReactDOM.createRoot(rootElement).render(<App />);
}
```

This owns no state and does not change browser behavior because `index.html` supplies `#root`. It lets React Testing Library render a fresh `App` per test without creating multiple unmanaged roots.

- [ ] **Step 3: Rewrite the characterization into 11 isolated Task 2.1 runtime tests.**

Import `render`, `cleanup`, `fireEvent`, `screen`, and `within` from React Testing Library, use `afterEach(cleanup)`, and render `<App />` in each test. Keep the file at its current path because its responsibility remains end-to-end characterization of the production React root.

Add these exact test cases and assertions:

1. `renders exactly five canonical Dashboard rows with preserved columns, search, and filters`
   - assert the 11 column headers in exact order;
   - assert five body rows and all five canonical STN names;
   - search `DEV-QCI-DRAFT-04`, then clear;
   - filter Product Line to `DEV Line Alpha` and assert only Projects 002/003 remain;
   - prove filter options come from projected labels, not legacy options.
2. `opens the selected canonical Project Master by ProjectId and gates Schedule and Team`
   - click `DEV Project Alpha` within the row whose QCI value is `DEV-QCI-ALPHA-02`;
   - assert Project Header has `data-project-id="dev-project-003"` and canonical Master values;
   - assert Project Master is active;
   - assert Schedule and Team each show `Migration pending` and their Open buttons are disabled;
   - clicking disabled controls leaves Project Master active and no Schedule table or Team editor appears.
3. `shows canonical-safe attention and exports all canonical rows despite active filters`
   - assert `No items requiring attention.` and absence of the six legacy warning names;
   - activate a filter yielding fewer than five rows;
   - click Export and inspect the mocked `XLSX.utils.json_to_sheet` input: length five, canonical names only, and currentStage/mdrr hyphens.
4. `rejects missing Create fields without adding a Project`
   - open Create, assert the exact 13 visible labels with `STN Project Name` replacing dialog `Project Name`;
   - save blank values;
   - assert Year, Product Line, and STN feedback from the rejected command, dialog remains open, and returning to Dashboard still shows five rows.
5. `creates an ordinary canonical Project with one UUID and opens Project Master`
   - mock `crypto.randomUUID()` to a valid fixed UUID;
   - populate valid Year, Product Line, and STN Project Name values, plus other visible fields useful to the existing Create mapping/runtime assertion;
   - intentionally leave Customer and Project Status blank and do not choose options for either control;
   - submit through the real `createProject()` and `interpretCreateProjectResult()` path;
   - assert successful canonical Create, Workspace landing on Project Master, the fixed `data-project-id`, Customer displayed as `Acer`, Project Status displayed as `RFQ`, and no legacy Project mutation path;
   - assert `crypto.randomUUID()` was called exactly once.
6. `opens the sole duplicate match directly after Review Existing`
   - enter the unique business identity of `devProject001`;
   - assert duplicate review, choose Review Existing, and assert the sole fixture's ID opens without a second selection click.
7. `lists all duplicate matches and opens only the explicitly chosen ProjectId`
   - enter the shared identity of `devProject002`/`devProject003`;
   - choose Review Existing;
   - assert both QCI names and context rows, no Workspace yet, then choose Project 003 and assert its exact ID.
8. `creates a duplicate anyway with the UUID allocated for the original attempt`
   - mock one fixed UUID and submit the shared duplicate identity;
   - click Create Anyway;
   - assert Project Master opens with that same fixed ID and the new Project's Master values;
   - assert `crypto.randomUUID` was called exactly once.
9. `edits through the Master command, preserves hidden fields, and retains ProjectId`
   - open `devProject003`, edit all visible fields and rename STN/QCI;
   - assert the `updateProjectMaster` mock's input preserves original `category`, `pcbNumber`, `housingNumber`, `leverage`, `cover`, `mechanical`, and `other`;
   - let the mock delegate to the real command and assert its result owns the previous-name aliases;
   - save, assert unchanged Project ID, updated header, and updated Dashboard row after Back.
10. `keeps a blocked Edit open without replacement and completes an Advisory-only Edit`
    - return a blocking `UpdateProjectMasterResult` once from the command mock and assert the editor/candidate feedback remains while header state is unchanged;
    - return an advisory-only result for the next Save and assert the dialog closes, replacement displays, and advisory feedback remains present;
    - do not mock the interpreter.
11. `cancels Edit and discards only transient form changes`
    - change several visible values, cancel, and assert the canonical header and reopened form still show saved values.

Use a hoisted partial module mock that delegates to the real `updateProjectMaster()` by default and overrides only the two disposition-orchestration cases. Do not mock `createProject()`, `prototypeReducer`, selectors, or workflow interpreters. Mock SheetJS side effects only:

```ts
vi.mock("../../application/commands/projectCommands", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../application/commands/projectCommands")>();
  return { ...actual, updateProjectMaster: vi.fn(actual.updateProjectMaster) };
});

vi.mock("xlsx", () => ({
  utils: {
    json_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
    sheet_to_json: vi.fn(() => []),
  },
  writeFile: vi.fn(),
  read: vi.fn(),
}));
```

- [ ] **Step 4: Run the expanded runtime spec and record behavioral REDs.**

Run:

```powershell
npm run test:run -- src/legacy/characterization/runtime.spec.tsx
```

Expected REDs include legacy JSON rows instead of five canonical rows, legacy Schedule landing instead of Project Master, enabled Schedule/Team resources, missing command-driven duplicate UI, and legacy object replacement. Fix test mechanics only if a failure is unrelated to those missing runtime behaviors.

### Task 5: Perform the atomic runtime authority cutover

**Files:**

- Modify: `src/main.tsx`
- Consume unchanged: `src/application/selectors/dashboardProjectRows.ts`
- Consume unchanged: `src/projectMasterForm.ts`
- Consume unchanged: `src/duplicateProjectReview.tsx`

**Interfaces:**

- Consumes: `prototypeReducer`, `PrototypeState`, `canonicalProjectFixtures`, `getProjectById`, the Slice 1 selectors, Task 1.7 Create/Edit commands, Task 1.8/1.9 interpretations, current V2 reference sources, and `devTeamTemplateV2` for the existing Create context.
- Produces: one canonical runtime authority and the approved Dashboard/Create/Edit/Workspace behavior.

- [ ] **Step 1: Replace root Project state and selection as one coherent state boundary.**

Remove production imports of `dashboardProjectRows.json`, `dashboardProjectsFromWorksheetRows`, `buildProjectFromForm`, `updateProjectFromForm`, `toProjectForm`, `dashboardExportRow`, legacy `ProjectForm`, and `projectStatusOptions` from active runtime paths.

Initialize and derive state exactly:

```ts
const initialPrototypeState: PrototypeState = {
  projects: canonicalProjectFixtures,
};

const [state, dispatch] = React.useReducer(
  prototypeReducer,
  initialPrototypeState,
);
const [selectedProjectId, setSelectedProjectId] =
  React.useState<ProjectId | null>(null);
const selectedCanonicalProject =
  selectedProjectId === null ? null : getProjectById(state, selectedProjectId);
const dashboardRows = selectDashboardProjectRows(state);
```

Use `type Page = "dashboard" | "workspace"` and `type WorkspaceResource = "projectMaster"`. On an unresolved selected ID, clear selection, close Edit and pending duplicate-review state, reset active resource to Project Master, and return to Dashboard without name lookup.

Perform that cleanup in an effect, never during render:

```ts
React.useEffect(() => {
  if (selectedProjectId !== null && selectedCanonicalProject === null) {
    setSelectedProjectId(null);
    setIsEditProjectOpen(false);
    setPendingDuplicateCreate(null);
    setActiveResource("projectMaster");
    setPage("dashboard");
  }
}, [selectedProjectId, selectedCanonicalProject]);
```

While an unresolved ID is awaiting effect cleanup, the render path must not render Workspace. Render the safe Dashboard fallback instead. Do not dispatch or call a state setter during render, add a router/state machine, loop on the unresolved ID, or fall back to name-based lookup.

- [ ] **Step 2: Switch Dashboard rendering, search, filters, selection, Needs Attention, and export to rows.**

Change Dashboard props to:

```ts
{
  readonly projects: readonly DashboardProjectRow[];
  readonly onCreateProject: () => void;
  readonly onOpenProject: (projectId: ProjectId) => void;
}
```

Map the unchanged `ProjectListColumnKey` values to row properties:

```ts
const values: Record<ProjectListColumnKey, React.ReactNode> = {
  year: row.year,
  customer: row.customer,
  productLine: row.productLine,
  name: <span className="font-medium">{row.projectName}</span>,
  qciProjectName: row.qciModelName,
  size: row.panelSize,
  cpu: row.cpu,
  gpu: row.gpu,
  projectStatus: <StatusBadge status={row.projectStatus} />,
  currentStage: row.currentStage,
  mdrr: row.mdrr,
};
```

Search the six current searchable display strings and derive the existing five filter option sets from the readonly rows. Row keys and clicks use `row.projectId` only. Replace hardcoded Needs Attention lists with the exact empty text.

Change the Dashboard export function to accept `readonly DashboardProjectRow[]` and format the existing 15 Export Summary columns from those rows. Continue passing all `dashboardRows`, never `filteredProjects`, to Export.

Change `StatusBadge` to accept a display `string`. The text it renders is exactly `DashboardProjectRow.projectStatus`; unresolved or null canonical status has already become `"-"` in the projector. Use a presentation-only `Record<string, string>` for the six current catalog labels (`RFQ`, `Kick off`, `Pending`, `On Going`, `MP`, `EOL`) and a neutral CSS-class fallback for an unfamiliar already-resolved display string. That fallback changes styling only: it must not invent or substitute a display label, convert labels back into canonical IDs, or write any fallback string into state.

- [ ] **Step 3: Wire the Project Master Workspace to the canonical Project and disable migration islands.**

Open a row by setting its ID, `activeResource = "projectMaster"`, and `page = "workspace"`. Project Workspace accepts the canonical `Project` plus its derived `DashboardProjectRow`; edit initialization always uses `project.master`, never the row. Put `data-project-id={project.id}` on the Project Header region so runtime tests can prove selection and UUID reuse without exposing or storing another identity value.

Render a Project Master resource card as enabled/active. Render Schedule and Team cards with `Migration pending` and native disabled buttons. Remove Schedule/version/Team props and handlers from canonical Workspace and do not render `ScheduleSection`, `TeamMembersSection`, version selection, Schedule export, or Working Draft from this path. Existing legacy component implementations can remain below as unreachable code.

If the disconnected `WorkingDraft` still needs the legacy type, retain only an explicitly aliased type import such as `DashboardProject as LegacyDashboardProject`; it must not appear in `App`, Dashboard, Project Workspace, Create, Edit, reducer, or selection state.

- [ ] **Step 4: Replace Project Dialog's legacy form with the controlled 13-field canonical form.**

Make `ProjectDialog` controlled by `value: ProjectMasterForm` and `onChange: (form: ProjectMasterForm) => void`. Give it `role="dialog"`/an accessible name, field-level Create errors, command/workflow issue display, and the existing Cancel/Save labels.

Use `STN Project Name` only for the dialog label. Keep the remaining 12 labels unchanged. Render Customer, Product Line, Panel Size, CPU, GPU, and Project Status as catalog selects from their exact existing V2 sources; the other seven inputs remain text inputs.

Use one private catalog control with this contract rather than six option lists:

```tsx
function ProjectCatalogSelect({
  emptyLabel,
  label,
  onChange,
  options,
  value,
}: {
  readonly emptyLabel: string;
  readonly label: string;
  readonly onChange: (value: CatalogSelection) => void;
  readonly options: readonly CatalogItem<CatalogItemId>[];
  readonly value: CatalogSelection;
}): React.ReactElement;
```

Convert a non-empty DOM option value with `toCatalogItemId()` and pass `""` through unchanged. The control resolves only `displayName`; it never writes the label into form or canonical state.

For a current non-empty unresolved catalog ID, add one selected option with visible `"-"` so Edit does not erase the ID. Blank Product Line/Panel/CPU/GPU means canonical `null`; blank Customer/Status on Create means use command default. Do not use legacy option strings or persist display labels.

- [ ] **Step 5: Wire Create through one allocated UUID, command, and interpreter.**

Use transient state equivalent to:

```ts
interface PendingDuplicateCreate {
  readonly input: CreateProjectInput;
  readonly context: CreateProjectContext;
  readonly decision: DuplicateProjectDecisionRequest;
}
```

When opening Create, set `createCandidateId` once with `toProjectId(globalThis.crypto.randomUUID())`, reset the controlled form, and clear previous feedback. On Save, build the complete Master with `toCreateProjectMasterInput(form)`, set `qciPm: null`, and create a context using the current `state.projects` plus:

```ts
const createDefaults: CreateProjectDefaults = {
  customerId: toCatalogItemId("dev-customer-acer"),
  statusId: toCatalogItemId("status-rfq"),
  teamTemplate: devTeamTemplateV2,
};
```

Import `toCatalogItemId` from `./domain/shared/ids` (alongside the existing ID helpers used by `main.tsx`). These stable IDs are the existing Acer development-reference fixture and RFQ status-catalog entry. Do not depend on catalog array ordering or search catalogs by display label. Passing the IDs in `CreateProjectContext` is the existing application contract; do not copy them into form serialization or introduce a configuration subsystem.

Interpret the command result:

- `rejected`: no dispatch, keep Create open, and translate only `missingFields` into inline Year/Product Line/STN messages; show duplicate-ID rejection as command feedback.
- `duplicateProject`: store the same input/context plus the returned decision; do not dispatch.
- `completed`: dispatch `{ type: "projectAdded", project: result.project }`, select `result.project.id`, close/reset Create, set Project Master active, open Workspace, and retain any result issues as transient feedback.

- [ ] **Step 6: Wire all duplicate-review branches without creating another decision type.**

Resolve `decision.matchingProjectIds` against current canonical state with `getProjectById()`, discard unavailable IDs, and project resolved Projects for display with `selectDashboardProjectRow()`. Never resolve by name.

Render `DuplicateProjectReview` with those rows. Selection sets the chosen immutable ID, closes Create/review, sets Project Master active, and opens Workspace without dispatch. Back to form clears only pending review so the controlled form and allocated ID remain.

Create Anyway calls:

```ts
const interpretation = confirmCreateProjectAnyway(
  pendingDuplicate.input,
  pendingDuplicate.context,
);
```

Handle its completed result through the same `projectAdded` completion function. A rejected result remains feedback with no dispatch. Do not call `crypto.randomUUID()` again, mutate the stored context, or accept `reviewRequired.candidate` directly.

- [ ] **Step 7: Wire Edit with preserve-then-overwrite and Task 1.9 interpretation.**

On Edit, initialize the controlled form from `selectedCanonicalProject.master`. On Save:

```ts
const candidateMaster = overwriteProjectMasterFromForm(
  selectedCanonicalProject.master,
  editForm,
);
const commandResult = updateProjectMaster(selectedCanonicalProject, {
  master: candidateMaster,
});
const interpretation = interpretUpdateProjectMasterResult(commandResult);
```

For `blocked`, keep the dialog open, preserve candidate/issues as feedback, and do not dispatch. For `completed`, dispatch `{ type: "projectReplaced", project: interpretation.result.project }`, retain the same `selectedProjectId`, close Edit, keep Project Master active, and expose advisories as transient feedback. Cancel closes/reset Edit without a command or dispatch.

Do not pass completeness fields, add a rejected Edit branch, add an override, add a `WorkflowDecisionRequest`, or edit aliases in React.

- [ ] **Step 8: Remove the last active legacy Project/Master write and selected-object paths.**

Delete the legacy `projects/setProjects`, `selectedProject/setSelectedProject`, `teamMembersByProject` linkage, app-level `versionHistory`/Schedule selection state and handlers, length-based ID creation, legacy form helpers, and the draft navigation branch from active App rendering. Keep legacy Schedule/Team functions only as physically present and unreachable migration-island code.

Confirm every active Project/Master write in `main.tsx` is one of:

```ts
dispatch({ type: "projectAdded", project: createdProject });
dispatch({ type: "projectReplaced", project: updatedProject });
```

and each dispatched Project came from the corresponding Task 1.7 command result.

- [ ] **Step 9: Run the focused Slice 2 specs to GREEN.**

Run:

```powershell
npm run test:run -- src/projectMasterForm.spec.ts src/duplicateProjectReview.spec.tsx src/legacy/characterization/runtime.spec.tsx
```

Expected GREEN: all four form tests, three duplicate component tests, and 11 runtime tests pass. Report actual file/test counts and zero failures.

### Task 6: Complete Slice 2 verification and authority audit

**Files:**

- Verify all Slice 1 and Slice 2 files.
- Modify no file unless a failing check exposes a Task 2.1 defect within the approved scope.

- [ ] **Step 1: Run focused projector, runtime, state, selector, command, and workflow tests.**

Run each fresh:

```powershell
npm run test:run -- src/application/selectors/dashboardProjectRows.spec.ts
npm run test:run -- src/projectMasterForm.spec.ts src/duplicateProjectReview.spec.tsx src/legacy/characterization/runtime.spec.tsx
npm run test:run -- src/application/commands/projectCommands.spec.ts
npm run test:run -- src/application/workflow/workflowInterpretation.spec.ts
npm run test:run -- src/application/state/prototypeReducer.spec.ts src/application/selectors/projectSelectors.spec.ts src/application/selectors/portfolioSources.spec.ts
```

Expected: all files pass. The executor reports actual counts. This plan adds five projector tests; Slice 2 adds four form tests and three duplicate-review tests and replaces the one legacy runtime test with 11 migration tests, a net increase of 17 tests during Slice 2.

- [ ] **Step 2: Run Task 1.7 command/validation regression.**

Run:

```powershell
npm run test:run -- src/application/commands/projectCommands.spec.ts src/application/commands/scheduleCommands.spec.ts src/application/commands/teamCommands.spec.ts src/application/commands/projectCommandIntegration.spec.ts src/domain/project/projectMasterValidation.spec.ts src/domain/schedule/scheduleValidation.spec.ts src/domain/team/teamValidation.spec.ts
```

Expected: all seven files pass, including duplicate ProjectId, multiple matching IDs, only-three-required-fields, Team template, Schedule initialization, and alias regressions.

- [ ] **Step 3: Run the five V2 fixture regressions.**

Run:

```powershell
npm run test:run -- src/fixtures/v2/referenceFixtures.spec.ts src/fixtures/v2/canonicalProjectFixtures.spec.ts src/fixtures/v2/teamCandidateFixtures.spec.ts src/fixtures/v2/scheduleCandidateFixtures.spec.ts src/fixtures/v2/teamTemplateFixtures.spec.ts
```

Expected: all five files pass and `canonicalProjectFixtures` still contains exactly the same five Projects.

- [ ] **Step 4: Run full suite, production build, and whitespace checks.**

Run:

```powershell
npm run test:run
npm run build
git diff --check
git status --short
```

Expected: full suite and build pass. The existing approximately 683 kB Vite chunk warning is non-blocking only if it remains the same known warning; investigate any new warning. `git diff --check` must report no whitespace errors.

- [ ] **Step 5: Run exact legacy-authority and V2-import scans.**

Run:

```powershell
rg -n -S "dashboardProjectRows|dashboardProjectsFromWorksheetRows|useState<DashboardProject|setProjects|selectedProject|setSelectedProject|buildProjectFromForm|updateProjectFromForm" src/main.tsx
rg -n -S "dashboardProjectRows|dashboardProjectsFromWorksheetRows|buildProjectFromForm|updateProjectFromForm" src
rg -n -S "PrototypeState|prototypeReducer|canonicalProjectFixtures|getProjectById|selectDashboardProjectRows|createProject\(|interpretCreateProjectResult|confirmCreateProjectAnyway|updateProjectMaster\(|interpretUpdateProjectMasterResult" src/main.tsx
rg -n -S "projectAdded|projectReplaced|dispatch\(" src/main.tsx
rg -n -S "DashboardProjectRow" src
```

Interpret results precisely:

- `src/main.tsx` has no legacy JSON import, worksheet conversion, legacy writable array, `setProjects`, whole-object setter, or legacy Create/Edit helper call.
- Matches for `selectedProject` are limited to `selectedProjectId` or a clearly named derived canonical value; there is no `useState<Project>` or setter for a selected business object.
- Legacy helpers/data may still match their own physical modules/tests, but not active runtime imports/calls.
- V2 scan shows root reducer/state, canonical fixtures, immutable lookup, projector, commands, and interpreters in active main code.
- Reducer scan shows only `projectAdded`/`projectReplaced` Project/Master writes.
- Every production `DashboardProjectRow` use is render/search/filter/export/duplicate display; no row reaches a command, reducer, or persisted form conversion.

- [ ] **Step 6: Inspect the no-dual-authority and migration-island boundary manually.**

Inspect the final `App`, Dashboard, Project Workspace, Create completion, Create Anyway, and Edit completion blocks and confirm:

- `state.projects` is the sole Project collection;
- no other writable `Project[]` or `DashboardProject[]` exists in active runtime;
- row clicks and duplicate choices carry `ProjectId` only;
- canonical selection is derived with `getProjectById()` and unknown ID handling returns safely to Dashboard;
- projector output is never mutated or written back;
- all Project/Master writes originate in Task 1.7 command results and dispatch whole aggregates through the generic reducer;
- Working Draft is never inspected by Dashboard or form code;
- canonical Workspace cannot navigate to or render legacy Schedule/Team data;
- the only active resource value is `projectMaster`;
- no legacy name lookup, fallback display data, warning list, Current Stage inference, or MDRR inference exists.

- [ ] **Step 7: Review the current Slice 2 worktree scope and protected files.**

Run:

```powershell
git diff --name-only
git diff --stat
git status --short
git ls-files --others --exclude-standard -- src/duplicateProjectReview.spec.tsx src/duplicateProjectReview.tsx src/projectMasterForm.spec.ts src/projectMasterForm.ts
git diff -- src/dashboardColumns.ts
git diff -- src/projectMaster.ts
git diff -- src/application/state/prototypeReducer.ts
git diff -- src/application/commands/projectCommands.ts
git diff -- src/application/workflow/workflowInterpretation.ts
git diff -- docs/superpowers/specs/2026-09-08-project-master-runtime-migration-design.md
```

Because Slice 1 has already passed external review and received its separately authorized checkpoint commit, `git status --short` must show exactly these six uncommitted Slice 2 paths:

```text
src/duplicateProjectReview.spec.tsx
src/duplicateProjectReview.tsx
src/legacy/characterization/runtime.spec.tsx
src/main.tsx
src/projectMasterForm.spec.ts
src/projectMasterForm.ts
```

The ordinary diff commands show the two tracked modifications (`src/main.tsx` and `src/legacy/characterization/runtime.spec.tsx`). Git does not include untracked files in an ordinary diff, so the `git ls-files --others` command separately verifies the four new Slice 2 files. Together these outputs account for the exact six-path current-slice scope without staging anything.

The protected-file diff commands must have no output. There must be no generated file, spec/plan edit, Schedule/Team production edit, reducer/command/interpreter edit, Provider/store/repository/service layer, or unrelated cleanup.

- [ ] **Step 8: Review the committed and cumulative Task 2.1 implementation scope from the plan checkpoint.**

Resolve the implementation base from the commit that contains this plan; do not hard-code the earlier design-spec commit or a guessed future SHA:

```powershell
$task21ImplementationBase = git log -1 --format="%H" -- docs/superpowers/plans/2026-09-08-project-master-runtime-migration-plan.md
git diff --name-only "$task21ImplementationBase"..HEAD
git diff --stat "$task21ImplementationBase"..HEAD
git diff --name-only "$task21ImplementationBase"
git diff --stat "$task21ImplementationBase"
git ls-files --others --exclude-standard -- src/duplicateProjectReview.spec.tsx src/duplicateProjectReview.tsx src/projectMasterForm.spec.ts src/projectMasterForm.ts
```

At the Slice 2 review gate, the committed range from the plan checkpoint through `HEAD` must contain exactly the two already-reviewed Slice 1 files:

```text
src/application/selectors/dashboardProjectRows.spec.ts
src/application/selectors/dashboardProjectRows.ts
```

The cumulative tracked diff from the plan checkpoint through the current worktree contains the two committed Slice 1 files plus the two tracked Slice 2 modifications. Git excludes untracked files from this diff, so combine it with the explicit untracked-file output above. The combined cumulative scope must contain exactly all eight Task 2.1 implementation files:

```text
src/application/selectors/dashboardProjectRows.spec.ts
src/application/selectors/dashboardProjectRows.ts
src/duplicateProjectReview.spec.tsx
src/duplicateProjectReview.tsx
src/legacy/characterization/runtime.spec.tsx
src/main.tsx
src/projectMasterForm.spec.ts
src/projectMasterForm.ts
```

If the base lookup is empty, either range contains an unexpected path, or the current worktree scope differs from Step 7, stop and report the mismatch. Do not repair history or proceed to a checkpoint operation.

### Slice 2 external review gate — do not commit yet

Report the exact six uncommitted Slice 2 paths from `git status` plus the tracked/untracked worktree checks, the two committed Slice 1 paths from the plan-checkpoint-to-`HEAD` range, and the cumulative eight paths from the combined plan-checkpoint diff and untracked-file check. Also report all RED evidence, focused and regression commands with actual counts, full-suite result, build result and warning, whitespace result, static-scan interpretation, no-dual-authority audit, and final `git status --short`. STOP FOR EXTERNAL REVIEW with nothing staged, no commit, and no push. Do not begin any checkpoint operation or Task 2.2 work without a separate human-reviewed prompt.

---

## Verification Matrix

| Concern | Focused evidence | Regression evidence |
| --- | --- | --- |
| Canonical Dashboard projection | `dashboardProjectRows.spec.ts` five cases | `portfolioSources.spec.ts`, reference/canonical fixture specs |
| Exact Dashboard UI/search/filter | runtime cases 1–3 | unchanged `dashboardColumns.ts`; full suite |
| ProjectId-only selection | runtime cases 2, 6–8; final state scan | `projectSelectors.spec.ts`, reducer spec |
| Schedule/Team gate | runtime case 2 | final active-resource/source inspection |
| Create mapping/defaults | `projectMasterForm.spec.ts` cases 1–2; runtime cases 4–5 | `projectCommands.spec.ts`, workflow spec |
| Duplicate one/multiple/zero | `duplicateProjectReview.spec.tsx`; runtime cases 6–8 | command multiple-ID and workflow second-command regressions |
| Edit hidden preservation | form case 4; runtime case 9 | Project command alias tests |
| Edit blocked/advisory/cancel | runtime cases 10–11 | Task 1.9 workflow interpretation tests |
| Needs Attention | runtime case 3 | legacy-authority scans |
| Export all rows | runtime case 3 with SheetJS side-effect mock | projector tests and full suite |
| No dual authority | exact main/static scans and manual audit | full suite/build |

## Spec-to-Plan Coverage Checklist

- Success criteria 1–5: Task 5 Steps 1 and 8, runtime cases 1–2, and Task 6 Steps 5–6 establish sole reducer state, five fixtures, legacy source disconnection, no writable Dashboard array, and ID lookup.
- Success criteria 6–9: Slice 1 implements and tests readonly official-source projection, Draft isolation, exact Dashboard fields, and hyphen behavior.
- Success criteria 10–14: Task 5 Steps 5–6 and runtime cases 4–8 cover command/interpreter Create, duplicate directions, one/multiple/zero Review Existing, same-ID second command, `projectAdded`, selection, and Master landing.
- Success criteria 15–19: Task 2 mappings, Task 5 Step 7, runtime cases 9–11, and existing Task 1.7/1.9 regressions cover Edit interpretation, hidden values, immutable ID, and command-owned aliases.
- Success criteria 20–25: Task 5 Steps 2–3 and runtime cases 2–3 cover all Master landing paths, migration gates, empty attention, and all-row export.
- Success criteria 26–29: Tasks 1–2 and Task 5 Steps 2 and 4 lock reference-backed values, exact 13 fields, no completeness UI, and no Stage/MDRR inference.
- Success criteria 30–32: Global Constraints plus Task 6's changed-file and architecture audit exclude frameworks, Schedule/Team migration, and legacy mass cleanup.
- Success criteria 33–35: both review gates require focused regressions, full suite, and production build.

No success criterion requires a third independently reviewable slice. The pure projector is safe alone; every mutation-authority change remains inside the atomic second review boundary.
