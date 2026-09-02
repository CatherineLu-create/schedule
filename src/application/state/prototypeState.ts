import type { Project } from "../../domain/project/project";

export interface PrototypeState {
	readonly projects: readonly Project[];
}
