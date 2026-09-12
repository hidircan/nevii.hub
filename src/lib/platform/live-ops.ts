import { z } from "zod";
import { fail, ok } from "../services/result";
import type { ServiceContext } from "../services/context";
import { readData } from "../store";
import { runWithTenantAsync } from "../tenant-context";
import { invalidateSessionValidity } from "../auth/session-validity";
import { closeAllUserSessions, getSessionPresence, revokeUserSession } from "../auth/session-registry";
import { requireHyperAdmin } from "./access";
import { appendPlatformAudit } from "./store";
import { getUserLifecycle, getUserSession, listUserSessions, saveUserLifecycle } from "./store-ext";
import { listPlatformUsers, type PlatformInviteRow } from "./user-lifecycle";
import { maskEmail } from "./search";
import type { UserSessionRecord } from "./types";

/**
 * NeviiOS Canlı Operasyon — /platform/operasyon/aktif-oturumlar (yalnız HYPER_ADMIN).
 *
 * Oturum "açık" = kayıt iptal edilmemiş AND süresi dolmamış AND kullanıcı
 * aktif AND kullanıcı düzeyi kesme anından (sessionsRevokedAt) sonra açılmış.
 * Presence (son görülme / son ekran / son işlem) süreç içi önbellek + en fazla
 * 5 dk gecikmeli kayıttır; ağır audit tablosuna yazılmaz.
 */

export type LiveSession = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  device: string | null;
  lastPath: string | null;
  lastAction: string | null;
  current: boolean;
};

export type LiveUserRow = {
  userId: string;
  name: string | null;
  emailMasked: string;
  role: string;
  tenantId: string;
  tenantName: string;
  branches: string[];
  status: "active" | "deactivated" | "deleted";
  activeSessions: number;
  lastSeenAt: string | null;
  lastPath: string | null;
  lastAction: string | null;
  device: string | null;
  sessions: LiveSession[];
};

function isOpen(s: UserSessionRecord, userActive: boolean, cutoff: string | null, now: number): boolean {
  if (!userActive || s.revokedAt || new Date(s.expiresAt).getTime() <= now) return false;
  // JWT iat saniye hassasiyetinde; kesme anı saniyeye yuvarlanır (session-validity ile aynı kural).
  if (cutoff && Math.floor(new Date(s.createdAt).getTime() / 1000) < Math.floor(new Date(cutoff).getTime() / 1000)) return false;
  return true;
}

async function branchNames(tenantIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const t of tenantIds) {
    try {
      const data = await runWithTenantAsync(t, () => readData());
      for (const b of data.settings.branches) out.set(b.id, b.name);
    } catch {
      // bu depoda operasyon verisi olmayan kurum
    }
  }
  return out;
}

const filterSchema = z.object({
  q: z.string().trim().max(80).optional(),
  tenantId: z.string().optional(),
  role: z.string().optional(),
  only: z.enum(["online", "all"]).optional(),
});

export async function listLiveOperations(ctx: ServiceContext, rawFilter: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const f = filterSchema.safeParse(rawFilter ?? {});
  if (!f.success) return fail("VALIDATION_ERROR", "Geçersiz filtre");
  const usersRes = await listPlatformUsers(ctx, {
    status: "all",
    invite: "pending",
    ...(f.data.tenantId ? { tenantId: f.data.tenantId } : {}),
    ...(f.data.role ? { role: f.data.role } : {}),
    ...(f.data.q ? { q: f.data.q } : {}),
  });
  if (!usersRes.ok) return usersRes;
  const now = Date.now();
  const sessions = await listUserSessions({});
  const byUser = new Map<string, UserSessionRecord[]>();
  for (const s of sessions) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);
  const names = await branchNames([...new Set(usersRes.data.users.map((u) => u.tenantId))]);

  const rows: LiveUserRow[] = [];
  for (const u of usersRes.data.users) {
    const mine = byUser.get(u.id) ?? [];
    const cutoff = mine.length ? ((await getUserLifecycle(u.id))?.sessionsRevokedAt ?? null) : null;
    const open = mine
      .filter((s) => isOpen(s, u.status === "active", cutoff, now))
      .map((s): LiveSession => {
        const p = getSessionPresence(s.id);
        const fresher = p && p.lastSeenAt > s.lastSeenAt;
        return {
          id: s.id,
          createdAt: s.createdAt,
          lastSeenAt: fresher ? p.lastSeenAt : s.lastSeenAt,
          expiresAt: s.expiresAt,
          device: s.device,
          lastPath: (fresher ? p.lastPath : null) ?? s.lastPath,
          lastAction: (fresher ? p.lastAction : null) ?? s.lastAction,
          current: s.id === ctx.sid,
        };
      })
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    const latest = open[0] ?? null;
    const lastAny = [...mine].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))[0];
    rows.push({
      userId: u.id,
      name: u.displayName,
      emailMasked: maskEmail(u.email),
      role: u.role,
      tenantId: u.tenantId,
      tenantName: u.tenantName,
      branches: u.branchIds.map((b) => names.get(b) ?? b),
      status: u.status,
      activeSessions: open.length,
      lastSeenAt: latest?.lastSeenAt ?? lastAny?.lastSeenAt ?? u.lastLoginAt,
      lastPath: latest?.lastPath ?? null,
      lastAction: latest?.lastAction ?? null,
      device: latest?.device ?? null,
      sessions: open,
    });
  }
  const filtered = (f.data.only ?? "all") === "online" ? rows.filter((r) => r.activeSessions > 0) : rows;
  filtered.sort((a, b) => b.activeSessions - a.activeSessions || (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""));
  // Davetlerde ham e-posta istemciye gitmez.
  const invitations = usersRes.data.invitations.map((i: PlatformInviteRow) => {
    const { email, ...rest } = i;
    return { ...rest, emailMasked: maskEmail(email) };
  });
  return ok({
    users: filtered,
    invitations,
    totals: {
      onlineUsers: rows.filter((r) => r.activeSessions > 0).length,
      openSessions: rows.reduce((n, r) => n + r.activeSessions, 0),
    },
    tenants: usersRes.data.tenants,
    presenceNote: "Son görülme bu sunucu örneğinde anlık, diğer örneklerde en fazla 5 dk gecikmelidir.",
    writable: usersRes.data.writable,
  });
}

async function audit(ctx: ServiceContext, action: string, tenantId: string | null, entityId: string, before: unknown, after: unknown) {
  await appendPlatformAudit({
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    actorTenantId: ctx.tenantId,
    targetTenantId: tenantId,
    action,
    entityType: "UserSession",
    entityId,
    before: (before ?? null) as never,
    after: (after ?? null) as never,
    requestId: ctx.requestId || "n/a",
    outcome: "success",
  });
}

const revokeSchema = z.object({ sessionId: z.string().min(1), reason: z.string().trim().min(5, "Gerekçe en az 5 karakter").max(300) });

/** Tekil oturumu sonlandırır — kullanıcının SONRAKİ isteği reddedilir (sid kontrolü). */
export async function revokeSession(ctx: ServiceContext, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz istek");
  if (ctx.sid && parsed.data.sessionId === ctx.sid) return fail("VALIDATION_ERROR", "Kendi açık oturumunuz için Oturumu kapat'ı kullanın.");
  const row = await getUserSession(parsed.data.sessionId);
  if (!row) return fail("NOT_FOUND", "Oturum bulunamadı");
  if (row.revokedAt) return ok({ sessionId: row.id, alreadyRevoked: true });
  await revokeUserSession(row.id, ctx.userId, parsed.data.reason);
  await audit(ctx, "platform.session.revoke", row.tenantId, row.id, { userId: row.userId, revokedAt: null }, {
    userId: row.userId,
    revokedAt: new Date().toISOString(),
    reason: parsed.data.reason,
  });
  return ok({ sessionId: row.id, alreadyRevoked: false });
}

const revokeAllSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().trim().min(5, "Gerekçe en az 5 karakter").max(300),
  confirm: z.boolean().optional(),
});

/** Kullanıcının TÜM oturumları: kullanıcı düzeyi kesme anı (token'lar) + kayıtları kapatır. Hesap aktif kalır. */
export async function revokeAllSessions(ctx: ServiceContext, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = revokeAllSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz istek");
  if (parsed.data.userId === ctx.userId) return fail("FORBIDDEN", "Kendi tüm oturumlarınızı buradan kapatamazsınız (Profil → şifre değişimi diğer oturumları düşürür).");
  const usersRes = await listPlatformUsers(ctx, { status: "all", invite: "none" });
  const target = usersRes.ok ? usersRes.data.users.find((u) => u.id === parsed.data.userId) : undefined;
  if (!target) return fail("NOT_FOUND", "Kullanıcı bulunamadı");
  if (parsed.data.confirm !== true) return fail("VALIDATION_ERROR", "İşlemi onaylayın.", { requiresConfirm: true });
  const prev = await getUserLifecycle(target.id);
  const cutoff = new Date(Math.ceil(Date.now() / 1000) * 1000).toISOString();
  await saveUserLifecycle({
    userId: target.id,
    tenantId: target.tenantId,
    status: prev?.status ?? target.status,
    sessionsRevokedAt: cutoff,
    displayName: prev?.displayName ?? target.displayName,
    updatedAt: new Date().toISOString(),
    updatedBy: ctx.userId,
  });
  const closed = await closeAllUserSessions(target.id, ctx.userId, parsed.data.reason);
  invalidateSessionValidity(target.id);
  await audit(ctx, "platform.session.revoke_all", target.tenantId, target.id, { sessionsRevokedAt: prev?.sessionsRevokedAt ?? null }, {
    sessionsRevokedAt: cutoff,
    closedSessions: closed,
    reason: parsed.data.reason,
  });
  return ok({ userId: target.id, closedSessions: closed });
}
