import type { ProjectId } from "../shared/ids";
import type { ProjectTeam } from "../team/team";
import type { ProjectIdentityAlias } from "./projectIdentity";
import type { ProjectMaster } from "./projectMaster";

export interface Project {
	readonly id: ProjectId;
	readonly master: ProjectMaster;
	readonly identityAliases: readonly ProjectIdentityAlias[];
	readonly team: ProjectTeam | null;
}
