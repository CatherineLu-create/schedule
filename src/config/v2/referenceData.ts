import type { CatalogItem } from "../../domain/reference-data/catalog";
import type { MilestoneDefinition } from "../../domain/schedule/milestoneCatalog";
import type {
  CatalogItemId,
  MilestoneDefinitionId,
  MilestoneTypeId,
  StageGroupId,
  TeamFunctionId,
} from "../../domain/shared/ids";
import {
  toCatalogItemId,
  toMilestoneDefinitionId,
  toMilestoneTypeId,
  toStageGroupId,
  toTeamFunctionId,
} from "../../domain/shared/ids";

export const qciMeTeamFunctionDefinition: CatalogItem<TeamFunctionId> = {
  id: toTeamFunctionId("team-function-qci-me"),
  displayName: "QCI-ME",
  aliases: [],
  active: true,
  reviewStatus: "reviewed",
};

export const qciEeTeamFunctionDefinition: CatalogItem<TeamFunctionId> = {
  id: toTeamFunctionId("team-function-qci-ee"),
  displayName: "QCI-EE",
  aliases: [],
  active: true,
  reviewStatus: "reviewed",
};

export const qciThermalTeamFunctionDefinition: CatalogItem<TeamFunctionId> = {
  id: toTeamFunctionId("team-function-qci-thermal"),
  displayName: "QCI-Thermal",
  aliases: [],
  active: true,
  reviewStatus: "reviewed",
};

export const qciBiosTeamFunctionDefinition: CatalogItem<TeamFunctionId> = {
  id: toTeamFunctionId("team-function-qci-bios"),
  displayName: "QCI-BIOS",
  aliases: [],
  active: true,
  reviewStatus: "reviewed",
};

export const teamFunctionCatalog: readonly CatalogItem<TeamFunctionId>[] = [
  qciMeTeamFunctionDefinition,
  qciEeTeamFunctionDefinition,
  qciThermalTeamFunctionDefinition,
  qciBiosTeamFunctionDefinition,
];

const stageGroupIds = {
  design: toStageGroupId("stage-design"),
  mePortion: toStageGroupId("stage-me-portion"),
  thermal: toStageGroupId("stage-thermal"),
  a1: toStageGroupId("stage-a1"),
  aA2: toStageGroupId("stage-a-a2"),
  c1: toStageGroupId("stage-c1"),
  c2: toStageGroupId("stage-c2"),
  ramp: toStageGroupId("stage-ramp"),
  mdrr: toStageGroupId("stage-mdrr"),
} as const;

const milestoneTypeIds = {
  kickoff: toMilestoneTypeId("type-kickoff"),
  idFix: toMilestoneTypeId("type-id-fix"),
  meDrawing: toMilestoneTypeId("type-me-drawing"),
  mockupDfm: toMilestoneTypeId("type-mockup-dfm"),
  tooling: toMilestoneTypeId("type-tooling"),
  meMaterial: toMilestoneTypeId("type-me-material"),
  thermalModule: toMilestoneTypeId("type-thermal-module"),
  go: toMilestoneTypeId("type-g-o"),
  smt: toMilestoneTypeId("type-smt"),
  test: toMilestoneTypeId("type-test"),
  close: toMilestoneTypeId("type-close"),
  preBuild: toMilestoneTypeId("type-pre-build"),
  mainBuild: toMilestoneTypeId("type-main-build"),
  systemBuild: toMilestoneTypeId("type-system-build"),
  biosFrozen: toMilestoneTypeId("type-bios-frozen"),
  goldenRun: toMilestoneTypeId("type-golden-run"),
  meSignoff: toMilestoneTypeId("type-me-signoff"),
  fcs: toMilestoneTypeId("type-fcs"),
  mdrr: toMilestoneTypeId("type-mdrr"),
} as const;

export const dashboardAttentionMilestoneTypeIds: readonly MilestoneTypeId[] = [
  milestoneTypeIds.go,
  milestoneTypeIds.smt,
  milestoneTypeIds.close,
  milestoneTypeIds.mdrr,
];

export const statusCatalog: readonly CatalogItem<CatalogItemId>[] = [
  {
    id: toCatalogItemId("status-rfq"),
    displayName: "RFQ",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: toCatalogItemId("status-kick-off"),
    displayName: "Kick off",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: toCatalogItemId("status-pending"),
    displayName: "Pending",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: toCatalogItemId("status-on-going"),
    displayName: "On Going",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: toCatalogItemId("status-mp"),
    displayName: "MP",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: toCatalogItemId("status-eol"),
    displayName: "EOL",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
];

export const coverCatalog: readonly CatalogItem<CatalogItemId>[] = [
  {
    id: toCatalogItemId("cover-plastic-paint"),
    displayName: "Plastic-Paint",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: toCatalogItemId("cover-plastic-texture"),
    displayName: "Plastic-Texture",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: toCatalogItemId("cover-al-plate"),
    displayName: "Al-plate",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: toCatalogItemId("cover-mg-al"),
    displayName: "Mg-Al",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: toCatalogItemId("cover-mg-plate"),
    displayName: "Mg-plate",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: toCatalogItemId("cover-p-r"),
    displayName: "P+R",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: toCatalogItemId("cover-imr"),
    displayName: "IMR",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
];

export const stageGroupCatalog: readonly CatalogItem<StageGroupId>[] = [
  {
    id: stageGroupIds.design,
    displayName: "Design",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: stageGroupIds.mePortion,
    displayName: "ME Portion",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: stageGroupIds.thermal,
    displayName: "Thermal",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: stageGroupIds.a1,
    displayName: "A1-stage",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: stageGroupIds.aA2,
    displayName: "A2-stage",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: stageGroupIds.c1,
    displayName: "C1-stage",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: stageGroupIds.c2,
    displayName: "C2-stage",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: stageGroupIds.ramp,
    displayName: "RAMP-stage",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: stageGroupIds.mdrr,
    displayName: "MDRR",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
];

export const milestoneTypeCatalog: readonly CatalogItem<MilestoneTypeId>[] = [
  {
    id: milestoneTypeIds.kickoff,
    displayName: "Kickoff",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: milestoneTypeIds.idFix,
    displayName: "ID Fix",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: milestoneTypeIds.meDrawing,
    displayName: "ME Drawing",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: milestoneTypeIds.mockupDfm,
    displayName: "Mockup & DFM",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: milestoneTypeIds.tooling,
    displayName: "Tooling",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: milestoneTypeIds.meMaterial,
    displayName: "ME Material",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: milestoneTypeIds.thermalModule,
    displayName: "Thermal Module",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: milestoneTypeIds.go,
    displayName: "G/O",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: milestoneTypeIds.smt,
    displayName: "SMT",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: milestoneTypeIds.test,
    displayName: "Test",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: milestoneTypeIds.close,
    displayName: "Close",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: milestoneTypeIds.preBuild,
    displayName: "Pre-build",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: milestoneTypeIds.mainBuild,
    displayName: "Main Build",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: milestoneTypeIds.systemBuild,
    displayName: "System Build",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: milestoneTypeIds.biosFrozen,
    displayName: "BIOS Frozen",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: milestoneTypeIds.goldenRun,
    displayName: "Golden Run",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: milestoneTypeIds.meSignoff,
    displayName: "ME Signoff",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: milestoneTypeIds.fcs,
    displayName: "FCS",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
  {
    id: milestoneTypeIds.mdrr,
    displayName: "MDRR",
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  },
];

function milestoneDefinition(
  id: MilestoneDefinitionId,
  name: string,
  stageGroupId: StageGroupId,
  milestoneTypeId: MilestoneTypeId,
  displayOrder: number,
  active: boolean,
  showInPortfolio: boolean,
): MilestoneDefinition {
  return {
    id,
    name,
    stageGroupId,
    milestoneTypeId,
    displayOrder,
    active,
    reviewStatus: "reviewed",
    aliases: [],
    showInPortfolio,
  };
}

const activePortfolioMilestone = (
  id: MilestoneDefinitionId,
  name: string,
  stageGroupId: StageGroupId,
  milestoneTypeId: MilestoneTypeId,
  displayOrder: number,
): MilestoneDefinition =>
  milestoneDefinition(id, name, stageGroupId, milestoneTypeId, displayOrder, true, true);

const compatibilityMilestone = (
  id: MilestoneDefinitionId,
  name: string,
  stageGroupId: StageGroupId,
  milestoneTypeId: MilestoneTypeId,
  displayOrder: number,
): MilestoneDefinition =>
  milestoneDefinition(id, name, stageGroupId, milestoneTypeId, displayOrder, false, false);

export const portfolioMilestoneDefinitions: readonly MilestoneDefinition[] = [
  activePortfolioMilestone(toMilestoneDefinitionId("milestone-design-kickoff"), "Kickoff", stageGroupIds.design, milestoneTypeIds.kickoff, 10),
  activePortfolioMilestone(toMilestoneDefinitionId("milestone-design-id-fix"), "ID fix", stageGroupIds.design, milestoneTypeIds.idFix, 20),
  activePortfolioMilestone(toMilestoneDefinitionId("milestone-me-portion-me-drawing"), "ME drawing", stageGroupIds.mePortion, milestoneTypeIds.meDrawing, 30),
  activePortfolioMilestone(toMilestoneDefinitionId("milestone-me-portion-mockup-dfm"), "Mockup & DFM", stageGroupIds.mePortion, milestoneTypeIds.mockupDfm, 40),
  activePortfolioMilestone(toMilestoneDefinitionId("milestone-me-portion-tooling-start-t1"), "Tooling start + T1", stageGroupIds.mePortion, milestoneTypeIds.tooling, 50),
  activePortfolioMilestone(toMilestoneDefinitionId("milestone-me-portion-me-material-c"), "ME material for C", stageGroupIds.mePortion, milestoneTypeIds.meMaterial, 60),
  activePortfolioMilestone(toMilestoneDefinitionId("milestone-thermal-module-c"), "Thermal module for C", stageGroupIds.thermal, milestoneTypeIds.thermalModule, 70),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-a1-a-g-o"),
    "A1 G/O",
    stageGroupIds.a1,
    milestoneTypeIds.go,
    80,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-a1-a-smt"),
    "A1 SMT",
    stageGroupIds.a1,
    milestoneTypeIds.smt,
    90,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-a1-a-test"),
    "A1 Test",
    stageGroupIds.a1,
    milestoneTypeIds.test,
    100,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-a1-a-close"),
    "A1 Close",
    stageGroupIds.a1,
    milestoneTypeIds.close,
    110,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-c1-c-g-o"),
    "C1 G/O",
    stageGroupIds.c1,
    milestoneTypeIds.go,
    120,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-c1-c-smt"),
    "C1 SMT",
    stageGroupIds.c1,
    milestoneTypeIds.smt,
    130,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-c1-c-pre-build"),
    "C1 Pre-Build",
    stageGroupIds.c1,
    milestoneTypeIds.preBuild,
    140,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-c1-c-main-build"),
    "C1 System Build",
    stageGroupIds.c1,
    milestoneTypeIds.systemBuild,
    150,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-c1-c-test"),
    "C1 Test",
    stageGroupIds.c1,
    milestoneTypeIds.test,
    160,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-c1-close"),
    "C1 Close",
    stageGroupIds.c1,
    milestoneTypeIds.close,
    170,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-c2-c-g-o"),
    "C2 G/O",
    stageGroupIds.c2,
    milestoneTypeIds.go,
    180,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-c2-c-smt"),
    "C2 SMT",
    stageGroupIds.c2,
    milestoneTypeIds.smt,
    190,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-c2-c-pre-build"),
    "C2 Pre-Build",
    stageGroupIds.c2,
    milestoneTypeIds.preBuild,
    200,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-c2-c-main-build"),
    "C2 System Build",
    stageGroupIds.c2,
    milestoneTypeIds.systemBuild,
    210,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-c2-c-test"),
    "C2 Test",
    stageGroupIds.c2,
    milestoneTypeIds.test,
    220,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-c2-c-close"),
    "C2 Close",
    stageGroupIds.c2,
    milestoneTypeIds.close,
    230,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-ramp-g-o"),
    "RAMP G/O",
    stageGroupIds.ramp,
    milestoneTypeIds.go,
    240,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-ramp-me-signoff"),
    "ME signoff",
    stageGroupIds.ramp,
    milestoneTypeIds.meSignoff,
    250,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-ramp-smt"),
    "RAMP SMT",
    stageGroupIds.ramp,
    milestoneTypeIds.smt,
    260,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-ramp-pre-build"),
    "RAMP Pre-build",
    stageGroupIds.ramp,
    milestoneTypeIds.preBuild,
    270,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-ramp-main-build"),
    "RAMP Main build",
    stageGroupIds.ramp,
    milestoneTypeIds.mainBuild,
    280,
  ),
  activePortfolioMilestone(
    toMilestoneDefinitionId("milestone-ramp-fcs"),
    "FCS",
    stageGroupIds.ramp,
    milestoneTypeIds.fcs,
    290,
  ),
];

export const mdrrMilestoneDefinition: MilestoneDefinition = {
  id: toMilestoneDefinitionId("milestone-mdrr"),
  name: "MDRR",
  stageGroupId: stageGroupIds.mdrr,
  milestoneTypeId: milestoneTypeIds.mdrr,
  displayOrder: 300,
  active: true,
  reviewStatus: "reviewed",
  aliases: [],
  showInPortfolio: false,
};

export const activeMilestoneDefinitions: readonly MilestoneDefinition[] = [
  ...portfolioMilestoneDefinitions,
  mdrrMilestoneDefinition,
];

export const compatibilityOnlyMilestoneDefinitions: readonly MilestoneDefinition[] = [
  compatibilityMilestone(toMilestoneDefinitionId("milestone-a-a2-a-g-o"), "A G/O", stageGroupIds.aA2, milestoneTypeIds.go, 310),
  compatibilityMilestone(toMilestoneDefinitionId("milestone-a-a2-a-smt"), "A-SMT", stageGroupIds.aA2, milestoneTypeIds.smt, 320),
  compatibilityMilestone(toMilestoneDefinitionId("milestone-a-a2-a-test"), "A-Test", stageGroupIds.aA2, milestoneTypeIds.test, 330),
  compatibilityMilestone(toMilestoneDefinitionId("milestone-a-a2-a-close"), "A-Close", stageGroupIds.aA2, milestoneTypeIds.close, 340),
  compatibilityMilestone(toMilestoneDefinitionId("milestone-c2-bios-frozen"), "BIOS frozen", stageGroupIds.c2, milestoneTypeIds.biosFrozen, 350),
  compatibilityMilestone(toMilestoneDefinitionId("milestone-c2-golden-run"), "Golden Run", stageGroupIds.c2, milestoneTypeIds.goldenRun, 360),
];

export const milestoneDefinitions: readonly MilestoneDefinition[] = [
  ...activeMilestoneDefinitions,
  ...compatibilityOnlyMilestoneDefinitions,
];
