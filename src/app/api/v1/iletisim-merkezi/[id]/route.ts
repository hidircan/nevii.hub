import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult, jsonFail } from "@/lib/api/http";
import { editCommunicationMessageTool, getCommunicationMessageTool } from "@/lib/communications/service";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(async ({ ctx, params }) => {
  const id = params.id;
  if (!id) return jsonFail("VALIDATION_ERROR", "id gerekli");
  const result = await getCommunicationMessageTool(ctx, id);
  return fromServiceResult(result);
});

const patchSchema = z.object({ draftBody: z.string().min(1).max(2000) }).strict();

export const PATCH = withApiHandler(async ({ ctx, params, body }) => {
  const id = params.id;
  if (!id) return jsonFail("VALIDATION_ERROR", "id gerekli");
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid payload");
  const result = await editCommunicationMessageTool(ctx, { id, draftBody: parsed.data.draftBody });
  return fromServiceResult(result);
});
