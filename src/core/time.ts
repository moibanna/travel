/** Time and date helpers. All dates are ISO `YYYY-MM-DD`; all times `HH:MM`. */

/** Minutes since midnight, or null when the value is not a valid 24-hour time. */
export function toMin(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t ?? "").trim());
  if (!m) return null;
  const h = +m[1];
  const mm = +m[2];
  return h < 24 && mm < 60 ? h * 60 + mm : null;
}

/** Minutes since midnight back to "HH:MM", wrapping across midnight. */
export function toHHMM(mins: number): string {
  const v = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

/** Shifts an ISO date by whole days. Midday avoids any DST edge. */
export function shiftDate(iso: string, days: number): string {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayStr(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** "2026-10-28" -> "28 Oct 26" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  return `${+d} ${MONTHS[+m - 1]} ${String(y).slice(2)}`;
}

export function nowMinutes(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** Whole days between two ISO dates, or null if either is missing. */
export function daysApart(a: string, b: string): number | null {
  if (!a || !b) return null;
  return Math.abs(
    (new Date(a + "T12:00:00").getTime() - new Date(b + "T12:00:00").getTime()) / 86_400_000,
  );
}
