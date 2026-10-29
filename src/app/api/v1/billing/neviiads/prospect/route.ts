import { importProspectAsPurchaseRequest } from "@/lib/saas-billing/neviiads-import";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/client-ip";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/neviiads/prospect
 * NeviiHub'da henüz olmayan kurumun teklifini satın alma başvurusu olarak
 * aktarır (`/platform/basvurular`). Tenant açmaz, ödeme başlatmaz; aktarım
 * jetonu (`X-NeviiAds-Import-Token`) ile.
 */
export async function POST(request: Request) {
  if (!consumeRateLimit("neviiads-import", clientIp(request), { windowMs: 60_000, max: 10 })) {
    return Response.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "Çok sık aktarım denendi. Bir dakika sonra tekrar deneyin." } },
      { status: 429 }
    );
  }
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Geçersiz JSON." } },
      { status: 400 }
    );
  }
  const res = await importProspectAsPurchaseRequest({
    token: request.headers.get("x-neviiads-import-token"),
    input: body,
  });
  if (!res.ok) {
    const status =
      res.error.code === "FORBIDDEN" ? 403 : res.error.code === "NOT_FOUND" ? 404 : 400;
    return Response.json(
      { ok: false, error: { code: res.error.code, message: res.error.message } },
      { status }
    );
  }
  return Response.json({ ok: true, data: res.data });
}
