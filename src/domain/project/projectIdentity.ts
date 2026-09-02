export type ProjectIdentityAliasKind = "stnProjectName" | "qciModelName";

export interface ProjectIdentityAlias {
  readonly kind: ProjectIdentityAliasKind;
  readonly originalValue: string;
  readonly normalizedValue: string;
}
