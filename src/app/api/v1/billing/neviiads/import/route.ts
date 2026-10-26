import { importAcceptedProposal } from "@/lib/saas-billing/neviiads-import";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/client-ip";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/neviiads/import
 * "Kabul edilmiş teklifi aboneliğe aktar" — varsayılan KAPALI, kullanıcı
 * başlatımlı, dar kapsamlı jeton (`X-NeviiAds-Import-Token`) ile.
 *
 * Yalnız dar alan seti kabul edilir; tutar/"ödendi" güvenilmez; aynı
 * teklif idempotent; PDF/dosya yüklenmez; NeviiAds erişim durumu yazamaz.
 */
export async function POST(request: Request) {
  if (
    !consumeRateLimit("neviiads-import", clientIp(request), { windowMs: 60_000, max: 10 })
  ) {
    return Response.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
      { status: 429 }
    );
  }
  const token = request.headers.get("x-neviiads-import-token");
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Geçersiz JSON." } },
      { status: 400 }
    );
  }
  const res = await importAcceptedProposal({ token, input: body, createdBy: "neviiads-import" });
  if (!res.ok) {
    const status =
      res.error.code === "FORBIDDEN" ? 403 : res.error.code === "NOT_FOUND" ? 404 : 400;
    return Response.json(
      { ok: false, error: { code: res.error.code, message: res.error.message } },
      { status }
    );
  }
  return Response.json({
    ok: true,
    data: {
      invitationId: res.data.invitation.id,
      tenantId: res.data.invitation.tenantId,
      planKey: res.data.invitation.planKey,
      billingInterval: res.data.invitation.billingInterval,
      displayAmountMinor: res.data.invitation.displayAmountMinor,
      expiresAt: res.data.invitation.expiresAt,
      duplicate: res.data.duplicate,
      // Ham jeton YALNIZCA ilk yanıtta (tek gösterim).
      token: res.data.token,
    },
  });
}
