import { withApiHandler } from "@/lib/api/handler";
import { getContractTemplateDiagnosticsTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/documents/templates/diagnostics — aktif kayıt sözleşmesi şablonunun eksik/desteklenmeyen alan tanılaması. */
export const GET = withApiHandler(async ({ ctx }) => getContractTemplateDiagnosticsTool(ctx), {
  permission: "documents:read",
});
