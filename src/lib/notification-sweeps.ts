import { differenceInCalendarDays, parseISO } from "date-fns";
import { readPaymentsPageData } from "./store";
import { notifyAdmins } from "./manager-notifications";
import { listLeave } from "./leave";
import { forEachSchoolTenant, sweepLessonReminders, sweepUpcomingLessons } from "./lesson-notifications";
import { formatDate, formatMoney } from "./utils";
import { paymentTargetHref } from "./notification-href";
import { safeErrorFields } from "./logger";

const PENDING_DAYS = 7;

export type NotificationSweepSummary = {
  upcoming: Awaited<ReturnType<typeof sweepUpcomingLessons>>;
  reminders: Awaited<ReturnType<typeof sweepLessonReminders>>;
  paymentPending: number;
  leavePending: number;
  /** Tenant-bazlı hata sayaçları: bir tenant'ın hatası koşuyu durdurmaz. */
  paymentTenantErrors: number;
  leaveTenantErrors: number;
  contractExpiring: number;
  contractTenantErrors: number;
  /** Tüm aşamalarda hata veren kurum sayısı toplamı; > 0 ise tick 200 DÖNMEZ (bkz. tick route). */
  tenantErrors: number;
};

/** Öğrenci sözleşmesi bitiş uyarısı — tüm kurumlar (bkz. student-contract-expiry.ts). */
export async function sweepStudentContractExpiry(now = new Date()): Promise<{ created: number; tenantErrors: number }> {
  const { runStudentContractExpiryCheck } = await import("./student-contract-expiry");
  let created = 0;
  const tenantErrors = await forEachSchoolTenant("contractExpiry", async (tenantId) => {
    created += (await runStudentContractExpiryCheck(tenantId, now)).created;
  });
  return { created, tenantErrors };
}

export async function sweepPaymentFailedOrPending(now = new Date()): Promise<{ created: number; tenantErrors: number }> {
  let created = 0;
  const tenantErrors = await forEachSchoolTenant("paymentPending", async (tenantId) => {
    // DB egress (2026-10-16): ödeme dilimi (ödemeler + referans veri); ders/yoklama/telafi okunmaz.
    const data = await readPaymentsPageData();
    for (const p of data.payments) {
      if (p.status !== "pending") continue;
      const anchor = p.createdAt || p.dueDate;
      if (!anchor) continue;
      const age = differenceInCalendarDays(now, parseISO(anchor));
      if (age < PENDING_DAYS) continue;
      const remaining = Math.max(p.amount - p.paidAmount, 0);
      // 2026-10-15 — kimden/ne için/ne kadar/vade; teknik kimlik yalnız "Detay:" hedefinde (ekranda gizlenir,
      // tekilleştirme `body.includes(p.id)` ile aynen çalışır). Push yok — yalnız yönetici uygulama içi bildirimi.
      const who = data.students.find((st) => st.id === p.studentId)?.name ?? "Öğrenci kaydı bulunamadı";
      const what = p.installmentPeriodLabel ?? p.description ?? "Ödeme";
      // Bozuk/boş vade tarihi tick'i düşürmesin (kurum hatası = tick 500): yalnız geçerliyse yazılır.
      const due = p.dueDate && !Number.isNaN(Date.parse(p.dueDate)) ? `vade ${formatDate(p.dueDate)}, ` : "";
      const outcomes = await notifyAdmins(
        tenantId,
        "payment_failed_or_pending",
        {
          title: "Bekleyen ödeme",
          body: `${who} — ${what}: ${formatMoney(remaining)} ödeme bekliyor (${due}${age} gündür açık). Detay: ${paymentTargetHref(p.studentId, p.id)}`,
        },
        { dedupeKey: p.id }
      );
      // Yalnız gerçekten yazılan bildirim sayılır (eskiden yinelenen/atlanan da "created" sayılıyordu).
      if (outcomes.includes("created")) created++;
    }
  });
  return { created, tenantErrors };
}

export async function sweepLeavePendingApproval(): Promise<{ created: number; tenantErrors: number }> {
  let created = 0;
  const tenantErrors = await forEachSchoolTenant("leavePending", async (tenantId) => {
    const leaves = await listLeave(tenantId);
    for (const leave of leaves) {
      if (leave.status !== "pending_approval") continue;
      await notifyAdmins(
        tenantId,
        "leave_pending_approval",
        {
          title: "Bekleyen izin onayı",
          body: `Onay bekleyen izin talebi var. Detay: /panel/personel/izinler`,
        },
        { dedupeKey: leave.id, roles: ["SUPER_ADMIN"] }
      );
      created++;
    }
  });
  return { created, tenantErrors };
}

/**
 * Tüm süpürmeler sırayla. Kurum hatası aşama içinde sayılır (diğer kurumlar/aşamalar sürer);
 * aşamanın KENDİSİ çökerse (ör. kurum listesi okunamadı) hata yukarı fırlar → tick 500.
 *
 * `stages: "lessons"` (DB egress, 2026-10-16): her 10 dk'lık tur yalnız ders hatırlatmalarını çalıştırır (dakika
 * hassasiyeti gerekir). Ödeme/izin/sözleşme süpürmeleri 24 saatlik tekilleştirmeli olduğu için günde bir kez (tam tur)
 * yeterlidir; her turda çalışmaları yeni bildirim üretmeden tüm ödemeleri okumak demekti.
 */
export async function runNotificationSweeps(
  now = new Date(),
  options: { stages?: "all" | "lessons" } = {}
): Promise<NotificationSweepSummary> {
  async function runStage<T>(
    stage: string,
    task: () => Promise<T>
  ): Promise<T> {
    try {
      return await task();
    } catch (error: unknown) {
      console.error("[notifications.sweep.stage.failed]", { stage, ...safeErrorFields(error) });
      throw error;
    }
  }

  const upcoming = await runStage("upcomingLessons", () => sweepUpcomingLessons(now));
  const reminders = await runStage("lessonReminders", () => sweepLessonReminders(now));
  const daily = options.stages !== "lessons";
  const none = { created: 0, tenantErrors: 0 };
  const payment = daily ? await runStage("paymentPending", () => sweepPaymentFailedOrPending(now)) : none;
  const leave = daily ? await runStage("leavePending", () => sweepLeavePendingApproval()) : none;
  const contract = daily ? await runStage("contractExpiry", () => sweepStudentContractExpiry(now)) : none;

  return {
    upcoming,
    reminders,
    paymentPending: payment.created,
    leavePending: leave.created,
    paymentTenantErrors: payment.tenantErrors,
    leaveTenantErrors: leave.tenantErrors,
    contractExpiring: contract.created,
    contractTenantErrors: contract.tenantErrors,
    tenantErrors:
      upcoming.tenantErrors + reminders.tenantErrors + payment.tenantErrors + leave.tenantErrors + contract.tenantErrors,
  };
}
