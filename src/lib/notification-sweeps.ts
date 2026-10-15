import { differenceInCalendarDays, parseISO } from "date-fns";
import { listTenants, readData } from "./store";
import { runWithTenantAsync } from "./tenant-context";
import { notifyAdmins } from "./manager-notifications";
import { listLeave } from "./leave";
import { sweepLessonReminders, sweepUpcomingLessons } from "./lesson-notifications";
import { formatMoney } from "./utils";
import { logger } from "./logger";

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
};

/** Öğrenci sözleşmesi bitiş uyarısı — tüm kurumlar (bkz. student-contract-expiry.ts). */
export async function sweepStudentContractExpiry(now = new Date()): Promise<number> {
  const { runStudentContractExpiryCheck } = await import("./student-contract-expiry");
  let created = 0;
  const tenants = await listTenants();
  for (const t of tenants.slice(0, 200)) {
    await runWithTenantAsync(t.tenantId, async () => {
      created += (await runStudentContractExpiryCheck(t.tenantId, now)).created;
    });
  }
  return created;
}

export async function sweepPaymentFailedOrPending(now = new Date()): Promise<{ created: number; tenantErrors: number }> {
  let created = 0;
  let tenantErrors = 0;
  const tenants = await listTenants();
  for (const t of tenants.slice(0, 200)) {
    try {
      await runWithTenantAsync(t.tenantId, async () => {
        const data = await readData();
        for (const p of data.payments) {
          if (p.status !== "pending") continue;
          const anchor = p.createdAt || p.dueDate;
          if (!anchor) continue;
          const age = differenceInCalendarDays(now, parseISO(anchor));
          if (age < PENDING_DAYS) continue;
          const remaining = Math.max(p.amount - p.paidAmount, 0);
          await notifyAdmins(
            t.tenantId,
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
    } catch (err) {
      // Tek tenant'ın bozuk verisi/hatası diğer 199 tenant'ı engellemez;
      // neden sunucu log'unda (PII: yalnız tenantId + hata mesajı).
      tenantErrors++;
      logger.error(`notification-sweep payment tenant hatası [${t.tenantId}]`, err);
    }
  }
  return { created, tenantErrors };
}

export async function sweepLeavePendingApproval(): Promise<{ created: number; tenantErrors: number }> {
  let created = 0;
  let tenantErrors = 0;
  const tenants = await listTenants();
  for (const t of tenants.slice(0, 200)) {
    try {
      await runWithTenantAsync(t.tenantId, async () => {
        const leaves = await listLeave(t.tenantId);
        for (const leave of leaves) {
          if (leave.status !== "pending_approval") continue;
          await notifyAdmins(
            t.tenantId,
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
    } catch (err) {
      tenantErrors++;
      logger.error(`notification-sweep leave tenant hatası [${t.tenantId}]`, err);
    }
  }
  return { created, tenantErrors };
}

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
      console.error("[notifications.sweep.stage.failed]", {
        stage,
        errorName:
          error instanceof Error ? error.name : "UnknownError",
      });
      throw error;
    }
  }

  const upcoming = await runStage(
    "upcomingLessons",
    () => sweepUpcomingLessons(now)
  );

  const reminders = await runStage(
    "lessonReminders",
    () => sweepLessonReminders(now)
  );

  const payment = await runStage(
    "paymentPending",
    () => sweepPaymentFailedOrPending(now)
  );

  const leave = await runStage(
    "leavePending",
    () => sweepLeavePendingApproval()
  );

  const contractExpiring = await runStage(
    "contractExpiry",
    () => sweepStudentContractExpiry(now)
  );

  return {
    upcoming,
    reminders,
    paymentPending: payment.created,
    leavePending: leave.created,
    paymentTenantErrors: payment.tenantErrors,
    leaveTenantErrors: leave.tenantErrors,
    contractExpiring,
  };
}
