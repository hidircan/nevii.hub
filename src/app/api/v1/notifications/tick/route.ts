import { createHash, timingSafeEqual } from "crypto";
import { jsonFail } from "@/lib/api/http";
import { recordAuditLog } from "@/lib/audit/log";
import { uid } from "@/lib/utils";
import { runNotificationSweeps } from "@/lib/notification-sweeps";
import { safeErrorFields } from "@/lib/logger";

export const dynamic = "force-dynamic";

function timingSafeStringEqual(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

function extractBearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/**
 * POST /api/v1/notifications/tick — yaklaşan ders, bekleyen ödeme, bekleyen izin.
 * Secret: NOTIFICATION_CRON_SECRET (fail-closed). JWT kabul edilmez.
 */
export async function POST(request: Request) {
  const requestId = uid("audit");
  const configured = process.env.NOTIFICATION_CRON_SECRET;
  if (!configured) {
    void recordAuditLog({
      tenantId: "system",
      actorUserId: "cron",
      actorRole: "SYSTEM",
      action: "notifications.tick",
      entityType: "NotificationSweep",
      entityId: requestId,
      outcome: "denied",
      meta: { reason: "secret_not_configured" },
    });
    // Public yanıt env değişkeni adı taşımaz; neden audit'te (secret_not_configured).
    return jsonFail("FORBIDDEN", "Geçersiz tick kimliği.");
  }
  const provided = extractBearer(request);
  if (!provided || !timingSafeStringEqual(provided, configured)) {
    void recordAuditLog({
      tenantId: "system",
      actorUserId: "cron",
      actorRole: "SYSTEM",
      action: "notifications.tick",
      entityType: "NotificationSweep",
      entityId: requestId,
      outcome: "denied",
      meta: { reason: "bad_secret" },
    });
    return jsonFail("FORBIDDEN", "Geçersiz tick kimliği.");
  }
  try {
    const summary = await runNotificationSweeps();
    void recordAuditLog({
      tenantId: "system",
      actorUserId: "cron",
      actorRole: "SYSTEM",
      action: "notifications.tick",
      entityType: "NotificationSweep",
      entityId: requestId,
      outcome: summary.tenantErrors > 0 ? "error" : "success",
      meta: {
        tenantErrors: summary.tenantErrors,
        upcomingCreated: summary.upcoming.created,
        remindersCreated: summary.reminders.created,
        remindersDuplicate: summary.reminders.duplicate,
        remindersPushSent: summary.reminders.pushSent,
        paymentPending: summary.paymentPending,
        leavePending: summary.leavePending,
        paymentTenantErrors: summary.paymentTenantErrors,
        leaveTenantErrors: summary.leaveTenantErrors,
        contractExpiring: summary.contractExpiring,
      },
    });
    if (summary.tenantErrors > 0) {
      // Diğer kurumlar işlendi ama koşu "başarılı" sayılmaz: cron kırmızı görünsün, sayaçlar gövdede.
      // Kurum id + aşama + hata adı log'da: [notifications.sweep.tenant.failed].
      return Response.json(
        {
          ok: false,
          error: {
            code: "INTERNAL_ERROR",
            message: `Bildirim taraması ${summary.tenantErrors} kurumda tamamlanamadı; diğer kurumlar işlendi. Ayrıntı sunucu log'unda.`,
          },
          data: summary,
        },
        { status: 500 }
      );
    }
    return Response.json({ ok: true, data: summary });
  } catch (error: unknown) {
    // Mesaj/stack ilk satırı log'a girmez (sorgu argümanı, kişi verisi taşıyabilir) — bkz. safeErrorFields.
    console.error("[notifications.tick.failed]", { requestId, ...safeErrorFields(error) });

    return jsonFail("INTERNAL_ERROR", "Bildirim taraması başarısız.");
  }
}
