import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult } from "@/lib/api/http";
import {
  setDayOverrideTool,
  listDayOverridesTool,
  removeDayOverrideTool,
} from "@/lib/services/tools";

export const dynamic = "force-dynamic";

/** GET ?from&to — yöneticinin koyduğu çalışma günü istisnaları. */
export const GET = withApiHandler(async ({ ctx, searchParams }) => {
  const result = await listDayOverridesTool(ctx, {
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });
  return fromServiceResult(result);
});

/** POST { date, name?, isOpen, kind? } — günü zorla aç / zorla kapat (tarih başına tek kayıt, upsert). */
export const POST = withApiHandler(async ({ ctx, body }) => {
  const result = await setDayOverrideTool(ctx, body);
  return fromServiceResult(result);
});

/** DELETE { date } — istisnayı kaldır; gün resmî tatil/dönem kuralına döner. */
export const DELETE = withApiHandler(async ({ ctx, body }) => {
  const result = await removeDayOverrideTool(ctx, body);
  return fromServiceResult(result);
});
