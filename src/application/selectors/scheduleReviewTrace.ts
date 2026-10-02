import type { CanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import type { ScheduleReviewTraceItem } from "../../domain/schedule/scheduleReview";
import type { ScheduleReviewSessionId } from "../../domain/shared/ids";

export function selectScheduleReviewTrace(
  schedule: CanonicalProjectSchedule,
  sessionId: ScheduleReviewSessionId,
): readonly ScheduleReviewTraceItem[] {
  const closure = schedule.reviewClosures.find(event => event.sessionId === sessionId) ?? null;
  return schedule.reviewDecisions.filter(decision => decision.sessionId === sessionId).map(decision => {
    if (closure === null) return { decision, closure, finalOccurrence: null, retention: "unpublished" };
    if (closure.kind === "discarded") return { decision, closure, finalOccurrence: null, retention: "discarded" };
    const definitionId = "targetDefinitionId" in decision ? decision.targetDefinitionId : decision.toPublicDefinitionId;
    const version = schedule.publishedVersions.find(candidate => candidate.versionNumber === closure.versionNumber);
    const finalOccurrence = version?.milestones.find(row => row.milestoneId === decision.targetMilestoneId && row.milestoneDefinitionId === definitionId) ?? null;
    return { decision, closure, finalOccurrence, retention: finalOccurrence === null ? "not-retained" : "retained" };
  });
}
