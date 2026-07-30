# Schedule Visual State Design

## Scope

Implement only the Current Schedule visual-state changes and Dashboard subtitle change. Keep existing schedule editing, filtering, warning resolution, versioning, publishing, and Dashboard behavior unchanged.

## Schedule Filters

Remove the Actual Status filter completely from schedule filter state, filtering logic, chips, tests, and UI. Keep Phase, Stage, Milestone, Plan From, Plan To, Actual From, and Actual To filters unchanged.

## Schedule Row Visual State

Derive gray row styling directly from each row's current Actual value. Do not store a separate completed flag and do not modify the Actual value for styling.

A row is gray when Actual contains a recognizable date or when the complete trimmed Actual value is `-`, `NA`, or `N/A`, case-insensitive. Empty values, `TBC`, `TBD`, invalid text, and unresolved warning-like text remain normal.

Apply readable medium gray text to the whole row in published and working draft schedule tables. Warning indicators remain visible, and warning styling takes priority for warning cells.

## Dashboard Subtitle

Render a compact muted `Dashboard` subtitle directly under the existing `Project Information` title.

## Testing

Update schedule filter tests to remove Actual Status coverage and add row-state assertions. Run `npm run build`.
