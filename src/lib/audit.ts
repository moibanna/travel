import "server-only";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

type AuditInput = {
  user: SessionUser | null;
  action: "CREATE" | "UPDATE" | "DELETE" | "IMPORT" | "LOGIN";
  entity: string;
  entityId?: string | null;
  summary: string;
  changes?: Record<string, { from: unknown; to: unknown }> | null;
};

/**
 * Writes an audit entry. Auditing must never break the operation it records, so
 * failures here are logged and swallowed.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: input.user?.id ?? null,
        userEmail: input.user?.email ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary,
        changes: input.changes ? JSON.stringify(input.changes) : null,
      },
    });
  } catch (error) {
    console.error("Failed to write audit log", error);
  }
}

/** Field-level diff between two records, limited to the given keys. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  keys: (keyof T)[],
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of keys) {
    const from = normalise(before[key]);
    const to = normalise(after[key]);
    if (from !== to) {
      changes[String(key)] = { from: before[key] ?? null, to: after[key] ?? null };
    }
  }
  return changes;
}

function normalise(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
