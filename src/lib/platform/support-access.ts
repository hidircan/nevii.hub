import { z } from "zod";
import { fail, ok } from "../services/result";
import type { ServiceContext } from "../services/context";
import { uid } from "../utils";
import { runWithTenantAsync } from "../tenant-context";
import { readData } from "../store";
import { requireHyperAdmin } from "./access";
import { appendPlatformAudit, getPlatformTenant, listSupportSessions, saveSupportSession } from "./store";
import type { SupportAccessSession } from "./types";

/**
 * NeviiOS destek erişimi: impersonation DEĞİLDİR. HYPER_ADMIN kimliğiyle,
 * gerekçeli, en fazla 4 saatlik, SALT-OKUR bir pencere açar. Süre dolunca
 * otomatik kapanır (durum her okumada `expiresAt` ile hesaplanır — zamanlayıcı
 * gerekmez). Açma, kapama ve her görüntüleme audit'lenir.
 */
export const SUPPORT_MAX_MINUTES = 240;

export function supportSessionStatus(s: SupportAccessSession, now = new Date()): "active" | "expired" | "ended" {
  if (s.endedAt) return "ended";
  return new Date(s.expiresAt).getTime() > now.getTime() ? "active" : "expired";
}

async function audit(ctx: ServiceContext, action: string, tenantId: string, entityId: string, after: unknown) {
  await appendPlatformAudit({
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    actorTenantId: ctx.tenantId,
    targetTenantId: tenantId,
    action,
    entityType: "SupportAccessSession",
    entityId,
    before: null,
    after: (after ?? null) as never,
    requestId: ctx.requestId || "n/a",
    outcome: "success",
  });
}

export async function findActiveSupportSession(tenantId: string, actorUserId: string, now = new Date()) {
  const rows = await listSupportSessions({ tenantId, limit: 20 });
  return rows.find((r) => r.actorUserId === actorUserId && supportSessionStatus(r, now) === "active") ?? null;
}

const openSchema = z.object({
  reason: z.string().trim().min(15, "Gerekçe en az 15 karakter olmalı").max(500),
  durationMinutes: z.number().int().min(15).max(SUPPORT_MAX_MINUTES).default(60),
});

export async function openSupportSession(ctx: ServiceContext, tenantId: string, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = openSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz destek erişimi", parsed.error.flatten());
  if (!(await getPlatformTenant(tenantId))) return fail("NOT_FOUND", "Kurum bulunamadı");
  const existing = await findActiveSupportSession(tenantId, ctx.userId);
  if (existing) return fail("CONFLICT", "Bu kurum için zaten aktif bir destek oturumunuz var.", { session: existing });
  const now = new Date();
  const row: SupportAccessSession = {
    id: uid("sup"),
    tenantId,
    actorUserId: ctx.userId,
    reason: parsed.data.reason,
    startedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + parsed.data.durationMinutes * 60_000).toISOString(),
    endedAt: null,
    endedBy: null,
  };
  await saveSupportSession(row);
  await audit(ctx, "platform.support.open", tenantId, row.id, {
    reason: row.reason,
    expiresAt: row.expiresAt,
    durationMinutes: parsed.data.durationMinutes,
  });
  return ok({ session: row });
}

export async function endSupportSession(ctx: ServiceContext, tenantId: string, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = z.object({ sessionId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Oturum gerekli");
  const row = (await listSupportSessions({ tenantId, limit: 200 })).find((r) => r.id === parsed.data.sessionId);
  if (!row) return fail("NOT_FOUND", "Destek oturumu bulunamadı");
  if (row.endedAt) return ok({ session: row });
  const ended = { ...row, endedAt: new Date().toISOString(), endedBy: ctx.userId };
  await saveSupportSession(ended);
  await audit(ctx, "platform.support.end", tenantId, row.id, { endedAt: ended.endedAt });
  return ok({ session: ended });
}

export async function listTenantSupportSessions(ctx: ServiceContext, tenantId: string) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const rows = await listSupportSessions({ tenantId, limit: 50 });
  const now = new Date();
  return ok({ sessions: rows.map((r) => ({ ...r, status: supportSessionStatus(r, now) })) });
}

/**
 * Aktif destek oturumu olmadan kurum operasyon verisi okunamaz. Görünüm
 * salt-okurdur ve finans ayrıntısı yerine yalnız sayım döner.
 */
export async function getSupportDataView(ctx: ServiceContext, tenantId: string) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const session = await findActiveSupportSession(tenantId, ctx.userId);
  if (!session) return fail("FORBIDDEN", "Kurum verisini görmek için gerekçeli ve süreli destek erişimi açın.");
  let data;
  try {
    data = await runWithTenantAsync(tenantId, () => readData());
  } catch {
    return fail("NOT_FOUND", "Bu kurumun operasyon verisi bu depoda yok.");
  }
  await audit(ctx, "platform.support.view", tenantId, session.id, { view: "overview" });
  return ok({
    session,
    counts: {
      students: data.students.length,
      teachers: data.teachers.length,
      lessons: data.lessons.length,
      payments: data.payments.length,
      openMakeups: data.makeupRequests.filter((m) => m.status === "pending" || m.status === "suggested").length,
    },
    branches: data.settings.branches.map((b) => ({ id: b.id, name: b.name })),
    students: data.students.slice(0, 50).map((s) => ({ id: s.id, name: s.name, branchId: s.branchId })),
  });
}
