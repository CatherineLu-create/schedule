import type { CatalogItem } from "../../domain/reference-data/catalog";
import type { CatalogItemId } from "../../domain/shared/ids";
import { toCatalogItemId } from "../../domain/shared/ids";

export const customerReferenceFixtures: readonly CatalogItem<CatalogItemId>[] = [
	{
		id: toCatalogItemId("dev-customer-acer"),
		displayName: "Acer",
		aliases: [],
		active: true,
		reviewStatus: "reviewed",
	},
	{
		id: toCatalogItemId("dev-customer-b"),
		displayName: "DEV Customer B",
		aliases: [],
		active: true,
		reviewStatus: "reviewed",
	},
];

export const categoryReferenceFixtures: readonly CatalogItem<CatalogItemId>[] = [
	{
		id: toCatalogItemId("dev-category-notebook"),
		displayName: "DEV Notebook",
		aliases: [],
		active: true,
		reviewStatus: "reviewed",
	},
	{
		id: toCatalogItemId("dev-category-creator"),
		displayName: "DEV Creator",
		aliases: [],
		active: true,
		reviewStatus: "reviewed",
	},
];

export const productLineReferenceFixtures: readonly CatalogItem<CatalogItemId>[] = [
	{
		id: toCatalogItemId("dev-product-line-alpha"),
		displayName: "DEV Line Alpha",
		aliases: [],
		active: true,
		reviewStatus: "reviewed",
	},
	{
		id: toCatalogItemId("dev-product-line-beta"),
		displayName: "DEV Line Beta",
		aliases: [],
		active: true,
		reviewStatus: "reviewed",
	},
];

export const panelSizeReferenceFixtures: readonly CatalogItem<CatalogItemId>[] = [
	{
		id: toCatalogItemId("dev-panel-size-16"),
		displayName: '16"',
		aliases: [],
		active: true,
		reviewStatus: "reviewed",
	},
	{
		id: toCatalogItemId("dev-panel-size-18"),
		displayName: '18"',
		aliases: [],
		active: true,
		reviewStatus: "reviewed",
	},
];

export const cpuReferenceFixtures: readonly CatalogItem<CatalogItemId>[] = [
	{
		id: toCatalogItemId("dev-cpu-alpha"),
		displayName: "DEV CPU Alpha",
		aliases: [],
		active: true,
		reviewStatus: "reviewed",
	},
	{
		id: toCatalogItemId("dev-cpu-beta"),
		displayName: "DEV CPU Beta",
		aliases: [],
		active: true,
		reviewStatus: "reviewed",
	},
];

export const gpuReferenceFixtures: readonly CatalogItem<CatalogItemId>[] = [
	{
		id: toCatalogItemId("dev-gpu-alpha"),
		displayName: "DEV GPU Alpha",
		aliases: [],
		active: true,
		reviewStatus: "reviewed",
	},
	{
		id: toCatalogItemId("dev-gpu-beta"),
		displayName: "DEV GPU Beta",
		aliases: [],
		active: true,
		reviewStatus: "reviewed",
	},
];
