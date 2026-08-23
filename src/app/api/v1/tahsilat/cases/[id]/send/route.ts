import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { resolveWriteScope } from "@/lib/institution/write-scope";
import { sendFollowUpMessageTool } from "@/lib/tahsilat/service";
import { enforceUserRateLimit } from "@/lib/api/rate-limit-guard";

export const dynamic = "force-dynamic";

const SEND_RATE_WINDOW_MS = 60_000;
const SEND_RATE_MAX = 20;

const bodySchema = z.object({
  channel: z.enum(["whatsapp", "sms", "manual"]),
  confirm: z.literal(true),
  markManualPending: z.boolean().optional(),
});

export const POST = withApiHandler(
  async ({ ctx, params, body }) => {
    const limited = enforceUserRateLimit("tahsilat-send", ctx.userId, {
      windowMs: SEND_RATE_WINDOW_MS,
      max: SEND_RATE_MAX,
    });
    if (limited) return limited;

    const writeScope = await resolveWriteScope(ctx);
    if (writeScope.mode !== "single") return jsonFail("FORBIDDEN", writeScope.reason);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", "Gönderim için kanal ve açık onay (confirm:true) gerekir.");
    }
    return sendFollowUpMessageTool(
      { ...ctx, tenantId: writeScope.tenantId },
      { caseId: params.id, ...parsed.data }
    );
  },
  { permission: "payments:write" }
);
