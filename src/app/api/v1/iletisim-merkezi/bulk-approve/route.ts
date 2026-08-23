import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult, jsonFail } from "@/lib/api/http";
import { bulkApproveCommunicationMessagesTool, MAX_BULK_APPROVE_BATCH } from "@/lib/communications/service";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(MAX_BULK_APPROVE_BATCH),
    confirm: z.literal(true),
  })
  .strict();

export const POST = withApiHandler(async ({ ctx, body }) => {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid payload");
  const result = await bulkApproveCommunicationMessagesTool(ctx, { ids: parsed.data.ids, confirm: parsed.data.confirm });
  return fromServiceResult(result);
});
