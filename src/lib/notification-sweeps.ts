import { readPaymentsPageData } from "./store";
import { isDbMode } from "./config";
import { listTerminalContractIds } from "./contracts";
import { PAYMENT_REMINDER_SELECT, resolvePaymentReminderSettings, shouldCreatePaymentReminder } from "./payment-reminder-policy";
import type { CollectionsSettings, Payment } from "./types";
import { notifyAdmins } from "./manager-notifications";
import { listLeave } from "./leave";
import { forEachSchoolTenant, sweepLessonReminders, sweepUpcomingLessons } from "./lesson-notifications";
import { formatDate, formatMoney } from "./utils";
import { paymentTargetHref } from "./notification-href";
import { safeErrorFields } from "./logger";

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

type ReminderCandidate = Pick<
  Payment,
  "id" | "studentId" | "status" | "contractId" | "dueDate" | "amount" | "paidAmount" | "description" | "installmentPeriodLabel"
>;

/**
 * Kurumun hatırlatma ayarı + YALNIZ aday ödemeler (canlı borç, vadesi `today + daysBefore`'a kadar) ve onların öğrenci
 * adları. DB egress (2026-10-20): eskiden tüm ödemeler × ~31 kolon + referans veri okunuyordu; artık 9 kolon, aday satır.
 */
async function readReminderCandidates(tenantId: string, now: Date) {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const school = await prisma.school.findFirst({ where: { tenantId }, select: { collectionsSettings: true } });
    const settings = resolvePaymentReminderSettings(school?.collectionsSettings as CollectionsSettings | null);
    if (!settings.enabled) return { settings, payments: [] as ReminderCandidate[], names: new Map<string, string>() };
    const horizon = new Date(`${now.toISOString().slice(0, 10)}T23:59:59.999Z`);
    horizon.setUTCDate(horizon.getUTCDate() + settings.daysBefore);
    const rows = await prisma.payment.findMany({
      where: { tenantId, status: { notIn: ["paid", "voided"] }, dueDate: { lte: horizon } },
      select: PAYMENT_REMINDER_SELECT,
    });
    const payments: ReminderCandidate[] = rows.map((r) => ({
      ...r,
      status: r.status as Payment["status"],
      dueDate: r.dueDate.toISOString(),
      contractId: r.contractId ?? undefined,
      installmentPeriodLabel: r.installmentPeriodLabel ?? undefined,
    }));
    const ids = [...new Set(payments.map((p) => p.studentId))];
    const students = ids.length
      ? await prisma.student.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true } })
      : [];
    return { settings, payments, names: new Map(students.map((st) => [st.id, st.name])) };
  }
  const data = await readPaymentsPageData();
  return {
    settings: resolvePaymentReminderSettings(data.settings.collectionsSettings),
    payments: data.payments as ReminderCandidate[],
    names: new Map(data.students.map((st) => [st.id, st.name])),
  };
}

export async function sweepPaymentFailedOrPending(now = new Date()): Promise<{ created: number; tenantErrors: number }> {
  // Acil fren: yalnız bu kategori (diğer bildirimler sürer). Vercel'de env değişikliği yeniden deploy ister.
  if (process.env.NEVII_PAYMENT_REMINDERS === "0") return { created: 0, tenantErrors: 0 };
  const startedAt = Date.now();
  let created = 0;
  let candidates = 0;
  let suppressed = 0;
  const tenantErrors = await forEachSchoolTenant("paymentPending", async (tenantId) => {
    const { settings, payments, names } = await readReminderCandidates(tenantId, now);
    if (payments.length === 0) return;
    const terminal = await listTerminalContractIds(tenantId);
    for (const p of payments) {
      const decision = shouldCreatePaymentReminder(p, settings, terminal, now);
      if (!decision) continue;
      candidates++;
      const { daysUntilDue: d, remaining } = decision;
      // 2026-10-15 — kimden/ne için/ne kadar/vade; teknik kimlik yalnız "Detay:" hedefinde (ekranda gizlenir,
      // tekilleştirme `body.includes(p.id)` ile aynen çalışır). Push yok — yalnız yönetici uygulama içi bildirimi.
      const who = names.get(p.studentId) ?? "Öğrenci kaydı bulunamadı";
      const what = p.installmentPeriodLabel ?? p.description ?? "Ödeme";
      const when = d > 0 ? `vadeye ${d} gün var` : d === 0 ? "vadesi bugün" : `vade ${formatDate(p.dueDate)}, ${-d} gün gecikti`;
      const outcomes = await notifyAdmins(
        tenantId,
        "payment_failed_or_pending",
        {
          title: d > 0 ? "Yaklaşan ödeme" : "Bekleyen ödeme",
          body: `${who} — ${what}: ${formatMoney(remaining)} ödeme bekliyor (${when}). Detay: ${paymentTargetHref(p.studentId, p.id)}`,
        },
        // Pencere = aşama başından bugüne: aynı aşamada ikinci bildirim yok (bkz. payment-reminder-policy.ts).
        { dedupeKey: p.id, windowMs: Math.max(Date.now() - decision.since.getTime(), 0) }
      );
      // Yalnız gerçekten yazılan bildirim sayılır (eskiden yinelenen/atlanan da "created" sayılıyordu).
      if (outcomes.includes("created")) created++;
      else suppressed++;
    }
  });
  // Tek satır özet; ad/tutar/not gibi kişi verisi yok.
  console.info("[notifications.payment.sweep]", { candidates, created, suppressed, tenantErrors, durationMs: Date.now() - startedAt });
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
