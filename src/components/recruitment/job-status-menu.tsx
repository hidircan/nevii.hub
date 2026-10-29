"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionSetJobStatus } from "@/lib/recruitment/actions";
import { JOB_STATUS_LABELS } from "@/lib/recruitment/constants";
import type { JobStatus } from "@/lib/recruitment/types";

export function JobStatusMenu({ id, status }: { id: string; status: JobStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="İlan durumu"
      disabled={pending}
      value={status}
      onChange={(e) =>
        start(async () => {
          const r = await actionSetJobStatus({ id, status: e.target.value });
          if (!r.ok) alert(r.message);
          router.refresh();
        })
      }
      className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 text-xs font-medium"
    >
      {(Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map((s) => <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>)}
    </select>
  );
}
