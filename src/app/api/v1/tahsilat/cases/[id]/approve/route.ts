import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { resolveWriteScope } from "@/lib/institution/write-scope";
import { approveFollowUpCaseTool } from "@/lib/tahsilat/service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  paymentId: z.string().min(1),
  studentId: z.string().min(1),
  message: z.string().min(1),
  channel: z.enum(["whatsapp", "sms", "manual"]).optional(),
});

export const POST = withApiHandler(
  async ({ ctx, params, body }) => {
    const writeScope = await resolveWriteScope(ctx);
    if (writeScope.mode !== "single") return jsonFail("FORBIDDEN", writeScope.reason);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz gövde");
    return approveFollowUpCaseTool(
      { ...ctx, tenantId: writeScope.tenantId },
      { caseId: params.id, ...parsed.data }
    );
  },
  { permission: "payments:write" }
);
