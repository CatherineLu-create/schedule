import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { App } from "./main";
import { canonicalProjectFixtures } from "./fixtures/v2/canonicalProjectFixtures";
import { canonicalScheduleFixtures } from "./fixtures/v2/canonicalScheduleFixtures";
import { toCatalogItemId } from "./domain/shared/ids";

afterEach(cleanup);

// Catches a rejected confirmation leaving the obsolete review visible and hiding
// the fresh blocker. The mutable supplied snapshot simulates a concurrent rename.
it("returns stale Regression duplicate confirmation to the retained form with its current blocker", () => {
  const counterpart = { ...canonicalProjectFixtures[0]!, master: { ...canonicalProjectFixtures[0]!.master,
    basicInformation: { ...canonicalProjectFixtures[0]!.master.basicInformation, year: 2030, productLine: toCatalogItemId("dev-product-line-beta") } } };
  const projects = [counterpart, ...canonicalProjectFixtures.slice(1)];
  render(<App initialState={{ projects, schedules: canonicalScheduleFixtures }} />);
  fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
  const dialog = () => screen.getByRole("dialog", { name: "Create Project" });
  for (const [label, value] of [["Year", "2030"], ["Product Line", "dev-product-line-beta"], ["STN Project Name", "Manta"], ["Project Type", "regression"]]) {
    fireEvent.change(within(dialog()).getByLabelText(label), { target: { value } });
  }
  fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
  expect(within(dialog()).getByRole("button", { name: "Create Anyway" })).toBeVisible();
  projects[0] = { ...counterpart, master: { ...counterpart.master, basicInformation: { ...counterpart.master.basicInformation, stnProjectName: "Renamed counterpart" } } };
  fireEvent.click(within(dialog()).getByRole("button", { name: "Create Anyway" }));
  expect(within(dialog()).getByText("Regression requires another Project with the same STN Project Name.")).toBeVisible();
  expect(within(dialog()).queryByRole("button", { name: "Create Anyway" })).toBeNull();
  expect(within(dialog()).getByLabelText("Project Type")).toHaveValue("regression");
  expect(within(dialog()).getByLabelText("STN Project Name")).toHaveValue("Manta");
  expect(projects).toHaveLength(canonicalProjectFixtures.length);
});
