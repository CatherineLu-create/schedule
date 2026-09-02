import type { ProjectSchedule } from "../schedule/schedule";
import type { ProjectId } from "../shared/ids";
import type { ProjectTeam } from "../team/team";
import type { ProjectIdentityAlias } from "./projectIdentity";
import type { ProjectMaster } from "./projectMaster";

export interface Project {
	readonly id: ProjectId;
	readonly master: ProjectMaster;
	readonly identityAliases: readonly ProjectIdentityAlias[];
	readonly schedule: ProjectSchedule;
	readonly team: ProjectTeam | null;
}
