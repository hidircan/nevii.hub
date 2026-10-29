import { createHash } from "crypto";
import { withApiHandler } from "@/lib/api/handler";
import { fail, ok } from "@/lib/services/result";
import { getUserById } from "@/lib/auth/users";
import { listSaasSubscriptions } from "@/lib/saas-billing/store";
import { startTrial, trialDaysLeft } from "@/lib/saas-billing/trial";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/trial
 * 30 günlük ücretsiz deneme (V1: kart istenmez).
 *
 * - Yalnız kurum sahibi/yöneticisi (oturum = doğrulanmış e-posta; hesap
 *   aktivasyon akışı e-postayı doğrulamıştır).
 * - Tenant kimliği JWT'den; body'den tenant ALINMAZ.
 * - Tekrarlı deneme: e-posta hash'i + kurum geçmişi ile sınırlanır.
 */
export const POST = withApiHandler(
  async ({ ctx }) => {
    if (ctx.role !== "SUPER_ADMIN" && ctx.role !== "SCHOOL_ADMIN") {
      return fail("FORBIDDEN", "Deneme yalnız kurum sahibi/yöneticisi tarafından başlatılabilir.");
    }
    const user = await getUserById(ctx.userId);
    if (!user?.email) return fail("UNAUTHORIZED", "Doğrulanmış kullanıcı e-postası bulunamadı.");
    const hash = createHash("sha256").update(user.email.trim().toLowerCase(), "utf8").digest("hex");
    const all = await listSaasSubscriptions(500);
    const emailUsedForTrialBefore = all.some(
      (s) => s.tenantId !== ctx.tenantId && s.priceSnapshot.trialOwnerHash === hash
    );
    const res = await startTrial({
      tenantId: ctx.tenantId,
      ownerEmail: user.email,
      ownerEmailVerified: true,
      ownerUserId: ctx.userId,
      emailUsedForTrialBefore,
    });
    if (!res.ok) return res;
    return ok({
      status: res.data.status,
      planKey: res.data.planKey,
      trialStartsAt: res.data.trialStartsAt,
      trialEndsAt: res.data.trialEndsAt,
      daysLeft: trialDaysLeft(res.data.trialEndsAt),
    });
  },
  { permission: "billing:write" }
);
