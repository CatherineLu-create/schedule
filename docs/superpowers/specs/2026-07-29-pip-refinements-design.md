# PIP Prototype Refinements Design

## Scope

Implement only the requested Dashboard, Schedule, and Team Members refinements in the existing local React prototype. Keep the low-fidelity enterprise style and avoid backend, persistence, authentication, worksheet selection, formula support, formatting replication, or unrelated redesign.

## Dashboard

Move selected filter chips into the existing Filters header row, directly beside or immediately after the Filters title. Preserve individual chip removal, Clear All, and independence between Search Project and filter dropdowns. Remove the separate Current Filter Chips section and its subtitle.

Move the existing project-list Excel export action into the dashboard top-right action area before Create Project. Remove the lower dashboard Export Summary block so there is only one dashboard export button. Keep the current `exportDashboardProjectListToExcel` behavior.

## Schedule Warnings

Replace the hard-coded warning marker with schedule cell warning metadata stored in local version state. A warning belongs to a specific row and field. Editing a warning cell to a valid non-blank value resolves that warning in the working draft. Publish is blocked only when unresolved warnings remain.

Each published version stores its own schedule and warning state. Publishing a corrected draft creates a new version without resolved warning markers, while older versions keep their original warning markers when selected.

## Team Members Import

Use the existing browser-side `xlsx` dependency to read the first worksheet selected through the local file picker. Convert the worksheet to editable local prototype state with dynamic columns and rows. Preserve all imported headers, rows, and cell values as strings where practical.

Normalize header issues without dropping columns: blank headers become `Column N`, and duplicate display headers gain suffixes such as `Department 2`. Importing a new file replaces the current team member table only after a simple confirmation when data already exists. Show the selected file name for the active imported table.

Existing table editing remains available: edit cells, add rows, delete rows, add custom columns, and delete custom columns. Wide imported sheets continue using horizontal scrolling, and many rows use normal page flow.

## Testing

Add focused TypeScript assertion coverage for schedule warning resolution/version preservation and Team Members worksheet conversion/header normalization. Run `npm run build` as the final verification.
