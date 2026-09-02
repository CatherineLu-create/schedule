import { describe, expect, it } from "vitest";

import {
  coverCatalog,
  mdrrMilestoneDefinition,
  milestoneDefinitions,
  milestoneTypeCatalog,
  portfolioMilestoneDefinitions,
  stageGroupCatalog,
  statusCatalog,
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

    it("contains the exact 34 Portfolio milestones in approved order", () => {
      expect(
        portfolioMilestoneDefinitions.map((definition) => ({
          stage: stageNameById.get(definition.stageGroupId),
          name: definition.name,
          type: typeNameById.get(definition.milestoneTypeId),
          displayOrder: definition.displayOrder,
        })),
      ).toEqual([
        { stage: "Design", name: "Kickoff", type: "Kickoff", displayOrder: 10 },
        { stage: "Design", name: "ID fix", type: "ID Fix", displayOrder: 20 },
        { stage: "ME Portion", name: "ME drawing", type: "ME Drawing", displayOrder: 30 },
        { stage: "ME Portion", name: "Mockup & DFM", type: "Mockup & DFM", displayOrder: 40 },
        { stage: "ME Portion", name: "Tooling start + T1", type: "Tooling", displayOrder: 50 },
        { stage: "ME Portion", name: "ME material for C", type: "ME Material", displayOrder: 60 },
        { stage: "Thermal", name: "Thermal module for C", type: "Thermal Module", displayOrder: 70 },
        { stage: "A1-stage", name: "A G/O", type: "G/O", displayOrder: 80 },
        { stage: "A1-stage", name: "A-SMT", type: "SMT", displayOrder: 90 },
        { stage: "A1-stage", name: "A-Test", type: "Test", displayOrder: 100 },
        { stage: "A/A2-stage", name: "A G/O", type: "G/O", displayOrder: 110 },
        { stage: "A/A2-stage", name: "A-SMT", type: "SMT", displayOrder: 120 },
        { stage: "A/A2-stage", name: "A-Test", type: "Test", displayOrder: 130 },
        { stage: "A/A2-stage", name: "A-Close", type: "Close", displayOrder: 140 },
        { stage: "C1-stage", name: "C G/O", type: "G/O", displayOrder: 150 },
        { stage: "C1-stage", name: "C-SMT", type: "SMT", displayOrder: 160 },
        { stage: "C1-stage", name: "C Pre-build", type: "Pre-build", displayOrder: 170 },
        { stage: "C1-stage", name: "C-Main Build", type: "Main Build", displayOrder: 180 },
        { stage: "C1-stage", name: "C-Test", type: "Test", displayOrder: 190 },
        { stage: "C1-stage", name: "C1-close", type: "Close", displayOrder: 200 },
        { stage: "C2-stage", name: "C G/O", type: "G/O", displayOrder: 210 },
        { stage: "C2-stage", name: "C-SMT", type: "SMT", displayOrder: 220 },
        { stage: "C2-stage", name: "C Pre-build", type: "Pre-build", displayOrder: 230 },
        { stage: "C2-stage", name: "C-Main Build", type: "Main Build", displayOrder: 240 },
        { stage: "C2-stage", name: "C-Test", type: "Test", displayOrder: 250 },
        { stage: "C2-stage", name: "BIOS frozen", type: "BIOS Frozen", displayOrder: 260 },
        { stage: "C2-stage", name: "Golden Run", type: "Golden Run", displayOrder: 270 },
        { stage: "C2-stage", name: "C-close", type: "Close", displayOrder: 280 },
        { stage: "RAMP-stage", name: "RAMP G/O", type: "G/O", displayOrder: 290 },
        { stage: "RAMP-stage", name: "ME signoff", type: "ME Signoff", displayOrder: 300 },
        { stage: "RAMP-stage", name: "RAMP SMT", type: "SMT", displayOrder: 310 },
        { stage: "RAMP-stage", name: "RAMP Pre-build", type: "Pre-build", displayOrder: 320 },
        { stage: "RAMP-stage", name: "RAMP Main build", type: "Main Build", displayOrder: 330 },
        { stage: "RAMP-stage", name: "FCS", type: "FCS", displayOrder: 340 },
      ]);
    });

    it("marks exactly 34 definitions for Portfolio and only MDRR as hidden", () => {
      expect(portfolioMilestoneDefinitions).toHaveLength(34);
      expect(
        portfolioMilestoneDefinitions.every(
          (definition) => definition.showInPortfolio,
        ),
      ).toBe(true);
      expect(milestoneDefinitions).toHaveLength(35);
      expect(
        milestoneDefinitions.filter(
          (definition) => !definition.showInPortfolio,
        ),
      ).toEqual([mdrrMilestoneDefinition]);
      expect(mdrrMilestoneDefinition).toEqual({
        id: "milestone-mdrr",
        name: "MDRR",
        stageGroupId: "stage-mdrr",
        milestoneTypeId: "type-mdrr",
        displayOrder: 350,
        active: true,
        reviewStatus: "reviewed",
        aliases: [],
        showInPortfolio: false,
      });
    });

    it("uses explicit unique IDs and display orders for active reviewed definitions", () => {
      expect(
        portfolioMilestoneDefinitions.map((definition) => definition.id),
      ).toEqual([
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
        "milestone-a-a2-a-g-o",
        "milestone-a-a2-a-smt",
        "milestone-a-a2-a-test",
        "milestone-a-a2-a-close",
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
        "milestone-c2-bios-frozen",
        "milestone-c2-golden-run",
        "milestone-c2-c-close",
        "milestone-ramp-g-o",
        "milestone-ramp-me-signoff",
        "milestone-ramp-smt",
        "milestone-ramp-pre-build",
        "milestone-ramp-main-build",
        "milestone-ramp-fcs",
      ]);
      expectUniqueIds(milestoneDefinitions);
      expect(milestoneDefinitions.map((definition) => definition.displayOrder)).toEqual(
        Array.from({ length: 35 }, (_, index) => (index + 1) * 10),
      );
      expectActiveReviewedItems(milestoneDefinitions);
    });

    it("keeps repeated names distinct across Stage / Group identities", () => {
      const a1Go = portfolioMilestoneDefinitions.find(
        (definition) =>
          definition.name === "A G/O" && definition.stageGroupId === "stage-a1",
      );
      const a2Go = portfolioMilestoneDefinitions.find(
        (definition) =>
          definition.name === "A G/O" &&
          definition.stageGroupId === "stage-a-a2",
      );
      const c1Smt = portfolioMilestoneDefinitions.find(
        (definition) =>
          definition.name === "C-SMT" && definition.stageGroupId === "stage-c1",
      );
      const c2Smt = portfolioMilestoneDefinitions.find(
        (definition) =>
          definition.name === "C-SMT" && definition.stageGroupId === "stage-c2",
      );

      expect(a1Go?.id).toBe("milestone-a1-a-g-o");
      expect(a2Go?.id).toBe("milestone-a-a2-a-g-o");
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
