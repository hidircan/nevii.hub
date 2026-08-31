"use client";

/**
 * P0 (2026-08-29) — `actionAddPayment` artık `useActionState` uyumlu (bkz.
 * actions.ts yorumu — `actionAddStudent` ile AYNI throw-based çökme deseni
 * taşıyordu). Bu bileşen `odemeler/page.tsx` (öğrenci seçici, dropdown) ve
 * `odemeler/[studentId]/page.tsx` (tek öğrenci, gizli alan) sayfalarındaki
 * AYNI formu TEK yerde tutar.
 */

import { useActionState, useEffect, useRef } from "react";
import { actionAddPayment, type AddPaymentFormState } from "@/lib/actions";
import { Button, Input, Label, Select } from "@/components/ui";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs font-medium text-rose-600" role="alert">
      {message}
    </p>
  );
}

export function AddPaymentForm({
  students,
  fixedStudentId,
  defaultAmount,
  gridClassName,
}: {
  /** Verilirse öğrenci seçici (dropdown) gösterilir. */
  students?: { id: string; name: string }[];
  /** Verilirse gizli `studentId` alanı kullanılır (tek öğrenci sayfası). */
  fixedStudentId?: string;
  defaultAmount?: number;
  gridClassName: string;
}) {
  const [state, formAction, isPending] = useActionState<AddPaymentFormState, FormData>(actionAddPayment, null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const fieldErrors = state?.fieldErrors ?? {};
  const hasError = !!state?.formError;

  useEffect(() => {
    if (hasError) summaryRef.current?.focus();
  }, [hasError, state]);

  return (
    <form action={formAction} className={gridClassName} noValidate>
      {hasError ? (
        <p
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="sm:col-span-full rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 outline-none dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
        >
          {state!.formError}
        </p>
      ) : null}

      {fixedStudentId ? (
        <input type="hidden" name="studentId" value={fixedStudentId} />
      ) : (
        <div>
          <Label>Öğrenci</Label>
          <Select name="studentId" defaultValue={students?.[0]?.id} aria-invalid={!!fieldErrors.studentId}>
            {students?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <FieldError message={fieldErrors.studentId} />
        </div>
      )}
      <div>
        <Label>Açıklama / dönem</Label>
        <Input name="description" required placeholder="Örn. Ağustos 2026 — Piyano" aria-invalid={!!fieldErrors.description} />
        <FieldError message={fieldErrors.description} />
      </div>
      <div>
        <Label>Tutar (₺)</Label>
        <Input name="amount" type="number" min={1} defaultValue={defaultAmount ?? 3000} required aria-invalid={!!fieldErrors.amount} />
        <FieldError message={fieldErrors.amount} />
      </div>
      <div>
        <Label>Vade tarihi</Label>
        <Input name="dueDate" type="date" required aria-invalid={!!fieldErrors.dueDate} />
        <FieldError message={fieldErrors.dueDate} />
      </div>
      <div className={fixedStudentId ? "sm:col-span-3" : "sm:col-span-2 lg:col-span-4"}>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Ekleniyor…" : "Ödeme kaydı ekle"}
        </Button>
      </div>
    </form>
  );
}
