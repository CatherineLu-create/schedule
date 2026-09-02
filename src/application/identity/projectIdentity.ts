import type {
  ProjectIdentityAlias,
  ProjectIdentityAliasKind,
} from "../../domain/project/projectIdentity";

export type {
  ProjectIdentityAlias,
  ProjectIdentityAliasKind,
} from "../../domain/project/projectIdentity";

export function normalizeProjectIdentityName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function projectIdentityNamesMatch(
  left: string | null,
  right: string | null,
): boolean {
  const normalizedLeft = normalizeProjectIdentityName(left ?? "");
  const normalizedRight = normalizeProjectIdentityName(right ?? "");

  return normalizedLeft.length > 0 && normalizedLeft === normalizedRight;
}

export interface CapturePreviousIdentityAliasInput {
  readonly aliases: readonly ProjectIdentityAlias[];
  readonly kind: ProjectIdentityAliasKind;
  readonly previousValue: string | null;
  readonly nextValue: string | null;
}

export function capturePreviousIdentityAlias({
  aliases,
  kind,
  previousValue,
  nextValue,
}: CapturePreviousIdentityAliasInput): readonly ProjectIdentityAlias[] {
  const originalValue = previousValue ?? "";
  const normalizedValue = normalizeProjectIdentityName(originalValue);
  const normalizedNextValue = normalizeProjectIdentityName(nextValue ?? "");

  if (
    normalizedValue.length === 0 ||
    normalizedValue === normalizedNextValue ||
    aliases.some(
      (alias) =>
        alias.kind === kind && alias.normalizedValue === normalizedValue,
    )
  ) {
    return aliases;
  }

  return [
    ...aliases,
    {
      kind,
      originalValue,
      normalizedValue,
    },
  ];
}
