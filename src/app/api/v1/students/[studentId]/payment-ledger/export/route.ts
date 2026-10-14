import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api/handler";
import { enforceUserRateLimit } from "@/lib/api/rate-limit-guard";
import { recordAuditLog } from "@/lib/audit/log";
import { buildPaymentLedgerCsv } from "@/lib/services/student-ledgers";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/students/:studentId/payment-ledger/export — ödeme dökümü CSV.
 * Aynı ledger sorgusu + aynı toplamlar (istemci yeniden hesaplamaz).
 * Bearer kimlik doğrulamalı; URL'de secret yok; yanıt no-store.
 */
export const GET = withApiHandler(
  async ({ ctx, params, searchParams }) => {
    const limited = enforceUserRateLimit("payment-ledger-export", ctx.userId, { windowMs: 60_000, max: 10 });
    if (limited) return limited;
    const result = await buildPaymentLedgerCsv(ctx, {
      studentId: params.studentId,
      month: searchParams.get("month") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    });
    if (!result.ok) return result;
    void recordAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: "payment-ledger.export",
      entityType: "Payment",
      entityId: params.studentId,
      outcome: "success",
      meta: { rowCount: result.data.rowCount, truncated: result.data.truncated },
    });
    return new NextResponse(result.data.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.data.filename}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  },
  { permission: "students:read" }
);
