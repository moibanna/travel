import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/queries";
import { computeAlerts, formatDate, formatDateShort } from "@/lib/domain";
import { Card, EmptyState, StatTile, Td, TableWrap, Th } from "@/components/ui";
import { AlertDots, PassengerLink, StatusBadge } from "@/components/movement-bits";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();
  const data = await getDashboardData(now);

  const highPriority = data.flagged.filter((entry) =>
    entry.alerts.some((alert) => alert.severity === "high"),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-ink">
          Good day, {user.name.split(" ")[0]}
        </h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          Operational picture for {formatDate(data.today)}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Persons on board"
          value={data.inCountry.length}
          hint="Currently in country"
          tone="brand"
        />
        <StatTile
          label="Arrivals today"
          value={data.arrivalsToday.length}
          hint={`${data.upcoming.length} more in the next 7 days`}
          tone="ok"
        />
        <StatTile
          label="Departures today"
          value={data.departuresToday.length}
          hint="Transfers to the airport"
          tone="info"
        />
        <StatTile
          label="Needs attention"
          value={data.flagged.length}
          hint={
            highPriority.length > 0
              ? `${highPriority.length} urgent`
              : "No urgent items"
          }
          tone={highPriority.length > 0 ? "danger" : "neutral"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <MovementPanel
          title="Arrivals today"
          movements={data.arrivalsToday}
          leg="ARRIVAL"
          emptyText="No arrivals scheduled for today."
        />
        <MovementPanel
          title="Departures today"
          movements={data.departuresToday}
          leg="DEPARTURE"
          emptyText="No departures scheduled for today."
        />
      </div>

      <Card
        title="Needs attention"
        actions={
          <Link
            href="/movements?alerts=1"
            className="text-xs font-medium text-accent hover:underline"
          >
            View all
          </Link>
        }
        bodyClassName="p-0"
      >
        {data.flagged.length === 0 ? (
          <EmptyState
            title="Everything is up to date"
            description="No missing travel request forms, unconfirmed destinations or stale statuses."
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[720px]">
              <thead>
                <tr>
                  <Th>Passenger</Th>
                  <Th>Arrival</Th>
                  <Th>Status</Th>
                  <Th>Issues</Th>
                </tr>
              </thead>
              <tbody>
                {data.flagged.slice(0, 10).map(({ movement, alerts }) => (
                  <tr key={movement.id} className="hover:bg-canvas">
                    <Td>
                      <PassengerLink
                        id={movement.id}
                        name={movement.passenger.fullName}
                        refNo={movement.refNo}
                      />
                    </Td>
                    <Td className="numeric whitespace-nowrap">
                      {formatDateShort(movement.arrivalDate)}
                    </Td>
                    <Td>
                      <StatusBadge status={movement.status} />
                    </Td>
                    <Td>
                      <ul className="space-y-0.5">
                        {alerts.map((alert) => (
                          <li
                            key={alert.code}
                            className={
                              alert.severity === "high"
                                ? "text-sm text-danger"
                                : "text-sm text-ink-soft"
                            }
                          >
                            {alert.message}
                          </li>
                        ))}
                      </ul>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Card title="Next 7 days" bodyClassName="p-0">
        {data.upcoming.length === 0 ? (
          <EmptyState title="No arrivals in the next 7 days." />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[720px]">
              <thead>
                <tr>
                  <Th>Passenger</Th>
                  <Th>Arrives</Th>
                  <Th>Time</Th>
                  <Th>Flight</Th>
                  <Th>Destination</Th>
                  <Th>Registered by</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {data.upcoming.map((movement) => (
                  <tr key={movement.id} className="hover:bg-canvas">
                    <Td>
                      <PassengerLink
                        id={movement.id}
                        name={movement.passenger.fullName}
                        refNo={movement.refNo}
                      />
                    </Td>
                    <Td className="numeric whitespace-nowrap">
                      {formatDateShort(movement.arrivalDate)}
                    </Td>
                    <Td className="numeric">{movement.arrivalTime ?? "—"}</Td>
                    <Td className="numeric">{movement.arrivalFlight ?? "—"}</Td>
                    <Td>{movement.arrivalDestination ?? "—"}</Td>
                    <Td>{movement.registeredBy?.name ?? "—"}</Td>
                    <Td>
                      <AlertDots alerts={computeAlerts(movement, now)} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

type PanelMovement = {
  id: string;
  refNo: number;
  passenger: { fullName: string };
  arrivalTime: string | null;
  arrivalFlight: string | null;
  arrivalDestination: string | null;
  departureTime: string | null;
  departureFlight: string | null;
  departureDestination: string | null;
  status: string;
};

function MovementPanel({
  title,
  movements,
  leg,
  emptyText,
}: {
  title: string;
  movements: PanelMovement[];
  leg: "ARRIVAL" | "DEPARTURE";
  emptyText: string;
}) {
  return (
    <Card title={title} bodyClassName="p-0">
      {movements.length === 0 ? (
        <EmptyState title={emptyText} />
      ) : (
        <TableWrap>
          <table className="w-full min-w-[520px]">
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Passenger</Th>
                <Th>Flight</Th>
                <Th>{leg === "ARRIVAL" ? "To" : "From"}</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id} className="hover:bg-canvas">
                  <Td className="numeric font-medium whitespace-nowrap">
                    {(leg === "ARRIVAL"
                      ? movement.arrivalTime
                      : movement.departureTime) ?? "TBC"}
                  </Td>
                  <Td>
                    <PassengerLink
                      id={movement.id}
                      name={movement.passenger.fullName}
                      refNo={movement.refNo}
                    />
                  </Td>
                  <Td className="numeric">
                    {(leg === "ARRIVAL"
                      ? movement.arrivalFlight
                      : movement.departureFlight) ?? "—"}
                  </Td>
                  <Td>
                    {(leg === "ARRIVAL"
                      ? movement.arrivalDestination
                      : movement.departureDestination) ?? "—"}
                  </Td>
                  <Td>
                    <StatusBadge status={movement.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}
