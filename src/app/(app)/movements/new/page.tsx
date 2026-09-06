import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getReferenceData } from "@/lib/queries";
import { createMovement } from "@/app/actions/movements";
import { EMPTY_MOVEMENT, MovementForm } from "@/components/movement-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New movement" };

export default async function NewMovementPage() {
  await requireRole("COORDINATOR");
  const { staff, sources } = await getReferenceData();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <Link href="/movements" className="text-sm text-accent hover:underline">
          ← Movements
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink">New movement</h1>
      </header>

      <MovementForm
        action={createMovement}
        defaults={EMPTY_MOVEMENT}
        staff={staff}
        sources={sources}
        submitLabel="Create movement"
      />
    </div>
  );
}
