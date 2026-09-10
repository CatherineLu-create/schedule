import { milestoneDefinitions } from "../../config/v2/referenceData";
import {
  createEmptyCanonicalProjectSchedule,
  type CanonicalProjectSchedule,
} from "../../domain/schedule/officialSchedule";
import { toScheduleVersionNumber } from "../../domain/schedule/schedule";
import { parseDateOnly, type DateOnly } from "../../domain/shared/dateOnly";
import {
  toMilestoneDefinitionId,
  toMilestoneId,
  toProjectId,
  type MilestoneDefinitionId,
} from "../../domain/shared/ids";

function fixtureDate(value: string): DateOnly {
  const parsed = parseDateOnly(value);

  if (parsed === null) {
    throw new Error(`Invalid canonical Schedule fixture DateOnly: ${value}`);
  }

  return parsed;
}

function requireMilestoneDefinitionId(idValue: string): MilestoneDefinitionId {
  const id = toMilestoneDefinitionId(idValue);
  const definition = milestoneDefinitions.find(
    (candidate) => candidate.id === id,
  );

  if (definition === undefined) {
    throw new Error(`Missing canonical milestone definition: ${idValue}`);
  }

  return definition.id;
}

export const devSchedule001 = createEmptyCanonicalProjectSchedule(
  toProjectId("dev-project-001"),
);

export const devSchedule002: CanonicalProjectSchedule = {
  projectId: toProjectId("dev-project-002"),
  publishedVersions: [
    {
      versionNumber: toScheduleVersionNumber(1),
      versionNote: "DEV initial official Schedule",
      publishedAt: "2026-08-20T00:00:00Z",
      milestones: [
        {
          milestoneId: toMilestoneId(
            "dev-project-002-milestone-design-kickoff",
          ),
          milestoneDefinitionId: requireMilestoneDefinitionId(
            "milestone-design-kickoff",
          ),
          applicability: "applicable",
          plan: fixtureDate("2026-08-15"),
          actual: fixtureDate("2026-08-18"),
        },
      ],
    },
  ],
};

const devProject003ContinuingMilestoneId = toMilestoneId(
  "dev-project-003-milestone-c1-go",
);

export const devSchedule003: CanonicalProjectSchedule = {
  projectId: toProjectId("dev-project-003"),
  publishedVersions: [
    {
      versionNumber: toScheduleVersionNumber(3),
      versionNote: "DEV current official Schedule",
      publishedAt: "2026-09-10T00:00:00Z",
      milestones: [
        {
          milestoneId: devProject003ContinuingMilestoneId,
          milestoneDefinitionId: requireMilestoneDefinitionId(
            "milestone-c1-c-g-o",
          ),
          applicability: "applicable",
          plan: fixtureDate("2026-10-05"),
          actual: null,
        },
        {
          milestoneId: toMilestoneId(
            "dev-project-003-milestone-c1-smt",
          ),
          milestoneDefinitionId: requireMilestoneDefinitionId(
            "milestone-c1-c-smt",
          ),
          applicability: "applicable",
          plan: fixtureDate("2026-10-15"),
          actual: null,
        },
      ],
    },
    {
      versionNumber: toScheduleVersionNumber(1),
      versionNote: "DEV initial official Schedule",
      publishedAt: "2026-08-25T00:00:00Z",
      milestones: [
        {
          milestoneId: devProject003ContinuingMilestoneId,
          milestoneDefinitionId: requireMilestoneDefinitionId(
            "milestone-c1-c-g-o",
          ),
          applicability: "applicable",
          plan: fixtureDate("2026-09-30"),
          actual: null,
        },
      ],
    },
  ],
};

export const devSchedule004: CanonicalProjectSchedule = {
  projectId: toProjectId("dev-project-004"),
  publishedVersions: [
    {
      versionNumber: toScheduleVersionNumber(1),
      versionNote: "DEV Published Schedule with no milestones",
      publishedAt: "2026-09-05T00:00:00Z",
      milestones: [],
    },
  ],
};

export const devSchedule005 = createEmptyCanonicalProjectSchedule(
  toProjectId("dev-project-005"),
);

export const canonicalScheduleFixtures: readonly CanonicalProjectSchedule[] =
  [
    devSchedule001,
    devSchedule002,
    devSchedule003,
    devSchedule004,
    devSchedule005,
  ];
