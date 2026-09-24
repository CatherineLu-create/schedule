# PIP V2 User Trial Project Master UI Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the existing canonical Mechanical, Cover, and direct-Leverage Project Master fields in read-only Project Workspace detail and Edit Master without changing Project authority or schema.

**Architecture:** Keep `Project.master` and `updateProjectMaster()` authoritative. Extend the existing string-backed `ProjectMasterForm` adapter for transient edit values, derive searchable Project-reference options from current canonical `PrototypeState.projects`, and render the new read-only/edit sections through the existing `ProjectWorkspace` and `ProjectDialog` flow in `main.tsx`. Store only existing `CatalogItemId | null`, `ProjectId | null`, and `number | null` leaves.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Vite, Tailwind utility classes.

**Spec:** User-approved “PIP V2 User Trial & Feedback — Project Master UI Expansion” brief dated 2026-09-24. Historical Project Master boundary records remain architectural context, especially `docs/superpowers/specs/2026-09-08-project-master-ui-integration-boundary-design.md`.

## Global Constraints

- Work only in `D:\011superpowers-schedule-user-trial` on `user-trial-pages` from clean checkpoint `0855b566920546dab5caee8f3dd10066e4a58795` aligned with `origin/user-trial-pages`.
- Do not redesign `ProjectMaster`, add fields, add a second Master authority, or store copied leverage display text.
- Preserve the existing `updateProjectMaster()` → workflow interpretation → `projectReplaced` Edit lifecycle.
- Preserve existing Project IDs, Cover catalog, Team authority, Schedule lifecycle, Dashboard attention, Demo Seed, `/schedule/`, deployment, and in-memory-only prototype architecture.
- The current Project is a valid leverage choice whose saved value is its own `ProjectId`; `null` remains undecided and must not become New Design.
- A direct source `ProjectId` remains authoritative; do not traverse or store an upstream/root Project.
- Create Project keeps its current visible field scope. The shared form may carry empty expansion fields, but the Create dialog must not expose this feature unless a later task explicitly approves it.
- Do not implement exports, root leverage, genealogy, Master versioning, backend, database, API, login, or persistence.
- Follow TDD and do not commit, push, or merge unless a later human instruction explicitly authorizes a checkpoint.

## Planned File Map

**Production files**

- Create `src/application/selectors/projectReferenceOptions.ts`: derive current searchable Project identities and resolve direct leverage display by `ProjectId`.
- Modify `src/projectMasterForm.ts`: add transient Mechanical/Cover/Leverage form fields, nullable numeric conversion, and focused form validation.
- Modify `src/main.tsx`: wire the derived reference options, add the two read-only sections, expose the new Edit-only controls, and keep Save/Cancel on the existing command path.
- Modify `README.md`: update only the current Project Master field/layout and Edit behavior description.

**Test files**

- Create `src/application/selectors/projectReferenceOptions.spec.ts`.
- Modify `src/projectMasterForm.spec.ts`.
- Modify `src/legacy/characterization/runtime.spec.tsx`.

No domain, command, reducer, fixture, reference-catalog, Dashboard, Schedule, Team, dependency, or deployment file is planned to change.

## Canonical Field Map

| UI row | Canonical field | Existing type |
| --- | --- | --- |
| Product Length | `master.mechanical.product.productLengthMm` | `number | null` |
| Product Width | `master.mechanical.product.productWidthMm` | `number | null` |
| Product Height | `master.mechanical.product.productHeightMm` | `number | null` |
| Product Weight | `master.mechanical.product.productWeightG` | `number | null` |
| Package Length | `master.mechanical.package.packageLengthMm` | `number | null` |
| Package Width | `master.mechanical.package.packageWidthMm` | `number | null` |
| Package Height | `master.mechanical.package.packageHeightMm` | `number | null` |
| Gross Weight | `master.mechanical.package.grossWeightG` | `number | null` |
| A/B/C/D Material | `master.cover.aCover/bCover/cCover/dCover` | `CatalogItemId | null` |
| PCB/A/B/C/D Leverage | `master.leverage.pcbLeverage/aLeverage/bLeverage/cLeverage/dLeverage` | `ProjectId | null` |

PCB Material is not a domain field and remains presentation-only `—`.

## Review Focus

- Blank Mechanical input must save `null`, while numeric zero must remain `0` and render with its unit rather than as unknown; Task 2 and Task 4 test all three states.
- Negative or non-finite Mechanical text must block Edit Save, while decimal values remain valid; Task 2 tests the parser/validator and Task 4 tests command non-invocation.
- Same-name Projects must remain distinguishable by Year/QCI identity and save the exact selected `ProjectId`; Task 1 and Task 4 use duplicate STN names with different IDs.
- Self-reference, other-Project reference, null, and dangling IDs must remain distinct without copied labels or silent data loss; Tasks 1, 3, and 4 cover each state.
- Renaming a referenced Project must change its derived leverage display on the next state render; Task 1 proves fresh derivation and Task 4 proves runtime refresh through the existing reducer path.

---

### Task 1: Derive Searchable Canonical Project References

**Files:**
- Create: `src/application/selectors/projectReferenceOptions.ts`
- Create: `src/application/selectors/projectReferenceOptions.spec.ts`

**Interfaces:**
- Consumes: `PrototypeState.projects`, canonical `Project.id`, and `Project.master.basicInformation.year/stnProjectName/qciModelName`.
- Produces:

```ts
export interface ProjectReferenceOption {
  readonly projectId: ProjectId;
  readonly year: string;
  readonly stnProjectName: string;
  readonly qciModelName: string;
  readonly displayLabel: string;
  readonly searchText: string;
}

export function selectProjectReferenceOptions(
  state: PrototypeState,
): readonly ProjectReferenceOption[];

export function filterProjectReferenceOptions(
  options: readonly ProjectReferenceOption[],
  query: string,
): readonly ProjectReferenceOption[];

export type ProjectLeverageDisplay = Readonly<
  Record<keyof ProjectMaster["leverage"], string>
>;

export function selectProjectLeverageDisplay(
  state: PrototypeState,
  currentProjectId: ProjectId,
): ProjectLeverageDisplay | null;
```

- `displayLabel` is `Year | STN Project Name | QCI Model Name`, resolving each null/blank identity leaf to `—`.
- `searchText` is a normalized concatenation of those three current canonical fields; it is derived, never persisted.
- Options preserve canonical `state.projects` order.
- Leverage display resolves the target through `getProjectById(state, currentProjectId)`, then returns `—` for null, `Unavailable Project` for an unresolved/dangling source ID, `New Design` for the current Project ID, and the source's current `displayLabel` for another resolvable Project ID.

- [ ] **Step 1: Write failing selector tests**

Cover exact option order/labels, null identity leaves, case-insensitive trimmed search independently by Year/STN/QCI, two Projects with the same STN name but distinct IDs/QCI names, null/self/direct/dangling display, and reconstruction after a referenced Project is renamed.

```ts
expect(selectProjectReferenceOptions(state).map(({ projectId, displayLabel }) => ({
  projectId,
  displayLabel,
}))).toEqual([
  { projectId: target.id, displayLabel: "2027 | Shared Name | TARGET-QCI" },
  { projectId: source.id, displayLabel: "2028 | Shared Name | SOURCE-QCI" },
]);
expect(filterProjectReferenceOptions(options, "source-qci"))
  .toHaveLength(1);
expect(selectProjectLeverageDisplay(state, target.id)).toMatchObject({
  pcbLeverage: "New Design",
  aLeverage: "2028 | Shared Name | SOURCE-QCI",
  bLeverage: "—",
});
```

- [ ] **Step 2: Run the selector test and verify RED**

Run:

```powershell
npm run test:run -- --maxWorkers=1 src/application/selectors/projectReferenceOptions.spec.ts
```

Expected: FAIL because the new selector module does not exist.

- [ ] **Step 3: Implement the pure derivation**

Use current canonical values only. Normalize search with `trim().toLowerCase()` and match if the normalized query occurs in Year, STN Project Name, or QCI Model Name. Use the existing `getProjectById()` for target and direct-source resolution. Do not inspect Schedule/Team, copy labels into Project, or follow a leverage chain.

```ts
const display = (value: string | number | null): string =>
  value === null || String(value).trim() === "" ? "—" : String(value);

return state.projects.map((project) => {
  const basic = project.master.basicInformation;
  const year = display(basic.year);
  const stnProjectName = display(basic.stnProjectName);
  const qciModelName = display(basic.qciModelName);
  return {
    projectId: project.id,
    year,
    stnProjectName,
    qciModelName,
    displayLabel: `${year} | ${stnProjectName} | ${qciModelName}`,
    searchText: `${year} ${stnProjectName} ${qciModelName}`.toLowerCase(),
  };
});
```

- [ ] **Step 4: Run Task 1 tests to GREEN**

Run the Step 2 command again. Expected: the new selector tests pass.

---

### Task 2: Extend the Existing Project Master Form Adapter

**Files:**
- Modify: `src/projectMasterForm.ts:4-147`
- Modify: `src/projectMasterForm.spec.ts:1-143`

**Interfaces:**
- Consumes: the existing complete `ProjectMaster`, `CreateProjectMasterInput`, `CatalogItemId`, and `ProjectId` types.
- Produces the existing `ProjectMasterForm`, `emptyProjectMasterForm`, `toProjectMasterForm()`, `toCreateProjectMasterInput()`, and `overwriteProjectMasterFromForm()` APIs with the approved fields added, plus:

```ts
export type ProjectSelection = ProjectId | "";
export type ProjectMasterFormErrors = Partial<Record<keyof ProjectMasterForm, string>>;

export function validateProjectMasterMechanicalForm(
  form: ProjectMasterForm,
): ProjectMasterFormErrors;
```

- Keep the Mechanical form leaves as strings so blank and intermediate decimal input remain representable.
- Use `aCoverId/bCoverId/cCoverId/dCoverId` as transient form names mapped to canonical `cover.aCover/bCover/cCover/dCover`.
- Use `pcbLeverageId/aLeverageId/bLeverageId/cLeverageId/dLeverageId` as transient form names mapped to canonical leverage fields.

- [ ] **Step 1: Expand the form fixtures and write failing mapping tests**

Add all eight Mechanical strings, four Cover selections, and five leverage selections to `populatedForm` and `emptyProjectMasterForm` expectations. Test:

- canonical decimal values stringify without rounding;
- blank strings map to canonical null rather than zero;
- `"0"` maps to numeric `0`;
- Catalog and Project IDs round-trip exactly, including unresolved IDs;
- `overwriteProjectMasterFromForm()` changes only approved newly visible leaves plus the existing visible leaves, while category, PCB/housing numbers, `other`, Team, Schedule, ID, and aliases remain outside this adapter;
- Create keeps the new hidden backing values empty/null by default.

```ts
const form = toProjectMasterForm(richMaster);
expect(form.productLengthMm).toBe("320.5");
expect(form.aCoverId).toBe(richMaster.cover.aCover);
expect(form.pcbLeverageId).toBe(richMaster.leverage.pcbLeverage);

const blankMechanical = overwriteProjectMasterFromForm(richMaster, {
  ...form,
  productLengthMm: "",
  productWeightG: "0",
});
expect(blankMechanical.mechanical.product.productLengthMm).toBeNull();
expect(blankMechanical.mechanical.product.productWeightG).toBe(0);
```

- [ ] **Step 2: Write failing Mechanical validation tests**

Require negative and invalid non-empty values to return field errors, while blank, zero, integer, and decimal strings have no error.

```ts
expect(validateProjectMasterMechanicalForm({
  ...populatedForm,
  productLengthMm: "-0.1",
})).toMatchObject({ productLengthMm: "Must be 0 or greater." });

expect(validateProjectMasterMechanicalForm({
  ...populatedForm,
  productLengthMm: "320.5",
  grossWeightG: "",
})).toEqual({});
```

- [ ] **Step 3: Run the form tests and verify RED**

Run:

```powershell
npm run test:run -- --maxWorkers=1 src/projectMasterForm.spec.ts
```

Expected: FAIL because the expanded form leaves and validator are absent and the old test still characterizes these sections as hidden.

- [ ] **Step 4: Implement nullable numeric and ID mappings**

Add `numberOrNull()` using trimmed `Number()` conversion, with blank returning null. Add `catalogOrNull()`/`projectOrNull()` mappings and rebuild nested Mechanical objects immutably in both Create and Edit conversions.

```ts
function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
```

`validateProjectMasterMechanicalForm()` checks every non-blank Mechanical form leaf before Save: non-finite input returns `Enter a valid number.`, negative input returns `Must be 0 or greater.`, and decimal/zero values are accepted. This is transient form validation only; do not change `ProjectMaster` or the completeness-advisory validator.

- [ ] **Step 5: Run Task 2 tests to GREEN**

Run the Step 3 command again. Expected: all form adapter and validation tests pass.

---

### Task 3: Add Read-Only Mechanical and Cover / Leverage Detail

**Files:**
- Modify: `src/main.tsx:43-90, 186-235, 577-641, 831-980`
- Modify: `src/legacy/characterization/runtime.spec.tsx:1-180, 1136-1160, 1363-1373`

**Interfaces:**
- Consumes: selected canonical `Project`, `coverCatalog`, and `selectProjectLeverageDisplay(state, projectId)`.
- Produces two Project Workspace sections between the fixed Project Header and Resources. The fixed header remains unchanged.

- [ ] **Step 1: Write failing read-only runtime tests**

Build local canonical Projects in the test only: one target with populated decimal Mechanical values, all four Cover IDs, self/direct/null/dangling leverage examples, and one direct source with a duplicate STN name but distinct Year/QCI identity. Render through `App` or the existing `ProjectWorkspace` harness and assert:

- Project Header content is unchanged;
- section order is Project Header → Mechanical → Cover / Leverage → Resources;
- Product and Package headings show all eight labels with `mm`/`g` values;
- zero renders `0 mm`/`0 g`, while null renders `—`;
- the Cover/Leverage table has exactly `Component | Material | Leverage Project` and PCB/A/B/C/D rows;
- PCB Material is `—`;
- A/B/C/D resolve current `coverCatalog` display names or `—`;
- self is `New Design`, direct other reference is `Year | STN Project Name | QCI Model Name`, null is `—`, and dangling is `Unavailable Project`;
- the table container uses the existing responsive horizontal-scroll pattern.

```ts
expect(within(mechanical).getByText("320.5 mm")).toBeInTheDocument();
expect(within(mechanical).getByText("0 g")).toBeInTheDocument();
expect(within(coverLeverage).getByRole("row", {
  name: /A Cover Plastic-Paint New Design/,
})).toBeInTheDocument();
expect(within(coverLeverage).getByRole("row", {
  name: /B Cover .* 2028 \| Shared Name \| SOURCE-QCI/,
})).toBeInTheDocument();
```

- [ ] **Step 2: Run the read-only runtime slice and verify RED**

Run:

```powershell
npm run test:run -- --maxWorkers=1 src/application/selectors/projectReferenceOptions.spec.ts src/legacy/characterization/runtime.spec.tsx
```

Expected: selector tests pass and runtime assertions fail because the two sections are not rendered.

- [ ] **Step 3: Wire current reference options at the App boundary**

Derive once per render from current state and pass the result through required `ProjectWorkspaceProps`:

```ts
const selectedLeverageDisplay = selectedProjectId === null
  ? null
  : selectProjectLeverageDisplay(state, selectedProjectId);

const renderWorkspace =
  page === "workspace"
  && selectedCanonicalProject !== null
  && selectedDashboardRow !== null
  && scheduleWorkspaceProps !== null
  && selectedLeverageDisplay !== null;

<ProjectWorkspace
  feedback={editFeedback}
  leverageDisplay={selectedLeverageDisplay}
  onBack={backToDashboard}
  onEditProject={openEdit}
  project={selectedCanonicalProject}
  row={selectedDashboardRow}
  scheduleWorkspaceProps={scheduleWorkspaceProps}
  teamMemberWorkspaceProps={{
    createAssignmentId: () => toPersonAssignmentId(globalThis.crypto.randomUUID()),
    createFunctionId: () => toTeamFunctionId(globalThis.crypto.randomUUID()),
    onSave: saveTeam,
    standardFunctionDefinitions: teamFunctionCatalog,
  }}
/>
```

Update local test harnesses to pass leverage display derived from their own canonical state. `renderWorkspace` must also require non-null leverage display before rendering. Do not pass `PrototypeState` into a presentation component and do not store the projection.

- [ ] **Step 4: Render the compact read-only sections**

Add small module-local helpers in `main.tsx` because `ProjectDialog` and `ProjectWorkspace` already own this bounded presentation:

```ts
function measurement(value: number | null, unit: "mm" | "g"): string {
  return value === null ? "—" : `${value} ${unit}`;
}

function coverDisplay(id: CatalogItemId | null): string {
  if (id === null) return "—";
  return coverCatalog.find((item) => item.id === id)?.displayName ?? "—";
}
```

Mechanical uses two compact cards/grids (`grid-cols-2 sm:grid-cols-4`) for Product Dimension and Package Dimension. Cover / Leverage uses the existing `overflow-x-auto` table pattern with a reasonable minimum width so five rows stay readable on phones without widening the page.

- [ ] **Step 5: Run Task 3 tests to GREEN**

Run the Step 2 command again. Expected: selector and read-only runtime tests pass.

---

### Task 4: Expose Edit-Only Mechanical, Cover, and Direct Leverage Controls

**Files:**
- Modify: `src/main.tsx:202-214, 528-551, 593-745, 748-827`
- Modify: `src/legacy/characterization/runtime.spec.tsx:1449-1475, 1570-1676`

**Interfaces:**
- Consumes: expanded `ProjectMasterForm`, `validateProjectMasterMechanicalForm()`, current `ProjectId`, derived `ProjectReferenceOption[]`, existing `ProjectCatalogSelect`, `coverCatalog`, and existing Save/Cancel handlers.
- Produces: Edit-only Mechanical and Cover / Leverage fieldsets; no Create field expansion and no new mutation path. The module-local Project selector has this contract:

```ts
interface ProjectReferenceSelectProps {
  readonly currentProjectId: ProjectId;
  readonly label: string;
  readonly onChange: (value: ProjectSelection) => void;
  readonly options: readonly ProjectReferenceOption[];
  readonly value: ProjectSelection;
}
```

- [ ] **Step 1: Write failing Edit initialization and scope tests**

Open a populated Project in Edit and require every Mechanical, Cover, and leverage control to reflect its canonical value. Open Create and require these controls/sections to be absent, preserving current Create scope.

```ts
expect(within(editDialog).getByLabelText("Product Length (mm)"))
  .toHaveValue(320.5);
expect(within(editDialog).getByLabelText("A Cover Material"))
  .toHaveValue("cover-plastic-paint");
expect(within(createDialog).queryByRole("group", { name: "Mechanical" }))
  .not.toBeInTheDocument();
```

- [ ] **Step 2: Write failing Mechanical Save validation tests**

Prove decimal and zero values reach the existing `updateProjectMaster()` candidate exactly, blank becomes null, and a negative value leaves the dialog open, displays the field error, does not call `updateProjectMaster()`, and does not replace canonical state.

```ts
fireEvent.change(within(dialog).getByLabelText("Product Length (mm)"), {
  target: { value: "-1.5" },
});
fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));
expect(within(dialog).getByText("Must be 0 or greater.")).toBeInTheDocument();
expect(vi.mocked(updateProjectMaster)).not.toHaveBeenCalled();
```

- [ ] **Step 3: Write failing Cover and leverage selector tests**

Require:

- A/B/C/D Material options come from the existing `coverCatalog`; PCB has no Material input;
- blank Material saves null and selected Material saves its `CatalogItemId`;
- each of the five leverage rows has a search input and a Project-ID-backed select;
- search filters case-insensitively by Year, STN name, and QCI name;
- two same-name choices with different QCI identities remain separate and selecting one saves its exact `ProjectId`;
- the current Project remains selectable as `Current Project (New Design) · Year | STN Project Name | QCI Model Name` and saves its own ID;
- blank saves null rather than the current ID;
- an unresolved pre-existing leverage ID remains selected as `Unavailable Project` when another field is saved, preventing accidental data loss;
- Cancel discards all expanded transient values.

- [ ] **Step 4: Run the Edit runtime slice and verify RED**

Run:

```powershell
npm run test:run -- --maxWorkers=1 src/projectMasterForm.spec.ts src/application/selectors/projectReferenceOptions.spec.ts src/legacy/characterization/runtime.spec.tsx
```

Expected: form/selector tests pass and Edit UI assertions fail because the new controls are absent.

- [ ] **Step 5: Add an explicit Create/Edit dialog mode**

Replace title-derived behavior with a discriminated dialog contract:

```ts
type ProjectDialogProps = {
  readonly fieldErrors: ProjectMasterFormErrors;
  readonly feedback: string | null;
  readonly issues: readonly ValidationIssue[];
  readonly onCancel: () => void;
  readonly onChange: (form: ProjectMasterForm) => void;
  readonly onSave: () => void;
  readonly saveLabel: string;
  readonly title: string;
  readonly value: ProjectMasterForm;
} & (
  | { readonly mode: "create" }
  | {
      readonly mode: "edit";
      readonly currentProjectId: ProjectId;
      readonly projectReferenceOptions: readonly ProjectReferenceOption[];
    }
);
```

Pass `mode="create"` from Create and `mode="edit"` plus current ID/options from Edit. Render the expansion only for Edit. Existing Identity, Classification, Hardware, Internal Identifier, and Project Management controls stay unchanged.

Derive the option list from current state on every App render and pass it only to the Edit dialog:

```ts
const projectReferenceOptions = selectProjectReferenceOptions(state);

<ProjectDialog
  currentProjectId={selectedCanonicalProject.id}
  fieldErrors={editFieldErrors}
  feedback={null}
  issues={editIssues}
  mode="edit"
  onCancel={() => {
    setEditFieldErrors({});
    setIsEditProjectOpen(false);
  }}
  onChange={(nextForm) => {
    setEditFieldErrors({});
    setEditForm(nextForm);
  }}
  onSave={saveEdit}
  projectReferenceOptions={projectReferenceOptions}
  saveLabel="Save Changes"
  title="Edit Project"
  value={editForm}
/>
```

- [ ] **Step 6: Add compact Mechanical and Cover / Leverage edit fieldsets**

Mechanical inputs use `type="number"`, `min="0"`, `step="any"`, and `inputMode="decimal"`, but Save validation remains authoritative because HTML attributes alone do not guarantee valid state.

The edit Cover / Leverage area mirrors the read-only five-row table. Reuse `ProjectCatalogSelect` with `coverCatalog` for A/B/C/D. PCB Material is plain `—`.

For each leverage row, render a paired search input and native select using the established input/select visual language. The select option value is always `ProjectId`; the visible label is derived. Keep the currently selected option visible even when the search filter does not match. If the saved ID no longer resolves, include one selected `Unavailable Project` option with that same ID so unrelated edits do not clear it.

- [ ] **Step 7: Gate the existing Save path on form errors**

Maintain separate `editFieldErrors` state. Clear it when opening/closing Edit and on the next form change. Before calling `overwriteProjectMasterFromForm()`:

```ts
const errors = validateProjectMasterMechanicalForm(editForm);
setEditFieldErrors(errors);
if (Object.keys(errors).length > 0) return;
```

If valid, continue unchanged through `overwriteProjectMasterFromForm()` → `updateProjectMaster()` → `interpretUpdateProjectMasterResult()` → `projectReplaced`. Blocking/advisory command handling and Cancel semantics remain unchanged.

- [ ] **Step 8: Prove live ProjectId resolution after Save**

In a runtime test, use a target Project that directly leverages a source. Rename the source through Edit, return to the target, and assert the target now displays the source's new `Year | STN Project Name | QCI Model Name` without changing the target's stored leverage ID.

- [ ] **Step 9: Run Task 4 tests to GREEN**

Run the Step 4 command again. Expected: all form, selector, and runtime tests pass.

---

### Task 5: Update Current Documentation and Verify the Bounded Change

**Files:**
- Modify: `README.md:29-38, 125-168`
- Verify only: every production/test file listed above

**Interfaces:**
- Consumes the completed UI behavior.
- Produces current-state documentation and verification evidence only.

- [ ] **Step 1: Update current Project Master documentation**

Document the two new read-only sections, units/null display, Cover catalog use, direct ProjectId leverage semantics, self=`New Design`, null=`—`, Edit-only exposure, and current in-memory Save lifecycle. Correct only nearby stale current-state wording; do not rewrite historical specs or describe future export as implemented.

- [ ] **Step 2: Run the complete focused matrix**

```powershell
npm run test:run -- --maxWorkers=1 src/application/selectors/projectReferenceOptions.spec.ts src/projectMasterForm.spec.ts src/application/commands/projectCommands.spec.ts src/application/commands/projectCommandIntegration.spec.ts src/application/selectors/projectSelectors.spec.ts src/config/v2/referenceData.spec.ts src/legacy/characterization/runtime.spec.tsx
```

Expected: all focused tests pass. Command, lookup, catalog, Create/Edit lifecycle, and runtime regressions remain green.

- [ ] **Step 3: Run the complete suite and production build**

```powershell
npm run test:run -- --maxWorkers=1
npm run build
```

Expected: both exit `0`; no generated build artifact becomes tracked.

- [ ] **Step 4: Run whitespace and scope audits**

```powershell
git diff --check
git status --short
git diff --stat
git diff -- src/domain/project src/application/commands/projectCommands.ts src/application/state src/config/v2/referenceData.ts src/fixtures src/application/selectors/dashboardAttention.ts src/application/selectors/scheduleSelectors.ts src/application/commands/teamCommands.ts package.json package-lock.json vite.config.ts .github docs/superpowers/specs
```

Expected:

- only this plan plus the seven planned production/test/current-documentation files differ;
- no Project schema, command authority, reducer, Cover catalog, fixture/Demo Seed, Dashboard/Schedule/Team, dependency, deployment, or historical-spec diff;
- GitHub Pages base remains `/schedule/`.

- [ ] **Step 5: Perform one completed-change reviewer pass**

Review read-only units/nulls, Cover resolution, direct/self/null leverage distinctions, exact-ID duplicate handling, dangling-ID preservation, source-rename refresh, negative/decimal/zero handling, Create scope isolation, Save/Cancel behavior, responsive overflow, and protected-scope diffs. Categorize findings Critical, Important, and Minor; fix Critical/Important issues test-first without broadening scope.

- [ ] **Step 6: Preserve the human-verification checkpoint**

Do not commit, push, merge, implement export, or start another feedback task. Report automated results, reviewer findings, manual checks, diff/status, and wait for explicit human authorization.

## Manual Verification Targets

1. Open a Project and confirm Mechanical and Cover / Leverage appear below—not inside—the fixed Project Header.
2. Confirm null values show `—`, zero remains zero, dimensions show `mm`, and weights show `g`.
3. Edit decimal Mechanical values, save, reopen, and confirm exact values persist; verify a negative value blocks Save.
4. Select A/B/C/D materials from the existing Cover catalog and verify PCB Material remains non-editable `—`.
5. Search leverage choices independently by Year, STN Project Name, and QCI Model Name; select an exact Project and confirm the read-only identity.
6. Select the current Project and confirm read-only `New Design`; clear it and confirm `—` rather than New Design.
7. Rename a referenced source Project and confirm the target resolves the new identity without reselecting it.
8. Confirm Create Project has not gained the new sections and Dashboard, Schedule, Team, and User Trial Demo behavior remain unchanged.

## Known Repository Findings and Decisions

- All requested canonical fields exist exactly as named and already use the approved nullable types. No schema migration is required.
- `coverCatalog` already exists in `src/config/v2/referenceData.ts`; it is intentionally not part of `referenceFixtures`, so the UI must import the canonical catalog directly rather than create a fixture copy.
- `getProjectById(state, projectId)` is the existing single-record lookup. The new list selector remains a read-only projection over the same canonical `state.projects`; it does not become authority.
- No reusable Project search/dropdown exists. The plan introduces only a paired native search input/select inside the existing dialog, backed by a pure derived selector.
- Existing validation checks configured completeness only; it does not reject negative Mechanical numbers. The approved negative-value rule is therefore enforced at the form Save boundary without changing domain schema or global completeness policy.
- Existing canonical runtime fixtures have Cover examples but Mechanical and leverage values are mostly null. Focused tests use local enriched Projects rather than modifying deterministic fixtures or Demo Seed.
- An unresolved leverage ID renders as `Unavailable Project`, while `—` remains reserved for null/not specified. Edit preserves the exact unresolved ID as `Unavailable Project` unless the user explicitly changes it. This avoids stale copied text and accidental clearing without exposing raw internal IDs.
- No architecture or approved business rule changes beyond exposing and validating the existing fields are proposed.
