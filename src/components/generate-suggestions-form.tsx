"use client";

/** P0 (2026-08-29) — `actionGenerateSuggestions` artık `useActionState` uyumlu (bkz. actions.ts yorumu). */

import { useActionState } from "react";
import { actionGenerateSuggestions, type SimpleActionFormState } from "@/lib/actions";
import { TelafiSubmitButton } from "@/components/telafi-submit-button";
import type { ReactNode } from "react";

export function GenerateSuggestionsForm({
  requestId,
  maxSlots,
  variant,
  disabled,
  pendingLabel,
  className,
  children,
}: {
  requestId: string;
  maxSlots?: number;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  disabled?: boolean;
  pendingLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState<SimpleActionFormState, FormData>(actionGenerateSuggestions, null);
  return (
    <form action={formAction} className={className}>
      <input type="hidden" name="requestId" value={requestId} />
      {maxSlots ? <input type="hidden" name="maxSlots" value={maxSlots} /> : null}
      <TelafiSubmitButton variant={variant} pendingLabel={pendingLabel} disabled={disabled}>
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
