import { describe, expect, it } from "vitest";
import type { Project } from "../../domain/project/project";
import type { ProjectMaster } from "../../domain/project/projectMaster";
import { toProjectId } from "../../domain/shared/ids";
import type { PrototypeState } from "./prototypeState";

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

describe("PrototypeState", () => {
	it("represents an empty canonical Project collection", async () => {
		const stateModule = await import("./prototypeState");
		const state: PrototypeState = { projects: [] };

		expect(stateModule).toBeDefined();
		expect(state.projects).toEqual([]);
	});

	it("represents multiple Projects in their canonical order", () => {
		const first = makeProject("dev-project-001", "Fixture Project");
		const second = makeProject("dev-project-002", "Fixture Project");
		const state: PrototypeState = { projects: [first, second] };

		expect(state.projects).toEqual([first, second]);
	});
});
