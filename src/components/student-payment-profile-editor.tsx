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
import type { DiscountType, LessonDurationPreference, Package, PaymentDueRange, StudentPaymentMethod } from "@/lib/types";

type RangeRow = { key: string; start: string; end: string };
function newRangeRow(start = "", end = ""): RangeRow {
  return { key: crypto.randomUUID(), start, end };
}

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
  initialPaymentDueRanges,
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
  /** Faz 1A — birden fazla ödeme günü aralığı; boşsa "hiç ayarlanmamış" demektir. */
  initialPaymentDueRanges?: PaymentDueRange[];
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
  // Fiyat önizlemesi için süre; yoksa 30 dk varsayımıyla gösterilir (kayıt süreyi değiştirmez).
  const durationMinutes: LessonDurationPreference = initialDurationMinutes ?? 30;
  const [paymentMethod, setPaymentMethod] = useState<StudentPaymentMethod | "">(initialPaymentMethod ?? "");
  const [dueRanges, setDueRanges] = useState<RangeRow[]>(() =>
    initialPaymentDueRanges && initialPaymentDueRanges.length > 0
      ? initialPaymentDueRanges.map((r) => newRangeRow(String(r.start), String(r.end)))
      : [newRangeRow()]
  );
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

  function addDueRange() {
    setDueRanges((rows) => [...rows, newRangeRow()]);
  }
  function removeDueRange(key: string) {
    setDueRanges((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== key) : rows));
  }
  function updateDueRange(key: string, field: "start" | "end", value: string) {
    setDueRanges((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

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

    const filledRows = dueRanges.filter((r) => r.start.trim() !== "" || r.end.trim() !== "");
    const parsedRanges: PaymentDueRange[] = [];
    for (const row of filledRows) {
      const start = Number(row.start);
      const end = Number(row.end || row.start);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > 31) {
        setError("Ödeme günü aralığı 1–31 arasında tam sayı olmalı.");
        return;
      }
      if (start > end) {
        setError("Aralık başlangıcı bitişten büyük olamaz.");
        return;
      }
      parsedRanges.push({ start, end });
    }

    startTransition(async () => {
      const result = await actionUpdateStudentProfile({
        studentId,
        packageId: packageId || undefined,
        // Süre burada değiştirilmez; mevcut değer korunur (yoksa sunucu paket fiyatı için süre ister).
        lessonDurationMinutes: initialDurationMinutes,
        paymentMethod: paymentMethod || undefined,
        paymentDueRanges: parsedRanges,
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
          {/* C — ders süresi TEK kanonik alan (Student.lessonDurationMinutes); düzenleme yeri Genel bilgiler.
              Burada yalnız fiyat hesabına girdi olarak gösterilir — ödeme profili kaydı süreyi DEĞİŞTİRMEZ. */}
          <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-2 text-sm text-[var(--color-text)]">
            {initialDurationMinutes ? (
              <>
                {initialDurationMinutes} dk
                {selectedPackage ? ` — ${formatMoney(priceForDuration(selectedPackage, initialDurationMinutes))}` : ""}
              </>
            ) : (
              <span style={{ color: "var(--color-warning)" }}>Girilmemiş — paket ücreti hesaplanamaz</span>
            )}
          </p>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            Genel bilgiler → Kayıt bilgileri bölümünden veya sözleşme ekranından değiştirilir.
          </p>
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
        <div className="sm:col-span-2">
          <Label>Ödeme günü aralıkları</Label>
          <div className="space-y-2">
            {dueRanges.map((row) => (
              <div key={row.key} className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={row.start}
                  onChange={(e) => updateDueRange(row.key, "start", e.target.value)}
                  placeholder="Başlangıç (ör. 1)"
                  className="w-28"
                />
                <span className="text-xs text-[var(--color-text-muted)]">–</span>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={row.end}
                  onChange={(e) => updateDueRange(row.key, "end", e.target.value)}
                  placeholder="Bitiş (ör. 5)"
                  className="w-28"
                />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={dueRanges.length === 1}
                  onClick={() => removeDueRange(row.key)}
                >
                  Kaldır
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="ghost" onClick={addDueRange} className="mt-1">
            + Aralık ekle
          </Button>
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

      {error ? <p className="text-xs font-medium text-[var(--color-danger)]">{error}</p> : null}
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
