import { timingSafeEqual } from "node:crypto";
import { PLATFORM_TENANT_ID } from "@/lib/auth/config";
import { appendPlatformAudit } from "@/lib/platform/store";
import { collectDueSubscriptions } from "@/lib/saas-billing/scheduler";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/platform/jobs/saas-collections
 * MERCHANT_SCHEDULED vade tahsilatı — yetkili job endpoint'i (retention
 * deseni): `Authorization: Bearer $BILLING_CRON_SECRET` (veya Vercel
 * Cron'un `$CRON_SECRET`). Varsayılan dry-run; `?apply=1` ile çeker.
 * Zamanlama: vercel.json → günlük. Batch varsayılan 25 (en fazla 100).
 * Secret zaman-korumalı karşılaştırılır; loglanmaz, istemciye açılmaz.
 */
function allowedSecrets(): string[] {
  return [process.env.BILLING_CRON_SECRET, process.env.CRON_SECRET].filter(
    (v): v is string => Boolean(v && v.length >= 16)
  );
}

function secretMatches(token: string, secrets: string[]): boolean {
  const t = Buffer.from(token, "utf8");
  for (const s of secrets) {
    const b = Buffer.from(s, "utf8");
    if (b.length === t.length && timingSafeEqual(b, t)) return true;
  }
  return false;
}

export async function GET(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const secrets = allowedSecrets();
  if (secrets.length === 0 || !secretMatches(token, secrets)) {
    return Response.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Yetkisiz job çağrısı." } },
      { status: 401 }
    );
  }
  const url = new URL(request.url);
  const apply = url.searchParams.get("apply") === "1";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 25) || 25, 1), 100);
  const res = await collectDueSubscriptions({ limit, dryRun: !apply });
  if (!res.ok) {
    return Response.json(
      { ok: false, error: { code: res.error.code, message: res.error.message } },
      { status: 500 }
    );
  }
  await appendPlatformAudit({
    actorUserId: "cron",
    actorRole: "SYSTEM_CRON",
    actorTenantId: PLATFORM_TENANT_ID,
    targetTenantId: null,
    action: apply ? "saas.job.collect" : "saas.job.collect_dryrun",
    entityType: "saas_job",
    entityId: url.pathname,
    before: null,
    after: { due: res.data.due, charged: res.data.charged, failed: res.data.failed, uncertain: res.data.uncertain },
    requestId: `job-${Date.now()}`,
    outcome: "success",
  });
  return Response.json({ ok: true, data: res.data });
}
