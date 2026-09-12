import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { jsonFail } from "@/lib/api/http";
import { runRetentionCleanup } from "@/lib/platform/retention";
import { PLATFORM_TENANT_ID } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/platform/jobs/retention — zamanlanmış log temizliği.
 *
 * Kullanıcı oturumu KULLANMAZ; `Authorization: Bearer $RETENTION_CRON_SECRET`.
 * Secret tanımlı değilse fail-closed 503. Varsayılan DRY-RUN; gerçek silme
 * yalnız `?apply=1` ile. Kritik audit kategorileri hiçbir koşulda silinmez.
 * Bu projede cron KURULMADI (vercel.json değişmedi) — öneri: günlük 03:00.
 */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

export async function POST(request: Request) {
  const secret = process.env.RETENTION_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: { code: "NOT_CONFIGURED", message: "Retention işi yapılandırılmamış (RETENTION_CRON_SECRET yok)." } }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token || !safeEqual(token, secret)) return jsonFail("UNAUTHORIZED", "Geçersiz veya eksik yetkilendirme.");
  const apply = new URL(request.url).searchParams.get("apply") === "1";
  const report = await runRetentionCleanup({ userId: "cron", role: "SYSTEM", tenantId: PLATFORM_TENANT_ID, requestId: "cron-retention" }, { dryRun: !apply });
  return NextResponse.json({ ok: true, data: report });
}
