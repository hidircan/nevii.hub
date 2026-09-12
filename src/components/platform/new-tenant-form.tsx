"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { callApi } from "@/components/platform/api";

const DAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

/**
 * Kurum taslağı oluşturur (lifecycle=draft). Kurulum ayrı, açık bir adımdır
 * (kurum detayında "Kurumu kur"). Idempotency anahtarı form başına tektir →
 * çift tıklama/yeniden gönderim ikinci kurum üretmez.
 */
type PlanOption = { key: string; label: string; limits: { students: number | null; users: number | null; branches: number | null } };

const lim = (n: number | null, unit: string) => (n === null ? `sınırsız/özel ${unit}` : `${n.toLocaleString("tr-TR")} ${unit}`);

/** Paketler yayındaki katalogdan gelir (yalnız aktif, legacy olmayan). */
export function NewTenantForm({ plans }: { plans: PlanOption[] }) {
  const router = useRouter();
  const [idempotencyKey] = useState(() => `wiz_${crypto.randomUUID()}`);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    name: "",
    slug: "",
    contactEmail: "",
    phone: "",
    planKey: plans[0]?.key ?? "starter",
    branchName: "Merkez",
    branchAddress: "",
    branchPhone: "",
    branchCity: "",
    workingDays: [1, 2, 3, 4, 5, 6],
    lessonDurationMinutes: 40,
    ownerName: "",
    ownerEmail: "",
  });
  const set = (k: keyof typeof f, v: unknown) => setF((prev) => ({ ...prev, [k]: v }));

  async function submit() {
    setPending(true);
    setError(null);
    const res = await callApi<{ tenant: { tenantId: string } }>("/api/v1/platform/tenants", "POST", {
      name: f.name,
      slug: f.slug || undefined,
      contactEmail: f.contactEmail,
      phone: f.phone,
      planKey: f.planKey,
      idempotencyKey,
      firstBranch: {
        name: f.branchName,
        address: f.branchAddress,
        phone: f.branchPhone,
        city: f.branchCity || undefined,
        workingDays: f.workingDays,
        lessonDurationMinutes: Number(f.lessonDurationMinutes),
      },
      owner: { name: f.ownerName, email: f.ownerEmail },
    });
    setPending(false);
    if (!res.ok) {
      const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
      const fields = details?.fieldErrors ? Object.keys(details.fieldErrors).join(", ") : "";
      return setError(`${res.error.message}${fields ? ` (${fields})` : ""}`);
    }
    router.push(`/platform/kurumlar/${res.data.tenant.tenantId}`);
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-3 text-sm font-semibold">1 · Kurum</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Kurum adı</span><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Slug (boşsa addan üretilir)</span><Input value={f.slug} onChange={(e) => set("slug", e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">İletişim e-postası</span><Input type="email" value={f.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Telefon</span><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
          <div>
            <Label>Paket</Label>
            <Select aria-label="Paket" value={f.planKey} onChange={(e) => set("planKey", e.target.value)}>
              {plans.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label} — {lim(p.limits.students, "öğrenci")} · {lim(p.limits.users, "kullanıcı")} · {lim(p.limits.branches, "şube")}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>
      <Card>
        <h2 className="mb-3 text-sm font-semibold">2 · İlk şube</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Şube adı</span><Input value={f.branchName} onChange={(e) => set("branchName", e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Şehir</span><Input value={f.branchCity} onChange={(e) => set("branchCity", e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Adres</span><Input value={f.branchAddress} onChange={(e) => set("branchAddress", e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Şube telefonu</span><Input value={f.branchPhone} onChange={(e) => set("branchPhone", e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Ders süresi (dk)</span><Input type="number" value={String(f.lessonDurationMinutes)} onChange={(e) => set("lessonDurationMinutes", e.target.value)} /></label>
          <div>
            <Label>Çalışma günleri</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <label key={d} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={f.workingDays.includes(i)}
                    onChange={(e) =>
                      set("workingDays", e.target.checked ? [...f.workingDays, i].sort() : f.workingDays.filter((x) => x !== i))
                    }
                  />
                  {d}
                </label>
              ))}
            </div>
          </div>
        </div>
      </Card>
      <Card>
        <h2 className="mb-3 text-sm font-semibold">3 · Kurum sahibi</h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          Kurum sahibi yalnız bu kurumda yetkilidir; platform yöneticisi olamaz. Kurulumda tek seferlik davet bağlantısı üretilir
          (e-posta gönderilmez).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Ad soyad</span><Input value={f.ownerName} onChange={(e) => set("ownerName", e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">E-posta</span><Input type="email" value={f.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} /></label>
        </div>
      </Card>
      {error ? <p role="alert" className="text-sm text-[var(--color-danger)]">{error}</p> : null}
      <Button disabled={pending || !f.name} onClick={() => void submit()}>
        {pending ? "Kaydediliyor…" : "Taslağı oluştur"}
      </Button>
    </div>
  );
}
