import type { Project } from "../../domain/project/project";
import type { CanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";

export interface PrototypeState {
	readonly projects: readonly Project[];
	readonly schedules: readonly CanonicalProjectSchedule[];
}
