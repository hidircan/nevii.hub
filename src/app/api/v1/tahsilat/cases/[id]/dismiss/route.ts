import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { resolveWriteScope } from "@/lib/institution/write-scope";
import { dismissFollowUpCaseTool } from "@/lib/tahsilat/service";

export const dynamic = "force-dynamic";

export const POST = withApiHandler(
  async ({ ctx, params }) => {
    const writeScope = await resolveWriteScope(ctx);
    if (writeScope.mode !== "single") return jsonFail("FORBIDDEN", writeScope.reason);
    return dismissFollowUpCaseTool({ ...ctx, tenantId: writeScope.tenantId }, { caseId: params.id });
  },
  { permission: "payments:write" }
);
