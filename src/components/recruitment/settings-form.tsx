"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { actionSaveSettings } from "@/lib/recruitment/actions";
import type { RecruitmentSettings } from "@/lib/recruitment/types";

const inputCls =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]/30";

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" className="mt-1 h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? <span className="block text-xs text-[var(--color-text-muted)]">{hint}</span> : null}
      </span>
    </label>
  );
}

export function SettingsForm({ settings, defaultKvkk }: { settings: RecruitmentSettings; defaultKvkk: string }) {
  const router = useRouter();
  const [s, setS] = useState({
    careerPageEnabled: settings.careerPageEnabled,
    careerPageIntro: settings.careerPageIntro,
    kvkkText: settings.kvkkText || defaultKvkk,
    notifyInApp: settings.notifyInApp,
    notifyEmails: settings.notifyEmails.join(", "),
    autoAcknowledge: settings.autoAcknowledge,
    retentionMonths: settings.retentionMonths,
    scorecardCriteria: settings.scorecardCriteria,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="grid gap-6 lg:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await actionSaveSettings({
            ...s,
            notifyEmails: s.notifyEmails.split(/[,\s;]+/).map((x) => x.trim()).filter(Boolean),
            scorecardCriteria: s.scorecardCriteria
              .filter((c) => c.label.trim())
              .map((c, i) => ({ key: c.key || `k${i + 1}`, label: c.label.trim() })),
          });
          setMsg(r.ok ? `Ayarlar kaydedildi (KVKK metni sürümü: ${r.data.settings.kvkkTextVersion}).` : r.message);
          if (r.ok) router.refresh();
        });
      }}
    >
      <section className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="text-base font-semibold">Kariyer sayfası</h2>
        <Toggle checked={s.careerPageEnabled} onChange={(v) => setS({ ...s, careerPageEnabled: v })} label="Kariyer sayfası yayında" hint="Kapalıyken ilan bağlantıları 'bulunamadı' gösterir ve başvuru alınmaz." />
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Tanıtım metni</span>
          <textarea rows={5} className={inputCls} value={s.careerPageIntro} onChange={(e) => setS({ ...s, careerPageIntro: e.target.value })} placeholder="Kurumunuzu ve çalışma kültürünüzü birkaç cümleyle anlatın." />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">KVKK aydınlatma metni</span>
          <textarea rows={8} className={inputCls} value={s.kvkkText} onChange={(e) => setS({ ...s, kvkkText: e.target.value })} />
          <span className="mt-1 block text-xs text-[var(--color-text-muted)]">Metni değiştirdiğinizde sürüm numarası artar; her adayın hangi sürümü onayladığı kaydedilir. Hukuk danışmanınızla gözden geçirmeniz önerilir.</span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Saklama süresi (ay)</span>
          <input type="number" min={1} max={60} className={`${inputCls} w-32`} value={s.retentionMonths} onChange={(e) => setS({ ...s, retentionMonths: Number(e.target.value) || 12 })} />
          <span className="mt-1 block text-xs text-[var(--color-text-muted)]">İşe alınmayan adayların verileri bu süre sonunda anonimleştirilir (yeni başvurulara uygulanır).</span>
        </label>
      </section>

      <div className="space-y-6">
        <section className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="text-base font-semibold">Bildirimler</h2>
          <Toggle checked={s.autoAcknowledge} onChange={(v) => setS({ ...s, autoAcknowledge: v })} label="Adaya otomatik 'başvurunuz alındı' e-postası" hint="E-posta şablonları sekmesindeki 'Başvuru alındı' şablonu kullanılır." />
          <Toggle checked={s.notifyInApp} onChange={(v) => setS({ ...s, notifyInApp: v })} label="Yeni başvuruda yöneticilere panel bildirimi" hint="Her yönetici kendi bildirim tercihinden ayrıca kapatabilir." />
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Yeni başvuruda e-posta gidecek adresler</span>
            <input className={inputCls} value={s.notifyEmails} onChange={(e) => setS({ ...s, notifyEmails: e.target.value })} placeholder="ik@kurum.com, mudur@kurum.com" />
            <span className="mt-1 block text-xs text-[var(--color-text-muted)]">Virgülle ayırın, en fazla 10 adres. Boş bırakılırsa e-posta bildirimi gönderilmez.</span>
          </label>
        </section>

        <section className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="text-base font-semibold">Değerlendirme kriterleri</h2>
          <p className="text-xs text-[var(--color-text-muted)]">Puan kartında 1–5 arası puanlanan başlıklar.</p>
          {s.scorecardCriteria.map((c, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={inputCls}
                value={c.label}
                onChange={(e) => setS({ ...s, scorecardCriteria: s.scorecardCriteria.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
              />
              <button type="button" aria-label="Kriteri sil" onClick={() => setS({ ...s, scorecardCriteria: s.scorecardCriteria.filter((_, j) => j !== i) })} className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-2">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {s.scorecardCriteria.length < 12 ? (
            <button type="button" onClick={() => setS({ ...s, scorecardCriteria: [...s.scorecardCriteria, { key: `k${Date.now().toString(36)}`, label: "" }] })} className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-primary)]">
              <Plus className="h-4 w-4" /> Kriter ekle
            </button>
          ) : null}
        </section>

        {msg ? <p className="text-sm" role="status">{msg}</p> : null}
        <button type="submit" disabled={pending} className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? "Kaydediliyor…" : "Ayarları kaydet"}
        </button>
      </div>
    </form>
  );
}
