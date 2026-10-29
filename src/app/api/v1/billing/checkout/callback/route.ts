import { logger } from "@/lib/logger";
import { getSaasProvider } from "@/lib/saas-billing/provider-adapter";
import {
  getSaasSubscriptionById,
  upsertSaasSubscription,
} from "@/lib/saas-billing/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/checkout/callback
 * Hosted-checkout dönüşü buraya POST edilir (form alanları: `token`,
 * `conversationId`). Adaptör, conversationId'deki ABONELİĞİN kayıtlı
 * sağlayıcısından çözülür — global ayar değişimi eski işlemlerin
 * doğrulamasını etkilemez (provider-pin).
 *
 * KRİTİK: bu dönüş "başarılı" olsa bile ÖDEME KANITI DEĞİLDİR. Yalnızca
 * server-to-server retrieve ile abonelik referansı doğrulanır ve kayda
 * İŞLENİR (statü pending kalır); "active" geçişi SADECE imzalı webhook ile
 * olur. Tenant eşleşmesi conversationId'deki abonelik kimliğinden yapılır
 * (istemci iddiasından değil).
 */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  let token = "";
  let conversationId = "";
  try {
    const form = await request.formData();
    token = String(form.get("token") ?? "");
    conversationId = String(form.get("conversationId") ?? "");
  } catch {
    return Response.redirect(`${origin}/abonelik/sonuc?status=error`, 303);
  }
  return handleCallback(origin, token, conversationId);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return handleCallback(
    url.origin,
    url.searchParams.get("token") || "",
    url.searchParams.get("conversationId") || ""
  );
}

async function handleCallback(origin: string, token: string, conversationId: string) {
  const pendingUrl = `${origin}/abonelik/sonuc?status=pending`;
  if (!token) return Response.redirect(`${origin}/abonelik/sonuc?status=error`, 303);

  // conversationId = "<subscriptionId>:<random>" (checkout route üretir).
  const subscriptionId = conversationId.split(":")[0] || "";
  if (!subscriptionId.startsWith("saas_sub_")) {
    logger.warn("saas.callback.unknown_conversation", conversationId.slice(0, 24));
    return Response.redirect(pendingUrl, 303);
  }
  const sub = await getSaasSubscriptionById(subscriptionId);
  if (!sub) {
    logger.warn("saas.callback.unknown_subscription", subscriptionId);
    return Response.redirect(pendingUrl, 303);
  }
  // Adaptör aboneliğin KAYITLI sağlayıcısından çözülür (provider-pin).
  const { hasCapability } = await import("@/lib/saas-billing/providers");
  const provider = getSaasProvider(sub.provider);
  if (!hasCapability(provider, "retrieve_by_token")) {
    logger.warn("saas.callback.no_retrieve", sub.provider);
    return Response.redirect(pendingUrl, 303);
  }
  const res = await provider.retrieveCheckoutResult(token, conversationId || undefined);
  if (!res.ok) {
    logger.warn("saas.callback.retrieve_failed", res.error);
    // Timeout/kesinti "ödenmedi" kanıtı değil → "doğrulama bekleniyor".
    return Response.redirect(pendingUrl, 303);
  }
  // Mock referanslar gerçek kayda yazılmaz.
  if (!res.mock) {
    await upsertSaasSubscription({
      ...sub,
      providerCustomerRef: res.customerRef,
      providerSubscriptionRef: res.subscriptionRef,
      updatedAt: new Date().toISOString(),
    });
  }
  return Response.redirect(pendingUrl, 303);
}
