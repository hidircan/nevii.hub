import { differenceInCalendarDays, parseISO } from "date-fns";
import { readData } from "./store";
import { notifyAdmins } from "./manager-notifications";
import { listLeave } from "./leave";
import { forEachSchoolTenant, sweepLessonReminders, sweepUpcomingLessons } from "./lesson-notifications";
import { formatMoney } from "./utils";
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
    const data = await readData();
    for (const p of data.payments) {
      if (p.status !== "pending") continue;
      const anchor = p.createdAt || p.dueDate;
      if (!anchor) continue;
      const age = differenceInCalendarDays(now, parseISO(anchor));
      if (age < PENDING_DAYS) continue;
      const remaining = Math.max(p.amount - p.paidAmount, 0);
      await notifyAdmins(
        tenantId,
        "payment_failed_or_pending",
        {
          title: "Bekleyen ödeme",
          body: `Ödeme ${p.id} ${age} gündür beklemede (${formatMoney(remaining)}). Detay: /panel/odemeler`,
        },
        { dedupeKey: p.id }
      );
      created++;
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
 */
export async function runNotificationSweeps(
  now = new Date()
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
  const payment = await runStage("paymentPending", () => sweepPaymentFailedOrPending(now));
  const leave = await runStage("leavePending", () => sweepLeavePendingApproval());
  const contract = await runStage("contractExpiry", () => sweepStudentContractExpiry(now));

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
