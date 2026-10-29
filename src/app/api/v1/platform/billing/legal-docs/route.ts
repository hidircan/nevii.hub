import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/services/result";
import { getEffectiveDocs, createDocRevision, setDocReview, publishDocRevision } from "@/lib/saas-billing/legal-doc-store";
import { listLegalDocStates } from "@/lib/saas-billing/store";

export const dynamic = "force-dynamic";

const actionSchema = z.object({ action: z.enum(["revise", "review", "publish"]) });

/**
 * GET/POST /api/v1/platform/billing/legal-docs (HYPER_ADMIN).
 * Hukuki belge taslak revizyonu, değerlendirme ve yayın. Metinler düz
 * metindir; HTML/script kabul edilmez ve öyle gösterilmez.
 */
export const GET = withApiHandler(
  async () => {
    const [docs, states] = await Promise.all([getEffectiveDocs(), listLegalDocStates()]);
    const byId = new Map(states.map((s) => [s.docId, s]));
    return ok({
      docs: docs.map((d) => ({ ...d, state: byId.get(d.id) ?? null })),
    });
  },
  { hyperAdminOnly: true, permission: "platform:read" }
);

export const POST = withApiHandler(
  async ({ ctx, body }) => {
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      const { fail } = await import("@/lib/services/result");
      return fail("VALIDATION_ERROR", "Geçersiz işlem.");
    }
    if (parsed.data.action === "revise") return createDocRevision(ctx, body);
    if (parsed.data.action === "review") return setDocReview(ctx, body);
    return publishDocRevision(ctx, body);
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);
