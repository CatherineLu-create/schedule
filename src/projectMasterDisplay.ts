import type { ProjectType } from "./domain/project/projectMaster";
import { coverCatalog } from "./config/v2/referenceData";
import type { CatalogItemId } from "./domain/shared/ids";

// Shared with Project Master Detail: preserve its units and blank display exactly.
export function projectMasterMeasurement(value: number | null, unit: "mm" | "g"): string {
  return value === null ? "—" : `${value} ${unit}`;
}

export function projectMasterCoverDisplay(id: CatalogItemId | null): string {
  if (id === null) return "—";
  return coverCatalog.find((item) => item.id === id)?.displayName ?? "—";
}

export function projectTypeLabel(value: ProjectType | null | undefined): "New" | "Regression" | null {
  return value === "new" ? "New" : value === "regression" ? "Regression" : null;
}
