"use client";

/** P0 (2026-08-29) — `actionUpdateBranch` artık `useActionState` uyumlu (bkz. actions.ts yorumu). */

import { useActionState, useEffect, useRef } from "react";
import { actionUpdateBranch, type UpdateBranchFormState } from "@/lib/actions";
import { Button, Input, Label } from "@/components/ui";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs font-medium text-rose-600" role="alert">
      {message}
    </p>
  );
}

export function UpdateBranchForm({
  branch,
}: {
  branch: { id: string; name: string; shortName: string; city: string; phone: string; address: string };
}) {
  const [state, formAction, isPending] = useActionState<UpdateBranchFormState, FormData>(actionUpdateBranch, null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const fieldErrors = state?.fieldErrors ?? {};
  const hasError = !!state?.formError;

  useEffect(() => {
    if (hasError) summaryRef.current?.focus();
  }, [hasError, state]);

  return (
    <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2" noValidate>
      {hasError ? (
        <p
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="sm:col-span-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 outline-none dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
        >
          {state!.formError}
        </p>
      ) : null}
      <input type="hidden" name="branchId" value={branch.id} />
      <div>
        <Label>Ad</Label>
        <Input name="name" defaultValue={branch.name} required aria-invalid={!!fieldErrors.name} />
        <FieldError message={fieldErrors.name} />
      </div>
      <div>
        <Label>Kısa ad</Label>
        <Input name="shortName" defaultValue={branch.shortName} required aria-invalid={!!fieldErrors.shortName} />
        <FieldError message={fieldErrors.shortName} />
      </div>
      <div>
        <Label>Şehir</Label>
        <Input name="city" defaultValue={branch.city} required aria-invalid={!!fieldErrors.city} />
        <FieldError message={fieldErrors.city} />
      </div>
      <div>
        <Label>Telefon</Label>
        <Input name="phone" defaultValue={branch.phone} required aria-invalid={!!fieldErrors.phone} />
        <FieldError message={fieldErrors.phone} />
      </div>
      <div className="sm:col-span-2">
        <Label>Adres</Label>
        <Input name="address" defaultValue={branch.address} required aria-invalid={!!fieldErrors.address} />
        <FieldError message={fieldErrors.address} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </form>
  );
}
