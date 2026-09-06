import "server-only";
import { db } from "@/lib/db";
import {
  addUtcDays,
  computeAlerts,
  isInCountry,
  startOfUtcDay,
  type Alert,
} from "@/lib/domain";

/** Movement with the relations every list view needs. */
export type MovementWithRelations = Awaited<
  ReturnType<typeof getMovements>
>["movements"][number];

export type MovementFilters = {
  search?: string;
  status?: string;
  registeredById?: string;
  from?: Date | null;
  to?: Date | null;
  onlyAlerts?: boolean;
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 50;

/**
 * Lists movements with filtering and pagination.
 *
 * Date filtering matches a movement whose arrival *or* departure falls inside
 * the window — the desk thinks in terms of "what is happening this week", and a
 * long stay that spans the window still has to appear.
 */
export async function getMovements(filters: MovementFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, filters.pageSize ?? DEFAULT_PAGE_SIZE));

  const where: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [];

  if (filters.search?.trim()) {
    const term = filters.search.trim();
    const refNo = Number(term);
    and.push({
      OR: [
        { passenger: { fullName: { contains: term } } },
        { arrivalFlight: { contains: term } },
        { departureFlight: { contains: term } },
        { arrivalDestination: { contains: term } },
        { departureDestination: { contains: term } },
        { remarks: { contains: term } },
        { receivedFrom: { contains: term } },
        ...(Number.isInteger(refNo) ? [{ refNo }] : []),
      ],
    });
  }

  if (filters.status) and.push({ status: filters.status });
  if (filters.registeredById) and.push({ registeredById: filters.registeredById });

  if (filters.from || filters.to) {
    const range: Record<string, Date> = {};
    if (filters.from) range.gte = filters.from;
    if (filters.to) range.lte = filters.to;
    and.push({
      OR: [{ arrivalDate: range }, { departureDate: range }],
    });
  }

  if (and.length > 0) where.AND = and;

  const [movements, total] = await Promise.all([
    db.movement.findMany({
      where,
      include: {
        passenger: true,
        registeredBy: true,
        transportJobs: true,
        accommodations: { include: { hotel: true } },
      },
      orderBy: [{ arrivalDate: "desc" }, { refNo: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.movement.count({ where }),
  ]);

  return { movements, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
}

export async function getMovement(id: string) {
  return db.movement.findUnique({
    where: { id },
    include: {
      passenger: true,
      registeredBy: true,
      transportJobs: { orderBy: { scheduledAt: "asc" } },
      accommodations: { include: { hotel: true }, orderBy: { checkIn: "asc" } },
    },
  });
}

/**
 * Everything the dashboard shows, gathered in one place so the page component
 * stays declarative.
 */
export async function getDashboardData(now: Date = new Date()) {
  const today = startOfUtcDay(now);
  const weekAhead = addUtcDays(today, 7);

  const [active, arrivalsToday, departuresToday, upcoming, totals, recent] =
    await Promise.all([
      // Candidates for the in-country count: arrived, and either still open or
      // not yet departed. Narrowed in the database, finished by the domain rule.
      db.movement.findMany({
        where: {
          status: { not: "CANCELLED" },
          arrivalDate: { lte: today },
          OR: [{ departureDate: null }, { departureDate: { gte: today } }],
        },
        include: { passenger: true },
      }),
      db.movement.findMany({
        where: { status: { not: "CANCELLED" }, arrivalDate: today },
        include: { passenger: true, registeredBy: true },
        orderBy: { arrivalTime: "asc" },
      }),
      db.movement.findMany({
        where: { status: { not: "CANCELLED" }, departureDate: today },
        include: { passenger: true, registeredBy: true },
        orderBy: { departureTime: "asc" },
      }),
      db.movement.findMany({
        where: {
          status: { not: "CANCELLED" },
          arrivalDate: { gt: today, lte: weekAhead },
        },
        include: { passenger: true, registeredBy: true },
        orderBy: { arrivalDate: "asc" },
      }),
      db.movement.count(),
      db.movement.findMany({
        where: { status: { not: "CANCELLED" } },
        include: { passenger: true },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
    ]);

  const inCountry = active.filter((movement) => isInCountry(movement, now));

  // Alerts are computed over the operationally relevant window rather than the
  // whole history: a missing form on a 2023 record is not actionable.
  const alertCandidates = await db.movement.findMany({
    where: {
      status: { not: "CANCELLED" },
      OR: [
        { arrivalDate: { gte: addUtcDays(today, -30) } },
        { arrivalDate: null },
        { departureDate: null, arrivalDate: { not: null } },
      ],
    },
    include: { passenger: true },
    take: 500,
  });

  const flagged = alertCandidates
    .map((movement) => ({ movement, alerts: computeAlerts(movement, now) }))
    .filter((entry) => entry.alerts.length > 0)
    .sort((a, b) => severityRank(b.alerts) - severityRank(a.alerts));

  return {
    today,
    inCountry,
    arrivalsToday,
    departuresToday,
    upcoming,
    totalMovements: totals,
    recent,
    flagged,
  };
}

function severityRank(alerts: Alert[]): number {
  if (alerts.some((a) => a.severity === "high")) return 3;
  if (alerts.some((a) => a.severity === "medium")) return 2;
  return 1;
}

/** Everyone in country on the given date, ordered by how long they have been in. */
export async function getPersonsOnBoard(on: Date = new Date()) {
  const day = startOfUtcDay(on);

  const candidates = await db.movement.findMany({
    where: {
      status: { not: "CANCELLED" },
      arrivalDate: { lte: day },
      OR: [{ departureDate: null }, { departureDate: { gte: day } }],
    },
    include: { passenger: true, registeredBy: true, accommodations: { include: { hotel: true } } },
    orderBy: { arrivalDate: "asc" },
  });

  return candidates
    .filter((movement) => isInCountry(movement, on))
    .map((movement) => ({
      movement,
      daysInCountry: movement.arrivalDate
        ? Math.floor((day.getTime() - startOfUtcDay(movement.arrivalDate).getTime()) / 86_400_000)
        : 0,
      daysToDeparture: movement.departureDate
        ? Math.floor((startOfUtcDay(movement.departureDate).getTime() - day.getTime()) / 86_400_000)
        : null,
    }));
}

/** Arrivals and departures for one day — the printed driver manifest. */
export async function getManifest(on: Date) {
  const day = startOfUtcDay(on);

  const [arrivals, departures] = await Promise.all([
    db.movement.findMany({
      where: { status: { not: "CANCELLED" }, arrivalDate: day },
      include: {
        passenger: true,
        registeredBy: true,
        transportJobs: { where: { leg: "ARRIVAL" } },
      },
      orderBy: [{ arrivalTime: "asc" }],
    }),
    db.movement.findMany({
      where: { status: { not: "CANCELLED" }, departureDate: day },
      include: {
        passenger: true,
        registeredBy: true,
        transportJobs: { where: { leg: "DEPARTURE" } },
      },
      orderBy: [{ departureTime: "asc" }],
    }),
  ]);

  return { day, arrivals, departures };
}

export async function getReferenceData() {
  const [staff, sources, hotels] = await Promise.all([
    db.staffMember.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.requestSource.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.hotel.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return { staff, sources, hotels };
}
