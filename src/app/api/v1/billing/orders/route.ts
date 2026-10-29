import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/client-ip";
import {
  createPendingOrder,
  getOrderPublicView,
  updatePendingOrder,
} from "@/lib/saas-billing/pending-orders";

export const dynamic = "force-dynamic";

function rateLimited(request: Request, key: string): Response | null {
  if (!consumeRateLimit(key, clientIp(request), { windowMs: 3600_000, max: 20 })) {
    return Response.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "Çok fazla istek. Lütfen daha sonra tekrar deneyin." } },
      { status: 429 }
    );
  }
  return null;
}

async function readBody(request: Request): Promise<{ body: unknown } | { err: Response }> {
  try {
    return { body: await request.json() };
  } catch {
    return {
      err: Response.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "Geçersiz JSON." } },
        { status: 400 }
      ),
    };
  }
}

function failStatus(code: string): number {
  if (code === "NOT_FOUND") return 404;
  if (code === "FORBIDDEN" || code === "PROVIDER_NOT_READY") return 403;
  return 400;
}

/**
 * POST /api/v1/billing/orders — Adım 2 kaydı (loginless).
 * Kullanıcı/tenant AÇMAZ, ödeme BAŞLATMAZ. Ham token yalnız bu yanıtta döner.
 */
export async function POST(request: Request) {
  const rl = rateLimited(request, "pending-order-create");
  if (rl) return rl;
  const b = await readBody(request);
  if ("err" in b) return b.err;
  const res = await createPendingOrder({ input: b.body });
  if (!res.ok) {
    return Response.json(
      { ok: false, error: { code: res.error.code, message: res.error.message } },
      { status: failStatus(res.error.code) }
    );
  }
  const d = res.data;
  if (d.outcome === "email_taken") {
    return Response.json(
      {
        ok: false,
        error: {
          code: "EMAIL_TAKEN",
          message: "Bu e-posta ile kayıtlı bir hesap var. Mevcut müşteri girişiyle aynı seçimle devam edin.",
        },
      },
      { status: 409 }
    );
  }
  if (d.outcome === "pending_exists") {
    return Response.json(
      {
        ok: false,
        error: {
          code: "PENDING_EXISTS",
          message:
            "Bu e-posta ile bekleyen bir kaydınız var. Kaydı oluşturduğunuz sekmeden devam edin; " +
            "bağlantıyı kaybettiyseniz kayıt süresi dolunca (24 saat) yeniden başlayabilirsiniz.",
        },
      },
      { status: 409 }
    );
  }
  return Response.json({
    ok: true,
    data: { orderId: d.order.id, token: d.token, replayed: d.outcome === "replayed" },
  });
}

/** GET /api/v1/billing/orders?t=... — token sahibine maskeli görünüm. */
export async function GET(request: Request) {
  const rl = rateLimited(request, "pending-order-read");
  if (rl) return rl;
  const t = new URL(request.url).searchParams.get("t") ?? "";
  const res = await getOrderPublicView({ token: t });
  if (!res.ok) {
    return Response.json(
      { ok: false, error: { code: res.error.code, message: res.error.message } },
      { status: failStatus(res.error.code) }
    );
  }
  return Response.json({ ok: true, data: res.data });
}

/** PUT /api/v1/billing/orders — Adım 3 "düzenle" dönüşü (token + ödeme bekleyen). */
export async function PUT(request: Request) {
  const rl = rateLimited(request, "pending-order-update");
  if (rl) return rl;
  const b = await readBody(request);
  if ("err" in b) return b.err;
  const { t, ...input } = (b.body as Record<string, unknown>) ?? {};
  const res = await updatePendingOrder({ token: String(t ?? ""), input });
  if (!res.ok) {
    return Response.json(
      { ok: false, error: { code: res.error.code, message: res.error.message } },
      { status: failStatus(res.error.code) }
    );
  }
  return Response.json({ ok: true, data: { orderId: res.data.id } });
}
