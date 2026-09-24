import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { jsonFail } from "@/lib/api/http";
import { runRetentionCleanup } from "@/lib/platform/retention";
import { PLATFORM_TENANT_ID } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/platform/jobs/retention — zamanlanmış log temizliği.
 *
 * Kullanıcı oturumu KULLANMAZ; `Authorization: Bearer $RETENTION_CRON_SECRET`
 * (veya Vercel Cron'un otomatik gönderdiği `$CRON_SECRET`).
 * Secret tanımlı değilse fail-closed 503. Varsayılan DRY-RUN; gerçek silme
 * yalnız `?apply=1` ile. Kritik audit kategorileri hiçbir koşulda silinmez.
 * Zamanlama: vercel.json → her gün 00:30 UTC (03:30 TR), GET + apply=1.
 * Vercel Cron yalnız production deployment'ında çalışır.
 */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

function acceptedSecrets(): string[] {
  return [process.env.RETENTION_CRON_SECRET, process.env.CRON_SECRET].filter((v): v is string => Boolean(v && v.length >= 16));
}

async function run(request: Request) {
  const secrets = acceptedSecrets();
  if (secrets.length === 0) {
    return NextResponse.json({ ok: false, error: { code: "UNAVAILABLE", message: "Bu iş şu anda kullanılamıyor." } }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token || !secrets.some((s) => safeEqual(token, s))) return jsonFail("UNAUTHORIZED", "Geçersiz veya eksik yetkilendirme.");
  const apply = new URL(request.url).searchParams.get("apply") === "1";
  const report = await runRetentionCleanup({ userId: "cron", role: "SYSTEM", tenantId: PLATFORM_TENANT_ID, requestId: "cron-retention" }, { dryRun: !apply });
  return NextResponse.json({ ok: true, data: report });
}

/** Manuel/operatör tetiklemesi. */
export async function POST(request: Request) {
  return run(request);
}

/** Vercel Cron (GET). */
export async function GET(request: Request) {
  return run(request);
}
