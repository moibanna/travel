"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button, Card, Field, Input, Select } from "@/components/ui";

/**
 * Filter bar. State lives in the URL so a filtered view can be bookmarked and
 * shared — the desk regularly needs to send someone "this week's arrivals".
 */
export function MovementFilters({
  staff,
  statuses,
}: {
  staff: { id: string; name: string }[];
  statuses: { value: string; label: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function apply(formData: FormData) {
    const next = new URLSearchParams();
    for (const key of ["q", "status", "staff", "from", "to"]) {
      const value = String(formData.get(key) ?? "").trim();
      if (value) next.set(key, value);
    }
    if (formData.get("alerts") === "on") next.set("alerts", "1");
    startTransition(() => router.push(`/movements?${next.toString()}`));
  }

  const hasFilters = Array.from(params.keys()).some((key) => key !== "page");

  return (
    <Card bodyClassName="p-3">
      <form action={apply} className="grid gap-3 md:grid-cols-6">
        <Field label="Search" className="md:col-span-2">
          <Input
            name="q"
            placeholder="Name, flight, destination, ref…"
            defaultValue={params.get("q") ?? ""}
          />
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={params.get("status") ?? ""}>
            <option value="">Any</option>
            {statuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Registered by">
          <Select name="staff" defaultValue={params.get("staff") ?? ""}>
            <option value="">Anyone</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From">
          <Input type="date" name="from" defaultValue={params.get("from") ?? ""} />
        </Field>
        <Field label="To">
          <Input type="date" name="to" defaultValue={params.get("to") ?? ""} />
        </Field>

        <div className="flex items-end gap-2 md:col-span-6">
          <label className="flex items-center gap-2 pb-2 text-sm text-ink">
            <input
              type="checkbox"
              name="alerts"
              defaultChecked={params.get("alerts") === "1"}
              className="h-4 w-4 rounded border-line"
            />
            Only records needing attention
          </label>
          <div className="ml-auto flex gap-2">
            {hasFilters && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => startTransition(() => router.push("/movements"))}
              >
                Clear
              </Button>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Filtering…" : "Apply"}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
