"use client";

/**
 * 2026-09-29 — Hakedişler ekranı: seçili ayın hakediş politikası. Kurallar sunucuda
 * (setPayoutPolicyForMonthData); burası yalnız seçim + etkisini açıklar.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { actionSetTeacherPayoutPolicy } from "@/lib/actions";
import { formatMoney } from "@/lib/utils";

type Policy = "per_teacher_rule" | "fixed_duration";
type Rates = { rate30?: number; rate40?: number; rate50?: number };

export function PayoutPolicyPanel({
  month,
  monthLabel,
  current,
  explicit,
  setAtLabel,
  prefill,
  lockedCount,
  lockedPaidCount,
  unsupportedCount,
  canEdit,
  readOnlyReason,
}: {
  month: string;
  monthLabel: string;
  current: { policy: Policy } & Rates;
  /** Bu ay için açıkça seçim yapılmış mı (yoksa varsayılan = mevcut politika). */
  explicit: boolean;
  setAtLabel?: string;
  /** Sabit tutar alanlarının ön değeri: bu ayın tutarları, yoksa en son kullanılan tutarlar. */
  prefill: Rates;
  lockedCount: number;
  lockedPaidCount: number;
  unsupportedCount: number;
  canEdit: boolean;
  readOnlyReason?: string;
}) {
  const router = useRouter();
  const [policy, setPolicy] = useState<Policy>(current.policy);
  const [rates, setRates] = useState<Record<"30" | "40" | "50", string>>({
    "30": prefill.rate30 !== undefined ? String(prefill.rate30) : "",
    "40": prefill.rate40 !== undefined ? String(prefill.rate40) : "",
    "50": prefill.rate50 !== undefined ? String(prefill.rate50) : "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const locked = lockedCount > 0;
  const editable = canEdit && !locked && !readOnlyReason;

  async function save() {
    setMessage(null);
    const parsed: Rates = {};
    if (policy === "fixed_duration") {
      for (const m of ["30", "40", "50"] as const) {
        const n = Number(rates[m].replace(",", "."));
        if (rates[m].trim() === "" || !Number.isFinite(n) || n <= 0) {
          setMessage({ ok: false, text: `${m} dakikalık ders ücretini girin (0'dan büyük bir tutar).` });
          return;
        }
        parsed[`rate${m}`] = n;
      }
    }
    setSaving(true);
    const res = await actionSetTeacherPayoutPolicy({ month, policy, ...parsed });
    setSaving(false);
    if (!res.ok) {
      setMessage({ ok: false, text: res.message });
      return;
    }
    setMessage({ ok: true, text: res.changed ? `${monthLabel} politikası kaydedildi; tutarlar yeniden hesaplandı.` : "Değişiklik yok." });
    router.refresh();
  }

  return (
    <section
      aria-label="Hakediş politikası"
      className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-[var(--color-text)]">Hakediş politikası — {monthLabel}</h2>
        <span className="text-xs text-[var(--color-text-muted)]">
          {explicit ? `Seçildi${setAtLabel ? ` · ${setAtLabel}` : ""}` : "Seçim yapılmadı — mevcut politika geçerli"}
        </span>
      </div>

      <fieldset disabled={!editable || saving} className="mt-3 space-y-2">
        <legend className="sr-only">Politika seçimi</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="payout-policy" checked={policy === "per_teacher_rule"} onChange={() => setPolicy("per_teacher_rule")} />
          <span>
            <span className="font-medium">Mevcut politika</span>
            <span className="block text-xs text-[var(--color-text-muted)]">
              Her öğretmenin kendi dakika ücreti (Ücret Kuralları) ve kurumun yuvarlama ayarı.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="payout-policy" checked={policy === "fixed_duration"} onChange={() => setPolicy("fixed_duration")} />
          <span>
            <span className="font-medium">Süreye göre sabit ücret</span>
            <span className="block text-xs text-[var(--color-text-muted)]">
              Tüm öğretmenler için ortak, ders başı tutar. Öğretmen bazlı ücretler bu ay kullanılmaz (silinmez).
            </span>
          </span>
        </label>
        {policy === "fixed_duration" ? (
          <div className="grid max-w-md grid-cols-3 gap-2 pl-6">
            {(["30", "40", "50"] as const).map((m) => (
              <label key={m} className="text-xs">
                <span className="mb-1 block font-medium text-[var(--color-text)]">{m} dk ders (TL)</span>
                <input
                  inputMode="decimal"
                  value={rates[m]}
                  onChange={(e) => setRates((r) => ({ ...r, [m]: e.target.value }))}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
                  aria-label={`${m} dakikalık ders ücreti`}
                />
              </label>
            ))}
          </div>
        ) : null}
      </fieldset>

      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-[var(--color-text-muted)]">
        <li>Seçim yalnız {monthLabel} için ve bu aydaki tüm öğretmenlerin tüm derslerine uygulanır; diğer aylar etkilenmez.</li>
        <li>Hakediş kaydı oluşturulana kadar tutarlar canlı hesaplanır; kayıt oluşunca o ayın politikası ve tutarları kilitlenir.</li>
        {policy === "fixed_duration" ? (
          <li>Süresi 30/40/50 dakika olmayan ders ücretlendirilmez ve o öğretmenin hakediş kaydı oluşturulamaz.</li>
        ) : null}
      </ul>

      {current.policy === "fixed_duration" ? (
        <p className="mt-2 text-xs text-[var(--color-text)]">
          Geçerli tutarlar: 30 dk {formatMoney(current.rate30 ?? 0)} · 40 dk {formatMoney(current.rate40 ?? 0)} · 50 dk{" "}
          {formatMoney(current.rate50 ?? 0)}
        </p>
      ) : null}
      {unsupportedCount > 0 ? (
        <p className="mt-2 text-xs font-medium text-[var(--color-danger)]" role="alert">
          Bu ay {unsupportedCount} dersin süresi 30/40/50 dakika değil; tutarları hesaplanamıyor. Ders süresini Ders
          Programı&apos;ndan düzeltin veya mevcut politikayı seçin.
        </p>
      ) : null}
      {locked ? (
        <p className="mt-2 text-xs font-medium text-[var(--color-text)]">
          Bu ay için {lockedCount} hakediş kaydı var ({lockedPaidCount} ödendi) — politika ve tutarlar kilitli. Tek bir dersi
          düzeltmek için öğretmenin hakediş detayındaki revizyonu kullanın.
        </p>
      ) : null}
      {readOnlyReason ? <p className="mt-2 text-xs text-[var(--color-text-muted)]">{readOnlyReason}</p> : null}

      {editable ? (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="mt-3 rounded-lg border border-[var(--color-primary)] bg-[var(--color-surface-muted)] px-3 py-1.5 text-sm font-semibold text-[var(--color-primary-soft-text)] hover:bg-[var(--color-primary-soft)] disabled:opacity-50"
        >
          {saving ? "Kaydediliyor…" : "Politikayı kaydet"}
        </button>
      ) : null}
      {message ? (
        <p className={`mt-2 text-xs font-medium ${message.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`} role="status">
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
