"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { MOVEMENT_STATUSES, MOVEMENT_STATUS_LABELS } from "@/lib/constants";
import type { FormState } from "@/app/actions/movements";

export type MovementFormValues = {
  refNo: string;
  passengerName: string;
  company: string;
  arrivalDate: string;
  arrivalTime: string;
  arrivalFlight: string;
  arrivalDestination: string;
  departureDate: string;
  departureTime: string;
  departureFlight: string;
  departureDestination: string;
  requestEmailDate: string;
  receivedFrom: string;
  registeredById: string;
  remarks: string;
  status: string;
  trfReceived: boolean;
  cipRequested: boolean;
};

export const EMPTY_MOVEMENT: MovementFormValues = {
  refNo: "",
  passengerName: "",
  company: "",
  arrivalDate: "",
  arrivalTime: "",
  arrivalFlight: "",
  arrivalDestination: "",
  departureDate: "",
  departureTime: "",
  departureFlight: "",
  departureDestination: "",
  requestEmailDate: "",
  receivedFrom: "",
  registeredById: "",
  remarks: "",
  status: "PLANNED",
  trfReceived: true,
  cipRequested: false,
};

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function MovementForm({
  action,
  defaults,
  staff,
  sources,
  submitLabel = "Save movement",
  cancelHref = "/movements",
  readOnly = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults: MovementFormValues;
  staff: { id: string; name: string }[];
  sources: { id: string; name: string }[];
  submitLabel?: string;
  cancelHref?: string;
  readOnly?: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const error = (field: string) => state.errors?.[field];

  return (
    <form action={formAction} className="space-y-4">
      {state.message && (
        <p className="rounded-md bg-ok-soft px-3 py-2 text-sm text-ok" role="status">
          {state.message}
        </p>
      )}

      <Card title="Passenger and request">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Passenger name" error={error("passengerName")}>
            <Input
              name="passengerName"
              defaultValue={defaults.passengerName}
              required
              disabled={readOnly}
            />
          </Field>
          <Field label="Company" error={error("company")}>
            <Input name="company" defaultValue={defaults.company} disabled={readOnly} />
          </Field>
          <Field
            label="Reference no."
            hint="Leave blank to continue the sequence"
            error={error("refNo")}
          >
            <Input
              name="refNo"
              inputMode="numeric"
              defaultValue={defaults.refNo}
              disabled={readOnly}
            />
          </Field>
          <Field label="Status" error={error("status")}>
            <Select name="status" defaultValue={defaults.status} disabled={readOnly}>
              {MOVEMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {MOVEMENT_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Request received" error={error("requestEmailDate")}>
            <Input
              type="date"
              name="requestEmailDate"
              defaultValue={defaults.requestEmailDate}
              disabled={readOnly}
            />
          </Field>
          <Field label="Received from" error={error("receivedFrom")}>
            <Input
              name="receivedFrom"
              list="request-sources"
              defaultValue={defaults.receivedFrom}
              disabled={readOnly}
            />
            <datalist id="request-sources">
              {sources.map((source) => (
                <option key={source.id} value={source.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Registered by" error={error("registeredById")}>
            <Select
              name="registeredById"
              defaultValue={defaults.registeredById}
              disabled={readOnly}
            >
              <option value="">Unassigned</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col justify-end gap-2 pb-1">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="trfReceived"
                defaultChecked={defaults.trfReceived}
                disabled={readOnly}
                className="h-4 w-4 rounded border-line"
              />
              Travel request form received
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="cipRequested"
                defaultChecked={defaults.cipRequested}
                disabled={readOnly}
                className="h-4 w-4 rounded border-line"
              />
              CIP meet and greet
            </label>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Arrival">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" error={error("arrivalDate")}>
              <Input
                type="date"
                name="arrivalDate"
                defaultValue={defaults.arrivalDate}
                disabled={readOnly}
              />
            </Field>
            <Field label="Time" hint="Leave blank if TBC" error={error("arrivalTime")}>
              <Input
                type="time"
                name="arrivalTime"
                defaultValue={defaults.arrivalTime}
                disabled={readOnly}
              />
            </Field>
            <Field label="Flight" error={error("arrivalFlight")}>
              <Input
                name="arrivalFlight"
                placeholder="TK 316"
                defaultValue={defaults.arrivalFlight}
                disabled={readOnly}
              />
            </Field>
            <Field
              label="Destination"
              hint="Where the passenger goes on landing"
              error={error("arrivalDestination")}
            >
              <Input
                name="arrivalDestination"
                placeholder="EIA to Ramada"
                defaultValue={defaults.arrivalDestination}
                disabled={readOnly}
              />
            </Field>
          </div>
        </Card>

        <Card title="Departure">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" error={error("departureDate")}>
              <Input
                type="date"
                name="departureDate"
                defaultValue={defaults.departureDate}
                disabled={readOnly}
              />
            </Field>
            <Field label="Time" hint="Leave blank if TBC" error={error("departureTime")}>
              <Input
                type="time"
                name="departureTime"
                defaultValue={defaults.departureTime}
                disabled={readOnly}
              />
            </Field>
            <Field label="Flight" error={error("departureFlight")}>
              <Input
                name="departureFlight"
                placeholder="TK 315"
                defaultValue={defaults.departureFlight}
                disabled={readOnly}
              />
            </Field>
            <Field label="Destination" error={error("departureDestination")}>
              <Input
                name="departureDestination"
                placeholder="Ramada to EIA"
                defaultValue={defaults.departureDestination}
                disabled={readOnly}
              />
            </Field>
          </div>
        </Card>
      </div>

      <Card title="Remarks">
        <Field label="Notes" error={error("remarks")}>
          <Textarea
            name="remarks"
            rows={3}
            defaultValue={defaults.remarks}
            disabled={readOnly}
          />
        </Field>
      </Card>

      {!readOnly && (
        <div className="flex items-center gap-2">
          <SaveButton label={submitLabel} />
          <Link
            href={cancelHref}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-canvas"
          >
            Cancel
          </Link>
        </div>
      )}
    </form>
  );
}
