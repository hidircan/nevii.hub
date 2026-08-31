"use client";

/** P0 (2026-08-29) — `actionAddBranch` artık `useActionState` uyumlu (bkz. actions.ts yorumu). */

import { useActionState, useEffect, useRef } from "react";
import { actionAddBranch, type AddBranchFormState } from "@/lib/actions";
import { Button, Input, Label } from "@/components/ui";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs font-medium text-rose-600" role="alert">
      {message}
    </p>
  );
}

export function NewBranchForm() {
  const [state, formAction, isPending] = useActionState<AddBranchFormState, FormData>(actionAddBranch, null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const fieldErrors = state?.fieldErrors ?? {};
  const hasError = !!state?.formError;

  useEffect(() => {
    if (hasError) summaryRef.current?.focus();
  }, [hasError, state]);

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {hasError ? (
        <p
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 outline-none dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
        >
          {state!.formError}
        </p>
      ) : null}
      <div>
        <Label>Ad</Label>
        <Input name="name" required placeholder="Örn. Bostanlı Şubesi" aria-invalid={!!fieldErrors.name} />
        <FieldError message={fieldErrors.name} />
      </div>
      <div>
        <Label>Kısa ad</Label>
        <Input name="shortName" required placeholder="Örn. Bostanlı" aria-invalid={!!fieldErrors.shortName} />
        <FieldError message={fieldErrors.shortName} />
      </div>
      <div>
        <Label>Şehir</Label>
        <Input name="city" required placeholder="Örn. İzmir" aria-invalid={!!fieldErrors.city} />
        <FieldError message={fieldErrors.city} />
      </div>
      <div>
        <Label>Telefon</Label>
        <Input name="phone" required placeholder="05xx xxx xxxx" aria-invalid={!!fieldErrors.phone} />
        <FieldError message={fieldErrors.phone} />
      </div>
      <div>
        <Label>Adres</Label>
        <Input name="address" required placeholder="Açık adres" aria-invalid={!!fieldErrors.address} />
        <FieldError message={fieldErrors.address} />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Ekleniyor…" : "Şube ekle"}
      </Button>
    </form>
  );
}
