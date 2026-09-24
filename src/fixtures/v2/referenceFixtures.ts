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
	{
		id: toCatalogItemId("user-trial-demo-customer"),
		displayName: "DEMO",
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
	...[
		["demo-category-aspire", "Aspire"],
		["demo-category-gamepad", "Gamepad"],
		["demo-category-gaming", "Gaming"],
		["demo-category-woa", "WOA"],
	].map(([id, displayName]) => ({
		id: toCatalogItemId(id),
		displayName,
		aliases: [],
		active: true,
		reviewStatus: "reviewed" as const,
	})),
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
	...[
		["demo-product-line-aspire-refresh-id", "Aspire (Refresh ID)"],
		["demo-product-line-game-pad", "Game pad"],
		["demo-product-line-helios-neo", "Helios Neo"],
		["demo-product-line-nitro-edge", "Nitro Edge"],
	].map(([id, displayName]) => ({
		id: toCatalogItemId(id),
		displayName,
		aliases: [],
		active: true,
		reviewStatus: "reviewed" as const,
	})),
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
	...[
		["demo-cpu-intel-novalake-hx", "Intel Novalake HX 28C/24C"],
		["demo-cpu-amd-hawkpoint-1-fp8", "AMD HawkPoint 1 FP8 (New PCBA)-two DIMM"],
		["demo-cpu-nvidia-n1", "nVIDIA N1"],
	].map(([id, displayName]) => ({
		id: toCatalogItemId(id),
		displayName,
		aliases: [],
		active: true,
		reviewStatus: "reviewed" as const,
	})),
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
	...[
		["demo-gpu-gn22-x2-x4", "GN22-X2/X4"],
		["demo-gpu-gn20-x6", "GN20-X6"],
		["demo-gpu-gn22-x7-x9", "GN22-X7/X9"],
	].map(([id, displayName]) => ({
		id: toCatalogItemId(id),
		displayName,
		aliases: [],
		active: true,
		reviewStatus: "reviewed" as const,
	})),
];
