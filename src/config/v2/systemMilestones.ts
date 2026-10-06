import { toMilestoneDefinitionId } from "../../domain/shared/ids";

/** Stable public identity: its stored FCS name and historical Type remain unchanged. */
export const systemMilestoneDefinitionIds = Object.freeze({
  sslGl: toMilestoneDefinitionId("milestone-ramp-fcs"),
});

/** System policy, independent of administrator additions and current addability. */
export const systemAutomaticAttentionDefinitionIds = Object.freeze([
  systemMilestoneDefinitionIds.sslGl,
]);
