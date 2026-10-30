import type { ApiResult } from "../api/errors";
import type { Locale } from "../i18n/locales";
import { getActiveLocale } from "../i18n/locale-store";
import type { Lesson } from "../types/api";

type OpsResponse = { needsConfirmation?: boolean; alreadySet?: boolean };
export type OpsOutcome = { kind: "saved"; message: string } | { kind: "confirm" } | { kind: "error"; message: string };

/**
 * POST /api/v1/lessons/:id/ops sonucunu UI kararına çevirir. "Kaydedildi"
 * YALNIZ sunucu `ok` ve onay istemediğinde denir — ağ hatası/403/409 asla
 * başarı gibi gösterilmez. Farklı bir statüden geçişte sunucu hiçbir şey
 * yazmadan `needsConfirmation` döner; kullanıcı onaylarsa `confirmSwitch:true`
 * ile yeniden gönderilir. Sunucu `alreadySet` ile doğal idempotenttir
 * (idempotency-key desteği yok — aynı istek tekrarı çift kayıt üretmez).
 */
export function classifyOpsResult(res: ApiResult<OpsResponse>, locale: Locale = getActiveLocale()): OpsOutcome {
  if (!res.ok) return { kind: "error", message: res.error.message };
  if (res.data.needsConfirmation) return { kind: "confirm" };
  return {
    kind: "saved",
    message:
      locale === "en"
        ? res.data.alreadySet
          ? "Attendance already recorded as such."
          : "Attendance saved."
        : res.data.alreadySet
          ? "Yoklama zaten bu şekilde kayıtlı."
          : "Yoklama kaydedildi.",
  };
}

/** Aynı anda tek işlem: ikinci dokunuş, ilki bitene kadar sessizce yok sayılır (double-submit koruması). */
export function createInFlightGuard() {
  let busy = false;
  return {
    async run<T>(task: () => Promise<T>): Promise<T | undefined> {
      if (busy) return undefined;
      busy = true;
      try {
        return await task();
      } finally {
        busy = false;
      }
    },
  };
}

const DAY_MS = 86_400_000;

/** Bitmiş ama yoklama/işlem kaydı olmayan dersler (son `days` gün), en eski önce — öğretmen ana sayfası. */
export function pendingAttendance(lessons: Lesson[], nowMs: number, days = 14): Lesson[] {
  const from = nowMs - days * DAY_MS;
  return lessons
    .filter((l) => {
      const end = new Date(l.endAt).getTime();
      return (
        end < nowMs &&
        end >= from &&
        l.status !== "cancelled" &&
        l.status !== "no_show" &&
        !l.lessonProcessed &&
        !l.studentAttended &&
        !l.studentAbsent &&
        !l.studentExcused &&
        !l.opsMakeupFlag
      );
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}
