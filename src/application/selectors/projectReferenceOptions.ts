import type { ProjectMasterLeverage } from "../../domain/project/projectMaster";
import type { ProjectId } from "../../domain/shared/ids";
import type { PrototypeState } from "../state/prototypeState";
import { getProjectById } from "./projectSelectors";

export interface ProjectReferenceOption {
	readonly projectId: ProjectId;
	readonly year: number | null;
	readonly stnProjectName: string | null;
	readonly qciModelName: string | null;
	readonly displayLabel: string;
	readonly searchText: string;
}

export type ProjectLeverageDisplay = Readonly<
	Record<keyof ProjectMasterLeverage, string>
>;

const leverageKeys: readonly (keyof ProjectMasterLeverage)[] = [
	"pcbLeverage",
	"aLeverage",
	"bLeverage",
	"cLeverage",
	"dLeverage",
];

function identityLeaf(value: string | number | null): string {
	return value === null || value === "" ? "—" : String(value);
}

function projectIdentity(
	year: number | null,
	stnProjectName: string | null,
	qciModelName: string | null,
): string {
	return [year, stnProjectName, qciModelName].map(identityLeaf).join(" | ");
}

export function selectProjectReferenceOptions(
	state: PrototypeState,
): readonly ProjectReferenceOption[] {
	return state.projects.map(({ id, master }) => {
		const { year, stnProjectName, qciModelName } = master.basicInformation;
		const displayLabel = projectIdentity(year, stnProjectName, qciModelName);
		return {
			projectId: id,
			year,
			stnProjectName,
			qciModelName,
			displayLabel,
			searchText: [year, stnProjectName, qciModelName]
				.filter((value) => value !== null && value !== "")
				.join(" ")
				.toLocaleLowerCase(),
		};
	});
}

export function filterProjectReferenceOptions(
	options: readonly ProjectReferenceOption[],
	query: string,
): readonly ProjectReferenceOption[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (normalizedQuery === "") return options;
	return options.filter(({ searchText }) => searchText.includes(normalizedQuery));
}

export function selectProjectLeverageDisplay(
	state: PrototypeState,
	currentProjectId: ProjectId,
): ProjectLeverageDisplay | null {
	const target = getProjectById(state, currentProjectId);
	if (target === null) return null;

	return Object.fromEntries(
		leverageKeys.map((key) => {
			const sourceProjectId = target.master.leverage[key];
			if (sourceProjectId === null) return [key, "—"];
			if (sourceProjectId === currentProjectId) return [key, "New Design"];

			const source = getProjectById(state, sourceProjectId);
			if (source === null) return [key, "Unavailable Project"];

			const { year, stnProjectName, qciModelName } =
				source.master.basicInformation;
			return [key, projectIdentity(year, stnProjectName, qciModelName)];
		}),
	) as ProjectLeverageDisplay;
}
