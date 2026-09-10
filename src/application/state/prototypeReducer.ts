import type { Project } from "../../domain/project/project";
import type { CanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import type { PrototypeState } from "./prototypeState";

export type PrototypeAction =
	| {
			readonly type: "projectAdded";
			readonly project: Project;
			readonly schedule: CanonicalProjectSchedule;
	  }
	| {
			readonly type: "projectReplaced";
			readonly project: Project;
	  };

export function prototypeReducer(
	state: PrototypeState,
	action: PrototypeAction,
): PrototypeState {
	if (Object.hasOwn(action.project, "schedule")) {
		throw new Error("Project payload must not contain embedded Schedule state");
	}

	if (action.type === "projectAdded") {
		if (state.projects.some((project) => project.id === action.project.id)) {
			throw new Error(`Project ID already exists: ${action.project.id}`);
		}
		if (action.schedule.projectId !== action.project.id) {
			throw new Error(
				`Schedule Project ID does not match Project ID: ${action.schedule.projectId}`,
			);
		}
		if (
			state.schedules.some(
				(schedule) => schedule.projectId === action.schedule.projectId,
			)
		) {
			throw new Error(
				`Schedule owner already exists: ${action.schedule.projectId}`,
			);
		}
		if (action.schedule.publishedVersions.length > 0) {
			throw new Error("New Project Schedule must have no Published versions");
		}

		return {
			...state,
			projects: [...state.projects, action.project],
			schedules: [...state.schedules, action.schedule],
		};
	}

	const replacementIndex = state.projects.findIndex(
		(project) => project.id === action.project.id,
	);

	if (replacementIndex < 0) {
		throw new Error(`Project ID not found: ${action.project.id}`);
	}

	return {
		...state,
		projects: state.projects.map((project, index) =>
			index === replacementIndex ? action.project : project,
		),
	};
}
