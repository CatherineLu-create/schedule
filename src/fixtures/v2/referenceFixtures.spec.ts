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
		ids: ["dev-customer-acer", "dev-customer-b"],
		names: ["Acer", "DEV Customer B"],
	},
	{
		items: categoryReferenceFixtures,
		ids: ["dev-category-notebook", "dev-category-creator"],
		names: ["DEV Notebook", "DEV Creator"],
	},
	{
		items: productLineReferenceFixtures,
		ids: ["dev-product-line-alpha", "dev-product-line-beta"],
		names: ["DEV Line Alpha", "DEV Line Beta"],
	},
	{
		items: panelSizeReferenceFixtures,
		ids: ["dev-panel-size-16", "dev-panel-size-18"],
		names: ['16"', '18"'],
	},
	{
		items: cpuReferenceFixtures,
		ids: ["dev-cpu-alpha", "dev-cpu-beta"],
		names: ["DEV CPU Alpha", "DEV CPU Beta"],
	},
	{
		items: gpuReferenceFixtures,
		ids: ["dev-gpu-alpha", "dev-gpu-beta"],
		names: ["DEV GPU Alpha", "DEV GPU Beta"],
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
