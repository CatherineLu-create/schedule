import { describe, expect, it, vi } from "vitest";
import { toCatalogItemId } from "../../domain/shared/ids";
import {
  cpuReferenceFixtures,
  gpuReferenceFixtures,
  panelSizeReferenceFixtures,
  productLineReferenceFixtures,
} from "../../fixtures/v2/referenceFixtures";
import {
  addSelfServiceCatalogItem,
  createInitialSelfServiceReferenceCatalogs,
} from "./selfServiceCatalogs";

describe("self-service reference catalogs", () => {
  it("initializes independent runtime arrays from the four fixture catalogs", () => {
    const catalogs = createInitialSelfServiceReferenceCatalogs();

    expect(catalogs).toEqual({
      productLine: productLineReferenceFixtures,
      panelSize: panelSizeReferenceFixtures,
      cpu: cpuReferenceFixtures,
      gpu: gpuReferenceFixtures,
    });
    expect(catalogs.productLine).not.toBe(productLineReferenceFixtures);
    expect(catalogs.panelSize).not.toBe(panelSizeReferenceFixtures);
    expect(catalogs.cpu).not.toBe(cpuReferenceFixtures);
    expect(catalogs.gpu).not.toBe(gpuReferenceFixtures);
  });

  it("trims only the edges, preserves internal whitespace, and creates an accepted active item", () => {
    const catalogs = createInitialSelfServiceReferenceCatalogs();
    const createId = vi.fn(() => toCatalogItemId("runtime-product-line"));

    const result = addSelfServiceCatalogItem(
      catalogs,
      "productLine",
      "  New  Product Line  ",
      createId,
    );

    expect(result).toEqual({
      ok: true,
      catalogs: {
        ...catalogs,
        productLine: [
          ...catalogs.productLine,
          {
            id: "runtime-product-line",
            displayName: "New  Product Line",
            aliases: [],
            active: true,
            reviewStatus: "reviewed",
          },
        ],
      },
      item: {
        id: "runtime-product-line",
        displayName: "New  Product Line",
        aliases: [],
        active: true,
        reviewStatus: "reviewed",
      },
    });
    expect(createId).toHaveBeenCalledOnce();
    expect(productLineReferenceFixtures).not.toContainEqual(
      expect.objectContaining({ id: "runtime-product-line" }),
    );
  });

  it("rejects blank and case-insensitive duplicate labels without allocating or changing catalogs", () => {
    const catalogs = createInitialSelfServiceReferenceCatalogs();
    const createId = vi.fn(() => toCatalogItemId("must-not-be-used"));

    expect(addSelfServiceCatalogItem(catalogs, "cpu", "   ", createId)).toEqual({
      ok: false,
      reason: "empty",
      message: "Enter a catalog option.",
    });
    expect(addSelfServiceCatalogItem(
      catalogs,
      "cpu",
      `  ${cpuReferenceFixtures[0]!.displayName.toLocaleLowerCase()}  `,
      createId,
    )).toEqual({
      ok: false,
      reason: "duplicate",
      message: "This catalog option already exists.",
    });
    expect(createId).not.toHaveBeenCalled();
    expect(catalogs.cpu).toEqual(cpuReferenceFixtures);
  });

  it("keeps duplicate-label scope catalog-local", () => {
    const catalogs = createInitialSelfServiceReferenceCatalogs();
    const existingCpuLabel = cpuReferenceFixtures[0]!.displayName;

    const result = addSelfServiceCatalogItem(
      catalogs,
      "gpu",
      existingCpuLabel,
      () => toCatalogItemId("runtime-gpu-same-label"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.displayName).toBe(existingCpuLabel);
    expect(result.catalogs.cpu).toEqual(catalogs.cpu);
    expect(result.catalogs.gpu).toHaveLength(catalogs.gpu.length + 1);
  });

  it("rejects a generated ID already used by any of the four runtime catalogs", () => {
    const catalogs = createInitialSelfServiceReferenceCatalogs();
    const collidingId = catalogs.panelSize[0]!.id;

    expect(addSelfServiceCatalogItem(
      catalogs,
      "productLine",
      "Unique Product Line",
      () => collidingId,
    )).toEqual({
      ok: false,
      reason: "idCollision",
      message: "Generated catalog ID is already in use.",
    });
    expect(catalogs.productLine).toEqual(productLineReferenceFixtures);
  });
});
