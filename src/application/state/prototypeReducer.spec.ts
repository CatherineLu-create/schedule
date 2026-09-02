import { describe, expect, it } from "vitest";
import type { Project } from "../../domain/project/project";
import type { ProjectMaster } from "../../domain/project/projectMaster";
import { toProjectId } from "../../domain/shared/ids";
import { prototypeReducer } from "./prototypeReducer";
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

describe("prototypeReducer projectAdded", () => {
	it("immutably appends an already-formed Project", () => {
		const existing = Object.freeze(
			makeProject("dev-project-001", "Fixture Project Alpha"),
		);
		const added = makeProject("dev-project-002", "Fixture Project Beta");
		const projects = Object.freeze([existing]);
		const state: PrototypeState = Object.freeze({ projects });

		const next = prototypeReducer(state, { type: "projectAdded", project: added });

		expect(next).not.toBe(state);
		expect(next.projects).not.toBe(state.projects);
		expect(next.projects).toEqual([existing, added]);
		expect(next.projects[0]).toBe(existing);
		expect(state.projects).toEqual([existing]);
	});

	it("rejects a duplicate ProjectId without changing the state", () => {
		const existing = makeProject(
			"dev-project-001",
			"Fixture Project Alpha",
		);
		const state: PrototypeState = Object.freeze({
			projects: Object.freeze([existing]),
		});
		const duplicateId = makeProject(
			"dev-project-001",
			"A different display name",
		);

		expect(() =>
			prototypeReducer(state, {
				type: "projectAdded",
				project: duplicateId,
			}),
		).toThrow("Project ID already exists: dev-project-001");
		expect(state.projects).toEqual([existing]);
	});

	it("allows the same business display name under a different ProjectId", () => {
		const first = makeProject("dev-project-001", "Duplicate Fixture Name");
		const second = makeProject("dev-project-002", "Duplicate Fixture Name");
		const state: PrototypeState = { projects: [first] };

		const next = prototypeReducer(state, {
			type: "projectAdded",
			project: second,
		});

		expect(next.projects).toEqual([first, second]);
	});
});

describe("prototypeReducer projectReplaced", () => {
	it("immutably replaces exactly one Project without merging or reordering", () => {
		const first = Object.freeze(
			makeProject("dev-project-001", "Fixture Project Alpha"),
		);
		const second = Object.freeze(
			makeProject("dev-project-002", "Fixture Project Beta"),
		);
		const replacement = makeProject(
			"dev-project-001",
			"Fixture Project Alpha Updated",
		);
		const state: PrototypeState = Object.freeze({
			projects: Object.freeze([first, second]),
		});

		const next = prototypeReducer(state, {
			type: "projectReplaced",
			project: replacement,
		});

		expect(next).not.toBe(state);
		expect(next.projects).not.toBe(state.projects);
		expect(next.projects).toEqual([replacement, second]);
		expect(next.projects[0]).toBe(replacement);
		expect(next.projects[1]).toBe(second);
		expect(state.projects).toEqual([first, second]);
	});

	it("rejects replacement of an unknown ProjectId without mutation", () => {
		const existing = makeProject(
			"dev-project-001",
			"Fixture Project Alpha",
		);
		const state: PrototypeState = Object.freeze({
			projects: Object.freeze([existing]),
		});
		const unknown = makeProject(
			"dev-project-999",
			"Unknown Fixture Project",
		);

		expect(() =>
			prototypeReducer(state, {
				type: "projectReplaced",
				project: unknown,
			}),
		).toThrow("Project ID not found: dev-project-999");
		expect(state.projects).toEqual([existing]);
	});
});
