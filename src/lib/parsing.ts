/**
 * Pure parsing helpers for the legacy spreadsheet formats. Kept free of any
 * database or framework imports so they can be unit tested directly.
 */

/**
 * Splits the combined "Flight A/D" cell into its arrival and departure flight
 * numbers.
 *
 * The column is written in a shorthand where the airline prefix is stated once
 * and carried over to the second flight:
 *
 *   "TK804/317"        -> TK804  / TK317
 *   "QR451/ 450"       -> QR451  / QR450
 *   "G 9357 / G 9358"  -> G 9357 / G 9358
 *   "RJ 824/TK317"     -> RJ 824 / TK317   (explicit second carrier wins)
 *   "EK 270"           -> EK 270 / null    (one-way)
 */
export function parseFlightPair(raw: string | null | undefined): {
  arrival: string | null;
  departure: string | null;
} {
  const value = (raw ?? "").trim();
  if (!value) return { arrival: null, departure: null };

  const parts = value.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return { arrival: null, departure: null };

  const arrival = parts[0];
  if (parts.length === 1) return { arrival, departure: null };

  let departure = parts[1];
  // A second segment of digits only inherits the carrier code of the first.
  if (/^\d+$/.test(departure)) {
    const prefix = arrival.match(/^([A-Za-z]+\s?)/)?.[1] ?? "";
    departure = `${prefix}${departure}`;
  }
  return { arrival, departure };
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parses the date formats that appear in the workbook. Returns null for blanks
 * and for placeholders such as "TBC", so an unknown date is never silently
 * turned into a wrong one.
 *
 * Handles: Date objects, Excel serial numbers, "28-Oct-26", "14-Aug",
 * "2026-01-10" and "10/01/2026" (day first, matching the source data).
 *
 * @param referenceYear Year assumed for values that omit one (e.g. "14-Aug").
 */
export function parseSheetDate(
  raw: unknown,
  referenceYear: number = new Date().getUTCFullYear(),
): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : stripTime(raw);
  }

  if (typeof raw === "number") return fromExcelSerial(raw);

  const value = String(raw).trim();
  if (!value || /^(tbc|tba|n\/?a|-)$/i.test(value)) return null;

  // Excel serial numbers can arrive as text.
  if (/^\d{5}(\.\d+)?$/.test(value)) return fromExcelSerial(Number(value));

  // ISO: 2026-01-10
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return makeUtc(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  // 28-Oct-26 / 28-Oct-2026 / 14-Aug / 28 Oct 26
  const named = value.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s]?(\d{2,4})?$/);
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (month === undefined) return null;
    return makeUtc(expandYear(named[3], referenceYear), month, Number(named[1]));
  }

  // Day-first numeric: 10/01/2026 or 10-01-2026
  const numeric = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]) - 1;
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;
    return makeUtc(expandYear(numeric[3], referenceYear), month, day);
  }

  return null;
}

/**
 * Normalises the time column to "HH:MM". Excel stores times as a fraction of a
 * day, which is why a bare number is treated as such. Placeholders return null.
 */
export function parseSheetTime(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;

  if (raw instanceof Date) {
    return `${pad(raw.getUTCHours())}:${pad(raw.getUTCMinutes())}`;
  }

  if (typeof raw === "number") return fractionToTime(raw);

  const value = String(raw).trim();
  if (!value || /^(tbc|tba|n\/?a|-)$/i.test(value)) return null;

  // A bare fraction stored as text, e.g. "0.65625".
  if (/^0?\.\d+$/.test(value)) return fractionToTime(Number(value));

  const match = value.match(/^(\d{1,2})[:.](\d{2})/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  // "5:15 PM" style suffixes.
  const isPm = /p\.?m\.?/i.test(value);
  const isAm = /a\.?m\.?/i.test(value);
  let normalisedHours = hours;
  if (isPm && hours < 12) normalisedHours += 12;
  if (isAm && hours === 12) normalisedHours = 0;

  return `${pad(normalisedHours)}:${pad(minutes)}`;
}

/**
 * Normalises a passenger name for deduplication. The source data mixes
 * "MCLEAN, DARREN JAMES" with "Darren James Mclean" and stray double spaces.
 */
export function normaliseName(raw: string): string {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  // "SURNAME, GIVEN NAMES" -> "GIVEN NAMES SURNAME"
  const commaSplit = trimmed.split(",");
  const reordered =
    commaSplit.length === 2 && commaSplit[1].trim()
      ? `${commaSplit[1].trim()} ${commaSplit[0].trim()}`
      : trimmed;

  return reordered
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Presentation form of a name: "MCLEAN, DARREN JAMES" -> "Darren James Mclean". */
export function tidyName(raw: string): string {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  const commaSplit = trimmed.split(",");
  const reordered =
    commaSplit.length === 2 && commaSplit[1].trim()
      ? `${commaSplit[1].trim()} ${commaSplit[0].trim()}`
      : trimmed;

  return reordered
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, boundary, letter) => boundary + letter.toUpperCase());
}

/**
 * Reads the flags the travel desk encodes in the free-text Remarks column.
 *   "CIP"          -> meet and greet requested
 *   "No TRF yet"   -> the travel request form has not arrived
 */
export function parseRemarkFlags(raw: string | null | undefined): {
  cipRequested: boolean;
  trfReceived: boolean;
} {
  const value = (raw ?? "").toLowerCase();
  return {
    cipRequested: /\bcip\b/.test(value),
    trfReceived: !/no\s*trf/.test(value),
  };
}

// ---------------------------------------------------------------------------

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function makeUtc(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month, day));
  // Rejects impossible dates such as 31 February, which JS would roll forward.
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date;
}

function expandYear(raw: string | undefined, referenceYear: number): number {
  if (!raw) return referenceYear;
  const year = Number(raw);
  if (raw.length === 4) return year;
  // Two-digit years in this data set are all 20xx.
  return 2000 + year;
}

function stripTime(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** Excel's day 0 is 1899-12-30 (its leap-year bug included). */
function fromExcelSerial(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const days = Math.floor(serial);
  const date = new Date(Date.UTC(1899, 11, 30) + days * 86_400_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fractionToTime(fraction: number): string | null {
  if (!Number.isFinite(fraction)) return null;
  // Whole numbers here are dates, not times.
  const dayFraction = fraction >= 1 ? fraction - Math.floor(fraction) : fraction;
  if (dayFraction <= 0) return null;
  const totalMinutes = Math.round(dayFraction * 24 * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  return `${pad(hours)}:${pad(totalMinutes % 60)}`;
}
