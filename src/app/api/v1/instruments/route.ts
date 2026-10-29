import { withApiHandler } from "@/lib/api/handler";
import { listInstrumentsTool } from "@/lib/services/admin-lists";

export const dynamic = "force-dynamic";

/** GET /api/v1/instruments — enstrüman kataloğu (salt-okunur). Admin + öğretmen. */
export const GET = withApiHandler(async ({ ctx }) => listInstrumentsTool(ctx), {
  permission: "teachers:read",
});
