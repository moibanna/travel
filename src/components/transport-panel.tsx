"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  deleteTransportJob,
  saveTransportJob,
  type FormState,
} from "@/app/actions/movements";
import { Badge, Button, Card, Field, Input, Select, TableWrap, Td, Th } from "@/components/ui";
import { TRANSPORT_STATUSES } from "@/lib/constants";

export type TransportJobValues = {
  id: string;
  leg: string;
  scheduledAt: string;
  pickupLocation: string;
  dropoffLocation: string;
  driverName: string;
  vehicle: string;
  status: string;
  notes: string;
};

const STATUS_TONES = {
  PENDING: "warn",
  ASSIGNED: "info",
  COMPLETED: "ok",
  CANCELLED: "neutral",
} as const;

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Add transfer"}
    </Button>
  );
}

/**
 * Airport transfers for one movement. Transfers are what the spreadsheet could
 * never express: the desk tracked flights in Excel and drivers on paper.
 */
export function TransportPanel({
  movementId,
  jobs,
  canEdit,
}: {
  movementId: string;
  jobs: TransportJobValues[];
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    saveTransportJob,
    {},
  );
  const [showForm, setShowForm] = useState(false);

  return (
    <Card
      title="Airport transfers"
      actions={
        canEdit && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowForm((open) => !open)}
          >
            {showForm ? "Close" : "Add transfer"}
          </Button>
        )
      }
      bodyClassName="p-0"
    >
      {jobs.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-soft">
          No transfers arranged for this movement yet.
        </p>
      ) : (
        <TableWrap>
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <Th>Leg</Th>
                <Th>When</Th>
                <Th>Pick up</Th>
                <Th>Drop off</Th>
                <Th>Driver</Th>
                <Th>Vehicle</Th>
                <Th>Status</Th>
                {canEdit && <Th />}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <Td className="whitespace-nowrap capitalize">
                    {job.leg.toLowerCase()}
                  </Td>
                  <Td className="numeric whitespace-nowrap">
                    {job.scheduledAt ? job.scheduledAt.replace("T", " ") : "—"}
                  </Td>
                  <Td>{job.pickupLocation || "—"}</Td>
                  <Td>{job.dropoffLocation || "—"}</Td>
                  <Td>{job.driverName || "—"}</Td>
                  <Td>{job.vehicle || "—"}</Td>
                  <Td>
                    <Badge
                      tone={
                        STATUS_TONES[job.status as keyof typeof STATUS_TONES] ??
                        "neutral"
                      }
                    >
                      {job.status.toLowerCase()}
                    </Badge>
                  </Td>
                  {canEdit && (
                    <Td>
                      <form
                        action={async () => {
                          await deleteTransportJob(job.id, movementId);
                        }}
                      >
                        <button
                          type="submit"
                          className="text-xs font-medium text-ink-soft hover:text-danger"
                        >
                          Remove
                        </button>
                      </form>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {canEdit && showForm && (
        <form action={formAction} className="border-t border-line bg-canvas p-4">
          <input type="hidden" name="movementId" value={movementId} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Leg">
              <Select name="leg" defaultValue="ARRIVAL">
                <option value="ARRIVAL">Arrival</option>
                <option value="DEPARTURE">Departure</option>
              </Select>
            </Field>
            <Field label="Scheduled">
              <Input type="datetime-local" name="scheduledAt" />
            </Field>
            <Field label="Pick up">
              <Input name="pickupLocation" placeholder="EIA arrivals" />
            </Field>
            <Field label="Drop off">
              <Input name="dropoffLocation" placeholder="Ramada" />
            </Field>
            <Field label="Driver">
              <Input name="driverName" />
            </Field>
            <Field label="Vehicle">
              <Input name="vehicle" placeholder="Land Cruiser · ERB 1234" />
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue="PENDING">
                {TRANSPORT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notes">
              <Input name="notes" />
            </Field>
          </div>
          {state.message && (
            <p className="mt-3 text-sm text-ok" role="status">
              {state.message}
            </p>
          )}
          <div className="mt-3">
            <SaveButton />
          </div>
        </form>
      )}
    </Card>
  );
}
