import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { CurrentPublishedScheduleRead } from "./application/selectors/scheduleSelectors";
import type { CanonicalPublishedScheduleVersion } from "./domain/schedule/officialSchedule";
import { toScheduleVersionNumber } from "./domain/schedule/schedule";
import { toMilestoneId } from "./domain/shared/ids";
import { OfficialScheduleView } from "./officialScheduleView";

afterEach(cleanup);

function publishedVersion(
  versionNumber: number,
): CanonicalPublishedScheduleVersion {
  return {
    versionNumber: toScheduleVersionNumber(versionNumber),
    versionNote: null,
    publishedAt: `published-${versionNumber}`,
    milestones: [],
  };
}

describe("OfficialScheduleView", () => {
  it("renders Schedule integrity failure as unavailable", () => {
    render(
      <OfficialScheduleView
        read={{
          kind: "unavailable",
          issues: [
            {
              code: "schedule.integrity.missing-schedule",
              domain: "schedule",
              source: "data",
              severity: "blocking",
              message: "Selected Project has no canonical Schedule.",
              target: { section: "schedule" },
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Schedule data unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No published schedule")).not.toBeInTheDocument();
  });

  it("renders valid empty Published history without a fake version", () => {
    render(
      <OfficialScheduleView read={{ kind: "noPublishedSchedule" }} />,
    );

    expect(screen.getByRole("region", { name: "Current Schedule" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Current Schedule" })).toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.queryByText("No published schedule")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Published v/)).not.toBeInTheDocument();
    expect(screen.queryByText("Schedule data unavailable")).not.toBeInTheDocument();
  });

  it("distinguishes a Published version with no milestones", () => {
    const version = publishedVersion(1);
    const read: CurrentPublishedScheduleRead = {
      kind: "published",
      version,
      versionLabel: "Published v01",
      milestoneRows: [],
    };

    render(<OfficialScheduleView read={read} />);

    expect(screen.getByText("Published v01")).toBeInTheDocument();
    expect(screen.getByText("No milestones")).toBeInTheDocument();
    expect(screen.queryByText("No published schedule")).not.toBeInTheDocument();
  });

  it("renders five read-only business columns with applicability beside each milestone", () => {
    const version = publishedVersion(3);
    const read: CurrentPublishedScheduleRead = {
      kind: "published",
      version,
      versionLabel: "Published v03",
      milestoneRows: [
        {
          milestoneId: toMilestoneId("milestone-applicable"),
          phase: "-",
          stage: "Design",
          milestone: "Kickoff",
          applicability: "applicable",
          plan: "2026/10/05",
          actual: "-",
        },
        {
          milestoneId: toMilestoneId("milestone-not-applicable"),
          phase: "-",
          stage: "C1-stage",
          milestone: "C-SMT",
          applicability: "notApplicable",
          plan: "-",
          actual: "2026/10/15",
        },
      ],
    };

    render(<OfficialScheduleView read={read} />);

    expect(screen.getByText("Published v03")).toBeInTheDocument();
    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual(["Phase", "Stage", "Milestone", "Plan", "Actual"]);
    expect(
      screen.queryByRole("columnheader", { name: "Applicability" }),
    ).not.toBeInTheDocument();

    const applicableRow = screen.getByRole("row", {
      name: /Design Kickoff Applicable 2026\/10\/05/,
    });
    expect(within(applicableRow).getByText("Kickoff")).toBeInTheDocument();
    expect(within(applicableRow).getByText("Applicable")).toBeInTheDocument();

    const notApplicableRow = screen.getByRole("row", {
      name: /C1-stage C-SMT Not Applicable - 2026\/10\/15/,
    });
    expect(within(notApplicableRow).getByText("C-SMT")).toBeInTheDocument();
    expect(
      within(notApplicableRow).getByText("Not Applicable"),
    ).toBeInTheDocument();

    for (const forbiddenControl of [
      "Edit Schedule",
      "Create Draft",
      "Publish",
      "Rollback",
      "Version History",
    ]) {
      expect(
        screen.queryByRole("button", { name: forbiddenControl }),
      ).not.toBeInTheDocument();
    }
  });
});
