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

The canonical V2 development fixtures are separate, scenario-driven
collections of five Projects and five Project-owned Schedules. They exercise
approved behavior rather than simulate or claim to represent company
production data. Synthetic values must be visibly marked as development data,
for example with `DEV` display names and `example.test` email addresses.

Stable immutable internal IDs are mandatory for Projects and catalog records.
IDs must not be derived from display names, normalized names, or array
positions. Projects with duplicate or similar display names remain independent
records and must never be merged automatically.

The canonical fixture ownership matrix is:

| ProjectId | Project | Published Schedule | workingDraft |
| --- | --- | --- | --- |
| dev-project-001 | Manta | Published v1; four demo milestones | null |
| dev-project-002 | Nautilus | No Published Schedule | null |
| dev-project-003 | Orca | No Published Schedule | null |
| dev-project-004 | Beluga | No Published Schedule | null |
| dev-project-005 | Marlin | No Published Schedule | null |

Every Project has one canonical Schedule container for its exact immutable
`ProjectId`. Manta alone has the accepted Published demo Schedule; Nautilus,
Orca, Beluga, and Marlin each have an existing empty Schedule container with no
Published version. The set also varies Year, Customer, Status, Team, identity,
and Project Master scenarios.

Draft edge cases and non-contiguous or multiple Published-version scenarios use
local test builders. They are not canonical runtime fixture topology.

## User Trial Demo Seed

The moving-date User Trial records are isolated from the fixed canonical
fixtures. `createUserTrialDemoSeed(referenceDate)` owns only four DEMO Projects
and their four Published Schedule containers. The browser bootstrap captures
one local-calendar `DateOnly` reference date and merges those returned Project
and Schedule collections with `canonicalProjectFixtures` and
`canonicalScheduleFixtures` without mutating either baseline.

Demo Projects use the same Project, Schedule, Search, Workspace, and Current
Published Schedule paths as every other Project. Dashboard attention remains a
derived read through `selectDashboardAttention()`; the seed does not store or
special-case Due or Overdue results. Tests pass a fixed reference date so the
demo seed is deterministic, while only the browser bootstrap supplies the
runtime-relative date.

## Canonical Schedule fixture rules

`canonicalProjectFixtures.ts` owns Project/Master and Team fixture values only.
`canonicalScheduleFixtures.ts` explicitly owns one canonical Schedule container
for each fixture Project by its exact immutable `ProjectId`; it is not derived
from Project values or legacy Schedule data. Published versions use positive
version numbers and canonical milestone lineage IDs. A Schedule with no
Published versions is an existing empty Schedule, not a missing resource or
fake v0.

Every canonical Schedule fixture carries an explicit `workingDraft: null`.
Task 2.3 seeds no production Working Draft scenario: Manta alone retains its
accepted Published demo Schedule, while Nautilus, Orca, Beluga, and Marlin
remain existing Schedule containers with no Published versions. Working Draft
validation scenarios stay in local test builders, and predecessor candidate
fixtures remain disconnected from canonical runtime authority.

## Disconnected predecessor Schedule fixtures

`ScheduleWorkingDraft.basePublishedVersionId` is
`ScheduleVersionId | null`. A first-ever Working Draft uses `null`; publishing
it creates Published v1. A normal edit Draft for a Project with existing
Published versions must use the latest Published version as its base. Fixtures
must not create a fake v0 or seed a fake Published version.

Working Draft and import-candidate values remain disconnected predecessor test
data. They are not canonical runtime authority or official Portfolio values.
Navigation does not discard a predecessor Working Draft; only its explicit
predecessor discard operation does so.

Invalid, ambiguous, conflicting, or unmapped Schedule cases belong in Working
Draft/import candidate fixtures. They must never be seeded as Published
official data.

## Milestone catalog seeds

As defined in the [Task 2.3 Human Acceptance Corrections design
addendum](../../../docs/superpowers/specs/2026-09-17-task-2.3-human-acceptance-corrections-design.md),
PIP definitions in `src/config/v2/referenceData.ts` own stable
`MilestoneDefinitionId` values, classification, and display order. Each
definition provides its ID, name, `stageGroupId`, `milestoneTypeId`, and
`displayOrder`; `stageGroupCatalog` supplies the Stage label for a stable
`StageGroupId`. Active/review metadata, aliases, and `showInPortfolio` retain
their catalog meanings in `src/domain/schedule/milestoneCatalog.ts`.

Published Schedule is Official Truth. A Project with no Published Schedule has
a legal empty state, not a Published official version. A Working Draft is
canonical unpublished state; only explicit successful Publish changes Current
Schedule and Portfolio. Draft edits and Publish do not mutate the Milestone
Definition catalog.

The active milestone catalog contains 30 ordered definitions: two Design, four
ME Portion, one Thermal, four A1, six C1, six C2, six RAMP, and MDRR.
Twenty-nine are normal exact-definition Portfolio definitions; MDRR remains the
explicit historical presentation exception below. The complete validation
catalog also retains six compatibility-only definitions with stable IDs so
sparse historical Published and Draft occurrences remain resolvable.
Compatibility-only definitions are inactive, Portfolio-hidden, and unavailable
as normal Add choices.

Starting a Working Draft clones Current Published occurrences exactly, or stays
empty when no Published Schedule exists. It preserves compatibility-only and
repeated history without synthesizing missing active definitions. Users add
absent active definitions through Select Milestone / Add Milestone. Canonical
and User Trial Demo Published snapshots remain intentionally sparse.

The bundled Portfolio Schedule schema starts with 30 exact-definition columns;
runtime membership comes from the current published Governance release.
C1/C2 reuse their stable Main Build definition IDs with the `System Build`
presentation and `type-system-build`; RAMP Main Build remains
`type-main-build`. Automatic Attention uses G/O, SMT, Pre-Build and Close Type
IDs plus the exact `milestone-ramp-fcs` system definition (stored name FCS,
display SSL/GL), unioned with released additional Attention definition IDs.
MDRR is not automatically eligible. Draft governance changes do not affect
these consumers. No real Kevin parser or persistence is implemented.

MDRR is an additional valid Milestone Catalog item with:

- Milestone Type: `MDRR`
- Stage / Group: `MDRR`
- `showInPortfolio = false`

This MDRR definition is a deliberate V2 development catalog decision and is
not inferred from legacy fixture data. The User Trial Portfolio explicitly
projects this definition into its already-existing MDRR column from Current
Published Schedule while retaining `showInPortfolio = false` as historical
catalog metadata. This presentation exception does not change catalog or
Schedule authority. Its stable `type-mdrr` identity remains resolvable for
history; MDRR enters Dashboard Upcoming and Overdue only when its exact
definition ID is included in released additional Attention membership.

Workspace Add selects a released public or confirmed same-Project local
`MilestoneDefinitionId` and explicitly adds an occurrence. The separate English
Project-specific editor creates only a local definition, using a currently
selectable released Stage and optional Type (null means No Type). Stage/Type
Add and Retire are governed; legacy classifications remain resolvable.

Governance provides explicit local-to-public mapping and four independent
built-in simulation scenarios through `governanceSimulationFixtures.ts`:
`basic-success`, `fixable-validation`, `retired-existing-update`, and
`retired-no-reference-negative`. Evidence and review candidates remain
unpublished until legal explicit confirmation and Schedule Publish. Mapping
requires four equivalence assertions and never follows names automatically.
The fixed disclosure is “模擬匯入資料｜供 PIP 流程驗收，非 Kevin 正式 JSON 格式”.
Real Kevin format and import UX remain deferred until formal data is available;
these fixtures make no file-ingress or format-compatibility claim.

## Applicability and candidate data

Only explicit `NA` or `N/A` input means Not Applicable. Legacy `-`, `*`, and
combined raw `-/*` tokens are not N/A and must remain unresolved fixture/import
values until reviewed. Not Applicable is an explicit applicability state,
never a fake date.

Blocking Team candidates such as multiple Owners or an N/A Function containing
people must remain edit/import candidate data. They must not be seeded as a
Saved Team. Likewise, invalid Schedule import candidates must not be seeded as
a Published Schedule. Advisory Saved states, such as an Applicable Function
without an Owner, may be included where the approved rules allow Save.

## Legacy source disposition

Current Dashboard JSON, Schedule JSON, Excel workbooks, Team data embedded in
the historical UI, and historical fixture names remain legacy development
material where retained in the repository. The current V2 main, Portfolio, and
canonical fixture paths do not import them as runtime data. They are not inputs
to the canonical V2 aggregate seed and must not be maintained as a second
independent V2 Project dataset.

Typed fixture modules provide reusable V2 reference, Team Template, Team,
canonical Schedule, and disconnected Schedule candidate values.
`canonicalProjectFixtures.ts` assembles the five canonical Project/Master and
Team values; `canonicalScheduleFixtures.ts` separately assembles their five
canonical Schedule resources. Invalid Team and predecessor Schedule candidate
fixtures remain separate from saved canonical data.
