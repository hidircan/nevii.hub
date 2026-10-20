"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { actionUpdateCollectionsSettings } from "@/lib/actions";
import type { PaymentReminderSettings } from "@/lib/payment-reminder-policy";

export function CollectionsSettingsForm({
  frequencyLimitDays,
  autoSendEnabled,
  vakifbankIban,
  halkbankIban,
  reminder,
}: {
  frequencyLimitDays: number;
  autoSendEnabled: boolean;
  vakifbankIban?: string;
  halkbankIban?: string;
  reminder: PaymentReminderSettings;
}) {
  const router = useRouter();
  const [days, setDays] = useState(frequencyLimitDays);
  const [autoSend, setAutoSend] = useState(autoSendEnabled);
  const [vakifIban, setVakifIban] = useState(vakifbankIban ?? "");
  const [halkIban, setHalkIban] = useState(halkbankIban ?? "");
  const [rem, setRem] = useState(reminder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(false);
    const result = await actionUpdateCollectionsSettings({
      frequencyLimitDays: days,
      autoSendEnabled: autoSend,
      vakifbankIban: vakifIban.trim() || undefined,
      halkbankIban: halkIban.trim() || undefined,
      paymentReminderEnabled: rem.enabled,
      paymentReminderDaysBefore: rem.daysBefore,
      paymentReminderRepeatDays: rem.repeatDays,
      paymentReminderMaxRepeats: rem.maxRepeats,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="mt-3 space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
          Aynı ödeme için hatırlatmalar arası en az gün
        </label>
        <input
          type="number"
          min={1}
          max={30}
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
          className="w-32 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] dark:text-slate-300">
        <input
          type="checkbox"
          checked={autoSend}
          onChange={(event) => setAutoSend(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Taslak mesajları otomatik onayla (varsayılan: kapalı — her mesaj admin onayı bekler)
      </label>
      <p className="text-xs text-[var(--color-text-muted)]">
        Otomatik onay açık olsa bile WhatsApp gönderimi (wa.me) her zaman bir kişinin linke
        tıklamasını gerektirir — hiçbir mesaj sistem tarafından otomatik gönderilmez.
      </p>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
          VakıfBank IBAN (MEB öğrencileri)
        </label>
        <input
          type="text"
          value={vakifIban}
          onChange={(event) => setVakifIban(event.target.value.toUpperCase())}
          placeholder="TR00 0000 0000 0000 0000 0000 00"
          className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
          Halkbank IBAN (diğer öğrenciler)
        </label>
        <input
          type="text"
          value={halkIban}
          onChange={(event) => setHalkIban(event.target.value.toUpperCase())}
          placeholder="TR00 0000 0000 0000 0000 0000 00"
          className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        Boş bırakılan IBAN, ödeme hatırlatması taslağına eklenmez.
      </p>
      <fieldset className="space-y-2 rounded-lg border border-[var(--color-border)] p-3">
        <legend className="px-1 text-xs font-semibold text-[var(--color-text)]">Ödeme hatırlatmaları (yönetici bildirimi)</legend>
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] dark:text-slate-300">
          <input
            type="checkbox"
            checked={rem.enabled}
            onChange={(event) => setRem({ ...rem, enabled: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300"
          />
          Ödeme hatırlatmalarını aç
        </label>
        {(
          [
            ["daysBefore", "Vadeden kaç gün önce haber verilsin (0 = yalnız vade günü ve sonrası)", 30],
            ["repeatDays", "Vade geçtikten sonra kaç günde bir tekrar hatırlatılsın (0 = tekrar yok)", 60],
            ["maxRepeats", "En fazla kaç tekrar", 12],
          ] as const
        ).map(([key, label, max]) => (
          <label key={key} className="flex items-center justify-between gap-3 text-xs text-[var(--color-text-muted)]">
            {label}
            <input
              type="number"
              min={0}
              max={max}
              disabled={!rem.enabled}
              value={rem[key]}
              onChange={(event) => setRem({ ...rem, [key]: Math.max(0, Math.min(max, Number(event.target.value) || 0)) })}
              className="w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </label>
        ))}
        <p className="text-xs text-[var(--color-text-muted)]">
          Gelecek taksitler yalnız seçilen gün penceresine girince bildirilir; her ödeme için aşama başına tek bildirim.
        </p>
      </fieldset>
      <Button type="submit" variant="secondary" disabled={busy}>
        {busy ? "Kaydediliyor..." : "Ayarları kaydet"}
      </Button>
      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
      {success ? <p className="text-xs font-medium text-emerald-600">Kaydedildi.</p> : null}
    </form>
  );
}
