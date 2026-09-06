"use client";

import { deleteMovement } from "@/app/actions/movements";
import { Button } from "@/components/ui";

export function DeleteMovementButton({ movementId }: { movementId: string }) {
  return (
    <form
      action={async () => {
        await deleteMovement(movementId);
      }}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Delete this movement permanently? The audit trail will keep a record that it was deleted.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <Button type="submit" variant="danger">
        Delete movement
      </Button>
    </form>
  );
}
