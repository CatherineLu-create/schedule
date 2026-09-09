import { describe, expect, expectTypeOf, it } from "vitest";
import type { Project } from "../../domain/project/project";
import { toCatalogItemId, type ProjectId } from "../../domain/shared/ids";
import {
	canonicalProjectFixtures,
	devProject001,
	devProject002,
	devProject004,
} from "../../fixtures/v2/canonicalProjectFixtures";
import type { PrototypeState } from "../state/prototypeState";
import {
	selectDashboardProjectRow,
	selectDashboardProjectRows,
	type DashboardProjectRow,
} from "./dashboardProjectRows";

describe("Dashboard Project row projection", () => {
	it("projects current canonical Master values into the preserved Dashboard and export fields", () => {
		expectTypeOf<DashboardProjectRow>().toEqualTypeOf<{
			readonly projectId: ProjectId;
			readonly year: string;
			readonly customer: string;
			readonly productLine: string;
			readonly projectName: string;
			readonly qciModelName: string;
			readonly acerModelName: string;
			readonly acerMarketingName: string;
			readonly panelSize: string;
			readonly cpu: string;
			readonly gpu: string;
			readonly ssid: string;
			readonly rmn: string;
			readonly projectStatus: string;
			readonly currentStage: string;
			readonly mdrr: string;
		}>();

		const displayProject: Project = {
			...devProject002,
			master: {
				...devProject002.master,
				modelRegulatory: {
					acerModelName: "Acer Display Model",
					acerMarketingName: "Acer Display Marketing",
					ssid: "DISPLAY-SSID",
					rmn: "DISPLAY-RMN",
				},
			},
		};
		const state: PrototypeState = { projects: [displayProject] };

		expect(selectDashboardProjectRow(state, displayProject.id)).toEqual({
			projectId: displayProject.id,
			year: "2027",
			customer: "Acer",
			productLine: "DEV Line Alpha",
			projectName: "DEV Project Alpha",
			qciModelName: "DEV-QCI-ALPHA-01",
			acerModelName: "Acer Display Model",
			acerMarketingName: "Acer Display Marketing",
			panelSize: '16"',
			cpu: "DEV CPU Alpha",
			gpu: "DEV GPU Alpha",
			ssid: "DISPLAY-SSID",
			rmn: "DISPLAY-RMN",
			projectStatus: "On Going",
			currentStage: "-",
			mdrr: "-",
		});
	});

	it("renders unresolved catalog IDs and missing canonical values as hyphens", () => {
		const unresolvedId = toCatalogItemId("unresolved-dashboard-reference");
		const unresolvedProject: Project = {
			...devProject002,
			master: {
				...devProject002.master,
				basicInformation: {
					...devProject002.master.basicInformation,
					status: unresolvedId,
					year: null,
					customer: null,
					productLine: unresolvedId,
					panelSize: null,
					stnProjectName: "",
					qciModelName: null,
				},
				platformHardware: {
					...devProject002.master.platformHardware,
					cpu: unresolvedId,
					gpu: null,
				},
				modelRegulatory: {
					acerModelName: "",
					acerMarketingName: null,
					ssid: "",
					rmn: null,
				},
			},
		};
		const state: PrototypeState = { projects: [unresolvedProject] };

		expect(selectDashboardProjectRow(state, unresolvedProject.id)).toEqual({
			projectId: unresolvedProject.id,
			year: "-",
			customer: "-",
			productLine: "-",
			projectName: "-",
			qciModelName: "-",
			acerModelName: "-",
			acerMarketingName: "-",
			panelSize: "-",
			cpu: "-",
			gpu: "-",
			ssid: "-",
			rmn: "-",
			projectStatus: "-",
			currentStage: "-",
			mdrr: "-",
		});
	});

	it("keeps Current Stage and MDRR unsupported when no Published Schedule exists", () => {
		const state: PrototypeState = { projects: [devProject001] };

		const row = selectDashboardProjectRow(state, devProject001.id);

		expect(devProject001.schedule.publishedVersions).toHaveLength(0);
		expect(row?.currentStage).toBe("-");
		expect(row?.mdrr).toBe("-");
	});

	it("ignores Working Draft data and does not infer from the latest Published Schedule", () => {
		const originalState: PrototypeState = { projects: [devProject004] };
		const originalRow = selectDashboardProjectRow(
			originalState,
			devProject004.id,
		);
		const draft = devProject004.schedule.workingDraft;

		expect(devProject004.schedule.publishedVersions).toHaveLength(1);
		expect(draft).not.toBeNull();

		const changedDraftProject: Project = {
			...devProject004,
			schedule: {
				...devProject004.schedule,
				workingDraft:
					draft === null
						? null
						: {
								...draft,
								milestones: [],
								importFindings: [],
							},
			},
		};
		const changedDraftState: PrototypeState = {
			projects: [changedDraftProject],
		};

		expect(
			selectDashboardProjectRow(changedDraftState, changedDraftProject.id),
		).toEqual(originalRow);
		expect(originalRow?.currentStage).toBe("-");
		expect(originalRow?.mdrr).toBe("-");
	});

	it("projects one row per canonical Project in canonical collection order", () => {
		const state: PrototypeState = { projects: canonicalProjectFixtures };

		const rows = selectDashboardProjectRows(state);

		expect(rows).toHaveLength(canonicalProjectFixtures.length);
		expect(rows.map((row) => row.projectId)).toEqual(
			canonicalProjectFixtures.map((project) => project.id),
		);
	});
});
