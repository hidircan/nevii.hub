import { withApiHandler } from "@/lib/api/handler";
import { jsonFail, fromServiceResult } from "@/lib/api/http";
import { getConversation } from "@/lib/ai/conversations";

export const dynamic = "force-dynamic";

/** GET /api/v1/chat/:conversationId */
export const GET = withApiHandler(
  async ({ ctx, params }) => {
    const id = params.conversationId;
    if (!id) return jsonFail("VALIDATION_ERROR", "conversationId required");

    const conv = await getConversation(ctx.tenantId, ctx.userId, id);
    if (!conv) return jsonFail("NOT_FOUND", "Conversation not found");

    return fromServiceResult({ ok: true, data: { conversation: conv } });
  },
  { permission: "ai:chat" }
);
