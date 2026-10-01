import { milestoneTypeCatalog, stageGroupCatalog } from "../../config/v2/referenceData";
import type { CommandResult } from "../../domain/governance/milestoneGovernance";
import type { CanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import type { ConfirmProjectLocalMilestoneDefinitionInput, ScheduleReviewFailureCode } from "../../domain/schedule/scheduleReview";
import type { EffectiveMilestoneGovernanceContext } from "../governance/effectiveMilestoneGovernanceContext";

export function confirmProjectLocalMilestoneDefinition(
  schedule: CanonicalProjectSchedule,
  input: ConfirmProjectLocalMilestoneDefinitionInput,
  context: EffectiveMilestoneGovernanceContext,
): CommandResult<CanonicalProjectSchedule, ScheduleReviewFailureCode> {
  const failure = (
    code: "id-collision" | "invalid-local-classification",
    field: keyof ConfirmProjectLocalMilestoneDefinitionInput | "displayOrder",
    message: string,
  ): CommandResult<CanonicalProjectSchedule, ScheduleReviewFailureCode> => ({
    ok: false,
    code,
    issues: [{
      code: `schedule.local-definition.${code}`,
      domain: "schedule", source: "data", severity: "blocking", message,
      target: { section: "schedule.localDefinitions", entityId: input.definitionId, field },
    }],
  });

  if (typeof input.definitionId !== "string" || !input.definitionId.trim()
    || schedule.localDefinitions.some(definition => definition.id === input.definitionId)
    || context.definitionsForHistoricalResolution.some(definition => definition.id === input.definitionId)) {
    return failure("id-collision", "definitionId", "A nonempty injected local definition ID must be distinct from same-Project local and all public historical definition IDs.");
  }
  if (typeof input.name !== "string" || !input.name.trim()) {
    return failure("invalid-local-classification", "name", "A local milestone definition requires a nonempty name.");
  }
  if (!stageGroupCatalog.some(stage => stage.id === input.stageGroupId)) {
    return failure("invalid-local-classification", "stageGroupId", "Select an existing Stage Group ID.");
  }
  if (!milestoneTypeCatalog.some(type => type.id === input.milestoneTypeId)) {
    return failure("invalid-local-classification", "milestoneTypeId", "Select an existing Milestone Type ID.");
  }
  if (input.source !== "manual" && input.source !== "import") {
    return failure("invalid-local-classification", "source", "A local milestone definition source must be manual or import.");
  }

  let maximumOrder = 0;
  for (const definition of [...context.definitionsForHistoricalResolution, ...schedule.localDefinitions]) {
    if (!Number.isFinite(definition.displayOrder)) {
      return failure("invalid-local-classification", "displayOrder", "Existing definition ordering must be finite to append a local milestone.");
    }
    maximumOrder = Math.max(maximumOrder, definition.displayOrder);
  }
  const displayOrder = maximumOrder + 10;
  if (displayOrder > Number.MAX_SAFE_INTEGER || displayOrder <= maximumOrder) {
    return failure("invalid-local-classification", "displayOrder", "No safe display order is available after existing definitions.");
  }

  return { ok: true, value: {
    ...schedule,
    localDefinitions: [...schedule.localDefinitions, {
      id: input.definitionId,
      name: input.name.trim(),
      stageGroupId: input.stageGroupId,
      milestoneTypeId: input.milestoneTypeId,
      displayOrder,
      source: input.source,
      confirmation: "confirmed",
      evidenceIds: [...input.evidenceIds],
    }],
  } };
}
