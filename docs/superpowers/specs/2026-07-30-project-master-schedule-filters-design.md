# Project Master and Schedule Filters Design

## Scope

Implement only the requested Project Master field additions and Current Schedule filters. Keep all existing prototype behavior local to the browser and avoid backend, saved preferences, cross-project filtering, cross-version filtering, version comparison, or Project Master version history.

## Project Master

Extend the project form model with `year`, `customer`, and `productLine`. Add these fields to Create Project and Edit Project in a `Project Classification` section. Existing values are prefilled for edits, and saved values update both the workspace and dashboard immediately.

Project creation preserves user-entered classification values instead of replacing them with prototype defaults. Imported Excel projects already provide `year` and `productLine`; when customer is missing, the imported value remains the prototype default `"-"` and stays editable.

The Project Workspace Project Master section displays Year, Customer, and Product Line while keeping existing identity, hardware, internal identifier, and project management fields. Dashboard filters continue deriving options from the current project list so created or edited values update filter options. Dashboard export keeps Year, Customer, and Product Line.

## Schedule Filters

Add stable row IDs to schedule rows when the fake schedule data is loaded. Store warning metadata against row IDs and fields so filtering cannot move warning markers to another displayed row. Editing a filtered working-draft row updates the full draft schedule by row ID, resolves warning metadata by row ID, and publishing still publishes the full draft.

Add reusable schedule filter helpers for Phase, Stage, Milestone text, Plan From/To, Actual status, and Actual From/To. Filters combine with AND logic and apply only to the schedule data for the currently selected version or draft. Date filters parse practical date strings without changing displayed table values; rows with empty or invalid date values do not match active date boundaries.

Both published schedule view and working draft view render filter controls, active removable chips, Clear All, and a result count above the schedule table. Schedule chips are separate from Dashboard chips. Filter controls never mutate schedule data or create drafts.

## Testing

Add focused assertion coverage for preserving Project Master classification fields and for schedule filter logic, including AND behavior, result counts, empty-date exclusion, and row-ID-safe filtering. Run `npm run build` as final verification.
