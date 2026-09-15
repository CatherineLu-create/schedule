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

export const devSchedule001: CanonicalProjectSchedule = {
  projectId: toProjectId("dev-project-001"),
  publishedVersions: [
    {
      versionNumber: toScheduleVersionNumber(1),
      versionNote: "Manta demo official Schedule",
      publishedAt: "2026-09-14T00:00:00Z",
      milestones: [
        {
          milestoneId: toMilestoneId(
            "dev-project-001-milestone-design-kickoff",
          ),
          milestoneDefinitionId: requireMilestoneDefinitionId(
            "milestone-design-kickoff",
          ),
          applicability: "applicable",
          plan: fixtureDate("2026-09-18"),
          actual: fixtureDate("2026-09-19"),
        },
        {
          milestoneId: toMilestoneId("dev-project-001-milestone-design-id-fix"),
          milestoneDefinitionId: requireMilestoneDefinitionId("milestone-design-id-fix"),
          applicability: "applicable",
          plan: fixtureDate("2026-09-25"),
          actual: null,
        },
        {
          milestoneId: toMilestoneId("dev-project-001-milestone-me-drawing"),
          milestoneDefinitionId: requireMilestoneDefinitionId("milestone-me-portion-me-drawing"),
          applicability: "applicable",
          plan: fixtureDate("2026-10-02"),
          actual: null,
        },
        {
          milestoneId: toMilestoneId("dev-project-001-milestone-a-go"),
          milestoneDefinitionId: requireMilestoneDefinitionId("milestone-a1-a-g-o"),
          applicability: "applicable",
          plan: fixtureDate("2026-10-15"),
          actual: null,
        },
      ],
    },
  ],
};

export const devSchedule002 = createEmptyCanonicalProjectSchedule(
  toProjectId("dev-project-002"),
);

export const devSchedule003 = createEmptyCanonicalProjectSchedule(
  toProjectId("dev-project-003"),
);

export const devSchedule004 = createEmptyCanonicalProjectSchedule(
  toProjectId("dev-project-004"),
);

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
