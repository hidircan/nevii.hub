import { withApiHandler } from "@/lib/api/handler";
import { getMessageLogTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/crm/messages/:messageId — tam içerik (audit'li), yalnızca crm:read. */
export const GET = withApiHandler(
  async ({ ctx, params }) => getMessageLogTool(ctx, { messageId: params.messageId }),
  { permission: "crm:read" }
);
