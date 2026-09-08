# Task 2.1 — Project/Master Runtime Migration Design

**Status:** Approved design; documentation only; not implemented

## Scope

Task 2.1 is the first production-runtime migration slice. It moves Project and
Project Master ownership from the legacy React runtime to the existing V2
Foundation while preserving the current Dashboard and Project Workspace user
experience as closely as the canonical data permits.

The authority change is:

```text
legacy App.projects + selectedProject
    ↓
PrototypeState.projects + selectedProjectId
```

After this slice, canonical `Project` aggregates are the sole Project/Master
business authority used by Dashboard rendering, Project selection and header
display, Create Project, and Edit Master. Schedule and Team runtime behavior
are not migrated. Their legacy implementations remain isolated and are not
presented as project-specific data for a selected canonical Project.

This document records the approved architecture. It is not an implementation
plan and does not authorize production changes by itself.

## Context

### Foundation available at the start of Task 2.1

The repository already provides the boundaries this runtime slice must
consume:

- `Project` is the canonical aggregate with immutable `ProjectId`, current
  `ProjectMaster`, `identityAliases`, per-Project `ProjectSchedule`, and current
  `ProjectTeam | null`.
- `PrototypeState` owns a readonly `projects` collection.
- `prototypeReducer` accepts only whole-aggregate `projectAdded` and
  `projectReplaced` actions.
- `getProjectById()` resolves a canonical Project by immutable identity.
- `selectOfficialProjectSources()` exposes current Master, latest Published
  Schedule, and current Team without exposing a Working Draft as an official
  source.
- `canonicalProjectFixtures` contains exactly five scenario-driven V2
  development Projects.
- V2 reference data provides stable catalog IDs and display labels for the
  canonical catalog-backed fields.
- Task 1.7 provides `createProject()` and `updateProjectMaster()` as the Project
  command boundaries.
- Task 1.8 provides `interpretCreateProjectResult()` and the approved duplicate
  Create decision orientation.
- Task 1.9 provides a complete `CreateProjectMasterInput`, keeps QCI PM outside
  Master, and provides `interpretUpdateProjectMasterResult()` for completed or
  blocked Edit outcomes.

Task 2.1 consumes these APIs. It does not redesign them.

### Current legacy boundary

The current runtime is concentrated in `src/main.tsx`. Repository inspection at
the approved starting revision confirms:

- There is no router, application store, Context/Provider architecture, or
  backend persistence boundary.
- `App.projects` is a writable `DashboardProject[]` initialized from
  `dashboardProjectRows.json` through
  `dashboardProjectsFromWorksheetRows()`. The JSON contains 33 legacy Project
  rows after its header row.
- The same `App.projects` collection feeds Dashboard reads and receives legacy
  Create/Edit writes.
- `selectedProject` stores a whole mutable legacy `DashboardProject` object.
- Dashboard row selection also changes the active resource to Schedule before
  opening Workspace.
- `DashboardProject` combines copied Master values with legacy display and
  status fields such as `currentStage`, `mdrr`, `nextMilestone`, `dueDate`,
  `workingDraft`, and `needsAttention`.
- Schedule/version history is app-global, so every selected legacy Project can
  appear to expose the same Schedule.
- Team editor data is held separately in a per-legacy-project map.
- Legacy Create builds a `DashboardProject`, derives identity from collection
  length, and appends it directly to the Dashboard collection.
- Legacy Edit replaces a `DashboardProject` and synchronizes the separately
  selected whole object.
- The local Schedule screen named Working Draft is transient editor state; it
  is not the canonical persisted `ScheduleWorkingDraft` model.
- Needs Attention is populated by hardcoded Project-name lists.
- The current Dashboard export consumes the legacy Project rows and exports all
  Projects rather than only filtered rows.

The Task 2.0 runtime characterization test protects the current Dashboard
read, search/filter, selection, Workspace header, Edit write-through, and
Create visibility behavior. Some assertions must intentionally change when the
runtime authority changes from 33 legacy rows to five canonical Projects.
Those assertions must not force legacy Project/Master authority to remain.

## Goals

Task 2.1 must:

1. Make `PrototypeState.projects` the sole writable production authority for
   Project/Master business state.
2. Initialize the runtime with exactly `canonicalProjectFixtures`.
3. Derive Dashboard and export presentation rows from canonical official
   sources.
4. Select Projects by `ProjectId`, resolving the current aggregate from
   canonical state on every render.
5. Route Dashboard selection, Review Existing selection, and successful Create
   to Workspace → Project Master.
6. Wire Create and Edit through the existing Task 1.7 command and Task 1.8/1.9
   interpretation boundaries.
7. Preserve hidden Master values during the intentionally partial Edit UI.
8. Prevent Working Draft values and legacy Schedule/Team data from appearing
   as official data for a canonical Project.
9. Preserve the Dashboard layout, columns, search, filters, export scope, and
   general Create/Edit dialog presentation.
10. Keep Schedule and Team visible as explicitly disabled migration islands.

## Non-goals

Task 2.1 explicitly excludes:

- Schedule migration, Schedule Import, Schedule Publish, and Schedule Working
  Draft runtime migration
- Team migration, Team Save migration, and persisted Team editor migration
- a full eight-section Master editor
- Master versioning or a Master Working Draft
- Master completeness UI or a new completeness policy
- backend, database, persistence, or API work
- authentication, authorization, or permissions
- router introduction
- Provider, Context, repository, service, adapter-framework, or new global
  store architecture
- a global warning engine or warning database
- legacy data or file mass deletion
- Dashboard redesign or new Dashboard metrics
- new Current Stage inference
- new MDRR inference beyond an already approved canonical source rule
- Schedule or Draft-based Portfolio attention rules
- Task 2.2 or any subsequent migration slice

## Target architecture

### Canonical ownership model

The root `App` uses the existing reducer as its canonical Project boundary:

```text
useReducer(prototypeReducer, {
    projects: canonicalProjectFixtures
})
```

Conceptually, the runtime has four distinct kinds of state:

| Concept | Responsibility | Authority |
| --- | --- | --- |
| Canonical `Project` | Project/Master/Schedule/Team business aggregate | Single source of business truth |
| `PrototypeState.projects` | Reducer-owned collection of canonical aggregates | Sole writable Project collection |
| Task 2.1 `DashboardProjectRow` | Readonly Dashboard/export projection | Derived presentation data only |
| Form and navigation state | Selection ID, search, filters, dialogs, form values, duplicate-review state, active resource | Transient UI/controller state only |

`PrototypeState.projects` stores the canonical aggregates; it does not copy
their business values into a second representation. `DashboardProjectRow` and
form state may mirror values for presentation or editing, but neither may be
written as an alternative Project authority.

The runtime must not retain a writable legacy `DashboardProject[]` beside the
reducer state. `dashboardProjectRows.json` may remain in the repository for
history and characterization, but production Project/Master runtime code no
longer imports it as a Project source.

Transient state remains outside `Project` and outside `PrototypeState` unless
the existing Foundation explicitly defines otherwise. This includes:

- `selectedProjectId`
- Dashboard search and filters
- column widths
- page and resource selection
- Create/Edit dialog state
- Create/Edit form state
- the ProjectId allocated for an open Create attempt
- validation and advisory presentation state
- duplicate-review matching IDs and selection state
- unsaved editor changes

Working Draft and unsaved editor changes remain different concepts. A
`ScheduleWorkingDraft` is persisted Project Schedule business state. Create or
Edit form values are transient UI/controller state. Task 2.1 does not add form
values or dirty flags to `Project`, `ProjectSchedule`, `PrototypeState`, or
validation.

### Canonical initial data

Production prototype runtime state starts with exactly the five entries in
`canonicalProjectFixtures`. The 33 legacy Dashboard rows are not converted,
merged, bootstrapped, or retained as another writable Project universe.

This is an intentional prototype authority cutover. No legacy-to-V2 Project
mapper is part of Task 2.1.

## Dashboard projection

### Pure projection boundary

Task 2.1 introduces a narrowly scoped, framework-neutral projection module in
the existing application read/selector area. This is a Task 2.1 design
addition; it is not an API that exists at the starting revision.

Its data flow is:

```text
PrototypeState.projects
    ↓ ProjectId
selectOfficialProjectSources()
    ↓ current Master + latest Published Schedule + current Team
reference-source resolution
    ↓
readonly DashboardProjectRow[]
```

The projector must be pure. It owns no state, imports no React/runtime code,
dispatches no actions, invokes no commands, performs no business validation,
and reads no Working Draft business values. It is a focused Dashboard read
projection, not a generic adapter framework.

The selector uses `selectOfficialProjectSources()` so that official Portfolio
values can come only from:

```text
current Master
+ latest Published Schedule only
+ current Team
```

Task 2.1 does not currently add Team-derived columns, but retaining the
approved source boundary prevents a later view from treating a separate Team
map as official.

### DashboardProjectRow

`DashboardProjectRow` is a new readonly Task 2.1 presentation type. Its exact
implementation naming may follow the selected focused projection module, but
the semantic shape is:

```ts
interface DashboardProjectRow {
    readonly projectId: ProjectId;
    readonly year: string;
    readonly customer: string;
    readonly productLine: string;
    readonly stnProjectName: string;
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
```

These fields support the current Dashboard column set and the current
Dashboard-oriented export fields. All fields except `projectId` are display
values. Missing or unresolved display values are `"-"`.

The row is never a command input, reducer payload, form persistence model, or
business entity. No view operation writes a row back into a `Project`.

### Existing Dashboard behavior

The Dashboard retains the exact current column labels and order:

- Year
- Customer
- Product Line
- Project Name
- QCI Model Name
- Panel Size
- CPU
- GPU
- Project Status
- Current Stage
- MDRR

The Dashboard label remains Project Name. Its value is derived from canonical
`master.basicInformation.stnProjectName`; the canonical source field does not
rename the preserved Dashboard column. Likewise, QCI Model Name and Project
Status retain their current Dashboard labels. The approved Project Name → STN
Project Name terminology change applies to the Create/Edit dialog, not to the
Dashboard column set.

Search and filters operate on the projected display rows. Search/filter state
stays component-local and the filter option lists are derived from the
projected rows. Column-width state also remains presentation-only. None of
these values enter `Project` or `PrototypeState`.

The visual structure is preserved. A missing canonical value displays `"-"`;
the projector never supplements it from legacy `DashboardProject` data.

## Reference-data behavior

Catalog-backed canonical IDs resolve through the existing V2 reference
sources. Customer, Product Line, Panel Size, CPU, and GPU currently come from
development reference fixtures rather than a production catalog module;
Status comes from the configured V2 status catalog. Task 2.1 uses these sources
as they exist and does not move or redesign them.

The same sources support Dashboard labels and Create/Edit selection controls:

- Customer: `customerReferenceFixtures` for the development runtime
- Product Line: `productLineReferenceFixtures`
- Panel Size: `panelSizeReferenceFixtures`
- CPU: `cpuReferenceFixtures`
- GPU: `gpuReferenceFixtures`
- Project Status: `statusCatalog`

The remaining visible text fields stay free-text controls. Year remains the
canonical numeric value represented by the existing UI control rather than a
new catalog.

An unresolved catalog ID displays `"-"`. The runtime does not guess a label,
fall back to a legacy option string, choose the first catalog entry, or write a
resolved label into canonical state. If an Edit form encounters an unresolved
existing ID and the user does not replace it with a known choice, the
preserve-then-overwrite rule retains the original canonical value; the display
placeholder itself is never persisted.

Create and Edit controls do not maintain a parallel legacy option list for
fields backed by these catalogs.

## Schedule-derived Dashboard fields

Only `latestPublishedSchedule` returned by
`selectOfficialProjectSources()` is eligible to provide Schedule-derived
Dashboard values. Older Published versions, a Working Draft, legacy flat
fields, and the app-global legacy Schedule are ineligible.

At the starting revision there is no committed Current Stage derivation rule.
Task 2.1 therefore displays `"-"` for Current Stage. It does not infer a stage
from milestone ordering, applicability, dates, or catalog groups.

The Foundation defines an MDRR milestone ID, and a latest Published Schedule
may contain that milestone. It does not define a Dashboard rule choosing
between the milestone's `plan` and `actual` values or otherwise defining the
displayed MDRR date. Identifying an MDRR row alone is not approval to invent
that selection rule. Task 2.1 therefore displays `"-"` for MDRR. Displaying a
date would require a separately approved rule; no legacy fallback or
Task-2.1-specific inference is permitted.

Consequently:

- a Project with no Published Schedule produces `"-"` for Schedule-derived
  fields;
- a Working Draft without a Published Schedule also produces `"-"`;
- a Project with both Published and Working Draft data uses only its latest
  Published version as an eligible source; and
- Draft values can never change official Dashboard values.

## Project selection and navigation

Root transient selection is:

```ts
selectedProjectId: ProjectId | null
```

The runtime never stores a whole selected Project as mutable business
authority. It derives the selected aggregate on render:

```text
PrototypeState + selectedProjectId
    ↓
getProjectById()
    ↓
Project | null
```

After `projectReplaced`, the same ID automatically resolves the updated
aggregate. No synchronization effect or second selected object is required.

Dashboard row clicks carry only `row.projectId`. Dashboard selection, Review
Existing selection, and successful Create all set that ID, open Workspace, and
set the active resource to Project Master.

If a non-null selected ID no longer resolves, the runtime must not display a
stale Project object. It clears the effective selection and returns to the
Dashboard (with a non-business unavailable message if one is presented). It
does not select a different Project by name or array position.

## Project Workspace and resource gating

### Project Master read mode

Workspace reads Project identity and Master fields from the selected canonical
`Project`. The header and Project Master view do not receive a legacy
`DashboardProject` as business input. Catalog-backed fields use the same
reference resolution rules as Dashboard; missing display values use `"-"`.

Project Master is the default and only enabled business resource in this
slice. A conceptual transient resource value may include `projectMaster`, but
resource state is UI state and is not added to `Project` or `PrototypeState`.

### Schedule and Team gate

The resource shell remains visible:

| Resource | Task 2.1 state | Label |
| --- | --- | --- |
| Project Master | Enabled and active on Workspace entry | Project Master |
| Schedule | Disabled | Migration pending |
| Team | Disabled | Migration pending |

Clicking a disabled Schedule or Team resource does not navigate and does not
change the active resource. Runtime resource state cannot point at a disabled
resource. The existing app-global Schedule/version state and legacy Team map
may remain physically present as isolated legacy code, but canonical Workspace
does not read, render, initialize, or mutate them as data for its selected
Project.

The legacy Schedule and Team implementations are not deleted or refactored in
this slice. They remain migration islands for separately reviewed work.

## Create Project flow

### Form and canonical candidate

Opening Create allocates one opaque UUID-based `ProjectId` for that Create
attempt and stores it in transient dialog/controller state. Closing the flow
abandons that attempt; retries within the same open flow, including duplicate
review and Create Anyway, reuse the same ID. Project names and collection
length are never identity sources.

Current source defines the same 13 visible fields for both Create and Edit.
Task 2.1 preserves that exact field set and the existing dialog layout. It does
not add a canonical Master field merely because the schema supports it, and it
does not remove an optional field that is already visible. The fields map to
canonical Master as follows:

| Visible field | Canonical destination |
| --- | --- |
| STN Project Name | `master.basicInformation.stnProjectName` |
| QCI Model Name | `master.basicInformation.qciModelName` |
| Acer Model Name | `master.modelRegulatory.acerModelName` |
| Acer Marketing Name | `master.modelRegulatory.acerMarketingName` |
| Year | `master.basicInformation.year` |
| Customer | `master.basicInformation.customer` |
| Product Line | `master.basicInformation.productLine` |
| Panel Size | `master.basicInformation.panelSize` |
| CPU | `master.platformHardware.cpu` |
| GPU | `master.platformHardware.gpu` |
| SSID | `master.modelRegulatory.ssid` |
| RMN | `master.modelRegulatory.rmn` |
| Project Status | `master.basicInformation.status` |

The legacy label Project Name becomes STN Project Name. Other labels use the
canonical repository terminology.

Before calling the command, the UI constructs one complete
`CreateProjectMasterInput`. Visible catalog controls contribute canonical
IDs, text controls contribute canonical text or `null`, and Year contributes
`number | null`. Hidden fields use only their existing Foundation-approved
`null`/empty representations:

- `category` is `null` because it is not exposed;
- `pcbNumber` and `housingNumber` are `null`;
- all leverage references are `null`;
- all cover values are `null`;
- all mechanical product and package values are `null`; and
- `remark` is `null`.

No empty strings, hyphens, first-catalog choices, or invented business defaults
are stored for hidden canonical leaves.

Customer and Project Status are both currently visible and remain visible.
They retain the Task 1.9 command-owned default behavior. If the user has not
explicitly chosen them during Create, the candidate omits them or supplies
`null`, allowing `createProject()` to apply the existing Acer and RFQ defaults.
Explicit non-null catalog selections are preserved. During Edit, the controls
start from the existing canonical Customer and Status IDs; leaving them
unchanged preserves those values. The UI does not implement
`customer || "Acer"` or `status || "RFQ"` as a competing rule.

The current dialog does not expose QCI PM, so the `qciPm` Create input is
`null`, which is already legal Foundation behavior. QCI PM remains Team-owned;
it is not moved into Master. The Create command may still construct the
canonical initial Team using its existing template semantics even though Team
UI remains gated.

### Command and interpretation

The complete flow is:

```text
Open Create dialog
    ↓ allocate ProjectId once
transient form state
    ↓ build complete CreateProjectMasterInput
createProject()
    ↓
interpretCreateProjectResult()
```

React performs type/display conversion and orchestration only. It does not
reimplement required-field validation, duplicate detection, identity
normalization, defaulting, or Project construction.

The only blocking required Create fields remain Year, Product Line, and STN
Project Name.

#### Rejected

A required-field or duplicate-ProjectId rejection causes no reducer dispatch.
The dialog remains open and presents command/interpreter feedback. Required
field issues should be rendered near their corresponding visible fields where
practical, but the UI does not independently decide that a field is required.

#### Completed

For a normal completed Create:

```text
completed created result
    ↓ projectAdded with result.project
selectedProjectId = result.project.id
close Create flow
open Workspace
active resource = Project Master
```

Dashboard rows update solely because the projector re-derives them from the
new reducer state.

## Duplicate review flow

Duplicate business identity remains Year + Product Line + STN Project Name.
It is review-required and is not a duplicate `ProjectId` failure.

`interpretCreateProjectResult()` supplies the existing action orientation:

```text
Duplicate Review
├─ backward: Review Existing
└─ forward: Create Anyway
```

### Review Existing

Choosing the backward Review Existing action resolves every
`matchingProjectId` against current `PrototypeState.projects`. The next UI
behavior depends only on the number of currently resolvable canonical
Projects:

- Exactly one resolvable match: Review Existing directly selects that
  `ProjectId`, closes the Create/duplicate flow, opens Workspace, and lands on
  Project Master. The Review Existing action is already the user's explicit
  choice; there is no redundant selection confirmation.
- Multiple resolvable matches: show all matches and require the user to choose
  one immutable `ProjectId`. Never auto-select the first match. Each choice
  displays Year, Product Line, STN Project Name, and QCI Model Name when
  available. Choosing one closes the Create/duplicate flow, opens Workspace,
  and lands on Project Master.
- Zero resolvable matches: do not resolve by name and do not silently create a
  Project. Keep the duplicate review actionable so the user can return to the
  form or use the existing explicit forward Create Anyway choice. Unavailable
  matching IDs may be indicated as unavailable without adding a new business
  decision type.

Review Existing never modifies an existing Project.

### Create Anyway

Create Anyway invokes the existing `confirmCreateProjectAnyway()` path. That
path performs a second `createProject()` command with
`allowBusinessIdentityDuplicate: true` in a copied context.

The second call reuses:

- the same allocated candidate `ProjectId`;
- the same complete `CreateProjectMasterInput` values;
- the same `qciPm`; and
- the same intended Create context except for the explicit duplicate override.

The first review candidate is never dispatched directly, and no new ID is
generated. A completed second result follows the normal `projectAdded`, select,
close, and Project Master landing flow. A rejection causes no dispatch and
keeps actionable feedback in the Create flow.

## Edit Project Master flow

### Preserve then overwrite

Edit is a partial UI over the full canonical Master. Opening Edit initializes
transient form state from the selected canonical `project.master` and resolved
catalog display choices.

Saving starts with the current canonical Master and overwrites only fields
represented by the dialog:

```text
selected Project.master
    ↓ copy existing complete Master
overwrite visible canonical fields only
    ↓ complete ProjectMaster candidate
updateProjectMaster()
    ↓
interpretUpdateProjectMasterResult()
```

Every hidden canonical value remains exactly unchanged, including
category, PCB/housing numbers, leverage references, cover values, mechanical
product/package values, remark, and any other canonical field not exposed by
the current dialog. Edit does not rebuild Master from Create defaults, clear
hidden fields, or convert the display `"-"` placeholder into canonical data.

`ProjectId` is not editable and remains unchanged.

### Result handling

- `completed` with no issues: dispatch `projectReplaced` with the returned
  `result.project`, retain `selectedProjectId`, close Edit, and remain on
  Project Master.
- `completed` with Advisory issues: dispatch the same whole-Project
  replacement. Advisories remain available as non-blocking feedback.
- `blocked`: do not dispatch. Keep the dialog, transient form/candidate
  context, and returned issues available for correction and another Save.
- Cancel: close the editor and discard transient changes only. The canonical
  Project is unchanged.

The UI does not supply a new Master completeness-field policy, rerun
validation, promote Advisory issues, override Blocking issues, or introduce a
rejected Edit state. It does not create an Edit `WorkflowDecisionRequest`.

### Identity aliases

STN Project Name and QCI Model Name remain editable because the existing UI
exposes them. The complete candidate is passed to `updateProjectMaster()`,
which remains solely responsible for normalization and previous-name alias
capture. React does not read-modify-write `identityAliases` and does not infer
whether a rename deserves an alias.

Because selection stores only `ProjectId`, renaming either business value does
not affect selection or Project identity.

Master is current saved, non-versioned state. Transient Edit form values are
not a Master Working Draft and do not create a Schedule Working Draft.

## Needs Attention

The existing Needs Attention shell remains visible where practical, but Task
2.1 stops using hardcoded Project-name lists as production truth. Its content
is a canonical-safe empty state, for example:

```text
No items requiring attention.
```

Task 2.1 does not aggregate Import Warnings, calculate Milestone Due or
Overdue, derive warnings from a Working Draft, or create a warning database.
The absence of an approved canonical warning source produces the empty state,
not legacy fallback data.

## Export

Export Summary remains available and shares the exact canonical projector used
for Dashboard rendering:

```text
PrototypeState.projects
    ↓ same official-source Dashboard projector
ALL DashboardProjectRow[]
    ↓ existing Dashboard-oriented export formatting
workbook
```

Export continues to include all canonical Projects, not just currently
filtered rows. It uses resolved display labels, emits `"-"` for missing values
where compatible with the existing Dashboard export, and never supplements
values from legacy rows or Working Draft data.

The shared projected rows prevent Dashboard and export from implementing
separate business-value derivations.

## Error and edge-case behavior

| Case | Required behavior |
| --- | --- |
| Selected `ProjectId` no longer resolves | Do not render stale data; clear effective selection and return to Dashboard. |
| Catalog ID cannot be resolved | Display `"-"`; never guess or persist the placeholder. |
| Create misses Year, Product Line, or STN Project Name | Command/interpreter rejection; no dispatch; Create remains open with feedback. |
| Create has one resolvable business-identity match | Show duplicate review; choosing Review Existing directly selects and opens that sole Project. |
| Create has multiple currently resolvable business-identity matches | Resolve and show all matches; never select the first automatically. |
| Duplicate review has zero currently resolvable matches | Do not resolve by name or silently create; keep return-to-form and explicit Create Anyway actions available. |
| Create Anyway | Perform the second command with the same ID, Master candidate, QCI PM, and context except the override. |
| Duplicate ProjectId | Hard rejection; no Project added. |
| Edit has Blocking issues | No `projectReplaced`; retain editor and issue context for correction. |
| Edit has Advisory-only issues | Completed; replace Project and retain advisory feedback. |
| Edit is cancelled | Discard transient form changes only. |
| Edit exposes only part of Master | Preserve every hidden canonical value from the existing Master. |
| Project has no Published Schedule | All Schedule-derived Dashboard fields display `"-"`. |
| Project has Working Draft only | Draft is ignored for official Dashboard values; fields display `"-"`. |
| Project has Published and Draft data | Only latest Published data is eligible; Draft cannot pollute the row. |
| No canonical warning source exists | Needs Attention renders its empty state. |
| Disabled Schedule/Team resource is clicked | No navigation or active-resource change; Migration pending remains visible. |

These are orchestration and safe-display outcomes. They add no new business
validation, identity, Schedule, Team, milestone, or warning rules.

## Testing strategy

Task 2.1 uses the existing Vitest and React Testing Library setup. Tests are
organized by boundary rather than by coverage percentage.

### 1. Dashboard projector unit tests

Pure tests cover:

- canonical Master values projecting to the expected Dashboard row;
- preservation of immutable `projectId`;
- every catalog-backed Dashboard value resolving from its existing V2
  reference source;
- unknown/unresolved catalog IDs displaying `"-"`;
- missing canonical values displaying `"-"`;
- no Published Schedule producing `"-"` for Schedule-derived values;
- latest Published Schedule being the only eligible official Schedule source;
- a Working Draft never changing official Dashboard values;
- Current Stage remaining `"-"` because no approved derivation exists;
- MDRR remaining `"-"` under the current no-selection-rule baseline, and never
  deriving from legacy or Draft data; and
- readonly/view-model-only semantics where TypeScript assertions are useful.

### 2. Runtime and component migration tests

Behavioral tests cover:

- the initial Dashboard showing exactly the five canonical development
  Projects;
- the exact current Dashboard labels and order remaining Year, Customer,
  Product Line, Project Name, QCI Model Name, Panel Size, CPU, GPU, Project
  Status, Current Stage, and MDRR;
- existing search and filter interactions operating on projected rows;
- a row opening the correct Project by `ProjectId`;
- Workspace landing on Project Master;
- Project header and Master read mode showing the canonical Project;
- Schedule and Team remaining visible, disabled, and labeled Migration
  pending;
- a disabled resource click leaving Project Master active;
- Needs Attention omitting legacy hardcoded warnings and showing the empty
  state; and
- Export consuming all five canonical-derived rows regardless of current
  filters.

The Task 2.0 characterization remains a safety net. Assertions that encode 33
legacy rows, legacy labels, whole-object selection, or legacy write-through
are deliberately updated when the approved authority change makes them
obsolete.

### 3. Create flow tests

Behavioral integration coverage includes:

- required-field rejection with no reducer dispatch;
- ordinary Create through command, interpretation, `projectAdded`, ID
  selection, and Project Master landing;
- a unique UUID-based ID allocated once per Create attempt;
- duplicate business identity entering review;
- one resolvable matching Project, where Review Existing directly opens that
  sole immutable ID without mutation;
- multiple resolvable matching Projects, where Review Existing shows every
  match and requires an explicit ID choice;
- zero resolvable matching Projects, where no name fallback or implicit Create
  occurs and the existing actions remain available;
- Create Anyway using the second-command path;
- Create Anyway reusing the same ProjectId and complete Master candidate;
- Create Anyway preserving QCI PM/create context;
- duplicate ProjectId rejection;
- catalog-backed form values becoming canonical IDs;
- the existing 13-field Create dialog remaining intact, including visible
  Customer and Project Status controls, without adding schema-only fields;
- command-owned Acer/RFQ defaults when Customer/Status remain omitted or null;
  and
- no direct Dashboard-row mutation.

### 4. Edit flow tests

Behavioral integration coverage includes:

- form initialization from the selected canonical Master;
- the existing 13-field Edit dialog remaining intact, including visible
  Customer and Project Status controls, without adding schema-only fields;
- visible field edits preserving hidden Master fields;
- rename keeping `ProjectId` unchanged;
- alias behavior coming from `updateProjectMaster()` rather than UI mutation;
- Blocking interpretation retaining the editor and causing no dispatch;
- Advisory-only interpretation completing and allowing replacement;
- successful `projectReplaced` immediately updating Workspace and Dashboard
  projection through the retained selected ID; and
- Cancel discarding transient form state without changing canonical state.

### 5. Regression verification

Implementation verification includes focused projector and runtime tests,
existing Task 1.7 command/validation regression, Task 1.8 and Task 1.9 workflow
regression, canonical V2 fixture regression, the full test suite, and the
production build. The existing Vite large-chunk warning is non-blocking if it
remains the same known warning and no new warning or error appears.

## Expected file and module boundary

At design level, the migration is expected to affect only these focused
areas:

- `src/main.tsx`: replace legacy Project/Master state, projection consumption,
  ID selection, Create/Edit orchestration, Project Master landing, resource
  gates, Needs Attention content, and export input.
- existing Dashboard presentation support such as `src/dashboardColumns.ts`:
  only row-key alignment needed to retain the exact current labels, order, and
  column set; it does not gain business derivation or state ownership.
- a new framework-neutral module in the existing application selector/read
  area: define the Task 2.1 `DashboardProjectRow` and pure canonical Dashboard
  projection.
- a focused projector unit test beside that read module.
- existing React runtime characterization/migration coverage, including
  `src/legacy/characterization/runtime.spec.tsx` or an equivalently focused
  runtime test, updated only for intentional Task 2.1 behavior.

The runtime consumes the existing domain aggregate, reducer/state, Project
selector, official-source selector, reference sources, canonical fixtures,
Task 1.7 commands, and Task 1.8/1.9 interpretations without changing their
business design.

No Project schema, reducer, validation, identity, Schedule command, Team
command, Provider/store, repository, service, persistence, or backend module
belongs in this Task 2.1 boundary. Legacy `projectMaster.ts`, JSON data, helper
tests, and Schedule/Team components may remain in the repository when no
longer authoritative or reachable from canonical Workspace.

## Migration sequencing

The architecture permits the pure projector and its unit coverage to be
established independently before runtime use. The production authority
cutover, however, must be coherent:

1. The canonical reducer state, projected Dashboard rows, ProjectId selection,
   and Workspace Project Master read path become active together.
2. Create and Edit stop writing legacy Dashboard objects in the same runtime
   slice and dispatch whole canonical Projects instead.
3. Export switches to the same projector when Dashboard does; it must not lag
   behind on legacy authority.
4. Schedule and Team links are gated before canonical Project selection can
   expose Workspace, preventing a temporary false project-specific
   association.
5. Legacy Project/Master imports may remain on disk but are disconnected from
   production authority; physical retirement requires separate review.

There must be no externally reviewable intermediate state in which both a
legacy writable Project list and `PrototypeState.projects` can accept
Project/Master writes.

## Success criteria

Task 2.1 is successful when:

1. `PrototypeState.projects` is the sole writable production Project/Master
   authority.
2. Initial runtime data is exactly the five `canonicalProjectFixtures`.
3. `dashboardProjectRows.json` is no longer a production Project source.
4. Runtime no longer owns writable `DashboardProject[]` business state.
5. Project selection stores only `ProjectId` and resolves through
   `getProjectById()`.
6. Dashboard rows are pure readonly derived presentation models.
7. Dashboard official values respect `selectOfficialProjectSources()` and the
   current Master + latest Published Schedule + current Team rule.
8. Working Draft values cannot pollute Dashboard official business values.
9. Dashboard preserves the current column labels and order—Year, Customer,
   Product Line, Project Name, QCI Model Name, Panel Size, CPU, GPU, Project
   Status, Current Stage, and MDRR—using `"-"` for unsupported values.
10. Create uses the Task 1.7 command and Task 1.8 interpretation.
11. Duplicate review supports Review Existing and Create Anyway with the
    approved backward/forward orientation.
12. Review Existing directly opens the sole resolvable match, presents all
    matches when multiple resolve, and does not silently choose or create when
    none resolve.
13. Create Anyway performs a second command call with the same ProjectId and
    complete Master candidate.
14. Successful Create dispatches `projectAdded`, selects the new ID, and opens
    Project Master.
15. Edit uses `updateProjectMaster()` and
    `interpretUpdateProjectMasterResult()`.
16. Blocking Edit does not dispatch; Advisory-only Edit remains completable.
17. Hidden Master fields survive the partial UI Edit unchanged.
18. `ProjectId` remains immutable and is never derived from a name or array
    position.
19. Identity alias semantics remain Foundation-owned.
20. Dashboard selection, Review Existing, and successful Create all land on
    Project Master.
21. Schedule remains visible, disabled, and labeled Migration pending.
22. Team remains visible, disabled, and labeled Migration pending.
23. Canonical Workspace cannot navigate into the legacy Schedule or Team UI.
24. Needs Attention no longer uses hardcoded legacy Project names and renders a
    canonical-safe empty state.
25. Export uses all rows from the same canonical Dashboard projector.
26. Reference-backed displays and controls use the existing V2 reference
    sources and do not persist display labels.
27. Create and Edit preserve their exact current 13-field visible set,
    including Customer and Project Status, with Project Name relabeled only in
    those dialogs as STN Project Name.
28. No full eight-section Master UI or Master completeness policy is added.
29. No Current Stage or MDRR rule is invented.
30. No Provider/store/repository/service/adapter framework is introduced.
31. No Schedule or Team runtime migration is performed.
32. No legacy mass cleanup is performed.
33. Focused migration and Foundation regression tests pass.
34. The full test suite passes.
35. The production build passes.
