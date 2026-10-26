import { withApiHandler } from "@/lib/api/handler";
import { createPilotCampaign, deactivateCampaign } from "@/lib/saas-billing/campaigns";
import { z } from "zod";
import { fail } from "@/lib/services/result";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/platform/billing/campaigns
 * Pilot kampanya oluşturma/pasifleştirme (HYPER_ADMIN).
 * action=create → body kampanya alanları; action=deactivate → {id}.
 */
export const POST = withApiHandler(
  async ({ ctx, body }) => {
    const action = (body as { action?: string } | null)?.action;
    if (action === "deactivate") {
      const v = z.object({ id: z.string().min(1) }).safeParse(body);
      if (!v.success) return fail("VALIDATION_ERROR", "Geçersiz istek.");
      return deactivateCampaign(v.data.id);
    }
    const { action: _a, ...input } = (body as Record<string, unknown>) ?? {};
    void _a;
    return createPilotCampaign({ input, createdBy: ctx.userId });
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);
