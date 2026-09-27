"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionRestoreDeletedTask } from "@/lib/actions";

export function TaskRestoreButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await actionRestoreDeletedTask(taskId);
            if (!res.ok) setError(res.message);
            else router.refresh();
          })
        }
        className="rounded-md border border-[var(--color-primary)] px-2.5 py-1 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Geri alınıyor…" : "Geri al"}
      </button>
      {error ? (
        <p className="mt-1 text-xs text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
