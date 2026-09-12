import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult } from "@/lib/api/http";
import { getCollectionsDashboard } from "@/lib/tahsilat/cases";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(async ({ ctx }) => {
  const dashboard = await getCollectionsDashboard(ctx.tenantId);
  return fromServiceResult({ ok: true as const, data: dashboard });
  // Kurum geneli tahsilat özeti — yalnız ödeme yetkili personel (öğretmen/öğrenci değil).
}, { permission: "payments:write" });
