import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getMovement, getReferenceData } from "@/lib/queries";
import { db } from "@/lib/db";
import { computeAlerts, formatDate } from "@/lib/domain";
import { roleAtLeast } from "@/lib/constants";
import { updateMovement, type FormState } from "@/app/actions/movements";
import { MovementForm } from "@/components/movement-form";
import { AlertList, StatusBadge } from "@/components/movement-bits";
import { Badge, Card, TableWrap, Td, Th } from "@/components/ui";
import { TransportPanel } from "@/components/transport-panel";
import { DeleteMovementButton } from "@/components/delete-movement";

export const dynamic = "force-dynamic";

function toDateInput(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function MovementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const movement = await getMovement(id);
  if (!movement) notFound();

  const [{ staff, sources }, history] = await Promise.all([
    getReferenceData(),
    db.auditLog.findMany({
      where: { entity: "Movement", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const canEdit = roleAtLeast(user.role, "COORDINATOR");
  const canDelete = roleAtLeast(user.role, "ADMIN");
  const alerts = computeAlerts(movement, new Date());

  // Bind the movement id so the form's action keeps the (state, formData)
  // signature that useActionState expects.
  async function save(state: FormState, formData: FormData) {
    "use server";
    return updateMovement(id, state, formData);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/movements" className="text-sm text-accent hover:underline">
            ← Movements
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold text-ink">
            {movement.passenger.fullName}
            <span className="numeric text-base font-normal text-ink-soft">
              #{movement.refNo}
            </span>
            <StatusBadge status={movement.status} />
            {movement.cipRequested && <Badge tone="info">CIP</Badge>}
            {!movement.trfReceived && <Badge tone="warn">No TRF</Badge>}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Last updated {formatDate(movement.updatedAt)}
            {movement.registeredBy && ` · registered by ${movement.registeredBy.name}`}
          </p>
        </div>
        {canDelete && <DeleteMovementButton movementId={movement.id} />}
      </header>

      {alerts.length > 0 && (
        <Card title="Needs attention">
          <AlertList alerts={alerts} />
        </Card>
      )}

      <MovementForm
        action={save}
        defaults={{
          refNo: String(movement.refNo),
          passengerName: movement.passenger.fullName,
          company: movement.passenger.company ?? "",
          arrivalDate: toDateInput(movement.arrivalDate),
          arrivalTime: movement.arrivalTime ?? "",
          arrivalFlight: movement.arrivalFlight ?? "",
          arrivalDestination: movement.arrivalDestination ?? "",
          departureDate: toDateInput(movement.departureDate),
          departureTime: movement.departureTime ?? "",
          departureFlight: movement.departureFlight ?? "",
          departureDestination: movement.departureDestination ?? "",
          requestEmailDate: toDateInput(movement.requestEmailDate),
          receivedFrom: movement.receivedFrom ?? "",
          registeredById: movement.registeredById ?? "",
          remarks: movement.remarks ?? "",
          status: movement.status,
          trfReceived: movement.trfReceived,
          cipRequested: movement.cipRequested,
        }}
        staff={staff}
        sources={sources}
        submitLabel="Save changes"
        cancelHref="/movements"
        readOnly={!canEdit}
      />

      <TransportPanel
        movementId={movement.id}
        jobs={movement.transportJobs.map((job) => ({
          id: job.id,
          leg: job.leg,
          scheduledAt: job.scheduledAt ? job.scheduledAt.toISOString().slice(0, 16) : "",
          pickupLocation: job.pickupLocation ?? "",
          dropoffLocation: job.dropoffLocation ?? "",
          driverName: job.driverName ?? "",
          vehicle: job.vehicle ?? "",
          status: job.status,
          notes: job.notes ?? "",
        }))}
        canEdit={canEdit}
      />

      <Card title="Change history" bodyClassName="p-0">
        {history.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-soft">
            No changes recorded yet.
          </p>
        ) : (
          <TableWrap>
            <table className="w-full min-w-[560px]">
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Who</Th>
                  <Th>Change</Th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id}>
                    <Td className="numeric whitespace-nowrap text-ink-soft">
                      {formatDate(entry.createdAt)}
                    </Td>
                    <Td className="whitespace-nowrap">{entry.userEmail ?? "system"}</Td>
                    <Td>{entry.summary}</Td>
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
