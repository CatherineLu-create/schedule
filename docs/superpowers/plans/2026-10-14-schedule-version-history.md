# Schedule Version History / Historical Draft Base Implementation Plan

> **For agentic workers:** After implementation authorization, use `superpowers:executing-plans` or the user's chosen execution method, task by task. Checkboxes are implementation work, not work authorized by this planning phase. Do not commit, push, merge, deploy, reset, restore, checkout, clean, or recreate the worktree.

**Goal:** View immutable Published history, start the single Working Draft from any Published snapshot, and require a stored Publish Note for every new publication.

**Architecture:** `PrototypeState.schedules` remains the sole Schedule authority. History selection is Project Schedule UI state; official consumers continue selecting the highest Published version. Add traceability to the existing Draft snapshot, not a second snapshot store.

**Tech stack:** Existing TypeScript, React, Vitest/Testing Library and XLSX; no dependencies or persistence changes.

**Spec:** User's approved “Schedule Version History / Historical Draft Base — PLAN-ONLY PHASE” instructions, captured below. Preserve the completed, uncommitted Feedback Batch 2 implementation and its plan, `2026-10-14-user-trial-feedback-batch2.md`.

## Baseline and constraints

- Worktree: `D:\011superpowers-schedule-user-feedback-batch2`; branch: `feature/user-trial-feedback-batch2`; HEAD: `fc98e386583463e5d33f7cb676a63c2a1a7241fb`.
- Planning baseline: 60 modified tracked files and seven untracked status entries, including `.superpowers/` and the Batch 2 plan. Preserve all of them. This plan is the only new file in this phase.
- Protected `D:\011superpowers-schedule-user-trial`: branch `user-trial-pages`, same HEAD, clean; read-only checks only.
- Published snapshots remain immutable. One Working Draft; no silent replacement. Historical base is a warning, not a new publication blocker.
- Preserve Project.master, Project Type/duplicate review, Governance Stage/Type and release authority, public/local identities, retirement grants, requirements, Follow-up, Attention participation, import evidence, Team/catalog/leverage behavior, Dashboard Export and RPT-01 contracts.
- Preserve exact future-Actual blocker: **Actual date cannot be later than today.** Use fresh local DateOnly at Publish, independently of the Publish Note and audit timestamp.
- Preserve SSL/GL presentation and technical identities `milestone-ramp-fcs`, `type-fcs`, `schedule:ramp-stage:fcs`. No backend, lockfile, Pages workflow or Vite source change.

## Findings and design decisions

### Existing domain and commands

`domain/schedule/officialSchedule.ts` already defines `CanonicalPublishedScheduleVersion` with `versionNumber`, `versionNote: string | null`, `publishedAt: string`, and immutable milestone snapshots. It has no `createdAt`. `CanonicalProjectSchedule` holds `publishedVersions`, one `workingDraft`, local definitions and the evidence/review ledgers. `getCurrentPublishedVersion` selects the maximum version number, regardless of array order.

`canonicalScheduleWorkingDraft.ts` holds Draft ID, milestone snapshot, review-session IDs and import candidates; it has no base reference. The predecessor model in `schedule.ts` has `basePublishedVersionId`, but is not the canonical runtime model. Do not migrate to that model or add canonical version IDs.

`canonicalScheduleCommands.ts` currently starts only from Current Published (or empty), returns an existing Draft unchanged, publishes with `versionNote: null`, freezes a new snapshot, appends history and clears the Draft. `getNextPublishedScheduleVersionNumber` already computes `max + 1`, starting at v01, and rejects unsafe numbers/overflow. Keep this algorithm. Discard must retain the existing review-session closure command, not directly set Draft to null.

### Metadata contracts

| Location | Recommended contract |
| --- | --- |
| `CanonicalPublishedScheduleVersion.versionNote` | Reuse this field; widen to `readonly versionNote?: string | null` solely for old missing metadata. Do not add a second `publishNote` field. |
| `PublishScheduleWorkingDraftInput` | Add required `readonly versionNote: string`; retain `publishedAt`. UI label is **Publish Note**. |
| `CanonicalScheduleWorkingDraft` | Add `readonly basePublishedVersionNumber?: ScheduleVersionNumber | null`. Newly started Drafts always write the selected/current number, or null when no Published version exists. |

Old Published null/missing/blank notes display **No note** without mutation or fabricated fixture data. Existing nonblank notes remain as stored. New Publish trims the input and requires 1–200 JavaScript string code units after trimming; no other bounded-note convention was found. Reject missing, null, non-string, blank and overlong command inputs safely. Use `schedule.publish.note-required` / “Publish Note is required.” and `schedule.publish.note-too-long` / “Publish Note must be 200 characters or fewer.”, severity blocking, target field `versionNote`.

Add `validateSchedulePublishNote(value: unknown): readonly ValidationIssue[]` to `scheduleValidation.ts`; use it in both UI and command validation. Aggregate note issues with existing publication findings before any mutation. Do not add the required-note rule to structural history/Draft validation or import apply validation. Future Actual plus blank note must report both blockers.

Draft base is traceability only: never use it for numbering, official reads, retirement authorization or requirement adoption. Missing legacy base means **Base version unavailable**, not an inferred Current base; explicit null means no Published base. Preserve both on unrelated edits. Do not block an otherwise valid legacy Draft solely for missing traceability. A malformed/unresolvable stored base displays unavailable rather than inventing provenance; newly requested bases must resolve exactly.

### Starting and viewing history

Extend `startScheduleWorkingDraft` input with optional `basePublishedVersionNumber: ScheduleVersionNumber`:

- Omitted: preserve current/empty behavior, recording the actual base. Existing callers, including simulation start, retain this default.
- Supplied: require an exact valid version in this Project; clone every occurrence, identity, applicability and date from that version. Never silently fall back to Current. Missing/invalid version returns `published-version-not-found` without mutation.
- If a Draft exists, an explicit-base request returns `working-draft-exists`; preserve the old implicit call's idempotent `status: existing`. Update the lifecycle failure union and `main.tsx` message map.
- New Draft ID; empty `reviewSessionIds`/`importCandidates`. Preserve global evidence, closures, decisions, sessions and local definitions; never reopen previous reviews or copy retirement grants into the new Draft.

Add selectors in `scheduleSelectors.ts`:

- `selectPublishedScheduleHistory(state, projectId, context)` returns validated, descending history entries with number, current marker, note and timestamp, or the existing unavailable result.
- `selectPublishedScheduleVersion(state, projectId, versionNumber, context)` returns the exact Published read plus `isCurrent`, or an explicit version-not-found/unavailable result. Share row projection with the current selector, including historical definition resolution, occurrence ordering and SSL/GL presentation. Keep `selectCurrentPublishedSchedule`'s public behavior unchanged.

Use a compact accessible **Schedule version** selector: Working Draft when present, then `v10 · Current — Update C2 SMT`, `v09 — …`, `v08 — …`. Default to Draft if one exists, otherwise Current. Show selected version, Current/Historical + Read-only, Publish Note and Published date/time. Format valid timestamps locally with an accessible full timestamp; render legacy unparsable metadata as stored text, never `Invalid Date`. Existing structural tests deliberately accept non-ISO timestamps.

`OfficialScheduleView` must receive an explicit historical presentation mode/heading; a historical snapshot must never say Current Schedule or expose editors. Selection stays local and resets on Project change. History remains browsable with a Draft present; return-to-Draft preserves its state. Prevent navigation away from a DateOnly editor with unapplied text until Apply/Cancel, using the existing unapplied-editor tracking. On successful creation select Draft; on successful Publish select new Current; discard returns to Current.

For a selected Published snapshot show **Create Draft from v08**. With an existing Draft, disable creation and explain **Resolve the existing Working Draft first.** Offer return to Draft and its existing explicit discard confirmation. After discard, the user chooses the historical base again; no automatic replacement or deferred creation. Re-resolve current owner/base/Draft presence at action time, not from a stale render.

### Publish and historical-base warning

Add a small shared `schedulePublishConfirmation.tsx` used by Project Schedule and Governance Advanced Tools. Export a shared historical warning presentation from that file for the editing banner too. Pass the live Draft ID/base, Current version and next version into it; it owns only transient note input and confirmation state. Change both Publish callback bindings to accept `versionNote: string`; `main.tsx` forwards it into the canonical command with fresh context.

Show this warning throughout editing and inside both Publish dialogs when known base differs from Current:

> This draft is based on historical version v08. Current Published is v10. Publishing this draft will create v11 and may replace changes introduced in v09–v10.

Compute affected existing version labels from actual history (handle gaps and a single intervening version); do not invent missing versions. The existing explicit Publish confirmation acknowledges this warning; no new blocking checkbox. If base/current/Draft identity changes while a dialog is open, invalidate that confirmation and show the updated context before submission. Reset transient note on Project/Draft change or success; retain it after a rejected Publish. An unknown legacy base gets informational unavailable text, not a false historical claim.

### Governance compatibility edge requiring explicit treatment

Existing `retainedDraftIssues` and `scheduleReviewCommands.occurrenceEligibility` allow nonaddable public occurrences only through exact **Current Published** lineage or a valid same-Draft retirement grant. Historical v08 alone cannot authorize a retired occurrence absent from v10. Repeated occurrences also require Current lineage at Publish. Current `removeScheduleWorkingDraftMilestone` calls `resolveEditableDraft`, so the retired-row issue currently blocks even removal.

**Recommended reconciliation:** Allow exact historical cloning and show the existing Governance findings; do not promise that every old snapshot can be republished unchanged. Add a narrowly scoped removal-only repair path: after existing structural/definition checks succeed, allow removing an existing occurrence despite a retained-lineage failure. This only deletes one Draft row; it grants no add/update/publish authority, changes no IDs or evidence, and requires no historical-base authorization. Multiple invalid rows can be removed one at a time. Add/update and Publish retain their existing rules. Never silently drop rows on clone. Discard remains available.

This is the one proposed behavior adjustment beyond history/metadata UX, needed to avoid trapping the user with an unrepairable historical Draft. It must be reviewed as part of this plan, not implemented as an unnoticed weakening of Governance. If “any historical snapshot must be republishable unchanged” is intended, that conflicts with the protected Current-lineage rule and requires a separate business decision; this plan does not authorize that expansion.

### Official consumers and existing test evidence

Portfolio/Dashboard and Attention call `selectCurrentPublishedSchedule`. Follow-up calls `selectEffectiveProjectMilestoneRequirements`, which reads `getCurrentPublishedVersion`. Dashboard XLSX consumes Portfolio rows and retains the single **All Projects** sheet. RPT-01 remains its existing Project Master projection; do not add history or notes to either export contract.

Canonical development fixtures have one v01 on the first Project and four empty Schedules; User Trial demo schedules each seed one v01 with a note. Existing tests already cover unordered multiple versions, max numbering, immutable publication, overflow and Current-only retained lineage. Add v08/v09/v10 history in focused test fixtures, not by rewriting production/demo history. Canonical Publish test callers currently pass only `publishedAt`; update actual new-Publish inputs with explicit notes, preserving all existing blocker assertions. Do not modify predecessor `scheduleCommands.ts` merely because it also has a note input.

## Implementation tasks

For each task: write the named assertions first, run the focused file to observe the intended failure, implement the smallest change, then rerun to green. Do not weaken unrelated tests or commit.

### 1. Metadata and canonical transitions

**Modify:** `src/domain/schedule/{officialSchedule.ts,canonicalScheduleWorkingDraft.ts,scheduleValidation.ts}` and `src/application/commands/canonicalScheduleCommands.ts`.

**Tests:** matching domain specs and `canonicalScheduleCommands.spec.ts`.

- [x] Add missing/null note and base compatibility tests; explicit new base null/current/historical; source rows and history remain unchanged and unaliased after edits.
- [x] Test explicit invalid base, cross-Project lookup, conflicting Draft, unchanged implicit idempotence, and review/evidence preservation.
- [x] Test first/later Publish requires note; missing/non-string/whitespace, trimmed 200 accepted, 201 rejected, trimmed text stored. Both note and future-Actual failures are reported atomically; retained Draft and every Published version are unchanged.
- [x] Pin `v08 base + [v10,v08,v09] => v11`; immutable v08/v09/v10, cleared Draft, existing max/overflow tests still pass. Null/missing old notes never block this operation.
- [x] Implement the metadata/command interfaces above; retain current numbering and closure logic. Update existing new-Publish call sites in tests with meaningful notes, never historical fixture backfills.

### 2. Historical clone compatibility

**Modify:** removal path only in `canonicalScheduleCommands.ts`; no Governance grant or Publish collector relaxation.

**Tests:** `canonicalScheduleCommands.spec.ts`, `canonicalScheduleCommandIntegration.spec.ts`, `scheduleReviewCommands.spec.ts`, `scheduleReviewTrace.spec.ts`.

- [x] Historical retired row absent from Current clones exactly; add/update/republication still reject with existing specific errors; no cross-Draft grant inheritance.
- [x] Removal-only repair deletes one row, permits sequential cleanup, preserves evidence/history and structural failure behavior; remove/re-add cannot resurrect retired identity. Repeated historical rows still obey existing Publish constraints.
- [x] Implement narrow removal repair and verify discard/publish closures and local-definition resolution remain unchanged.

### 3. History reads and presentation

**Modify:** `src/application/selectors/scheduleSelectors.ts`, `src/officialScheduleView.tsx`.

**Tests:** `scheduleSelectors.spec.ts`, `officialScheduleView.spec.tsx`.

- [x] Unordered v08/v10/v09 becomes descending history, only v10 Current; selecting v08 returns its exact values without mutating Current.
- [x] Cover empty/sparse history, missing selection, malformed owner, legacy notes/timestamps, retired definitions, local IDs and SSL/GL accessible labels. Historical view has Read-only heading and no editable controls.
- [x] Implement explicit history selectors and shared pure row projection; leave all official selector call sites on Current.

### 4. Workspace and both Publish entry points

**Modify:** `src/{main.tsx,scheduleWorkspace.tsx,governanceAdvancedTools.tsx}`; create `src/schedulePublishConfirmation.tsx`.

**Tests:** existing `scheduleWorkspace.spec.tsx`, `governanceAdvancedTools.spec.tsx`; create `schedulePublishConfirmation.spec.tsx` and `scheduleVersionHistory.runtime.spec.tsx`.

- [x] Test selector access while Draft exists, exact historical clone action, discard cancellation, explicit discard-before-retry, stale creation requests, Project switching and unapplied date protection.
- [x] Test required accessible Publish Note in both dialogs, warning in editing/confirmation, unknown base, single/gapped intervening history, warning alone does not block, failed Publish retains note, changed confirmation context cannot silently publish another Draft.
- [x] Wire explicit base and note callbacks; recompute owner/context at submission, show exact domain failures, and preserve fresh local DateOnly behavior.

### 5. Official-consumer and Batch 2 regression proof

**Tests to extend:** `src/application/selectors/{portfolioDashboardRows,dashboardAttention,projectMilestoneFollowUp}.spec.ts`, `src/application/governance/projectMilestoneRequirements.spec.ts`, `src/portfolioDashboardExport.runtime.spec.tsx`, and new history runtime spec.

- [x] With distinct v08/v10 values, selecting v08, creating/editing its Draft, and blocked Publish all leave official consumers on v10. Successful Publish v11 moves them together. Verify Follow-up applicable/N/A/pending semantics and single-sheet export content, not just labels.
- [x] Preserve Batch 2 future Actual today/past/future, N/A future, local midnight/month/year boundary assertions with a valid note; independently test blank note + future Actual. Preserve Project Type/duplicate review and SSL/GL coverage.
- [x] Mechanically supply valid notes to existing canonical new-Publish command/UI tests whose purpose is elsewhere: command integration/review, requirements, selectors, review trace, Governance/runtime characterization and Batch 2 runtime tests. Locate all callers with `rg`; keep exact pre-existing errors and RPT-01 expectations.

### 6. Verification and review

- [x] Run focused groups below, then full suite with a recorded successful exit, build and whitespace check. Review the combined dirty diff against both approved plans; also compare the feature-only changes against this planning baseline.
- [x] Audit remaining FCS hits, protected scope, configuration/dependencies and protected worktree; independently review the completed change when available. Do not delete recovery evidence or use restore/clean for build output under this plan's authorization.
- [x] Provide manual verification support for v08 to Draft to v11, conflict/discard, both Publish dialogs, legacy metadata, Governance cleanup and Current-only views. Automated runtime tests exercise these flows; live-browser human checks are listed in the final report, not claimed performed.

## Verification commands (future implementation only)

```powershell
npm run test:run -- src/domain/schedule/officialSchedule.spec.ts src/domain/schedule/canonicalScheduleWorkingDraft.spec.ts src/domain/schedule/scheduleValidation.spec.ts src/application/commands/canonicalScheduleCommands.spec.ts src/application/commands/canonicalScheduleCommandIntegration.spec.ts src/application/commands/scheduleReviewCommands.spec.ts src/application/selectors/scheduleReviewTrace.spec.ts --maxWorkers=1
npm run test:run -- src/application/selectors/scheduleSelectors.spec.ts src/officialScheduleView.spec.tsx src/scheduleWorkspace.spec.tsx src/schedulePublishConfirmation.spec.tsx src/scheduleVersionHistory.runtime.spec.tsx src/governanceAdvancedTools.spec.tsx --maxWorkers=1
npm run test:run -- src/application/selectors/portfolioDashboardRows.spec.ts src/application/selectors/dashboardAttention.spec.ts src/application/selectors/projectMilestoneFollowUp.spec.ts src/application/governance/projectMilestoneRequirements.spec.ts src/portfolioDashboardExport.runtime.spec.tsx src/projectMasterReport.spec.tsx src/projectMasterReport.runtime.spec.tsx src/userTrialFeedbackBatch2.runtime.spec.tsx src/userTrialFeedbackBatch2.staleReview.spec.tsx src/legacy/characterization --maxWorkers=1
npm run test:run -- --maxWorkers=1
npm run build
git diff --check
rg -n -i "fcs" src
git diff --stat
git status --short
git -C D:/011superpowers-schedule-user-trial status --short
git -C D:/011superpowers-schedule-user-trial rev-parse HEAD
```

Tests/build must exit 0; whitespace check must be silent/0. FCS hits require classification: stable IDs and raw/source evidence allowed, canonical presentation forbidden. A search exit of 1 means no hits, not a test failure. Build may emit tracked Vite artifacts as in Batch 2; inspect/report them and do not treat them as intentional feature changes or auto-restore them.

## Review focus and size

1. Retired/repeated historical occurrences: exact clone must not become new Governance authority (Task 2).
2. Stale selection, existing Draft and switched confirmation target: no replacement or wrong-Draft publication (Tasks 1/4).
3. Legacy absent metadata and non-ISO timestamp: readable without fabricated provenance (Tasks 1/3).
4. Blank/overlong note plus future Actual: independent specific blockers, zero mutation (Tasks 1/5).
5. Unsorted/gapped history and overflow: max numbering and official-view isolation (Tasks 1/4/5).

Estimated medium implementation: nine existing production files plus one small shared component; approximately 15–22 test files touched including mechanical note-call-site updates, and two new UI/runtime specs. Roughly 600–1,000 production lines changed/added and 700–1,200 test lines; estimate, not a scope target. No new service, persistence, migration job or report schema.

**Plan self-review:** All approved rules map to decisions/tasks above. The Governance removal-only reconciliation is explicit; no permission to broaden retention or republish otherwise ineligible historical rows. Numbering, traceability, stored note and official-read interfaces are separate. No production/test implementation or verification runs occurred in this planning phase.

**Implementation verified:** 2026-10-14. Focused: 33 files / 676 tests; full suite: 94 files / 1606 tests; both exit 0 with `--maxWorkers=1 --testTimeout=15000`. Build exit 0. Independent review: no P1/P2 findings; two minor stale-context coverage suggestions recorded in the recovery ledger. Evidence: `.superpowers/sdd/2026-10-14-schedule-version-history/`. No commits or integration actions.
