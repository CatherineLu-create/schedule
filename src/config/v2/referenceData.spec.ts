import { describe, expect, it } from "vitest";

import type { TeamFunctionDefinition } from "../../domain/team/teamTemplate";
import {
  activeMilestoneDefinitions,
  compatibilityOnlyMilestoneDefinitions,
  coverCatalog,
  dashboardAttentionMilestoneTypeIds,
  mdrrMilestoneDefinition,
  milestoneDefinitions,
  milestoneTypeCatalog,
  portfolioMilestoneDefinitions,
  qciBiosTeamFunctionDefinition,
  qciEeTeamFunctionDefinition,
  qciMeTeamFunctionDefinition,
  qciThermalTeamFunctionDefinition,
  stageGroupCatalog,
  statusCatalog,
  teamFunctionCatalog,
} from "./referenceData";

function expectUniqueIds(items: readonly { readonly id: string }[]): void {
  expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
}

function expectActiveReviewedItems(
  items: readonly {
    readonly active: boolean;
    readonly aliases: readonly string[];
    readonly reviewStatus: string;
  }[],
): void {
  for (const item of items) {
    expect(item).toMatchObject({
      active: true,
      aliases: [],
      reviewStatus: "reviewed",
    });
  }
}

function expectNoCatchAllValues(
  items: readonly { readonly displayName: string }[],
): void {
  for (const item of items) {
    expect(["Other", "Misc", "Unclassified"]).not.toContain(
      item.displayName,
    );
  }
}

describe("authoritative V2 reference data", () => {
  describe("Team Function catalog", () => {
    it("contains exactly the four approved standard Functions", () => {
      expect(teamFunctionCatalog).toEqual([
        {
          id: "team-function-qci-me",
          displayName: "QCI-ME",
          active: true,
          aliases: [],
          reviewStatus: "reviewed",
        },
        {
          id: "team-function-qci-ee",
          displayName: "QCI-EE",
          active: true,
          aliases: [],
          reviewStatus: "reviewed",
        },
        {
          id: "team-function-qci-thermal",
          displayName: "QCI-Thermal",
          active: true,
          aliases: [],
          reviewStatus: "reviewed",
        },
        {
          id: "team-function-qci-bios",
          displayName: "QCI-BIOS",
          active: true,
          aliases: [],
          reviewStatus: "reviewed",
        },
      ]);
    });

    it("uses unique IDs and names without Project Roles or unapproved units", () => {
      expectUniqueIds(teamFunctionCatalog);
      expect(new Set(teamFunctionCatalog.map(({ displayName }) => displayName)).size)
        .toBe(teamFunctionCatalog.length);
      expectActiveReviewedItems(teamFunctionCatalog);
      expect(teamFunctionCatalog.map(({ displayName }) => displayName)).not.toEqual(
        expect.arrayContaining([
          "QCI-PM",
          "QCI-PjM",
          "Acer PM",
          "QCMC",
          "EE ERD",
          "EE IQC",
          "EC",
          "RF",
          "SW Bundle",
        ]),
      );

      const definitions: readonly TeamFunctionDefinition[] = teamFunctionCatalog;
      expect(definitions).toBe(teamFunctionCatalog);
    });

    it("exposes named references to the same catalog objects", () => {
      expect(qciMeTeamFunctionDefinition).toBe(
        teamFunctionCatalog.find(({ id }) => id === "team-function-qci-me"),
      );
      expect(qciEeTeamFunctionDefinition).toBe(
        teamFunctionCatalog.find(({ id }) => id === "team-function-qci-ee"),
      );
      expect(qciThermalTeamFunctionDefinition).toBe(
        teamFunctionCatalog.find(({ id }) => id === "team-function-qci-thermal"),
      );
      expect(qciBiosTeamFunctionDefinition).toBe(
        teamFunctionCatalog.find(({ id }) => id === "team-function-qci-bios"),
      );
    });

    it("does not make the fixture-only DEV Legacy Function authoritative", () => {
      expect(teamFunctionCatalog.map(({ id }) => id)).not.toContain(
        "dev-team-function-legacy",
      );
    });
  });

  describe("Status catalog", () => {
    it("contains exactly the six approved values in their approved order", () => {
      expect(statusCatalog.map((item) => item.displayName)).toEqual([
        "RFQ",
        "Kick off",
        "Pending",
        "On Going",
        "MP",
        "EOL",
      ]);
    });

    it("uses explicit unique stable IDs for active reviewed items", () => {
      expect(statusCatalog.map((item) => item.id)).toEqual([
        "status-rfq",
        "status-kick-off",
        "status-pending",
        "status-on-going",
        "status-mp",
        "status-eol",
      ]);
      expectUniqueIds(statusCatalog);
      expectActiveReviewedItems(statusCatalog);
    });
  });

  describe("Cover catalog", () => {
    it("contains exactly the seven approved punctuated values in order", () => {
      expect(coverCatalog.map((item) => item.displayName)).toEqual([
        "Plastic-Paint",
        "Plastic-Texture",
        "Al-plate",
        "Mg-Al",
        "Mg-plate",
        "P+R",
        "IMR",
      ]);
    });

    it("uses explicit unique stable IDs for active reviewed items", () => {
      expect(coverCatalog.map((item) => item.id)).toEqual([
        "cover-plastic-paint",
        "cover-plastic-texture",
        "cover-al-plate",
        "cover-mg-al",
        "cover-mg-plate",
        "cover-p-r",
        "cover-imr",
      ]);
      expectUniqueIds(coverCatalog);
      expectActiveReviewedItems(coverCatalog);
    });
  });

  describe("Stage / Group catalog", () => {
    it("contains exactly the nine approved values in order", () => {
      expect(stageGroupCatalog.map((item) => item.displayName)).toEqual([
        "Design",
        "ME Portion",
        "Thermal",
        "A1-stage",
        "A/A2-stage",
        "C1-stage",
        "C2-stage",
        "RAMP-stage",
        "MDRR",
      ]);
    });

    it("uses explicit unique IDs without catch-all classifications", () => {
      expect(stageGroupCatalog.map((item) => item.id)).toEqual([
        "stage-design",
        "stage-me-portion",
        "stage-thermal",
        "stage-a1",
        "stage-a-a2",
        "stage-c1",
        "stage-c2",
        "stage-ramp",
        "stage-mdrr",
      ]);
      expectUniqueIds(stageGroupCatalog);
      expectActiveReviewedItems(stageGroupCatalog);
      expectNoCatchAllValues(stageGroupCatalog);
    });
  });

  describe("Milestone Type catalog", () => {
    it("contains exactly the required semantic types", () => {
      expect(milestoneTypeCatalog.map((item) => item.displayName)).toEqual([
        "Kickoff",
        "ID Fix",
        "ME Drawing",
        "Mockup & DFM",
        "Tooling",
        "ME Material",
        "Thermal Module",
        "G/O",
        "SMT",
        "Test",
        "Close",
        "Pre-build",
        "Main Build",
        "System Build",
        "BIOS Frozen",
        "Golden Run",
        "ME Signoff",
        "FCS",
        "MDRR",
      ]);
    });

    it("uses explicit unique IDs without catch-all classifications", () => {
      expect(milestoneTypeCatalog.map((item) => item.id)).toEqual([
        "type-kickoff",
        "type-id-fix",
        "type-me-drawing",
        "type-mockup-dfm",
        "type-tooling",
        "type-me-material",
        "type-thermal-module",
        "type-g-o",
        "type-smt",
        "type-test",
        "type-close",
        "type-pre-build",
        "type-main-build",
        "type-system-build",
        "type-bios-frozen",
        "type-golden-run",
        "type-me-signoff",
        "type-fcs",
        "type-mdrr",
      ]);
      expectUniqueIds(milestoneTypeCatalog);
      expectActiveReviewedItems(milestoneTypeCatalog);
      expectNoCatchAllValues(milestoneTypeCatalog);
    });

    it("keeps the four management attention types distinct by ID", () => {
      const keyTypeIds = milestoneTypeCatalog
        .filter((item) =>
          ["G/O", "SMT", "Close", "MDRR"].includes(item.displayName),
        )
        .map((item) => item.id);

      expect(keyTypeIds).toHaveLength(4);
      expect(new Set(keyTypeIds).size).toBe(4);
    });
  });

  describe("Milestone Definitions", () => {
    const stageNameById = new Map(
      stageGroupCatalog.map((item) => [item.id, item.displayName]),
    );
    const typeNameById = new Map(
      milestoneTypeCatalog.map((item) => [item.id, item.displayName]),
    );

    it("contains the exact 30 active definitions in approved order", () => {
      expect(
        activeMilestoneDefinitions.map((definition) => ({
          id: definition.id,
          stage: stageNameById.get(definition.stageGroupId),
          name: definition.name,
          type: typeNameById.get(definition.milestoneTypeId),
          displayOrder: definition.displayOrder,
        })),
      ).toEqual([
        { id: "milestone-design-kickoff", stage: "Design", name: "Kickoff", type: "Kickoff", displayOrder: 10 },
        { id: "milestone-design-id-fix", stage: "Design", name: "ID fix", type: "ID Fix", displayOrder: 20 },
        { id: "milestone-me-portion-me-drawing", stage: "ME Portion", name: "ME drawing", type: "ME Drawing", displayOrder: 30 },
        { id: "milestone-me-portion-mockup-dfm", stage: "ME Portion", name: "Mockup & DFM", type: "Mockup & DFM", displayOrder: 40 },
        { id: "milestone-me-portion-tooling-start-t1", stage: "ME Portion", name: "Tooling start + T1", type: "Tooling", displayOrder: 50 },
        { id: "milestone-me-portion-me-material-c", stage: "ME Portion", name: "ME material for C", type: "ME Material", displayOrder: 60 },
        { id: "milestone-thermal-module-c", stage: "Thermal", name: "Thermal module for C", type: "Thermal Module", displayOrder: 70 },
        { id: "milestone-a1-a-g-o", stage: "A1-stage", name: "A1 G/O", type: "G/O", displayOrder: 80 },
        { id: "milestone-a1-a-smt", stage: "A1-stage", name: "A1 SMT", type: "SMT", displayOrder: 90 },
        { id: "milestone-a1-a-test", stage: "A1-stage", name: "A1 Test", type: "Test", displayOrder: 100 },
        { id: "milestone-a1-a-close", stage: "A1-stage", name: "A1 Close", type: "Close", displayOrder: 110 },
        { id: "milestone-c1-c-g-o", stage: "C1-stage", name: "C1 G/O", type: "G/O", displayOrder: 120 },
        { id: "milestone-c1-c-smt", stage: "C1-stage", name: "C1 SMT", type: "SMT", displayOrder: 130 },
        { id: "milestone-c1-c-pre-build", stage: "C1-stage", name: "C1 Pre-Build", type: "Pre-build", displayOrder: 140 },
        { id: "milestone-c1-c-main-build", stage: "C1-stage", name: "C1 System Build", type: "System Build", displayOrder: 150 },
        { id: "milestone-c1-c-test", stage: "C1-stage", name: "C1 Test", type: "Test", displayOrder: 160 },
        { id: "milestone-c1-close", stage: "C1-stage", name: "C1 Close", type: "Close", displayOrder: 170 },
        { id: "milestone-c2-c-g-o", stage: "C2-stage", name: "C2 G/O", type: "G/O", displayOrder: 180 },
        { id: "milestone-c2-c-smt", stage: "C2-stage", name: "C2 SMT", type: "SMT", displayOrder: 190 },
        { id: "milestone-c2-c-pre-build", stage: "C2-stage", name: "C2 Pre-Build", type: "Pre-build", displayOrder: 200 },
        { id: "milestone-c2-c-main-build", stage: "C2-stage", name: "C2 System Build", type: "System Build", displayOrder: 210 },
        { id: "milestone-c2-c-test", stage: "C2-stage", name: "C2 Test", type: "Test", displayOrder: 220 },
        { id: "milestone-c2-c-close", stage: "C2-stage", name: "C2 Close", type: "Close", displayOrder: 230 },
        { id: "milestone-ramp-g-o", stage: "RAMP-stage", name: "RAMP G/O", type: "G/O", displayOrder: 240 },
        { id: "milestone-ramp-me-signoff", stage: "RAMP-stage", name: "ME signoff", type: "ME Signoff", displayOrder: 250 },
        { id: "milestone-ramp-smt", stage: "RAMP-stage", name: "RAMP SMT", type: "SMT", displayOrder: 260 },
        { id: "milestone-ramp-pre-build", stage: "RAMP-stage", name: "RAMP Pre-build", type: "Pre-build", displayOrder: 270 },
        { id: "milestone-ramp-main-build", stage: "RAMP-stage", name: "RAMP Main build", type: "Main Build", displayOrder: 280 },
        { id: "milestone-ramp-fcs", stage: "RAMP-stage", name: "FCS", type: "FCS", displayOrder: 290 },
        { id: "milestone-mdrr", stage: "MDRR", name: "MDRR", type: "MDRR", displayOrder: 300 },
      ]);
    });

    it("separates active Portfolio, active selection, and compatibility definitions", () => {
      expect(portfolioMilestoneDefinitions).toHaveLength(29);
      expect(
        portfolioMilestoneDefinitions.every(
          (definition) => definition.showInPortfolio,
        ),
      ).toBe(true);
      expect(activeMilestoneDefinitions).toHaveLength(30);
      expect(compatibilityOnlyMilestoneDefinitions).toHaveLength(6);
      expect(milestoneDefinitions).toHaveLength(36);
      expect(activeMilestoneDefinitions.at(-1)).toBe(mdrrMilestoneDefinition);
      expect(compatibilityOnlyMilestoneDefinitions.map(({ id }) => id)).toEqual([
        "milestone-a-a2-a-g-o",
        "milestone-a-a2-a-smt",
        "milestone-a-a2-a-test",
        "milestone-a-a2-a-close",
        "milestone-c2-bios-frozen",
        "milestone-c2-golden-run",
      ]);
      expect(
        compatibilityOnlyMilestoneDefinitions.every(
          (definition) => !definition.active && !definition.showInPortfolio,
        ),
      ).toBe(true);
      expect(new Set(activeMilestoneDefinitions.map(({ id }) => id))).toEqual(
        new Set(portfolioMilestoneDefinitions.map(({ id }) => id).concat(mdrrMilestoneDefinition.id)),
      );
      expect(
        activeMilestoneDefinitions.some(({ id }) =>
          compatibilityOnlyMilestoneDefinitions.some((definition) => definition.id === id),
        ),
      ).toBe(false);
      expect(mdrrMilestoneDefinition).toEqual({
        id: "milestone-mdrr",
        name: "MDRR",
        stageGroupId: "stage-mdrr",
        milestoneTypeId: "type-mdrr",
        displayOrder: 300,
        active: true,
        reviewStatus: "reviewed",
        aliases: [],
        showInPortfolio: false,
      });
    });

    it("uses stable IDs, unique display orders, and reviewed metadata", () => {
      expect(activeMilestoneDefinitions.map(({ id }) => id)).toEqual([
        "milestone-design-kickoff",
        "milestone-design-id-fix",
        "milestone-me-portion-me-drawing",
        "milestone-me-portion-mockup-dfm",
        "milestone-me-portion-tooling-start-t1",
        "milestone-me-portion-me-material-c",
        "milestone-thermal-module-c",
        "milestone-a1-a-g-o",
        "milestone-a1-a-smt",
        "milestone-a1-a-test",
        "milestone-a1-a-close",
        "milestone-c1-c-g-o",
        "milestone-c1-c-smt",
        "milestone-c1-c-pre-build",
        "milestone-c1-c-main-build",
        "milestone-c1-c-test",
        "milestone-c1-close",
        "milestone-c2-c-g-o",
        "milestone-c2-c-smt",
        "milestone-c2-c-pre-build",
        "milestone-c2-c-main-build",
        "milestone-c2-c-test",
        "milestone-c2-c-close",
        "milestone-ramp-g-o",
        "milestone-ramp-me-signoff",
        "milestone-ramp-smt",
        "milestone-ramp-pre-build",
        "milestone-ramp-main-build",
        "milestone-ramp-fcs",
        "milestone-mdrr",
      ]);
      expectUniqueIds(milestoneDefinitions);
      expect(milestoneDefinitions.map((definition) => definition.displayOrder)).toEqual(
        Array.from({ length: 36 }, (_, index) => (index + 1) * 10),
      );
      expectActiveReviewedItems(activeMilestoneDefinitions);
      expect(
        compatibilityOnlyMilestoneDefinitions.every(
          ({ aliases, reviewStatus }) => aliases.length === 0 && reviewStatus === "reviewed",
        ),
      ).toBe(true);
      expect(dashboardAttentionMilestoneTypeIds).toEqual([
        "type-g-o",
        "type-smt",
        "type-close",
        "type-mdrr",
      ]);
    });

    it("keeps repeated names distinct across Stage / Group identities", () => {
      const a1Go = milestoneDefinitions.find((definition) => definition.id === "milestone-a1-a-g-o");
      const a2Go = milestoneDefinitions.find((definition) => definition.id === "milestone-a-a2-a-g-o");
      const c1Smt = milestoneDefinitions.find(
        (definition) => definition.id === "milestone-c1-c-smt",
      );
      const c2Smt = milestoneDefinitions.find(
        (definition) => definition.id === "milestone-c2-c-smt",
      );

      expect(a1Go?.id).not.toBe(a2Go?.id);
      expect(c1Smt?.id).toBe("milestone-c1-c-smt");
      expect(c2Smt?.id).toBe("milestone-c2-c-smt");
      expect(c1Smt?.id).not.toBe(c2Smt?.id);
    });

    it("resolves every definition to configured Stage and Type identities", () => {
      const stageIds = new Set(stageGroupCatalog.map((item) => item.id));
      const typeIds = new Set(milestoneTypeCatalog.map((item) => item.id));

      for (const definition of milestoneDefinitions) {
        expect(stageIds.has(definition.stageGroupId)).toBe(true);
        expect(typeIds.has(definition.milestoneTypeId)).toBe(true);
      }
    });
  });
});
