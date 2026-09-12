import { z } from "zod";
import { fail, ok, type ServiceResult } from "../services/result";
import type { ServiceContext } from "../services/context";
import { isDbMode } from "../config";
import { PLATFORM_TENANT_ID } from "../auth/config";
import { requireHyperAdmin } from "./access";
import { appendPlatformAudit, listSettingOverrides } from "./store";
import { deleteClosedSessionsBefore, deleteStalePasswordResetsBefore } from "./store-ext";
import {
  CRITICAL_RETENTION_CATEGORIES,
  DELETABLE_RETENTION_CATEGORIES,
  type RetentionCategory,
} from "./types";

/**
 * NeviiOS merkezi log retention politikası.
 *
 * KRİTİK (kodda sabit, ayarla değiştirilemez, ASLA silinmez):
 *   finans/sözleşme/tahsilat audit, rol/izin audit, destek erişimi,
 *   platform ayar audit'i (PlatformAuditEvent'in tamamı — temizlik raporu dahil).
 * SİLİNEBİLİR (gün bazlı, `retention.days` ile ayarlanır, 7-3650):
 *   güvenlik/giriş olayları, oturum/presence kayıtları, API telemetrisi,
 *   hata logları. Debug logları kalıcı yazılmaz (yalnız AUDIT_LOG_DEBUG=1 stdout).
 *
 * Silme YALNIZ açık allowlist'teki aksiyonlarla yapılır (`AuditLog.action IN (...)`):
 * listede olmayan (yanlış sınıflanmış olsa bile) hiçbir kayıt silinmez.
 * Telemetri/hata kayıtları silinmeden önce aksiyon bazında sayılır; sayım
 * temizlik audit olayına (kritik, kalıcı) yazılır → özet (aggregate) korunur.
 */

export type RetentionPolicyDef = {
  label: string;
  store: string;
  critical: boolean;
  defaultDays: number | null;
  action: "keep_forever" | "delete" | "aggregate_then_delete" | "not_persisted";
  description: string;
};

export const RETENTION_POLICIES: Record<RetentionCategory, RetentionPolicyDef> = {
  finance_audit: {
    label: "Finans / sözleşme / tahsilat audit",
    store: "AuditLog (kurum)",
    critical: true,
    defaultDays: null,
    action: "keep_forever",
    description: "Ödeme, tahsilat mesajı, sözleşme, ücret, telafi, öğrenci verisi değişiklikleri.",
  },
  role_audit: {
    label: "Rol / izin audit",
    store: "PlatformAuditEvent",
    critical: true,
    defaultDays: null,
    action: "keep_forever",
    description: "Rol değişimi, özel rol, preset, şube erişimi.",
  },
  support_access: {
    label: "Destek erişimi",
    store: "PlatformAuditEvent + SupportAccessSession",
    critical: true,
    defaultDays: null,
    action: "keep_forever",
    description: "Destek oturumu aç/kapa/görüntüle.",
  },
  platform_config_audit: {
    label: "Platform ayar / paket / release audit",
    store: "PlatformAuditEvent",
    critical: true,
    defaultDays: null,
    action: "keep_forever",
    description: "Ayar, paket kataloğu, entitlement, release ve temizlik raporları.",
  },
  security_events: {
    label: "Güvenlik / giriş olayları",
    store: "AuditLog (Auth)",
    critical: false,
    defaultDays: 365,
    action: "delete",
    description: "Başarılı/başarısız giriş, çıkış, CSRF ve yetki reddi.",
  },
  session_presence: {
    label: "Oturum / presence",
    store: "UserSession (kapalı) + PasswordResetToken (kullanılmış/süresi dolmuş)",
    critical: false,
    defaultDays: 30,
    action: "delete",
    description: "Presence bellekte tutulur; yalnız kapanmış oturum satırları silinir.",
  },
  api_telemetry: {
    label: "API telemetrisi",
    store: "AuditLog (auth.success, auth.refresh_success)",
    critical: false,
    defaultDays: 30,
    action: "aggregate_then_delete",
    description: "Her kimlik doğrulamalı istek için yazılan başarı kaydı.",
  },
  error_logs: {
    label: "Hata logları",
    store: "AuditLog (api.error)",
    critical: false,
    defaultDays: 90,
    action: "aggregate_then_delete",
    description: "Beklenmeyen API hataları (mesaj/stack istemciye dönmez).",
  },
  debug_logs: {
    label: "Debug logları",
    store: "Yalnız stdout (AUDIT_LOG_DEBUG=1)",
    critical: false,
    defaultDays: 7,
    action: "not_persisted",
    description: "Kalıcı yazılmaz; barındırma sağlayıcısının log saklama süresi geçerlidir.",
  },
};

/** Silinebilir AuditLog aksiyonları — TEK allowlist. Kritik kategoriler burada yoktur. */
export const AUDITLOG_DELETE_ALLOWLIST: Partial<Record<RetentionCategory, readonly string[]>> = {
  security_events: [
    "auth.login_success",
    "auth.login_failed",
    "auth.login_rate_limited",
    "auth.logout",
    "auth.invalid_token",
    "auth.tenant_mismatch",
    "auth.refresh_failed",
    "auth.refresh_csrf_rejected",
    "auth.logout_csrf_rejected",
    "csrf.rejected",
    "authz.denied",
  ],
  api_telemetry: ["auth.success", "auth.refresh_success"],
  error_logs: ["api.error"],
};

/** Bir AuditLog aksiyonunun kategorisi (bilinmeyen = finans audit → asla silinmez). */
export function classifyAuditLogAction(action: string): RetentionCategory {
  for (const [cat, list] of Object.entries(AUDITLOG_DELETE_ALLOWLIST)) {
    if (list?.includes(action)) return cat as RetentionCategory;
  }
  return "finance_audit";
}

export function isCriticalCategory(c: RetentionCategory): boolean {
  return (CRITICAL_RETENTION_CATEGORIES as readonly string[]).includes(c);
}

export async function resolveRetentionDays(): Promise<Record<RetentionCategory, number | null>> {
  const overrides = (await listSettingOverrides({ tenantId: PLATFORM_TENANT_ID })).filter(
    (o) => o.scopeType === "platform" && o.key === "retention.days"
  );
  const custom = (overrides[0]?.value ?? {}) as Partial<Record<string, number>>;
  const out = {} as Record<RetentionCategory, number | null>;
  for (const [cat, def] of Object.entries(RETENTION_POLICIES) as [RetentionCategory, RetentionPolicyDef][]) {
    out[cat] = def.critical ? null : (typeof custom[cat] === "number" ? custom[cat]! : def.defaultDays);
  }
  return out;
}

export type RetentionCategoryReport = {
  category: RetentionCategory;
  label: string;
  critical: boolean;
  retentionDays: number | null;
  cutoff: string | null;
  affected: number;
  deleted: number;
  aggregate: Record<string, number> | null;
  note: string;
};

export type RetentionReport = { dryRun: boolean; ranAt: string; storeMode: "db" | "json/memory"; categories: RetentionCategoryReport[]; totalAffected: number; totalDeleted: number };

async function auditLogPass(cat: RetentionCategory, cutoff: Date, dryRun: boolean): Promise<{ affected: number; deleted: number; aggregate: Record<string, number> | null; note: string }> {
  const actions = AUDITLOG_DELETE_ALLOWLIST[cat];
  if (!actions || isCriticalCategory(cat)) return { affected: 0, deleted: 0, aggregate: null, note: "Kritik — silinmez." };
  if (!isDbMode) return { affected: 0, deleted: 0, aggregate: null, note: "AuditLog yalnız STORE_MODE=db'de kalıcıdır; json/memory'de silinecek kayıt yok." };
  const { getPrisma } = await import("../db");
  const prisma = getPrisma();
  const where = { action: { in: [...actions] }, createdAt: { lt: cutoff } };
  const groups = await prisma.auditLog.groupBy({ by: ["action"], where, _count: { _all: true } });
  const aggregate = Object.fromEntries(groups.map((g) => [g.action, g._count._all]));
  const affected = Object.values(aggregate).reduce((n, v) => n + v, 0);
  // ponytail: tek deleteMany — çok büyük tabloda (milyonlarca satır) partition drop'a geçilir (docs/platform-control-center.md).
  const deleted = dryRun || affected === 0 ? 0 : (await prisma.auditLog.deleteMany({ where })).count;
  return { affected, deleted, aggregate, note: RETENTION_POLICIES[cat].action === "aggregate_then_delete" ? "Aksiyon bazlı sayım temizlik audit'ine yazıldı." : "" };
}

/**
 * Temizlik işi. dryRun=true (varsayılan) hiçbir şey silmez, yalnız etkiyi
 * raporlar. Her çalıştırma (dry-run dahil) kalıcı audit olayı üretir.
 */
export async function runRetentionCleanup(actor: { userId: string; role: string; tenantId: string; requestId?: string }, opts: { dryRun: boolean; now?: Date }): Promise<RetentionReport> {
  const now = opts.now ?? new Date();
  const days = await resolveRetentionDays();
  const categories: RetentionCategoryReport[] = [];
  for (const [cat, def] of Object.entries(RETENTION_POLICIES) as [RetentionCategory, RetentionPolicyDef][]) {
    const d = days[cat];
    const base = { category: cat, label: def.label, critical: def.critical, retentionDays: d };
    if (def.critical || d === null) {
      categories.push({ ...base, cutoff: null, affected: 0, deleted: 0, aggregate: null, note: "Kritik — otomatik silinmez." });
      continue;
    }
    const cutoff = new Date(now.getTime() - d * 86_400_000);
    if (def.action === "not_persisted") {
      categories.push({ ...base, cutoff: cutoff.toISOString(), affected: 0, deleted: 0, aggregate: null, note: def.description });
      continue;
    }
    if (cat === "session_presence") {
      const sessions = await deleteClosedSessionsBefore(cutoff, true);
      const resets = await deleteStalePasswordResetsBefore(cutoff, true);
      let deleted = 0;
      if (!opts.dryRun) deleted = (await deleteClosedSessionsBefore(cutoff, false)) + (await deleteStalePasswordResetsBefore(cutoff, false));
      categories.push({
        ...base,
        cutoff: cutoff.toISOString(),
        affected: sessions + resets,
        deleted,
        aggregate: { closedSessions: sessions, staleResetTokens: resets },
        note: "Açık oturumlara dokunulmaz.",
      });
      continue;
    }
    const r = await auditLogPass(cat, cutoff, opts.dryRun);
    categories.push({ ...base, cutoff: cutoff.toISOString(), ...r });
  }
  const report: RetentionReport = {
    dryRun: opts.dryRun,
    ranAt: now.toISOString(),
    storeMode: isDbMode ? "db" : "json/memory",
    categories,
    totalAffected: categories.reduce((n, c) => n + c.affected, 0),
    totalDeleted: categories.reduce((n, c) => n + c.deleted, 0),
  };
  await appendPlatformAudit({
    actorUserId: actor.userId,
    actorRole: actor.role,
    actorTenantId: actor.tenantId,
    targetTenantId: null,
    action: opts.dryRun ? "platform.retention.dry_run" : "platform.retention.cleanup",
    entityType: "RetentionJob",
    entityId: report.ranAt,
    before: null,
    after: {
      dryRun: report.dryRun,
      totalAffected: report.totalAffected,
      totalDeleted: report.totalDeleted,
      categories: categories.filter((c) => c.affected > 0).map((c) => ({ category: c.category, affected: c.affected, deleted: c.deleted, aggregate: c.aggregate })),
    } as never,
    requestId: actor.requestId || "retention",
    outcome: "success",
  });
  return report;
}

export async function getRetentionOverview(ctx: ServiceContext) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const days = await resolveRetentionDays();
  return ok({
    policies: (Object.entries(RETENTION_POLICIES) as [RetentionCategory, RetentionPolicyDef][]).map(([category, def]) => ({
      category,
      ...def,
      retentionDays: days[category],
      editable: (DELETABLE_RETENTION_CATEGORIES as readonly string[]).includes(category) && def.action !== "not_persisted",
    })),
    jobs: SCHEDULED_JOBS,
    storeMode: isDbMode ? "db" : "json/memory",
  });
}

export async function runRetentionFromPanel(ctx: ServiceContext, input: unknown): Promise<ServiceResult<RetentionReport>> {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = z.object({ dryRun: z.boolean().default(true), confirm: z.boolean().optional() }).safeParse(input ?? {});
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz istek");
  if (!parsed.data.dryRun && parsed.data.confirm !== true) return fail("VALIDATION_ERROR", "Gerçek silme için önce dry-run raporunu inceleyip onaylayın.", { requiresConfirm: true });
  return ok(await runRetentionCleanup(ctx, { dryRun: parsed.data.dryRun }));
}

// ───────────── Zamanlanmış iş sözleşmesi ─────────────

/**
 * Tipli scheduler sözleşmesi. Bu projede gerçek cron KURULMADI (vercel.json'a
 * cron eklenmedi); deploy aşamasında Vercel Cron / harici zamanlayıcı bu
 * tanımı kullanarak `Authorization: Bearer $<secretEnv>` ile uç noktayı çağırır.
 */
export type ScheduledJobDefinition = {
  id: string;
  description: string;
  schedule: string;
  endpoint: string;
  method: "POST";
  secretEnv: string;
  defaultDryRun: boolean;
};

export const SCHEDULED_JOBS: ScheduledJobDefinition[] = [
  {
    id: "platform.retention.cleanup",
    description: "Log retention temizliği (kritik audit hariç).",
    schedule: "0 3 * * *",
    endpoint: "/api/v1/platform/jobs/retention",
    method: "POST",
    secretEnv: "RETENTION_CRON_SECRET",
    defaultDryRun: true,
  },
];
