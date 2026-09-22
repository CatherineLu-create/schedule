import * as XLSX from "xlsx";

import type { TeamSourceCell, TeamSourceRow } from "../../domain/team/team";
import type { ValidationIssue } from "../../domain/validation/validationIssue";

export interface TeamImportFile {
	readonly fileName: string;
	readonly extension: "csv" | "xls" | "xlsx";
	readonly bytes: ArrayBuffer;
}

const supportedExtensions = new Set<TeamImportFile["extension"]>([
	"csv",
	"xls",
	"xlsx",
]);

export async function readTeamImportFile(file: File): Promise<TeamImportFile> {
	const separator = file.name.lastIndexOf(".");
	const extension = separator > 0 ? file.name.slice(separator + 1).toLowerCase() : undefined;
	if (!supportedExtensions.has(extension as TeamImportFile["extension"])) {
		throw new Error("Only CSV, XLS, and XLSX Team files are supported.");
	}
	return {
		fileName: file.name,
		extension: extension as TeamImportFile["extension"],
		bytes: await file.arrayBuffer(),
	};
}

export interface TeamParsedSheet {
	readonly fileName: string;
	readonly sheetName: string;
	readonly headerRowNumber: number;
	readonly rows: readonly TeamSourceRow[];
}

export interface TeamSheetCandidate {
	readonly sheetName: string;
	readonly headerRowNumber: number;
	readonly functionColumn: number;
	readonly memberColumn: number;
	readonly emailColumn: number;
	readonly personRowCount: number;
}

export type TeamImportInspection =
	| { readonly kind: "chooseSheet"; readonly sheets: readonly TeamSheetCandidate[] }
	| { readonly kind: "ready"; readonly sheet: TeamParsedSheet }
	| { readonly kind: "error"; readonly issues: readonly ValidationIssue[] };

interface LocatedHeader {
	readonly candidate: TeamSheetCandidate;
	readonly zeroBasedColumns: {
		readonly functionColumn: number;
		readonly memberColumn: number;
		readonly emailColumn: number;
	};
}

interface WorkbookAnalysis {
	readonly workbook: XLSX.WorkBook | null;
	readonly candidates: readonly LocatedHeader[];
	readonly issues: readonly ValidationIssue[];
	readonly formulaCaches: ReadonlyMap<string, ReadonlyMap<string, boolean>>;
}

interface WorkbookFileEntry {
	readonly content?: Uint8Array;
}

interface WorkbookWithFiles extends XLSX.WorkBook {
	readonly files?: Readonly<Record<string, WorkbookFileEntry>>;
}

const requiredHeaders = ["function", "member", "email"] as const;
type RequiredHeader = (typeof requiredHeaders)[number];

function normalizedHeader(value: unknown): RequiredHeader | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim().toLowerCase();
	return requiredHeaders.includes(normalized as RequiredHeader)
		? (normalized as RequiredHeader)
		: null;
}

function issue(
	code: string,
	message: string,
	entityId: string,
	field?: string,
): ValidationIssue {
	return {
		code,
		domain: "team",
		source: "import",
		severity: "blocking",
		message,
		target: { section: "team.import", entityId, ...(field === undefined ? {} : { field }) },
	};
}

function cellDisplayValue(cell: XLSX.CellObject | undefined): string | null {
	if (cell === undefined || cell.v === undefined || cell.v === null) return null;
	return cell.w ?? String(cell.v);
}

function attributeValue(attributes: string, name: string): string | null {
	const match = attributes.match(
		new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`),
	);
	return match?.[1] ?? match?.[2] ?? null;
}

function hasTrustworthyFormulaCache(attributes: string, body: string): boolean {
	const valueMatch = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/);
	if (valueMatch === null) return false;
	const rawValue = valueMatch[1] ?? "";
	const trimmedValue = rawValue.trim();
	const cellType = attributeValue(attributes, "t") ?? "n";
	if (cellType === "str") return true;
	if (cellType === "b") return trimmedValue === "0" || trimmedValue === "1";
	if (cellType === "n") {
		return trimmedValue !== "" && Number.isFinite(Number(trimmedValue));
	}
	if (cellType === "s") return /^\d+$/.test(trimmedValue);
	return false;
}

function formulaCachesFor(
	workbook: XLSX.WorkBook,
): ReadonlyMap<string, ReadonlyMap<string, boolean>> {
	const withFiles = workbook as WorkbookWithFiles;
	const files = withFiles.files;
	const sheetMetadata = workbook.Workbook?.Sheets;
	const relationshipsEntry = files?.["xl/_rels/workbook.xml.rels"];
	if (files === undefined || sheetMetadata === undefined || relationshipsEntry?.content === undefined) {
		return new Map();
	}
	const relationshipsXml = new TextDecoder().decode(relationshipsEntry.content);
	const targets = new Map<string, string>();
	for (const match of relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
		const id = attributeValue(match[1] ?? "", "Id");
		const target = attributeValue(match[1] ?? "", "Target");
		const type = attributeValue(match[1] ?? "", "Type");
		if (id !== null && target !== null && type?.endsWith("/worksheet")) {
			targets.set(id, target.replace(/^\//, "").replace(/\\/g, "/"));
		}
	}
	const result = new Map<string, ReadonlyMap<string, boolean>>();
	for (const metadata of sheetMetadata) {
		const { id: relationshipId, name: sheetName } = metadata as {
			readonly id?: string;
			readonly name?: string;
		};
		if (sheetName === undefined) continue;
		const target = relationshipId === undefined ? undefined : targets.get(relationshipId);
		if (target === undefined) continue;
		const path = target.startsWith("xl/") ? target : `xl/${target}`;
		const content = files[path]?.content;
		if (content === undefined) continue;
		const xml = new TextDecoder().decode(content);
		const cacheByAddress = new Map<string, boolean>();
		for (const match of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
			const attributes = match[1] ?? "";
			const address = attributeValue(attributes, "r");
			const body = match[2] ?? "";
			if (address !== null && /<f(?:\s[^>]*)?>/.test(body)) {
				cacheByAddress.set(
					address,
					hasTrustworthyFormulaCache(attributes, body),
				);
			}
		}
		result.set(sheetName, cacheByAddress);
	}
	return result;
}

function validateWorksheetRange(
	sheetName: string,
	worksheet: XLSX.WorkSheet,
): readonly ValidationIssue[] {
	const ref = worksheet["!ref"];
	if (ref === undefined) return [];
	const range = XLSX.utils.decode_range(ref);
	for (const address of Object.keys(worksheet)) {
		if (address.startsWith("!")) continue;
		const cell = worksheet[address];
		if (cell === undefined || (cell.v === undefined && cell.f === undefined)) continue;
		const position = XLSX.utils.decode_cell(address);
		if (
			position.r < range.s.r || position.r > range.e.r ||
			position.c < range.s.c || position.c > range.e.c
		) {
			return [issue(
				"team.import.worksheet-range",
				`Cell ${sheetName}!R${position.r + 1}C${position.c + 1} contains data outside the declared worksheet range.`,
				`${sheetName}!R${position.r + 1}C${position.c + 1}`,
			)];
		}
	}
	return [];
}

function locateHeader(
	sheetName: string,
	worksheet: XLSX.WorkSheet,
): { readonly header: LocatedHeader | null; readonly issues: readonly ValidationIssue[] } {
	const ref = worksheet["!ref"];
	if (ref === undefined) return { header: null, issues: [] };
	const range = XLSX.utils.decode_range(ref);
	const partialRows: number[] = [];
	const ambiguousIssues: ValidationIssue[] = [];
	const matches: LocatedHeader[] = [];

	for (let row = range.s.r; row <= range.e.r; row += 1) {
		const columns = new Map<RequiredHeader, number[]>();
		for (const required of requiredHeaders) columns.set(required, []);
		for (let column = range.s.c; column <= range.e.c; column += 1) {
			const address = XLSX.utils.encode_cell({ r: row, c: column });
			const header = normalizedHeader(cellDisplayValue(worksheet[address]));
			if (header !== null) columns.get(header)!.push(column);
		}
		const presentCount = requiredHeaders.filter((header) => columns.get(header)!.length > 0).length;
		if (presentCount >= 2) partialRows.push(row);
		const duplicate = requiredHeaders.find((header) => columns.get(header)!.length > 1);
		if (duplicate !== undefined) {
			ambiguousIssues.push(issue(
				"team.import.ambiguous-header",
				`Sheet ${sheetName} row ${row + 1} contains duplicate ${duplicate} headers.`,
				`${sheetName}!R${row + 1}`,
				duplicate,
			));
			continue;
		}
		if (presentCount !== requiredHeaders.length) continue;
		const functionColumn = columns.get("function")![0]!;
		const memberColumn = columns.get("member")![0]!;
		const emailColumn = columns.get("email")![0]!;
		matches.push({
			candidate: {
				sheetName,
				headerRowNumber: row + 1,
				functionColumn: functionColumn + 1,
				memberColumn: memberColumn + 1,
				emailColumn: emailColumn + 1,
				personRowCount: 0,
			},
			zeroBasedColumns: { functionColumn, memberColumn, emailColumn },
		});
	}

	if (ambiguousIssues.length > 0) return { header: null, issues: ambiguousIssues };
	if (matches.length > 1) {
		return {
			header: null,
			issues: [issue(
				"team.import.ambiguous-header-row",
				`Sheet ${sheetName} contains more than one possible roster header row.`,
				sheetName,
			)],
		};
	}
	if (matches.length === 1) return { header: matches[0]!, issues: [] };
	if (partialRows.length > 0) {
		const row = partialRows[0]!;
		return {
			header: null,
			issues: [issue(
				"team.import.missing-header",
				`Sheet ${sheetName} row ${row + 1} does not contain one Function, Member, and email header.`,
				`${sheetName}!R${row + 1}`,
			)],
		};
	}
	return { header: null, issues: [] };
}

function isSupportedRawValue(value: unknown): value is string | number | boolean | null {
	return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function hasPersonData(cell: TeamSourceCell, functionColumn: number): boolean {
	if (cell.columnIndex === functionColumn) return false;
	return typeof cell.rawValue === "string" ? cell.rawValue.trim() !== "" : cell.rawValue !== null;
}

function parseSheet(
	fileName: string,
	worksheet: XLSX.WorkSheet,
	header: LocatedHeader,
	formulaCache: ReadonlyMap<string, boolean> | null,
): { readonly sheet: TeamParsedSheet | null; readonly issues: readonly ValidationIssue[] } {
	const ref = worksheet["!ref"];
	if (ref === undefined) {
		return { sheet: { fileName, sheetName: header.candidate.sheetName, headerRowNumber: header.candidate.headerRowNumber, rows: [] }, issues: [] };
	}
	const range = XLSX.utils.decode_range(ref);
	const headerRow = header.candidate.headerRowNumber - 1;
	const headerTexts = new Map<number, string | null>();
	for (let column = range.s.c; column <= range.e.c; column += 1) {
		headerTexts.set(column, cellDisplayValue(worksheet[XLSX.utils.encode_cell({ r: headerRow, c: column })]));
	}
	const rows: TeamSourceRow[] = [];
	const issues: ValidationIssue[] = [];
	for (let row = headerRow + 1; row <= range.e.r; row += 1) {
		const cells: TeamSourceCell[] = [];
		for (let column = range.s.c; column <= range.e.c; column += 1) {
			const address = XLSX.utils.encode_cell({ r: row, c: column });
			const cell = worksheet[address];
			if (cell?.f !== undefined && (
				formulaCache !== null
					? formulaCache.get(address) !== true ||
						cell.v === undefined || cell.v === null || cell.t === "z"
					: cell.v === undefined || cell.v === null || cell.t === "z"
			)) {
				issues.push(issue(
					"team.import.formula-without-cache",
					`Cell ${header.candidate.sheetName}!R${row + 1}C${column + 1} has a formula without a trustworthy cached value.`,
					`${header.candidate.sheetName}!R${row + 1}C${column + 1}`,
				));
				continue;
			}
			if (cell === undefined || cell.v === undefined || cell.v === null) continue;
			if (!isSupportedRawValue(cell.v) || !["s", "str", "n", "b", "z"].includes(cell.t ?? "")) {
				issues.push(issue(
					"team.import.unsupported-cell",
					`Cell ${header.candidate.sheetName}!R${row + 1}C${column + 1} cannot be preserved safely.`,
					`${header.candidate.sheetName}!R${row + 1}C${column + 1}`,
				));
				continue;
			}
			cells.push({
				columnIndex: column + 1,
				headerText: headerTexts.get(column) ?? null,
				rawType: cell.t ?? typeof cell.v,
				rawValue: cell.v,
				formattedText: cellDisplayValue(cell),
				hidden: worksheet["!cols"]?.[column]?.hidden === true,
			});
		}
		if (cells.some((cell) => hasPersonData(cell, header.candidate.functionColumn))) {
			rows.push({ fileName, sheetName: header.candidate.sheetName, rowNumber: row + 1, cells });
		}
	}
	if (issues.length > 0) return { sheet: null, issues };
	return {
		sheet: { fileName, sheetName: header.candidate.sheetName, headerRowNumber: header.candidate.headerRowNumber, rows },
		issues: [],
	};
}

function readWorkbook(input: TeamImportFile): XLSX.WorkBook {
	if (input.extension === "csv") {
		let csvText: string;
		try {
			csvText = new TextDecoder("utf-8", { fatal: true }).decode(
				new Uint8Array(input.bytes),
			);
		} catch {
			throw new Error("CSV is not valid UTF-8.");
		}
		return XLSX.read(csvText, {
			type: "string",
			raw: true,
			cellDates: false,
			cellText: true,
			cellStyles: true,
			WTF: true,
		});
	}

	return XLSX.read(input.bytes, {
		type: "array",
		bookFiles: input.extension === "xlsx",
		cellDates: false,
		cellText: true,
		cellStyles: true,
		WTF: true,
	});
}

function analyze(input: TeamImportFile): WorkbookAnalysis {
	let workbook: XLSX.WorkBook;
	try {
		workbook = readWorkbook(input);
	} catch (error) {
		const isCsvDecode =
			input.extension === "csv" &&
			error instanceof Error &&
			error.message === "CSV is not valid UTF-8.";
		return {
			workbook: null,
			candidates: [],
			formulaCaches: new Map(),
			issues: [issue(
				isCsvDecode ? "team.import.csv-decode" : "team.import.workbook-read",
				error instanceof Error ? error.message : "Workbook could not be read.",
				input.fileName,
			)],
		};
	}
	const candidates: LocatedHeader[] = [];
	const issues: ValidationIssue[] = [];
	const formulaCaches = formulaCachesFor(workbook);
	for (const sheetName of workbook.SheetNames) {
		const worksheet = workbook.Sheets[sheetName];
		if (worksheet === undefined) {
			issues.push(issue(
				"team.import.worksheet-read",
				`Declared worksheet ${sheetName} is unavailable.`,
				sheetName,
			));
			continue;
		}
		try {
			const rangeIssues = validateWorksheetRange(sheetName, worksheet);
			issues.push(...rangeIssues);
			if (rangeIssues.length > 0) continue;
			const located = locateHeader(sheetName, worksheet);
			issues.push(...located.issues);
			if (located.header === null) continue;
			const parsed = parseSheet(
				input.fileName,
				worksheet,
				located.header,
				formulaCaches.get(sheetName) ?? (input.extension === "xlsx" ? new Map() : null),
			);
			issues.push(...parsed.issues);
			if (parsed.sheet === null) continue;
			candidates.push({
				...located.header,
				candidate: { ...located.header.candidate, personRowCount: parsed.sheet.rows.length },
			});
		} catch (error) {
			issues.push(issue(
				"team.import.worksheet-read",
				error instanceof Error
					? `Worksheet ${sheetName} could not be inspected: ${error.message}`
					: `Worksheet ${sheetName} could not be inspected.`,
				sheetName,
			));
		}
	}
	if (candidates.length === 0 && issues.length === 0) {
		issues.push(issue("team.import.missing-header", "No sheet contains one Function, Member, and email header.", input.fileName));
	}
	return { workbook, candidates, issues, formulaCaches };
}

function readyFor(
	input: TeamImportFile,
	analysis: WorkbookAnalysis,
	header: LocatedHeader,
): TeamImportInspection {
	const worksheet = analysis.workbook?.Sheets[header.candidate.sheetName];
	if (worksheet === undefined) {
		return { kind: "error", issues: [issue("team.import.sheet-selection", "Selected roster sheet is unavailable.", header.candidate.sheetName)] };
	}
	const parsed = parseSheet(
		input.fileName,
		worksheet,
		header,
		analysis.formulaCaches.get(header.candidate.sheetName) ??
			(input.extension === "xlsx" ? new Map() : null),
	);
	return parsed.sheet === null ? { kind: "error", issues: parsed.issues } : { kind: "ready", sheet: parsed.sheet };
}

export function inspectTeamImport(input: TeamImportFile): TeamImportInspection {
	const analysis = analyze(input);
	if (analysis.issues.length > 0) return { kind: "error", issues: analysis.issues };
	if (analysis.candidates.length === 1) return readyFor(input, analysis, analysis.candidates[0]!);
	return { kind: "chooseSheet", sheets: analysis.candidates.map(({ candidate }) => candidate) };
}

export function selectTeamImportSheet(
	input: TeamImportFile,
	sheetName: string,
): TeamImportInspection {
	const analysis = analyze(input);
	if (analysis.issues.length > 0) return { kind: "error", issues: analysis.issues };
	const matches = analysis.candidates.filter(({ candidate }) => candidate.sheetName === sheetName);
	if (matches.length !== 1) {
		return { kind: "error", issues: [issue("team.import.sheet-selection", "Selected sheet is not an eligible roster sheet.", sheetName)] };
	}
	return readyFor(input, analysis, matches[0]!);
}
