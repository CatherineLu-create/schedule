import { describe, expect, it } from "vitest";
import type { Project } from "../../domain/project/project";
import type { ProjectMaster } from "../../domain/project/projectMaster";
import { toProjectId } from "../../domain/shared/ids";
import type { PrototypeState } from "../state/prototypeState";
import { getProjectById } from "./projectSelectors";

function makeProject(id: string, stnProjectName: string): Project {
	return {
		id: toProjectId(id),
		master: {
			basicInformation: { stnProjectName },
		} as ProjectMaster,
		identityAliases: [],
		schedule: { publishedVersions: [], workingDraft: null },
		team: null,
	};
}

describe("getProjectById", () => {
	it("finds canonical Projects by ProjectId even when display names match", () => {
		const first = makeProject("dev-project-001", "Duplicate Fixture Name");
		const second = makeProject("dev-project-002", "Duplicate Fixture Name");
		const state: PrototypeState = Object.freeze({
			projects: Object.freeze([first, second]),
		});

		const selected = getProjectById(state, toProjectId("dev-project-002"));

		expect(selected).toBe(second);
		expect(state.projects).toEqual([first, second]);
	});

	it("returns null when the ProjectId is absent", () => {
		const project = makeProject("dev-project-001", "Fixture Project");
		const state: PrototypeState = { projects: [project] };

		expect(getProjectById(state, toProjectId("dev-project-999"))).toBeNull();
		expect(
			getProjectById(state, toProjectId("Fixture Project")),
		).toBeNull();
	});
});
