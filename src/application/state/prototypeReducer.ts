import type { Project } from "../../domain/project/project";
import type { PrototypeState } from "./prototypeState";

export type PrototypeAction =
	| {
			readonly type: "projectAdded";
			readonly project: Project;
	  }
	| {
			readonly type: "projectReplaced";
			readonly project: Project;
	  };

export function prototypeReducer(
	state: PrototypeState,
	action: PrototypeAction,
): PrototypeState {
	if (action.type === "projectAdded") {
		if (state.projects.some((project) => project.id === action.project.id)) {
			throw new Error(`Project ID already exists: ${action.project.id}`);
		}

		return {
			...state,
			projects: [...state.projects, action.project],
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
