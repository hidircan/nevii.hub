"use client";

/**
 * ÖNCELİK 4 (devam) — Paket Yönetimi + öğrenci ödeme profili. Öğrenci
 * detayında paket/süre/indirim/ödeme günü-türü/override düzenler; liste
 * fiyatı, indirim ve net tutarı canlı hesaplar (bkz.
 * src/lib/student-payment-profile.ts — Yoklama Takvimi ay kutusu ve
 * Ödemeler ekranı AYNI fonksiyonu kullanır, burada da aynı sonuç
 * gösterilir). Yalnızca SCHOOL_ADMIN/SUPER_ADMIN render edilir (çağıran
 * taraftan kontrol edilir); backend RBAC (updateStudentProfileTool) ikinci
 * savunma katmanıdır. Paket/indirim/override değişikliği GEÇMİŞ Payment
 * kayıtlarına asla dokunmaz — yalnızca bundan sonraki Yoklama Takvimi ay
 * kutusu varsayılan tutarını değiştirir.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionUpdateStudentProfile } from "@/lib/actions";
import { Button, Input, Label, Select } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import { activePackages, packageStatusLabel, priceForDuration } from "@/lib/packages";
import { computeStudentMonthlyAmount } from "@/lib/student-payment-profile";
import type { DiscountType, LessonDurationPreference, Package, StudentPaymentMethod } from "@/lib/types";

const DURATIONS: LessonDurationPreference[] = [30, 40, 50];
const PAYMENT_METHOD_LABELS: Record<StudentPaymentMethod, string> = {
  credit_card: "Kredi kartı",
  cash: "Nakit",
  transfer: "Havale/EFT",
};

export function StudentPaymentProfileEditor({
  studentId,
  packages,
  initialPackageId,
  initialDurationMinutes,
  initialPaymentMethod,
  initialPaymentDueDay,
  initialDiscountType,
  initialDiscountValue,
  initialOverrideAmount,
  onSaved,
}: {
  studentId: string;
  packages: Package[];
  initialPackageId?: string;
  initialDurationMinutes?: LessonDurationPreference;
  initialPaymentMethod?: StudentPaymentMethod;
  initialPaymentDueDay?: number;
  initialDiscountType?: DiscountType;
  initialDiscountValue?: number;
  initialOverrideAmount?: number;
  /** Called after a successful save (e.g. to collapse the section back to read-only). */
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [packageId, setPackageId] = useState(initialPackageId ?? "");
  const [durationMinutes, setDurationMinutes] = useState<LessonDurationPreference>(initialDurationMinutes ?? 30);
  const [paymentMethod, setPaymentMethod] = useState<StudentPaymentMethod | "">(initialPaymentMethod ?? "");
  const [paymentDueDay, setPaymentDueDay] = useState(initialPaymentDueDay ? String(initialPaymentDueDay) : "");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed" | "">(
    initialDiscountType === "percentage" || initialDiscountType === "fixed" ? initialDiscountType : ""
  );
  const [discountValue, setDiscountValue] = useState(initialDiscountValue !== undefined ? String(initialDiscountValue) : "");
  const [overrideAmount, setOverrideAmount] = useState(initialOverrideAmount !== undefined ? String(initialOverrideAmount) : "");

  // Pasif paket, önceden atanmışsa görünmeye devam eder — yeni öğrenciye
  // (veya bu öğrencinin BAŞKA bir arşivlenmiş pakete geçişine) seçilemez.
  const selectablePackages = useMemo(() => {
    const active = activePackages(packages);
    const current = packages.find((p) => p.id === initialPackageId);
    if (current && current.status === "archived" && !active.some((p) => p.id === current.id)) {
      return [current, ...active];
    }
    return active;
  }, [packages, initialPackageId]);

  const selectedPackage = packages.find((p) => p.id === packageId);
  const preview = useMemo(
    () =>
      computeStudentMonthlyAmount(
        {
          paymentAmount: overrideAmount.trim() === "" ? undefined : Number(overrideAmount),
          discountType: discountType || undefined,
          discountValue: discountValue.trim() === "" ? undefined : Number(discountValue),
        },
        selectedPackage,
        durationMinutes
      ),
    [selectedPackage, durationMinutes, discountType, discountValue, overrideAmount]
  );

  function onSave() {
    setError(null);
    setSaved(false);
    if (discountType && discountValue.trim() === "") {
      setError("İndirim değeri gerekli.");
      return;
    }
    if (!discountType && discountValue.trim() !== "") {
      setError("İndirim türü gerekli.");
      return;
    }
    startTransition(async () => {
      const result = await actionUpdateStudentProfile({
        studentId,
        packageId: packageId || undefined,
        lessonDurationMinutes: durationMinutes,
        paymentMethod: paymentMethod || undefined,
        paymentDueDay: paymentDueDay.trim() === "" ? undefined : Number(paymentDueDay),
        discountType: discountType || undefined,
        discountValue: discountValue.trim() === "" ? undefined : Number(discountValue),
        paymentAmount: overrideAmount.trim() === "" ? undefined : Number(overrideAmount),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Paket</Label>
          <Select value={packageId} onChange={(e) => setPackageId(e.target.value)}>
            <option value="">Seçilmedi (serbest metin paket kullanılıyor)</option>
            {selectablePackages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {p.status === "archived" ? ` (${packageStatusLabel(p.status)})` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Ders süresi</Label>
          <Select
            value={String(durationMinutes)}
            onChange={(e) => setDurationMinutes(Number(e.target.value) as LessonDurationPreference)}
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} dk{selectedPackage ? ` — ${formatMoney(priceForDuration(selectedPackage, d))}` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>İndirim türü</Label>
          <Select value={discountType} onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed" | "")}>
            <option value="">İndirim yok</option>
            <option value="percentage">Yüzde (%)</option>
            <option value="fixed">Sabit tutar (TL)</option>
          </Select>
        </div>
        <div>
          <Label>İndirim değeri</Label>
          <Input
            type="number"
            min={0}
            max={discountType === "percentage" ? 100 : undefined}
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            disabled={!discountType}
            placeholder={discountType === "percentage" ? "Örn. 10" : "Örn. 500"}
          />
        </div>
        <div>
          <Label>Ödeme günü</Label>
          <Input
            type="number"
            min={1}
            max={28}
            value={paymentDueDay}
            onChange={(e) => setPaymentDueDay(e.target.value)}
            placeholder="Ayın günü (1–28)"
          />
        </div>
        <div>
          <Label>Ödeme türü</Label>
          <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as StudentPaymentMethod | "")}>
            <option value="">Belirtilmemiş</option>
            {(Object.keys(PAYMENT_METHOD_LABELS) as StudentPaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label>Özel tutar (override, opsiyonel)</Label>
          <Input
            type="number"
            min={0}
            value={overrideAmount}
            onChange={(e) => setOverrideAmount(e.target.value)}
            placeholder="Boş bırakılırsa paket + indirimden hesaplanan tutar kullanılır"
          />
        </div>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm">
        <p className="font-semibold text-[var(--color-text)]">Ödeme profili özeti</p>
        <dl className="mt-1 space-y-0.5 text-xs text-[var(--color-text-muted)]">
          <div>Liste fiyatı: {preview.listPrice !== null ? formatMoney(preview.listPrice) : "Paket seçilmedi"}</div>
          {preview.discountAmount > 0 ? <div>İndirim: -{formatMoney(preview.discountAmount)}</div> : null}
          {preview.overrideAmount !== null ? (
            <div className="font-medium text-amber-800">
              Override uygulanıyor: {formatMoney(preview.overrideAmount)}
              {preview.discountedPrice !== null && preview.discountedPrice !== preview.overrideAmount ? (
                <> (paket/indirim tutarı yerine geçer — liste+indirim: {formatMoney(preview.discountedPrice)})</>
              ) : null}
            </div>
          ) : null}
        </dl>
        <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">
          Net aylık tutar: {preview.netAmount !== null ? formatMoney(preview.netAmount) : "—"}
        </p>
      </div>

      {error ? <p className="text-xs font-medium text-[#8b3a3a]">{error}</p> : null}
      {saved && !pending ? <p className="text-xs text-emerald-700">Kaydedildi.</p> : null}
      <Button type="button" disabled={pending} onClick={onSave}>
        {pending ? "Kaydediliyor…" : "Ödeme profilini kaydet"}
      </Button>
      <p className="text-[11px] text-[var(--color-text-muted)]">
        Not: bu değişiklik geçmiş ödeme kayıtlarını etkilemez — yalnızca Yoklama Takvimi&apos;ndeki bundan sonraki ay
        kutularının varsayılan tutarını günceller.
      </p>
    </div>
  );
}
