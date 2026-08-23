import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult, jsonFail } from "@/lib/api/http";
import { listFollowUpCases, upsertFollowUpCase, getCollectionRoi, getCollectionsDashboard, toPublicCase } from "@/lib/tahsilat/cases";
import { FOLLOW_UP_STATUSES } from "@/lib/tahsilat/status";
import { resolveWriteScope } from "@/lib/institution/write-scope";
import { auditLog } from "@/lib/auth/audit";
import { uid } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(async ({ ctx }) => {
  const [cases, roi, dashboard] = await Promise.all([
    listFollowUpCases(ctx.tenantId),
    getCollectionRoi(ctx.tenantId),
    getCollectionsDashboard(ctx.tenantId),
  ]);
  return fromServiceResult({
    ok: true as const,
    data: { cases: cases.map(toPublicCase), roi, dashboard },
  });
});

const patchSchema = z
  .object({
    id: z.string().optional(),
    paymentId: z.string(),
    studentId: z.string(),
    status: z.enum(FOLLOW_UP_STATUSES),
    selectedChannel: z.enum(["whatsapp", "sms", "manual"]).optional(),
    approvedMessage: z.string().optional(),
    messageDraft: z.string().default(""),
    attributedAmount: z.number().default(0),
  })
  .strict();

export const POST = withApiHandler(async ({ ctx, body }) => {
  const writeScope = await resolveWriteScope(ctx);
  if (writeScope.mode !== "single") {
    auditLog({
      action: "tahsilat.case.write",
      requestId: uid("audit"),
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      role: ctx.role,
      outcome: "denied",
      meta: { scopeMode: writeScope.mode },
    });
    return jsonFail("FORBIDDEN", writeScope.reason);
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid payload");
  const now = new Date().toISOString();
  const record = await upsertFollowUpCase({
    ...parsed.data,
    tenantId: writeScope.tenantId,
    approvedBy: parsed.data.status === "approved" ? ctx.userId : undefined,
    approvedAt: parsed.data.status === "approved" ? now : undefined,
    sentAt: parsed.data.status === "sent" ? now : undefined,
    resolvedAt:
      parsed.data.status === "paid" || parsed.data.status === "lost" ? now : undefined,
  });
  auditLog({
    action: "tahsilat.case.write",
    requestId: uid("audit"),
    userId: ctx.userId,
    tenantId: writeScope.tenantId,
    role: ctx.role,
    outcome: "success",
    meta: { scopeMode: "single", status: parsed.data.status },
  });
  return fromServiceResult({ ok: true as const, data: record });
});
