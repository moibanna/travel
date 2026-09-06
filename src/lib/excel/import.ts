import ExcelJS from "exceljs";
import {
  normaliseName,
  parseFlightPair,
  parseRemarkFlags,
  parseSheetDate,
  parseSheetTime,
  tidyName,
} from "@/lib/parsing";

/** One spreadsheet row, parsed into the shape the database stores. */
export type ParsedMovementRow = {
  sourceRow: number;
  refNo: number | null;
  passengerName: string;
  normalizedName: string;
  arrivalDate: Date | null;
  arrivalTime: string | null;
  arrivalFlight: string | null;
  arrivalDestination: string | null;
  departureDate: Date | null;
  departureTime: string | null;
  departureFlight: string | null;
  departureDestination: string | null;
  requestEmailDate: Date | null;
  receivedFrom: string | null;
  registeredByName: string | null;
  remarks: string | null;
  trfReceived: boolean;
  cipRequested: boolean;
};

export type ImportIssue = {
  sourceRow: number;
  level: "error" | "warning";
  message: string;
};

export type ParseResult = {
  sheetName: string;
  headerRow: number;
  rows: ParsedMovementRow[];
  issues: ImportIssue[];
  /** Rows that were present but skipped because they carried no passenger. */
  skipped: number;
};

/**
 * Column keys the importer understands. The workbook repeats "Time" and
 * "Destination" once under Arrival and once under Departure, so the header
 * scanner tracks which section it is currently inside.
 */
type ColumnKey =
  | "refNo"
  | "name"
  | "arrivalDate"
  | "arrivalTime"
  | "arrivalDestination"
  | "departureDate"
  | "departureTime"
  | "departureDestination"
  | "emailDate"
  | "receivedFrom"
  | "flights"
  | "registeredBy"
  | "remarks";

/**
 * Parses the "Flights" style worksheet.
 *
 * The layout is detected rather than hard coded: the importer looks for the
 * header row (the one carrying "No." and "Name"), then maps columns by their
 * captions. That keeps it working when columns are reordered or a new one is
 * inserted, which is the usual reason a rigid importer breaks.
 */
export async function parseMovementWorkbook(
  data: ArrayBuffer | Buffer,
  options: { sheetName?: string; referenceYear?: number } = {},
): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data as ArrayBuffer);

  const worksheet = options.sheetName
    ? workbook.getWorksheet(options.sheetName)
    : pickBestWorksheet(workbook);

  if (!worksheet) {
    throw new Error("The workbook contains no readable worksheet.");
  }

  const header = findHeaderRow(worksheet);
  if (!header) {
    throw new Error(
      'Could not find a header row. The sheet needs a row containing "No." and "Name".',
    );
  }

  const referenceYear = options.referenceYear ?? new Date().getUTCFullYear();
  const rows: ParsedMovementRow[] = [];
  const issues: ImportIssue[] = [];
  const seenRefNos = new Map<number, number>();
  let skipped = 0;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= header.rowNumber) return;

    const read = (key: ColumnKey): unknown => {
      const column = header.columns[key];
      return column ? cellValue(row.getCell(column)) : null;
    };

    const rawName = text(read("name"));
    if (!rawName) {
      skipped += 1;
      return;
    }

    const refNoRaw = read("refNo");
    const refNo = toInteger(refNoRaw);
    if (refNoRaw !== null && refNoRaw !== "" && refNo === null) {
      issues.push({
        sourceRow: rowNumber,
        level: "warning",
        message: `Reference number "${text(refNoRaw)}" is not a whole number; a new one will be assigned.`,
      });
    }
    if (refNo !== null) {
      const previous = seenRefNos.get(refNo);
      if (previous !== undefined) {
        issues.push({
          sourceRow: rowNumber,
          level: "error",
          message: `Reference number ${refNo} is already used by row ${previous}; this row will be skipped.`,
        });
        return;
      }
      seenRefNos.set(refNo, rowNumber);
    }

    const remarks = text(read("remarks"));
    const flags = parseRemarkFlags(remarks);
    const flights = parseFlightPair(text(read("flights")));

    const arrivalDate = parseSheetDate(read("arrivalDate"), referenceYear);
    const departureDate = parseSheetDate(read("departureDate"), referenceYear);

    if (arrivalDate && departureDate && departureDate < arrivalDate) {
      issues.push({
        sourceRow: rowNumber,
        level: "warning",
        message: `Departure (${departureDate.toISOString().slice(0, 10)}) is before arrival (${arrivalDate.toISOString().slice(0, 10)}).`,
      });
    }

    rows.push({
      sourceRow: rowNumber,
      refNo,
      passengerName: tidyName(rawName),
      normalizedName: normaliseName(rawName),
      arrivalDate,
      arrivalTime: parseSheetTime(read("arrivalTime")),
      arrivalFlight: flights.arrival,
      arrivalDestination: text(read("arrivalDestination")),
      departureDate,
      departureTime: parseSheetTime(read("departureTime")),
      departureFlight: flights.departure,
      departureDestination: text(read("departureDestination")),
      requestEmailDate: parseSheetDate(read("emailDate"), referenceYear),
      receivedFrom: text(read("receivedFrom")),
      registeredByName: text(read("registeredBy")),
      remarks,
      trfReceived: flags.trfReceived,
      cipRequested: flags.cipRequested,
    });
  });

  return { sheetName: worksheet.name, headerRow: header.rowNumber, rows, issues, skipped };
}

// ---------------------------------------------------------------------------

/** Picks the worksheet that looks most like a movement log. */
function pickBestWorksheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet | undefined {
  const named = workbook.worksheets.find((sheet) => /flight|master|travel/i.test(sheet.name));
  if (named && findHeaderRow(named)) return named;
  return workbook.worksheets.find((sheet) => findHeaderRow(sheet)) ?? workbook.worksheets[0];
}

type HeaderMatch = {
  rowNumber: number;
  columns: Partial<Record<ColumnKey, number>>;
};

/**
 * Locates the header row and maps captions to column numbers, tracking whether
 * the repeated "Time"/"Destination" captions belong to arrival or departure.
 */
function findHeaderRow(worksheet: ExcelJS.Worksheet): HeaderMatch | null {
  const limit = Math.min(worksheet.rowCount, 25);

  for (let rowNumber = 1; rowNumber <= limit; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const captions: { column: number; caption: string }[] = [];

    row.eachCell({ includeEmpty: false }, (cell, column) => {
      const caption = text(cellValue(cell));
      if (caption) captions.push({ column, caption: caption.toLowerCase().trim() });
    });

    const hasNo = captions.some((c) => /^no\.?$/.test(c.caption) || c.caption === "ref" || c.caption === "ref no");
    const hasName = captions.some((c) => /^(name|passenger|passenger name|full name)$/.test(c.caption));
    if (!hasNo || !hasName) continue;

    const columns: Partial<Record<ColumnKey, number>> = {};
    let section: "arrival" | "departure" = "arrival";

    for (const { column, caption } of captions) {
      if (/^no\.?$|^ref( no)?$/.test(caption)) {
        columns.refNo ??= column;
      } else if (/^(name|passenger|passenger name|full name)$/.test(caption)) {
        columns.name ??= column;
      } else if (/^arrival/.test(caption)) {
        section = "arrival";
        columns.arrivalDate ??= column;
      } else if (/^departure/.test(caption)) {
        section = "departure";
        columns.departureDate ??= column;
      } else if (/^time$/.test(caption)) {
        if (section === "arrival") columns.arrivalTime ??= column;
        else columns.departureTime ??= column;
      } else if (/^destination/.test(caption)) {
        if (section === "arrival") columns.arrivalDestination ??= column;
        else columns.departureDestination ??= column;
      } else if (/mail\s*date|e-?mail/.test(caption)) {
        columns.emailDate ??= column;
      } else if (/received\s*from|source/.test(caption)) {
        columns.receivedFrom ??= column;
      } else if (/flight/.test(caption)) {
        columns.flights ??= column;
      } else if (/^reg(\.|istered)?\s*by$/.test(caption)) {
        columns.registeredBy ??= column;
      } else if (/^remarks?$|^notes?$/.test(caption)) {
        columns.remarks ??= column;
      }
    }

    return { rowNumber, columns };
  }

  return null;
}

/** Flattens ExcelJS cell values (formulas, rich text, hyperlinks) to a scalar. */
function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("result" in value) return (value as { result: unknown }).result ?? null;
    if ("text" in value) return (value as { text: unknown }).text;
    if ("richText" in value) {
      return (value as { richText: { text: string }[] }).richText
        .map((part) => part.text)
        .join("");
    }
    if ("hyperlink" in value) return (value as { text?: string }).text ?? null;
  }
  return value;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).replace(/\s+/g, " ").trim();
  return trimmed === "" ? null : trimmed;
}

function toInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(String(value).replace(/[^\d-]/g, ""));
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}
