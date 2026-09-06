import { z } from "zod";
import { MOVEMENT_STATUSES, TRANSPORT_STATUSES, LEGS } from "@/lib/constants";

/** Empty form fields arrive as "" — treat them as absent rather than invalid. */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable();

/** An <input type="date"> value ("2026-08-14") as a UTC date, or null. */
const optionalDate = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      ctx.addIssue({ code: "custom", message: "Use the date picker" });
      return null;
    }
    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  })
  .nullable();

/** An <input type="time"> value, stored as text so "TBC" stays expressible. */
const optionalTime = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    if (!/^\d{1,2}:\d{2}$/.test(value)) {
      ctx.addIssue({ code: "custom", message: "Use HH:MM" });
      return null;
    }
    const [hours, minutes] = value.split(":").map(Number);
    if (hours > 23 || minutes > 59) {
      ctx.addIssue({ code: "custom", message: "Not a valid time" });
      return null;
    }
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  })
  .nullable();

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.string(), z.undefined(), z.null()])
  .transform((value) => value === "on" || value === "true");

export const movementSchema = z
  .object({
    refNo: z
      .string()
      .trim()
      .transform((value, ctx) => {
        if (value === "") return null;
        const numeric = Number(value);
        if (!Number.isInteger(numeric) || numeric <= 0) {
          ctx.addIssue({ code: "custom", message: "Must be a whole number" });
          return null;
        }
        return numeric;
      })
      .nullable(),
    passengerName: z
      .string()
      .trim()
      .min(2, "Enter the passenger's full name")
      .max(120, "That name is too long"),
    company: optionalText,

    arrivalDate: optionalDate,
    arrivalTime: optionalTime,
    arrivalFlight: optionalText,
    arrivalDestination: optionalText,

    departureDate: optionalDate,
    departureTime: optionalTime,
    departureFlight: optionalText,
    departureDestination: optionalText,

    requestEmailDate: optionalDate,
    receivedFrom: optionalText,
    registeredById: optionalText,
    remarks: optionalText,
    status: z.enum(MOVEMENT_STATUSES),
    trfReceived: checkbox,
    cipRequested: checkbox,
  })
  .refine(
    (value) => value.arrivalDate !== null || value.departureDate !== null,
    {
      message: "Record at least an arrival or a departure date",
      path: ["arrivalDate"],
    },
  )
  .refine(
    (value) =>
      !value.arrivalDate ||
      !value.departureDate ||
      value.departureDate >= value.arrivalDate,
    { message: "Departure cannot be before arrival", path: ["departureDate"] },
  );

export type MovementInput = z.infer<typeof movementSchema>;

export const transportSchema = z.object({
  movementId: z.string().min(1),
  leg: z.enum(LEGS),
  scheduledAt: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : new Date(value)))
    .nullable(),
  pickupLocation: optionalText,
  dropoffLocation: optionalText,
  driverName: optionalText,
  vehicle: optionalText,
  status: z.enum(TRANSPORT_STATUSES),
  notes: optionalText,
});

export const passengerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter a full name").max(120),
  company: optionalText,
  nationality: optionalText,
  passportNo: optionalText,
  employeeNo: optionalText,
  email: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .refine((value) => value === null || z.email().safeParse(value).success, {
      message: "Enter a valid email address",
    }),
  phone: optionalText,
  notes: optionalText,
});

/** Collapses a ZodError into the { field: message } shape the forms render. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    result[key] ??= issue.message;
  }
  return result;
}
