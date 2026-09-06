/**
 * The movement record, ported from the `BLANK` shape in the original
 * single-file tracker. This is the canonical schema: every storage backend
 * (Claude artifact storage, SharePoint lists, a database) maps onto it rather
 * than defining its own.
 */

export const LOCATIONS = [
  "Erbil Apartment", "Home", "Divan Hotel", "Ramada Hotel", "EIH",
  "Arjan Rotana", "Rotana", "PSK", "TBC", "TWK", "RC", "FSK",
  "Duhok", "Zakho", "Field",
] as const;

export const ARRIVAL_DESTINATIONS = LOCATIONS.map((l) => `EIA to ${l}`);
export const DEPARTURE_DESTINATIONS = LOCATIONS.map((l) => `${l} to EIA`);

export const SERVICE_OPTIONS = ["FT", "Meet & Greet", "CIP"] as const;
export type Service = (typeof SERVICE_OPTIONS)[number] | "";

/** FT is the First Terminal service; spelled out wherever there is room. */
export const SERVICE_LABEL: Record<string, string> = {
  FT: "First Terminal",
  CIP: "CIP",
  "Meet & Greet": "Meet & Greet",
};

export const FLIGHT_STATUSES = [
  "On schedule", "Delayed", "Earlier", "Revised",
  "Changed", "Missed connection", "Cancelled",
] as const;
export type FlightStatus = (typeof FLIGHT_STATUSES)[number];

/**
 * A status says WHAT happened to the flight; this says WHO caused it, so a
 * flight the airline cancelled reads differently from one the office cancelled.
 */
export const CHANGE_SOURCES = ["Airline", "Travel agent", "Us", "Traveller"] as const;
export type ChangeSource = (typeof CHANGE_SOURCES)[number] | "";

export const RECEIVED_OPTIONS = ["KT", "TRF"] as const;
export const REG_OPTIONS = [
  "Mohammed", "Idrees", "Zana", "Omid", "Farhang", "Kamiran",
] as const;
export const DRIVER_TYPES = ["Team driver", "Normal driver"] as const;
export const EMPLOYEE_TYPES = ["Direct employee", "Contractor"] as const;
export const AIRPORTS = ["Erbil (EIA)", "Mardin", "Shirnak"] as const;
export type Airport = (typeof AIRPORTS)[number] | "";

export const airportShort = (a: string): string =>
  a === "Erbil (EIA)" ? "EIA" : a;

export const serviceLabel = (v: string): string => SERVICE_LABEL[v] ?? v;

/** "Divan Hotel to EIA" reads better as an arrow on the board. */
export const routeArrow = (d: string | null | undefined): string =>
  String(d ?? "").replace(/\s+to\s+/i, " → ");

/** Result of a live flight lookup, attached to the leg it was run against. */
export type FlightCheck = {
  at: string;
  status: string;
  scheduled?: string;
  actual?: string;
  deltaMinutes?: number;
  note?: string;
  source?: string;
  found?: boolean;
};

export type MovementRecord = {
  id: string;
  no: number | string;
  name: string;
  employeeType: string;

  // ---- Arrival leg ----
  arrDate: string;
  arrTime: string;
  arrAirport: string;
  arrDest: string;
  arrDriver: string;
  arrDriverType: string;
  arrDone: boolean;
  arrFlight: string;
  arrStatus: string;
  arrChangeBy: string;
  arrCheck: FlightCheck | null;
  arrReminded: string | null;

  // ---- Departure leg ----
  depDate: string;
  depTime: string;
  /** Manually set pickup time; blank means "use the calculated one". */
  depPickup: string;
  depAirport: string;
  depDest: string;
  depDriver: string;
  depDriverType: string;
  depDone: boolean;
  depFlight: string;
  depStatus: string;
  depChangeBy: string;
  depCheck: FlightCheck | null;
  depReminded: string | null;
  /** Set once the pickup time has been agreed with the passenger. */
  depPickupConfirmed: { at: string; by: string } | null;

  // ---- Request provenance ----
  emailDate: string;
  receivedFrom: string;
  service: string;
  regBy: string;
  remarks: string;
};

export const BLANK: Omit<MovementRecord, "id" | "no"> = {
  name: "", employeeType: "",
  arrDate: "", arrTime: "", arrAirport: "Erbil (EIA)", arrDest: "",
  arrDriver: "", arrDriverType: "", arrDone: false,
  depDate: "", depTime: "", depPickup: "", depAirport: "Erbil (EIA)", depDest: "",
  depDriver: "", depDriverType: "", depDone: false,
  arrFlight: "", arrStatus: "On schedule", arrChangeBy: "", arrCheck: null, arrReminded: null,
  depFlight: "", depStatus: "On schedule", depChangeBy: "", depCheck: null, depReminded: null,
  depPickupConfirmed: null,
  emailDate: "", receivedFrom: "",
  service: "", regBy: "", remarks: "",
};

export type RecordStatus = "today" | "open" | "upcoming" | "completed";

export const ROLES = ["Super admin", "Movcon", "Viewer"] as const;
export type Role = (typeof ROLES)[number];
