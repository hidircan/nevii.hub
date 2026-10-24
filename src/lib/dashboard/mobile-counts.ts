import { isPaymentOverdue, todayYmdInstitution } from "../payments/status";
import type { AppData, MakeupRequest } from "../types";
import { isPastMakeupPlanningDeadline, isUnplannedMakeup } from "../makeup-deadline";

/**
 * DB egress (2026-10-18) — mobil ana sayfa sayaçları. Eskiden her özet tüm kurum verisini okuyordu; db artık bu
 * sayıları `count` sorgularıyla üretir (`store.readMobileDashboardCounts`), json/memory bu fonksiyonla — aynı kural.
 */
export type MobileDashboardCounts = { pendingAttendanceCount: number; overduePaymentCount: number; openMakeupCount: number };

export const OPEN_MAKEUP_STATUSES = ["pending", "suggested", "awaiting_info"];

/**
 * Ekranın gördüğü "açık" telafi: `store.readData`'nın sanal süre dolumuyla (closeExpiredUnplannedMakeups, legacyView)
 * aynı kural — planlanmamış ve planlama süresi geçmiş talep açık sayılmaz (DB'de hâlâ pending olsa da).
 */
export function isOpenMakeupInView(m: Pick<MakeupRequest, "status" | "confirmedLessonId" | "expiresAt">, now: Date): boolean {
  return OPEN_MAKEUP_STATUSES.includes(m.status) && !(isUnplannedMakeup(m) && isPastMakeupPlanningDeadline(m.expiresAt, now));
}

export function mobileDashboardCounts(
  data: Pick<AppData, "lessons" | "payments" | "makeupRequests">,
  now: Date
): MobileDashboardCounts {
  const nowMs = now.getTime();
  return {
    pendingAttendanceCount: data.lessons.filter(
      (l) =>
        l.status !== "cancelled" &&
        Date.parse(l.endAt) < nowMs &&
        !l.studentAttended &&
        !l.lessonProcessed &&
        !l.studentAbsent &&
        !l.studentExcused &&
        !l.opsMakeupFlag
    ).length,
    overduePaymentCount: data.payments.filter(
      // 2026-10-20 — tek kural (payments/status.ts): kurum saatinde gün bazlı vade.
      (p) => isPaymentOverdue(p, todayYmdInstitution(now))
    ).length,
    openMakeupCount: (data.makeupRequests ?? []).filter((m) => isOpenMakeupInView(m, now)).length,
  };
}
