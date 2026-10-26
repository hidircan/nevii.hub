import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { fail, ok } from "@/lib/services/result";
import { getPricedPlan, prePaymentSummary } from "@/lib/saas-billing/catalog";
import { validateCampaignForTenant, redeemCampaign } from "@/lib/saas-billing/campaigns";
import { buildPriceSnapshot } from "@/lib/saas-billing/catalog";
import {
  getDefaultProviderForNew,
  getSaasProvider,
  newSaasIdempotencyKey,
} from "@/lib/saas-billing/provider-adapter";
import { clientIp } from "@/lib/http/client-ip";
import { getSaasSubscription, upsertSaasSubscription } from "@/lib/saas-billing/store";
import { addProviderLink, buildPendingSubscription } from "@/lib/saas-billing/subscriptions";
import { isSaasBillingInterval } from "@/lib/saas-billing/types";
import type { SaasBillingInterval } from "@/lib/saas-billing/types";
import { resolveTenantLimits } from "@/lib/platform/entitlements";
import { getPublishedCatalog } from "@/lib/platform/commercial-catalog";
import { getUserById } from "@/lib/auth/users";
import {
  getValidInvitation,
  markInvitationConsumed,
  resolveInvitationCampaign,
} from "@/lib/saas-billing/neviiads-import";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  planKey: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/),
  billingInterval: z.string().refine(isSaasBillingInterval, "Geçersiz periyot."),
  /** Ödeme öncesi koşul kabulü (tutar, periyot, yenileme, iptal) — zorunlu. */
  acceptedTerms: z.literal(true, "Ödeme koşulları açıkça kabul edilmeli."),
  /**
   * Kart saklama + otomatik çekim yetkisi — zorunlu, ayrı kaydedilir
   * (providerLinks.consent). Yoksa checkout açılmaz, sessizce farklı
   * akışa düşülmez.
   */
  acceptedRecurring: z.literal(true, "Otomatik tahsilat yetkisi açıkça verilmeli."),
  campaignCode: z.string().trim().max(80).nullable().optional(),
  /** NeviiAds davet jetonu (ham, tek kullanımlık). */
  invitationToken: z.string().min(10).max(200).nullable().optional(),
  customer: z.object({
    name: z.string().trim().min(2).max(60),
    surname: z.string().trim().min(2).max(60),
    gsmNumber: z.string().trim().min(10).max(20),
    identityNumber: z.string().trim().min(11).max(11),
    address: z.string().trim().min(5).max(200),
    city: z.string().trim().min(2).max(60),
    country: z.string().trim().min(2).max(60),
  }),
});

/**
 * POST /api/v1/billing/checkout
 * Kurum sahibi (SUPER_ADMIN) abonelik checkout'u başlatır.
 *
 * - Tutar/paket client'tan GÜVENİLMEZ: sunucu katalogdan yeniden çözer.
 * - Onaylı fiyat yoksa gerçek checkout KAPALI (approved=false → 409).
 * - Kart hosted checkout formunda alınır; PAN/CVV buraya ulaşmaz.
 * - Dönen form HTML'i gömülür; "başarılı dönüş" ödeme kanıtı değildir.
 */
export const POST = withApiHandler(
  async ({ ctx, body, request }) => {
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz istek.");
    }
    const v = parsed.data;
    const interval = v.billingInterval as SaasBillingInterval;

    // Davetli checkout: davet doğrulanır, plan/periyot davetle eşleşmek zorunda.
    let invitation: import("@/lib/saas-billing/types").SaasCheckoutInvitationRecord | null = null;
    if (v.invitationToken) {
      const invRes = await getValidInvitation({ token: v.invitationToken, tenantId: ctx.tenantId });
      if (!invRes.ok) return invRes;
      invitation = invRes.data;
      if (invitation.planKey !== v.planKey || invitation.billingInterval !== interval) {
        return fail("VALIDATION_ERROR", "Davet bu paket/periyot için geçerli değil.");
      }
      const invCampaign = await resolveInvitationCampaign(invitation);
      if (invCampaign && !v.campaignCode) {
        (v as { campaignCode?: string | null }).campaignCode = invCampaign.code;
      }
    }

    const plan = await getPricedPlan(v.planKey, interval);
    if (!plan) return fail("NOT_FOUND", "Paket bulunamadı veya pasif.");
    if (!plan.approved) {
      return fail(
        "FORBIDDEN",
        "Bu paketin onaylı fiyatı yok; gerçek checkout kapalı. Test tutarları SANDBOX olarak işaretlidir.",
        { sandbox: true }
      );
    }

    let amountMinor = plan.amountMinor;
    let campaignNote: string | null = null;
    if (v.campaignCode) {
      const val = await validateCampaignForTenant({
        code: v.campaignCode,
        tenantId: ctx.tenantId,
        interval,
        listAmountMinor: plan.amountMinor,
        renewalsUsed: 0,
      });
      if (!val.ok) return fail("VALIDATION_ERROR", val.error);
      amountMinor = val.amountMinor;
      campaignNote = val.note;
    }

    const user = await getUserById(ctx.userId);
    if (!user?.email) return fail("UNAUTHORIZED", "Doğrulanmış kullanıcı e-postası bulunamadı.");

    const existing = await getSaasSubscription(ctx.tenantId);
    // Mevcut abonelik kendi sağlayıcısında kalır; global varsayılan YALNIZCA
    // YENİ abonelikler içindir ve eskileri sessizce taşımaz.
    const providerId =
      existing && existing.provider !== "none" ? existing.provider : getDefaultProviderForNew();
    const provider = getSaasProvider(providerId);
    if (!provider.isConfigured()) {
      const missing = provider.missingPreconditions()[0] ?? "Sağlayıcı yapılandırılmadı.";
      return fail("FORBIDDEN", `SaaS tahsilat sağlayıcısı (${providerId}) hazır değil: ${missing}`);
    }

    const origin = new URL(request.url).origin;
    // Pending abonelik ÖNCE yazılır; conversationId abonelik kimliğini taşır
    // (callback'te güvenli tenant eşleşmesi için).
    const limits = await resolveTenantLimits(ctx.tenantId, v.planKey);
    const { catalog } = await getPublishedCatalog();
    const includedModules = (catalog.plans.find((p) => p.key === v.planKey)?.includedModules ??
      []) as string[];
    const snapshot = buildPriceSnapshot({
      plan: { ...plan, amountMinor },
      limits,
      includedModules,
      campaignCode: v.campaignCode ?? null,
      campaignNote,
      postCampaignNote: v.campaignCode ? campaignNote : "Liste fiyatı uygulanır.",
      acceptedBy: ctx.userId,
    });
    const pendingSub = existing
      ? {
          ...existing,
          planKey: v.planKey,
          catalogVersion: plan.catalogVersion,
          billingInterval: interval,
          priceSnapshot: snapshot,
          status: "pending" as const,
          provider: providerId,
          executionModel: provider.executionModel,
          merchantAccount: provider.merchantAccount(),
          billingEmail: user.email,
          billingUserIp: clientIp(request),
          updatedAt: new Date().toISOString(),
        }
      : {
          ...buildPendingSubscription({
            tenantId: ctx.tenantId,
            planKey: v.planKey,
            catalogVersion: plan.catalogVersion,
            billingInterval: interval,
            priceSnapshot: snapshot,
            provider: providerId,
            executionModel: provider.executionModel,
            merchantAccount: provider.merchantAccount(),
            billingEmail: user.email,
            billingUserIp: clientIp(request),
          }),
        };
    await upsertSaasSubscription(pendingSub);
    const idempotencyKey = `${pendingSub.id}:${newSaasIdempotencyKey()}`;
    const init = await provider.initializeCheckout({
      tenantId: ctx.tenantId,
      planKey: v.planKey,
      billingInterval: interval,
      amountMinor,
      currency: pendingSub.currency,
      callbackUrl: `${origin}/api/v1/billing/checkout/callback`,
      okUrl: `${origin}/abonelik/sonuc?status=pending`,
      failUrl: `${origin}/abonelik/sonuc?status=error`,
      userIp: clientIp(request),
      idempotencyKey,
      customerRef: pendingSub.providerCustomerRef,
      customer: {
        name: v.customer.name,
        surname: v.customer.surname,
        email: user.email,
        gsmNumber: v.customer.gsmNumber,
        identityNumber: v.customer.identityNumber,
        address: v.customer.address,
        city: v.customer.city,
        country: v.customer.country,
      },
    });
    if (!init.ok) return fail("INTERNAL_ERROR", init.error, { providerCode: init.errorCode });

    // Onay kaydı: kart saklama + otomatik çekim yetkisi (kullanıcı beyanı).
    const consentAt = new Date().toISOString();
    await upsertSaasSubscription(
      addProviderLink(
        pendingSub,
        {
          provider: providerId,
          merchant: provider.merchantAccount(),
          consent: { scope: "card_storage+recurring", version: "v1", at: consentAt },
        },
        consentAt
      )
    );

    // Pending abonelik yukarıda yazıldı (ödeme doğrulanmadan hak YOK).
    if (v.campaignCode) await redeemCampaign(v.campaignCode);
    if (v.invitationToken && invitation) {
      await markInvitationConsumed(invitation, ctx.userId);
    }

    // PayTR ilk ödemesi için deneme kaydı: callback merchant_oid ile eşleşir.
    if (init.kind === "form_post") {
      const { recordSaasAttempt } = await import("@/lib/saas-billing/store");
      const { debtKeyFor } = await import("@/lib/saas-billing/collections");
      const { uid } = await import("@/lib/utils");
      const now = new Date().toISOString();
      await recordSaasAttempt({
        id: uid("saas_att"),
        tenantId: pendingSub.tenantId,
        subscriptionId: pendingSub.id,
        periodStart: now,
        periodEnd: now,
        debtKey: debtKeyFor(pendingSub.id, now),
        amountMinor,
        currency: pendingSub.currency,
        status: "pending",
        kind: "charge",
        attemptNo: 1,
        idempotencyKey: `cb_${init.providerReference}`,
        provider: providerId,
        merchantAccount: provider.merchantAccount(),
        providerRef: init.providerReference,
        providerEventId: null,
        error: null,
        sentAt: null,
        retryable: null,
        createdAt: now,
      });
    }

    return ok({
      kind: init.kind,
      ...(init.kind === "embed_html"
        ? {
            checkoutFormContent: init.checkoutFormContent,
            tokenExpireSeconds: init.tokenExpireSeconds,
          }
        : { postUrl: init.postUrl, fields: init.fields }),
      providerReference: init.providerReference,
      mock: init.mock,
      provider: providerId,
      executionModel: provider.executionModel,
      summary: prePaymentSummary(plan),
      idempotencyKey,
    });
  },
  { permission: "billing:write" }
);
