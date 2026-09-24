# Project Master Information Architecture Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dense expanded Edit Project modal with a scalable Project Master Detail experience that uses the same collapsible sections for reading and inline editing.

**Architecture:** Add `projectMasterDetail` to the existing App page state and keep the selected canonical `Project` in `PrototypeState` as the sole authority. Extract bounded Project Master controls and a full-width detail component; App continues to own the transient form, validation, command interpretation, reducer dispatch, and Save/Cancel lifecycle. The existing Workspace header remains the compact summary and entry point, while detailed fields and the existing resource cards move to the dedicated detail surface.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, Testing Library, existing application selectors/commands/reducer.

**Spec:** The approved “Project Master Information Architecture Revision” brief in the 2026-09-24 planning request. It supersedes only the presentation architecture in `docs/superpowers/plans/2026-09-24-project-master-ui-expansion.md`; the previously verified domain, form, validation, catalog, and ProjectId-reference behavior remains authoritative.

## Global Constraints

- Work only on `user-trial-pages` from baseline `0855b566920546dab5caee8f3dd10066e4a58795`, preserving the current uncommitted Project Master UI Expansion as the accepted starting point.
- `Project.master` remains the only saved Project Master authority; no schema, copied leverage name, backend, database, persistence, or second Master store.
- Reuse `overwriteProjectMasterFromForm()` → `updateProjectMaster()` → `interpretUpdateProjectMasterResult()` → `projectReplaced` for Save.
- Create Project retains exactly its current visible field scope.
- Preserve Mechanical null/zero/decimal/negative/non-finite behavior, Cover catalog authority, direct ProjectId leverage semantics, dangling-ID preservation, live reference resolution, and duplicate-name exact-ID selection.
- Do not change Schedule, Team authority, Dashboard attention, Demo Seed, GitHub Pages base `/schedule/`, deployment, dependencies, historical specifications, or Project Master Export.
- Accordion state and Project-reference picker state are transient presentation state only and are never persisted.
- Do not commit, push, or merge without a later explicit human instruction.

## Review Focus

- An invalid Mechanical value inside a collapsed section must expand that section and remain visible; it must not save as null or leave the user with an apparently unresponsive Save.
- A dangling leverage ProjectId must remain `Unavailable Project`, retain its exact stored ID through unrelated edits, and never fall back to null or expose the raw ID.
- Two Projects with the same STN name must remain separately selectable by current Year/QCI identity and save the exact clicked ProjectId.
- Keyboard-only users must be able to open, search, navigate, select, clear, and close the Project picker with a correctly announced expanded state and listbox relationship.
- Narrow viewports must stack Cover/Leverage rows and controls without page-level or nested horizontal scrolling.

---

## Current Repository Findings

- `src/main.tsx` currently owns `Page = "dashboard" | "workspace"`, the selected ProjectId, transient create/edit forms, command interpretation, Project Workspace, the shared Create/Edit modal, read-only Mechanical/Cover detail, resource cards, and the current paired search-plus-select leverage control.
- The fixed Project Header already contains the appropriate compact summary fields. Its current `Edit Project` action is the smallest entry point to replace with `View Project Master`; the summary field layout does not need redesign.
- `ProjectWorkspace` currently owns local Team Member navigation because the Resources cards are rendered there. The revision moves that existing Resources presentation into Project Master Detail and keeps its local Team subview behavior there; Schedule remains rendered in Project Workspace.
- No production accordion, disclosure, combobox, or listbox component exists. The current leverage editor is the only searchable Project selector and permanently renders a search input plus a native select.
- Existing responsive table patterns rely on `overflow-x-auto`. The revised Cover/Leverage detail should instead use stacked/grid rows with `min-w-0` controls so the dedicated page does not recreate the modal’s nested horizontal scroll.
- The following accepted logic can remain unchanged: `src/projectMasterForm.ts`, `src/application/selectors/projectReferenceOptions.ts`, Project commands/reducer, Cover reference data, Project lookup, fixtures, and domain types.

## Final Information Architecture

```text
Dashboard
  → Project Workspace
      - fixed Project Header summary
      - View Project Master
      - Current Schedule / Working Draft
  → Project Master Detail
      - Basic Information      (expanded by default)
      - Mechanical             (collapsed by default)
      - Cover / Leverage       (collapsed by default)
      - Resources              (collapsed by default)
      - Edit Master toggles the same sections into inline controls
```

Resources are moved rather than duplicated: the Schedule card explains that Schedule is shown in Project Workspace; Team Member continues to open the existing Team workspace; Weekly Report and AVL remain inactive. This keeps one resource-card presentation and avoids a second source of truth or two inconsistent copies.

Inline editing is recommended over a second dedicated edit page. Project Master Detail is already a full-width surface, so a second page would duplicate section structure, navigation, and tests. A single discriminated read/edit component preserves field placement, keeps Save/Cancel in the existing App-owned lifecycle, and removes the narrow modal without creating a parallel editor.

## Planned File Map

**Add:**

- `src/projectMasterControls.tsx` — reusable Project Master input/catalog controls plus the compact dependency-free Project reference picker.
- `src/projectMasterControls.spec.tsx` — accessible picker and control behavior.
- `src/projectMasterDetail.tsx` — full-width read/edit detail view, local disclosure state, Mechanical/Cover/Resources presentation, and local Team subview entry.
- `src/projectMasterDetail.spec.tsx` — section defaults, read/edit consistency, responsive structure, error disclosure, and resource behavior.

**Modify:**

- `src/main.tsx` — add detail navigation, keep Save authority, reduce the modal to Create-only, simplify Workspace, and wire Detail.
- `src/legacy/characterization/runtime.spec.tsx` — migrate modal-oriented edit tests to Detail navigation and update Workspace/Resources/Team characterization.
- `README.md` — document Workspace → Project Master Detail → inline Edit Master as the current UI.

**Reuse unchanged:**

- `src/projectMasterForm.ts` and `src/projectMasterForm.spec.ts`
- `src/application/selectors/projectReferenceOptions.ts` and its selector tests
- Project commands, reducer, Project selectors, Cover catalog, fixtures, domain types, Schedule, Team, Dashboard, and deployment configuration.

---

### Task 1: Extract Compact Project Master Controls and Replace the Dense Leverage Pair

**Files:**
- Create: `src/projectMasterControls.tsx`
- Create: `src/projectMasterControls.spec.tsx`
- Consume unchanged: `src/application/selectors/projectReferenceOptions.ts`

**Interfaces:**
- Consumes `CatalogSelection`, `ProjectSelection`, `ProjectReferenceOption[]`, `filterProjectReferenceOptions()`, `CatalogItem[]`, `CatalogItemId`, and `ProjectId`.
- Produces:

```ts
export interface ProjectFieldInputProps {
  readonly error?: string;
  readonly inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}

export interface ProjectCatalogSelectProps {
  readonly emptyLabel: string;
  readonly error?: string;
  readonly label: string;
  readonly onChange: (value: CatalogSelection) => void;
  readonly options: readonly CatalogItem<CatalogItemId>[];
  readonly value: CatalogSelection;
}

export interface ProjectReferencePickerProps {
  readonly currentProjectId: ProjectId;
  readonly label: string;
  readonly onChange: (value: ProjectSelection) => void;
  readonly options: readonly ProjectReferenceOption[];
  readonly value: ProjectSelection;
}
```

- `ProjectReferencePicker` renders one persistent trigger/control showing the current derived label. Search and results appear only while the control is open; there is no permanently stacked search-plus-select pair.

- [ ] **Step 1: Write failing control and Project picker tests**

Test that:

- a closed picker shows only its label and current resolved display identity;
- opening exposes a search input with `role="combobox"`, `aria-expanded="true"`, `aria-controls`, and a related `role="listbox"`;
- closing returns `aria-expanded="false"` and removes the search/results surface;
- Year, STN name, and QCI queries filter case-insensitively through `filterProjectReferenceOptions()`;
- duplicate STN names remain separate options and clicking one calls `onChange()` with its exact ProjectId;
- the current Project displays `Current Project (New Design) · Year | STN Project Name | QCI Model Name` and saves its own ID;
- `Not specified` clears to `""`;
- a dangling value displays `Unavailable Project`, retains the unresolved value until another explicit option is selected, and never displays the raw ID;
- ArrowDown/ArrowUp move the active option, Enter selects, Escape closes without changing the value, and focus returns to the trigger;
- controls use `min-w-0`/full-width styling rather than a minimum-width table dependency.

- [ ] **Step 2: Run the new control tests and verify RED**

Run:

```powershell
npm run test:run -- --maxWorkers=1 src/projectMasterControls.spec.tsx
```

Expected: FAIL because the module and compact Project picker do not exist.

- [ ] **Step 3: Implement the minimal shared controls and accessible picker**

Use the existing visual input/select classes. Keep picker state local:

```ts
const [open, setOpen] = React.useState(false);
const [query, setQuery] = React.useState("");
const [activeIndex, setActiveIndex] = React.useState(0);
```

The trigger’s visible text is derived only from `value` plus `options`:

```ts
function selectedProjectLabel(
  value: ProjectSelection,
  currentProjectId: ProjectId,
  options: readonly ProjectReferenceOption[],
): string {
  if (value === "") return "Not specified";
  const option = options.find(({ projectId }) => projectId === value);
  if (option === undefined) return "Unavailable Project";
  return option.projectId === currentProjectId
    ? `Current Project (New Design) · ${option.displayLabel}`
    : option.displayLabel;
}
```

When open, render the search input and result list below the trigger in normal document flow. Do not add a portal, new dependency, copied label storage, fuzzy-search implementation, or global state. Option clicks and Enter emit exact ProjectId values and close the picker. Escape closes without mutation.

- [ ] **Step 4: Run Task 1 tests to GREEN**

Run the Step 2 command again. Expected: all control/picker tests pass.

---

### Task 2: Build the Full-Width Read-Only Project Master Detail Shell

**Files:**
- Create: `src/projectMasterDetail.tsx`
- Create: `src/projectMasterDetail.spec.tsx`
- Consume: `src/projectMasterControls.tsx`

**Interfaces:**
- Consumes canonical `Project`, resolved `DashboardProjectRow`, `ProjectLeverageDisplay`, `ProjectReferenceOption[]`, `coverCatalog`, and existing Team workspace props.
- Produces a discriminated component contract:

```ts
interface ProjectMasterDetailCommonProps {
  readonly leverageDisplay: ProjectLeverageDisplay;
  readonly onBack: () => void;
  readonly project: Project;
  readonly projectReferenceOptions: readonly ProjectReferenceOption[];
  readonly row: DashboardProjectRow;
  readonly teamMemberWorkspaceProps?: Omit<
    TeamMemberWorkspaceProps,
    "project" | "onBack"
  >;
}

export type ProjectMasterDetailProps = ProjectMasterDetailCommonProps & (
  | {
      readonly mode: "read";
      readonly feedback: readonly ValidationIssue[];
      readonly onBeginEdit: () => void;
    }
  | {
      readonly mode: "edit";
      readonly fieldErrors: ProjectMasterFormErrors;
      readonly form: ProjectMasterForm;
      readonly issues: readonly ValidationIssue[];
      readonly onCancel: () => void;
      readonly onChange: (form: ProjectMasterForm) => void;
      readonly onSave: () => void;
    }
);
```

- [ ] **Step 1: Write failing disclosure/default-state tests**

Assert the full-width region is named `Project Master Detail` and contains sections in this order:

1. Basic Information
2. Mechanical
3. Cover / Leverage
4. Resources

Each section header has one visible symbol button:

```ts
expect(basicToggle).toHaveTextContent("−");
expect(basicToggle).toHaveAccessibleName("Collapse Basic Information");
expect(basicToggle).toHaveAttribute("aria-expanded", "true");

expect(mechanicalToggle).toHaveTextContent("+");
expect(mechanicalToggle).toHaveAccessibleName("Expand Mechanical");
expect(mechanicalToggle).toHaveAttribute("aria-expanded", "false");
```

Verify `aria-controls` points to the section content, toggling changes `+`/`−` and the accessible name, and no disclosure state is written to canonical state or browser storage.

- [ ] **Step 2: Write failing read-only content and Resources tests**

After expanding sections, preserve the already verified behavior:

- Basic Information uses the current resolved Project Header field presentation without creating copied Master values.
- Mechanical shows Product and Package grids, `mm`/`g`, null `—`, and visible zero.
- Cover/Leverage uses five responsive rows, PCB Material `—`, Cover catalog display names/`—`, and resolved self/direct/null/dangling leverage text.
- Resources contains the existing Schedule, Team Member, Weekly Report, and AVL cards; Schedule says it is shown in Project Workspace; Team opens the existing `TeamMemberWorkspace`; the two future cards remain inactive.
- Back from Team returns to Project Master Detail with its local disclosure state intact.

- [ ] **Step 3: Run the new Detail tests and verify RED**

Run:

```powershell
npm run test:run -- --maxWorkers=1 src/projectMasterControls.spec.tsx src/projectMasterDetail.spec.tsx
```

Expected: picker tests pass and Detail tests fail because the Detail component does not exist.

- [ ] **Step 4: Implement the local disclosure shell and read-only sections**

Keep disclosure state entirely inside `ProjectMasterDetail`:

```ts
type DetailSection = "basic" | "mechanical" | "coverLeverage" | "resources";

const [expanded, setExpanded] = React.useState<Readonly<Record<DetailSection, boolean>>>({
  basic: true,
  mechanical: false,
  coverLeverage: false,
  resources: false,
});
```

Implement a module-local `CollapsibleSection` using a real button, `aria-expanded`, `aria-controls`, a stable React ID, and visible `+`/`−` only. Do not add persistence or a general accordion framework.

Use vertical responsive layout:

- page container `max-w-6xl`;
- Basic and Mechanical grids stack on small screens;
- Cover/Leverage rows use `grid gap-3 md:grid-cols-[8rem_minmax(0,0.8fr)_minmax(0,1.6fr)]`;
- each control wrapper uses `min-w-0` and `w-full`;
- no `min-w-[...]` table and no nested `overflow-x-auto` for Cover/Leverage.

Render Resources only here, not in Project Workspace, so the cards are not duplicated.

- [ ] **Step 5: Run Task 2 tests to GREEN**

Run the Step 3 command again. Expected: all controls and read-only Detail tests pass.

---

### Task 3: Add Inline Edit Using the Same Detail Sections

**Files:**
- Modify: `src/projectMasterDetail.tsx`
- Modify: `src/projectMasterDetail.spec.tsx`
- Reuse unchanged: `src/projectMasterForm.ts`

**Interfaces:**
- Consumes the `mode: "edit"` branch of `ProjectMasterDetailProps`, shared controls, `coverCatalog`, and `ProjectReferencePicker`.
- Produces no mutation authority. It emits form changes and Save/Cancel intent to App.

- [ ] **Step 1: Write failing read/edit consistency tests**

Render the same Project first in read mode and then edit mode. Require identical section titles and order. In edit mode:

- the read-only values in Basic Information become the current 13 form controls in-place;
- Mechanical controls remain in Product/Package positions;
- Cover Material and Project reference controls remain in their corresponding component rows;
- Edit header actions are `Cancel` and `Save Changes`, while read mode exposes `Edit Master`;
- the normal Detail back action is not rendered during an active edit, preventing silent navigation loss;
- Cancel calls only `onCancel` and does not emit a changed canonical Project.

- [ ] **Step 2: Write failing Mechanical and disclosure-error tests**

Verify string-backed inputs retain decimal, zero, blank, negative, and `1e309` text. When `fieldErrors` gains a Mechanical error while Mechanical is collapsed, the component automatically expands Mechanical and shows the error beside the exact field. It must not auto-save or coerce the value.

- [ ] **Step 3: Write failing compact Cover/Leverage integration tests**

Verify each leverage row contains one closed picker trigger, not a permanent search input plus native select. Exercise:

- Current Project → own ProjectId;
- direct duplicate-name source → exact clicked ProjectId;
- clear → `""`;
- dangling → `Unavailable Project` and unchanged value during an unrelated Material edit;
- A/B/C/D Materials use `coverCatalog`; PCB has no Material control.

- [ ] **Step 4: Run Task 3 tests and verify RED**

Run:

```powershell
npm run test:run -- --maxWorkers=1 src/projectMasterControls.spec.tsx src/projectMasterDetail.spec.tsx src/projectMasterForm.spec.ts src/application/selectors/projectReferenceOptions.spec.ts
```

Expected: existing control/form/selector tests pass and inline-edit Detail assertions fail.

- [ ] **Step 5: Implement the edit branch without duplicating section structure**

Use one section array/order and branch only at each field/value position. The Detail component does not call Project commands, reducer dispatch, or selectors over PrototypeState. App supplies canonical read projections and the transient form.

When edit field errors change:

```ts
const mechanicalFormKeys = new Set<keyof ProjectMasterForm>([
  "productLengthMm",
  "productWidthMm",
  "productHeightMm",
  "productWeightG",
  "packageLengthMm",
  "packageWidthMm",
  "packageHeightMm",
  "grossWeightG",
]);

React.useEffect(() => {
  if (Object.keys(fieldErrors).some((key) => mechanicalFormKeys.has(key))) {
    setExpanded((current) => ({ ...current, mechanical: true }));
  }
}, [fieldErrors]);
```

Keep Save/Cancel in a top action bar that remains outside collapsed content. Save success and Cancel both return to read mode on the same Detail page; command-blocked Save remains in edit mode and displays issues.

- [ ] **Step 6: Run Task 3 tests to GREEN**

Run the Step 4 command again. Expected: all Detail, control, form, and selector tests pass.

---

### Task 4: Rewire App Navigation, Separate Create, and Migrate Runtime Characterization

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/legacy/characterization/runtime.spec.tsx`
- Consume: `src/projectMasterDetail.tsx`

**Interfaces:**
- Consumes `ProjectMasterDetail`, current selected canonical Project/row/leverage/options projections, existing transient edit state, command handlers, Schedule workspace props, and Team workspace props.
- Produces `Page = "dashboard" | "workspace" | "projectMasterDetail"` and explicit render branches; it does not add stored Project Master state.

- [ ] **Step 1: Write failing Workspace → Detail navigation tests**

Update runtime characterization to require:

- selecting a Project still opens Project Workspace;
- the fixed Project Header fields and ProjectId remain unchanged;
- the header action is `View Project Master`, not `Edit Project`;
- Mechanical and Cover/Leverage detail are absent from Workspace;
- Current Schedule follows the compact header in Workspace;
- `View Project Master` opens the selected Project’s Detail and `← Project Workspace` returns to that same Project Workspace;
- Dashboard/Project selection remains ProjectId-backed.

- [ ] **Step 2: Write failing inline Save/Cancel runtime tests**

Migrate existing Edit-modal tests to:

```text
Workspace → View Project Master → Edit Master → expand section → edit → Save/Cancel
```

Preserve assertions for:

- exact candidate Master leaves sent to `updateProjectMaster()`;
- untouched category, PCB/housing numbers, `other`, Team, Schedule, ID, and aliases;
- decimal/zero/blank Save;
- negative and non-finite Save blocking with Mechanical auto-expanded;
- blocking command issues keep edit mode; advisory-only Save returns read mode and shows feedback;
- Cancel restores canonical values;
- self/direct/null/dangling leverage and unresolved Cover IDs;
- source Project rename immediately changes the target’s resolved display identity.

- [ ] **Step 3: Write failing Resources/Team and Create isolation tests**

Require Resources to be absent from Workspace and present once inside Detail after expansion. Open Team from Detail, save through the existing Team command/reducer path, and Back to the same Detail. Existing Schedule/Team authority tests remain unchanged apart from navigation steps.

Open Create Project and prove there are no Mechanical, Cover/Leverage, disclosure, or `Edit Master` controls. Create duplicate-review flow and existing 13-field validation remain unchanged.

- [ ] **Step 4: Run the runtime slice and verify RED**

Run:

```powershell
npm run test:run -- --maxWorkers=1 src/projectMasterControls.spec.tsx src/projectMasterDetail.spec.tsx src/projectMasterForm.spec.ts src/application/selectors/projectReferenceOptions.spec.ts src/legacy/characterization/runtime.spec.tsx
```

Expected: component/form/selector tests pass and runtime navigation assertions fail against the current modal/Workspace structure.

- [ ] **Step 5: Add the explicit Detail page branch and preserve App authority**

Change the page discriminant and render explicitly:

```ts
type Page = "dashboard" | "workspace" | "projectMasterDetail";

const renderWorkspace = page === "workspace" && /* existing canonical guards */;
const renderProjectMasterDetail =
  page === "projectMasterDetail" &&
  selectedCanonicalProject !== null &&
  selectedDashboardRow !== null &&
  selectedLeverageDisplay !== null;
```

Do not retain the current `!renderWorkspace` Dashboard fallback for Detail. Add `openProjectMasterDetail()` and `backToProjectWorkspace()` callbacks. Reset edit errors/issues on entry/exit; if a selected Project disappears, retain the existing safe fallback to Dashboard.

On successful Save, dispatch the same `projectReplaced` action, set feedback, set `isEditProjectOpen`/renamed `isProjectMasterEditing` false, and remain on Detail. Cancel drops the transient form/errors and remains on read-only Detail.

- [ ] **Step 6: Reduce the modal to Create-only**

Rename module-local `ProjectDialog` to `CreateProjectDialog`, remove the edit discriminated branch and all expanded Master controls from it, and import shared basic controls from `projectMasterControls.tsx`. Keep create candidate allocation, defaults, required-field interpretation, duplicate review, and Create completion unchanged.

- [ ] **Step 7: Simplify Project Workspace and move Resources ownership**

Keep the fixed summary fields and status. Replace only the action:

```tsx
<button onClick={onViewProjectMaster}>View Project Master</button>
```

Remove Workspace’s Mechanical, Cover/Leverage, Resources, and local Team subview code. Keep Schedule and feedback in Workspace. Pass Team props to Detail, where Resources now owns the existing Team subview interaction.

- [ ] **Step 8: Run Task 4 tests to GREEN**

Run the Step 4 command again. Expected: all component and runtime tests pass with no modal-based detailed edit path remaining.

---

### Task 5: Update Current Documentation and Verify the Revision

**Files:**
- Modify: `README.md`
- Verify only: all files above plus protected architecture paths.

**Interfaces:**
- Consumes completed presentation behavior.
- Produces current-state documentation and verification evidence only.

- [ ] **Step 1: Update current Project Master UI documentation**

Replace the current statement that Mechanical/Cover details render directly in Workspace and Edit Project exposes them in the modal. Document:

- Workspace fixed summary plus `View Project Master`;
- full-width Detail with local `+`/`−` disclosures;
- default Basic expanded and Mechanical/Cover/Resources collapsed;
- inline `Edit Master` using identical sections;
- compact searchable leverage picker;
- unchanged Save authority and in-memory persistence boundary.

Do not rewrite historical specs or describe Export as implemented.

- [ ] **Step 2: Run the complete focused matrix**

```powershell
npm run test:run -- --maxWorkers=1 src/projectMasterControls.spec.tsx src/projectMasterDetail.spec.tsx src/application/selectors/projectReferenceOptions.spec.ts src/projectMasterForm.spec.ts src/application/commands/projectCommands.spec.ts src/application/commands/projectCommandIntegration.spec.ts src/application/selectors/projectSelectors.spec.ts src/config/v2/referenceData.spec.ts src/legacy/characterization/runtime.spec.tsx
```

Expected: all control, detail, form, selector, command, catalog, navigation, Save/Cancel, Create, Schedule, and Team regressions pass.

- [ ] **Step 3: Run the complete suite and production build**

```powershell
npm run test:run -- --maxWorkers=1
npm run build
```

Expected: both exit `0`; no generated build artifact becomes tracked.

- [ ] **Step 4: Run whitespace and protected-scope audits**

```powershell
git diff --check
git status --short
git diff --stat
git diff -- src/domain/project src/application/commands/projectCommands.ts src/application/state src/config/v2/referenceData.ts src/fixtures src/application/selectors/dashboardAttention.ts src/application/selectors/scheduleSelectors.ts src/application/commands/teamCommands.ts package.json package-lock.json vite.config.ts .github docs/superpowers/specs
rg -n 'base:.*schedule' vite.config.ts
```

Expected: the accepted baseline files remain plus this revision’s plan, controls/detail components/tests, `main.tsx`, runtime characterization, and current README only. Protected diff is empty and Vite base remains `/schedule/`.

- [ ] **Step 5: Perform one completed-change review**

Review page-state fallback, canonical authority, read/edit section parity, invalid-input visibility, dangling-ID preservation, duplicate-name exact selection, picker keyboard/ARIA behavior, Create isolation, Team/Resources navigation, and narrow-width layout. Categorize Critical, Important, and Minor findings; fix Critical/Important test-first without broadening scope.

- [ ] **Step 6: Preserve the human-verification checkpoint**

Do not commit, push, merge, implement Export, or begin another User Trial task. Report tests/build/audit/reviewer results and the manual checks below.

## Manual UI Verification Targets

1. Open a Project and confirm Workspace retains the fixed compact header, shows `View Project Master`, omits detailed Mechanical/Cover fields, and still renders Schedule normally.
2. Open Project Master Detail and confirm section order and defaults: Basic open (`−`), Mechanical/Cover/Resources closed (`+`).
3. Toggle every section and confirm visible `+`/`−`, accessible names, and no persisted state after leaving/reopening Detail.
4. Enter Edit Master and confirm controls remain in the same sections/positions; Cancel and Save Changes remain available outside collapsed content.
5. Enter valid decimal/zero/blank Mechanical values and verify Save; enter negative and non-finite values and verify Mechanical opens with an error and Save is blocked.
6. Verify A/B/C/D Cover dropdowns and PCB Material `—`.
7. Open each leverage picker and verify one compact closed control, on-demand search by Year/STN/QCI, duplicate-name selection, Current Project/New Design, clear/null, direct source, and dangling `Unavailable Project` preservation.
8. Rename a source Project and confirm a target resolves the new identity without reselecting it.
9. Expand Resources, open Team Member, return to Detail, and confirm Schedule remains canonical in Workspace.
10. At common desktop and phone-width viewports, verify Cover/Leverage stacks without page-level or nested horizontal scrollbars and keyboard-only picker use remains functional.

## Decisions and Scope Notes

- **Recommended edit model:** Inline on Project Master Detail. A second edit page/panel adds duplicate structure with no authority benefit.
- **Disclosure ownership:** Local transient state in `ProjectMasterDetail`; no persistence and no domain/state field.
- **Resources ownership:** Move the existing cards from Workspace to Detail rather than duplicate them. Schedule content itself remains in Workspace and Team authority/lifecycle is unchanged.
- **Compact selector:** A dependency-free accessible trigger/search/listbox because no reusable repository pattern exists; native `datalist` is rejected because duplicate display labels cannot reliably preserve exact ProjectId selection.
- **Accepted logic retained:** selector/form/validation/catalog/command/reducer/domain logic remains unchanged. Rework is limited to presentation components, App page wiring, characterization tests, and current documentation.
- **Architecture mismatch:** None. The existing App page discriminant and transient edit state can support the Detail page without a router, schema change, or new authority.
- **Product decision embodied by this plan:** Back navigation is unavailable during active edit; users choose Cancel or Save Changes first. This avoids adding an unsaved-changes confirmation workflow outside the approved scope.
