import { cleanCellText, removeBlankRowsAndColumns } from "./worksheetImport";

export const defaultTeamMemberFields = ["Name", "Role", "Department", "Email"] as const;

export type DefaultTeamMemberField = (typeof defaultTeamMemberFields)[number];

export type TeamMember = {
  id: string;
  values: Record<string, string>;
};

export type TeamMembersState = {
  fields: string[];
  members: TeamMember[];
  sourceFileName?: string;
};

export const emptyTeamMembersState: TeamMembersState = {
  fields: [...defaultTeamMemberFields],
  members: [],
};

const fakeImportedRows: Array<Record<DefaultTeamMemberField, string>> = [
  {
    Name: "Catherine Lin",
    Role: "Project Manager",
    Department: "PM",
    Email: "catherine.lin@example.com",
  },
  {
    Name: "Eric Wang",
    Role: "Hardware Lead",
    Department: "Engineering",
    Email: "eric.wang@example.com",
  },
  {
    Name: "Mia Chen",
    Role: "Schedule Owner",
    Department: "Operations",
    Email: "mia.chen@example.com",
  },
];

function valuesForFields(fields: string[], values: Record<string, string> = {}) {
  return Object.fromEntries(fields.map((field) => [field, values[field] || ""]));
}

export function normalizeImportedHeaders(rawHeaders: unknown[]): string[] {
  const counts = new Map<string, number>();

  return rawHeaders.map((header, index) => {
    const baseHeader = cleanCellText(header) || `Column ${index + 1}`;
    const count = counts.get(baseHeader) || 0;

    counts.set(baseHeader, count + 1);

    return count === 0 ? baseHeader : `${baseHeader} ${count + 1}`;
  });
}

export function teamMembersFromWorksheetRows(
  rows: unknown[][],
  idPrefix: string,
  sourceFileName: string,
): TeamMembersState {
  const cleanedRows = removeBlankRowsAndColumns(rows);
  const headerRow = cleanedRows[0] || [];
  const fields = normalizeImportedHeaders(headerRow);
  const members = cleanedRows.slice(1).map((row, index) => ({
    id: `${idPrefix}-${index + 1}`,
    values: Object.fromEntries(fields.map((field, fieldIndex) => [field, cleanCellText(row[fieldIndex])])),
  }));

  return {
    fields,
    members,
    sourceFileName,
  };
}

export function createEmptyMember(fields: string[], id: string): TeamMember {
  return {
    id,
    values: valuesForFields(fields),
  };
}

export function fakeImportTeamMembers(state: TeamMembersState, idPrefix: string): TeamMembersState {
  const importedMembers = fakeImportedRows.map((row, index) => ({
    id: `${idPrefix}-${index + 1}`,
    values: valuesForFields(state.fields, row),
  }));

  return {
    ...state,
    members: [...state.members, ...importedMembers],
  };
}

export function updateMemberValue(
  state: TeamMembersState,
  memberId: string,
  field: string,
  value: string,
): TeamMembersState {
  return {
    ...state,
    members: state.members.map((member) =>
      member.id === memberId
        ? {
            ...member,
            values: {
              ...member.values,
              [field]: value,
            },
          }
        : member,
    ),
  };
}

export function deleteMember(state: TeamMembersState, memberId: string): TeamMembersState {
  return {
    ...state,
    members: state.members.filter((member) => member.id !== memberId),
  };
}

export function addCustomField(state: TeamMembersState, fieldName: string): TeamMembersState {
  const normalizedField = fieldName.trim();

  if (!normalizedField || state.fields.includes(normalizedField)) {
    return state;
  }

  return {
    fields: [...state.fields, normalizedField],
    members: state.members.map((member) => ({
      ...member,
      values: {
        ...member.values,
        [normalizedField]: "",
      },
    })),
  };
}

export function deleteCustomField(state: TeamMembersState, fieldName: string): TeamMembersState {
  if (defaultTeamMemberFields.includes(fieldName as DefaultTeamMemberField)) {
    return state;
  }

  return {
    fields: state.fields.filter((field) => field !== fieldName),
    members: state.members.map((member) => {
      const { [fieldName]: _removed, ...values } = member.values;

      return {
        ...member,
        values,
      };
    }),
  };
}
