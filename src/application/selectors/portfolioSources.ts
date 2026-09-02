import type { ProjectMaster } from "../../domain/project/projectMaster";
import {
	getLatestPublishedVersion,
	type PublishedScheduleVersion,
} from "../../domain/schedule/schedule";
import type { ProjectId } from "../../domain/shared/ids";
import type { ProjectTeam } from "../../domain/team/team";
import type { PrototypeState } from "../state/prototypeState";
import { getProjectById } from "./projectSelectors";

export interface OfficialProjectSources {
	readonly projectId: ProjectId;
	readonly master: ProjectMaster;
	readonly latestPublishedSchedule: PublishedScheduleVersion | null;
	readonly team: ProjectTeam | null;
}

export function selectOfficialProjectSources(
	state: PrototypeState,
	projectId: ProjectId,
): OfficialProjectSources | null {
	const project = getProjectById(state, projectId);

	if (project === null) {
		return null;
	}

	return {
		projectId: project.id,
		master: project.master,
		latestPublishedSchedule: getLatestPublishedVersion(project.schedule),
		team: project.team,
	};
}
