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
 * POST|GET /api/v1/notifications/tick — yaklaşan ders, bekleyen ödeme, bekleyen izin.
 * Secret (fail-closed, JWT kabul edilmez): NOTIFICATION_CRON_SECRET (eski GitHub Actions POST'u) veya
 * Vercel'in `CRON_SECRET`'ı. 2026-10-16: zamanlayıcı Vercel Cron'a taşındı (vercel.json: her 10 dk `?stages=lessons`,
 * günde bir tam tur). 2026-10-18 (Active CPU + egress): 10 dk'lık tur yalnız 04–18 UTC (07:00–21:59 TR) — 1 sa/15 dk
 * hatırlatma ve 15–90 dk "yaklaşan ders" 08:00–22:00 TR arası başlayan dersleri kapsar (canlı dersler 10:00–19:59 TR).
 * Daha erken/geç ders başlarsa vercel.json + apps/cloudflare-cron'daki saat aralığını genişletin.
 * Çift tetiklenme güvenli: bildirimler tekilleştirme anahtarı + günlük satır kimliğiyle idempotent.
 */
async function tick(request: Request) {
  const requestId = uid("audit");
  const configured = [process.env.NOTIFICATION_CRON_SECRET, process.env.CRON_SECRET].filter((s): s is string => Boolean(s));
  if (configured.length === 0) {
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
  if (!provided || !configured.some((secret) => timingSafeStringEqual(provided, secret))) {
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
    // `?stages=lessons` → yalnız ders hatırlatmaları (10 dk'lık Vercel Cron); parametresiz → tam tur (günlük cron, elle POST).
    const stages = new URL(request.url).searchParams.get("stages") === "lessons" ? "lessons" : "all";
    const summary = await runNotificationSweeps(new Date(), { stages });
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

export const POST = tick;
/** Vercel Cron GET gönderir (`Authorization: Bearer $CRON_SECRET`). Yanıt önbelleğe alınmaz (force-dynamic). */
export const GET = tick;
