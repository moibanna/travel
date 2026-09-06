/**
 * Operational rules of the travel desk. Pure functions over plain objects so
 * they can be unit tested and reused by pages, API routes and reports alike.
 */

import type { MovementStatus } from "@/lib/constants";

/** The subset of a movement the rules below actually need. */
export type MovementLike = {
  arrivalDate: Date | null;
  departureDate: Date | null;
  arrivalTime?: string | null;
  arrivalFlight?: string | null;
  arrivalDestination?: string | null;
  departureDestination?: string | null;
  status: string;
  trfReceived?: boolean;
};

/** Start of the given day, in UTC. All date-only comparisons use this. */
export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function isSameUtcDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return startOfUtcDay(a).getTime() === startOfUtcDay(b).getTime();
}

/**
 * Whether the passenger is in country on the given date — the live POB
 * (persons on board) figure the desk is asked for daily.
 *
 * A movement counts as in country once its arrival date has passed and until
 * its departure date arrives. A movement with no recorded departure is treated
 * as still in country, which is deliberate: an open-ended stay is exactly what
 * the desk needs flagged, not hidden.
 */
export function isInCountry(movement: MovementLike, on: Date): boolean {
  if (movement.status === "CANCELLED") return false;
  if (!movement.arrivalDate) return false;

  const day = startOfUtcDay(on);
  if (startOfUtcDay(movement.arrivalDate) > day) return false;
  if (!movement.departureDate) return true;
  return startOfUtcDay(movement.departureDate) >= day;
}

/**
 * The status the dates imply, used to flag records whose stored status has
 * drifted out of date. It never returns CANCELLED — that is always a human
 * decision.
 */
export function deriveStatus(movement: MovementLike, now: Date): MovementStatus {
  if (movement.status === "CANCELLED") return "CANCELLED";

  const today = startOfUtcDay(now);
  const arrival = movement.arrivalDate ? startOfUtcDay(movement.arrivalDate) : null;
  const departure = movement.departureDate
    ? startOfUtcDay(movement.departureDate)
    : null;

  if (departure && departure < today) return "DEPARTED";
  if (arrival && arrival <= today) return "ARRIVED";
  return movement.status === "CONFIRMED" ? "CONFIRMED" : "PLANNED";
}

export type Alert = {
  code: "MISSING_TRF" | "DESTINATION_TBC" | "NO_DEPARTURE" | "MISSING_TIME" | "STATUS_STALE";
  severity: "high" | "medium" | "low";
  message: string;
};

/**
 * Everything about a movement that needs a human to look at it. This is the
 * check the spreadsheet could not perform: it could hold the data but never
 * tell anyone which rows were incomplete.
 */
export function computeAlerts(movement: MovementLike, now: Date): Alert[] {
  const alerts: Alert[] = [];
  if (movement.status === "CANCELLED") return alerts;

  const today = startOfUtcDay(now);
  const arrival = movement.arrivalDate ? startOfUtcDay(movement.arrivalDate) : null;
  const imminent =
    arrival !== null &&
    arrival >= today &&
    arrival <= addUtcDays(today, 7);

  if (movement.trfReceived === false) {
    alerts.push({
      code: "MISSING_TRF",
      severity: imminent ? "high" : "medium",
      message: imminent
        ? "No travel request form, and the passenger arrives within 7 days"
        : "No travel request form received",
    });
  }

  if (isTbc(movement.arrivalDestination) || isTbc(movement.departureDestination)) {
    alerts.push({
      code: "DESTINATION_TBC",
      severity: imminent ? "high" : "low",
      message: "Destination is still marked TBC",
    });
  }

  if (movement.arrivalDate && !movement.departureDate) {
    alerts.push({
      code: "NO_DEPARTURE",
      severity: "low",
      message: "No departure recorded — the stay is open ended",
    });
  }

  if (imminent && !movement.arrivalTime) {
    alerts.push({
      code: "MISSING_TIME",
      severity: "medium",
      message: "Arrival time is not confirmed",
    });
  }

  const derived = deriveStatus(movement, now);
  if (derived !== movement.status) {
    alerts.push({
      code: "STATUS_STALE",
      severity: "low",
      message: `Status says ${movement.status.toLowerCase()} but the dates indicate ${derived.toLowerCase()}`,
    });
  }

  return alerts;
}

function isTbc(value: string | null | undefined): boolean {
  return /^\s*(tbc|tba)\s*$/i.test(value ?? "");
}

/** Highest severity among a set of alerts, or null when there are none. */
export function worstSeverity(alerts: Alert[]): Alert["severity"] | null {
  if (alerts.some((a) => a.severity === "high")) return "high";
  if (alerts.some((a) => a.severity === "medium")) return "medium";
  if (alerts.length > 0) return "low";
  return null;
}

/** Formats a date for display without dragging in a locale dependency. */
export function formatDate(date: Date | null | undefined): string {
  if (!date) return "—";
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${day} ${month} ${date.getUTCFullYear()}`;
}

/** Short form used in dense tables: "28 Oct". */
export function formatDateShort(date: Date | null | undefined): string {
  if (!date) return "—";
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${day} ${month}`;
}
