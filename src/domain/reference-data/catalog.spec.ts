import { describe, expect, expectTypeOf, it } from "vitest";

import { toCatalogItemId, toStageGroupId } from "../shared/ids";
import {
  renameCatalogItem,
  type CatalogItem,
  type CatalogReviewStatus,
} from "./catalog";

describe("reference catalog primitives", () => {
  it("allows equal display names to keep distinct stable identities", () => {
    const first: CatalogItem = {
      id: toCatalogItemId("catalog-customer-a"),
      displayName: "Fixture Customer",
      aliases: [],
      active: true,
      reviewStatus: "reviewed",
    };
    const second: CatalogItem = {
      ...first,
      id: toCatalogItemId("catalog-customer-b"),
    };

    expect(first.displayName).toBe(second.displayName);
    expect(first.id).not.toBe(second.id);
  });

  it("renames an item without changing identity or other catalog data", () => {
    const original: CatalogItem = {
      id: toCatalogItemId("catalog-cpu-001"),
      displayName: "Fixture CPU A",
      aliases: ["CPU A"],
      active: false,
      reviewStatus: "unreviewed",
    };

    const renamed = renameCatalogItem(original, "Fixture CPU Alpha");

    expect(renamed).toEqual({
      ...original,
      displayName: "Fixture CPU Alpha",
    });
    expect(renamed.id).toBe(original.id);
    expect(original.displayName).toBe("Fixture CPU A");
  });

  it("treats aliases as data rather than identity", () => {
    const item: CatalogItem = {
      id: toCatalogItemId("catalog-cover-001"),
      displayName: "Fixture Cover",
      aliases: ["Fixture Cover Alias"],
      active: true,
      reviewStatus: "reviewed",
    };

    expect(item.aliases).toEqual(["Fixture Cover Alias"]);
    expect(item.id).toBe("catalog-cover-001");
  });

  it("represents inactive and unreviewed historical items", () => {
    const item: CatalogItem = {
      id: toCatalogItemId("catalog-gpu-retired"),
      displayName: "Retired Fixture GPU",
      aliases: [],
      active: false,
      reviewStatus: "unreviewed",
    };

    expect(item.active).toBe(false);
    expect(item.reviewStatus).toBe("unreviewed");
  });

  it("supports a dedicated stable ID for specialized reference catalogs", () => {
    const stage: CatalogItem<ReturnType<typeof toStageGroupId>> = {
      id: toStageGroupId("stage-design"),
      displayName: "Design",
      aliases: [],
      active: true,
      reviewStatus: "reviewed",
    };

    expect(stage.id).toBe("stage-design");
    expectTypeOf(stage.reviewStatus).toEqualTypeOf<CatalogReviewStatus>();
  });
});
