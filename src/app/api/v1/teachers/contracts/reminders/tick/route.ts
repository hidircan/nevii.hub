import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { jsonFail } from "@/lib/api/http";
import { runTeacherContractReminderTick } from "@/lib/teacher-contract-reminder-tick";
import { recordAuditLog } from "@/lib/audit/log";
import { uid } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/teachers/contracts/reminders/tick — öğretmen sözleşme bitiş
 * hatırlatma motorunu tetikler (PRODUCT_BACKLOG §3.3).
 *
 * NEDEN AYRI BİR UÇ NOKTA VE AYRI SECRET (`/api/v1/tasks/reminders/tick`'e
 * eklenmiyor): İş Takip hatırlatma tick'i ile modül tanımı gereği ilgisiz —
 * o zaten kasıtlı olarak `/panel/workflows` (AI otomasyonu) ile
 * karıştırılmaz; aynı gerekçeyle bu da İş Takip'e karıştırılmaz. Güvenlik
 * deseni `/api/v1/tasks/reminders/tick` ile BİREBİR aynı (fail-closed secret,
 * timing-safe karşılaştırma, audit log, `force-dynamic`) — yalnız kendi ayrı
 * env değişkeni (`TEACHER_CONTRACT_REMINDER_CRON_SECRET`) ile.
 *
 * GÜVENLİK — fail-closed: env değişkeni tanımlı DEĞİLSE istek ne olursa
 * olsun reddedilir. Tanımlıysa `Authorization: Bearer <secret>`
 * `timingSafeEqual` ile (basit `===` DEĞİL) karşılaştırılır. Normal bir
 * kullanıcı JWT'si burada GEÇERSİZDİR — `authenticateRequest`/
 * `withApiHandler` KULLANILMAZ, bilinçli olarak ayrı bir (secret-only)
 * kimlik doğrulama yolu. Her çağrı (başarılı/başarısız)
 * `recordAuditLog`'a "teachers.contracts.reminders.tick" olarak yazılır.
 *
 * ÖNERİLEN SIKLIK: günlük tick yeterlidir — pencere 30 takvim günü ve
 * tekilleştirme kalıcı (teacherId+contractEndDate+recipientUserId) olduğundan
 * daha sık çağrı sonucu DEĞİŞTİRMEZ. Bu proje bir gerçek scheduler'a
 * BAĞLANMADI — yalnızca uç nokta belgelenir, asıl zamanlama (Vercel Cron /
 * harici cron) deploy aşamasında ayarlanır.
 */

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

export async function POST(request: Request) {
  const requestId = uid("audit");
  const configuredSecret = process.env.TEACHER_CONTRACT_REMINDER_CRON_SECRET;

  if (!configuredSecret) {
    void recordAuditLog({
      tenantId: "system",
      actorUserId: "cron",
      actorRole: "SYSTEM",
      action: "teachers.contracts.reminders.tick",
      entityType: "TeacherContractReminderTick",
      entityId: requestId,
      outcome: "denied",
      meta: { reason: "secret_not_configured" },
    });
    return jsonFail(
      "FORBIDDEN",
      "Sözleşme hatırlatma tick'i yapılandırılmamış (TEACHER_CONTRACT_REMINDER_CRON_SECRET eksik)."
    );
  }

  const provided = extractBearer(request);
  if (!provided || !timingSafeStringEqual(provided, configuredSecret)) {
    void recordAuditLog({
      tenantId: "system",
      actorUserId: "cron",
      actorRole: "SYSTEM",
      action: "teachers.contracts.reminders.tick",
      entityType: "TeacherContractReminderTick",
      entityId: requestId,
      outcome: "denied",
      meta: { reason: "invalid_secret" },
    });
    return jsonFail("UNAUTHORIZED", "Geçersiz veya eksik yetkilendirme.");
  }

  try {
    const summary = await runTeacherContractReminderTick();
    void recordAuditLog({
      tenantId: "system",
      actorUserId: "cron",
      actorRole: "SYSTEM",
      action: "teachers.contracts.reminders.tick",
      entityType: "TeacherContractReminderTick",
      entityId: requestId,
      outcome: "success",
      meta: {
        tenantsProcessed: summary.tenantsProcessed,
        teachersEvaluated: summary.teachersEvaluated,
        remindersCreated: summary.remindersCreated,
        duplicatesSkipped: summary.duplicatesSkipped,
        skipped: summary.skipped,
        errors: summary.errors,
      },
    });
    return NextResponse.json({ ok: true, data: summary }, { status: 200 });
  } catch (e) {
    void recordAuditLog({
      tenantId: "system",
      actorUserId: "cron",
      actorRole: "SYSTEM",
      action: "teachers.contracts.reminders.tick",
      entityType: "TeacherContractReminderTick",
      entityId: requestId,
      outcome: "error",
      meta: { message: e instanceof Error ? e.message : String(e) },
    });
    return jsonFail("INTERNAL_ERROR", "Sözleşme hatırlatma tick'i başarısız oldu.");
  }
}

/** Yalnızca POST — diğer method'lar reddedilir. */
export async function GET() {
  return jsonFail("VALIDATION_ERROR", "Yalnızca POST desteklenir.");
}
