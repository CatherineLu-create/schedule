import { describe, expect, expectTypeOf, it } from "vitest";

import type { Project } from "../../domain/project/project";
import type { CanonicalProjectSchedule } from "../../domain/schedule/officialSchedule";
import { canonicalProjectFixtures } from "../../fixtures/v2/canonicalProjectFixtures";
import { canonicalScheduleFixtures } from "../../fixtures/v2/canonicalScheduleFixtures";
import type { PrototypeState } from "./prototypeState";

describe("PrototypeState", () => {
  it("owns exactly the canonical Project and Schedule collections", () => {
    const state = {
      projects: canonicalProjectFixtures,
      schedules: canonicalScheduleFixtures,
    } as PrototypeState;

    expect(Object.keys(state)).toEqual(["projects", "schedules"]);
    expect(state.projects).toBe(canonicalProjectFixtures);
    expect(state.schedules).toBe(canonicalScheduleFixtures);
  });

  it("exposes both canonical collections as readonly", () => {
    expectTypeOf<PrototypeState["projects"]>().toEqualTypeOf<
      readonly Project[]
    >();
    expectTypeOf<PrototypeState["schedules"]>().toEqualTypeOf<
      readonly CanonicalProjectSchedule[]
    >();
  });
});
