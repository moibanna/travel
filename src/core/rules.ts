/**
 * Departure pickup times, arrival meet times, the daily movement board and
 * driver reminders.
 *
 * A driver has to collect someone well before the flight leaves:
 *
 *   pickup = flight time − (check-in at the airport
 *                           + drive from where they are staying
 *                           + buffer
 *                           − time saved by FT/CIP)
 *
 * Every number is editable by an administrator under "Pickup rules", so the
 * defaults below are a starting point rather than a fixed policy.
 */

import type { MovementRecord, RecordStatus } from "./types";
import { shiftDate, toHHMM, toMin } from "./time";

export type PickupRules = {
  /** Minutes before landing that the driver should be at the airport. */
  arrLead: number;
  /**
   * Minutes before the flight that the passenger must be at the airport.
   * Two hours at Erbil; Mardin and Shirnak also swallow the road journey and
   * the border crossing, which is why they are so much larger.
   */
  checkIn: Record<string, number>;
  /** Minutes to drive to the airport from where the passenger is staying. */
  drive: Record<string, number>;
  driveDefault: number;
  /**
   * How the service changes the time needed once inside the airport. CIP is
   * the quickest route to the aircraft, so it saves the most. First Terminal
   * still has to cross to the main terminal, so it saves less. Meet & Greet
   * takes a bus to First Terminal and on to the aircraft, so it costs time —
   * a positive number here means "start earlier".
   */
  service: Record<string, number>;
  buffer: number;
  minLead: number;
  /** How long before the driver is due the app raises a reminder. */
  alertLead: number;
  /** Records whose last movement is older than this drop off the main screen. */
  archiveMonths: number;
};

export const DEFAULT_RULES: PickupRules = {
  arrLead: 15,
  checkIn: { "Erbil (EIA)": 120, Mardin: 420, Shirnak: 450 },
  drive: {
    "Erbil Apartment": 30, Home: 40, "Divan Hotel": 25, "Ramada Hotel": 25, EIH: 25,
    "Arjan Rotana": 25, Rotana: 25, PSK: 60, TBC: 30, TWK: 60, RC: 45, FSK: 60,
    Duhok: 150, Zakho: 195, Field: 90,
  },
  driveDefault: 30,
  service: { CIP: -60, FT: -30, "Meet & Greet": 15 },
  buffer: 15,
  minLead: 45,
  alertLead: 15,
  archiveMonths: 6,
};

/** "Divan Hotel to EIA" -> "Divan Hotel" */
export const originOf = (dest: string | null | undefined): string =>
  String(dest ?? "").split(/\s+to\s+/i)[0].trim();

export type PickupSuggestion = {
  time: string;
  /** -1 when the pickup falls on the night before the flight. */
  dayOffset: number;
  lead: number;
  checkIn: number;
  drive: number;
  svc: number;
  origin: string;
};

/** What the rules say the departure pickup should be. */
export function suggestPickup(
  r: Pick<MovementRecord, "depTime" | "depDate" | "depAirport" | "depDest" | "service">,
  rules: PickupRules,
): PickupSuggestion | null {
  const dep = toMin(r.depTime);
  if (dep === null || !r.depDate) return null;

  const checkIn = rules.checkIn[r.depAirport] ?? rules.checkIn["Erbil (EIA)"];
  const drive = rules.drive[originOf(r.depDest)] ?? rules.driveDefault;
  const svc = rules.service[r.service] || 0;
  const lead = Math.max(rules.minLead, checkIn + drive + svc + rules.buffer);
  const raw = dep - lead;

  return {
    time: toHHMM(raw),
    dayOffset: raw < 0 ? -1 : 0,
    lead,
    checkIn,
    drive,
    svc,
    origin: originOf(r.depDest) || "the hotel",
  };
}

/** Arrivals: the driver must be standing at the airport before the plane lands. */
export function meetFor(
  r: Pick<MovementRecord, "arrTime" | "arrDate">,
  rules: PickupRules,
): { time: string; dayOffset: number; lead: number } | null {
  const arr = toMin(r.arrTime);
  if (arr === null || !r.arrDate) return null;
  const lead = rules.arrLead ?? DEFAULT_RULES.arrLead;
  const raw = arr - lead;
  return { time: toHHMM(raw), dayOffset: raw < 0 ? -1 : 0, lead };
}

export type Pickup = {
  time: string;
  dayOffset: number;
  date: string;
  manual: boolean;
  confirmed: boolean;
  lead?: number;
  checkIn?: number;
  drive?: number;
  svc?: number;
  origin?: string;
};

/**
 * The pickup actually in force: a manual time if someone set one, otherwise the
 * suggestion. A pickup later on the clock than the flight must belong to the
 * night before.
 */
export function pickupFor(r: MovementRecord, rules: PickupRules): Pickup | null {
  const dep = toMin(r.depTime);
  if (dep === null || !r.depDate) return null;

  const confirmed = !!r.depPickupConfirmed;
  const manual = toMin(r.depPickup);

  if (manual !== null) {
    const offset = manual > dep ? -1 : 0;
    return {
      time: toHHMM(manual),
      dayOffset: offset,
      date: shiftDate(r.depDate, offset),
      manual: true,
      confirmed,
    };
  }

  const s = suggestPickup(r, rules);
  if (!s) return null;
  return { ...s, date: shiftDate(r.depDate, s.dayOffset), manual: false, confirmed };
}

/** Where a record sits in its lifecycle, derived from dates and the done flags. */
export function statusOf(r: MovementRecord, today: string): RecordStatus {
  const dates = [r.arrDate, r.depDate].filter(Boolean);
  const isToday = dates.some((d) => d === today);
  const allDone = dates.length > 0 && (!r.arrDate || r.arrDone) && (!r.depDate || r.depDone);
  const open = (!r.arrFlight && !r.depFlight) || (!r.arrDate && !r.depDate);
  const hasFuture = dates.some((d) => d > today);

  if (allDone) return "completed";
  if (isToday) return "today";
  if (open && (hasFuture || dates.length === 0)) return "open";
  if (hasFuture) return "upcoming";
  if (dates.length && dates.every((d) => d < today)) return "completed";
  return "open";
}

export type Movement = {
  kind: "ARR" | "DEP";
  id: string;
  name: string;
  time: string;
  sort: string;
  flight: string;
  airport: string;
  dest: string;
  fStatus: string;
  fBy: string;
  service: string;
  driver: string;
  driverType: string;
  done: boolean;
  meet?: string;
  pickup?: string;
  pickupConfirmed?: boolean;
  /** Collected tonight for a flight that leaves tomorrow. */
  flightTomorrow?: boolean;
  /** Flying today, but collected the night before. */
  pickupWasYesterday?: boolean;
};

/**
 * Today's individual movements. One person can appear twice — an arrival and a
 * departure are separate jobs for separate drivers.
 */
export function movementsToday(
  records: MovementRecord[],
  today: string,
  rules: PickupRules,
): Movement[] {
  const list: Movement[] = [];

  records.forEach((r) => {
    if (r.arrDate === today) {
      const meet = meetFor(r, rules);
      const meetTime = meet && !meet.dayOffset ? meet.time : "";
      list.push({
        kind: "ARR",
        time: r.arrTime || "—",
        meet: meetTime,
        sort: meetTime || r.arrTime || "99:99",
        name: r.name, flight: r.arrFlight, airport: r.arrAirport, dest: r.arrDest,
        fStatus: r.arrStatus, fBy: r.arrChangeBy, service: r.service,
        driver: r.arrDriver, driverType: r.arrDriverType, done: r.arrDone, id: r.id,
      });
    }

    const p = pickupFor(r, rules);
    const pickupToday = !!p && p.date === today;

    if (r.depDate === today || pickupToday) {
      list.push({
        kind: "DEP",
        time: r.depTime || "—",
        pickup: p ? p.time : "",
        pickupConfirmed: !!(p && p.confirmed),
        // The driver leaves at the pickup time, so that is what the board sorts
        // on. Once someone has been collected the night before, the flight time
        // is what still matters on the day itself.
        sort: p && pickupToday ? p.time : r.depTime || "99:99",
        flightTomorrow: pickupToday && r.depDate !== today,
        pickupWasYesterday: r.depDate === today && !!p && p.date !== today,
        name: r.name, flight: r.depFlight, airport: r.depAirport, dest: r.depDest,
        fStatus: r.depStatus, fBy: r.depChangeBy, service: r.service,
        driver: r.depDriver, driverType: r.depDriverType, done: r.depDone, id: r.id,
      });
    }
  });

  return list.sort((a, b) => (a.sort > b.sort ? 1 : -1));
}

export type DueAlert = {
  record: MovementRecord;
  kind: "ARR" | "DEP";
  at: string;
  flight: string;
  driver: string;
  confirmed?: boolean;
  left: number;
};

/**
 * Reminders that are due now.
 *
 * The moment that matters is when the DRIVER has to move, not when the plane
 * does. A reminder fires within `alertLead` minutes of that, and stays up for
 * an hour afterwards so one that is missed does not simply vanish.
 */
export function dueAlerts(
  records: MovementRecord[],
  today: string,
  rules: PickupRules,
  now: number,
): DueAlert[] {
  const lead = rules.alertLead ?? 15;
  const out: Omit<DueAlert, "left">[] = [];

  records.forEach((r) => {
    if (r.arrDate === today && !r.arrDone && !r.arrReminded) {
      const mt = meetFor(r, rules);
      if (mt && !mt.dayOffset) {
        out.push({ record: r, kind: "ARR", at: mt.time, flight: r.arrTime, driver: r.arrDriver });
      }
    }

    const p = pickupFor(r, rules);
    if (p && p.date === today && !r.depDone && !r.depReminded) {
      out.push({
        record: r, kind: "DEP", at: p.time, flight: r.depTime,
        driver: r.depDriver, confirmed: p.confirmed,
      });
    }
  });

  return out
    .map((a) => ({ ...a, left: (toMin(a.at) ?? 0) - now }))
    .filter((a) => a.left <= lead && a.left > -60)
    .sort((a, b) => a.left - b.left);
}
