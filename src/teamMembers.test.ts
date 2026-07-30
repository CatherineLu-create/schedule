import {
  addCustomField,
  createEmptyMember,
  defaultTeamMemberFields,
  deleteCustomField,
  deleteMember,
  fakeImportTeamMembers,
  normalizeImportedHeaders,
  teamMembersFromWorksheetRows,
  updateMemberValue,
  type TeamMembersState,
} from "./teamMembers";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const emptyState: TeamMembersState = {
  fields: [...defaultTeamMemberFields],
  members: [],
};

const imported = fakeImportTeamMembers(emptyState, "import");

assertEqual(imported.members.length, 3, "fake import adds imported team members");
assertEqual(imported.members[0].values.Name, "Catherine Lin", "fake import populates default fields");

const withManualMember = {
  ...imported,
  members: [...imported.members, createEmptyMember(imported.fields, "manual-1")],
};

assertEqual(withManualMember.members.length, 4, "manual member adds a row");

const edited = updateMemberValue(withManualMember, "manual-1", "Name", "Alex Chen");

assertEqual(edited.members[3].values.Name, "Alex Chen", "member values are editable");

const withCustomField = addCustomField(edited, "Location");

assert(withCustomField.fields.includes("Location"), "custom field is added as a column");
assertEqual(withCustomField.members[0].values.Location, "", "custom field is editable for imported members");

const customEdited = updateMemberValue(withCustomField, "import-1", "Location", "Taipei");

assertEqual(customEdited.members[0].values.Location, "Taipei", "custom field values can be edited");

const withoutCustomField = deleteCustomField(customEdited, "Location");

assert(!withoutCustomField.fields.includes("Location"), "custom field can be deleted");
assertEqual(withoutCustomField.members[0].values.Location, undefined, "custom field values are removed");

const defaultDeleteAttempt = deleteCustomField(withoutCustomField, "Email");

assert(defaultDeleteAttempt.fields.includes("Email"), "default fields cannot be deleted");

const deletedMember = deleteMember(defaultDeleteAttempt, "manual-1");

assertEqual(deletedMember.members.length, 3, "member can be deleted");

const normalizedHeaders = normalizeImportedHeaders(["Name", "", "Department", "Department", undefined]);

assertEqual(normalizedHeaders[0], "Name", "existing header is preserved");
assertEqual(normalizedHeaders[1], "Column 2", "blank header gets generated display name");
assertEqual(normalizedHeaders[2], "Department", "first duplicate keeps original display name");
assertEqual(normalizedHeaders[3], "Department 2", "duplicate header gets unique suffix");
assertEqual(normalizedHeaders[4], "Column 5", "undefined header gets generated display name");

const importedSheet = teamMembersFromWorksheetRows(
  [
    ["Name", "", "Department", "Department"],
    ["Alex Chen", "Taipei", "PM", "Schedule"],
    ["Mia Lin", "", "Engineering", "Hardware"],
  ],
  "sheet",
  "team.xlsx",
);

assertEqual(importedSheet.sourceFileName, "team.xlsx", "source file name is stored");
assertEqual(importedSheet.fields.length, 4, "all worksheet columns are retained");
assertEqual(importedSheet.fields[1], "Column 2", "blank imported header is retained as generated column");
assertEqual(importedSheet.fields[3], "Department 2", "duplicate imported header is retained as unique column");
assertEqual(importedSheet.members.length, 2, "all worksheet rows are retained");
assertEqual(importedSheet.members[0].values.Name, "Alex Chen", "imported cell value is preserved");
assertEqual(importedSheet.members[0].values["Column 2"], "Taipei", "blank-header column value is preserved");
assertEqual(importedSheet.members[0].values["Department 2"], "Schedule", "duplicate-header column value is preserved");

const cleanedImport = teamMembersFromWorksheetRows(
  [
    ["Name", " ", "Role", ""],
    [" ", "\n", "\t", ""],
    ["Alex", " ", "PM", ""],
    ["", "   ", "", ""],
    ["Mia", "", "", ""],
  ],
  "clean",
  "clean.xlsx",
);

assertEqual(cleanedImport.fields.length, 2, "completely blank worksheet columns are removed");
assertEqual(cleanedImport.fields[0], "Name", "nonblank first column remains");
assertEqual(cleanedImport.fields[1], "Role", "partially populated column remains");
assertEqual(cleanedImport.members.length, 2, "completely blank worksheet rows are removed");
assertEqual(cleanedImport.members[0].values.Name, "Alex", "remaining row value is preserved");
assertEqual(cleanedImport.members[1].values.Name, "Mia", "partially completed row remains visible");
