import { describe, expect, it } from "vitest";
import type { Project } from "../../domain/project/project";
import { toProjectId } from "../../domain/shared/ids";
import { canonicalProjectFixtures } from "../../fixtures/v2/canonicalProjectFixtures";
import type { PrototypeState } from "../state/prototypeState";
import {
	filterProjectReferenceOptions,
	selectProjectLeverageDisplay,
	selectProjectReferenceOptions,
} from "./projectReferenceOptions";

const baseProject = canonicalProjectFixtures[0] as Project;

function project(
	id: string,
	year: number | null,
	stnProjectName: string | null,
	qciModelName: string | null,
): Project {
	return {
		...baseProject,
		id: toProjectId(id),
		master: {
			...baseProject.master,
			basicInformation: {
				...baseProject.master.basicInformation,
				year,
				stnProjectName,
				qciModelName,
			},
		},
	};
}

function state(projects: readonly Project[]): PrototypeState {
	return { projects, schedules: [] };
}

describe("project reference options", () => {
	it("projects canonical identity in state order and keeps duplicate names ID-backed", () => {
		const first = project("project-one", 2026, "Shared Name", "QCI-A");
		const second = project("project-two", 2027, "Shared Name", "QCI-B");

		expect(selectProjectReferenceOptions(state([first, second]))).toEqual([
			{
				projectId: first.id,
				year: 2026,
				stnProjectName: "Shared Name",
				qciModelName: "QCI-A",
				displayLabel: "2026 | Shared Name | QCI-A",
				searchText: "2026 shared name qci-a",
			},
			{
				projectId: second.id,
				year: 2027,
				stnProjectName: "Shared Name",
				qciModelName: "QCI-B",
				displayLabel: "2027 | Shared Name | QCI-B",
				searchText: "2027 shared name qci-b",
			},
		]);
	});

	it("uses visible placeholders for missing identity leaves", () => {
		const option = selectProjectReferenceOptions(
			state([project("missing-identity", null, null, null)]),
		)[0];

		expect(option?.displayLabel).toBe("— | — | —");
	});

	it.each(["2027", "shared name", "QCI-B", "  qci-b  "])(
		"filters case-insensitively by canonical identity using %s",
		(query) => {
			const first = project("project-one", 2026, "Another Project", "QCI-A");
			const second = project("project-two", 2027, "Shared Name", "QCI-B");
			const options = selectProjectReferenceOptions(state([first, second]));

			expect(filterProjectReferenceOptions(options, query).map(({ projectId }) => projectId)).toEqual([
				second.id,
			]);
		},
	);
});

describe("selectProjectLeverageDisplay", () => {
	it("keeps null, self, direct, and dangling references distinct", () => {
		const source = project("source-project", 2028, "Shared Name", "SOURCE-QCI");
		const targetId = toProjectId("target-project");
		const target: Project = {
			...project("target-project", 2026, "Target", "TARGET-QCI"),
			master: {
				...baseProject.master,
				basicInformation: {
					...baseProject.master.basicInformation,
					year: 2026,
					stnProjectName: "Target",
					qciModelName: "TARGET-QCI",
				},
				leverage: {
					pcbLeverage: targetId,
					aLeverage: source.id,
					bLeverage: null,
					cLeverage: toProjectId("missing-project"),
					dLeverage: null,
				},
			},
		};

		expect(selectProjectLeverageDisplay(state([target, source]), target.id)).toEqual({
			pcbLeverage: "New Design",
			aLeverage: "2028 | Shared Name | SOURCE-QCI",
			bLeverage: "—",
			cLeverage: "Unavailable Project",
			dLeverage: "—",
		});
	});

	it("resolves current source identity on every read and returns null for a missing target", () => {
		const source = project("source-project", 2028, "Renamed Source", "SOURCE-QCI");
		const target: Project = {
			...project("target-project", 2026, "Target", "TARGET-QCI"),
			master: {
				...baseProject.master,
				leverage: {
					...baseProject.master.leverage,
					aLeverage: source.id,
				},
			},
		};
		const canonicalState = state([target, source]);

		expect(selectProjectLeverageDisplay(canonicalState, target.id)?.aLeverage).toBe(
			"2028 | Renamed Source | SOURCE-QCI",
		);
		expect(
			selectProjectLeverageDisplay(canonicalState, toProjectId("missing-target")),
		).toBeNull();
	});
});
