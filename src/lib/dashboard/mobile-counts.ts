import type { AppData } from "../types";

/**
 * DB egress (2026-10-18) — mobil ana sayfa sayaçları. Eskiden her özet tüm kurum verisini okuyordu; db artık bu
 * sayıları `count` sorgularıyla üretir (`store.readMobileDashboardCounts`), json/memory bu fonksiyonla — aynı kural.
 */
export type MobileDashboardCounts = { pendingAttendanceCount: number; overduePaymentCount: number; openMakeupCount: number };

export const OPEN_MAKEUP_STATUSES = ["pending", "suggested", "awaiting_info"];

export function mobileDashboardCounts(
  data: Pick<AppData, "lessons" | "payments" | "makeupRequests">,
  now: Date
): MobileDashboardCounts {
  const nowMs = now.getTime();
  const today = now.toISOString().slice(0, 10);
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
      (p) => p.status !== "paid" && p.status !== "voided" && (p.status === "overdue" || p.dueDate.slice(0, 10) < today)
    ).length,
    openMakeupCount: (data.makeupRequests ?? []).filter((m) => OPEN_MAKEUP_STATUSES.includes(m.status)).length,
  };
}
