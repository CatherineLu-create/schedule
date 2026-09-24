import type { Project } from "../domain/project/project";
import type { ProjectMaster } from "../domain/project/projectMaster";
import type { CanonicalProjectSchedule } from "../domain/schedule/officialSchedule";
import { toScheduleVersionNumber } from "../domain/schedule/schedule";
import { addDays, type DateOnly } from "../domain/shared/dateOnly";
import {
  toCatalogItemId,
  toMilestoneDefinitionId,
  toMilestoneId,
  toProjectId,
  type MilestoneDefinitionId,
  type MilestoneId,
  type ProjectId,
} from "../domain/shared/ids";

export interface UserTrialDemoSeed {
  readonly projects: readonly Project[];
  readonly schedules: readonly CanonicalProjectSchedule[];
}

export const userTrialDemoProjectIds = {
  goDueSoon: toProjectId("user-trial-demo-project-go-due-soon"),
  smtOverdue: toProjectId("user-trial-demo-project-smt-overdue"),
  mdrrDueSoon: toProjectId("user-trial-demo-project-mdrr-due-soon"),
  completedMilestone: toProjectId(
    "user-trial-demo-project-completed-milestone",
  ),
} as const;

const userTrialDemoMilestoneIds = {
  goDueSoon: toMilestoneId("user-trial-demo-milestone-go-due-soon"),
  smtOverdue: toMilestoneId("user-trial-demo-milestone-smt-overdue"),
  mdrrDueSoon: toMilestoneId("user-trial-demo-milestone-mdrr-due-soon"),
  completedMilestone: toMilestoneId(
    "user-trial-demo-milestone-completed-smt",
  ),
} as const;

interface UserTrialDemoScenario {
  readonly projectId: ProjectId;
  readonly projectName: string;
  readonly qciModelName: string;
  readonly milestoneId: MilestoneId;
  readonly milestoneDefinitionId: MilestoneDefinitionId;
  readonly planOffsetDays: number;
  readonly actualOffsetDays: number | null;
}

const scenarios: readonly UserTrialDemoScenario[] = [
  {
    projectId: userTrialDemoProjectIds.goDueSoon,
    projectName: "DEMO - G/O Due Soon",
    qciModelName: "DEMO-GO-DUE-SOON",
    milestoneId: userTrialDemoMilestoneIds.goDueSoon,
    milestoneDefinitionId: toMilestoneDefinitionId("milestone-a1-a-g-o"),
    planOffsetDays: 5,
    actualOffsetDays: null,
  },
  {
    projectId: userTrialDemoProjectIds.smtOverdue,
    projectName: "DEMO - SMT Overdue",
    qciModelName: "DEMO-SMT-OVERDUE",
    milestoneId: userTrialDemoMilestoneIds.smtOverdue,
    milestoneDefinitionId: toMilestoneDefinitionId("milestone-a1-a-smt"),
    planOffsetDays: -7,
    actualOffsetDays: null,
  },
  {
    projectId: userTrialDemoProjectIds.mdrrDueSoon,
    projectName: "DEMO - MDRR Due Soon",
    qciModelName: "DEMO-MDRR-DUE-SOON",
    milestoneId: userTrialDemoMilestoneIds.mdrrDueSoon,
    milestoneDefinitionId: toMilestoneDefinitionId("milestone-mdrr"),
    planOffsetDays: 10,
    actualOffsetDays: null,
  },
  {
    projectId: userTrialDemoProjectIds.completedMilestone,
    projectName: "DEMO - Completed Milestone",
    qciModelName: "DEMO-COMPLETED-MILESTONE",
    milestoneId: userTrialDemoMilestoneIds.completedMilestone,
    milestoneDefinitionId: toMilestoneDefinitionId("milestone-a1-a-smt"),
    planOffsetDays: -3,
    actualOffsetDays: -2,
  },
];

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

function createDemoProject(
  scenario: UserTrialDemoScenario,
  referenceDate: DateOnly,
): Project {
  return {
    id: scenario.projectId,
    master: {
      basicInformation: {
        status: toCatalogItemId("status-on-going"),
        year: Number(referenceDate.slice(0, 4)),
        customer: toCatalogItemId("user-trial-demo-customer"),
        category: null,
        productLine: toCatalogItemId("demo-product-line-aspire-refresh-id"),
        panelSize: null,
        stnProjectName: scenario.projectName,
        qciModelName: scenario.qciModelName,
      },
      platformHardware: {
        cpu: null,
        gpu: null,
        pcbNumber: null,
        housingNumber: null,
      },
      leverage: noLeverage,
      cover: noCover,
      modelRegulatory: noModelRegulatory,
      mechanical: noMechanical,
      other: {
        remark: `User Trial demo seed: ${scenario.projectName}`,
      },
    },
    identityAliases: [],
    team: null,
  };
}

function createDemoSchedule(
  scenario: UserTrialDemoScenario,
  referenceDate: DateOnly,
): CanonicalProjectSchedule {
  return {
    projectId: scenario.projectId,
    publishedVersions: [
      {
        versionNumber: toScheduleVersionNumber(1),
        versionNote: "User Trial demo seed",
        publishedAt: `${referenceDate}T00:00:00.000Z`,
        milestones: [
          {
            milestoneId: scenario.milestoneId,
            milestoneDefinitionId: scenario.milestoneDefinitionId,
            applicability: "applicable",
            plan: addDays(referenceDate, scenario.planOffsetDays),
            actual: scenario.actualOffsetDays === null
              ? null
              : addDays(referenceDate, scenario.actualOffsetDays),
          },
        ],
      },
    ],
    workingDraft: null,
  };
}

export function createUserTrialDemoSeed(
  referenceDate: DateOnly,
): UserTrialDemoSeed {
  return {
    projects: scenarios.map((scenario) =>
      createDemoProject(scenario, referenceDate)),
    schedules: scenarios.map((scenario) =>
      createDemoSchedule(scenario, referenceDate)),
  };
}
