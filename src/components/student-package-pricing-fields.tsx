"use client";

/**
 * Package C + Paket & Kampanya Motoru — öğrenci create formunda paket + süre +
 * kampanya/manuel indirim seçimi ve canlı nihai ücret önizlemesi. Hesap TEK
 * merkez helper'lardan (`computeMonthlyFee` + `resolveCampaignStack`, saf,
 * I/O yok) gelir; sunucu (createStudentTool) AYNI sonucu tekrar hesaplar ve
 * kaydeder — istemciden gelen bir "nihai tutar" asla doğrudan güvenilip
 * kaydedilmez. Paket seçilmediyse eski serbest `monthlyFee` girişi (legacy)
 * aynen görünür.
 *
 * Bug #1 düzeltmesi (2026-09-28): bu bileşenin ürettiği nihai ücret ARTIK
 * yalnızca gizli bir input'a yazılmakla kalmaz — `onPricingChange` ile üst
 * forma da bildirilir. Üst formun önizlemesi (`recomputePreview`) FormData'daki
 * bayat gizli değeri DEĞİL bu bildirimi okur; %100 indirimde önizleme bir
 * önceki değeri göstermez, 0 gösterir.
 */

import { useEffect, useMemo, useState } from "react";
import { Input, Label, Select } from "@/components/ui";
import { computeDiscountAmount, computeMonthlyFee } from "@/lib/packages";
import { resolveCampaignStack, STACKING_RULE_LABELS } from "@/lib/discount-campaigns";
import type { CampaignStackingRule } from "@/lib/types";
import { sanitizeAmountInput } from "@/lib/amount-input";
import { LESSON_DURATION_OPTIONS, DEFAULT_LESSON_DURATION_MINUTES } from "@/lib/lesson-duration";

export type PricingPackageOption = {
  id: string;
  title: string;
  price30Min: number;
  price40Min: number;
  price50Min: number;
  defaultDurationMinutes?: number;
  defaultPaymentDueDay?: number;
  monthlyLessonCount?: number;
};

export type PricingCampaignOption = {
  id: string;
  name: string;
  displayId?: string;
  discountPercent: number;
  stackingRule: CampaignStackingRule;
  priority: number;
  branchId?: string;
  applicableBranchIds?: string[];
  validFrom?: string;
  validTo?: string;
  active: boolean;
  maxUsageCount?: number;
  usageCount: number;
  createdAt: string;
};

/** Üst forma bildirilen fiyat durumu — önizleme ve gizli packageName buradan beslenir. */
export type PricingChange = {
  packageId: string;
  packageTitle: string;
  /** null = paket seçilmedi (legacy serbest ücret yolu). */
  finalMonthlyFee: number | null;
  campaignIds: string[];
};

/** Paket seçiminde üst formdaki alanlara uygulanacak öneriler (kullanıcı değiştirebilir). */
export type PackageAutofill = {
  weeklyLessonCount?: number;
  paymentDueDay?: number;
};

function formatTL(amount: number): string {
  return `${amount.toLocaleString("tr-TR")} TL`;
}

function campaignScopeLabel(c: PricingCampaignOption): string {
  const multi = (c.applicableBranchIds ?? []).filter(Boolean);
  if (!c.branchId && multi.length === 0) return "Tüm şubeler";
  if (multi.length > 0) return `${multi.length} şube`;
  return "Tek şube";
}

/** Paket bağımsız kampanya seçim bölümü — paketli ve paketsiz akışta AYNI bileşen. */
function CampaignSection({
  activeCampaigns,
  selectedCampaignIds,
  onToggle,
  hasPackage,
  excludedNote,
}: {
  activeCampaigns: PricingCampaignOption[];
  selectedCampaignIds: string[];
  onToggle: (id: string) => void;
  hasPackage: boolean;
  excludedNote: string | null;
}) {
  return (
    <div>
      <Label>Kampanyalar (opsiyonel — çoklu seçilebilir)</Label>
      {activeCampaigns.length === 0 ? (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
          Aktif kampanya yok — önce{" "}
          <a href="/panel/paketler?tab=kampanyalar" className="font-medium text-[var(--color-primary)] underline">
            Kampanyalar ekranından
          </a>{" "}
          bir kampanya oluşturun.
        </p>
      ) : (
        <>
          <div className="space-y-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5">
            {activeCampaigns.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="campaignIds"
                  value={c.id}
                  checked={selectedCampaignIds.includes(c.id)}
                  onChange={() => onToggle(c.id)}
                  className="mt-0.5"
                />
                <span className="flex-1">
                  <span className="font-medium text-[var(--color-text)]">
                    {c.displayId ? `${c.displayId} · ` : ""}
                    {c.name}
                  </span>{" "}
                  <span className="text-[var(--color-text-muted)]">
                    · %{c.discountPercent} · {STACKING_RULE_LABELS[c.stackingRule]} · {campaignScopeLabel(c)}
                    {c.maxUsageCount != null ? ` · ${c.usageCount}/${c.maxUsageCount} kullanım` : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            {hasPackage
              ? "Kampanya seçiliyken manuel indirim kapatılır — indirimi kampanya motoru belirler. "
              : "Paket seçilmediyse kampanya aşağıdaki serbest ücrete uygulanır. "}
            Şube ve tarih uygunluğu kayıtta sunucuda yeniden doğrulanır.
          </p>
          {excludedNote ? (
            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">{excludedNote}</p>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Serbest ücret girişi + (kampanyalıysa) nihai ücret önizlemesi. Gönderilen değer TABAN kalır. */
function LegacyFeeField({
  value,
  onChange,
  preview,
}: {
  value: string;
  onChange: (v: string) => void;
  preview: { baseMonthlyFee: number; discountAmount: number; finalMonthlyFee: number } | null;
}) {
  return (
    <div className="space-y-2">
      <div>
        <Label>Aylık ücret (serbest — paket seçilmediyse)</Label>
        <Input
          name="monthlyFee"
          inputMode="numeric"
          placeholder="Örn. 3000"
          value={value}
          onChange={(e) => onChange(sanitizeAmountInput(e.target.value))}
        />
      </div>
      {preview ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-muted)]">Serbest ücret</span>
            <span className="font-medium">{formatTL(preview.baseMonthlyFee)}</span>
          </div>
          {preview.discountAmount > 0 ? (
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
              <span>İndirim (kampanya)</span>
              <span className="font-medium">−{formatTL(preview.discountAmount)}</span>
            </div>
          ) : null}
          <div className="mt-1 flex items-center justify-between border-t border-[var(--color-border)] pt-1 text-base">
            <span className="font-semibold text-[var(--color-text)]">Nihai aylık ücret</span>
            <span className="font-bold text-[var(--color-text)]">{formatTL(preview.finalMonthlyFee)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function StudentPackagePricingFields({
  packages,
  campaigns = [],
  defaultMonthlyFee,
  initialPackageId = "",
  initialDiscountType = "",
  initialDiscountValue = "",
  initialCampaignIds = [],
  initialPaymentDueDay = "",
  onPricingChange,
  onPackageAutofill,
}: {
  packages: PricingPackageOption[];
  campaigns?: PricingCampaignOption[];
  defaultMonthlyFee?: number;
  initialPackageId?: string;
  initialDiscountType?: string;
  initialDiscountValue?: string;
  initialCampaignIds?: string[];
  initialPaymentDueDay?: string;
  onPricingChange?: (p: PricingChange) => void;
  onPackageAutofill?: (a: PackageAutofill) => void;
}) {
  const [packageId, setPackageId] = useState(initialPackageId);
  const [duration, setDuration] = useState<number>(DEFAULT_LESSON_DURATION_MINUTES);
  const [discountType, setDiscountType] = useState<"" | "percent" | "amount">(
    initialDiscountType === "percent" || initialDiscountType === "amount" ? initialDiscountType : ""
  );
  const [discountValue, setDiscountValue] = useState(initialDiscountValue);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>(initialCampaignIds);
  const [paymentDueDay, setPaymentDueDay] = useState(initialPaymentDueDay);
  // Metin olarak tutulur — bkz. sanitizeAmountInput (sıfır silinemiyordu).
  const [legacyMonthlyFee, setLegacyMonthlyFee] = useState(defaultMonthlyFee ? String(defaultMonthlyFee) : "");

  const selectedPackage = packages.find((p) => p.id === packageId);
  const activeCampaigns = useMemo(() => campaigns.filter((c) => c.active), [campaigns]);

  const selectedCampaigns = useMemo(
    () => activeCampaigns.filter((c) => selectedCampaignIds.includes(c.id)),
    [activeCampaigns, selectedCampaignIds]
  );

  // Kampanya çakışması istemcide de AYNI saf motorla çözülür (sunucu yeniden doğrular).
  const stackResolution = useMemo(
    () =>
      resolveCampaignStack(
        selectedCampaigns.map((c) => ({
          ...c,
          kind: "sibling" as const,
          createdBy: "",
          updatedAt: c.createdAt,
        }))
      ),
    [selectedCampaigns]
  );
  const campaignMode = selectedCampaigns.length > 0;

  const computation = useMemo(() => {
    if (!selectedPackage) return null;
    if (campaignMode) {
      return computeMonthlyFee({
        pkg: selectedPackage,
        durationMinutes: duration as 30 | 40 | 50,
        discountType: "percent",
        discountValue: stackResolution.effectivePercent,
      });
    }
    const dv = discountType ? Number(discountValue) : undefined;
    return computeMonthlyFee({
      pkg: selectedPackage,
      durationMinutes: duration as 30 | 40 | 50,
      discountType: discountType || undefined,
      discountValue: dv && Number.isFinite(dv) && dv > 0 ? dv : undefined,
    });
  }, [selectedPackage, duration, discountType, discountValue, campaignMode, stackResolution.effectivePercent]);

  // Paketsiz (legacy) + kampanya önizlemesi — sunucuyla AYNI tek formül
  // (`computeDiscountAmount`). Gönderilen `monthlyFee` TABAN kalır, nihai
  // ücreti sunucu hesaplar; burası yalnız önizleme + üst form bildirimidir.
  const legacyCampaignComputation = useMemo(() => {
    if (selectedPackage || !campaignMode) return null;
    const base = Number(legacyMonthlyFee);
    if (!Number.isInteger(base) || base < 0) return null;
    const discountAmount = computeDiscountAmount(base, "percent", stackResolution.effectivePercent);
    return { baseMonthlyFee: base, discountAmount, finalMonthlyFee: Math.max(base - discountAmount, 0) };
  }, [selectedPackage, campaignMode, legacyMonthlyFee, stackResolution.effectivePercent]);

  function selectPackage(id: string) {
    setPackageId(id);
    // Kampanya paket bağımsızdır — paket kaldırılınca seçim KORUNUR,
    // indirim serbest ücrete uygulanır.
    const pkg = packages.find((p) => p.id === id);
    if (!pkg) return;
    if (pkg.defaultDurationMinutes === 30 || pkg.defaultDurationMinutes === 40 || pkg.defaultDurationMinutes === 50) {
      setDuration(pkg.defaultDurationMinutes);
    }
    // weeklyLessonCount önerisi: paketin aylık ders adedi ÷ 4 (1–2 aralığına kısılır, formun şema sınırları).
    const weekly =
      pkg.monthlyLessonCount && pkg.monthlyLessonCount > 0
        ? Math.min(2, Math.max(1, Math.round(pkg.monthlyLessonCount / 4)))
        : undefined;
    if (pkg.defaultPaymentDueDay) setPaymentDueDay(String(pkg.defaultPaymentDueDay));
    onPackageAutofill?.({ weeklyLessonCount: weekly, paymentDueDay: pkg.defaultPaymentDueDay });
  }

  function toggleCampaign(id: string) {
    setSelectedCampaignIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  // Üst forma bildirim — önizleme bayat FormData'yı değil bunu okur (Bug #1).
  const notifiedFinal = selectedPackage
    ? (computation?.finalMonthlyFee ?? 0)
    : (legacyCampaignComputation?.finalMonthlyFee ?? null);
  useEffect(() => {
    onPricingChange?.({
      packageId,
      packageTitle: selectedPackage?.title ?? "",
      finalMonthlyFee: notifiedFinal,
      campaignIds: selectedCampaignIds,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageId, notifiedFinal, selectedCampaignIds.join(",")]);

  const excludedNote =
    stackResolution.excluded.length > 0
      ? stackResolution.excluded.map((e) => `"${e.campaign.name}" uygulanmadı: ${e.reason}`).join(" ")
      : null;

  if (packages.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Henüz aktif paket tanımlanmamış — paketli kayıt için önce{" "}
          <a href="/panel/paketler" className="underline">
            Paketler ekranından
          </a>{" "}
          bir paket oluşturun. Dilerseniz aşağıdaki serbest aylık ücretle paketsiz kayıt açabilirsiniz.
        </div>
        <CampaignSection
          activeCampaigns={activeCampaigns}
          selectedCampaignIds={selectedCampaignIds}
          onToggle={toggleCampaign}
          hasPackage={false}
          excludedNote={excludedNote}
        />
        <LegacyFeeField
          value={legacyMonthlyFee}
          onChange={setLegacyMonthlyFee}
          preview={legacyCampaignComputation}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>Paket</Label>
        <Select name="packageId" value={packageId} onChange={(e) => selectPackage(e.target.value)}>
          <option value="">Seçilmedi (yalnızca aşağıdaki serbest aylık ücret kullanılır)</option>
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} — 30dk {p.price30Min.toLocaleString("tr-TR")} TL / 40dk{" "}
              {p.price40Min.toLocaleString("tr-TR")} TL / 50dk {p.price50Min.toLocaleString("tr-TR")} TL
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label>Ders süresi</Label>
        <Select name="lessonDurationMinutes" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
          {LESSON_DURATION_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d} dk
            </option>
          ))}
        </Select>
      </div>

      {/* Kampanyalar HER ZAMAN paket seçiminin altında, ayrı seçilebilir bölüm;
          paket bağımsızdır — paketsizken serbest ücrete uygulanır. */}
      <CampaignSection
        activeCampaigns={activeCampaigns}
        selectedCampaignIds={selectedCampaignIds}
        onToggle={toggleCampaign}
        hasPackage={!!selectedPackage}
        excludedNote={selectedPackage ? null : excludedNote}
      />

      {selectedPackage ? (
        <>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>İndirim türü (opsiyonel)</Label>
              <Select
                name="discountType"
                value={campaignMode ? "" : discountType}
                disabled={campaignMode}
                onChange={(e) => setDiscountType(e.target.value as "" | "percent" | "amount")}
              >
                <option value="">{campaignMode ? "Kampanya uygulanıyor" : "İndirim yok"}</option>
                <option value="percent">Yüzde (%)</option>
                <option value="amount">Tutar (TL)</option>
              </Select>
            </div>
            <div>
              <Label>İndirim değeri</Label>
              <Input
                name="discountValue"
                type="number"
                min={0}
                className="no-spinner"
                disabled={campaignMode || !discountType}
                value={campaignMode ? String(stackResolution.effectivePercent) : discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === "percent" ? "Örn. 10" : "Örn. 300"}
              />
            </div>
          </div>
          {campaignMode ? (
            <>
              <input type="hidden" name="discountType" value="" />
              {stackResolution.excluded.length > 0 ? (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  {stackResolution.excluded.map((e) => `"${e.campaign.name}" uygulanmadı: ${e.reason}`).join(" ")}
                </p>
              ) : null}
            </>
          ) : null}

          <div>
            <Label>Ödeme günü (1–28, opsiyonel — paketten önerilir, değiştirilebilir)</Label>
            <Input
              name="paymentDueDay"
              inputMode="numeric"
              placeholder="Örn. 5"
              value={paymentDueDay}
              onChange={(e) => setPaymentDueDay(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
            />
          </div>

          {/* Server tarafında yeniden hesaplanacağı için burada yalnız önizleme — kaydedilecek değer server'dan gelir. */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)]">Liste fiyatı</span>
              <span className="font-medium">{formatTL(computation?.baseMonthlyFee ?? 0)}</span>
            </div>
            {computation && computation.discountAmount > 0 ? (
              <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
                <span>İndirim{campaignMode ? " (kampanya)" : ""}</span>
                <span className="font-medium">−{formatTL(computation.discountAmount)}</span>
              </div>
            ) : null}
            <div className="mt-1 flex items-center justify-between border-t border-[var(--color-border)] pt-1 text-base">
              <span className="font-semibold text-[var(--color-text)]">Nihai aylık ücret</span>
              <span className="font-bold text-[var(--color-text)]">{formatTL(computation?.finalMonthlyFee ?? 0)}</span>
            </div>
          </div>
          {/* Legacy monthlyFee alanı zorunlu şema alanı — paket seçiliyken gizli, hesaplanan değerle senkron; server yine de kendi hesabını kullanır. */}
          <input type="hidden" name="monthlyFee" value={computation?.finalMonthlyFee ?? 0} />
        </>
      ) : (
        <LegacyFeeField
          value={legacyMonthlyFee}
          onChange={setLegacyMonthlyFee}
          preview={legacyCampaignComputation}
        />
      )}
    </div>
  );
}
