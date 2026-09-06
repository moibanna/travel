import Link from "next/link";
import { Badge } from "@/components/ui";
import { MOVEMENT_STATUS_LABELS, type MovementStatus } from "@/lib/constants";
import type { Alert } from "@/lib/domain";

const STATUS_TONES = {
  PLANNED: "neutral",
  CONFIRMED: "info",
  ARRIVED: "ok",
  DEPARTED: "brand",
  CANCELLED: "danger",
} as const;

export function StatusBadge({ status }: { status: string }) {
  const key = status as MovementStatus;
  return (
    <Badge tone={STATUS_TONES[key] ?? "neutral"}>
      {MOVEMENT_STATUS_LABELS[key] ?? status}
    </Badge>
  );
}

/** Compact alert indicator used in tables; the full text is the tooltip. */
export function AlertDots({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;

  const tone =
    alerts.some((a) => a.severity === "high")
      ? "danger"
      : alerts.some((a) => a.severity === "medium")
        ? "warn"
        : "neutral";

  return (
    <Badge tone={tone} className="cursor-help" >
      <span title={alerts.map((a) => a.message).join("\n")}>
        {alerts.length} {alerts.length === 1 ? "issue" : "issues"}
      </span>
    </Badge>
  );
}

export function AlertList({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return <p className="text-sm text-ink-soft">Nothing outstanding.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {alerts.map((alert) => (
        <li key={alert.code} className="flex items-start gap-2 text-sm">
          <Badge
            tone={
              alert.severity === "high"
                ? "danger"
                : alert.severity === "medium"
                  ? "warn"
                  : "neutral"
            }
          >
            {alert.severity}
          </Badge>
          <span className="text-ink">{alert.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function PassengerLink({
  id,
  name,
  refNo,
}: {
  id: string;
  name: string;
  refNo: number;
}) {
  return (
    <Link
      href={`/movements/${id}`}
      className="font-medium text-ink hover:text-accent hover:underline"
    >
      {name}
      <span className="numeric ml-1.5 text-xs font-normal text-ink-soft">
        #{refNo}
      </span>
    </Link>
  );
}
