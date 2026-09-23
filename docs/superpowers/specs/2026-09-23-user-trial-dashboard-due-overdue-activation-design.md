# PIP V2 User Trial — Dashboard Due / Overdue Activation Design

**Status:** Approved for implementation

**Date:** 2026-09-23

**Baseline:** `74e93752b563aa71f68686c22320a8edbc705b71` (`chore: configure user trial deployment`)

## 1. Problem and reason for change

The current Dashboard presents `Blocking Issues`, `Milestone Due`, and
`Overdue` cards, but all three intentionally show an em dash and state that
calculation is not active. The User Trial now requires Due and Overdue to be
real canonical calculations so representative Published Schedule data can be
evaluated through the same path as ordinary Projects.

This is a deliberate new behavior. It is not activation of dormant or unwired
code: no Due/Overdue selector currently exists.

## 2. Historical behavior and supersession

Task 2.2 intentionally excluded Milestone Due and Needs Attention activation.
The V2.2 Dashboard design later required truthful inactive placeholders, and
Task 2.3 preserved that behavior while adding the Working Draft/Publish
lifecycle.

This specification supersedes only the inactive behavior of the `Milestone
Due` and `Overdue` cards. It does not rewrite those earlier decisions or alter
their other architecture, authority, lifecycle, identity, or isolation rules.
In particular:

- `Project.team` remains saved Team authority.
- `PrototypeState.schedules` remains Schedule authority.
- Current Published Schedule remains official Schedule truth.
- Working Draft remains unpublished editable state.
- Dashboard remains a derived read-only Portfolio view.

The `Blocking Issues` card remains inactive and unchanged by this feature.

Historical specifications retained as the record of the approved deferred
behavior:

- `docs/superpowers/specs/2026-09-10-task-2.2-schedule-official-read-runtime-migration-design.md`
- `docs/superpowers/specs/2026-09-12-pip-v2.2-dashboard-canonical-portfolio-design.md`
- `docs/superpowers/specs/2026-09-11-task-2.3-schedule-working-draft-publish-lifecycle-design.md`

## 3. Scope and non-goals

Change 1A covers one canonical Due/Overdue read model, runtime reference-date
wiring, and replacement of the two inactive card values with calculated unique
Project counts.

It does not include:

- User Trial Demo Seed or Change 1B;
- new Project or Schedule schema fields;
- stored Due/Overdue flags or a Dashboard data store;
- Team, Schedule editing, or Publish lifecycle changes;
- Project Master Mechanical, Cover, Leverage, genealogy, or root-leverage work;
- backend, database, persistence, authentication, or permissions;
- notifications, email, risk scoring, or severity ranking;
- configurable windows or user-specific rules;
- a drill-down UI;
- changes to the Milestone Type catalog items; or
- Current Stage, Dashboard MDRR-summary, or Blocking Issues derivation.

## 4. Canonical data sources and flow

The calculation consumes `PrototypeState` and an explicit `DateOnly`
`referenceDate`. It iterates canonical Projects and reads each Project's
Schedule through `selectCurrentPublishedSchedule(state, projectId)`.

```text
PrototypeState.projects + PrototypeState.schedules + referenceDate
                         |
                         v
          selectCurrentPublishedSchedule(ProjectId)
                         |
                  Current Published only
                         |
                         v
             Dashboard attention read model
                         |
                         v
              Due / Overdue card counts
```

The selector uses the raw canonical milestone values from the selected
Published version. It does not calculate from formatted Portfolio cells,
legacy data, Project names, Working Draft, import candidates, or UI state.

A legal no-Published Schedule or a Published version with zero milestones
contributes no matches. An unavailable canonical Schedule read makes the
portfolio attention result unavailable rather than silently producing an
incomplete numeric count. This does not activate or populate `Blocking Issues`.

## 5. Canonical Due and Overdue rules

Eligibility is determined by stable `MilestoneTypeId`, resolved from each
milestone's canonical `milestoneDefinitionId`. Display names are not business
identity.

Only the existing types with these stable IDs participate:

- `G/O`: `type-g-o`;
- `SMT`: `type-smt`;
- `Close`: `type-close`; and
- `MDRR`: `type-mdrr`.

Implementation may expose a readonly configuration set containing those four
existing IDs from `src/config/v2/referenceData.ts`, but must not create, rename,
or otherwise alter Milestone Type catalog items. Eligibility is independent of
`showInPortfolio`; therefore MDRR participates even though its definition is
not a Portfolio Schedule column.

Let `dueThrough = addDays(referenceDate, 14)`.

A Published milestone is **Due** when all are true:

1. `applicability === "applicable"`;
2. `plan !== null`;
3. `actual === null`;
4. its Milestone Type is one of the four participating types; and
5. `referenceDate <= plan <= dueThrough`.

A Published milestone is **Overdue** when all are true:

1. `applicability === "applicable"`;
2. `plan !== null`;
3. `actual === null`;
4. its Milestone Type is one of the four participating types; and
5. `plan < referenceDate`.

The ranges are mutually exclusive. A populated Actual, missing Plan,
`notApplicable` milestone, or non-participating type is neither Due nor
Overdue.

## 6. Unique Project counting

Card values count unique Projects, not milestones.

- A Project with two Due milestones contributes one Due Project ID and `+1`
  to the Due count.
- A Project with two Overdue milestones contributes one Overdue Project ID and
  `+1` to the Overdue count.
- A Project with at least one Due milestone and at least one Overdue milestone
  contributes once to each independent set.

`dueProjectCount` is exactly `dueProjectIds.length`, and
`overdueProjectCount` is exactly `overdueProjectIds.length`. Project ID arrays
contain no duplicates and retain canonical `state.projects` order. Match
details retain Project order and Current Published snapshot order.

Counts are portfolio-wide. Dashboard Search and Filters affect the Project
table only and do not change attention counts.

## 7. Reference-date semantics

The selector accepts `referenceDate: DateOnly`; it has no `Date.now()` or
implicit clock dependency. Automated tests pass fixed parsed values such as
`2026-09-23`.

The calculation reuses:

- `compareDateOnly()` for inclusive/exclusive calendar comparisons; and
- `addDays()` for the inclusive fourteen-day endpoint.

Runtime derives the reference date once at the application composition
boundary from the user's current local calendar year, month, and day. Because
the repository has no Date-to-DateOnly helper today, implementation may add a
small shared conversion helper beside the existing DateOnly functions. It must
use local `getFullYear()`, `getMonth()`, and `getDate()` components and validate
the resulting `YYYY-MM-DD` value. It must not derive the date by slicing a UTC
ISO timestamp.

The runtime reference date is an application-session snapshot. Automatic
midnight refresh is outside Change 1A; a page reload establishes the new local
calendar date.

## 8. Published-only and Working Draft isolation

The attention selector calls only the existing Current Published read path and
never reads `schedule.workingDraft`.

- If Published does not qualify but Working Draft changes Plan so it would
  qualify, Dashboard remains unchanged.
- If Published qualifies but Working Draft changes or completes the milestone
  so it would not qualify, Dashboard continues to reflect Published.
- A successful Publish appends a new Published version and clears the Draft
  through the existing lifecycle. On the resulting state, the existing
  maximum-version Current Published selector supplies the newly published
  snapshot, and attention is recalculated from it.
- Cancel, edit, malformed Draft recovery, and Draft navigation do not change
  attention until a successful Publish changes Current Published truth.

## 9. Proposed selector and read-model contract

The exact module name may follow the existing selector naming convention, but
the public behavior is one pure selector:

```ts
interface DashboardAttentionMatch {
  readonly projectId: ProjectId;
  readonly milestoneId: MilestoneId;
  readonly milestoneDefinitionId: MilestoneDefinitionId;
  readonly plan: DateOnly;
}

interface DashboardAttentionGroup {
  readonly projectIds: readonly ProjectId[];
  readonly projectCount: number;
  readonly matches: readonly DashboardAttentionMatch[];
}

type DashboardAttentionRead =
  | {
      readonly kind: "available";
      readonly referenceDate: DateOnly;
      readonly due: DashboardAttentionGroup;
      readonly overdue: DashboardAttentionGroup;
    }
  | {
      readonly kind: "unavailable";
      readonly referenceDate: DateOnly;
      readonly issues: readonly ValidationIssue[];
    };

function selectDashboardAttention(
  state: PrototypeState,
  referenceDate: DateOnly,
): DashboardAttentionRead;
```

The match arrays preserve enough canonical identity and Plan detail for a
future separately approved drill-down without storing calculated authority or
copying Project/Schedule data into a new model. Change 1A renders counts only.

If any Project's Current Published read is `unavailable`, the selector returns
`unavailable` with those existing issues. `noPublishedSchedule` is healthy and
does not make the result unavailable.

## 10. Dashboard presentation

The current visual order and three-card structure remain:

1. `Blocking Issues`;
2. `Milestone Due`;
3. `Overdue`.

For an available attention read:

| Card | Value | Supporting text |
| --- | --- | --- |
| Blocking Issues | `—` | `Calculation not active` |
| Milestone Due | numeric unique Project count | `Next 14 days · unique projects` |
| Overdue | numeric unique Project count | `Past due · unique projects` |

Zero qualifying Projects displays numeric `0`, because the calculation is
active. The section microcopy becomes:
`Due and Overdue use Current Published Schedule.`

For an unavailable attention read, Due and Overdue display `—` with
`Calculation unavailable`; they must not display an incomplete count or `0`.
Blocking Issues remains unchanged. Search and filters do not affect the cards.

The view receives the derived attention read as input. It does not receive
PrototypeState, perform Schedule lookup, duplicate date rules, or special-case
Demo Projects.

## 11. Acceptance scenarios

Unless stated otherwise, milestones are applicable, have blank Actual, use a
participating type, and belong to Current Published Schedule.

| # | Scenario | Expected result |
| --- | --- | --- |
| 1 | Plan = `referenceDate` | Due |
| 2 | Plan = `referenceDate + 14 days` | Due |
| 3 | Plan = `referenceDate + 15 days` | Neither |
| 4 | Plan = `referenceDate - 1 day` | Overdue |
| 5 | Past Plan and populated Actual | Neither |
| 6 | Plan is blank | Neither |
| 7 | Milestone is Not Applicable | Neither |
| 8 | Non-participating type within the Due window | Neither |
| 9 | One Project has two Due milestones | Due Project contribution is 1; both milestone matches are retained in Current Published snapshot order |
| 10 | One Project has one Due and one Overdue milestone | Contribution is 1 to each card |
| 11 | Working Draft qualification differs from Published | Dashboard follows Published only in both directions |
| 12 | Successful Publish changes Current Published | Dashboard derives from the newly Current Published version |
| 13 | No Projects qualify and all reads are available | Both active cards display numeric 0 |

Additional integrity cases:

- no-Published and Published-empty Projects contribute no matches;
- unresolved/malformed Published data follows the existing unavailable read
  path and does not produce a partial portfolio count;
- repeated milestones never duplicate a Project ID within one card; and
- search/filter changes leave the portfolio-wide counts unchanged.

## 12. Test strategy for the later implementation phase

No tests change during this specification phase. The implementation phase must
use fixed DateOnly fixtures and cover:

1. focused selector tests for all thirteen acceptance scenarios;
2. exact stable type-ID participation, including MDRR despite
   `showInPortfolio === false`;
3. match detail plus unique Project order and deduplication;
4. healthy no-Published/empty-Published behavior and unavailable-read behavior;
5. two-way Working Draft isolation using otherwise identical Published state;
6. a Publish integration test proving the new Current Published version becomes
   the input without adding Publish behavior to the selector;
7. component tests for positive counts, zero, unavailable presentation, fixed
   card order, unchanged Blocking Issues, and filter independence;
8. runtime wiring with an explicitly fixed reference date; and
9. unchanged non-attention Dashboard, Project, Schedule, Team, export, and
   lifecycle regressions, followed by the full suite and production build.

Tests must exercise the public selector/read model rather than duplicate its
date predicates in test helpers.

## 13. Documentation migration notes

The historical Task 2.2, V2.2 Dashboard, and Task 2.3 designs remain unchanged
as records of their approved scopes. This new document is the explicit later
authorization that supersedes only their inactive Due/Overdue behavior.

After implementation approval, the implementation change must update:

- `src/portfolioDashboardView.spec.tsx`, which currently prohibits numeric
  attention values;
- `src/legacy/characterization/runtime.spec.tsx`, which currently enforces the
  inactive cards;
- the current Dashboard behavior description in `README.md`;
- `src/fixtures/v2/README.md`, which currently says Due/Overdue is inactive;
  and
- any current verification checklist that asserts the two cards remain `—`.

Those follow-up edits must describe the transition, not alter historical specs
to claim that activation existed earlier.

## 14. Implementation boundaries

The later implementation is limited to:

- a pure canonical attention selector/read model and focused tests;
- stable configuration of the four existing participating Milestone Type IDs;
- local-calendar-to-DateOnly conversion at the runtime boundary if required;
- App composition that passes the explicit reference date and derived read to
  the Dashboard view;
- the two active card presentations and truthful section microcopy; and
- directly affected documentation and regression expectations.

It must not refactor unrelated Portfolio row projection, change canonical
entities, add persistence, or couple the attention selector to User Trial Demo
Seed.

## 15. Risks and edge cases

- **Timezone drift:** converting through UTC can select the wrong local day.
  Runtime conversion must use local calendar components; selector logic remains
  DateOnly-only.
- **False zero from corrupt data:** skipping unavailable Schedule reads would
  undercount. The read-model union makes incomplete calculation explicit.
- **MDRR omission:** filtering by `showInPortfolio` would incorrectly exclude
  MDRR. Eligibility uses Milestone Type ID only.
- **Label identity:** matching `"G/O"`, `"SMT"`, `"Close"`, or `"MDRR"` strings
  would make display text authoritative. Only stable IDs participate.
- **Milestone overcount:** counts derived from match length would overcount a
  Project with multiple qualifying milestones. Counts derive only from unique
  Project ID arrays.
- **Draft leakage:** reading `workingDraft` directly or projecting from editable
  rows would violate official truth. Tests cover both directions of divergence.
- **Filter coupling:** deriving from filtered rows would make counts change with
  presentation state. Attention derives from canonical state before UI filters.
- **Date upper bound:** `addDays(referenceDate, 14)` retains the existing
  DateOnly helper's supported-range behavior; the selector must not substitute
  timestamp arithmetic.
- **Long-lived session:** the load-time reference-date snapshot does not roll at
  midnight. Automatic refresh is a separate behavior and remains out of scope.

## 16. Review and approval gate

This document authorizes no implementation by itself while its status remains
Draft. After spec review and explicit human approval, an implementation plan
may be prepared as a separate phase. Change 1B and User Trial Demo Seed remain
blocked until Change 1A implementation is separately authorized and completed.
