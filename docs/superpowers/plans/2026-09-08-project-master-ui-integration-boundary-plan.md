# Task 1.9 — Project/Master UI Integration Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Foundation application boundary so one `createProject()` command accepts a full canonical Master-shaped candidate and the existing `updateProjectMaster()` result has UI-neutral completed/blocked interpretation.

**Architecture:** Keep aggregate construction and business semantics in the existing Project command module, replacing the narrow Create input with one named full-Master input whose only omission/default exceptions are nullable Customer and Status. Add a pure workflow interpreter beside the existing Create, Schedule, and Team interpreters; it classifies the issues already returned by `updateProjectMaster()` and preserves the original result without rerunning validation or dispatching state.

**Tech Stack:** TypeScript, Vitest, Vite, npm, immutable domain objects, generic `ActionDisposition` workflow results.

**Spec:** `docs/superpowers/specs/2026-09-08-project-master-ui-integration-boundary-design.md`

## Global Constraints

- `Project` remains the canonical aggregate and Single Source of Truth.
- `ProjectId` remains immutable primary identity.
- QCI PM remains Team-owned, not Master-owned.
- Do not redesign the Project schema.
- Do not redesign `prototypeReducer`; it remains `projectAdded` / `projectReplaced`.
- Do not perform React or runtime migration.
- Do not implement Task 2.1.
- Do not migrate Schedule.
- Do not migrate Team.
- Do not introduce a Master completeness policy.
- Do not change identity normalization.
- Do not invent business defaults.
- Customer=Acer and Status=RFQ remain application-owned Create defaults applied by `createProject()` through `CreateProjectDefaults`.
- Create required fields remain Year, Product Line, and STN Project Name.
- Duplicate `ProjectId` semantics remain unchanged.
- Duplicate business identity remains `reviewRequired`.
- Create Anyway remains a second `createProject()` call.
- Create Anyway reuses the same `ProjectId` and the same Master candidate.
- `CreateProjectResult` semantics remain unchanged.
- Existing Create workflow interpretation remains unchanged.
- Blocking Edit cannot be overridden.
- Advisory-only Edit remains completable.
- Do not add an Edit `WorkflowDecisionRequest`.
- Do not introduce Provider, store, repository, service, or adapter architecture.
- Do not perform unrelated refactoring or legacy cleanup.
- Do not automatically commit during implementation; stop for external review first.
- Never push.

---

## File Map

### Production files to modify

- `src/application/commands/projectCommands.ts`
  - Add the Task 1.9 `CreateProjectMasterInput` application type.
  - Replace the narrow fields on `CreateProjectInput` with `master`.
  - Update `missingCreateFields()`, `createInitialProjectMaster()`, and `matchesBusinessIdentity()` to read the new shape.
  - Preserve `CreateProjectDefaults`, `CreateProjectContext`, `CreateProjectResult`, `createInitialProjectTeam()`, `createProject()`, and `updateProjectMaster()` semantics.
- `src/application/workflow/workflowInterpretation.ts`
  - Add the conventional `UpdateProjectMasterDisposition` type and `interpretUpdateProjectMasterResult()` function.
  - Import `UpdateProjectMasterResult` as a type and use the existing `countBlocking()` severity helper.
  - Leave `WorkflowDecisionRequest` and every existing Create/Schedule/Team interpreter behavior unchanged.

### Test files to modify

- `src/application/commands/projectCommands.spec.ts`
  - Convert its Create input fixture and all Create command cases to the single Master-shaped API.
  - Add RED coverage for full canonical Master preservation and the exact final input type.
  - Retain required-field, default, duplicate, identity-normalization, Team-template, Schedule, alias, and Master-update regression coverage.
- `src/application/commands/projectCommandIntegration.spec.ts`
  - Convert the one direct `createProject()` caller to the full Master-shaped input.
  - Keep whole-Project reducer and official-source assertions unchanged.
- `src/application/workflow/workflowInterpretation.spec.ts`
  - Convert its shared `CreateProjectInput`, duplicate candidate, and all direct Create calls to the full Master-shaped input.
  - Strengthen Create Anyway regression coverage for the same `ProjectId` and same Master candidate.
  - Add RED/GREEN coverage for Blocking, Advisory-only, and no-issue Master-update interpretation.

### Files explicitly not modified

- No new production file is needed; the existing command and workflow modules are the approved boundaries.
- No new test file is needed; the existing focused specs already own these behaviors.
- Domain Project/Master, validation, identity, Team, Schedule, fixture, reducer, React, and legacy runtime files remain unchanged.
- The authoritative design spec remains unchanged.

## Planned Final TypeScript APIs

### Create boundary

Add the following shape in `src/application/commands/projectCommands.ts`. It mirrors every canonical `ProjectMaster` section while making only Customer and Status nullable and omittable so `createProject()` can apply its existing injected defaults:

```ts
export interface CreateProjectMasterInput {
	readonly basicInformation: Omit<
		ProjectMaster["basicInformation"],
		"customer" | "status"
	> & {
		readonly customer?: CatalogItemId | null;
		readonly status?: CatalogItemId | null;
	};
	readonly platformHardware: ProjectMaster["platformHardware"];
	readonly leverage: ProjectMaster["leverage"];
	readonly cover: ProjectMaster["cover"];
	readonly modelRegulatory: ProjectMaster["modelRegulatory"];
	readonly mechanical: ProjectMaster["mechanical"];
	readonly other: ProjectMaster["other"];
}

export interface CreateProjectInput {
	readonly projectId: ProjectId;
	readonly master: CreateProjectMasterInput;
	readonly qciPm: ProjectRoleAssignment | null;
}
```

Do not keep an overload or any top-level `year`, `productLineId`, `stnProjectName`, `customerId`, or `statusId` compatibility fields. Do not use `Partial<ProjectMaster>`.

For Customer and Status, `undefined` or property omission invokes the existing Acer/RFQ Create defaults. Canonical `null` is also accepted by the pre-create input and follows the command's existing nullish missing/default behavior. An explicit non-null valid catalog ID is preserved. No other Master property becomes optional, and this adds no business default.

Keep these public signatures unchanged apart from their consumption of the revised `CreateProjectInput`:

```ts
export function createProject(
	input: CreateProjectInput,
	context: CreateProjectContext,
): CreateProjectResult;

export function confirmCreateProjectAnyway(
	input: CreateProjectInput,
	context: CreateProjectContext,
): CreateProjectInterpretation;
```

Apply these exact private helper signatures:

```ts
function missingCreateFields(
	input: CreateProjectInput,
): CreateProjectRequiredField[];

function createInitialProjectMaster(
	input: CreateProjectMasterInput,
	defaults: CreateProjectDefaults,
): ProjectMaster;

function matchesBusinessIdentity(
	project: Project,
	input: CreateProjectInput,
): boolean;
```

`CreateProjectContext.allowBusinessIdentityDuplicate` stays in the context. `CreateProjectRequiredField`, `CreateProjectDefaults`, `CreateProjectContext`, and `CreateProjectResult` retain their current public shapes.

### Edit workflow boundary

Repository conventions use `<CommandName>Disposition` and `interpret<CommandName>Result()`. Add exactly:

```ts
export type UpdateProjectMasterDisposition = ActionDisposition<
	"completed" | "blocked",
	UpdateProjectMasterResult
>;

export function interpretUpdateProjectMasterResult(
	result: UpdateProjectMasterResult,
): UpdateProjectMasterDisposition;
```

The implementation returns `{ kind: "blocked", result }` when `countBlocking(result.issues) > 0`; otherwise it returns `{ kind: "completed", result }`. It adds neither `rejected` nor a `WorkflowDecisionRequest` branch.

## Exhaustive Create Caller Migration Checklist

Repository-wide searches for `createProject(`, `confirmCreateProjectAnyway(`, and `CreateProjectInput` found the following source callers and typed fixtures. Documentation references are not runtime callers.

### `src/application/commands/projectCommands.ts`

- `createProject()` is the declaration being changed.
- `missingCreateFields()` currently reads `input.year`, `input.productLineId`, and `input.stnProjectName`; it will read `input.master.basicInformation.year`, `.productLine`, and `.stnProjectName`.
- `createInitialProjectMaster()` currently consumes the narrow input and fills all other Master fields with `null`; it will consume `CreateProjectMasterInput`, preserve every supplied section, and default only Customer/Status.
- `matchesBusinessIdentity()` currently reads the three narrow identity fields; it will read the same values from `input.master.basicInformation` without changing normalization.

### `src/application/workflow/workflowInterpretation.ts`

- `confirmCreateProjectAnyway()` is the only production caller of `createProject()`.
- It currently forwards `input` unchanged and copies `context` with `allowBusinessIdentityDuplicate: true`.
- It requires no Create-flow logic change: the revised `CreateProjectInput` type flows through unchanged, preserving the same `projectId`, `master`, `qciPm`, and intended context for the second command call.

### `src/application/commands/projectCommands.spec.ts`

- `validInput()` currently builds the narrow typed input; replace it with a complete Master-shaped input fixture.
- `rejects each missing Create-required field without inventing Master completeness`: move Year, Product Line, and STN Project Name overrides under `master.basicInformation`; behavior remains regression-equivalent.
- `uses injected Acer/RFQ defaults and keeps QCI PM in Team`: omit Customer/Status from `master.basicInformation`; preserve Team-template, Schedule, and alias assertions.
- `allows explicit Customer and Status selections to override Create defaults`: supply both IDs under `master.basicInformation`; behavior remains regression-equivalent.
- `rejects duplicate ProjectId independently of business names`: keep `projectId` top-level and move the STN name override under Master; behavior remains regression-equivalent.
- `returns a reviewable Advisory for the Project 002/003 business duplicate key`: move all three business-identity values under Master; preserve result and `matchingProjectIds` assertions.
- `supports an explicit Create Anyway path without merging Projects`: move business identity under Master; preserve explicit context override and result assertions.
- `keeps underscore, dash, and punctuation significant for duplicate matching`: move Year, Product Line, and STN Project Name under Master; preserve normalization behavior.
- Add `creates every canonical Master section from the full pre-create input`: new behavior, proving values formerly replaced by `null` now survive.
- Add `exposes only the single Master-shaped Create input contract`: new type contract, proving the narrow canonical input is gone.

### `src/application/commands/projectCommandIntegration.spec.ts`

- `adds a command-created Project and derives Master without a Dashboard dataset` is the only direct caller.
- Replace its narrow Year/Product Line/STN fields with a complete `master` candidate derived from an existing canonical fixture and override those three values under `basicInformation`.
- Reducer dispatch and official Portfolio source behavior do not change.

### `src/application/workflow/workflowInterpretation.spec.ts`

- Shared `createInput`: replace narrow fields with a complete Master-shaped candidate.
- `interprets created as completed`: input shape changes only; result interpretation remains a regression assertion.
- `interprets missing required fields as rejected`: set `master.basicInformation.year` to `null` rather than setting top-level `year`.
- `interprets duplicate ProjectId as rejected`: `projectId` remains top-level; behavior is unchanged.
- `interprets duplicate business identity as an explicit decision`: put Year/Product Line/STN name in `master.basicInformation`; preserve the duplicate decision assertions.
- Shared `duplicateInput`: override business identity under `master.basicInformation`.
- `preserves matching IDs and exposes the approved semantic action directions`: input shape changes only; behavior is unchanged.
- `performs Create Anyway as a second command call with explicit override`: retain the direct first `createProject()` call and `confirmCreateProjectAnyway()` call; add assertions that both candidates retain the same `projectId` and full Master values.

### Legacy React/runtime

- `src/main.tsx` and the legacy Project helpers do not import or call `createProject()`, `confirmCreateProjectAnyway()`, or `CreateProjectInput`.
- They remain untouched because Task 1.9 is Foundation-only; their later migration is Task 2.1 work.

## Slice 1: Full-Master Create Boundary and Compile-Safe Caller Migration

Changing `CreateProjectInput` and leaving caller migration for a later external-review slice would knowingly break existing tests and the TypeScript build. Therefore the command change and all current caller/test migrations form one atomic, independently reviewable slice.

**Files:**

- Modify: `src/application/commands/projectCommands.ts`
- Modify: `src/application/commands/projectCommands.spec.ts`
- Modify: `src/application/commands/projectCommandIntegration.spec.ts`
- Modify: `src/application/workflow/workflowInterpretation.spec.ts`
- Verify unchanged: `src/application/workflow/workflowInterpretation.ts` Create functions

**Interfaces:**

- Consumes: existing `ProjectMaster`, `Project`, `CatalogItemId`, `ProjectId`, `ProjectRoleAssignment`, `CreateProjectDefaults`, Team-template construction, and identity matching.
- Produces: the exact `CreateProjectMasterInput` and revised `CreateProjectInput` shown above.
- Preserves: `CreateProjectResult`, `CreateProjectContext.allowBusinessIdentityDuplicate`, `interpretCreateProjectResult()`, and the second-call `confirmCreateProjectAnyway()` contract.

- [ ] **Step 1: Write RED tests for the full-Master Create contract**

In `src/application/commands/projectCommands.spec.ts`, import `expectTypeOf`, `CreateProjectMasterInput`, `ProjectId`, the existing reference fixtures needed for canonical IDs, and `coverCatalog`. Define a full candidate with concrete values in every section:

```ts
const fullMasterInput: CreateProjectMasterInput = {
	basicInformation: {
		status: statusCatalog[2]!.id,
		year: 2029,
		customer: customerReferenceFixtures[1]!.id,
		category: categoryReferenceFixtures[0]!.id,
		productLine: productLineAlphaId,
		panelSize: panelSizeReferenceFixtures[0]!.id,
		stnProjectName: "DEV Full Master Create",
		qciModelName: "DEV-QCI-FULL-CREATE",
	},
	platformHardware: {
		cpu: cpuReferenceFixtures[0]!.id,
		gpu: gpuReferenceFixtures[1]!.id,
		pcbNumber: "DEV-PCB-FULL-CREATE",
		housingNumber: "DEV-HOUSING-FULL-CREATE",
	},
	leverage: {
		pcbLeverage: devProject002.id,
		aLeverage: devProject003.id,
		bLeverage: null,
		cLeverage: null,
		dLeverage: null,
	},
	cover: {
		aCover: coverCatalog[0]!.id,
		bCover: coverCatalog[1]!.id,
		cCover: coverCatalog[2]!.id,
		dCover: coverCatalog[3]!.id,
	},
	modelRegulatory: {
		acerModelName: "DEV Acer Full Model",
		acerMarketingName: "DEV Acer Full Marketing",
		ssid: "DEV-SSID-FULL",
		rmn: "DEV-RMN-FULL",
	},
	mechanical: {
		product: {
			productLengthMm: 320.5,
			productWidthMm: 220.25,
			productHeightMm: 18.75,
			productWeightG: 1500,
		},
		package: {
			packageLengthMm: 450,
			packageWidthMm: 330,
			packageHeightMm: 90,
			grossWeightG: 2800,
		},
	},
	other: { remark: "DEV full Master Create candidate" },
};

function validInput(
	overrides: Partial<CreateProjectInput> = {},
): CreateProjectInput {
	return {
		projectId: toProjectId("create-project-unique-id"),
		master: fullMasterInput,
		qciPm,
		...overrides,
	};
}
```

Add these exact tests:

```ts
it("creates every canonical Master section from the full pre-create input", () => {
	const result = createProject(
		{
			projectId: toProjectId("create-project-full-master"),
			master: fullMasterInput,
			qciPm,
		},
		context,
	);

	expect(result.status).toBe("created");
	if (result.status !== "created") return;
	expect(result.project.master).toEqual(fullMasterInput);
});

it("exposes only the single Master-shaped Create input contract", () => {
	expectTypeOf<CreateProjectInput>().toEqualTypeOf<{
		readonly projectId: ProjectId;
		readonly master: CreateProjectMasterInput;
		readonly qciPm: ProjectRoleAssignment | null;
	}>();
});
```

Update the existing command tests to place Create data under `master.basicInformation`. Preserve their current expected result statuses and issues. For the default test, omit Customer and Status with destructuring so the command—not the test fixture—supplies Acer/RFQ:

```ts
const {
	customer: ignoredCustomer,
	status: ignoredStatus,
	...basicWithoutCreateDefaults
} = fullMasterInput.basicInformation;
void ignoredCustomer;
void ignoredStatus;

const masterWithoutCreateDefaults: CreateProjectMasterInput = {
	...fullMasterInput,
	basicInformation: basicWithoutCreateDefaults,
};

const masterWithNullCreateDefaults: CreateProjectMasterInput = {
	...fullMasterInput,
	basicInformation: {
		...fullMasterInput.basicInformation,
		customer: null,
		status: null,
	},
};
```

Exercise both default inputs by converting the existing default test to:

```ts
it.each([
	["omitted", masterWithoutCreateDefaults],
	["canonical null", masterWithNullCreateDefaults],
] as const)(
	"uses injected Acer/RFQ defaults for %s Customer/Status and keeps QCI PM in Team",
	(_inputKind, master) => {
		const result = createProject(validInput({ master }), context);

		expect(result.status).toBe("created");
		if (result.status !== "created") return;
		expect(result.project.master.basicInformation.customer).toBe(
			acerCustomerId,
		);
		expect(result.project.master.basicInformation.status).toBe(rfqStatusId);
		expect(result.project.team?.projectRoles).toEqual({
			qciPm,
			qciPjm: null,
			acerPm: null,
		});
	},
);
```

Retain the existing assertions for pending template functions, empty Schedule, and empty aliases inside that parameterized test. Retain an explicit-value test with non-default Customer and Status. Retain the exact missing-field result `['year', 'productLine', 'stnProjectName']`. The full candidate deliberately keeps `bLeverage`, `cLeverage`, and `dLeverage` as `null`; its full equality assertion proves canonical nullable leaves survive without placeholders or a completeness gate.

- [ ] **Step 2: Run the focused Create spec and verify RED**

Run:

```powershell
npm run test:run -- src/application/commands/projectCommands.spec.ts
```

Expected RED reason: the current command does not expose `CreateProjectMasterInput`, reads the removed narrow fields, and replaces caller-supplied Master sections with hardcoded null-filled sections. The full-Master equality assertion must fail against the old implementation; this is new behavior, not a regression-only test.

- [ ] **Step 3: Implement the minimal full-Master Create boundary**

In `src/application/commands/projectCommands.ts`:

1. Add the exact `CreateProjectMasterInput` and `CreateProjectInput` types from the API section.
2. Keep `CreateProjectRequiredField`, `CreateProjectDefaults`, `CreateProjectContext`, and `CreateProjectResult` unchanged.
3. Make `missingCreateFields()` read only:

```ts
const basic = input.master.basicInformation;

if (basic.year === null) missing.push("year");
if (basic.productLine === null) missing.push("productLine");
if (basic.stnProjectName?.trim().length === 0 || basic.stnProjectName === null) {
	missing.push("stnProjectName");
}
```

4. Replace the hardcoded null-filled Master construction with canonical value preservation and the two existing defaults:

```ts
function createInitialProjectMaster(
	input: CreateProjectMasterInput,
	defaults: CreateProjectDefaults,
): ProjectMaster {
	return {
		basicInformation: {
			...input.basicInformation,
			status: input.basicInformation.status ?? defaults.statusId,
			customer: input.basicInformation.customer ?? defaults.customerId,
		},
		platformHardware: { ...input.platformHardware },
		leverage: { ...input.leverage },
		cover: { ...input.cover },
		modelRegulatory: { ...input.modelRegulatory },
		mechanical: {
			product: { ...input.mechanical.product },
			package: { ...input.mechanical.package },
		},
		other: { ...input.other },
	};
}
```

5. Make `matchesBusinessIdentity()` compare existing Master values with `input.master.basicInformation.year`, `.productLine`, and `.stnProjectName`; continue calling `projectIdentityNamesMatch()` exactly once for the name comparison.
6. Change Project construction to `master: createInitialProjectMaster(input.master, context.defaults)`.
7. Do not add completeness validation, catalog fallbacks, aliases, Schedule values, Team roles, or result variants.

- [ ] **Step 4: Run the focused Create spec and verify GREEN**

Run:

```powershell
npm run test:run -- src/application/commands/projectCommands.spec.ts
```

Expected GREEN: every Create and existing Master-update test in the file passes. Record the exact test count from Vitest output.

- [ ] **Step 5: Demonstrate the remaining narrow callers before migrating them**

Run:

```powershell
npm run test:run -- src/application/commands/projectCommandIntegration.spec.ts src/application/workflow/workflowInterpretation.spec.ts
```

Expected RED reason: both specs still construct the retired narrow input, so the revised command receives no `master`. This is the expected API-migration failure within the same slice; do not stop at an external-review gate in this broken state.

- [ ] **Step 6: Migrate every remaining caller and preserve Create workflow semantics**

In `src/application/commands/projectCommandIntegration.spec.ts`, change the one Create input to:

```ts
{
	projectId: toProjectId("integration-created-project"),
	master: {
		...devProject001.master,
		basicInformation: {
			...devProject001.master.basicInformation,
			year: 2028,
			productLine: productLineReferenceFixtures[1]!.id,
			stnProjectName: "DEV Integration Project",
		},
	},
	qciPm: null,
}
```

Keep the reducer and official-source assertions unchanged.

In `src/application/workflow/workflowInterpretation.spec.ts`, revise the shared fixture to:

```ts
const createInput: CreateProjectInput = {
	projectId: toProjectId("workflow-new-project"),
	master: {
		...devProject001.master,
		basicInformation: {
			...devProject001.master.basicInformation,
			year: 2028,
			productLine: productLineReferenceFixtures[0]!.id,
			stnProjectName: "DEV Workflow Project",
		},
	},
	qciPm: null,
};
```

For required-field and duplicate-identity cases, replace top-level overrides with nested immutable spreads:

```ts
const missingYearInput: CreateProjectInput = {
	...createInput,
	master: {
		...createInput.master,
		basicInformation: {
			...createInput.master.basicInformation,
			year: null,
		},
	},
};
```

Apply the same explicit nesting for Product Line and STN Project Name in `duplicateInput`. Keep `projectId` and `qciPm` at the top level.

Strengthen `performs Create Anyway as a second command call with explicit override` with these regression assertions after narrowing the two results:

```ts
expect(firstResult.status).toBe("reviewRequired");
if (firstResult.status !== "reviewRequired") return;
expect(confirmedInterpretation.kind).toBe("completed");
if (confirmedInterpretation.kind !== "completed") return;
expect(confirmedInterpretation.result.status).toBe("created");
if (confirmedInterpretation.result.status !== "created") return;
expect(firstResult.candidate.id).toBe(duplicateInput.projectId);
expect(firstResult.candidate.master).toEqual(duplicateInput.master);
expect(confirmedInterpretation.result.project.id).toBe(duplicateInput.projectId);
expect(confirmedInterpretation.result.project.master).toEqual(
	duplicateInput.master,
);
expect(duplicateContext.allowBusinessIdentityDuplicate).toBeUndefined();
```

These are REGRESSION assertions for the existing second-command workflow. Do not change `confirmCreateProjectAnyway()` implementation, decision actions, `CreateProjectResult`, or `interpretCreateProjectResult()`.

- [ ] **Step 7: Run all migrated Create callers and verify GREEN**

Run:

```powershell
npm run test:run -- src/application/commands/projectCommands.spec.ts src/application/commands/projectCommandIntegration.spec.ts src/application/workflow/workflowInterpretation.spec.ts
```

Expected GREEN: all three files pass. Existing created/rejected/review-required interpretations and Create Anyway action directions remain unchanged. Record exact file and test counts.

- [ ] **Step 8: Prove caller completeness and remove no compatibility path**

Run these read-only searches:

```powershell
rg -n -S "createProject\(|confirmCreateProjectAnyway\(|CreateProjectInput" src
rg -n -S "input\.(year|productLineId|stnProjectName|customerId|statusId)" src\application
```

Expected: the first command lists only the known declaration/helper/test surface documented in the caller checklist. The second command returns no matches. Inspect `CreateProjectInput` directly and confirm it contains only `projectId`, `master`, and `qciPm`, with no overload or compatibility union.

- [ ] **Step 9: Run Slice 1 regression and build verification**

Run:

```powershell
npm run test:run -- src/application/commands/projectCommands.spec.ts src/application/commands/scheduleCommands.spec.ts src/application/commands/teamCommands.spec.ts src/application/commands/projectCommandIntegration.spec.ts src/domain/project/projectMasterValidation.spec.ts src/domain/schedule/scheduleValidation.spec.ts src/domain/team/teamValidation.spec.ts
npm run test:run -- src/application/workflow/workflowInterpretation.spec.ts
npm run test:run -- src/fixtures/v2/referenceFixtures.spec.ts src/fixtures/v2/canonicalProjectFixtures.spec.ts src/fixtures/v2/teamCandidateFixtures.spec.ts src/fixtures/v2/scheduleCandidateFixtures.spec.ts src/fixtures/v2/teamTemplateFixtures.spec.ts
npm run test:run
npm run build
git diff --check
git status --short
```

Expected: Task 1.7 command/validation regression, Task 1.8 workflow regression, all five V2 fixture specs, the full suite, and the production build pass. `git diff --check` has no output. Status contains only the four Slice 1 files. If Vite emits only the existing approximately 683 kB chunk-size warning, record it as known and non-blocking; any new warning or error requires investigation before review.

### External review gate — do not commit yet.

Stop and report:

- the four files changed;
- focused test commands and exact passing counts;
- regression/full-suite/build commands and results;
- caller-search results;
- `git diff --check` output;
- `git status --short` output;
- confirmation that no commit was made and no push occurred.

Do not begin Slice 2 until external review authorizes continuation.

## Slice 2: UI-Neutral Edit Master Workflow Interpreter

**Files:**

- Modify: `src/application/workflow/workflowInterpretation.ts`
- Modify: `src/application/workflow/workflowInterpretation.spec.ts`

**Interfaces:**

- Consumes: existing `UpdateProjectMasterResult`, `ValidationIssue.severity`, `countBlocking()`, and generic `ActionDisposition`.
- Produces: `UpdateProjectMasterDisposition` and `interpretUpdateProjectMasterResult()` with the exact signatures above.
- Preserves: the original result object and its candidate Project/issues as context; all existing workflow decision and interpretation APIs.

- [ ] **Step 1: Write RED tests for Master-update interpretation**

In `src/application/workflow/workflowInterpretation.spec.ts`:

- import `vi` from Vitest;
- import `UpdateProjectMasterResult` and the Project command module namespace;
- import the Project Master validation module namespace;
- import `ValidationIssue`;
- import the future `interpretUpdateProjectMasterResult()` symbol.

Add this issue factory with existing validation vocabulary:

```ts
function projectMasterIssue(
	severity: ValidationIssue["severity"],
): ValidationIssue {
	return {
		code: `projectMaster.data.${severity}-test`,
		domain: "projectMaster",
		source: "data",
		severity,
		message: `${severity} Project Master test issue`,
		target: {
			section: "projectMaster.basicInformation",
			entityId: devProject002.id,
			field: "stnProjectName",
		},
	};
}
```

Add these exact test cases under `describe("ActionDisposition")`:

```ts
describe("Project Master Update", () => {
	it("interprets Blocking issues as blocked without executing or mutating the command result", () => {
		const updateSpy = vi.spyOn(projectCommands, "updateProjectMaster");
		const validationSpy = vi.spyOn(
			projectMasterValidation,
			"validateProjectMasterCompleteness",
		);
		const result: UpdateProjectMasterResult = Object.freeze({
			project: devProject002,
			issues: Object.freeze([projectMasterIssue("blocking")]),
		});

		const interpretation = interpretUpdateProjectMasterResult(result);

		expect(interpretation).toEqual({ kind: "blocked", result });
		expect(interpretation.result).toBe(result);
		expect(interpretation.result.project).toBe(devProject002);
		expect(interpretation).not.toHaveProperty("actions");
		expect(updateSpy).not.toHaveBeenCalled();
		expect(validationSpy).not.toHaveBeenCalled();
		updateSpy.mockRestore();
		validationSpy.mockRestore();
	});

	it("interprets Advisory-only issues as completed and preserves feedback", () => {
		const result: UpdateProjectMasterResult = {
			project: devProject002,
			issues: [projectMasterIssue("advisory")],
		};

		const interpretation = interpretUpdateProjectMasterResult(result);

		expect(interpretation).toEqual({ kind: "completed", result });
		expect(interpretation.result).toBe(result);
		expect(interpretation.result.issues).toBe(result.issues);
	});

	it("interprets a no-issue update as completed and preserves the Project", () => {
		const result: UpdateProjectMasterResult = {
			project: devProject002,
			issues: [],
		};

		const interpretation = interpretUpdateProjectMasterResult(result);

		expect(interpretation).toEqual({ kind: "completed", result });
		expect(interpretation.result.project).toBe(devProject002);
	});
});
```

The first case proves the interpreter consumes an existing result: neither the command nor completeness validator is called. Result identity assertions protect against Project, issue, and alias rewriting. Absence of `actions` protects against an override/decision path. Existing Create, Schedule, Team, Working Draft, and unsaved-navigation tests remain REGRESSION assertions.

- [ ] **Step 2: Run the focused workflow spec and verify RED**

Run:

```powershell
npm run test:run -- src/application/workflow/workflowInterpretation.spec.ts
```

Expected RED reason: `interpretUpdateProjectMasterResult` is not exported by the current module, so the new tests cannot execute. No existing workflow test should be weakened to obtain this failure.

- [ ] **Step 3: Implement the minimal interpreter**

In `src/application/workflow/workflowInterpretation.ts`, add `UpdateProjectMasterResult` to the type-only import from `projectCommands` and import `countBlocking` as a runtime helper from `domain/validation/validationIssue` while retaining the existing `ValidationIssue` type import.

Add exactly:

```ts
export type UpdateProjectMasterDisposition = ActionDisposition<
	"completed" | "blocked",
	UpdateProjectMasterResult
>;

export function interpretUpdateProjectMasterResult(
	result: UpdateProjectMasterResult,
): UpdateProjectMasterDisposition {
	return countBlocking(result.issues) > 0
		? { kind: "blocked", result }
		: { kind: "completed", result };
}
```

Do not call `updateProjectMaster()`, `validateProjectMasterCompleteness()`, or identity helpers. Do not mutate `result`, its Project, Master, issues, or `identityAliases`. Do not add `rejected`, decision actions, navigation data, reducer dispatch, or a `WorkflowDecisionRequest` variant.

- [ ] **Step 4: Run the focused workflow spec and verify GREEN**

Run:

```powershell
npm run test:run -- src/application/workflow/workflowInterpretation.spec.ts
```

Expected GREEN: the three new Edit Master interpretation tests and all existing Create/Schedule/Team/decision tests pass. Record exact Vitest file/test counts.

- [ ] **Step 5: Inspect the workflow diff for boundary integrity**

Run:

```powershell
git diff -- src/application/workflow/workflowInterpretation.ts src/application/workflow/workflowInterpretation.spec.ts
rg -n -S "UpdateProjectMasterDisposition|interpretUpdateProjectMasterResult|WorkflowDecisionRequest" src\application\workflow
```

Confirm:

- the new interpreter takes only `UpdateProjectMasterResult`;
- it returns only completed or blocked `ActionDisposition`;
- `WorkflowDecisionRequest` has no Edit variant;
- no override action exists;
- Create, Schedule, Team, Working Draft, and navigation functions are unchanged;
- neither production file imports React, reducer code, or runtime navigation.

- [ ] **Step 6: Run final Task 1.9 verification**

Run every command fresh:

```powershell
npm run test:run -- src/application/commands/projectCommands.spec.ts
npm run test:run -- src/application/workflow/workflowInterpretation.spec.ts
npm run test:run -- src/application/commands/projectCommands.spec.ts src/application/commands/scheduleCommands.spec.ts src/application/commands/teamCommands.spec.ts src/application/commands/projectCommandIntegration.spec.ts src/domain/project/projectMasterValidation.spec.ts src/domain/schedule/scheduleValidation.spec.ts src/domain/team/teamValidation.spec.ts
npm run test:run -- src/application/workflow/workflowInterpretation.spec.ts
npm run test:run -- src/fixtures/v2/referenceFixtures.spec.ts src/fixtures/v2/canonicalProjectFixtures.spec.ts src/fixtures/v2/teamCandidateFixtures.spec.ts src/fixtures/v2/scheduleCandidateFixtures.spec.ts src/fixtures/v2/teamTemplateFixtures.spec.ts
npm run test:run
npm run build
git diff --check
git status --short
```

Expected:

- focused Create tests pass;
- focused workflow tests pass;
- Task 1.7 command/validation regression passes;
- Task 1.8 workflow regression passes;
- all five V2 fixture specs pass;
- the full suite passes;
- the production build passes;
- `git diff --check` has no output;
- status lists only the five planned production/test files across both slices.

If Vite emits only the existing approximately 683 kB chunk-size warning, record it as known and non-blocking. Treat any changed warning or any command failure as a stop condition and investigate before reporting success.

### External review gate — do not commit yet.

Stop and report:

- all files changed;
- focused tests and exact passing counts;
- Task 1.7, Task 1.8, fixture, full-suite, and build results;
- workflow boundary inspection result;
- `git diff --check` output;
- `git status --short` output;
- confirmation that no commit was made and no push occurred.

Do not begin Task 2.1. A checkpoint commit may occur only after a separately authorized external-review prompt.

## Exact Verification Command Reference

The repository's `package.json` defines `test:run` as `vitest run` and `build` as `tsc -b && vite build`. Use these exact commands:

1. Focused Task 1.9 Create tests:

   ```powershell
   npm run test:run -- src/application/commands/projectCommands.spec.ts
   ```

2. Focused Task 1.9 workflow tests:

   ```powershell
   npm run test:run -- src/application/workflow/workflowInterpretation.spec.ts
   ```

3. Task 1.7 command/validation regression:

   ```powershell
   npm run test:run -- src/application/commands/projectCommands.spec.ts src/application/commands/scheduleCommands.spec.ts src/application/commands/teamCommands.spec.ts src/application/commands/projectCommandIntegration.spec.ts src/domain/project/projectMasterValidation.spec.ts src/domain/schedule/scheduleValidation.spec.ts src/domain/team/teamValidation.spec.ts
   ```

4. Task 1.8 workflow regression:

   ```powershell
   npm run test:run -- src/application/workflow/workflowInterpretation.spec.ts
   ```

5. Canonical V2 fixture regression:

   ```powershell
   npm run test:run -- src/fixtures/v2/referenceFixtures.spec.ts src/fixtures/v2/canonicalProjectFixtures.spec.ts src/fixtures/v2/teamCandidateFixtures.spec.ts src/fixtures/v2/scheduleCandidateFixtures.spec.ts src/fixtures/v2/teamTemplateFixtures.spec.ts
   ```

6. Full test suite:

   ```powershell
   npm run test:run
   ```

7. Production build:

   ```powershell
   npm run build
   ```

8. Whitespace verification:

   ```powershell
   git diff --check
   ```

9. Worktree verification:

   ```powershell
   git status --short
   ```

## Implementation Risks and Sequencing Constraints

- `CreateProjectInput` is a deliberate breaking type/API change. Complete the command and every caller migration inside Slice 1; never stop for external review while callers still use the narrow shape.
- Customer and Status are the only optional leaves on `CreateProjectMasterInput`. Each retains `CatalogItemId | null`: omission/`undefined` and canonical `null` follow the existing nullish Acer/RFQ default behavior, while explicit non-null IDs are preserved. Making any other Master property optional would violate the spec.
- All other empty canonical values are the existing domain `null` values supplied by the caller. The command must not translate them into empty strings, display hyphens, or catalog fallbacks.
- Use nested immutable spreads in tests and callers. Top-level `year`, `productLineId`, `stnProjectName`, `customerId`, or `statusId` fields would recreate the retired API.
- Full-Master construction must preserve every section and nested mechanical value. A selective reconstruction risks silently dropping hidden Master values, which is the Foundation blocker Task 1.9 exists to remove; reference identity is not a Task 1.9 acceptance criterion.
- Keep `allowBusinessIdentityDuplicate` in `CreateProjectContext`. Moving it into the input would change the approved existing workflow contract.
- `confirmCreateProjectAnyway()` already implements the second call correctly; changing it is unnecessary and increases regression risk. Prove its behavior through migrated tests.
- Current configured Master completeness issues are Advisory, but `ValidationIssue` supports Blocking. Test the interpreter with an existing-result fixture carrying a Blocking issue; do not invent a new validator or blocking policy.
- The Edit interpreter must import `UpdateProjectMasterResult` as a type and consume `countBlocking()` only. Importing or invoking `updateProjectMaster()` or completeness validation would collapse command and workflow layers.
- Do not split the Edit interpreter into a new module; `workflowInterpretation.ts` is small, focused, and already owns parallel interpreters.
- The external-review protocol overrides the writing-plans skill's normal frequent-commit guidance. Each slice ends with verification and a review stop, never an automatic commit.

## Plan Self-Review Checklist

Before reporting an implementation slice, the executor must verify:

- every Task 1.9 spec requirement is represented by a production step, test, regression assertion, or explicit constraint;
- all API signatures match the Planned Final TypeScript APIs section;
- every caller in the exhaustive checklist uses the new shape;
- no narrow Create compatibility path or `Partial<ProjectMaster>` exists;
- no React, Dashboard, runtime, Schedule, Team, reducer, identity, or Task 2.1 implementation leaked into the diff;
- no review gate leaves TypeScript or focused tests knowingly broken;
- no automatic commit or push command was introduced.
