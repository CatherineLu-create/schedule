import {
	coverCatalog,
	milestoneDefinitions,
	statusCatalog,
} from "../../config/v2/referenceData";
import type { Project } from "../../domain/project/project";
import type { ProjectMaster } from "../../domain/project/projectMaster";
import type { CatalogItem } from "../../domain/reference-data/catalog";
import {
	toScheduleVersionNumber,
	type PublishedScheduleVersion,
	type ScheduleWorkingDraft,
} from "../../domain/schedule/schedule";
import { parseDateOnly, type DateOnly } from "../../domain/shared/dateOnly";
import {
	toCatalogItemId,
	toMilestoneDefinitionId,
	toMilestoneRowId,
	toPersonAssignmentId,
	toProjectId,
	toScheduleDraftId,
	toScheduleVersionId,
	toTeamFunctionId,
	type CatalogItemId,
	type MilestoneDefinitionId,
} from "../../domain/shared/ids";
import {
	categoryReferenceFixtures,
	cpuReferenceFixtures,
	customerReferenceFixtures,
	gpuReferenceFixtures,
	panelSizeReferenceFixtures,
	productLineReferenceFixtures,
} from "./referenceFixtures";
import {
	actualWithoutPlanDraftCandidate,
	importAmbiguityDraftCandidate,
	notApplicableWithDateDraftCandidate,
	unmappedMilestoneDraftCandidate,
} from "./scheduleCandidateFixtures";
import {
	devBiosTeamFunctionDefinition,
	devEeTeamFunctionDefinition,
	devMeTeamFunctionDefinition,
	devTeamTemplateV1,
	devTeamTemplateV2,
	devThermalTeamFunctionDefinition,
	validSavedTeamFixture,
} from "./teamTemplateFixtures";
import type { ProjectTeam } from "../../domain/team/team";

function fixtureDate(value: string): DateOnly {
	const parsed = parseDateOnly(value);

	if (parsed === null) {
		throw new Error(`Invalid canonical V2 fixture DateOnly: ${value}`);
	}

	return parsed;
}

function requireCatalogItemId(
	catalog: readonly CatalogItem<CatalogItemId>[],
	idValue: string,
): CatalogItemId {
	const id = toCatalogItemId(idValue);
	const item = catalog.find((candidate) => candidate.id === id);

	if (item === undefined) {
		throw new Error(`Missing canonical V2 fixture catalog item: ${idValue}`);
	}

	return item.id;
}

function requireMilestoneDefinitionId(idValue: string): MilestoneDefinitionId {
	const id = toMilestoneDefinitionId(idValue);
	const definition = milestoneDefinitions.find(
		(candidate) => candidate.id === id,
	);

	if (definition === undefined) {
		throw new Error(`Missing canonical V2 milestone definition: ${idValue}`);
	}

	return definition.id;
}

const noLeverage: ProjectMaster["leverage"] = {
	pcbLeverage: null,
	aLeverage: null,
	bLeverage: null,
	cLeverage: null,
	dLeverage: null,
};

const noCover: ProjectMaster["cover"] = {
	aCover: null,
	bCover: null,
	cCover: null,
	dCover: null,
};

const noModelRegulatory: ProjectMaster["modelRegulatory"] = {
	acerModelName: null,
	acerMarketingName: null,
	ssid: null,
	rmn: null,
};

const noMechanical: ProjectMaster["mechanical"] = {
	product: {
		productLengthMm: null,
		productWidthMm: null,
		productHeightMm: null,
		productWeightG: null,
	},
	package: {
		packageLengthMm: null,
		packageWidthMm: null,
		packageHeightMm: null,
		grossWeightG: null,
	},
};

export const devScenarioToday = fixtureDate("2026-09-15");

export const devProject001: Project = {
	id: toProjectId("dev-project-001"),
	master: {
		basicInformation: {
			status: requireCatalogItemId(statusCatalog, "status-rfq"),
			year: 2027,
			customer: requireCatalogItemId(
				customerReferenceFixtures,
				"dev-customer-acer",
			),
			category: requireCatalogItemId(
				categoryReferenceFixtures,
				"dev-category-notebook",
			),
			productLine: requireCatalogItemId(
				productLineReferenceFixtures,
				"dev-product-line-beta",
			),
			panelSize: requireCatalogItemId(
				panelSizeReferenceFixtures,
				"dev-panel-size-16",
			),
			stnProjectName: "DEV Empty Project",
			qciModelName: null,
		},
		platformHardware: {
			cpu: requireCatalogItemId(cpuReferenceFixtures, "dev-cpu-alpha"),
			gpu: requireCatalogItemId(gpuReferenceFixtures, "dev-gpu-alpha"),
			pcbNumber: null,
			housingNumber: null,
		},
		leverage: noLeverage,
		cover: noCover,
		modelRegulatory: noModelRegulatory,
		mechanical: noMechanical,
		other: {
			remark: "DEV empty Project scenario",
		},
	},
	identityAliases: [],
	schedule: {
		publishedVersions: [],
		workingDraft: null,
	},
	team: null,
};

const devProject002PublishedV1: PublishedScheduleVersion = {
	id: toScheduleVersionId("dev-project-002-schedule-v1"),
	versionNumber: toScheduleVersionNumber(1),
	versionNote: "DEV initial schedule",
	publishedAt: "2026-08-20T00:00:00Z",
	milestones: [
		{
			rowId: toMilestoneRowId("dev-project-002-v1-row-kickoff"),
			milestoneDefinitionId: requireMilestoneDefinitionId(
				"milestone-design-kickoff",
			),
			applicability: "applicable",
			plan: fixtureDate("2026-08-15"),
			actual: fixtureDate("2026-08-18"),
		},
		{
			rowId: toMilestoneRowId("dev-project-002-v1-row-id-fix"),
			milestoneDefinitionId: requireMilestoneDefinitionId(
				"milestone-design-id-fix",
			),
			applicability: "notApplicable",
			plan: null,
			actual: null,
		},
		{
			rowId: toMilestoneRowId("dev-project-002-v1-row-a1-go"),
			milestoneDefinitionId: requireMilestoneDefinitionId(
				"milestone-a1-a-g-o",
			),
			applicability: "applicable",
			plan: fixtureDate("2026-09-20"),
			actual: null,
		},
		{
			rowId: toMilestoneRowId("dev-project-002-v1-row-a1-smt"),
			milestoneDefinitionId: requireMilestoneDefinitionId(
				"milestone-a1-a-smt",
			),
			applicability: "applicable",
			plan: fixtureDate("2026-09-01"),
			actual: null,
		},
		{
			rowId: toMilestoneRowId("dev-project-002-v1-row-mdrr"),
			milestoneDefinitionId: requireMilestoneDefinitionId("milestone-mdrr"),
			applicability: "applicable",
			plan: fixtureDate("2026-09-25"),
			actual: null,
		},
	],
};

export const devProject002: Project = {
	id: toProjectId("dev-project-002"),
	master: {
		basicInformation: {
			status: requireCatalogItemId(statusCatalog, "status-on-going"),
			year: 2027,
			customer: requireCatalogItemId(
				customerReferenceFixtures,
				"dev-customer-acer",
			),
			category: requireCatalogItemId(
				categoryReferenceFixtures,
				"dev-category-notebook",
			),
			productLine: requireCatalogItemId(
				productLineReferenceFixtures,
				"dev-product-line-alpha",
			),
			panelSize: requireCatalogItemId(
				panelSizeReferenceFixtures,
				"dev-panel-size-16",
			),
			stnProjectName: "DEV Project Alpha",
			qciModelName: "DEV-QCI-ALPHA-01",
		},
		platformHardware: {
			cpu: requireCatalogItemId(cpuReferenceFixtures, "dev-cpu-alpha"),
			gpu: requireCatalogItemId(gpuReferenceFixtures, "dev-gpu-alpha"),
			pcbNumber: "DEV-PCB-002",
			housingNumber: null,
		},
		leverage: noLeverage,
		cover: {
			...noCover,
			aCover: requireCatalogItemId(coverCatalog, "cover-plastic-paint"),
		},
		modelRegulatory: noModelRegulatory,
		mechanical: noMechanical,
		other: {
			remark: "DEV normal Portfolio scenario",
		},
	},
	identityAliases: [],
	schedule: {
		publishedVersions: [devProject002PublishedV1],
		workingDraft: null,
	},
	team: validSavedTeamFixture,
};

const devProject003PublishedV1: PublishedScheduleVersion = {
	id: toScheduleVersionId("dev-project-003-schedule-v1"),
	versionNumber: toScheduleVersionNumber(1),
	versionNote: "DEV initial schedule",
	publishedAt: "2026-08-25T00:00:00Z",
	milestones: [
		{
			rowId: toMilestoneRowId("dev-project-003-v1-row-c1-go"),
			milestoneDefinitionId: requireMilestoneDefinitionId(
				"milestone-c1-c-g-o",
			),
			applicability: "applicable",
			plan: fixtureDate("2026-09-30"),
			actual: null,
		},
	],
};

const devProject003PublishedV2: PublishedScheduleVersion = {
	id: toScheduleVersionId("dev-project-003-schedule-v2"),
	versionNumber: toScheduleVersionNumber(2),
	versionNote: "DEV schedule update",
	publishedAt: "2026-09-10T00:00:00Z",
	milestones: [
		{
			rowId: toMilestoneRowId("dev-project-003-v2-row-c1-go"),
			milestoneDefinitionId: requireMilestoneDefinitionId(
				"milestone-c1-c-g-o",
			),
			applicability: "applicable",
			plan: fixtureDate("2026-10-01"),
			actual: fixtureDate("2026-12-01"),
		},
	],
};

const devProject003Team: ProjectTeam = {
	projectRoles: {
		qciPm: {
			assignmentId: toPersonAssignmentId("dev-project-003-qci-pm"),
			name: "DEV Project 003 QCI PM",
			email: "project.003.qci.pm@example.test",
		},
		qciPjm: {
			assignmentId: toPersonAssignmentId("dev-project-003-qci-pjm"),
			name: "DEV Project 003 QCI PjM",
			email: "project.003.qci.pjm@example.test",
		},
		acerPm: {
			assignmentId: toPersonAssignmentId("dev-project-003-acer-pm"),
			name: "DEV Project 003 Acer PM",
			email: "project.003.acer.pm@example.test",
		},
	},
	functions: [
		{
			function: {
				kind: "standard",
				functionId: devMeTeamFunctionDefinition.id,
			},
			applicability: "applicable",
			assignments: [
				{
					assignmentId: toPersonAssignmentId(
						"dev-project-003-me-owner",
					),
					role: "owner",
					name: "DEV Project 003 ME Owner",
					email: "project.003.me.owner@example.test",
				},
			],
		},
		{
			function: {
				kind: "standard",
				functionId: devEeTeamFunctionDefinition.id,
			},
			applicability: "applicable",
			assignments: [
				{
					assignmentId: toPersonAssignmentId(
						"dev-project-003-ee-owner",
					),
					role: "owner",
					name: "DEV Project 003 EE Owner",
					email: "project.003.ee.owner@example.test",
				},
			],
		},
	],
	appliedTemplate: {
		templateId: devTeamTemplateV1.id,
		versionNumber: devTeamTemplateV1.versionNumber,
	},
};

export const devProject003: Project = {
	id: toProjectId("dev-project-003"),
	master: {
		basicInformation: {
			status: requireCatalogItemId(statusCatalog, "status-pending"),
			year: 2027,
			customer: requireCatalogItemId(
				customerReferenceFixtures,
				"dev-customer-b",
			),
			category: requireCatalogItemId(
				categoryReferenceFixtures,
				"dev-category-creator",
			),
			productLine: requireCatalogItemId(
				productLineReferenceFixtures,
				"dev-product-line-alpha",
			),
			panelSize: requireCatalogItemId(
				panelSizeReferenceFixtures,
				"dev-panel-size-18",
			),
			stnProjectName: "DEV Project Alpha",
			qciModelName: "DEV-QCI-ALPHA-02",
		},
		platformHardware: {
			cpu: requireCatalogItemId(cpuReferenceFixtures, "dev-cpu-beta"),
			gpu: requireCatalogItemId(gpuReferenceFixtures, "dev-gpu-beta"),
			pcbNumber: "DEV-PCB-003",
			housingNumber: "DEV-HOUSING-003",
		},
		leverage: noLeverage,
		cover: {
			...noCover,
			aCover: requireCatalogItemId(coverCatalog, "cover-mg-al"),
		},
		modelRegulatory: noModelRegulatory,
		mechanical: noMechanical,
		other: {
			remark: "DEV duplicate business identity scenario",
		},
	},
	identityAliases: [
		{
			kind: "stnProjectName",
			originalValue: "DEV Project Alpha Legacy",
			normalizedValue: "dev project alpha legacy",
		},
	],
	schedule: {
		publishedVersions: [
			devProject003PublishedV1,
			devProject003PublishedV2,
		],
		workingDraft: null,
	},
	team: devProject003Team,
};

const devProject004PublishedV1: PublishedScheduleVersion = {
	id: toScheduleVersionId("dev-project-004-schedule-v1"),
	versionNumber: toScheduleVersionNumber(1),
	versionNote: "DEV published schedule before import review",
	publishedAt: "2026-09-05T00:00:00Z",
	milestones: [
		{
			rowId: toMilestoneRowId("dev-project-004-v1-row-c1-go"),
			milestoneDefinitionId: requireMilestoneDefinitionId(
				"milestone-c1-c-g-o",
			),
			applicability: "applicable",
			plan: fixtureDate("2026-10-10"),
			actual: null,
		},
	],
};

const devProject004Draft: ScheduleWorkingDraft = {
	id: toScheduleDraftId("dev-project-004-working-draft"),
	basePublishedVersionId: devProject004PublishedV1.id,
	milestones: [
		{
			...unmappedMilestoneDraftCandidate.milestones[0],
			rowId: toMilestoneRowId("dev-project-004-draft-row-unmapped"),
		},
		{
			...notApplicableWithDateDraftCandidate.milestones[0],
			rowId: toMilestoneRowId(
				"dev-project-004-draft-row-not-applicable-with-date",
			),
			milestoneDefinitionId: requireMilestoneDefinitionId(
				"milestone-design-id-fix",
			),
		},
		{
			...actualWithoutPlanDraftCandidate.milestones[0],
			rowId: toMilestoneRowId(
				"dev-project-004-draft-row-actual-without-plan",
			),
			milestoneDefinitionId: requireMilestoneDefinitionId(
				"milestone-c1-c-test",
			),
		},
		{
			...importAmbiguityDraftCandidate.milestones[0],
			rowId: toMilestoneRowId(
				"dev-project-004-draft-row-import-ambiguity",
			),
			milestoneDefinitionId: requireMilestoneDefinitionId(
				"milestone-c2-c-smt",
			),
		},
	],
	importFindings: importAmbiguityDraftCandidate.importFindings.map(
		(finding) => ({
			...finding,
			target: {
				...finding.target,
				entityId: "dev-project-004-draft-row-import-ambiguity",
			},
		}),
	),
};

const devProject004Team: ProjectTeam = {
	projectRoles: {
		qciPm: {
			assignmentId: toPersonAssignmentId("dev-project-004-qci-pm"),
			name: "DEV Project 004 QCI PM",
			email: "project.004.qci.pm@example.test",
		},
		qciPjm: {
			assignmentId: toPersonAssignmentId("dev-project-004-qci-pjm"),
			name: "DEV Project 004 QCI PjM",
			email: "project.004.qci.pjm@example.test",
		},
		acerPm: {
			assignmentId: toPersonAssignmentId("dev-project-004-acer-pm"),
			name: "DEV Project 004 Acer PM",
			email: "project.004.acer.pm@example.test",
		},
	},
	functions: [
		{
			function: {
				kind: "standard",
				functionId: devMeTeamFunctionDefinition.id,
			},
			applicability: "applicable",
			assignments: [
				{
					assignmentId: toPersonAssignmentId(
						"dev-project-004-me-owner",
					),
					role: "owner",
					name: "DEV Project 004 ME Owner",
					email: "project.004.me.owner@example.test",
				},
			],
		},
		{
			function: {
				kind: "standard",
				functionId: devEeTeamFunctionDefinition.id,
			},
			applicability: "applicable",
			assignments: [
				{
					assignmentId: toPersonAssignmentId(
						"dev-project-004-ee-owner",
					),
					role: "owner",
					name: "DEV Project 004 EE Owner",
					email: "project.004.ee.owner@example.test",
				},
			],
		},
		{
			function: {
				kind: "standard",
				functionId: devThermalTeamFunctionDefinition.id,
			},
			applicability: "notApplicable",
			assignments: [],
		},
		{
			function: {
				kind: "standard",
				functionId: devBiosTeamFunctionDefinition.id,
			},
			applicability: "applicable",
			assignments: [
				{
					assignmentId: toPersonAssignmentId(
						"dev-project-004-bios-owner",
					),
					role: "owner",
					name: "DEV Project 004 BIOS Owner",
					email: "project.004.bios.owner@example.test",
				},
			],
		},
	],
	appliedTemplate: {
		templateId: devTeamTemplateV2.id,
		versionNumber: devTeamTemplateV2.versionNumber,
	},
};

export const devProject004: Project = {
	id: toProjectId("dev-project-004"),
	master: {
		basicInformation: {
			status: requireCatalogItemId(statusCatalog, "status-kick-off"),
			year: 2026,
			customer: requireCatalogItemId(
				customerReferenceFixtures,
				"dev-customer-acer",
			),
			category: requireCatalogItemId(
				categoryReferenceFixtures,
				"dev-category-creator",
			),
			productLine: requireCatalogItemId(
				productLineReferenceFixtures,
				"dev-product-line-beta",
			),
			panelSize: requireCatalogItemId(
				panelSizeReferenceFixtures,
				"dev-panel-size-18",
			),
			stnProjectName: "DEV Draft Review Project",
			qciModelName: "DEV-QCI-DRAFT-04",
		},
		platformHardware: {
			cpu: requireCatalogItemId(cpuReferenceFixtures, "dev-cpu-beta"),
			gpu: requireCatalogItemId(gpuReferenceFixtures, "dev-gpu-alpha"),
			pcbNumber: "DEV-PCB-004",
			housingNumber: null,
		},
		leverage: noLeverage,
		cover: {
			...noCover,
			aCover: requireCatalogItemId(coverCatalog, "cover-al-plate"),
		},
		modelRegulatory: noModelRegulatory,
		mechanical: noMechanical,
		other: {
			remark: "DEV Working Draft review scenario",
		},
	},
	identityAliases: [],
	schedule: {
		publishedVersions: [devProject004PublishedV1],
		workingDraft: devProject004Draft,
	},
	team: devProject004Team,
};

const devProject005PublishedV1: PublishedScheduleVersion = {
	id: toScheduleVersionId("dev-project-005-schedule-v1"),
	versionNumber: toScheduleVersionNumber(1),
	versionNote: "DEV initial schedule",
	publishedAt: "2026-09-05T00:00:00Z",
	milestones: [
		{
			rowId: toMilestoneRowId("dev-project-005-v1-row-mdrr"),
			milestoneDefinitionId: requireMilestoneDefinitionId("milestone-mdrr"),
			applicability: "applicable",
			plan: fixtureDate("2026-09-01"),
			actual: null,
		},
	],
};

const devProject005Team: ProjectTeam = {
	projectRoles: {
		qciPm: {
			assignmentId: toPersonAssignmentId("dev-project-005-qci-pm"),
			name: "DEV Project 005 QCI PM",
			email: "project.005.qci.pm@example.test",
		},
		qciPjm: {
			assignmentId: toPersonAssignmentId("dev-project-005-qci-pjm"),
			name: "DEV Project 005 QCI PjM",
			email: "project.005.qci.pjm@example.test",
		},
		acerPm: {
			assignmentId: toPersonAssignmentId("dev-project-005-acer-pm"),
			name: "DEV Project 005 Acer PM",
			email: "project.005.acer.pm@example.test",
		},
	},
	functions: [
		{
			function: {
				kind: "standard",
				functionId: devMeTeamFunctionDefinition.id,
			},
			applicability: "applicable",
			assignments: [
				{
					assignmentId: toPersonAssignmentId(
						"dev-project-005-me-leader",
					),
					role: "leader",
					name: "DEV Project 005 ME Leader",
					email: "project.005.me.leader@example.test",
				},
			],
		},
		{
			function: {
				kind: "standard",
				functionId: devEeTeamFunctionDefinition.id,
			},
			applicability: "applicable",
			assignments: [
				{
					assignmentId: toPersonAssignmentId(
						"dev-project-005-ee-owner",
					),
					role: "owner",
					name: "DEV Project 005 EE Owner",
					email: "project.005.ee.owner@example.test",
				},
			],
		},
		{
			function: {
				kind: "standard",
				functionId: devThermalTeamFunctionDefinition.id,
			},
			applicability: "notApplicable",
			assignments: [],
		},
		{
			function: {
				kind: "standard",
				functionId: devBiosTeamFunctionDefinition.id,
			},
			applicability: "applicable",
			assignments: [
				{
					assignmentId: toPersonAssignmentId(
						"dev-project-005-bios-owner",
					),
					role: "owner",
					name: "DEV Project 005 BIOS Owner",
					email: "project.005.bios.owner@example.test",
				},
			],
		},
		{
			function: {
				kind: "custom",
				functionId: toTeamFunctionId("dev-project-005-custom-audio"),
				displayName: "DEV Custom Audio",
			},
			applicability: "applicable",
			assignments: [
				{
					assignmentId: toPersonAssignmentId(
						"dev-project-005-custom-audio-owner",
					),
					role: "owner",
					name: "DEV Project 005 Audio Owner",
					email: "project.005.audio.owner@example.test",
				},
			],
		},
	],
	appliedTemplate: {
		templateId: devTeamTemplateV2.id,
		versionNumber: devTeamTemplateV2.versionNumber,
	},
};

export const devProject005: Project = {
	id: toProjectId("dev-project-005"),
	master: {
		basicInformation: {
			status: requireCatalogItemId(statusCatalog, "status-mp"),
			year: 2028,
			customer: requireCatalogItemId(
				customerReferenceFixtures,
				"dev-customer-b",
			),
			category: requireCatalogItemId(
				categoryReferenceFixtures,
				"dev-category-notebook",
			),
			productLine: requireCatalogItemId(
				productLineReferenceFixtures,
				"dev-product-line-beta",
			),
			panelSize: requireCatalogItemId(
				panelSizeReferenceFixtures,
				"dev-panel-size-16",
			),
			stnProjectName: "Signal_A",
			qciModelName: "DEV-QCI-SIGNAL-A",
		},
		platformHardware: {
			cpu: requireCatalogItemId(cpuReferenceFixtures, "dev-cpu-alpha"),
			gpu: requireCatalogItemId(gpuReferenceFixtures, "dev-gpu-beta"),
			pcbNumber: "DEV-PCB-005",
			housingNumber: "DEV-HOUSING-005",
		},
		leverage: noLeverage,
		cover: {
			...noCover,
			aCover: requireCatalogItemId(coverCatalog, "cover-p-r"),
		},
		modelRegulatory: noModelRegulatory,
		mechanical: noMechanical,
		other: {
			remark: "DEV punctuation and Team advisory scenario",
		},
	},
	identityAliases: [],
	schedule: {
		publishedVersions: [devProject005PublishedV1],
		workingDraft: null,
	},
	team: devProject005Team,
};

export const canonicalProjectFixtures: readonly Project[] = [
	devProject001,
	devProject002,
	devProject003,
	devProject004,
	devProject005,
];
