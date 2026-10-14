import { systemMilestoneDefinitionIds } from "../config/v2/systemMilestones";
import type { MilestoneDefinition } from "../domain/schedule/milestoneCatalog";

/** Presentation only; never replace a definition used by commands or resolution. */
export function milestoneDefinitionDisplayName(definition: Pick<MilestoneDefinition, "id" | "name">): string {
  return definition.id === systemMilestoneDefinitionIds.sslGl ? "SSL/GL" : canonicalMilestoneLabel(definition.name);
}

// Whole-label terminology alias only; this never confers system identity or Attention eligibility.
function canonicalMilestoneLabel(label: string): string {
  return label.trim().toLowerCase() === "fcs" ? "SSL/GL" : label;
}
export function milestoneClassificationDisplayName(item: { readonly id: string; readonly displayName: string } | undefined): string | undefined {
  return item === undefined ? undefined : item.id === "type-fcs" ? "SSL/GL" : canonicalMilestoneLabel(item.displayName);
}
