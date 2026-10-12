import { withApiHandler } from "@/lib/api/handler";
import { enforceUserRateLimit } from "@/lib/api/rate-limit-guard";
import { jsonFail } from "@/lib/api/http";
import { recordAuditLog } from "@/lib/audit/log";
import { ok } from "@/lib/services/result";
import { deliverPushForUser } from "@/lib/push/sender";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/mobile/push-test — oturum sahibinin KENDİ cihazlarına tek
 * test bildirimi. YALNIZ development/test: production'da rota yokmuş gibi
 * (auth ÖNCESİ) NOT_FOUND döner. Başka kullanıcıya gönderim parametresi
 * YOK (hedef her zaman ctx.userId). Rate limit + audit.
 */
const authedPOST = withApiHandler(async ({ ctx }) => {
  const limited = enforceUserRateLimit("mobile-push-test", ctx.userId, { windowMs: 3_600_000, max: 5 });
  if (limited) return limited;
  const result = await deliverPushForUser(
    ctx.tenantId,
    ctx.userId,
    "test_push",
    {
      title: "Nevii Hub test bildirimi",
      body: "Cihazın push bildirimleri çalışıyor.",
      data: { kind: "test_push" },
      channelId: "lesson-reminders",
    },
    { ignorePreference: true }
  );
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "mobile.push-test",
    entityType: "DevicePushToken",
    entityId: ctx.userId,
    outcome: result.outcome === "sent" ? "success" : "denied",
    meta: { outcome: result.outcome, sent: result.sent, invalidated: result.invalidated },
  });
  if (result.outcome === "sent") return ok({ sent: result.sent });
  if (result.outcome === "token-invalid" || result.invalidated > 0) {
    return jsonFail("CONFLICT", "Kayıtlı cihaz bulunamadı. Bildirim iznini açıp tekrar deneyin.");
  }
  return jsonFail("CONFLICT", "Test bildirimi gönderilemedi (cihaz kaydı veya push yapılandırması eksik).");
});

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return jsonFail("NOT_FOUND", "Bulunamadı.");
  }
  return (authedPOST as (req: Request) => Promise<Response>)(request);
}
