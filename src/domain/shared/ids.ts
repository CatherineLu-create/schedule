declare const opaqueIdBrand: unique symbol;

type OpaqueId<TKind extends string> = string & {
  readonly [opaqueIdBrand]: TKind;
};

function requireId<TKind extends string>(value: string): OpaqueId<TKind> {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("ID must not be blank");
  }

  return value as OpaqueId<TKind>;
}

export type ProjectId = OpaqueId<"ProjectId">;
export type ScheduleVersionId = OpaqueId<"ScheduleVersionId">;
export type ScheduleDraftId = OpaqueId<"ScheduleDraftId">;
export type MilestoneDefinitionId = OpaqueId<"MilestoneDefinitionId">;
export type MilestoneId = OpaqueId<"MilestoneId">;
export type MilestoneRowId = OpaqueId<"MilestoneRowId">;
export type StageGroupId = OpaqueId<"StageGroupId">;
export type MilestoneTypeId = OpaqueId<"MilestoneTypeId">;
export type CatalogItemId = OpaqueId<"CatalogItemId">;
export type TeamTemplateId = OpaqueId<"TeamTemplateId">;
export type TeamFunctionId = OpaqueId<"TeamFunctionId">;
export type PersonAssignmentId = OpaqueId<"PersonAssignmentId">;

export const toProjectId = (value: string): ProjectId =>
  requireId<"ProjectId">(value);

export const toScheduleVersionId = (value: string): ScheduleVersionId =>
  requireId<"ScheduleVersionId">(value);

export const toScheduleDraftId = (value: string): ScheduleDraftId =>
  requireId<"ScheduleDraftId">(value);

export const toMilestoneDefinitionId = (
  value: string,
): MilestoneDefinitionId => requireId<"MilestoneDefinitionId">(value);

export const toMilestoneId = (value: string): MilestoneId =>
  requireId<"MilestoneId">(value);

export const toMilestoneRowId = (value: string): MilestoneRowId =>
  requireId<"MilestoneRowId">(value);

export const toStageGroupId = (value: string): StageGroupId =>
  requireId<"StageGroupId">(value);

export const toMilestoneTypeId = (value: string): MilestoneTypeId =>
  requireId<"MilestoneTypeId">(value);

export const toCatalogItemId = (value: string): CatalogItemId =>
  requireId<"CatalogItemId">(value);

export const toTeamTemplateId = (value: string): TeamTemplateId =>
  requireId<"TeamTemplateId">(value);

export const toTeamFunctionId = (value: string): TeamFunctionId =>
  requireId<"TeamFunctionId">(value);

export const toPersonAssignmentId = (value: string): PersonAssignmentId =>
  requireId<"PersonAssignmentId">(value);
