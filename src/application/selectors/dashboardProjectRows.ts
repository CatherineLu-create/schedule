import { statusCatalog } from "../../config/v2/referenceData";
import type { CatalogItem } from "../../domain/reference-data/catalog";
import type { CatalogItemId, ProjectId } from "../../domain/shared/ids";
import {
	customerReferenceFixtures,
} from "../../fixtures/v2/referenceFixtures";
import {
	createInitialSelfServiceReferenceCatalogs,
	type SelfServiceReferenceCatalogs,
} from "../reference-data/selfServiceCatalogs";
import type { PrototypeState } from "../state/prototypeState";
import { selectOfficialProjectSources } from "./portfolioSources";

const defaultSelfServiceReferenceCatalogs =
	createInitialSelfServiceReferenceCatalogs();

export interface DashboardProjectRow {
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
}

function displayText(value: string | null): string {
	return value === null || value.trim().length === 0 ? "-" : value;
}

function displayYear(value: number | null): string {
	return value === null ? "-" : String(value);
}

function resolveCatalogDisplay(
	id: CatalogItemId | null,
	catalog: readonly CatalogItem<CatalogItemId>[],
): string {
	if (id === null) {
		return "-";
	}

	return catalog.find((item) => item.id === id)?.displayName ?? "-";
}

export function selectDashboardProjectRow(
	state: PrototypeState,
	projectId: ProjectId,
	selfServiceCatalogs: SelfServiceReferenceCatalogs = defaultSelfServiceReferenceCatalogs,
): DashboardProjectRow | null {
	const sources = selectOfficialProjectSources(state, projectId);

	if (sources === null) {
		return null;
	}

	const basic = sources.master.basicInformation;
	const hardware = sources.master.platformHardware;
	const regulatory = sources.master.modelRegulatory;

	return {
		projectId,
		year: displayYear(basic.year),
		customer: resolveCatalogDisplay(basic.customer, customerReferenceFixtures),
		productLine: resolveCatalogDisplay(
			basic.productLine,
			selfServiceCatalogs.productLine,
		),
		projectName: displayText(basic.stnProjectName),
		qciModelName: displayText(basic.qciModelName),
		acerModelName: displayText(regulatory.acerModelName),
		acerMarketingName: displayText(regulatory.acerMarketingName),
		panelSize: resolveCatalogDisplay(
			basic.panelSize,
			selfServiceCatalogs.panelSize,
		),
		cpu: resolveCatalogDisplay(hardware.cpu, selfServiceCatalogs.cpu),
		gpu: resolveCatalogDisplay(hardware.gpu, selfServiceCatalogs.gpu),
		ssid: displayText(regulatory.ssid),
		rmn: displayText(regulatory.rmn),
		projectStatus: resolveCatalogDisplay(basic.status, statusCatalog),
		currentStage: "-",
		mdrr: "-",
	};
}

export function selectDashboardProjectRows(
	state: PrototypeState,
	selfServiceCatalogs: SelfServiceReferenceCatalogs = defaultSelfServiceReferenceCatalogs,
): readonly DashboardProjectRow[] {
	return state.projects.flatMap((project) => {
		const row = selectDashboardProjectRow(state, project.id, selfServiceCatalogs);
		return row === null ? [] : [row];
	});
}
