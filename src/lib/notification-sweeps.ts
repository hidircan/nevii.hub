import { differenceInCalendarDays, parseISO } from "date-fns";
import { listTenants, readData } from "./store";
import { runWithTenantAsync } from "./tenant-context";
import { notifyAdmins } from "./manager-notifications";
import { listLeave } from "./leave";
import { sweepUpcomingLessons } from "./lesson-notifications";
import { formatMoney } from "./utils";

const PENDING_DAYS = 7;

export type NotificationSweepSummary = {
  upcoming: Awaited<ReturnType<typeof sweepUpcomingLessons>>;
  paymentPending: number;
  leavePending: number;
};

export async function sweepPaymentFailedOrPending(now = new Date()): Promise<number> {
  let created = 0;
  const tenants = await listTenants();
  for (const t of tenants.slice(0, 200)) {
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
  }
  return created;
}

export async function sweepLeavePendingApproval(): Promise<number> {
  let created = 0;
  const tenants = await listTenants();
  for (const t of tenants.slice(0, 200)) {
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
          { dedupeKey: leave.id }
        );
        created++;
      }
    });
  }
  return created;
}

export async function runNotificationSweeps(now = new Date()): Promise<NotificationSweepSummary> {
  const upcoming = await sweepUpcomingLessons(now);
  const paymentPending = await sweepPaymentFailedOrPending(now);
  const leavePending = await sweepLeavePendingApproval();
  return { upcoming, paymentPending, leavePending };
}
