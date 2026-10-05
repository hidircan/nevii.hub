import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { jsonFail } from "@/lib/api/http";
import { listTenants } from "@/lib/store";
import { runWithTenantAsync } from "@/lib/tenant-context";
import { runStandaloneMonthlyAccrual } from "@/lib/standalone-monthly-accrual";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/v1/platform/jobs/monthly-accrual — sözleşmesiz öğrencilerin içinde bulunulan ay
 * borcu (bkz. standalone-monthly-accrual.ts). Kimlik doğrulama retention işiyle aynı
 * (`RETENTION_CRON_SECRET` / Vercel `CRON_SECRET`, fail-closed). Varsayılan DRY-RUN; yazım yalnız
 * `?apply=1`. İdempotent: aynı ay için ikinci satır açılmaz. Zamanlama: vercel.json, her gün 01:00 UTC.
 */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

async function run(request: Request) {
  const secrets = [process.env.RETENTION_CRON_SECRET, process.env.CRON_SECRET].filter(
    (v): v is string => Boolean(v && v.length >= 16)
  );
  if (secrets.length === 0) {
    return NextResponse.json({ ok: false, error: { code: "UNAVAILABLE", message: "Bu iş şu anda kullanılamıyor." } }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token || !secrets.some((s) => safeEqual(token, s))) return jsonFail("UNAUTHORIZED", "Geçersiz veya eksik yetkilendirme.");
  const apply = new URL(request.url).searchParams.get("apply") === "1";
  const report: { tenantId: string; month: string; planned: number; created: number }[] = [];
  for (const t of (await listTenants()).slice(0, 200)) {
    const r = await runWithTenantAsync(t.tenantId, () => runStandaloneMonthlyAccrual(t.tenantId, { apply }));
    // Yanıtta öğrenci kimliği/tutar dökümü yok — yalnız sayılar (ayrıntı audit'te).
    report.push({ tenantId: t.tenantId, month: r.month, planned: r.planned.length, created: r.created });
  }
  return NextResponse.json({ ok: true, data: { apply, tenants: report } });
}

export async function POST(request: Request) {
  return run(request);
}

/** Vercel Cron (GET). */
export async function GET(request: Request) {
  return run(request);
}
