import { describe, expect, expectTypeOf, it } from "vitest";
import type { CatalogItem } from "../../domain/reference-data/catalog";
import type { CatalogItemId } from "../../domain/shared/ids";
import * as referenceFixtures from "./referenceFixtures";
import {
	categoryReferenceFixtures,
	cpuReferenceFixtures,
	customerReferenceFixtures,
	gpuReferenceFixtures,
	panelSizeReferenceFixtures,
	productLineReferenceFixtures,
} from "./referenceFixtures";

const expectedGroups = [
	{
		items: customerReferenceFixtures,
		ids: ["dev-customer-acer", "dev-customer-b", "user-trial-demo-customer"],
		names: ["Acer", "DEV Customer B", "DEMO"],
	},
	{
		items: categoryReferenceFixtures,
		ids: ["dev-category-notebook", "dev-category-creator", "demo-category-aspire", "demo-category-gamepad", "demo-category-gaming", "demo-category-woa"],
		names: ["DEV Notebook", "DEV Creator", "Aspire", "Gamepad", "Gaming", "WOA"],
	},
	{
		items: productLineReferenceFixtures,
		ids: ["dev-product-line-alpha", "dev-product-line-beta", "demo-product-line-aspire-refresh-id", "demo-product-line-game-pad", "demo-product-line-helios-neo", "demo-product-line-nitro-edge"],
		names: ["DEV Line Alpha", "DEV Line Beta", "Aspire (Refresh ID)", "Game pad", "Helios Neo", "Nitro Edge"],
	},
	{
		items: panelSizeReferenceFixtures,
		ids: ["dev-panel-size-16", "dev-panel-size-18"],
		names: ['16"', '18"'],
	},
	{
		items: cpuReferenceFixtures,
		ids: ["dev-cpu-alpha", "dev-cpu-beta", "demo-cpu-intel-novalake-hx", "demo-cpu-amd-hawkpoint-1-fp8", "demo-cpu-nvidia-n1"],
		names: ["DEV CPU Alpha", "DEV CPU Beta", "Intel Novalake HX 28C/24C", "AMD HawkPoint 1 FP8 (New PCBA)-two DIMM", "nVIDIA N1"],
	},
	{
		items: gpuReferenceFixtures,
		ids: ["dev-gpu-alpha", "dev-gpu-beta", "demo-gpu-gn22-x2-x4", "demo-gpu-gn20-x6", "demo-gpu-gn22-x7-x9"],
		names: ["DEV GPU Alpha", "DEV GPU Beta", "GN22-X2/X4", "GN20-X6", "GN22-X7/X9"],
	},
] as const;

describe("synthetic V2 reference fixtures", () => {
	it("uses the exact deterministic development names and stable IDs", () => {
		for (const group of expectedGroups) {
			expect(group.items.map((item) => item.id)).toEqual(group.ids);
			expect(group.items.map((item) => item.displayName)).toEqual(
				group.names,
			);
		}
	});

	it("keeps all fixture IDs unique and every item active, reviewed, and alias-free", () => {
		const allItems = expectedGroups.flatMap((group) => [...group.items]);

		expect(new Set(allItems.map((item) => item.id)).size).toBe(
			allItems.length,
		);
		expect(
			allItems.every(
				(item) =>
					item.active &&
					item.reviewStatus === "reviewed" &&
					item.aliases.length === 0,
			),
		).toBe(true);
	});

	it("exposes readonly CatalogItem collections without redefining Status or Cover", () => {
		expectTypeOf(customerReferenceFixtures).toMatchTypeOf<
			readonly CatalogItem<CatalogItemId>[]
		>();
		expect(referenceFixtures).not.toHaveProperty("statusCatalog");
		expect(referenceFixtures).not.toHaveProperty("coverCatalog");
	});
});
