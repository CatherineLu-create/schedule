# Task 1.9 — Complete the Project/Master UI Integration Boundary

**Status:** Approved design; documentation only; not implemented
**Date:** 2026-09-08

## Goal

Complete the two narrow Foundation/application seams required before the Project/Master runtime vertical slice can begin:

1. Expand `createProject()` so one command can construct a `Project` containing the full canonical `ProjectMaster` supplied by a pre-create input.
2. Add UI-neutral workflow interpretation for the existing `updateProjectMaster()` result so Blocking validation is distinguished from Advisory-only or no-issue completion.

Task 1.9 prepares existing application boundaries for a later Task 2.1 runtime migration. It does not migrate React or runtime state.

## Context and Reason Task 1.9 Exists

V2 Foundation through Task 1.8 establishes `Project` as the canonical aggregate:

```text
Project {
  id
  master
  identityAliases
  schedule
  team
}
```

Task 2.0 found that the legacy React runtime cannot safely move to this aggregate through a read-only Dashboard swap because the legacy Project collection is also the Create/Edit write target. External review therefore selected a Project/Master vertical slice for Task 2.1.

Repository inspection for the Task 2.1 design then found two blockers:

- The existing `CreateProjectInput` carries only `projectId`, Year, Product Line, STN Project Name, optional Customer and Status, and QCI PM. `createProject()` fills every other Master leaf with its canonical empty representation, so it cannot persist a full caller-supplied canonical Master in one command.
- `updateProjectMaster()` returns an `UpdateProjectMasterResult` containing the updated candidate `Project` and `ValidationIssue[]`, but `workflowInterpretation.ts` does not yet classify that result as completed or blocked.

Task 1.9 removes only these blockers. The externally approved Task 2.1 design is to be re-materialized after this boundary is implemented, reviewed, and checkpointed.

## Scope

Task 1.9 has exactly two Foundation goals:

- Create boundary: replace the narrow canonical Create input with one complete Master-shaped pre-create input path while preserving existing Create business and result semantics.
- Edit boundary: interpret the existing Master update result through the established `ActionDisposition` pattern without rerunning validation or introducing a decision request.

This is an application-boundary change. It does not change the canonical Project schema, reducer architecture, identity rules, Schedule rules, Team rules, or any React/runtime behavior.

## Current Foundation Gap

The existing repository boundaries are:

- `ProjectMaster` defines the canonical Master structure and nullable leaf types.
- `Project` owns `id`, `master`, `identityAliases`, per-Project `schedule`, and current `team`.
- `CreateProjectInput` is a narrow input rather than a complete Master-shaped input.
- `CreateProjectContext` supplies `existingProjects`, `CreateProjectDefaults`, and the optional `allowBusinessIdentityDuplicate` flag.
- `CreateProjectResult` is the established `created | reviewRequired | rejected` result union.
- `updateProjectMaster()` owns Master replacement, completeness validation, immutable Project ID preservation, and STN/QCI identity-alias capture.
- `ValidationIssue.severity` is `blocking | advisory`, with `isBlocking()` and `countBlocking()` available as established severity helpers.
- `ActionDisposition` represents `completed`, `blocked`, and `rejected` workflow outcomes.
- `WorkflowDecisionRequest` currently covers duplicate Project review, Working Draft replacement, and unsaved navigation. Edit validation is not a decision request.
- `PrototypeState` owns only `projects`, and `prototypeReducer` remains generic through `projectAdded` and `projectReplaced`.
- `canonicalProjectFixtures` is the five-Project canonical V2 regression dataset.

The gaps are input capability and workflow interpretation, not missing domain ownership.

## Create Project Application Boundary

### Single canonical input path

Task 1.9 introduces `CreateProjectMasterInput` as a new application-boundary type. This is a Task 1.9 API addition; it does not exist in the current repository.

`CreateProjectInput` converges on one Master input path, conceptually:

```text
CreateProjectInput {
  projectId
  master: CreateProjectMasterInput
  qciPm
}

CreateProjectContext {
  existingProjects
  defaults
  allowBusinessIdentityDuplicate?
}
```

The property name remains `projectId`, matching the current command convention. The duplicate override remains in `CreateProjectContext`, matching the existing `confirmCreateProjectAnyway()` flow. The narrow top-level `year`, `productLineId`, `stnProjectName`, `customerId`, and `statusId` input path is retired rather than retained beside `master`.

All existing Foundation callers and tests migrate to this single full-Master input during Task 1.9 implementation. There must be no overload, compatibility object, or parallel canonical Create API that permits both narrow and Master-shaped input truths.

### Command responsibility

`createProject()` continues to own:

- application of approved Create defaults;
- validation of the three required Create fields;
- duplicate `ProjectId` rejection;
- duplicate business identity detection and `matchingProjectIds`;
- `allowBusinessIdentityDuplicate` handling;
- construction of the whole `Project`, including initial Master, empty Schedule, initial Team, and empty aliases.

Callers supply candidate data. They do not construct a canonical `Project`, apply business defaults, normalize identity, or write aliases themselves.

## CreateProjectMasterInput Semantics

`CreateProjectMasterInput` is pre-create application input, not persisted canonical state. It must not be defined as `Partial<ProjectMaster>` and must not be shaped around the fields visible in any current React dialog.

Its structure mirrors the complete existing `ProjectMaster` domain structure:

- `basicInformation`: `status`, `year`, `customer`, `category`, `productLine`, `panelSize`, `stnProjectName`, `qciModelName`
- `platformHardware`: `cpu`, `gpu`, `pcbNumber`, `housingNumber`
- `leverage`: `pcbLeverage`, `aLeverage`, `bLeverage`, `cLeverage`, `dLeverage`
- `cover`: `aCover`, `bCover`, `cCover`, `dCover`
- `modelRegulatory`: `acerModelName`, `acerMarketingName`, `ssid`, `rmn`
- `mechanical.product`: `productLengthMm`, `productWidthMm`, `productHeightMm`, `productWeightG`
- `mechanical.package`: `packageLengthMm`, `packageWidthMm`, `packageHeightMm`, `grossWeightG`
- `other`: `remark`

These are the eight approved logical Master sections, with Product and Package nested under `mechanical` exactly as the domain model defines them. Task 1.9 does not add, rename, flatten, or relocate fields.

The input uses the existing domain value types: catalog-backed values use `CatalogItemId | null`, leverage references use `ProjectId | null`, numeric values use `number | null`, and textual values use `string | null`. Customer and Status have create-time omission semantics so the command can apply the approved defaults; their supplied non-null valid values are preserved. The implementation must express that exception explicitly in the named input type rather than weakening the entire shape with `Partial<ProjectMaster>`.

Every other canonical leaf remains represented according to existing `ProjectMaster` semantics. `null` is the established canonical empty representation for these leaves. Task 1.9 must not substitute empty strings, display hyphens, first-catalog-item choices, or arbitrary placeholders.

The data flow is:

```text
CreateProjectMasterInput
        +
ProjectId / QCI PM / Create context
        ↓
createProject()
  defaults + existing validation + canonical construction
        ↓
CreateProjectResult
```

## Create Defaults and Canonicalization

Customer `Acer` and Status `RFQ` remain application/business defaults applied by `createProject()` through the existing `CreateProjectDefaults` boundary. React or any future caller must not reproduce these defaults through fallback expressions or duplicated option logic.

Default behavior is:

- omitted create-time Customer resolves to the configured Acer catalog ID;
- omitted create-time Status resolves to the configured RFQ catalog ID;
- an explicitly supplied valid Customer is preserved;
- an explicitly supplied valid Status is preserved.

The existing Team template remains part of `CreateProjectDefaults`. This design does not relocate or redesign that dependency.

Canonical construction reuses the current domain representations. Nullable Master leaves remain nullable; Schedule starts with no Published versions and no Working Draft; aliases start empty; and initial Team construction continues through the existing Team-template semantics. Task 1.9 introduces no new Master default.

If implementation planning or execution finds a required canonical Master leaf for which the repository supplies neither valid input nor an established empty/default representation, work must stop for external review. No new business default may be inferred.

## Create Validation and Duplicate Semantics

### Required fields and completeness

The richer input does not make Create stricter. Blocking required fields remain exactly:

- Year (`master.basicInformation.year`)
- Product Line (`master.basicInformation.productLine`)
- STN Project Name (`master.basicInformation.stnProjectName`)

No other Master field becomes Create-blocking. Task 1.9 does not establish a default completeness-field list and does not require Panel Size, CPU, GPU, or completion of all eight Master sections. Existing Foundation validation remains otherwise unchanged.

### Identity and duplication

Business identity remains:

```text
Year + Product Line + STN Project Name
```

Existing normalization remains authoritative. Task 1.9 neither adds normalization nor moves it into callers.

- Duplicate `ProjectId` remains rejected.
- Duplicate business identity remains review-required, not rejected and not merged.
- Every match remains available through `matchingProjectIds`.
- `allowBusinessIdentityDuplicate` retains its existing explicit override semantics.

### Create Anyway

Create Anyway remains a second `createProject()` invocation through the existing Task 1.8 interpretation helper. The second call uses `allowBusinessIdentityDuplicate: true` in the Create context and reuses:

- the same candidate `ProjectId`;
- the same `CreateProjectMasterInput` object/candidate values;
- the same QCI PM;
- the same intended Create context apart from the duplicate override.

The first review-required candidate is not accepted directly, and no new `ProjectId` is generated.

## QCI PM and Team Boundary

QCI PM remains `ProjectRoleAssignment | null` on `CreateProjectInput`, outside `CreateProjectMasterInput`. It belongs to `ProjectTeam`, not `ProjectMaster`.

`createProject()` continues to construct the initial Project aggregate in one command, applying QCI PM to `team.projectRoles.qciPm` and using the configured Team template for initial function state. This preserves existing aggregate construction without performing Team runtime migration or redesigning Team.

Task 1.9 must not add QCI PM, QCI PjM, Acer PM, Team functions, or Team template metadata to the Master input.

## Create Output Compatibility

Task 1.9 changes Create input capability only. `CreateProjectResult` remains the current union:

- `created`: exposes the created `Project` and issues;
- `reviewRequired`: exposes the candidate, all `matchingProjectIds`, and issues;
- `rejected`: reports missing required fields or duplicate `ProjectId` according to current semantics.

The existing Task 1.8 `interpretCreateProjectResult()` behavior remains unchanged: created maps to completed, required-field and duplicate-ID rejection map to rejected, and duplicate business identity maps to the existing duplicate Project decision request.

`confirmCreateProjectAnyway()` remains the second-command path. Its callers migrate to the richer input, but its workflow contract and action orientation remain intact.

## Edit Master Workflow Interpretation

### Existing command remains authoritative

`updateProjectMaster()` remains the sole Edit Master mutation and validation command. Its current responsibilities remain intact:

- accept a complete `ProjectMaster` candidate;
- preserve the immutable `ProjectId` and unrelated Schedule/Team state;
- replace current Master in the returned Project candidate;
- capture previous STN Project Name and QCI Model Name aliases under existing normalization rules;
- run the configured Master completeness validation once;
- return `UpdateProjectMasterResult` with `project` and `issues`.

Task 1.9 does not move validation or alias management into workflow interpretation. No command redesign is intended; only a minimal type exposure adjustment is permitted if strictly necessary for the interpreter to consume the existing result.

### New UI-neutral interpretation boundary

Task 1.9 adds an exported Edit Master interpreter and its result type at the existing workflow interpretation boundary. These are Task 1.9 API additions and do not exist today. Their eventual names must follow the established naming pattern in `workflowInterpretation.ts`; this design does not assign speculative API names.

Conceptually:

```text
updateProjectMaster(project, input)
        ↓
UpdateProjectMasterResult { project, issues }
        ↓
Edit Master workflow interpreter
        ↓
ActionDisposition<"completed" | "blocked", UpdateProjectMasterResult>
        ↓
future UI/runtime
        ↓
projectReplaced only when completed
```

The interpreter consumes the existing command result. It does not invoke `updateProjectMaster()`, rerun validation, modify the candidate, dispatch an action, or choose navigation.

### Interpreter responsibility

The Edit Master interpreter may inspect the issues already present on `UpdateProjectMasterResult`, classify the disposition, and preserve the unchanged result as feedback/review context. It must not:

- rerun or invent validation;
- modify the returned Project;
- normalize identity or alter `identityAliases`;
- downgrade Blocking issues or promote Advisory issues;
- dispatch `projectReplaced` or any other reducer action;
- choose React navigation or modal layout;
- create invalid-data override semantics.

## Blocking, Advisory, and Completed Semantics

The interpreter classifies the existing `ValidationIssue[]` using the repository's severity semantics.

### Blocking issues

If at least one issue has severity `blocking`:

- disposition is `blocked`;
- the original issues are preserved;
- the candidate Project/result may be preserved as review context;
- the candidate is not eligible for `projectReplaced` or other canonical completion.

The future UI may keep an editor open, show the returned issues, let the user revise the candidate, and invoke Save again. Those React behaviors are outside Task 1.9.

### Advisory-only issues

If issues exist but all have severity `advisory`:

- disposition is `completed`;
- the original advisory issues remain available as non-blocking feedback;
- the returned Project is eligible for future `projectReplaced` dispatch.

Advisories are not promoted to Blocking for Edit.

### No issues

If the issue collection is empty:

- disposition is `completed`;
- the returned Project is eligible for future `projectReplaced` dispatch.

### Rejected is not invented

The current `updateProjectMaster()` result has no semantic case where command execution itself is rejected. Task 1.9 therefore does not invent an Edit rejection result merely to mirror Create. A rejected disposition would require a real future command/application failure mode and separate review.

## No-Decision-Request Rationale

Blocking Edit validation is not a business decision. The user cannot override Blocking validation through this boundary; they correct data and invoke Save again.

Accordingly, Task 1.9 adds no `WorkflowDecisionRequest` variant and no actions such as override, confirm invalid data, fix data, or cancel. Cancel and navigation remain transient future UI concerns, not Foundation workflow decisions.

This preserves the distinction between:

- a workflow branch requiring an explicit approved choice, such as duplicate Create; and
- an ineligible candidate requiring correction, such as a blocked Edit.

## Architecture and Data Flow

The completed boundaries preserve the approved layering:

```text
Create candidate
  ↓
createProject()
  ↓
existing CreateProjectResult
  ↓
existing Create workflow interpretation
  ↓
future UI/runtime
  ↓
generic reducer

Edit Master candidate
  ↓
updateProjectMaster()
  ↓
UpdateProjectMasterResult
  ↓
new Edit Master workflow interpretation
  ↓
future UI/runtime
  ↓
generic reducer only for completed disposition
```

Business validation and canonical aggregate construction stay in commands. Workflow interpretation translates command results into UI-neutral action eligibility. Runtime code will later render feedback and dispatch generic whole-Project actions.

## Preserved Foundation Invariants

Task 1.9 preserves all established Foundation boundaries:

- `Project` remains the canonical aggregate and Single Source of Truth.
- `ProjectId` remains immutable primary identity; names remain non-ID business values.
- Master and Team remain current saved state and are not versioned.
- Schedule remains per Project; Published versions remain immutable and append-only.
- A Working Draft may be invalid and cannot contribute official Portfolio values.
- QCI PM remains in Team, not Master.
- Existing identity normalization and `identityAliases` behavior remain Foundation-owned.
- Create and update commands produce whole updated Project aggregates.
- `PrototypeState` continues to own only its approved `projects` collection.
- `prototypeReducer` remains generic with `projectAdded` and `projectReplaced`.
- The interpreter never dispatches reducer actions.
- No app-global Schedule, app-global Team, Dashboard business database, warning database, selected version, filters, or unsaved editor state is added to Project or `PrototypeState`.

## Testing Strategy

Task 1.9 implementation follows test-driven development where practical: update or add focused failing tests for the new boundary before changing production behavior, then retain all existing regressions.

### Create command coverage

Focused command tests must verify:

- `createProject()` accepts the complete `CreateProjectMasterInput`.
- Caller-provided canonical values survive into the created Project.
- Every supported Master section is preserved or constructed using existing domain semantics.
- omitted Customer defaults to Acer under the approved Create semantics;
- omitted Status defaults to RFQ under the approved Create semantics;
- explicit valid Customer and Status values are preserved;
- Year, Product Line, and STN Project Name remain required;
- no new blocking completeness rule is introduced;
- duplicate `ProjectId` remains rejected;
- duplicate business identity remains review-required;
- `matchingProjectIds` remains intact, including multiple matches;
- `allowBusinessIdentityDuplicate` remains intact;
- Create Anyway remains compatible with a second command call using the same `ProjectId` and Master candidate;
- QCI PM remains in initial Team semantics and outside Master;
- old narrow canonical callers/tests migrate to the single Master-shaped boundary;
- no dual canonical Create API remains.

### Edit workflow interpretation coverage

Focused workflow tests must verify:

- Blocking issues produce `blocked`;
- Blocking issues and useful candidate/result context are preserved;
- a blocked result is not interpreted as canonical completion;
- Advisory-only issues produce `completed`;
- Advisory issues and the updated Project are preserved;
- no issues produce `completed` with the updated Project;
- the interpreter creates no `WorkflowDecisionRequest`;
- the interpreter does not mutate the Project or rerun validation;
- existing Create interpretation remains unchanged;
- existing Schedule and Team interpretations remain unchanged.

The current Master completeness validator emits Advisory issues for configured missing fields, while the shared `ValidationIssue` model also supports Blocking severity. Interpreter tests cover the full established severity contract without changing current completeness policy.

### Regression verification

Future implementation verification includes:

- focused Task 1.9 tests;
- Task 1.7 regression;
- Task 1.8 regression;
- canonical V2 fixture tests;
- the full test suite;
- the production build.

Exact commands are to be taken from repository scripts during implementation planning; this design does not guess command names.

## Success Criteria

1. `createProject()` can create the full canonical Master in one command.
2. A named full Master-shaped Create input boundary exists.
3. The Create boundary does not use `Partial<ProjectMaster>`.
4. No parallel narrow canonical Create API remains.
5. QCI PM remains outside `ProjectMaster`.
6. QCI PM Create behavior remains supported through the Project aggregate command.
7. Customer=Acer remains an application-owned Create default.
8. Status=RFQ remains an application-owned Create default.
9. Explicit valid caller values are preserved under existing semantics.
10. Existing canonical empty/default semantics are reused.
11. No new Master business defaults are invented.
12. Required Create fields remain Year, Product Line, and STN Project Name.
13. No new Master completeness blocking policy is introduced.
14. Duplicate `ProjectId` semantics remain unchanged.
15. Duplicate business identity semantics remain unchanged.
16. Create Anyway remains a second `createProject()` call.
17. Create Anyway can reuse the same `ProjectId` and Master candidate.
18. `CreateProjectResult` semantics remain unchanged.
19. Existing Task 1.8 Create interpretation remains intact.
20. Edit Master has a UI-neutral workflow interpretation boundary.
21. Blocking Edit validation maps to blocked.
22. A Blocking candidate/result cannot be treated as canonical completion.
23. Advisory-only Edit maps to completed.
24. No-issue Edit maps to completed.
25. Edit interpretation preserves useful validation/result context.
26. Edit interpretation does not rerun validation.
27. No Edit blocking override flow is added.
28. No new Edit `WorkflowDecisionRequest` is added.
29. `ProjectId` and identity rules remain unchanged.
30. `identityAliases` remains Foundation-owned.
31. Reducer architecture remains unchanged.
32. No React/runtime migration occurs.
33. No Schedule migration occurs.
34. No Team migration occurs.
35. Focused tests pass.
36. Task 1.7 regression passes.
37. Task 1.8 regression passes.
38. V2 fixture regression passes.
39. The full suite passes.
40. The production build passes.

## Explicit Non-Goals

Task 1.9 does not include:

- Task 2.1 runtime migration;
- React Create dialog implementation;
- React Edit dialog implementation;
- Dashboard canonical migration;
- a Dashboard projector;
- `DashboardProjectRow`;
- `selectedProjectId` runtime wiring;
- Workspace migration;
- Schedule migration;
- Team migration;
- Schedule gating UI;
- Team gating UI;
- Needs Attention migration;
- Dashboard export migration;
- a full eight-section Master UI;
- Master completeness UI;
- a new Master completeness policy;
- new identity normalization;
- Project schema redesign;
- reducer redesign;
- Provider, store, repository, service, or adapter-framework architecture;
- backend work;
- persistence or API work;
- authentication or login;
- legacy mass cleanup.

## Follow-on Task 2.1 Boundary

Task 1.9 exists specifically to remove the two Foundation blockers discovered while inspecting the approved Task 2.1 design.

After Task 1.9 is implemented, externally reviewed, and checkpointed:

- the Task 2.1 design spec is re-materialized against the completed Foundation boundary;
- Task 2.1 uses the full-Master `createProject()` input and the Edit Master workflow interpreter;
- Task 2.1 does not recreate defaulting, validation, duplicate, identity, alias, or action-disposition semantics in React.

No Task 2.2 or later implementation detail is defined by this design.
