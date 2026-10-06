import { systemMilestoneDefinitionIds } from "../config/v2/systemMilestones";
import type { MilestoneDefinition } from "../domain/schedule/milestoneCatalog";

/** Presentation only; never replace a definition used by commands or resolution. */
export function milestoneDefinitionDisplayName(definition: Pick<MilestoneDefinition, "id" | "name">): string {
  return definition.id === systemMilestoneDefinitionIds.sslGl ? "SSL/GL" : definition.name;
}
