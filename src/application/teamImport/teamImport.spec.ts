import { afterEach, describe, expect, it, vi } from "vitest";
import * as CFB from "cfb";
import * as XLSX from "xlsx";

const xlsxReadControl = vi.hoisted(() => ({ workbook: null as unknown }));

vi.mock("xlsx", async (importOriginal) => {
	const actual = await importOriginal<typeof import("xlsx")>();
	return {
		...actual,
		read: ((...args: Parameters<typeof actual.read>) =>
			xlsxReadControl.workbook ?? actual.read(...args)) as typeof actual.read,
	};
});

import {
	inspectTeamImport,
	readTeamImportFile,
	selectTeamImportSheet,
	type TeamImportFile,
} from "./teamImport";

type BookType = "csv" | "xls" | "xlsx";

function workbookFile(
	bookType: BookType,
	sheets: readonly {
		readonly name: string;
		readonly rows: readonly (readonly unknown[])[];
		readonly hiddenColumns?: readonly number[];
		readonly mutate?: (sheet: XLSX.WorkSheet) => void;
	}[],
): TeamImportFile {
	const workbook = XLSX.utils.book_new();
	for (const definition of sheets) {
		const sheet = XLSX.utils.aoa_to_sheet(definition.rows.map((row) => [...row]));
		if (definition.hiddenColumns !== undefined) {
			const maxColumn = Math.max(...definition.hiddenColumns, 0);
			sheet["!cols"] = Array.from({ length: maxColumn + 1 }, (_, index) => ({
				hidden: definition.hiddenColumns?.includes(index) ?? false,
			}));
		}
		definition.mutate?.(sheet);
		XLSX.utils.book_append_sheet(workbook, sheet, definition.name);
	}
	const bytes = XLSX.write(workbook, { type: "array", bookType });
	return { fileName: `synthetic.${bookType}`, extension: bookType, bytes };
}

function mutatedXlsxFile(
	rows: readonly (readonly unknown[])[],
	replaceXml: (xml: string) => string,
	mutateSheet?: (sheet: XLSX.WorkSheet) => void,
	replaceRelationshipsXml?: (xml: string) => string,
): TeamImportFile {
	const workbook = XLSX.utils.book_new();
	const worksheet = XLSX.utils.aoa_to_sheet(rows.map((row) => [...row]));
	mutateSheet?.(worksheet);
	XLSX.utils.book_append_sheet(
		workbook,
		worksheet,
		"Roster",
	);
	const originalBytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
	const zip = CFB.read(originalBytes, { type: "buffer" });
	const index = zip.FullPaths.findIndex((path: string) =>
		path.endsWith("/xl/worksheets/sheet1.xml"),
	);
	if (index < 0) throw new Error("Synthetic worksheet XML was not found");
	const entry = zip.FileIndex[index];
	const originalXml = new TextDecoder().decode(Uint8Array.from(entry.content));
	const changedXml = replaceXml(originalXml);
	if (changedXml === originalXml) throw new Error("Synthetic worksheet mutation did not apply");
	entry.content = new TextEncoder().encode(changedXml);
	entry.size = entry.content.length;
	if (replaceRelationshipsXml !== undefined) {
		const relationshipsIndex = zip.FullPaths.findIndex((path: string) =>
			path.endsWith("/xl/_rels/workbook.xml.rels"),
		);
		if (relationshipsIndex < 0) throw new Error("Synthetic workbook relationships XML was not found");
		const relationshipsEntry = zip.FileIndex[relationshipsIndex];
		const relationshipsXml = new TextDecoder().decode(Uint8Array.from(relationshipsEntry.content));
		const changedRelationshipsXml = replaceRelationshipsXml(relationshipsXml);
		if (changedRelationshipsXml === relationshipsXml) {
			throw new Error("Synthetic workbook relationships mutation did not apply");
		}
		relationshipsEntry.content = new TextEncoder().encode(changedRelationshipsXml);
		relationshipsEntry.size = relationshipsEntry.content.length;
	}
	const bytes = Uint8Array.from(
		CFB.write(zip, { type: "buffer", fileType: "zip" }),
	).buffer;
	return { fileName: "synthetic.xlsx", extension: "xlsx", bytes };
}

const simpleRows = [
	["Function", "Member", "email"],
	["Custom Lab-Owner", "Synthetic Person", "person@example.test"],
] as const;

function csvFile(text: string, withBom = false): TeamImportFile {
	const encoded = new TextEncoder().encode(text);
	const bytes = withBom
		? new Uint8Array([0xef, 0xbb, 0xbf, ...encoded])
		: encoded;
	return {
		fileName: "synthetic.csv",
		extension: "csv",
		bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
	};
}

afterEach(() => {
	xlsxReadControl.workbook = null;
});

describe("Team roster file inspection", () => {
	it.each([
		["team.csv", "csv"],
		["team.XLS", "xls"],
		["team.xlsx", "xlsx"],
	] as const)("reads supported browser file bytes for %s", async (fileName, extension) => {
		const bytes = new Uint8Array([1, 2, 3]).buffer;
		const file = { fileName, name: fileName, arrayBuffer: vi.fn(async () => bytes) } as unknown as File;

		await expect(readTeamImportFile(file)).resolves.toEqual({ fileName, extension, bytes });
		expect(file.arrayBuffer).toHaveBeenCalledTimes(1);
	});

	it("rejects an unsupported extension before reading the browser file", async () => {
		const file = { name: "team.txt", arrayBuffer: vi.fn(async () => new ArrayBuffer(0)) } as unknown as File;

		await expect(readTeamImportFile(file)).rejects.toThrow(/Only CSV, XLS, and XLSX/);
		expect(file.arrayBuffer).not.toHaveBeenCalled();
	});

	it.each(["csv", "xls", "xlsx"])("rejects the extensionless filename %s before reading bytes", async (fileName) => {
		const file = { name: fileName, arrayBuffer: vi.fn(async () => new ArrayBuffer(0)) } as unknown as File;

		await expect(readTeamImportFile(file)).rejects.toThrow(/Only CSV, XLS, and XLSX/);
		expect(file.arrayBuffer).not.toHaveBeenCalled();
	});

	it("reports an unreadable supported browser file without parsing it", async () => {
		const file = {
			name: "broken.csv",
			arrayBuffer: vi.fn(async () => { throw new Error("Synthetic byte read failure"); }),
		} as unknown as File;

		await expect(readTeamImportFile(file)).rejects.toThrow("Synthetic byte read failure");
	});

	it.each([
		["B3:E3-like", [[], [], [null, "Function", "Member", "email", "Tel. No."], [null, "QCI-ME-Owner", "Synthetic Owner", "owner@example.test", 123456]], 3],
		["shifted", [[], [], [], [], ["email", "Function", "Member"], ["shifted@example.test", "Custom Shifted-Owner", "Synthetic Shifted"]], 5],
	] as const)("recognizes %s headers by content", (_label, rows, headerRowNumber) => {
		const result = inspectTeamImport(workbookFile("xlsx", [{ name: "Roster", rows }]));
		expect(result.kind).toBe("ready");
		if (result.kind !== "ready") return;
		expect(result.sheet.headerRowNumber).toBe(headerRowNumber);
		expect(result.sheet.rows).toHaveLength(1);
	});

	it("finds swapped columns and treats Member as the person-name header", () => {
		const result = inspectTeamImport(workbookFile("xlsx", [{ name: "Roster", rows: [["email", "Member", "Function"], ["swapped@example.test", "Synthetic Swapped", "Custom SW-Owner"]] }]));
		expect(result.kind).toBe("ready");
		if (result.kind !== "ready") return;
		expect(result.sheet.rows[0]?.cells).toEqual(expect.arrayContaining([
			expect.objectContaining({ columnIndex: 1, headerText: "email" }),
			expect.objectContaining({ columnIndex: 2, headerText: "Member", rawValue: "Synthetic Swapped" }),
			expect.objectContaining({ columnIndex: 3, headerText: "Function" }),
		]));
	});

	it("preserves hidden numeric and duplicate or blank extra-header cells by column", () => {
		const result = inspectTeamImport(workbookFile("xlsx", [{
			name: "Roster",
			rows: [["Function", "Member", "email", "Note", "Note", null], ["Custom Lab-Owner", "Synthetic Person", "person@example.test", "first", 123456, "blank-header-value"]],
			hiddenColumns: [4],
		}]));
		expect(result.kind).toBe("ready");
		if (result.kind !== "ready") return;
		const cells = result.sheet.rows[0]!.cells;
		expect(cells.filter(({ headerText }) => headerText === "Note")).toEqual([
			expect.objectContaining({ columnIndex: 4, rawValue: "first" }),
			expect.objectContaining({ columnIndex: 5, rawType: "n", rawValue: 123456, formattedText: "123456", hidden: true }),
		]);
		expect(cells).toContainEqual(expect.objectContaining({ columnIndex: 6, headerText: null, rawValue: "blank-header-value" }));
	});

	it("requires a choice for two matching sheets and never merges them", () => {
		const file = workbookFile("xlsx", [
			{ name: "Roster A", rows: simpleRows },
			{ name: "Roster B", rows: simpleRows },
			{ name: "Naming Principles", rows: [["Prefix", "Meaning"], ["QCI", "Synthetic"]] },
		]);
		const inspection = inspectTeamImport(file);
		expect(inspection).toEqual({ kind: "chooseSheet", sheets: [
			expect.objectContaining({ sheetName: "Roster A", personRowCount: 1 }),
			expect.objectContaining({ sheetName: "Roster B", personRowCount: 1 }),
		] });
		const selected = selectTeamImportSheet(file, "Roster B");
		expect(selected.kind).toBe("ready");
		if (selected.kind !== "ready") return;
		expect(selected.sheet.sheetName).toBe("Roster B");
		expect(selected.sheet.rows).toHaveLength(1);
	});

	it("rejects a nonexistent or non-roster sheet instead of silently selecting another", () => {
		const file = workbookFile("xlsx", [{ name: "Roster", rows: simpleRows }, { name: "Naming Principles", rows: [["Prefix", "Meaning"]] }]);
		expect(selectTeamImportSheet(file, "Missing")).toMatchObject({ kind: "error" });
		expect(selectTeamImportSheet(file, "Naming Principles")).toMatchObject({ kind: "error" });
	});

	it.each([
		["duplicate", [["Function", "Member", "Member", "email"], ["Lab", "A", "B", "a@example.test"]]],
		["missing", [["Function", "Member"], ["Lab", "Synthetic Person"]]],
	] as const)("returns a located error for %s required headers", (_label, rows) => {
		const result = inspectTeamImport(workbookFile("xlsx", [{ name: "Roster", rows }]));
		expect(result.kind).toBe("error");
		if (result.kind !== "error") return;
		expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({
			code: expect.stringMatching(/header/), severity: "blocking", target: expect.objectContaining({ section: "team.import" }),
		})]));
	});

	it("skips wholly blank template rows but preserves a blank-name partial row", () => {
		const result = inspectTeamImport(workbookFile("xlsx", [{ name: "Roster", rows: [
			["Function", "Member", "email", "Tel. No."], ["Template-Owner", null, null, null], ["Partial-Owner", null, null, 24680],
		] }]));
		expect(result.kind).toBe("ready");
		if (result.kind !== "ready") return;
		expect(result.sheet.rows).toHaveLength(1);
		expect(result.sheet.rows[0]).toMatchObject({ rowNumber: 3 });
		expect(result.sheet.rows[0]?.cells).toContainEqual(expect.objectContaining({ headerText: "Tel. No.", rawValue: 24680 }));
	});

	it("rejects an unsupported source cell instead of returning a shortened roster", () => {
		const result = inspectTeamImport(workbookFile("xlsx", [{
			name: "Roster",
			rows: [simpleRows[0], simpleRows[1], ["Custom Lab-Member", "Other", "other@example.test"]],
			mutate: (sheet) => { sheet.D3 = { t: "e", v: 42 }; sheet["!ref"] = "A1:D3"; },
		}]));
		expect(result.kind).toBe("error");
		if (result.kind !== "error") return;
		expect(result.issues).toContainEqual(expect.objectContaining({
			code: "team.import.unsupported-cell",
			target: expect.objectContaining({ entityId: expect.stringContaining("R3C4") }),
		}));
	});

	it("preserves QCI QCMC Chrome and Windows labels verbatim", () => {
		const labels = ["QCI-EE-Owner", "QCMC-EE IQC-Owner", "QCI-SW Bundle-Owner-(Chrome)", "QCI-SW Bundle-Owner-(Windows)"];
		const result = inspectTeamImport(workbookFile("xlsx", [{ name: "Roster", rows: [simpleRows[0], ...labels.map((label, index) => [label, `Synthetic Person ${index + 1}`, `person${index + 1}@example.test`])] }]));
		expect(result.kind).toBe("ready");
		if (result.kind !== "ready") return;
		expect(result.sheet.rows.map((row) => row.cells.find(({ headerText }) => headerText === "Function")?.rawValue)).toEqual(labels);
	});

	it.each(["csv", "xls", "xlsx"] as const)("parses a synthetic %s roster", (bookType) => {
		const result = inspectTeamImport(workbookFile(bookType, [{ name: "Roster", rows: simpleRows }]));
		expect(result.kind).toBe("ready");
		if (result.kind !== "ready") return;
		expect(result.sheet.rows).toHaveLength(1);
	});

	it.each([false, true])("decodes UTF-8 CSV Unicode with BOM=%s", (withBom) => {
		const result = inspectTeamImport(csvFile([
			"Function,Member,email,Note",
			"Custom Lab-Owner,Synthetic 成員,unicode@example.test,測試資料",
		].join("\n"), withBom));

		expect(result.kind).toBe("ready");
		if (result.kind !== "ready") return;
		expect(result.sheet.rows[0]?.cells).toEqual(expect.arrayContaining([
			expect.objectContaining({ headerText: "Member", rawType: "s", rawValue: "Synthetic 成員" }),
			expect.objectContaining({ headerText: "Note", rawType: "s", rawValue: "測試資料" }),
		]));
	});

	it("keeps date-looking and long-digit CSV fields as exact source text", () => {
		const result = inspectTeamImport(csvFile([
			"Function,Member,email,Date-like,Identifier",
			"Custom Lab-Owner,Synthetic Person,person@example.test,2026-09-21,12345678901234567890",
		].join("\n")));

		expect(result.kind).toBe("ready");
		if (result.kind !== "ready") return;
		expect(result.sheet.rows[0]?.cells).toEqual(expect.arrayContaining([
			expect.objectContaining({ headerText: "Date-like", rawType: "s", rawValue: "2026-09-21" }),
			expect.objectContaining({ headerText: "Identifier", rawType: "s", rawValue: "12345678901234567890" }),
		]));
	});

	it("returns a located error for invalid UTF-8 CSV instead of partial success", () => {
		const prefix = new TextEncoder().encode("Function,Member,email\nCustom Lab-Owner,");
		const suffix = new TextEncoder().encode(",person@example.test");
		const bytes = new Uint8Array([...prefix, 0xff, ...suffix]);
		const result = inspectTeamImport({
			fileName: "invalid.csv",
			extension: "csv",
			bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
		});

		expect(result.kind).toBe("error");
		if (result.kind !== "error") return;
		expect(result.issues).toContainEqual(expect.objectContaining({
			code: "team.import.csv-decode",
			target: expect.objectContaining({ entityId: "invalid.csv" }),
		}));
	});

	it("rejects a declared worksheet missing from the parsed workbook", () => {
		const roster = XLSX.utils.aoa_to_sheet(simpleRows.map((row) => [...row]));
		xlsxReadControl.workbook = {
			SheetNames: ["Roster", "Broken"],
			Sheets: { Roster: roster },
		} as XLSX.WorkBook;

		const result = inspectTeamImport({ fileName: "broken.xlsx", extension: "xlsx", bytes: new ArrayBuffer(0) });

		expect(result.kind).toBe("error");
		if (result.kind !== "error") return;
		expect(result.issues).toContainEqual(expect.objectContaining({
			code: "team.import.worksheet-read",
			target: expect.objectContaining({ entityId: "Broken" }),
	}));
	});

	it("rejects populated worksheet cells outside the declared range", () => {
		const file = mutatedXlsxFile([
			["Function", "Member", "email"],
			["Custom Lab-Owner", "Synthetic One", "one@example.test"],
			["Custom Lab-Member", "Synthetic Two", "two@example.test"],
		], (xml) => xml.replace(
			'<dimension ref="A1:C3"/>',
			'<dimension ref="A1:C2"/>',
		));

		const result = inspectTeamImport(file);

		expect(result.kind).toBe("error");
		if (result.kind !== "error") return;
		expect(result.issues).toContainEqual(expect.objectContaining({
			code: "team.import.worksheet-range",
			target: expect.objectContaining({ entityId: expect.stringContaining("R3C") }),
		}));
	});

	it("rejects a formula without a trustworthy cached value", () => {
		const result = inspectTeamImport(workbookFile("xlsx", [{
			name: "Roster",
			rows: [simpleRows[0], simpleRows[1]],
			mutate: (worksheet) => {
				worksheet.D2 = { t: "n", f: "1+1" };
				worksheet["!ref"] = "A1:D2";
			},
		}]));

		expect(result.kind).toBe("error");
		if (result.kind !== "error") return;
		expect(result.issues).toContainEqual(expect.objectContaining({
			code: "team.import.formula-without-cache",
			target: expect.objectContaining({ entityId: expect.stringContaining("R2C4") }),
	}));
	});

	it.each([
		["b", "TRUE()"],
		["str", '"Synthetic formula text"'],
	] as const)("rejects an uncached %s formula even when the parser fabricates a value", (cellType, formula) => {
		const file = mutatedXlsxFile([
			["Function", "Member", "email", "Note"],
			["Custom Lab-Owner", "Synthetic Person", "person@example.test"],
		], (xml) => xml.replace('<c r="D2">', `<c r="D2" t="${cellType}">`), (worksheet) => {
			worksheet.D2 = { t: "n", f: formula };
			worksheet["!ref"] = "A1:D2";
		});

		const result = inspectTeamImport(file);

		expect(result.kind).toBe("error");
		if (result.kind !== "error") return;
		expect(result.issues).toContainEqual(expect.objectContaining({
			code: "team.import.formula-without-cache",
			target: expect.objectContaining({ entityId: expect.stringContaining("R2C4") }),
		}));
	});

	it("preserves a formula's trustworthy cached native value without calculating it", () => {
		const result = inspectTeamImport(workbookFile("xlsx", [{
			name: "Roster",
			rows: [simpleRows[0], simpleRows[1]],
			mutate: (worksheet) => {
				worksheet.D2 = { t: "n", f: "1+1", v: 2 };
				worksheet["!ref"] = "A1:D2";
			},
		}]));

		expect(result.kind).toBe("ready");
		if (result.kind !== "ready") return;
		expect(result.sheet.rows[0]?.cells).toContainEqual(expect.objectContaining({
			columnIndex: 4,
			rawType: "n",
			rawValue: 2,
		}));
	});

	it("rejects an empty numeric formula cache instead of accepting a fabricated zero", () => {
		const file = mutatedXlsxFile([
			["Function", "Member", "email", "Note"],
			["Custom Lab-Owner", "Synthetic Person", "person@example.test"],
		], (xml) => xml.replace("<v>2</v>", "<v></v>"), (worksheet) => {
			worksheet.D2 = { t: "n", f: "1+1", v: 2 };
			worksheet["!ref"] = "A1:D2";
		});

		const result = inspectTeamImport(file);

		expect(result.kind).toBe("error");
		if (result.kind !== "error") return;
		expect(result.issues).toContainEqual(expect.objectContaining({
			code: "team.import.formula-without-cache",
			target: expect.objectContaining({ entityId: expect.stringContaining("R2C4") }),
		}));
	});

	it("rejects an empty boolean formula cache instead of accepting a fabricated false", () => {
		const file = mutatedXlsxFile([
			["Function", "Member", "email", "Note"],
			["Custom Lab-Owner", "Synthetic Person", "person@example.test"],
		], (xml) => xml
			.replace('<c r="D2">', '<c r="D2" t="b">')
			.replace("<v>2</v>", "<v></v>"), (worksheet) => {
			worksheet.D2 = { t: "n", f: "1+1", v: 2 };
			worksheet["!ref"] = "A1:D2";
		});

		const result = inspectTeamImport(file);

		expect(result.kind).toBe("error");
		if (result.kind !== "error") return;
		expect(result.issues).toContainEqual(expect.objectContaining({
			code: "team.import.formula-without-cache",
			target: expect.objectContaining({ entityId: expect.stringContaining("R2C4") }),
		}));
	});

	it("preserves a trustworthy cached false formula result", () => {
		const result = inspectTeamImport(workbookFile("xlsx", [{
			name: "Roster",
			rows: [simpleRows[0], simpleRows[1]],
			mutate: (worksheet) => {
				worksheet.D2 = { t: "b", f: "FALSE()", v: false };
				worksheet["!ref"] = "A1:D2";
			},
		}]));

		expect(result.kind).toBe("ready");
		if (result.kind !== "ready") return;
		expect(result.sheet.rows[0]?.cells).toContainEqual(expect.objectContaining({
			columnIndex: 4,
			rawType: "b",
			rawValue: false,
		}));
	});

	it("fails closed for an uncached formula when the worksheet relationship uses single quotes", () => {
		const file = mutatedXlsxFile([
			["Function", "Member", "email", "Note"],
			["Custom Lab-Owner", "Synthetic Person", "person@example.test"],
		], (xml) => xml.replace('<c r="D2">', '<c r="D2" t="b">'), (worksheet) => {
			worksheet.D2 = { t: "n", f: "TRUE()" };
			worksheet["!ref"] = "A1:D2";
		}, (xml) => xml.replace(
			'Target="worksheets/sheet1.xml"',
			"Target='worksheets/sheet1.xml'",
		));

		const result = inspectTeamImport(file);

		expect(result.kind).toBe("error");
		if (result.kind !== "error") return;
		expect(result.issues).toContainEqual(expect.objectContaining({
			code: "team.import.formula-without-cache",
			target: expect.objectContaining({ entityId: expect.stringContaining("R2C4") }),
		}));
	});
});
