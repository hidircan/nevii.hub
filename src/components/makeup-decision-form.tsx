"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { TelafiSubmitButton } from "@/components/telafi-submit-button";
import type { SimpleActionFormState } from "@/lib/actions";

/**
 * EPIC 10 — onay/iptal/ret kararında karar notu ZORUNLU. Ayrı bir modal
 * yerine bilinçli olarak inline bir form kullanılıyor (kapsam/zaman kararı) —
 * fonksiyonel gereksinim (`required` textarea, boş gönderilemez) aynı,
 * yalnızca sunum daha basit.
 *
 * P0 (2026-08-29) — `action` ÖNCEDEN throw eden, `useActionState` YOK bir
 * server action'du (`actionConfirmSlot`/`actionCancelMakeup` — bkz.
 * actions.ts yorumu). Artık `useActionState` ile bağlanır, hata mesajı
 * form altında gösterilir, THROW ETMEZ.
 */
export function MakeupDecisionForm({
  action,
  hiddenFields,
  pendingLabel,
  variant,
  disabled,
  placeholder,
  noteRequired = true,
  children,
}: {
  action: (prevState: SimpleActionFormState, formData: FormData) => Promise<SimpleActionFormState>;
  hiddenFields: Record<string, string>;
  pendingLabel: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  disabled?: boolean;
  placeholder?: string;
  /** Onayda gerekçe isteğe bağlı (2026-09-30); iptal/retde zorunlu kalır. */
  noteRequired?: boolean;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState<SimpleActionFormState, FormData>(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <textarea
        name="decisionNote"
        required={noteRequired}
        rows={2}
        placeholder={placeholder ?? "Karar notu (zorunlu)…"}
        disabled={disabled}
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2 disabled:bg-[var(--color-surface-muted)] disabled:text-[var(--color-text-muted)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      />
      <TelafiSubmitButton pendingLabel={pendingLabel} variant={variant} disabled={disabled}>
        {children}
      </TelafiSubmitButton>
      {state?.ok === false ? (
        <p role="alert" className="text-xs font-medium text-rose-600">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
