/**
 * Domain vocabulary. Modelled as string unions rather than database enums so the
 * same schema runs unchanged on SQLite (which has no enum type) and Postgres.
 */

export const ROLES = ["ADMIN", "COORDINATOR", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  COORDINATOR: "Travel coordinator",
  VIEWER: "Viewer",
};

/** Rank used for permission checks: a higher rank implies every lower right. */
const ROLE_RANK: Record<Role, number> = { VIEWER: 0, COORDINATOR: 1, ADMIN: 2 };

export function roleAtLeast(role: string, minimum: Role): boolean {
  const rank = ROLE_RANK[role as Role];
  return rank !== undefined && rank >= ROLE_RANK[minimum];
}

export const MOVEMENT_STATUSES = [
  "PLANNED",
  "CONFIRMED",
  "ARRIVED",
  "DEPARTED",
  "CANCELLED",
] as const;
export type MovementStatus = (typeof MOVEMENT_STATUSES)[number];

export const MOVEMENT_STATUS_LABELS: Record<MovementStatus, string> = {
  PLANNED: "Planned",
  CONFIRMED: "Confirmed",
  ARRIVED: "In country",
  DEPARTED: "Departed",
  CANCELLED: "Cancelled",
};

export const TRANSPORT_STATUSES = [
  "PENDING",
  "ASSIGNED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type TransportStatus = (typeof TRANSPORT_STATUSES)[number];

export const BOOKING_STATUSES = ["PENDING", "CONFIRMED", "CANCELLED"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const LEGS = ["ARRIVAL", "DEPARTURE"] as const;
export type Leg = (typeof LEGS)[number];

/** Session cookie name. */
export const SESSION_COOKIE = "travel_session";
