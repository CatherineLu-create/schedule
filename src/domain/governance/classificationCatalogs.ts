import type { MilestoneGovernanceDraft, GovernanceCommandFailureCode } from "./milestoneGovernance";
import type { ValidationIssue } from "../validation/validationIssue";
import { toMilestoneTypeId } from "../shared/ids";

/** System identities are invariant; release catalogs remain the runtime authority. */
export const protectedAutomaticAttentionTypeIds = Object.freeze([
  "type-g-o", "type-smt", "type-pre-build", "type-close",
].map(toMilestoneTypeId));

type Candidate = MilestoneGovernanceDraft["candidateRelease"];
export function validateClassificationCatalogs(candidate: Candidate, previous?: Candidate): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const block = (code: GovernanceCommandFailureCode, message: string, section: string, entityId?: string) => {
    issues.push({ code, domain: "governance", source: "data", severity: "blocking", message, target: { section, entityId } });
  };
  const arrayFields = ["stageGroups", "milestoneTypes", "selectableStageGroupIds", "selectableMilestoneTypeIds", "automaticAttentionTypeIds", "definitions",
    "addableDefinitionIds", "portfolioColumnDefinitionIds", "additionalAttentionDefinitionIds", "newProjectRequirementDefinitionIds"] as const;
  if (!candidate || arrayFields.some(field => !Array.isArray(candidate[field]))) {
    block("invalid-reference", "Classification catalogs and memberships must be arrays.", "classification");
    return issues;
  }
  if (candidate.definitions.some(definition => !definition || typeof definition.id !== "string" || typeof definition.name !== "string"
    || typeof definition.stageGroupId !== "string" || (definition.milestoneTypeId !== null && typeof definition.milestoneTypeId !== "string")
    || !Array.isArray(definition.aliases) || definition.aliases.some(alias => typeof alias !== "string"))) {
    block("invalid-reference", "Definitions require valid identity fields and alias arrays.", "definitions");
    return issues;
  }
  const namespace = new Set<string>();
  for (const [catalogField, selectableField] of [["stageGroups", "selectableStageGroupIds"], ["milestoneTypes", "selectableMilestoneTypeIds"]] as const) {
    const catalog = candidate[catalogField];
    const selectable: readonly string[] = candidate[selectableField];
    const ids = new Set<string>();
    const labels = new Set<string>();
    for (const item of catalog) {
      if (!item || typeof item.id !== "string" || !item.id.trim() || typeof item.displayName !== "string"
        || !item.displayName.trim() || item.displayName !== item.displayName.trim() || typeof item.active !== "boolean"
        || !["reviewed", "unreviewed"].includes(item.reviewStatus) || !Array.isArray(item.aliases)
        || item.aliases.some(alias => typeof alias !== "string")) {
        block("invalid-reference", "Classification records require valid IDs, trimmed labels and metadata.", catalogField);
        continue;
      }
      if (namespace.has(item.id) || candidate.definitions.some(definition => String(definition?.id) === item.id)) {
        block("duplicate-id", "Classification IDs must be unique and distinct from definition IDs.", catalogField, item.id);
      }
      namespace.add(item.id);
      ids.add(item.id);
      const label = item.displayName.toLocaleLowerCase();
      if (labels.has(label)) block("duplicate-label", "Classification labels must be distinct ignoring case.", catalogField, item.id);
      labels.add(label);
      if (selectable.includes(item.id) !== (item.active && item.reviewStatus === "reviewed")) {
        block("invalid-reference", "Selectable membership must match active reviewed classification metadata.", catalogField, item.id);
      }
    }
    if (new Set(selectable).size !== selectable.length || selectable.some(id => !ids.has(id))) {
      block("invalid-reference", "Selectable classifications must resolve uniquely.", selectableField);
    }
    if (previous) {
      const previousIds = previous[catalogField].map(item => item.id);
      if (previousIds.some((id, index) => catalog[index]?.id !== id)) {
        block("invalid-reference", "Historical classification IDs and order must remain unchanged.", catalogField);
      }
      for (const old of previous[catalogField]) {
        const item = catalog.find(entry => entry?.id === old.id);
        if (!item || item.displayName !== old.displayName || JSON.stringify(item.aliases) !== JSON.stringify(old.aliases)
          || item.reviewStatus !== old.reviewStatus || (!old.active && item.active)) {
          block("invalid-reference", "Historical classifications cannot be removed, renamed, reclassified or reactivated.", catalogField, old.id);
        }
      }
    }
  }
  if (candidate.automaticAttentionTypeIds.length !== protectedAutomaticAttentionTypeIds.length
    || protectedAutomaticAttentionTypeIds.some(id => !candidate.automaticAttentionTypeIds.includes(id)
      || !candidate.selectableMilestoneTypeIds.includes(id))) {
    block("protected-classification", "System automatic Types cannot be retired or changed to ordinary Types.", "automaticAttentionTypeIds");
  }
  return issues;
}
