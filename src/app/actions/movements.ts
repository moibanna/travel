"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth";
import { diffFields, recordAudit } from "@/lib/audit";
import { normaliseName, tidyName } from "@/lib/parsing";
import { fieldErrors, movementSchema, transportSchema } from "@/lib/validation";

export type FormState = {
  errors?: Record<string, string>;
  message?: string;
};

/** Fields whose changes are worth recording in the audit trail. */
const AUDITED_FIELDS = [
  "refNo",
  "arrivalDate",
  "arrivalTime",
  "arrivalFlight",
  "arrivalDestination",
  "departureDate",
  "departureTime",
  "departureFlight",
  "departureDestination",
  "requestEmailDate",
  "receivedFrom",
  "registeredById",
  "remarks",
  "status",
  "trfReceived",
  "cipRequested",
] as const;

/**
 * Finds an existing passenger by normalised name, or creates one. Travellers
 * rotate in and out repeatedly, so matching on the name keeps one history per
 * person instead of a new record per trip.
 */
async function findOrCreatePassenger(name: string, company: string | null) {
  const normalizedName = normaliseName(name);
  const existing = await db.passenger.findUnique({ where: { normalizedName } });
  if (existing) {
    if (company && !existing.company) {
      return db.passenger.update({
        where: { id: existing.id },
        data: { company },
      });
    }
    return existing;
  }
  return db.passenger.create({
    data: { fullName: tidyName(name), normalizedName, company },
  });
}

/** Next reference number, continuing the spreadsheet's sequence. */
async function nextRefNo(): Promise<number> {
  const highest = await db.movement.findFirst({
    orderBy: { refNo: "desc" },
    select: { refNo: true },
  });
  return (highest?.refNo ?? 9000) + 1;
}

export async function createMovement(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole("COORDINATOR");

  const parsed = movementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const input = parsed.data;
  const refNo = input.refNo ?? (await nextRefNo());

  if (await db.movement.findUnique({ where: { refNo } })) {
    return { errors: { refNo: `Reference number ${refNo} is already in use` } };
  }

  const passenger = await findOrCreatePassenger(input.passengerName, input.company);

  const movement = await db.movement.create({
    data: {
      refNo,
      passengerId: passenger.id,
      arrivalDate: input.arrivalDate,
      arrivalTime: input.arrivalTime,
      arrivalFlight: input.arrivalFlight,
      arrivalDestination: input.arrivalDestination,
      departureDate: input.departureDate,
      departureTime: input.departureTime,
      departureFlight: input.departureFlight,
      departureDestination: input.departureDestination,
      requestEmailDate: input.requestEmailDate,
      receivedFrom: input.receivedFrom,
      registeredById: input.registeredById,
      remarks: input.remarks,
      status: input.status,
      trfReceived: input.trfReceived,
      cipRequested: input.cipRequested,
    },
  });

  await recordAudit({
    user,
    action: "CREATE",
    entity: "Movement",
    entityId: movement.id,
    summary: `Created movement #${refNo} for ${passenger.fullName}`,
  });

  revalidatePath("/movements");
  revalidatePath("/");
  redirect(`/movements/${movement.id}`);
}

export async function updateMovement(
  movementId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole("COORDINATOR");

  const parsed = movementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const existing = await db.movement.findUnique({
    where: { id: movementId },
    include: { passenger: true },
  });
  if (!existing) return { message: "That movement no longer exists." };

  const input = parsed.data;
  const refNo = input.refNo ?? existing.refNo;

  if (refNo !== existing.refNo) {
    const clash = await db.movement.findUnique({ where: { refNo } });
    if (clash) {
      return { errors: { refNo: `Reference number ${refNo} is already in use` } };
    }
  }

  const passenger =
    normaliseName(input.passengerName) === existing.passenger.normalizedName
      ? existing.passenger
      : await findOrCreatePassenger(input.passengerName, input.company);

  const data = {
    refNo,
    passengerId: passenger.id,
    arrivalDate: input.arrivalDate,
    arrivalTime: input.arrivalTime,
    arrivalFlight: input.arrivalFlight,
    arrivalDestination: input.arrivalDestination,
    departureDate: input.departureDate,
    departureTime: input.departureTime,
    departureFlight: input.departureFlight,
    departureDestination: input.departureDestination,
    requestEmailDate: input.requestEmailDate,
    receivedFrom: input.receivedFrom,
    registeredById: input.registeredById,
    remarks: input.remarks,
    status: input.status,
    trfReceived: input.trfReceived,
    cipRequested: input.cipRequested,
  };

  const changes = diffFields(
    existing as unknown as Record<string, unknown>,
    data as unknown as Record<string, unknown>,
    [...AUDITED_FIELDS],
  );

  await db.movement.update({ where: { id: movementId }, data });

  if (Object.keys(changes).length > 0) {
    await recordAudit({
      user,
      action: "UPDATE",
      entity: "Movement",
      entityId: movementId,
      summary: `Updated movement #${refNo} (${Object.keys(changes).join(", ")})`,
      changes,
    });
  }

  revalidatePath("/movements");
  revalidatePath(`/movements/${movementId}`);
  revalidatePath("/");
  return { message: "Saved." };
}

export async function deleteMovement(movementId: string): Promise<void> {
  const user = await requireRole("ADMIN");

  const existing = await db.movement.findUnique({
    where: { id: movementId },
    include: { passenger: true },
  });
  if (!existing) redirect("/movements");

  await db.movement.delete({ where: { id: movementId } });
  await recordAudit({
    user,
    action: "DELETE",
    entity: "Movement",
    entityId: movementId,
    summary: `Deleted movement #${existing.refNo} for ${existing.passenger.fullName}`,
  });

  revalidatePath("/movements");
  revalidatePath("/");
  redirect("/movements");
}

/** One-click status change from the movement list. */
export async function setMovementStatus(
  movementId: string,
  status: string,
): Promise<void> {
  const user = await requireRole("COORDINATOR");

  const existing = await db.movement.findUnique({ where: { id: movementId } });
  if (!existing || existing.status === status) return;

  await db.movement.update({ where: { id: movementId }, data: { status } });
  await recordAudit({
    user,
    action: "UPDATE",
    entity: "Movement",
    entityId: movementId,
    summary: `Movement #${existing.refNo} status ${existing.status} → ${status}`,
    changes: { status: { from: existing.status, to: status } },
  });

  revalidatePath("/movements");
  revalidatePath(`/movements/${movementId}`);
  revalidatePath("/");
}

export async function saveTransportJob(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole("COORDINATOR");

  const parsed = transportSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const input = parsed.data;
  const jobId = String(formData.get("jobId") ?? "");

  if (jobId) {
    await db.transportJob.update({
      where: { id: jobId },
      data: { ...input, movementId: undefined },
    });
  } else {
    await db.transportJob.create({ data: input });
  }

  await recordAudit({
    user,
    action: jobId ? "UPDATE" : "CREATE",
    entity: "TransportJob",
    entityId: jobId || null,
    summary: `${jobId ? "Updated" : "Added"} ${input.leg.toLowerCase()} transfer${
      input.driverName ? ` for driver ${input.driverName}` : ""
    }`,
  });

  revalidatePath(`/movements/${input.movementId}`);
  revalidatePath("/manifest");
  return { message: "Transfer saved." };
}

export async function deleteTransportJob(
  jobId: string,
  movementId: string,
): Promise<void> {
  const user = await requireRole("COORDINATOR");
  await db.transportJob.delete({ where: { id: jobId } });
  await recordAudit({
    user,
    action: "DELETE",
    entity: "TransportJob",
    entityId: jobId,
    summary: "Removed a transfer",
  });
  revalidatePath(`/movements/${movementId}`);
  revalidatePath("/manifest");
}

/** Used by the passengers page to confirm the signed-in user can edit. */
export async function currentUser() {
  return requireUser();
}
