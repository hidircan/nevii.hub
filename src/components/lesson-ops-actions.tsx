"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { LessonStatusBadge } from "./lesson-status-badge";
import {
  DisruptionSourceFields,
  disruptionPayload,
  isDisruptionFormComplete,
  type DisruptionFormValue,
} from "./disruption-source-fields";

type DisruptionBody = ReturnType<typeof disruptionPayload>;

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
  onPendingChange,
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
  /**
   * P0 UAT (2026-09-08) — sunucu isteği sürerken çağıranın (ör. Ders Programı
   * kartı) görünür bir "kaydediliyor" işareti gösterebilmesi için.
   */
  onPendingChange?: (lessonId: string, pending: boolean) => void;
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
  const [pendingSwitch, setPendingSwitch] = useState<{ from: Flag; to: Flag; reason?: string; disruption?: DisruptionBody } | null>(null);
  /** P0-2 — "İşlendi"/"Telafi" gerekçesi zorunlu; tıklamada önce bu prompt açılır. */
  const [reasonPrompt, setReasonPrompt] = useState<{ flag: "processed" | "makeup" } | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  /** 9. tur — Telafi'de kaynak sorusu (öğretmen/kurum/öğrenci/diğer). */
  const [disruptionDraft, setDisruptionDraft] = useState<DisruptionFormValue>({});
  const inFlight = useRef(false);

  const effective = effectiveOf(local);

  /**
   * 2026-09-19 KÖK NEDEN (Ders Programı "geçmiş derse tıklayınca yeşile dönüyor"):
   * statü eskiden bir `useEffect` ile MOUNT'ta ve `lessonId` her değiştiğinde
   * yayılıyordu. Detay paneli yeniden kullanılınca `local` bir ÖNCEKİ dersten
   * kalıyor ve o dersin statüsü yeni seçilen dersin kartına "iyimser" olarak
   * yazılıyordu — yani SEÇİM, statü rengini değiştiriyordu. Artık statü YALNIZ
   * gerçek bir kullanıcı aksiyonunda (iyimser set / hata sonrası geri alma) yayılır.
   */
  function setLocalAndEmit(next: typeof local) {
    setLocal(next);
    onStatusChange?.(lessonId, effectiveOf(next));
  }

  /**
   * ÖNCELİK 4 (devam) — Geldi/İşlendi/Telafi TEK, birbirini dışlayan statü.
   * İlk tıklama (henüz hiçbir statü etkin değilken) API'ye ANINDA kaydeder —
   * UI iyimser (optimistic) güncellenir, hata olursa geri alınır. Farklı bir
   * statüden geçişte önce onay popup'ı açılır; yalnızca onaylanırsa gerçek
   * geçiş `confirmSwitch:true` ile tetiklenir.
   */
  async function onFlag(flag: Flag, confirmSwitch = false, reason?: string, disruption?: DisruptionBody) {
    if (inFlight.current) return;
    if (!confirmSwitch && effective !== null && effective !== flag) {
      setPendingSwitch({ from: effective, to: flag, reason, disruption });
      return;
    }
    setPendingSwitch(null);
    inFlight.current = true;
    setBusy(flag);
    setError(null);
    onPendingChange?.(lessonId, true);

    // İyimser güncelleme — tek statü, diğerleri anında temizlenir.
    const previous = { ...local };
    setLocalAndEmit({
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
        body: JSON.stringify({ flag, confirmSwitch, reason, ...(disruption ?? {}) }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { alreadySet?: boolean; message?: string; needsConfirmation?: boolean; currentStatus?: string | null; warning?: string };
        error?: { message: string };
      };
      if (!json.ok) {
        setLocalAndEmit(previous);
        setError(json.error?.message || "İşlem başarısız. Tekrar deneyin.");
        return;
      }
      if (json.data?.needsConfirmation) {
        // Yarış durumu — sunucuda arada başka bir statü set edilmiş; tekrar sor.
        setLocalAndEmit(previous);
        setPendingSwitch({ from: (json.data.currentStatus as Flag) ?? effective ?? flag, to: flag, reason, disruption });
        return;
      }
      // P0 performans (2026-09-07) — `onSettled` veren çağıran (Yoklama
      // Takvimi) etkilenen AYı zaten kendisi tazeliyor; ayrıca `router.refresh()`
      // çağırmak, bu ekranda hiçbir şeyi değiştirmeyen İKİNCİ bir tam RSC
      // render'ıydı (ölçüm: ~1,2 sn). `onSettled` vermeyen çağıranlar (Ders
      // Programı detay modalı, öğretmen programı) statüyü sunucu prop'undan
      // okuduğu için refresh onlarda KORUNUR.
      if (json.data?.warning) setError(json.data.warning);
      if (!onSettled) router.refresh();
    } catch {
      setLocalAndEmit(previous);
      setError("Bağlantı hatası. Tekrar deneyin.");
    } finally {
      inFlight.current = false;
      setBusy(null);
      onPendingChange?.(lessonId, false);
      onSettled?.(lessonId);
    }
  }

  /**
   * P0-2 — "İşlendi"/"Telafi" tıklaması ANINDA API'ye gitmez; önce zorunlu
   * gerekçe promptu açılır (bkz. `reasonPrompt`). Diğer bayraklar (Geldi/
   * Gelmedi/Mazeretli) değişmeden anında `onFlag` çağırır.
   */
  function handleButtonClick(flag: Flag) {
    if (flag === "processed" || flag === "makeup") {
      setReasonDraft("");
      setDisruptionDraft({});
      setReasonPrompt({ flag });
      return;
    }
    void onFlag(flag);
  }

  function submitReasonPrompt() {
    if (!reasonPrompt) return;
    const reason = reasonDraft.trim();
    if (!reason) return;
    const { flag } = reasonPrompt;
    if (flag === "makeup" && !isDisruptionFormComplete(disruptionDraft)) return;
    setReasonPrompt(null);
    void onFlag(flag, false, reason, flag === "makeup" ? disruptionPayload(disruptionDraft, reason) : undefined);
  }

  /**
   * P0 (2026-09-05) — tüm portallarda TEK renk sözlüğü:
   * Geldi=yeşil, İşlendi=KIRMIZI, Telafi=SARI, Kapalı=siyah (bkz.
   * ATTENDANCE_CALENDAR_COLORS, src/lib/attendance-calendar.ts — TEK kaynak).
   * İşlendi/Telafi bu turda owner talimatıyla YER DEĞİŞTİRDİ. Koyu
   * tema: her tonun `dark:` varyantı var (yalnız renge güvenme kuralı zaten
   * etiket metniyle karşılanıyor, bkz. buton/badge metinleri).
   */
  const TONE_CLASS: Record<"green" | "red" | "yellow" | "stone" | "violet", string> = {
    green: "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)] dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    red: "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)] dark:border-red-700 dark:bg-red-950 dark:text-red-300",
    yellow: "border-[var(--color-warning)] bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-text)] dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300",
    stone: "border-stone-500 bg-stone-100 text-stone-700 dark:border-stone-500 dark:bg-stone-800 dark:text-stone-200",
    violet: "border-violet-500 bg-violet-50 text-violet-800 dark:border-violet-600 dark:bg-violet-950 dark:text-violet-300",
  };

  const btn = (flag: Flag, label: string, active: boolean, tone: "green" | "red" | "yellow" | "stone" | "violet") => (
    <button
      type="button"
      disabled={busy !== null}
      aria-pressed={active}
      aria-label={label}
      onClick={() => handleButtonClick(flag)}
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50",
        compact && "px-2 py-1 text-[11px]",
        active && TONE_CLASS[tone],
        !active && "border-stone-300 bg-[var(--color-surface)] text-stone-800 hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]"
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
      {/*
        P0 UAT (2026-09-08) — küçük, erişilebilir "kaydediliyor" geri bildirimi.
        `aria-live="polite"` ekran okuyucuya durumu bildirir; renk değişimi
        zaten anında olduğu için bu yalnızca sunucu turunun sürdüğünü söyler.
      */}
      <p className="mt-1 text-[11px] text-[var(--color-text-muted)]" aria-live="polite">
        {busy ? `${FLAG_LABEL[busy]} kaydediliyor…` : ""}
      </p>
      {error ? (
        <p className="mt-1 text-[11px] font-medium text-[var(--color-danger)]" role="alert">
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
              onClick={() => void onFlag(pendingSwitch.to, true, pendingSwitch.reason, pendingSwitch.disruption)}
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
      {reasonPrompt ? (
        <div
          role="alertdialog"
          aria-label={`${FLAG_LABEL[reasonPrompt.flag]} gerekçesi`}
          className="mt-2 rounded-md border border-stone-300 bg-[var(--color-surface)] p-2 text-[11px]"
        >
          <label htmlFor={`ops-reason-${lessonId}`} className="font-medium text-stone-800">
            &quot;{FLAG_LABEL[reasonPrompt.flag]}&quot; için gerekçe (zorunlu)
          </label>
          <textarea
            id={`ops-reason-${lessonId}`}
            value={reasonDraft}
            onChange={(e) => setReasonDraft(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-stone-300 bg-[var(--color-surface)] px-2 py-1 text-[11px]"
            placeholder="Örn. Ders fiilen işlendi / Öğrenci hastaydı"
          />
          {reasonPrompt.flag === "makeup" ? (
            <div className="mt-2">
              <DisruptionSourceFields
                idPrefix={`ops-${lessonId}`}
                kind="Telafi"
                value={disruptionDraft}
                onChange={setDisruptionDraft}
              />
            </div>
          ) : null}
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              disabled={
                reasonDraft.trim().length === 0 ||
                (reasonPrompt.flag === "makeup" && !isDisruptionFormComplete(disruptionDraft))
              }
              onClick={submitReasonPrompt}
              className="rounded-md border border-[var(--color-primary)] bg-[var(--color-surface-muted)] px-2 py-1 text-[11px] font-semibold text-[var(--color-primary-soft-text)] hover:bg-[var(--color-primary-soft)] disabled:opacity-50"
            >
              Kaydet
            </button>
            <button
              type="button"
              onClick={() => setReasonPrompt(null)}
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

type LocalFlags = { attended: boolean; processed: boolean; makeup: boolean; absent: boolean; excused: boolean };

/** Sunucudaki `effectiveLessonOpsStatus` ile AYNI öncelik: Telafi > İşlendi > Geldi > Gelmedi > Mazeretli. */
function effectiveOf(local: LocalFlags): Flag | null {
  if (local.makeup) return "makeup";
  if (local.processed) return "processed";
  if (local.attended) return "attended";
  if (local.absent) return "absent";
  if (local.excused) return "excused";
  return null;
}

export function LessonOpsBadges({
  studentAttended,
  lessonProcessed,
  opsMakeupFlag,
  cancelled,
  missingHomework,
}: {
  studentAttended?: boolean;
  lessonProcessed?: boolean;
  opsMakeupFlag?: boolean;
  studentAbsent?: boolean;
  studentExcused?: boolean;
  opsClosedFlag?: boolean;
  /** P0-2 — İptal (temel `Lesson.status==="cancelled"`, bir ops-flag DEĞİL). */
  cancelled?: boolean;
  /** Faz 3C — ders işlendi ama bu derse bağlı ödev yok. */
  missingHomework?: boolean;
}) {
  const finalStatus = cancelled
    ? "cancelled"
    : opsMakeupFlag
      ? "makeup"
      : lessonProcessed
        ? "processed"
        : studentAttended
          ? "attended"
          : "planned";

  return (
    <div className="flex flex-wrap gap-1">
      <LessonStatusBadge status={finalStatus} />
      {missingHomework ? (
        <span className="rounded-full bg-stone-300 px-2 py-0.5 text-[10px] font-semibold text-stone-800 dark:bg-stone-700 dark:text-stone-100">
          Ödev yok
        </span>
      ) : null}
    </div>
  );
}
