import type { CatalogItem } from "../../domain/reference-data/catalog";
import type { CatalogItemId } from "../../domain/shared/ids";
import {
  cpuReferenceFixtures,
  gpuReferenceFixtures,
  panelSizeReferenceFixtures,
  productLineReferenceFixtures,
} from "../../fixtures/v2/referenceFixtures";

export const selfServiceCatalogKeys = [
  "productLine",
  "panelSize",
  "cpu",
  "gpu",
] as const;

export type SelfServiceCatalogKey = (typeof selfServiceCatalogKeys)[number];

export type SelfServiceReferenceCatalogs = Readonly<
  Record<SelfServiceCatalogKey, readonly CatalogItem<CatalogItemId>[]>
>;

export type AddSelfServiceCatalogItemResult =
  | {
      readonly ok: true;
      readonly catalogs: SelfServiceReferenceCatalogs;
      readonly item: CatalogItem<CatalogItemId>;
    }
  | {
      readonly ok: false;
      readonly reason: "empty" | "duplicate" | "idCollision";
      readonly message: string;
    };

export function createInitialSelfServiceReferenceCatalogs(): SelfServiceReferenceCatalogs {
  return {
    productLine: [...productLineReferenceFixtures],
    panelSize: [...panelSizeReferenceFixtures],
    cpu: [...cpuReferenceFixtures],
    gpu: [...gpuReferenceFixtures],
  };
}

function normalizedDisplayName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function addSelfServiceCatalogItem(
  catalogs: SelfServiceReferenceCatalogs,
  key: SelfServiceCatalogKey,
  label: string,
  createId: () => CatalogItemId,
): AddSelfServiceCatalogItemResult {
  const displayName = label.trim();
  if (displayName === "") {
    return {
      ok: false,
      reason: "empty",
      message: "Enter a catalog option.",
    };
  }

  const duplicate = catalogs[key].some(
    (item) => normalizedDisplayName(item.displayName) === normalizedDisplayName(displayName),
  );
  if (duplicate) {
    return {
      ok: false,
      reason: "duplicate",
      message: "This catalog option already exists.",
    };
  }

  const id = createId();
  const idCollision = selfServiceCatalogKeys.some((catalogKey) =>
    catalogs[catalogKey].some((item) => item.id === id));
  if (idCollision) {
    return {
      ok: false,
      reason: "idCollision",
      message: "Generated catalog ID is already in use.",
    };
  }

  const item: CatalogItem<CatalogItemId> = {
    id,
    displayName,
    aliases: [],
    active: true,
    reviewStatus: "reviewed",
  };
  return {
    ok: true,
    catalogs: {
      ...catalogs,
      [key]: [...catalogs[key], item],
    },
    item,
  };
}
