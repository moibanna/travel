import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getMovements, getReferenceData } from "@/lib/queries";
import { computeAlerts, formatDateShort } from "@/lib/domain";
import { MOVEMENT_STATUSES, MOVEMENT_STATUS_LABELS, roleAtLeast } from "@/lib/constants";
import { Card, EmptyState, TableWrap, Td, Th } from "@/components/ui";
import { AlertDots, PassengerLink, StatusBadge } from "@/components/movement-bits";
import { MovementFilters } from "@/components/movement-filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Movements" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function toDate(value: string): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
}

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const search = first(params.q);
  const status = first(params.status);
  const registeredById = first(params.staff);
  const from = toDate(first(params.from));
  const to = toDate(first(params.to));
  const onlyAlerts = first(params.alerts) === "1";
  const page = Math.max(1, Number(first(params.page)) || 1);

  const [{ movements, total, pageCount }, reference] = await Promise.all([
    getMovements({ search, status, registeredById, from, to, page }),
    getReferenceData(),
  ]);

  const now = new Date();
  const rows = movements
    .map((movement) => ({ movement, alerts: computeAlerts(movement, now) }))
    .filter((row) => !onlyAlerts || row.alerts.length > 0);

  const canEdit = roleAtLeast(user.role, "COORDINATOR");
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ q: search, status, staff: registeredById, from: first(params.from), to: first(params.to), alerts: onlyAlerts ? "1" : "" })) {
    if (value) query.set(key, value);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Movements</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            {total.toLocaleString()} record{total === 1 ? "" : "s"}
            {onlyAlerts && " · showing only records needing attention"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/export?${query.toString()}`}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-canvas"
          >
            Export to Excel
          </a>
          {canEdit && (
            <Link
              href="/movements/new"
              className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-[#0c4228]"
            >
              New movement
            </Link>
          )}
        </div>
      </header>

      <MovementFilters
        staff={reference.staff}
        statuses={MOVEMENT_STATUSES.map((value) => ({
          value,
          label: MOVEMENT_STATUS_LABELS[value],
        }))}
      />

      <Card bodyClassName="p-0">
        {rows.length === 0 ? (
          <EmptyState
            title="No movements match these filters"
            description="Adjust the search or clear the filters to see more records."
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr>
                  <Th>Ref</Th>
                  <Th>Passenger</Th>
                  <Th>Arrival</Th>
                  <Th>Flight</Th>
                  <Th>To</Th>
                  <Th>Departure</Th>
                  <Th>Flight</Th>
                  <Th>From</Th>
                  <Th>Reg by</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ movement, alerts }) => (
                  <tr key={movement.id} className="hover:bg-canvas">
                    <Td className="numeric text-ink-soft">{movement.refNo}</Td>
                    <Td>
                      <PassengerLink
                        id={movement.id}
                        name={movement.passenger.fullName}
                        refNo={movement.refNo}
                      />
                    </Td>
                    <Td className="numeric whitespace-nowrap">
                      {formatDateShort(movement.arrivalDate)}
                      {movement.arrivalTime && (
                        <span className="ml-1 text-ink-soft">{movement.arrivalTime}</span>
                      )}
                    </Td>
                    <Td className="numeric">{movement.arrivalFlight ?? "—"}</Td>
                    <Td className="max-w-[180px] truncate">
                      {movement.arrivalDestination ?? "—"}
                    </Td>
                    <Td className="numeric whitespace-nowrap">
                      {formatDateShort(movement.departureDate)}
                      {movement.departureTime && (
                        <span className="ml-1 text-ink-soft">
                          {movement.departureTime}
                        </span>
                      )}
                    </Td>
                    <Td className="numeric">{movement.departureFlight ?? "—"}</Td>
                    <Td className="max-w-[180px] truncate">
                      {movement.departureDestination ?? "—"}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {movement.registeredBy?.name ?? "—"}
                    </Td>
                    <Td>
                      <StatusBadge status={movement.status} />
                    </Td>
                    <Td>
                      <AlertDots alerts={alerts} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      {pageCount > 1 && (
        <nav className="flex items-center justify-between text-sm">
          <PageLink query={query} page={page - 1} disabled={page <= 1}>
            ← Previous
          </PageLink>
          <span className="text-ink-soft">
            Page {page} of {pageCount}
          </span>
          <PageLink query={query} page={page + 1} disabled={page >= pageCount}>
            Next →
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function PageLink({
  query,
  page,
  disabled,
  children,
}: {
  query: URLSearchParams;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-ink-soft opacity-50">{children}</span>;
  }
  const next = new URLSearchParams(query);
  next.set("page", String(page));
  return (
    <Link
      href={`/movements?${next.toString()}`}
      className="font-medium text-accent hover:underline"
    >
      {children}
    </Link>
  );
}
