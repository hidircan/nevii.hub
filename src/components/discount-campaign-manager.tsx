"use client";

/**
 * Paket & Kampanya Motoru — kampanya listesi + oluşturma + inline düzenleme.
 * Çakışma kuralı (stackingRule) Türkçe açıklamalarla seçilir; kullanım
 * sayacı/limit, geçerlilik tarihleri ve şube kapsamı satırda görünür.
 * Yazma yalnız SUPER_ADMIN (sunucu ayrıca uygular).
 */

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  actionCreateDiscountCampaign,
  actionDeleteDiscountCampaign,
  actionGetDiscountCampaignDeletionImpact,
  actionUpdateDiscountCampaign,
} from "@/lib/actions";
import { CriticalDeleteDialog } from "@/components/critical-delete-dialog";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { STACKING_RULE_LABELS, applyPercentDiscount } from "@/lib/discount-campaigns";
import type { CampaignStackingRule, DiscountCampaign } from "@/lib/types";

const KIND_LABELS: Record<DiscountCampaign["kind"], string> = {
  sibling: "Kardeş kampanyası",
};

const STACKING_OPTIONS: { value: CampaignStackingRule; label: string; hint: string }[] = [
  { value: "none", label: "Toplanamaz (önerilen)", hint: STACKING_RULE_LABELS.none },
  { value: "additive", label: "Toplanır", hint: `${STACKING_RULE_LABELS.additive} — toplam %100'ü geçemez` },
  { value: "override", label: "Ezer", hint: `${STACKING_RULE_LABELS.override} — en yüksek öncelikli tek başına kazanır` },
  { value: "yield", label: "Feragat eder", hint: STACKING_RULE_LABELS.yield },
];

function scopeLabel(c: DiscountCampaign, branchName: (id: string) => string): string {
  const multi = (c.applicableBranchIds ?? []).filter(Boolean);
  if (multi.length > 0) return multi.map(branchName).join(", ");
  if (c.branchId) return branchName(c.branchId);
  return "Tüm şubeler";
}

function validityLabel(c: DiscountCampaign): string {
  const f = c.validFrom ? c.validFrom.slice(0, 10) : null;
  const t = c.validTo ? c.validTo.slice(0, 10) : null;
  if (f && t) return `${f} → ${t}`;
  if (f) return `${f} itibarıyla`;
  if (t) return `${t} tarihine kadar`;
  return "Süresiz";
}

export function DiscountCampaignManager({
  campaigns,
  branches = [],
  canWrite,
  isSuperAdmin = false,
  /** İndirim etkisini örneklemek için — herhangi bir aktif paketin 30 dk fiyatı. */
  samplePrice,
}: {
  campaigns: DiscountCampaign[];
  branches?: { id: string; name: string }[];
  canWrite: boolean;
  isSuperAdmin?: boolean;
  samplePrice?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const canManage = canWrite && isSuperAdmin;
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;

  function toggleActive(campaign: DiscountCampaign) {
    const action = campaign.active ? "pasife alınırsa" : "aktif edilirse";
    if (campaign.active) {
      const confirmed = window.confirm(
        `"${campaign.name}" ${action} yeni kayıtlarda seçilemez; mevcut öğrencilerin indirimi değişmez. Devam edilsin mi?`
      );
      if (!confirmed) return;
    }
    startTransition(async () => {
      const result = await actionUpdateDiscountCampaign({
        campaignId: campaign.id,
        active: !campaign.active,
      });
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-1 font-semibold text-[var(--color-text)]">Kampanya listesi</h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          Kampanyalar öğrenci kaydında seçilir; indirimi çakışma motoru belirler. Pasif kampanya yeni kayıtta seçilemez
          ama yeniden aktif edilebilir; <strong>silinen</strong> kampanya geri açılamaz ve yalnız &quot;Silinmiş&quot;
          filtresinde görünür. İkisinde de mevcut öğrencilerin ücreti değişmez.
        </p>
        {!canWrite ? (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            &quot;Tüm kurumlar&quot; görünümündesiniz — kampanya eklemek/düzenlemek için üstteki kurum seçiciden tek bir
            kurum seçin.
          </p>
        ) : !isSuperAdmin ? (
          <p className="mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
            Kampanyaları görüntülüyorsunuz — ekleme/düzenleme yalnız kurum sahibi (SUPER_ADMIN) tarafından yapılır.
          </p>
        ) : null}
        {campaigns.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Henüz kampanya tanımlanmamış.</p>
        ) : (
          <div className="space-y-2">
            {campaigns.map((c) => {
              const limited = c.maxUsageCount != null && (c.usageCount ?? 0) >= c.maxUsageCount;
              return (
                <div key={c.id} className="rounded-lg border border-[var(--color-border)] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {c.displayId ? (
                          <span className="rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--color-text-muted)]">
                            {c.displayId}
                          </span>
                        ) : null}
                        <p className="font-medium text-[var(--color-text)]">{c.name}</p>
                        {c.deletedAt ? (
                          <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                            Silindi
                          </span>
                        ) : (
                          <Badge status={c.active ? "confirmed" : "archived"}>{c.active ? "Aktif" : "Pasif"}</Badge>
                        )}
                        <Badge status="scheduled">%{c.discountPercent}</Badge>
                        <span
                          className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800"
                          title={STACKING_RULE_LABELS[c.stackingRule ?? "none"]}
                        >
                          {STACKING_RULE_LABELS[c.stackingRule ?? "none"]}
                        </span>
                        {(c.priority ?? 0) > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                            Öncelik {c.priority}
                          </span>
                        ) : null}
                        {limited ? (
                          <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-800">
                            Limit doldu (soft)
                          </span>
                        ) : null}
                      </div>
                      {c.description ? (
                        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{c.description}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                        {KIND_LABELS[c.kind]} · Geçerlilik: {validityLabel(c)} · Şubeler: {scopeLabel(c, branchName)}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                        Kullanım: {c.usageCount ?? 0}
                        {c.maxUsageCount != null ? `/${c.maxUsageCount}` : " (sınırsız)"}
                        {samplePrice !== undefined
                          ? ` · örn. ${samplePrice.toLocaleString("tr-TR")} ₺ → ${applyPercentDiscount(
                              samplePrice,
                              c.discountPercent
                            ).toLocaleString("tr-TR")} ₺`
                          : ""}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                        Oluşturan: {c.createdByUserId ?? c.createdBy} ·{" "}
                        {new Date(c.createdAt).toLocaleDateString("tr-TR")}
                      </p>
                      {c.deletedAt ? (
                        <p className="mt-0.5 text-[11px] text-rose-700">
                          Silindi: {new Date(c.deletedAt).toLocaleDateString("tr-TR")} · Gerekçe: {c.deletionReason ?? "—"} · Yeni
                          kayıtta seçilemez; bu kampanyayla kaydolmuş öğrencilerin ücreti değişmedi.
                        </p>
                      ) : null}
                    </div>
                    {canManage && !c.deletedAt ? (
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingId(editingId === c.id ? null : c.id)}
                          className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]"
                        >
                          {editingId === c.id ? "Kapat" : "Düzenle"}
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => toggleActive(c)}
                          className="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-800 hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
                        >
                          {c.active ? "Pasife al" : "Aktif et"}
                        </button>
                        <CriticalDeleteDialog
                          triggerLabel="Sil"
                          title={`"${c.name}" kampanyasını sil`}
                          meaning="Kampanya silinir: yeni kayıtta seçilemez, düzenlenemez ve yeniden etkinleştirilemez. Bu kampanyayla kaydolmuş öğrencilerin ücreti, sözleşmeleri ve tahsilatları DEĞİŞMEZ; kampanya raporunda geçmiş kayıtlar görünmeye devam eder. Yalnız geçici olarak kapatmak istiyorsanız 'Pasife al'ı kullanın."
                          confirmationName={c.name}
                          confirmationLabel="Onay için kampanya adını aynen yazın"
                          submitLabel="Kampanyayı sil"
                          loadImpact={async () => {
                            const res = await actionGetDiscountCampaignDeletionImpact(c.id);
                            if (!res.ok) return res;
                            const d = res.data;
                            return {
                              ok: true,
                              data: {
                                lines: [
                                  ["Kampanya", d.name],
                                  ["Durum", d.active ? "Aktif" : "Pasif"],
                                  ["Bu kampanyayla kayıtlı öğrenci", `${d.studentCount} (aktif ${d.activeStudentCount})`],
                                  ["Kullanım sayacı", String(d.usageCount)],
                                  ["Geçmiş ücret/sözleşme", "Değişmez"],
                                  ["Yeni kayıtta", "Seçilemez"],
                                ],
                                allowed: true,
                                criticalPasswordConfigured: d.criticalPasswordConfigured,
                              },
                            };
                          }}
                          onSubmit={async (input) => {
                            const res = await actionDeleteDiscountCampaign({
                              campaignId: c.id,
                              expectedUpdatedAt: c.updatedAt,
                              ...input,
                            });
                            if (!res.ok) return res;
                            if (editingId === c.id) setEditingId(null);
                            router.refresh();
                            return { ok: true };
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                  {editingId === c.id && canManage ? (
                    <CampaignEditForm campaign={c} branches={branches} onSaved={() => router.refresh()} />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {canManage ? <CampaignCreateForm branches={branches} /> : null}

      {formError ? (
        <p className="text-xs font-medium text-[var(--color-danger)]" role="alert">
          {formError}
        </p>
      ) : null}
    </div>
  );
}

function BranchMultiSelect({
  branches,
  selected,
  onChange,
}: {
  branches: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  if (branches.length === 0) return null;
  return (
    <div>
      <Label>Geçerli şubeler (hiçbiri seçilmezse tüm şubeler)</Label>
      <div className="space-y-1 rounded-[var(--radius-md)] border border-[var(--color-border)] p-2.5">
        {branches.map((b) => (
          <label key={b.id} className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={selected.includes(b.id)}
              onChange={(e) => onChange(e.target.checked ? [...selected, b.id] : selected.filter((x) => x !== b.id))}
            />
            {b.name}
          </label>
        ))}
      </div>
    </div>
  );
}

function CampaignCreateForm({ branches }: { branches: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [percent, setPercent] = useState("10");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [stackingRule, setStackingRule] = useState<CampaignStackingRule>("none");
  const [priority, setPriority] = useState("0");
  const [maxUsageCount, setMaxUsageCount] = useState("");

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await actionCreateDiscountCampaign({
        name,
        description: description.trim() || undefined,
        kind: "sibling",
        discountPercent: Number(percent),
        validFrom: validFrom || undefined,
        validTo: validTo || undefined,
        applicableBranchIds: branchIds.length > 0 ? branchIds : undefined,
        stackingRule,
        priority: Number(priority) || 0,
        maxUsageCount: maxUsageCount.trim() === "" ? undefined : Number(maxUsageCount),
      });
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      setName("");
      setDescription("");
      setPercent("10");
      setValidFrom("");
      setValidTo("");
      setBranchIds([]);
      setStackingRule("none");
      setPriority("0");
      setMaxUsageCount("");
      router.refresh();
    });
  }

  return (
    <Card>
      <h2 className="mb-3 font-semibold text-[var(--color-text)]">Yeni kampanya</h2>
      <form onSubmit={onCreate} className="space-y-3">
        <div>
          <Label>Kampanya adı</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. Erken kayıt indirimi" required />
        </div>
        <div>
          <Label>Açıklama (opsiyonel)</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Kampanyanın koşulları" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <Label>İndirim oranı (%)</Label>
            <Input type="number" min={1} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} required />
          </div>
          <div>
            <Label>Öncelik (yüksek önce)</Label>
            <Input type="number" min={0} value={priority} onChange={(e) => setPriority(e.target.value)} />
          </div>
          <div>
            <Label>Kullanım limiti (boş = sınırsız)</Label>
            <Input
              type="number"
              min={1}
              value={maxUsageCount}
              onChange={(e) => setMaxUsageCount(e.target.value)}
              placeholder="Sınırsız"
            />
          </div>
        </div>
        <p className="-mt-1 text-[11px] text-[var(--color-text-muted)]">
          Limit dolunca kampanya kapanmaz — kayıtta yalnızca uyarı üretilir.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <Label>Geçerlilik başlangıcı (boş = hemen)</Label>
            <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </div>
          <div>
            <Label>Geçerlilik bitişi (boş = süresiz)</Label>
            <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Çakışma kuralı</Label>
          <Select value={stackingRule} onChange={(e) => setStackingRule(e.target.value as CampaignStackingRule)}>
            {STACKING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} — {o.hint}
              </option>
            ))}
          </Select>
        </div>
        <BranchMultiSelect branches={branches} selected={branchIds} onChange={setBranchIds} />
        {formError ? (
          <p className="text-xs font-medium text-[var(--color-danger)]" role="alert">
            {formError}
          </p>
        ) : null}
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Kaydediliyor…" : "Kampanyayı oluştur"}
        </Button>
      </form>
    </Card>
  );
}

function CampaignEditForm({
  campaign,
  branches,
  onSaved,
}: {
  campaign: DiscountCampaign;
  branches: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description ?? "");
  const [percent, setPercent] = useState(String(campaign.discountPercent));
  const [validFrom, setValidFrom] = useState((campaign.validFrom ?? "").slice(0, 10));
  const [validTo, setValidTo] = useState((campaign.validTo ?? "").slice(0, 10));
  const [branchIds, setBranchIds] = useState<string[]>([
    ...((campaign.applicableBranchIds?.length ? campaign.applicableBranchIds : campaign.branchId ? [campaign.branchId] : []) as string[]),
  ]);
  const [stackingRule, setStackingRule] = useState<CampaignStackingRule>(campaign.stackingRule ?? "none");
  const [priority, setPriority] = useState(String(campaign.priority ?? 0));
  const [maxUsageCount, setMaxUsageCount] = useState(
    campaign.maxUsageCount != null ? String(campaign.maxUsageCount) : ""
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await actionUpdateDiscountCampaign({
        campaignId: campaign.id,
        name,
        description: description.trim() || undefined,
        discountPercent: Number(percent),
        validFrom: validFrom || undefined,
        validTo: validTo || undefined,
        branchId: null,
        applicableBranchIds: branchIds,
        stackingRule,
        priority: Number(priority) || 0,
        maxUsageCount: maxUsageCount.trim() === "" ? null : Number(maxUsageCount),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onSaved();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-2 border-t border-[var(--color-border)] pt-3">
      <div>
        <Label>Ad</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <Label>Açıklama</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <Label>İndirim oranı (%)</Label>
          <Input type="number" min={1} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} />
        </div>
        <div>
          <Label>Öncelik</Label>
          <Input type="number" min={0} value={priority} onChange={(e) => setPriority(e.target.value)} />
        </div>
        <div>
          <Label>Kullanım limiti (boş = sınırsız)</Label>
          <Input type="number" min={1} value={maxUsageCount} onChange={(e) => setMaxUsageCount(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label>Geçerlilik başlangıcı</Label>
          <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </div>
        <div>
          <Label>Geçerlilik bitişi</Label>
          <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Çakışma kuralı</Label>
        <Select value={stackingRule} onChange={(e) => setStackingRule(e.target.value as CampaignStackingRule)}>
          {STACKING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} — {o.hint}
            </option>
          ))}
        </Select>
      </div>
      <BranchMultiSelect branches={branches} selected={branchIds} onChange={setBranchIds} />
      {error ? <p className="text-xs font-medium text-[var(--color-danger)]">{error}</p> : null}
      <p className="text-[11px] text-[var(--color-text-muted)]">
        Not: oran/kural değişikliği geçmiş kayıtları etkilemez — mevcut öğrencilerin indirimi aynen kalır, yalnızca yeni
        kayıtlar yeni kuraldan yararlanır.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Kaydediliyor…" : "Kaydet"}
      </Button>
    </form>
  );
}
