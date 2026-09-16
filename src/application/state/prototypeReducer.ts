import type { Project } from "../../domain/project/project";
import type { CanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import type { ProjectId } from "../../domain/shared/ids";
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
	  }
	| {
			readonly type: "scheduleReplaced";
			readonly projectId: ProjectId;
			readonly schedule: CanonicalProjectSchedule;
	  };

export function prototypeReducer(
	state: PrototypeState,
	action: PrototypeAction,
): PrototypeState {
	if (action.type === "scheduleReplaced") {
		if (action.projectId !== action.schedule.projectId) {
			throw new Error(
				"Replacement Schedule ProjectId must match the action ProjectId",
			);
		}
		if (!state.projects.some((project) => project.id === action.projectId)) {
			throw new Error(`Schedule Project ID not found: ${action.projectId}`);
		}
		const ownedCount = state.schedules.filter(
			(schedule) => schedule.projectId === action.projectId,
		).length;
		if (ownedCount !== 1) {
			throw new Error(
				`Schedule replacement requires exactly one owner: ${action.projectId}`,
			);
		}
		return {
			...state,
			projects: state.projects,
			schedules: state.schedules.map((schedule) =>
				schedule.projectId === action.projectId ? action.schedule : schedule,
			),
		};
	}

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
		if (action.schedule.workingDraft !== null) {
			throw new Error("New Project Schedule must not have a Working Draft");
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
