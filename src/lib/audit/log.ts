/**
 * General-purpose critical-action audit trail (EPIC 0,
 * `IMPLEMENTATION_PLAN.md`). Writes to `AuditLog` (Prisma, migration
 * `prisma/migrations/20260804125240_add_audit_log`) — distinct from
 * `src/lib/ai/audit-hook.ts`'s `AiAuditLog`, which is AI capability
 * invocations only. This covers human-triggered critical writes: payments,
 * tahsilat messages, teacher fee changes, makeup decisions, student data.
 *
 * Fire-and-forget by contract, same as `recordAiAuditLog`: every exported
 * function here CATCHES its own errors and resolves (never rejects), so
 * `void recordAuditLog(...)` is always safe and never blocks the critical
 * path it's called from.
 *
 * Same accepted limitation as `AiAuditLog`: this only persists in
 * `STORE_MODE=db` (writes go through `prisma`, which requires a real
 * PostgreSQL connection — `src/lib/db.ts` connects via `@prisma/adapter-pg`
 * over a `pg` `Pool`). In `json`/`memory` mode the write fails closed
 * (caught, `persisted:false`) rather than throwing — documented in
 * `DEVOPS_GUIDE.md`.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { uid } from "../utils";
import { DEFAULT_APP_TIMEZONE, addDaysYmd, zonedWallTimeToUtc } from "../timezone";

export type AuditOutcome = "success" | "denied" | "error";

export type AuditLogInput = {
  tenantId: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  outcome: AuditOutcome;
  /** Shape/amount/status only — never raw personal content (message bodies, notes). */
  meta?: Record<string, unknown>;
};

export type AuditLogResult = {
  id: string;
  /** False if the DB write itself failed — the function still never throws. */
  persisted: boolean;
};

/** `error.code`/`error.name` are safe, short, well-known identifiers (e.g. Postgres `23505`, Prisma `P2002`, `PrismaClientKnownRequestError`) — never the free-text message, which can embed a connection string or query fragment. */
function safeErrorField(value: unknown): string | undefined {
  if (typeof value === "string" && value.length <= 64) return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

/**
 * Never logs the raw error, its `message`, or its `stack` — those can carry
 * a Postgres connection string, query text, or other sensitive detail.
 * Only a fixed, structured shape of well-known-safe fields is emitted, and
 * only when `AUDIT_LOG_DEBUG=1`.
 */
function debugLog(context: string, error: unknown) {
  if (process.env.AUDIT_LOG_DEBUG !== "1") return;
  const err = error as { name?: unknown; code?: unknown } | null | undefined;
  console.error("[audit]", {
    event: "audit_log_write_failed",
    context,
    errorName: safeErrorField(err?.name),
    errorCode: safeErrorField(err?.code),
  });
}

/** Create one AuditLog row. Never throws. */
export async function recordAuditLog(input: AuditLogInput): Promise<AuditLogResult> {
  const id = uid("audit");
  try {
    await prisma.auditLog.create({
      // DB egress (2026-10-10): RETURNING yalnız id — satır (meta JSON dahil) geri okunmuyordu.
      select: { id: true },
      data: {
        id,
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        outcome: input.outcome,
        meta: input.meta
          ? (JSON.parse(JSON.stringify(input.meta)) as Prisma.InputJsonValue)
          : undefined,
      },
    });
    return { id, persisted: true };
  } catch (error) {
    debugLog("failed to write AuditLog", error);
    return { id, persisted: false };
  }
}

export type AuditLogEntry = {
  id: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  outcome: AuditOutcome;
  meta: Record<string, unknown> | null;
  createdAt: Date;
};

/**
 * Tenant-scoped read for the admin "Denetim Kaydı" screen. Never throws —
 * returns `[]` on any DB error (e.g. STORE_MODE=json/memory, where AuditLog
 * was never written to).
 */
export type AuditLogFilters = {
  limit?: number;
  action?: string;
  entityType?: string;
  /** 8. tur — Türkçe işlem kategorisi filtresi (varlık türü kümesi). */
  entityTypes?: string[];
  /** "Sistem işlemleri" = diğer kategorilerin dışında kalanlar. */
  excludeEntityTypes?: string[];
  entityId?: string;
  /** Birden çok kaydın geçmişi tek sorguda (ör. öğrencinin tüm ödemeleri). */
  entityIds?: string[];
  /** Gürültü aksiyonlarını dışla (ör. her istekte yazılan auth.success telemetrisi). */
  excludeActions?: string[];
  actorUserId?: string;
  actorRole?: string;
  outcome?: AuditOutcome;
  /** ISO tarih (dahil) — bu andan itibaren. */
  from?: string;
  /** ISO tarih (dahil) — bu ana kadar. */
  to?: string;
  /** action/entityType/entityId/actorUserId üzerinde serbest metin arama (case-insensitive, "contains"). */
  search?: string;
};

export async function listAuditLogs(tenantId: string, opts?: AuditLogFilters): Promise<AuditLogEntry[]> {
  try {
    const search = opts?.search?.trim();
    const rows = await prisma.auditLog.findMany({
      where: {
        tenantId,
        action: opts?.action || (opts?.excludeActions?.length ? { notIn: opts.excludeActions } : undefined),
        entityType:
          opts?.entityType ||
          (opts?.entityTypes?.length
            ? { in: opts.entityTypes }
            : opts?.excludeEntityTypes?.length
              ? { notIn: opts.excludeEntityTypes }
              : undefined),
        entityId: opts?.entityIds?.length ? { in: opts.entityIds } : opts?.entityId || undefined,
        actorUserId: opts?.actorUserId || undefined,
        actorRole: opts?.actorRole || undefined,
        outcome: opts?.outcome || undefined,
        createdAt: {
          gte: opts?.from ? new Date(opts.from) : undefined,
          // "to" gün sonuna kadar dahil olsun diye gün sonuna genişletilir (yalnızca tarih girildiyse).
          lte: opts?.to ? new Date(`${opts.to}T23:59:59.999`) : undefined,
        },
        ...(search
          ? {
              OR: [
                { action: { contains: search } },
                { entityType: { contains: search } },
                { entityId: { contains: search } },
                { actorUserId: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: opts?.limit ?? 100,
    });
    return rows.map((r) => ({
      id: r.id,
      actorUserId: r.actorUserId,
      actorRole: r.actorRole,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      outcome: r.outcome as AuditOutcome,
      meta: (r.meta as Record<string, unknown> | null) ?? null,
      createdAt: r.createdAt,
    }));
  } catch (error) {
    debugLog("failed to read AuditLog", error);
    return [];
  }
}

/**
 * 2026-10-15 — Denetim Kaydı filtresi: kurum saatiyle (İstanbul) girilen aralık → UTC `[gte, lt)`.
 * "yyyy-MM-dd" (yalnız tarih): başlangıç 00:00, bitiş günü TAMAMEN dahil (ertesi gün 00:00'dan küçük).
 * "yyyy-MM-ddTHH:mm": bitiş dakikası dahil. Geçersiz değer yok sayılır (filtre uygulanmaz).
 * Eskiden `new Date("yyyy-MM-dd")` UTC gece yarısı, `…T23:59:59.999` sunucu yerel saati (Vercel'de UTC) idi →
 * iki uç da İstanbul'a göre 3 saat kayıktı.
 */
export function auditRangeUtc(from?: string, to?: string, timeZone = DEFAULT_APP_TIMEZONE): { gte?: Date; lt?: Date } {
  const parse = (value: string | undefined, end: boolean): Date | undefined => {
    const m = value ? /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/.exec(value.trim()) : null;
    if (!m) return undefined;
    if (!m[2]) return zonedWallTimeToUtc(end ? addDaysYmd(m[1]!, 1) : m[1]!, "00:00", timeZone);
    const at = zonedWallTimeToUtc(m[1]!, m[2], timeZone);
    return end ? new Date(at.getTime() + 60_000) : at;
  };
  return { gte: parse(from, false), lt: parse(to, true) };
}

export type AuditLogPageFilters = {
  actions?: string[];
  excludeActions?: string[];
  entityType?: string;
  entityTypes?: string[];
  excludeEntityTypes?: string[];
  actorUserId?: string;
  actorRole?: string;
  outcome?: AuditOutcome;
  /** Kurum saatiyle aralık (bkz. auditRangeUtc). */
  from?: string;
  to?: string;
  /** Özne: kaydın kendisi VEYA meta'sındaki öğrenci/öğretmen bu kişilerden biri (en çok 50). */
  subjectIds?: string[];
  search?: string;
  page: number;
  pageSize: number;
};

/**
 * Sunucu tarafı filtre + sayfalama, TEK sorguda tüm kapsam kurumları (`tenantId IN`) — birleşik görünümde de
 * sıralama/sayfa doğru. `take + 1` ile sonraki sayfa var mı anlaşılır; tablo tarayıcıya komple inmez.
 * Parametrik (Prisma); json/memory modda boş döner.
 */
export async function listAuditLogPage(
  tenantIds: string[],
  f: AuditLogPageFilters
): Promise<{ rows: AuditLogEntry[]; hasMore: boolean }> {
  try {
    const range = auditRangeUtc(f.from, f.to);
    const search = f.search?.trim();
    const and: Prisma.AuditLogWhereInput[] = [];
    if (f.subjectIds?.length) {
      const ids = f.subjectIds.slice(0, 50);
      and.push({
        OR: [
          { entityId: { in: ids } },
          ...ids.flatMap((id) => [
            { meta: { path: ["studentId"], equals: id } },
            { meta: { path: ["teacherId"], equals: id } },
          ]),
        ],
      });
    }
    if (search) {
      and.push({
        OR: [
          { action: { contains: search } },
          { entityType: { contains: search } },
          { entityId: { contains: search } },
          { actorUserId: { contains: search } },
        ],
      });
    }
    const rows = await prisma.auditLog.findMany({
      where: {
        tenantId: { in: tenantIds },
        action: f.actions?.length ? { in: f.actions } : f.excludeActions?.length ? { notIn: f.excludeActions } : undefined,
        entityType:
          f.entityType ||
          (f.entityTypes?.length ? { in: f.entityTypes } : f.excludeEntityTypes?.length ? { notIn: f.excludeEntityTypes } : undefined),
        actorUserId: f.actorUserId || undefined,
        actorRole: f.actorRole || undefined,
        outcome: f.outcome || undefined,
        createdAt: range.gte || range.lt ? { gte: range.gte, lt: range.lt } : undefined,
        ...(and.length ? { AND: and } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: Math.max(0, f.page - 1) * f.pageSize,
      take: f.pageSize + 1,
    });
    return {
      hasMore: rows.length > f.pageSize,
      rows: rows.slice(0, f.pageSize).map((r) => ({
        id: r.id,
        actorUserId: r.actorUserId,
        actorRole: r.actorRole,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        outcome: r.outcome as AuditOutcome,
        meta: (r.meta as Record<string, unknown> | null) ?? null,
        createdAt: r.createdAt,
      })),
    };
  } catch (error) {
    debugLog("failed to read AuditLog page", error);
    return { rows: [], hasMore: false };
  }
}

/** "İşlemi yapan" filtresi seçenekleri: kapsamdaki kayıtlarda geçen kullanıcılar (en çok 300; kimlik → ad sayfada çözülür). */
export async function listAuditActorIds(tenantIds: string[]): Promise<string[]> {
  try {
    const rows = await prisma.auditLog.groupBy({
      by: ["actorUserId"],
      where: { tenantId: { in: tenantIds } },
      orderBy: { actorUserId: "asc" },
      take: 300,
    });
    return rows.map((r) => r.actorUserId);
  } catch (error) {
    debugLog("failed to list AuditLog actors", error);
    return [];
  }
}

/** Görünen sayfadaki ders/ödeme satırlarının öğrenci/şube bağı — tam kurum okuması yerine yalnız bu kimlikler. */
export async function resolveAuditRowLinks(
  tenantIds: string[],
  rows: Pick<AuditLogEntry, "entityType" | "entityId">[]
): Promise<Map<string, { studentId?: string; branchId?: string }>> {
  const out = new Map<string, { studentId?: string; branchId?: string }>();
  const lessonIds = rows.filter((r) => r.entityType === "Lesson").map((r) => r.entityId);
  const paymentIds = rows.filter((r) => r.entityType === "Payment").map((r) => r.entityId);
  try {
    const [lessons, payments] = await Promise.all([
      lessonIds.length
        ? prisma.lesson.findMany({ where: { tenantId: { in: tenantIds }, id: { in: lessonIds } }, select: { id: true, studentId: true, branchId: true } })
        : [],
      paymentIds.length
        ? prisma.payment.findMany({ where: { tenantId: { in: tenantIds }, id: { in: paymentIds } }, select: { id: true, studentId: true } })
        : [],
    ]);
    for (const l of lessons) out.set(l.id, { studentId: l.studentId ?? undefined, branchId: l.branchId ?? undefined });
    for (const p of payments) out.set(p.id, { studentId: p.studentId ?? undefined });
  } catch (error) {
    debugLog("failed to resolve AuditLog row links", error);
  }
  return out;
}
