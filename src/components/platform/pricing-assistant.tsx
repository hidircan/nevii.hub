"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input } from "@/components/ui";

const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const tl = (n: number) => n.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

const DRIVERS: { feature: string; driver: string; unit: string; evidence: string; quota: string }[] = [
  { feature: "AI asistan", driver: "Sağlayıcı çağrısı + token", unit: "çağrı/ay", evidence: "Ölçülüyor (kurum bazlı çağrı/token kaydı)", quota: "Dahil çağrı kotası konabilir" },
  { feature: "SMS", driver: "Netgsm/Twilio gönderimi", unit: "adet/ay", evidence: "Ölçülmüyor (gönderim kaydı yok)", quota: "Ölçüm yokken kota satılmamalı" },
  { feature: "WhatsApp", driver: "Cloud API mesajı", unit: "adet/ay", evidence: "Ölçülmüyor (gönderim kaydı yok)", quota: "Ölçüm yokken kota satılmamalı" },
  { feature: "E-posta (SMTP)", driver: "Sabit posta servisi", unit: "sabit", evidence: "Değişken maliyet sayılmaz", quota: "Kota gerekmez" },
  { feature: "Evrak depolama", driver: "Supabase Storage GB", unit: "GB", evidence: "Doğrulanmadı (kurum bazlı ölçüm yok)", quota: "Ölçüm doğrulanmadan kota satılmamalı" },
  { feature: "Rapor / dışa aktarma", driver: "Fonksiyon CPU + veri aktarımı", unit: "adet/ay", evidence: "Kısmi (sorgu sayısı P0 raporunda, tutar yok)", quota: "Kota satılmamalı" },
  { feature: "Vercel / Supabase planı", driver: "Paylaşılan sabit gider", unit: "sabit/ay", evidence: "Fatura sahibinde (bu ekranda manuel girilir)", quota: "Kurum sayısına bölünür" },
];

/**
 * Maliyet bilinçli fiyatlandırma yardımcısı — taslak senaryo hesaplayıcı.
 * Kaydetmez, yayınlamaz, fiyat değiştirmez; "Öneriyi forma uygula" yalnız
 * editör alanlarını doldurur (kaydetme + gerekçe + yayın akışı aynen işler).
 * Cloud kullanım API'si sorgulanmaz; tüm girdiler manuel varsayımdır.
 */
export function PricingAssistant({ onApply }: { onApply: (monthlyTL: string, yearlyTL: string) => void }) {
  const [f, setF] = useState({
    vercel: "",
    supabase: "",
    otherFixed: "",
    tenants: "1",
    smsQty: "",
    smsUnit: "",
    waQty: "",
    waUnit: "",
    aiQty: "",
    aiUnit: "",
    gbQty: "",
    gbUnit: "",
    buffer: "25",
    margin: "",
    yearlyOff: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  const calc = useMemo(() => {
    const missing: string[] = [];
    const req = (raw: string, label: string) => {
      const v = num(raw);
      if (v === null) missing.push(label);
      return v ?? 0;
    };
    const fixed = req(f.vercel, "Vercel payı") + req(f.supabase, "Supabase payı") + (num(f.otherFixed) ?? 0);
    const n = Math.max(1, Math.floor(num(f.tenants) ?? 1));
    const variable =
      (num(f.smsQty) ?? 0) * (num(f.smsUnit) ?? 0) +
      (num(f.waQty) ?? 0) * (num(f.waUnit) ?? 0) +
      (num(f.aiQty) ?? 0) * (num(f.aiUnit) ?? 0) +
      (num(f.gbQty) ?? 0) * (num(f.gbUnit) ?? 0);
    if ((num(f.smsQty) ?? 0) > 0 && num(f.smsUnit) === null) missing.push("SMS birim fiyatı");
    if ((num(f.waQty) ?? 0) > 0 && num(f.waUnit) === null) missing.push("WhatsApp birim fiyatı");
    if ((num(f.aiQty) ?? 0) > 0 && num(f.aiUnit) === null) missing.push("AI çağrı birim fiyatı");
    if ((num(f.gbQty) ?? 0) > 0 && num(f.gbUnit) === null) missing.push("GB birim fiyatı");
    const base = fixed / n + variable;
    const buffer = (num(f.buffer) ?? 0) / 100;
    const high = base * (1 + buffer);
    const margin = num(f.margin);
    const off = (num(f.yearlyOff) ?? 0) / 100;
    const monthly = margin !== null && margin > 0 && margin < 100 ? high / (1 - margin / 100) : null;
    const yearly = monthly !== null ? monthly * 12 * (1 - Math.min(Math.max(off, 0), 0.9)) : null;
    return { base, high, monthly, yearly, missing };
  }, [f]);

  const label = "mb-1 block text-xs font-medium text-[var(--color-text)]";
  const pair = (qk: keyof typeof f, qLabel: string, uk: keyof typeof f, uLabel: string) => (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label htmlFor={`pa-${qk}`} className={label}>{qLabel}</label>
        <Input id={`pa-${qk}`} inputMode="decimal" placeholder="0" value={f[qk]} onChange={(e) => set(qk, e.target.value)} />
      </div>
      <div>
        <label htmlFor={`pa-${uk}`} className={label}>{uLabel}</label>
        <Input id={`pa-${uk}`} inputMode="decimal" placeholder="₺" value={f[uk]} onChange={(e) => set(uk, e.target.value)} />
      </div>
    </div>
  );

  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold">Fiyatlandırma yardımcısı (taslak senaryo)</h2>
      <p className="rounded-lg bg-[var(--color-warning-soft)] px-3 py-2 text-xs text-[var(--color-text)]">
        Bu hesap manuel varsayımlara dayanır; kesin ölçüm değildir. Kurum bazlı gerçek ölçüm bugün yalnız AI
        çağrılarında var. Boş bırakılan gider hesaba katılmaz ve aşağıda eksik olarak listelenir. Fiyat yalnız
        maliyet değildir: ürün değeri, destek ve sürdürülebilirlik için kararı siz verirsiniz.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="pa-vercel" className={label}>Vercel payı (₺/ay)</label>
          <Input id="pa-vercel" inputMode="decimal" placeholder="faturadan" value={f.vercel} onChange={(e) => set("vercel", e.target.value)} />
        </div>
        <div>
          <label htmlFor="pa-supabase" className={label}>Supabase payı (₺/ay)</label>
          <Input id="pa-supabase" inputMode="decimal" placeholder="faturadan" value={f.supabase} onChange={(e) => set("supabase", e.target.value)} />
        </div>
        <div>
          <label htmlFor="pa-tenants" className={label}>Giderin bölüneceği kurum sayısı</label>
          <Input id="pa-tenants" inputMode="numeric" value={f.tenants} onChange={(e) => set("tenants", e.target.value)} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {pair("smsQty", "SMS (adet/ay)", "smsUnit", "SMS birim (₺)")}
        {pair("waQty", "WhatsApp (adet/ay)", "waUnit", "WhatsApp birim (₺)")}
        {pair("aiQty", "AI çağrı (adet/ay)", "aiUnit", "AI çağrı birim (₺)")}
        {pair("gbQty", "Depolama (GB)", "gbUnit", "GB birim (₺/ay)")}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="pa-buffer" className={label}>Belirsizlik tamponu (%)</label>
          <Input id="pa-buffer" inputMode="decimal" value={f.buffer} onChange={(e) => set("buffer", e.target.value)} />
        </div>
        <div>
          <label htmlFor="pa-margin" className={label}>Hedef marj (%)</label>
          <Input id="pa-margin" inputMode="decimal" placeholder="örn. 70" value={f.margin} onChange={(e) => set("margin", e.target.value)} />
        </div>
        <div>
          <label htmlFor="pa-yearlyOff" className={label}>Yıllık indirim (%)</label>
          <Input id="pa-yearlyOff" inputMode="decimal" placeholder="örn. 15" value={f.yearlyOff} onChange={(e) => set("yearlyOff", e.target.value)} />
        </div>
      </div>
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm">
        <p>
          Tahmini kurum maliyeti: <strong>{tl(calc.base)} – {tl(calc.high)}</strong> / ay (KDV hariç, tampon dahil üst sınır)
        </p>
        {calc.monthly !== null && calc.yearly !== null ? (
          <p className="mt-1">
            Öneri (marj sonrası): <strong>{tl(calc.monthly)} / ay</strong> · <strong>{tl(calc.yearly)} / yıl</strong> (KDV hariç)
          </p>
        ) : (
          <p className="mt-1 text-[var(--color-text-muted)]">Öneri için hedef marj girin (0–100 arası).</p>
        )}
        {calc.missing.length > 0 ? (
          <p className="mt-1 text-xs text-[var(--color-warning)]">Hesaba katılmayan eksikler: {calc.missing.join(", ")}</p>
        ) : null}
      </div>
      <div>
        <Button
          variant="secondary"
          disabled={calc.monthly === null || calc.yearly === null}
          onClick={() => calc.monthly !== null && calc.yearly !== null && onApply(calc.monthly.toFixed(2), calc.yearly.toFixed(2))}
        >
          Öneriyi forma uygula
        </Button>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">Uygulama yalnız alanları doldurur; kaydetme ve yayın sizde.</p>
      </div>
      <details>
        <summary className="cursor-pointer text-xs text-[var(--color-text-muted)] hover:underline">
          Maliyet sürücüleri ve kanıt durumu
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b text-[var(--color-text-muted)]" style={{ borderColor: "var(--color-border)" }}>
                <th className="py-1 pr-2 font-medium">Özellik</th>
                <th className="py-1 pr-2 font-medium">Maliyet sürücüsü</th>
                <th className="py-1 pr-2 font-medium">Birim</th>
                <th className="py-1 pr-2 font-medium">Kanıt</th>
                <th className="py-1 font-medium">Kota önerisi</th>
              </tr>
            </thead>
            <tbody>
              {DRIVERS.map((d) => (
                <tr key={d.feature} className="border-b align-top" style={{ borderColor: "var(--color-border)" }}>
                  <td className="py-1 pr-2 font-medium">{d.feature}</td>
                  <td className="py-1 pr-2">{d.driver}</td>
                  <td className="py-1 pr-2">{d.unit}</td>
                  <td className="py-1 pr-2">{d.evidence}</td>
                  <td className="py-1">{d.quota}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
