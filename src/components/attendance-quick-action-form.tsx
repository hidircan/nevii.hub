"use client";

/**
 * P0 (2026-08-29) — `actionMarkAttendance` artık `useActionState` uyumlu
 * (throw ETMEZ, `MarkAttendanceFormState` döner). Bu küçük sarmalayıcı,
 * `ogretmen/page.tsx`'teki 4 hızlı-eylem butonunun (Geldi/Geç kaldı/
 * Gelmedi/İptal) HER BİRİ için tekrarlanan `useActionState` bağlama
 * mantığını TEK bir yerde tutar — gizli input'lu küçük formlarda görünür
 * alan olmadığından, hata gösterimi buton altında küçük bir satır olarak
 * yeterlidir (kayıt formlarındaki gibi alan bazlı hata GEREKMEZ).
 */

import { useActionState } from "react";
import { actionMarkAttendance, type MarkAttendanceFormState } from "@/lib/actions";
import { TelafiSubmitButton } from "@/components/telafi-submit-button";
import type { ReactNode } from "react";

export function AttendanceQuickActionForm({
  lessonId,
  status,
  reason,
  variant,
  pendingLabel,
  className,
  children,
}: {
  lessonId: string;
  status: string;
  reason?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  pendingLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState<MarkAttendanceFormState, FormData>(actionMarkAttendance, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="status" value={status} />
      {reason ? <input type="hidden" name="reason" value={reason} /> : null}
      <TelafiSubmitButton variant={variant} className={className} pendingLabel={pendingLabel}>
        {children}
      </TelafiSubmitButton>
      {state?.ok === false ? (
        <p role="alert" className="mt-1 text-xs font-medium text-rose-600">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
