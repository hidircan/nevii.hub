import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult } from "@/lib/api/http";
import { listCommunicationMessagesTool } from "@/lib/communications/service";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(async ({ ctx }) => {
  const result = await listCommunicationMessagesTool(ctx);
  return fromServiceResult(result);
});
