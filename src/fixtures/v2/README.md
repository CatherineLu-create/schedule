# V2 Development Fixture Contract

## Authority and purpose

All Project, Schedule, Team, person, date, CPU/GPU, customer, and project-name
values currently stored in this repository are development or test fixtures
only. This includes current JSON files, Excel workbooks, historical names, and
anonymous aliases. None of these values represents production-authoritative
data.

The authoritative inputs for V2 are the approved schema, field definitions,
data types, Project/Schedule/Team relationships, catalog definitions,
business and validation rules, Save/Publish behavior, Dashboard behavior,
export behavior, and global UX rules.

V2 development does not require a production or 2027 project dataset. Existing
Excel and JSON data may be reused only when useful as development fixture or
adapter test material. Business rules must not be inferred from those values.

## Canonical fixture strategy

The canonical V2 development fixture will be a small, scenario-driven set of
Project aggregates. It is designed to exercise approved behavior, not to
simulate or claim to represent company production data. Synthetic values must
be visibly marked as development data, for example with `DEV` display names
and `example.test` email addresses.

Stable immutable internal IDs are mandatory for Projects and catalog records.
IDs must not be derived from display names, normalized names, or array
positions. Projects with duplicate or similar display names remain independent
records and must never be merged automatically.

The planned five-Project matrix is:

1. A Project with no Published Schedule, no Working Draft, and no Saved Team.
2. A Project with one Published version covering completed, Not Applicable,
   coming-soon, overdue, and MDRR attention cases, plus a valid Saved Team.
3. A different Project with the same Year/Product Line/STN Project Name
   combination, multiple Published versions, a future Actual advisory, and an
   older applied Team Template.
4. A Project with official Published data and a separate Working Draft holding
   unmapped, invalid-date, and ambiguous-date import findings. Portfolio values
   must continue to come from the Published version.
5. A punctuation-sensitive identity case with Team missing-Owner advisory,
   a project-specific Custom Function, and the remaining Team Template/update
   coverage.

The set will vary Year, Customer, and Status values and use relative dates from
an injected `today` value so attention scenarios remain deterministic in tests.

## Schedule fixture rules

`ScheduleWorkingDraft.basePublishedVersionId` is
`ScheduleVersionId | null`. A first-ever Working Draft uses `null`; publishing
it creates Published v1. A normal edit Draft for a Project with existing
Published versions must use the latest Published version as its base. Fixtures
must not create a fake v0 or seed a fake Published version.

Working Draft values are not official Portfolio values. Draft/import Blocking
metadata may support a Dashboard Blocking Issues summary, but that summary must
not expose unpublished milestone or date values. Navigation does not discard a
Working Draft; only an explicit discard operation does so.

Invalid, ambiguous, conflicting, or unmapped Schedule cases belong in Working
Draft/import candidate fixtures. They must never be seeded as Published
official data.

## Milestone catalog seeds

The approved 34 Portfolio Milestone definitions are authoritative V2 catalog
seeds. Each has a stable catalog ID and `showInPortfolio = true`; Project
fixtures do not need to contain values for every definition.

MDRR is an additional valid Milestone Catalog item with:

- Milestone Type: `MDRR`
- Stage / Group: `MDRR`
- `showInPortfolio = false`
- participation in Milestone Due and Overdue calculations

This MDRR definition is a deliberate V2 development catalog decision and is
not inferred from legacy fixture data.

## Applicability and candidate data

Only explicit `NA` or `N/A` input means Not Applicable. Legacy `-` and `*`
symbols are not N/A and must remain raw unresolved fixture/import values until
reviewed. Not Applicable is an explicit applicability state, never a fake date.

Blocking Team candidates such as multiple Owners or an N/A Function containing
people must remain edit/import candidate data. They must not be seeded as a
Saved Team. Likewise, invalid Schedule import candidates must not be seeded as
a Published Schedule. Advisory Saved states, such as an Applicable Function
without an Owner, may be included where the approved rules allow Save.

## Legacy source disposition

Current Dashboard JSON, Schedule JSON, Excel workbooks, Team data embedded in
the current UI, and historical fixture names remain legacy development
material while the current UI still depends on them. They are not inputs to
the canonical V2 aggregate seed and must not be maintained as a second
independent V2 Project dataset.

Typed fixture modules are intentionally deferred until the V2 domain IDs,
date-only type, Project aggregate, and PrototypeState contracts are available.
