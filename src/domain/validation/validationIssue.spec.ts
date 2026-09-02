import { describe, expect, it } from "vitest";

import {
  countBlocking,
  filterIssuesByDomain,
  isBlocking,
  type ValidationIssue,
} from "./validationIssue";

const scheduleImportBlocking: ValidationIssue = {
  code: "schedule.import.unmapped-milestone",
  domain: "schedule",
  source: "import",
  severity: "blocking",
  message: "Map the imported milestone before publishing.",
  target: {
    section: "workingDraft",
    entityId: "draft-row-001",
    field: "milestoneDefinitionId",
  },
};

const teamDataAdvisory: ValidationIssue = {
  code: "team.data.owner-missing",
  domain: "team",
  source: "data",
  severity: "advisory",
  message: "The applicable function has no Owner.",
  target: {
    section: "functionTeams",
    entityId: "function-me",
    field: "owner",
  },
};

describe("ValidationIssue", () => {
  it("represents an import Blocking issue with a semantic target", () => {
    expect(scheduleImportBlocking).toMatchObject({
      code: "schedule.import.unmapped-milestone",
      domain: "schedule",
      source: "import",
      severity: "blocking",
      target: {
        section: "workingDraft",
        entityId: "draft-row-001",
        field: "milestoneDefinitionId",
      },
    });
    expect(isBlocking(scheduleImportBlocking)).toBe(true);
  });

  it("represents a data Advisory issue", () => {
    expect(teamDataAdvisory.source).toBe("data");
    expect(teamDataAdvisory.severity).toBe("advisory");
    expect(isBlocking(teamDataAdvisory)).toBe(false);
  });

  it("counts only Blocking severity across domains and sources", () => {
    const teamBlocking: ValidationIssue = {
      ...teamDataAdvisory,
      code: "team.data.multiple-owners",
      severity: "blocking",
    };

    expect(
      countBlocking([
        scheduleImportBlocking,
        teamDataAdvisory,
        teamBlocking,
      ]),
    ).toBe(2);
  });

  it("filters issues by their affected domain", () => {
    const projectMasterAdvisory: ValidationIssue = {
      code: "project-master.data.basic-information-incomplete",
      domain: "projectMaster",
      source: "data",
      severity: "advisory",
      message: "Basic Information is incomplete.",
      target: { section: "basicInformation" },
    };

    expect(
      filterIssuesByDomain(
        [scheduleImportBlocking, teamDataAdvisory, projectMasterAdvisory],
        "team",
      ),
    ).toEqual([teamDataAdvisory]);
  });

  it("distinguishes Schedule Blocking from Team Blocking", () => {
    const teamBlocking: ValidationIssue = {
      ...teamDataAdvisory,
      code: "team.data.na-with-assignments",
      severity: "blocking",
    };
    const issues = [scheduleImportBlocking, teamBlocking];

    expect(filterIssuesByDomain(issues, "schedule")).toEqual([
      scheduleImportBlocking,
    ]);
    expect(filterIssuesByDomain(issues, "team")).toEqual([teamBlocking]);
    expect(countBlocking(filterIssuesByDomain(issues, "schedule"))).toBe(1);
    expect(countBlocking(filterIssuesByDomain(issues, "team"))).toBe(1);
  });
});
