"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Flag = "attended" | "processed" | "makeup" | "absent" | "excused";

export function LessonOpsActions({
  lessonId,
  studentAttended,
  lessonProcessed,
  opsMakeupFlag,
  studentAbsent,
  studentExcused,
  compact = false,
  onStatusChange,
  onSettled,
}: {
  lessonId: string;
  studentAttended?: boolean;
  lessonProcessed?: boolean;
  opsMakeupFlag?: boolean;
  studentAbsent?: boolean;
  studentExcused?: boolean;
  compact?: boolean;
  /**
   * Yoklama Takvimi gün kutusu dolgusu bu bileşenin "etkin" (effective) tek
   * statüsünü aynen yansıtmalı — ayrı bir tahmin/ikinci renk mantığı YOK.
   * Bu callback, `effective` her değiştiğinde (iyimser set, hata sonrası geri
   * alma, onaylanan geçiş) TEK kaynaktan çağrılır ki takvim kutusu sayfa
   * yenilenmeden, aynı anda güncellensin.
   */
  onStatusChange?: (lessonId: string, flag: Flag | null) => void;
  /** İstek tamamlandığında (başarı VEYA hata) çağrılır — çağıran taraf, tutar/ödeme gibi sunucu-gerçeği verileri tazelemek isteyebilir. */
  onSettled?: (lessonId: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Flag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState({
    attended: !!studentAttended,
    processed: !!lessonProcessed,
    makeup: !!opsMakeupFlag,
    absent: !!studentAbsent,
    excused: !!studentExcused,
  });
  /** ÖNCELİK 4 (devam) — farklı bir statüden geçiş istendiğinde onay bekleyen aksiyon. */
  const [pendingSwitch, setPendingSwitch] = useState<{ from: Flag; to: Flag } | null>(null);
  const inFlight = useRef(false);

  const effective: Flag | null = local.processed
    ? "processed"
    : local.attended
      ? "attended"
      : local.makeup
        ? "makeup"
        : local.absent
          ? "absent"
          : local.excused
            ? "excused"
            : null;

  useEffect(() => {
    onStatusChange?.(lessonId, effective);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effective, lessonId]);

  /**
   * ÖNCELİK 4 (devam) — Geldi/İşlendi/Telafi TEK, birbirini dışlayan statü.
   * İlk tıklama (henüz hiçbir statü etkin değilken) API'ye ANINDA kaydeder —
   * UI iyimser (optimistic) güncellenir, hata olursa geri alınır. Farklı bir
   * statüden geçişte önce onay popup'ı açılır; yalnızca onaylanırsa gerçek
   * geçiş `confirmSwitch:true` ile tetiklenir.
   */
  async function onFlag(flag: Flag, confirmSwitch = false) {
    if (inFlight.current) return;
    if (!confirmSwitch && effective !== null && effective !== flag) {
      setPendingSwitch({ from: effective, to: flag });
      return;
    }
    setPendingSwitch(null);
    inFlight.current = true;
    setBusy(flag);
    setError(null);

    // İyimser güncelleme — tek statü, diğerleri anında temizlenir.
    const previous = { ...local };
    setLocal({
      attended: flag === "attended",
      processed: flag === "processed",
      makeup: flag === "makeup",
      absent: flag === "absent",
      excused: flag === "excused",
    });

    try {
      const res = await fetch(`/api/v1/lessons/${lessonId}/ops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flag, confirmSwitch }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { alreadySet?: boolean; message?: string; needsConfirmation?: boolean; currentStatus?: string | null };
        error?: { message: string };
      };
      if (!json.ok) {
        setLocal(previous);
        setError(json.error?.message || "İşlem başarısız. Tekrar deneyin.");
        return;
      }
      if (json.data?.needsConfirmation) {
        // Yarış durumu — sunucuda arada başka bir statü set edilmiş; tekrar sor.
        setLocal(previous);
        setPendingSwitch({ from: (json.data.currentStatus as Flag) ?? effective ?? flag, to: flag });
        return;
      }
      router.refresh();
    } catch {
      setLocal(previous);
      setError("Bağlantı hatası. Tekrar deneyin.");
    } finally {
      inFlight.current = false;
      setBusy(null);
      onSettled?.(lessonId);
    }
  }

  /**
   * ÖNCELİK 4 (devam) — tüm portallarda TEK renk sözlüğü:
   * Geldi=yeşil, İşlendi=kırmızı, Telafi=sarı, Kapalı=siyah (bkz.
   * ATTENDANCE_CALENDAR_COLORS, src/lib/attendance-calendar.ts). Önceki
   * sürümde İşlendi de yeşil, Telafi kırmızı boyanıyordu — spesifikasyonla
   * tutarsızdı; burada düzeltildi.
   */
  const TONE_CLASS: Record<"green" | "red" | "yellow" | "stone" | "orange", string> = {
    green: "border-[#2f6b4f] bg-[#e8f2ec] text-[#1e4d36]",
    red: "border-[#8b3a3a] bg-[#f8ecec] text-[#6b2424]",
    yellow: "border-[#8a6d1d] bg-[#fbf3d9] text-[#5c4a12]",
    stone: "border-stone-500 bg-stone-100 text-stone-700",
    orange: "border-orange-500 bg-orange-50 text-orange-800",
  };

  const btn = (flag: Flag, label: string, active: boolean, tone: "green" | "red" | "yellow" | "stone" | "orange") => (
    <button
      type="button"
      disabled={busy !== null}
      aria-pressed={active}
      aria-label={label}
      onClick={() => void onFlag(flag)}
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50",
        compact && "px-2 py-1 text-[11px]",
        active && TONE_CLASS[tone],
        !active && "border-stone-300 bg-[var(--color-surface)] text-stone-800 hover:border-[#A56A00] hover:bg-[#fbf6ee]"
      )}
    >
      {busy === flag ? "…" : label}
    </button>
  );

  const FLAG_LABEL: Record<Flag, string> = {
    attended: "Geldi",
    processed: "İşlendi",
    makeup: "Telafi",
    absent: "Gelmedi",
    excused: "Mazeretli",
  };

  return (
    <div className={cn("mt-2", compact && "mt-1.5")}>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ders operasyon durumları">
        {btn("attended", "Geldi", local.attended, "green")}
        {btn("processed", "İşlendi", local.processed, "red")}
        {btn("makeup", "Telafi", local.makeup, "yellow")}
        {/* Paket 6 — "Gelmedi"/"Mazeretli" aksiyon butonları buradan kaldırıldı
            (yalnız UI; flag/veri modeli ve geçmiş kayıtlar korunuyor — bkz.
            LessonOpsBadges'in bu iki statüyü hâlâ salt-okunur göstermesi). */}
      </div>
      {error ? (
        <p className="mt-1 text-[11px] font-medium text-[#8b3a3a]" role="alert">
          {error}
        </p>
      ) : null}
      {pendingSwitch ? (
        <div
          role="alertdialog"
          aria-label="Durum değişikliğini onayla"
          className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900"
        >
          <p className="font-medium">
            Bu ders zaten &quot;{FLAG_LABEL[pendingSwitch.from]}&quot; olarak işaretli. &quot;
            {FLAG_LABEL[pendingSwitch.to]}&quot; olarak değiştirmek istediğinize emin misiniz?
          </p>
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => void onFlag(pendingSwitch.to, true)}
              className="rounded-md border border-amber-400 bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-200"
            >
              Onayla ve değiştir
            </button>
            <button
              type="button"
              onClick={() => setPendingSwitch(null)}
              className="rounded-md border border-stone-300 bg-[var(--color-surface)] px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-50"
            >
              Vazgeç
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function LessonOpsBadges({
  studentAttended,
  lessonProcessed,
  opsMakeupFlag,
  studentAbsent,
  studentExcused,
  opsClosedFlag,
  missingHomework,
}: {
  studentAttended?: boolean;
  lessonProcessed?: boolean;
  opsMakeupFlag?: boolean;
  studentAbsent?: boolean;
  studentExcused?: boolean;
  opsClosedFlag?: boolean;
  /** Faz 3C — ders işlendi ama bu derse bağlı ödev yok. */
  missingHomework?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {studentAttended ? (
        <span className="rounded-full bg-[#e8f2ec] px-2 py-0.5 text-[10px] font-semibold text-[#1e4d36]">
          Geldi
        </span>
      ) : null}
      {lessonProcessed ? (
        <span className="rounded-full bg-[#f8ecec] px-2 py-0.5 text-[10px] font-semibold text-[#6b2424]">
          İşlendi
        </span>
      ) : null}
      {opsMakeupFlag ? (
        <span className="rounded-full bg-[#fbf3d9] px-2 py-0.5 text-[10px] font-semibold text-[#5c4a12]">
          Telafi
        </span>
      ) : null}
      {studentAbsent ? (
        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-semibold text-stone-700">
          Gelmedi
        </span>
      ) : null}
      {studentExcused ? (
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-800">
          Mazeretli
        </span>
      ) : null}
      {opsClosedFlag ? (
        <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold text-white">
          Kapalı
        </span>
      ) : null}
      {missingHomework ? (
        <span className="rounded-full bg-stone-300 px-2 py-0.5 text-[10px] font-semibold text-stone-800">
          Ödev yok
        </span>
      ) : null}
    </div>
  );
}
