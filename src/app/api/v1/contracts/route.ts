import { withApiHandler } from "@/lib/api/handler";
import { createStudentContractTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** POST /api/v1/contracts — ilk kayıt / yenileme / değişiklik (contractType body'de). */
export const POST = withApiHandler(async ({ ctx, body }) => createStudentContractTool(ctx, body), {
  permission: "contracts:write",
});
