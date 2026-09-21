import { describe, expect, it } from "vitest";

import { canonicalScheduleFixtures } from "../../fixtures/v2/canonicalScheduleFixtures";
import {
	devProject002,
	devProject005,
} from "../../fixtures/v2/canonicalProjectFixtures";
import { devTeamFunctionDefinitions } from "../../fixtures/v2/teamTemplateFixtures";
import { toProjectId } from "../../domain/shared/ids";
import { prototypeReducer } from "../state/prototypeReducer";
import type { PrototypeState } from "../state/prototypeState";
import {
	createEditCandidate,
	editTeamCandidate,
} from "../teamImport/teamCandidate";
import { saveProjectTeamForState } from "./teamSaveState";

function stateWithProjects(): PrototypeState {
	return {
		projects: [devProject002, devProject005],
		schedules: canonicalScheduleFixtures,
	};
}

describe("Team Save state ownership", () => {
	it("returns projectMissing without a replacement", () => {
		const candidate = createEditCandidate(
			devProject002.id,
			devProject002.team,
			devTeamFunctionDefinitions,
		);
		const result = saveProjectTeamForState(
			stateWithProjects(),
			toProjectId("missing-project"),
			candidate,
			devTeamFunctionDefinitions,
		);

		expect(result).toMatchObject({ ok: false, reason: "projectMissing" });
		expect(result).not.toHaveProperty("project");
	});

	it("returns projectMismatch when the candidate belongs to another Project", () => {
		const candidate = createEditCandidate(
			devProject005.id,
			devProject005.team,
			devTeamFunctionDefinitions,
		);
		const result = saveProjectTeamForState(
			stateWithProjects(),
			devProject002.id,
			candidate,
			devTeamFunctionDefinitions,
		);

		expect(result).toMatchObject({ ok: false, reason: "projectMismatch" });
		expect(result).not.toHaveProperty("project");
	});

	it("returns one replacement Project and one reducer action changes only its Team", () => {
		const state = stateWithProjects();
		const originalCandidate = createEditCandidate(
			devProject002.id,
			devProject002.team,
			devTeamFunctionDefinitions,
		);
		const editableRow = originalCandidate.rows.find(({ name }) => name !== null)!;
		const candidate = editTeamCandidate(
			originalCandidate,
			editableRow.rowId,
			{ name: "Synthetic Updated Person" },
			devTeamFunctionDefinitions,
		);
		const result = saveProjectTeamForState(
			state,
			devProject002.id,
			candidate,
			devTeamFunctionDefinitions,
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.project.id).toBe(devProject002.id);
		expect(result.project.master).toBe(devProject002.master);
		expect(result.project.identityAliases).toBe(devProject002.identityAliases);
		expect(state.projects[0]).toBe(devProject002);
		expect(state.schedules).toBe(canonicalScheduleFixtures);

		const reduced = prototypeReducer(state, {
			type: "projectReplaced",
			project: result.project,
		});
		expect(reduced.projects[0]).toBe(result.project);
		expect(reduced.projects[1]).toBe(devProject005);
		expect(reduced.schedules).toBe(canonicalScheduleFixtures);
		expect(reduced.projects[0]?.team).not.toBe(devProject002.team);
	});

	it("re-reads the latest Project by ID instead of overwriting it from stale baseTeam", () => {
		const candidate = createEditCandidate(
			devProject002.id,
			devProject002.team,
			devTeamFunctionDefinitions,
		);
		const latestAliases = [{
			kind: "stnProjectName" as const,
			originalValue: "Synthetic Latest Alias",
			normalizedValue: "synthetic latest alias",
		}];
		const latestProject = { ...devProject002, identityAliases: latestAliases };
		const state: PrototypeState = {
			projects: [latestProject, devProject005],
			schedules: canonicalScheduleFixtures,
		};

		const result = saveProjectTeamForState(
			state,
			devProject002.id,
			candidate,
			devTeamFunctionDefinitions,
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.project.identityAliases).toBe(latestAliases);
		expect(result.project.master).toBe(latestProject.master);
		expect(state.projects[1]).toBe(devProject005);
		expect(state.schedules).toBe(canonicalScheduleFixtures);
	});
});
