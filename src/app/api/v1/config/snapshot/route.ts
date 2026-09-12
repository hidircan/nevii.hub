import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api/handler";
import { getConfigSnapshot } from "@/lib/platform/config-snapshot";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/config/snapshot — NeviiHub'ın tükettiği config snapshot'ı
 * (contractVersion 1). `If-None-Match: "<etag>"` eşleşirse 304. Tenant JWT'den;
 * HYPER_ADMIN için `?tenantId=` zorunlu. Salt-okur: NeviiHub config yazmaz.
 */
export const GET = withApiHandler(
  async ({ ctx, request, searchParams }) => {
    const res = await getConfigSnapshot(ctx, searchParams.get("tenantId"));
    if (!res.ok) return res;
    const etag = `"${res.data.etag}"`;
    const headers = { ETag: etag, "Cache-Control": "private, no-cache", "X-Config-Version": String(res.data.configVersion) };
    if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
    return NextResponse.json({ ok: true, data: res.data }, { headers });
  },
  { allowBranchManager: true }
);
