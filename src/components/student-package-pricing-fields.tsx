"use client";

/**
 * Package C — öğrenci create formunda paket + süre + indirim seçimi ve
 * canlı nihai ücret önizlemesi. Hesap TEK merkez helper'dan
 * (`computeMonthlyFee`, src/lib/packages.ts — saf, I/O yok) gelir; sunucu
 * (createStudentTool) aynı helper'ı kullanarak AYNI sonucu tekrar hesaplar
 * ve kaydeder — istemciden gelen bir "nihai tutar" asla doğrudan güvenilip
 * kaydedilmez. Paket seçilmediyse eski serbest `monthlyFee` girişi
 * (legacy) aynen görünür; paket seçilince o alan gizlenir/hesaplanan
 * değerle senkron gizli input'a döner — kullanıcı iki çelişkili fiyat
 * alanıyla baş başa kalmaz.
 */

import { useMemo, useState } from "react";
import { Input, Label, Select } from "@/components/ui";
import { computeMonthlyFee } from "@/lib/packages";
import { sanitizeAmountInput } from "@/lib/amount-input";
import { LESSON_DURATION_OPTIONS, DEFAULT_LESSON_DURATION_MINUTES } from "@/lib/lesson-duration";

export type PricingPackageOption = {
  id: string;
  title: string;
  price30Min: number;
  price40Min: number;
  price50Min: number;
};

function formatTL(amount: number): string {
  return `${amount.toLocaleString("tr-TR")} TL`;
}

export function StudentPackagePricingFields({
  packages,
  defaultMonthlyFee,
}: {
  packages: PricingPackageOption[];
  defaultMonthlyFee?: number;
}) {
  const [packageId, setPackageId] = useState("");
  const [duration, setDuration] = useState<number>(DEFAULT_LESSON_DURATION_MINUTES);
  const [discountType, setDiscountType] = useState<"" | "percent" | "amount">("");
  const [discountValue, setDiscountValue] = useState("");
  // Metin olarak tutulur — bkz. sanitizeAmountInput (sıfır silinemiyordu).
  const [legacyMonthlyFee, setLegacyMonthlyFee] = useState(defaultMonthlyFee ? String(defaultMonthlyFee) : "");

  const selectedPackage = packages.find((p) => p.id === packageId);

  const computation = useMemo(() => {
    if (!selectedPackage) return null;
    const dv = discountType ? Number(discountValue) : undefined;
    return computeMonthlyFee({
      pkg: selectedPackage,
      durationMinutes: duration as 30 | 40 | 50,
      discountType: discountType || undefined,
      discountValue: dv && Number.isFinite(dv) && dv > 0 ? dv : undefined,
    });
  }, [selectedPackage, duration, discountType, discountValue]);

  return (
    <div className="space-y-3">
      <div>
        <Label>Paket Yönetimi paketi (opsiyonel)</Label>
        <Select name="packageId" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
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

      {selectedPackage ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>İndirim türü (opsiyonel)</Label>
              <Select
                name="discountType"
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as "" | "percent" | "amount")}
              >
                <option value="">İndirim yok</option>
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
                disabled={!discountType}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === "percent" ? "Örn. 10" : "Örn. 300"}
              />
            </div>
          </div>

          {/* Server tarafında yeniden hesaplanacağı için burada yalnız önizleme — kaydedilecek değer server'dan gelir. */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)]">Liste fiyatı</span>
              <span className="font-medium">{formatTL(computation?.baseMonthlyFee ?? 0)}</span>
            </div>
            {computation && computation.discountAmount > 0 ? (
              <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
                <span>İndirim</span>
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
        <div>
          <Label>Aylık ücret (serbest — paket seçilmediyse)</Label>
          <Input
            name="monthlyFee"
            inputMode="numeric"
            placeholder="Örn. 3000"
            value={legacyMonthlyFee}
            onChange={(e) => setLegacyMonthlyFee(sanitizeAmountInput(e.target.value))}
          />
        </div>
      )}
    </div>
  );
}
