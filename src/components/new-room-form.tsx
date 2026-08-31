"use client";

/** P0 (2026-08-29) — `actionAddRoom` artık `useActionState` uyumlu (bkz. actions.ts yorumu). */

import { useActionState, useEffect, useRef } from "react";
import { actionAddRoom, type AddRoomFormState } from "@/lib/actions";
import { Button, Input, Label, Select } from "@/components/ui";
import { INSTRUMENTS } from "@/lib/types";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs font-medium text-rose-600" role="alert">
      {message}
    </p>
  );
}

export function NewRoomForm({ branches }: { branches: { id: string; name: string }[] }) {
  const [state, formAction, isPending] = useActionState<AddRoomFormState, FormData>(actionAddRoom, null);
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
        <Input name="name" required placeholder="Örn. Stüdyo 3" aria-invalid={!!fieldErrors.name} />
        <FieldError message={fieldErrors.name} />
      </div>
      <div>
        <Label>Şube</Label>
        <Select name="branchId" defaultValue={branches[0]?.id} aria-invalid={!!fieldErrors.branchId}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <FieldError message={fieldErrors.branchId} />
      </div>
      <div>
        <Label>Kapasite</Label>
        <Input name="capacity" type="number" defaultValue={2} min={1} aria-invalid={!!fieldErrors.capacity} />
        <FieldError message={fieldErrors.capacity} />
      </div>
      <div>
        <Label>Desteklenen enstrümanlar</Label>
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--color-border)] p-3">
          {INSTRUMENTS.map((instrument) => (
            <label key={instrument} className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] dark:text-slate-300">
              <input type="checkbox" name="instruments" value={instrument} />
              {instrument}
            </label>
          ))}
        </div>
        <FieldError message={fieldErrors.instruments} />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Ekleniyor…" : "Oda ekle"}
      </Button>
    </form>
  );
}
