"use client";

/**
 * Hakedişler ekranı — seçili ayın hakediş politikası (2026-09-30: kilit yok).
 * Akış: politika/tutar seç → "Etkisini göster" (sunucu önizlemesi, yazmaz) → öğretmen bazında önce/sonra
 * tablosu → "Onayla ve uygula". Ödemesiz kayıtlar yeniden hesaplanır; ödemeli kayıtlar değişmez, farkları
 * öğretmen hakediş ekranında düzeltme kaydıyla kapatılır. Kurallar sunucuda (setTeacherPayoutPolicyTool).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { actionSetTeacherPayoutPolicy, type SetPayoutPolicyActionResult } from "@/lib/actions";
import { formatMoney } from "@/lib/utils";

type Policy = "per_teacher_rule" | "fixed_duration";
type Rates = { rate30?: number; rate40?: number; rate50?: number };
type Preview = Extract<SetPayoutPolicyActionResult, { ok: true }>;

const STATE_LABEL = {
  no_record: "Kayıt yok — canlı hesap değişir",
  recalc: "Ödemesiz kayıt — yeniden hesaplanır",
  adjust: "Ödemeli kayıt — değişmez, fark önerilir",
} as const;

export function PayoutPolicyPanel({
  month,
  monthLabel,
  current,
  explicit,
  setAtLabel,
  prefill,
  recordCount,
  paidRecordCount,
  durationExceptionCount,
  canEdit,
  readOnlyReason,
}: {
  month: string;
  monthLabel: string;
  current: { policy: Policy } & Rates;
  explicit: boolean;
  setAtLabel?: string;
  prefill: Rates;
  /** Bu ayla kesişen aktif hakediş kaydı sayısı. */
  recordCount: number;
  /** Bunlardan ödemesi olanlar (değişmez; fark önerisi alır). */
  paidRecordCount: number;
  durationExceptionCount: number;
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
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const editable = canEdit && !readOnlyReason;

  function parsed(): (Rates & { policy: Policy }) | string {
    if (policy === "per_teacher_rule") return { policy };
    const out: Rates = {};
    for (const m of ["30", "40", "50"] as const) {
      const n = Number(rates[m].replace(",", "."));
      if (rates[m].trim() === "" || !Number.isFinite(n) || n <= 0) return `${m} dakikalık ders ücretini girin (0'dan büyük bir tutar).`;
      out[`rate${m}`] = n;
    }
    return { policy, ...out };
  }

  async function run(apply: boolean) {
    const input = parsed();
    if (typeof input === "string") {
      setMessage({ ok: false, text: input });
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await actionSetTeacherPayoutPolicy({ month, ...input, preview: !apply });
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: res.message });
      return;
    }
    if (!apply) {
      setPreview(res);
      return;
    }
    setPreview(null);
    const parts = [res.changed ? `${monthLabel} politikası kaydedildi.` : "Politika zaten bu şekildeydi."];
    if (res.recalculated) parts.push(`${res.recalculated} ödemesiz kayıt yeniden hesaplandı.`);
    if (res.needsAdjustment?.length) {
      parts.push(
        `Ödemeli ${res.needsAdjustment.length} kayıtta fark var (${res.needsAdjustment
          .map((x) => `${x.teacherName} ${x.drift > 0 ? "+" : "−"}${formatMoney(Math.abs(x.drift))}`)
          .join(", ")}); öğretmenin hakediş ekranından "Farkı düzeltme olarak ekle" ile kapatın.`
      );
    }
    if (res.failed?.length) parts.push(`Yeniden hesaplanamayan: ${res.failed.join(", ")} (ücret kuralı eksik olabilir).`);
    setMessage({ ok: !res.failed?.length, text: parts.join(" ") });
    router.refresh();
  }

  const totalDiff = preview ? preview.impact.reduce((s, r) => s + r.diff, 0) : 0;

  return (
    <section aria-label="Hakediş politikası" className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-[var(--color-text)]">Hakediş politikası — {monthLabel}</h2>
        <span className="text-xs text-[var(--color-text-muted)]">
          {explicit ? `Seçildi${setAtLabel ? ` · ${setAtLabel}` : ""}` : "Seçim yok — öğretmen bazlı ücret geçerli"}
          {recordCount > 0 ? ` · ${recordCount} kayıt (${paidRecordCount} ödemeli)` : ""}
        </span>
      </div>

      <fieldset disabled={!editable || busy} className="mt-3 space-y-2">
        <legend className="sr-only">Politika seçimi</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="payout-policy" checked={policy === "per_teacher_rule"} onChange={() => { setPolicy("per_teacher_rule"); setPreview(null); }} />
          <span>
            <span className="font-medium">Öğretmen bazlı dakika ücreti</span>
            <span className="block text-xs text-[var(--color-text-muted)]">Her öğretmenin Ücret Kuralları ve kurumun yuvarlama ayarı.</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="payout-policy" checked={policy === "fixed_duration"} onChange={() => { setPolicy("fixed_duration"); setPreview(null); }} />
          <span>
            <span className="font-medium">Süreye göre sabit ücret (tüm öğretmenler)</span>
            <span className="block text-xs text-[var(--color-text-muted)]">
              Ders başı ortak tutar. 30/40/50 dışı süreler en yakın üst tarifeden orantılı hesaplanır (bloklamaz).
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
                  onChange={(e) => {
                    setRates((r) => ({ ...r, [m]: e.target.value }));
                    setPreview(null);
                  }}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
                  aria-label={`${m} dakikalık ders ücreti`}
                />
              </label>
            ))}
          </div>
        ) : null}
      </fieldset>

      {current.policy === "fixed_duration" ? (
        <p className="mt-2 text-xs text-[var(--color-text)]">
          Geçerli: 30 dk {formatMoney(current.rate30 ?? 0)} · 40 dk {formatMoney(current.rate40 ?? 0)} · 50 dk {formatMoney(current.rate50 ?? 0)}
          {durationExceptionCount > 0 ? ` · ${durationExceptionCount} ders süre istisnası (orantılı)` : ""}
        </p>
      ) : null}
      {readOnlyReason ? <p className="mt-2 text-xs text-[var(--color-text-muted)]">{readOnlyReason}</p> : null}

      {editable && !preview ? (
        <button
          type="button"
          onClick={() => void run(false)}
          disabled={busy}
          className="mt-3 rounded-lg border border-[var(--color-primary)] bg-[var(--color-surface-muted)] px-3 py-1.5 text-sm font-semibold text-[var(--color-primary-soft-text)] hover:bg-[var(--color-primary-soft)] disabled:opacity-50"
        >
          {busy ? "Hesaplanıyor…" : "Etkisini göster"}
        </button>
      ) : null}

      {preview ? (
        <div className="mt-3 rounded-lg border border-[var(--color-border)] p-3">
          <p className="text-xs font-semibold text-[var(--color-text)]">
            {preview.changed ? "Bu değişikliğin etkisi" : "Politika zaten bu şekilde — değişiklik yok"} · toplam fark {totalDiff >= 0 ? "+" : "−"}
            {formatMoney(Math.abs(totalDiff))}
          </p>
          {preview.impact.length === 0 ? (
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Bu ayda hakedişe konu ders veya kayıt yok.</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="text-[var(--color-text-muted)]">
                  <tr>
                    <th className="py-1 pr-2">Öğretmen</th>
                    <th className="py-1 pr-2">Durum</th>
                    <th className="py-1 pr-2 text-right">Şu an</th>
                    <th className="py-1 pr-2 text-right">Sonra</th>
                    <th className="py-1 text-right">Fark</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.impact.map((r, i) => (
                    <tr key={`${r.teacherId}-${i}`} className="border-t border-[var(--color-border)]">
                      <td className="py-1 pr-2 font-medium">{r.teacherName}</td>
                      <td className="py-1 pr-2 text-[var(--color-text-muted)]">
                        {STATE_LABEL[r.state]} ({r.statusLabel})
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">{formatMoney(r.before)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{formatMoney(r.after)}</td>
                      <td className="py-1 text-right tabular-nums" style={{ color: r.diff === 0 ? undefined : r.diff > 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                        {r.diff >= 0 ? "+" : "−"}
                        {formatMoney(Math.abs(r.diff))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
            Ödemesi yapılmış kayıtlar yeniden yazılmaz; &quot;Sonra&quot; sütunu oluşacak farkı gösterir. Farkı öğretmenin hakediş
            ekranından düzeltme kaydıyla kapatırsınız.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void run(true)}
              disabled={busy}
              className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              {busy ? "Uygulanıyor…" : "Onayla ve uygula"}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              disabled={busy}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium"
            >
              Vazgeç
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p role="status" className={`mt-2 text-xs font-medium ${message.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
