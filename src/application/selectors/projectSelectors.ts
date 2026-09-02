import type { Project } from "../../domain/project/project";
import type { ProjectId } from "../../domain/shared/ids";
import type { PrototypeState } from "../state/prototypeState";

export function getProjectById(
	state: PrototypeState,
	projectId: ProjectId,
): Project | null {
	return state.projects.find((project) => project.id === projectId) ?? null;
}
