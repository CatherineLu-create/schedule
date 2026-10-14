# User Trial Feedback Batch 2 Implementation Plan

> **For agentic workers:** After explicit implementation authorization, use superpowers:executing-plans or the user's chosen execution method, task by task. This document does not authorize implementation, commits, integration, or deployment.

**Recovery authorization:** Complete the surviving implementation in place. No commits, push, merge, deployment, or restart. Preserve `.superpowers/` evidence; only generated Vite JS/declarations may be restored to HEAD after confirming provenance.

**Authoritative duplicate decision:** The Project Type rule does not replace legacy duplicate review. Regression eligibility uses another Project's current STN name, trimmed and case-insensitive, preserving internal whitespace. New same-name matches warn. The existing composite duplicate safeguard and Create Anyway remain independent, including for eligible Regression. This supersedes replacement wording in the original planning record below.

**Recovery verification:** Add N/A future-Actual and month/year Publish boundaries, stale-confirmation and Edit compatibility tests, accessible/historical SSL/GL assertions; complete fresh focused/full/build verification and independent review.

**Recovery completion:** Implementation retained and completed. Focused run: 34 files / 711 tests; review-fix run: 3 files / 132 tests; final full suite: 92 files / 1583 tests, all exit 0. Build and diff check passed. Fresh independent review's stale-confirmation feedback finding was reproduced and fixed; full suite includes that regression. Protected worktree clean at the approved HEAD. Detailed command evidence and final status are retained in `.superpowers/sdd/2026-10-14-user-trial-feedback-batch2/`. Original checklists below remain the historical planning record; manual acceptance steps are supplied in the final recovery report.

**Goal:** Block publication of future Actual dates, add migration-safe Project Type and same-name rules, and standardize system FCS presentation to SSL/GL.

**Architecture:** Keep Project.master and ProjectId authoritative. Reuse the canonical Schedule Publish collector and share its future-Actual predicate with the existing scheduleValidation module; retain permissive Draft editing. Extend existing Project commands, projections, Dashboard schema, and presentation helpers without introducing persistence or another report.

**Tech stack:** Existing React, TypeScript, Vitest, Testing Library, SheetJS; no new dependencies.

**Spec:** The user's approved “Feedback Batch 2 — Actual Date Validation + Project Type + SSL/GL Cleanup / PLAN-ONLY PHASE” request in this conversation is authoritative; its rules are recorded below.

## Baseline and authorization

- Protected worktree: `D:/011superpowers-schedule-user-trial`, branch `user-trial-pages`, clean at `fc98e386583463e5d33f7cb676a63c2a1a7241fb` (`style: polish Reports Export Contents card`).
- Preferred feedback branch and directory did not exist when inspected. Created `feature/user-trial-feedback-batch2` at `D:/011superpowers-schedule-user-feedback-batch2` from that exact hash. No pre-existing work was overwritten.
- This phase creates only this plan in the isolated worktree. No production/test edits, dependency installation, commits, push, merge, or deployment.
- Existing convention: `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`. Review below is an inline self-review, not an independent reviewer or human acceptance result.

## Global constraints

- New Projects require Project Type; historical missing/null values remain unspecified. Never infer New from old data.
- Project Type does not change ProjectId, leverage, or create Parent/Base lineage.
- Same-name matching is trim + case-insensitive exact comparison, across all Projects, not Year/Product Line scoped; exclude self for editing. No fuzzy matching or alias matching.
- Actual later than today's local DateOnly blocks publication; Draft editing/retention remains allowed. No UTC timestamp comparison.
- Keep `milestone-ramp-fcs`, `type-fcs`, `schedule:ramp-stage:fcs`, and existing automatic Attention policy unchanged. Do not introduce `type-ssl-gl`.
- Preserve immutable raw evidence, Published versions, Governance release authority/Stage-Type model, Milestone Follow-up, Team authority, self-service catalogs, backend/DB absence, deployment configuration, and `/schedule/`.
- Dashboard export gains one Project Type column in its existing `All Projects` worksheet and uses the existing filtered row set. No new worksheet.
- RPT-01's existing single-sheet workbook, fields, filter UI, and content groups stay unchanged in this batch. Consuming Project Type there remains a later narrow extension; no two-sheet Leverage work.

## Investigation findings and decisions

### A. Future Actual: existing behavior and integration

- `src/domain/schedule/scheduleValidation.ts:39-84` validates the older row-based model. `schedule.data.future-actual` is currently **advisory**, comparing DateOnly against an explicit referenceDate. N/A exits before the date checks. Its consumers include the older `scheduleCommands.ts` lifecycle, not the current canonical Publish implementation.
- `src/domain/schedule/canonicalScheduleWorkingDraft.ts:52` validates definition/occurrence integrity only. `officialSchedule.ts:126` validates published identity/version integrity. Keep those structural readers/validators free of a time-dependent publication rule, so bad Draft dates do not make drafts uneditable or historical Published reads unavailable.
- Current `canonicalScheduleCommands.ts::publishScheduleWorkingDraft` calls `scheduleReviewCommands.ts::collectSchedulePublishBlockingFindings`. The collector calls `occurrenceDateIssues` for DateOnly shape, applicability, N/A dates and missing Plan, but has **no future-Actual check**. A severity change in the old validator alone would not fix the runtime.
- Draft `updateScheduleWorkingDraftMilestone` accepts the edited value. Keep that behavior. No max-date input restriction that prevents retaining the value.
- Import `validateScheduleImportOperation` uses `occurrenceDateIssues` as an **apply-to-Draft** gate. `previewScheduleImportDecision` separately returns `remainingPublishBlockingFindings` from the canonical collector. Add the future check to the latter, not the import apply gate: a syntactically valid future Actual can be confirmed into Draft, but preview and final Publish must report the blocker. Raw candidate findings/evidence are not rewritten.
- `scheduleWorkspace.tsx:188` currently consults Publish findings for button disablement only when import candidates exist. Remove that candidate-count condition and display the same collector messages for manual Drafts too.

**Proposed interface:** Export `validateFutureActualDate(actual: DateOnly | null, context: ScheduleValidationContext, target: ValidationTarget): readonly ValidationIssue[]` from the existing `scheduleValidation.ts`. It owns the one predicate and returns code `schedule.data.future-actual`, source `data`, severity `blocking`, message **“Actual date cannot be later than today.”**, field `actual`. Use it from the older row validator and the canonical Publish collector. Run it before the old N/A short circuit so a populated future Actual is never exempt; retain existing N/A/date incompatibility checks independently.

Add required `referenceDate: DateOnly` to `CanonicalScheduleCommandContext`. `main.tsx` supplies `toLocalDateOnly(new Date())` when constructing the current action/preview context; command confirmation must recompute it, including after local midnight. Do not use the startup-captured Dashboard reference date or derive today from `publishedAt.toISOString()`. Tests inject an explicit date through context and control the UI clock. `publishedAt` remains an audit timestamp, not date-validation authority.

### B. Project Type: canonical model and command behavior

**Recommended field:** `Project.master.basicInformation.projectType`.

**Recommended type:** `export type ProjectType = "new" | "regression"` in `src/domain/project/projectMaster.ts`; `readonly projectType?: ProjectType | null` on `ProjectMasterBasicInformation`. Optionality is exclusively compatibility with pre-field object shapes; missing and null mean the same unspecified value. New successful creations always store an explicit enum. No catalog, fake unspecified enum, side map, persistence layer, or bulk backfill.

- Keep existing fixtures missing/null; add focused tests for both forms. Do not tag all fixtures New to satisfy new-create validation. Adjust *new-create test inputs* to explicitly select a type.
- Add `projectType: ProjectType | ""` to `ProjectMasterForm`, initial value `""`. Existing missing/null becomes blank. A legacy blank remains permitted on unrelated Detail saves; the control offers New/Regression with a blank placeholder, not an additional business type. Preserve a missing legacy field on unrelated round-trips rather than silently changing it to New.
- Add `projectTypeLabel(value: ProjectType | null | undefined): "New" | "Regression" | null` to existing `projectMasterDisplay.ts`. Detail/duplicate contexts use `—`; Dashboard row projection uses existing `-` sentinel, translated to `—` by table display and blank by export.
- `projectMasterValidation.ts` must coalesce the new optional leaf to null when reading completeness fields. Do not add Project Type to global completeness requirements for old Projects.

**Same-name helper:** In new `src/application/identity/projectNameMatches.ts`, expose `normalizeStnProjectName(value: string | null): string` and `findSameNameProjects(projects: readonly Project[], name: string | null, excludeProjectId?: ProjectId): readonly Project[]`. Normalize with `(value ?? "").trim().toLowerCase()`. Blank never matches. Preserve internal whitespace and punctuation: `Manta == " manta " == MANTA`, but `Manta != Manta 14` and `Manta  14 != Manta 14`.

Do not change `projectIdentity.ts::normalizeProjectIdentityName`: it intentionally collapses whitespace for existing alias behavior. Do not consult identityAliases for this new current-name rule.

**Create:** Extend `CreateProjectRequiredField` with `projectType`; blank/missing/null is rejected, and an unknown runtime enum gets a blocking field issue. In `createProject`, replace the old Year + Product Line + normalized-name duplicate decision with the approved Project Type rule:

- Regression: at least one existing same-name Project is required; its type/year/product line can be anything, including null. Otherwise return `rejected`, reason `projectTypeValidation`, with a blocking issue. No “Create Anyway” bypass for this failure.
- New: same-name matches return existing `reviewRequired` workflow with an advisory Warning and “Create Anyway”; acknowledgment permits creation and leaves type New. Match rows are shown immediately even for a single match: **Year | Project Type | STN Project Name | QCI Model Name**, with `—` for null type. Keep Review Existing/Back actions.
- Existing duplicate ProjectId rejection remains independent and cannot be bypassed. Successful creation still goes through `prepareProjectCreationCommit`, preserving Schedule initialization, requirements, and Team defaults.
- Reuse the current `allowBusinessIdentityDuplicate` internal acknowledgment flag for New-only warning confirmation; re-evaluate against latest `stateRef.current.projects`, not the captured context, at Create Anyway.

**Edit:** Extend `updateProjectMaster(project, input, context: { existingProjects: readonly Project[] })` while preserving its `{project, issues}` result and `interpretUpdateProjectMasterResult` blocking behavior. Validate type values at the command boundary. Apply the Regression matching rule only when effective Project Type or stored STN Project Name actually changes and the resulting type is Regression; exclude `project.id`.

On a blocking result return the original Project and issues before alias capture; main must not dispatch or leave Edit mode. Unrelated edits to an orphaned saved Regression remain allowed. Renaming another Project never cascades invalidation. Cancel retains the original Project. A New duplicate warning is required on Create; do not introduce a new Detail confirmation workflow.

### C. Portfolio and Reporting boundary

- Add `projectType` to `DashboardProjectRow`, projected from canonical master as New/Regression/`-`; Portfolio rows already compose that projection.
- Add `projectType` to the existing column registry/getter. Place it **after QCI Model Name** to retain the four existing contiguous sticky identity columns and their keys. It participates in the existing Project Information group.
- Add `projectType` filter with fixed options New/Regression and All (`""`); no null option. All includes legacy rows. Combine with current search/other filters, chips, clear-all and zero-result behavior.
- `PortfolioSearchFilters` is shared with RPT-01. Add `showProjectTypeFilter?: boolean` default false; only Dashboard opts in. Shared filter state defaults its new key to All, so Reports behavior remains unchanged without editing RPT-01 production files.
- `portfolioDashboardExport.ts` already maps registered columns/getters and converts `-` to blank. Reuse that behavior with the already filtered rows; no export algorithm/worksheet redesign is needed.

## Complete FCS inventory at the baseline

A literal `rg -n -i fcs src` is not sufficient: most current leaks are catalog values rendered through generic `displayName` consumers. The following combines literal matches and traced presentation paths.

| Class | File / surface | Planned treatment |
|---|---|---|
| A | `config/v2/referenceData.ts:379,590`: Type displayName FCS; definition stored name FCS | Preserve stored historical values; resolve UI terminology centrally. Add SSL/GL as a recognized Type alias for source input, keeping FCS recognized. No ID/name migration of stored releases. |
| A | `application/milestoneDefinitionPresentation.ts`: exact system definition already displays SSL/GL | Retain exact-ID mapping. Centralize an exact whole-label FCS terminology alias for canonical display, without substring replacement or identity inference. |
| A | `governanceWorkspace.tsx:57-58`: definition descriptions/composite choices | Resolve Type as SSL/GL: `SSL/GL｜RAMP-stage｜SSL/GL`. |
| A | `governanceWorkspace.tsx:108-120,224,236-239,257-258,355`: diff classification lists, automatic-Type list, Stage/Type choices, definition metadata cells, released public catalog | Route resolved classification labels through the shared presenter; current FCS leak is Type metadata. Bundled Stage labels contain no FCS; do not rename stage-ramp/RAMP-stage. |
| A | `governanceClassificationControls.tsx:21-24,36-47`: classification list text, button/aria labels, historical/nonselectable Type list | Use resolved classification labels, including historical type-fcs. It stays nonselectable; display cleanup must not activate it. |
| A | `scheduleImportReviewPanel.tsx:29-31,100,144-149,187-195,245-249,264-273`: resolved Stage/Type labels, definition descriptions, mapping/create/update options, proposed/confirmed targets and trace names | Use shared definition/classification presentation. Resolved type-fcs metadata shows SSL/GL. |
| A, already correct | `portfolioDashboardColumns.ts:35,74,158`: SSL/GL mapping and dynamic labels; `application/selectors/scheduleSelectors.ts`, `scheduleWorkspace.tsx`: Published/Draft/add choices | Keep SSL/GL output. Change the mapping's presentation seed string FCS to SSL/GL for clarity; preserve its key and ID. |
| A, already correct | `application/selectors/dashboardAttention.ts`, `portfolioDashboardView.tsx`; `application/selectors/projectMilestoneFollowUp.ts`, `projectMilestoneFollowUpPanel.tsx` | They use resolved milestone names. Keep participation/selection code unchanged; guard with regression tests. |
| A, user-authored canonical label | Project-local definition named exactly FCS (currently exercised in tests, not startup fixtures) | Preserve stored name/ID, but render the exact whole-label terminology as SSL/GL. This is presentation only; it must NOT grant automatic Attention or map local identity to public identity. Other user-authored strings are not globally rewritten. |
| B | `scheduleImportReviewPanel.tsx:245-246`: rawValues milestoneName, raw stage/type fallback, immutable raw findings; underlying `domain/schedule/scheduleReview.ts` evidence records | Preserve literal source FCS. Distinguish raw evidence from resolved metadata: a raw type-fcs identifier remains available as evidence, while its resolved canonical label is SSL/GL. Do not rewrite evidence ledger, decision snapshots, or raw strings. |
| C | `config/v2/systemMilestones.ts:3-9`; `referenceData.ts:88,378,589,592`; `portfolioDashboardColumns.ts:74` | Preserve `milestone-ramp-fcs`, `type-fcs`, `milestoneTypeIds.fcs`, Portfolio key, system policy, and historical stored names/comments. These are not UI labels. |
| D -> A | `governanceWorkspace.ux.spec.tsx:316`, `scheduleImportReviewPanel.spec.tsx:73` | Change expected composite Type label from FCS to SSL/GL; add assertions for all generic catalog surfaces and aria labels. |
| D -> A/B/C | `legacy/characterization/governanceBatch1Runtime.spec.tsx`: local FCS UI selectors, stored-name check and exact system identity | Update local rendered label expectations only; keep raw/stored FCS and exact-ID assertions, and prove no automatic eligibility for the lookalike. |
| D -> C | `config/v2/referenceData.spec.ts`, `application/governance/effectiveMilestoneGovernanceContext.spec.ts` | Retain historical stored name/Type checks and stable IDs; cover the additional accepted alias without making Type selectable/automatic. |
| D, retain/extend | `governanceWorkspace.ordering.spec.tsx`, `portfolioDashboardColumns.spec.ts`, `portfolioDashboardView.spec.tsx`, `scheduleWorkspace.spec.tsx`, `application/selectors/dashboardAttention.spec.ts`, `application/selectors/projectMilestoneFollowUp.spec.ts`, `projectMilestoneFollowUpPanel.spec.tsx` | Retain ordering, keys, SSL/GL labels and policy coverage; update local-lookalike display expectation where applicable, never participation expectation. |

**Presentation interfaces:** In existing `milestoneDefinitionPresentation.ts`, add `milestoneClassificationDisplayName(item: { readonly id: string; readonly displayName: string }): string`; exact type-fcs always returns SSL/GL, other labels use a private whole-label FCS-to-SSL/GL presenter. Extend `milestoneDefinitionDisplayName` with that same presentation-only fallback for non-system canonical labels. Raw-evidence renderers never invoke this fallback on verbatim text. The Type alias addition is needed because `scheduleReviewCommands.ts::unknownRawTypeFindings` currently accepts only ID/displayName/aliases; the newly displayed SSL/GL term must not become an unknown source Type.

## Review focus and test ownership

1. Long-lived sessions crossing local midnight: fresh Publish DateOnly, not startup Dashboard date (Task 1).
2. Future import Actual: permit confirmation into Draft, block final Publish, retain evidence (Task 1).
3. Same name across years/products, internal spaces, and excluded current Project: exact matching without alias drift (Task 2).
4. Orphaned Regression unrelated edits and stale Create Anyway context: no cascade rewrite, current-state checks (Tasks 2-3).
5. Shared RPT controls and raw evidence: Dashboard-only filter, unchanged report workbook, raw FCS retained alongside resolved SSL/GL (Tasks 4-5).

## Implementation tasks (not executed)

### Task 1 — One future-Actual rule at publication boundaries

**Modify:** `src/domain/schedule/scheduleValidation.ts`, `src/application/commands/canonicalScheduleCommands.ts` (context), `src/application/commands/scheduleReviewCommands.ts` (Publish collector), `src/main.tsx` (fresh local date), `src/scheduleWorkspace.tsx` (manual/import feedback), `src/test/governanceTestUtils.ts` (deterministic context).

**Tests:** `src/domain/schedule/scheduleValidation.spec.ts`, `src/domain/shared/dateOnly.spec.ts`, `src/application/commands/canonicalScheduleCommands.spec.ts`, `src/application/commands/canonicalScheduleCommandIntegration.spec.ts`, `src/application/commands/scheduleReviewCommands.spec.ts`, `src/scheduleWorkspace.spec.tsx`, `src/scheduleImportReviewPanel.boundaries.spec.tsx`; new `src/userTrialFeedbackBatch2.runtime.spec.tsx`. Update older `src/application/commands/scheduleCommands.spec.ts` expectations only where future-Actual advisory was explicitly assumed.

- [ ] Write failing cases with reference `2026-10-14`: Actual 10-13/10-14 allowed; 10-15 returns the exact blocking code/message; null adds no future issue. Isolate this rule with a valid Plan/applicability.
- [ ] Prove manual Draft retains 10-15 and can be corrected; blocked Publish leaves versions, Current Published, evidence, review closures and Draft unchanged; corrected Publish succeeds. Include N/A with a future Actual (never publication-safe).
- [ ] Prove import operation can confirm a syntactically valid future Actual, preview reports a remaining publication blocker, Publish fails, and original evidence remains byte-for-byte equivalent.
- [ ] Prove local midnight/month/year boundaries using controlled local Dates (including Asia/Taipei when local day differs from UTC); advancing the UI clock after mount changes the action's validation date without changing Attention's reference-date contract.
- [ ] Run focused tests to establish the expected failures; implement the shared helper/context/collector integration above, with no future-date restriction in structural Draft validation or input editing.
- [ ] Run focused tests to pass. Update explicit command-context literals in existing test callers to deterministic DateOnly values; never use an arbitrary far-future clock to conceal failing policy tests.

### Task 2 — Project Type model and command rules

**Create:** `src/application/identity/projectNameMatches.ts` and `.spec.ts`.
**Modify:** `src/domain/project/projectMaster.ts`, `src/domain/project/projectMasterValidation.ts`, `src/application/commands/projectCommands.ts`.
**Tests:** `src/domain/project/projectMaster.spec.ts`, `src/domain/project/projectMasterValidation.spec.ts`, `src/application/commands/projectCommands.spec.ts`, `src/application/commands/projectCommandIntegration.spec.ts`; retain `src/application/identity/projectIdentity.spec.ts` unchanged as an alias-contract guard.

- [ ] Write failing tests for absent/null legacy values, explicit new/regression, invalid type, required Create type, and exact-name examples above. Include different Year/Product Line, blank names, punctuation and internal whitespace; QCI name/aliases must not determine same-name eligibility.
- [ ] Test New duplicate review/acknowledgment keeps New and ProjectId distinct; Regression with zero matches rejects even with the acknowledgment flag; any one other same-name Project suffices, including a legacy-null type.
- [ ] Test Edit excludes self; name/type changes to unmatched Regression block and return original Project/aliases; unrelated orphaned Regression edits succeed; renaming another Project causes no cascade; returning to unchanged fields has no business-field change to validate.
- [ ] Run focused tests to fail; implement the proposed model/matcher and command behavior without changing alias normalization or adding completeness requirements for legacy Projects.
- [ ] Run focused tests to pass; verify no authoritative field is copied outside Project.master.

### Task 3 — Create and Detail UX with existing Save/Cancel authority

**Modify:** `src/projectMasterForm.ts`, `src/projectMasterDisplay.ts`, `src/projectMasterControls.tsx` (shared fixed-enum control), `src/projectMasterDetail.tsx`, `src/duplicateProjectReview.tsx`, `src/main.tsx`.
**Tests:** `src/projectMasterForm.spec.ts`, `src/projectMasterControls.spec.tsx`, `src/projectMasterDetail.spec.tsx`, `src/duplicateProjectReview.spec.tsx`, `src/application/workflow/workflowInterpretation.spec.ts`, new `src/userTrialFeedbackBatch2.runtime.spec.tsx`; adapt Create helpers/expected warning scope in `src/legacy/characterization/runtime.spec.tsx`.

- [ ] Write failing Create tests: unselected Type cannot create; Regression no match shows blocking message; New duplicates across years show all four identity fields immediately for one or many matches; null displays `—`; Create Anyway creates New.
- [ ] Write Detail tests: display/read/edit Type, legacy blank round-trip, self exclusion, blocked Save stays in Edit with form values intact, Cancel discards edits, unrelated orphaned Regression edit remains valid.
- [ ] Cover stale duplicate confirmation against latest Projects, not captured context; required type/Regression blockers cannot be bypassed by UI or direct command calls.
- [ ] Run to fail; implement form/control/display/command wiring. Keep existing update-result shape and workflow interpretation; only accepted command results dispatch Project changes.
- [ ] Run to pass; update only Create test inputs that now require explicit type, leaving historical fixture Projects unspecified.

### Task 4 — Dashboard Project Type column/filter/export

**Modify:** `src/application/selectors/dashboardProjectRows.ts`, `src/portfolioDashboardColumns.ts`, `src/portfolioDashboardCells.ts`, `src/portfolioDashboardFilters.ts`, `src/portfolioSearchFilters.tsx`, `src/portfolioDashboardView.tsx`.
**Tests:** `src/application/selectors/dashboardProjectRows.spec.ts`, `src/application/selectors/portfolioDashboardRows.spec.ts`, `src/portfolioDashboardColumns.spec.ts`, `src/portfolioDashboardFilters.spec.ts`, `src/portfolioDashboardTable.spec.tsx`, `src/portfolioDashboardView.spec.tsx`, `src/portfolioDashboardExport.spec.ts`, `src/portfolioDashboardExport.runtime.spec.tsx`, `src/projectMasterReport.runtime.spec.tsx` (unchanged contract guard).

- [ ] Write failing tests for New/Regression/legacy row display; fixed All/New/Regression options; All includes null and missing values; type filters combine with existing filters/search and clear/reset chips.
- [ ] Assert column position after QCI Model Name, unchanged sticky keys, dynamic group spans, one All Projects worksheet, blank legacy type export, matching filtered ProjectIds, and header-only zero-result export.
- [ ] Assert Reports has no new filter/column/content group and retains its existing single-sheet contract despite shared projection/filter code.
- [ ] Run to fail; implement registry/getter/projection/filter changes and opt-in shared control. Reuse exportCell and existing filtered rows; no production edits to report modules or export algorithms unless a concrete compatibility failure proves necessary.
- [ ] Run focused tests to pass.

### Task 5 — SSL/GL presentation and evidence preservation

**Modify:** `src/application/milestoneDefinitionPresentation.ts`, `src/config/v2/referenceData.ts` (Type alias only), `src/governanceWorkspace.tsx`, `src/governanceClassificationControls.tsx`, `src/scheduleImportReviewPanel.tsx`, `src/portfolioDashboardColumns.ts` (presentation seed only).
**Create test:** `src/application/milestoneDefinitionPresentation.spec.ts`.
**Modify tests:** the twelve FCS-bearing test files listed in the inventory only where their presentation/alias expectations change; extend `src/scheduleImportReviewPanel.boundaries.spec.tsx` and `src/application/commands/scheduleReviewCommands.spec.ts` for raw preservation and accepted source-Type aliases.

- [ ] Write failing assertions for definition/Type/composite/aria/historical-label surfaces, including a historical release still storing FCS and a local definition named FCS.
- [ ] Test a raw FCS source record and resolved SSL/GL metadata side by side; raw values, evidence and decision identities remain unchanged; FCS and SSL/GL Type inputs both resolve through existing catalog alias semantics.
- [ ] Retain exact-ID Attention boundary/dedupe/Draft/empty-additional tests. Local same-name definitions remain nonautomatic unless another existing participation route independently applies.
- [ ] Run to fail; implement targeted presentation helpers and call sites from the A inventory. Preserve B/C content, Type retirement/selectability, and system selector files.
- [ ] Run to pass; inspect `rg -n -i fcs src` and classify remaining matches rather than expecting zero technical/raw matches.

### Task 6 — Integration verification and review

- [ ] Run the commands below after implementation, from the isolated worktree. Do not install or build in the protected worktree.
- [ ] Manually smoke: future Actual retained then blocked/corrected Publish; Create New warning and Regression blocker; Detail self-exclusion/Cancel; legacy `—`; filter/export parity; Governance/import labels versus raw evidence.
- [ ] Review final diff for clock freshness, command-boundary bypass, alias semantics, RPT shared-control leakage, stable IDs and unchanged raw evidence. Obtain the review required by the later implementation authorization; do not claim human acceptance without it.
- [ ] Recheck protected branch HEAD/status and exact isolation. Stop for review; this plan does not authorize commit, push, merge or deploy.

### Compatibility-only caller and fixture adjustments

The new required Schedule context date and required Create Type also require inspecting these existing callers beyond the focused tests above. Update only explicit context/input fixtures and changed presentation expectations; retain their original behavioral assertions:

- `src/application/selectors/dashboardAttention.spec.ts`, `src/application/selectors/scheduleSelectors.spec.ts`, `src/application/selectors/scheduleReviewTrace.spec.ts`: explicit Schedule command contexts.
- `src/legacy/characterization/governanceRuntime.spec.tsx`, `src/legacy/characterization/governanceBatch1Runtime.spec.tsx`: explicit Schedule contexts and Create inputs.
- `src/legacy/characterization/projectCreationGovernanceRuntime.spec.tsx`, `src/legacy/characterization/projectMilestoneFollowUpRuntime.spec.tsx`: Create UI helpers must select New/Regression, with existing legacy fixture Projects still unspecified.
- `src/governanceWorkspace.spec.tsx`, `src/scheduleImportReviewPanel.spec.tsx`, `src/application/workflow/workflowInterpretation.spec.ts`: inspect Create/context fixtures and update only those constructing affected inputs.
- Add source compatibility checks for existing `src/fixtures/v2/canonicalProjectFixtures.ts` and `src/fixtures/userTrialDemoSeed.ts` without assigning a type to their historical Projects. Unrelated Governance-state objects also contain `retiredDraftOccurrenceGrants`; do not add referenceDate to those objects merely because a text search matches them.

## Verification commands (for the later implementation phase only)

Run in `D:/011superpowers-schedule-user-feedback-batch2`; install dependencies there only when implementation is authorized, using the committed lockfile (`npm ci`). No dependencies were installed during planning.

```powershell
npm run test:run -- src/domain/schedule/scheduleValidation.spec.ts src/domain/shared/dateOnly.spec.ts src/application/commands/canonicalScheduleCommands.spec.ts src/application/commands/canonicalScheduleCommandIntegration.spec.ts src/application/commands/scheduleReviewCommands.spec.ts src/scheduleWorkspace.spec.tsx src/scheduleImportReviewPanel.boundaries.spec.tsx
npm run test:run -- src/application/identity/projectNameMatches.spec.ts src/application/commands/projectCommands.spec.ts src/application/commands/projectCommandIntegration.spec.ts src/projectMasterForm.spec.ts src/projectMasterDetail.spec.tsx src/duplicateProjectReview.spec.tsx src/userTrialFeedbackBatch2.runtime.spec.tsx
npm run test:run -- src/portfolioDashboardFilters.spec.ts src/portfolioDashboardColumns.spec.ts src/portfolioDashboardExport.spec.ts src/portfolioDashboardExport.runtime.spec.tsx src/projectMasterReport.spec.tsx src/projectMasterReport.runtime.spec.tsx
npm run test:run -- src/application/milestoneDefinitionPresentation.spec.ts src/governanceWorkspace.ux.spec.tsx src/scheduleImportReviewPanel.spec.tsx src/application/selectors/dashboardAttention.spec.ts src/legacy/characterization/governanceBatch1Runtime.spec.tsx
npm run test:run
npm run build
git diff --check
rg -n -i fcs src
git diff fc98e386583463e5d33f7cb676a63c2a1a7241fb -- src/application/selectors/dashboardAttention.ts src/config/v2/systemMilestones.ts src/application/governance/effectiveMilestoneGovernanceContext.ts src/projectMasterReportColumns.ts src/projectMasterReportExport.ts src/projectMasterReportView.tsx vite.config.ts .github/workflows
git -C D:/011superpowers-schedule-user-trial --no-optional-locks status --short --branch
git -C D:/011superpowers-schedule-user-trial --no-optional-locks rev-parse HEAD
```

Expected: focused/full tests pass, build exits 0, diff check empty; remaining FCS occurrences are reviewed B/C or intentional stored-data tests, not canonical UI leaks. Protected HEAD stays at the approved hash and clean. The guardrail diff above should be empty; no production selector/policy/report/deployment changes are planned.

## Scope, conflicts, size, and plan review

- **Resolved existing-rule conflict:** old Create duplicates use Year/Product Line and collapsed whitespace; the approved new rule supersedes that Create gate only. Alias behavior remains untouched.
- **Resolved validation split:** old advisory and canonical Publish are separate code paths. The plan shares only the future-Actual rule and leaves structural editing and import apply contracts intact; no new validation authority.
- **Resolved presentation boundary:** canonical/system labels become SSL/GL, stored identifiers/names and literal raw evidence remain original. Presentation does not enroll a local lookalike in Attention.
- **Resolved Reporting scope:** Project Type reaches Dashboard's existing worksheet now; RPT-01 field expansion is deferred as requested. Shared controls are opt-in to avoid incidental report redesign.
- **Estimated implementation size:** medium, five implementation tasks plus integration review; approximately 24 production files (one new matcher module) and 35-45 test/helper files including caller/fixture adaptations. Roughly 3-5 focused engineering days including tests/review; not a delivery commitment. Most risk is command/UI integration and existing test adaptation, not enum or label size.
- **Self-review completed:** all approved requirements mapped to tasks; interfaces and sentinel values cross-checked; raw evidence vs resolved metadata distinguished; no unsupported assumption that legacy Projects are New; no Parent/Base relationship; no new DB/persistence; no Attention participation changes; no extra workbook/sheet. The five review-focus cases have explicit test owners. No business decision blocks writing this plan.
- **Planning validation:** protected and isolated HEADs verified; source/call sites and current test assertions inspected. No tests/build executed and no test-pass claim is made for this unimplemented plan. Only this document is intended to be untracked in the feedback worktree.
