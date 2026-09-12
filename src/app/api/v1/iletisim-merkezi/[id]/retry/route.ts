import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult, jsonFail } from "@/lib/api/http";
import { retryCommunicationMessageTool } from "@/lib/communications/service";

export const dynamic = "force-dynamic";

export const POST = withApiHandler(async ({ ctx, params }) => {
  const id = params.id;
  if (!id) return jsonFail("VALIDATION_ERROR", "id gerekli");
  const result = await retryCommunicationMessageTool(ctx, { id });
  return fromServiceResult(result);
});
