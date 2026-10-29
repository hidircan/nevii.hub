import { createHmac, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { fail, ok, type ServiceResult } from "../services/result";
import type { ServiceContext } from "../services/context";
import { isDbMode } from "../config";
import { uid } from "../utils";
import { requireHyperAdmin } from "./access";
import { appendPlatformAudit, listPlatformTenants } from "./store";
import { listDeployments, listReleases, saveDeployment, saveRelease } from "./store-ext";
import {
  CHECK_STATUSES,
  RELEASE_ENVIRONMENTS,
  RELEASE_PRODUCTS,
  type DeploymentRecord,
  type ReleaseEnvironment,
  type ReleaseManifest,
  type ReleaseProduct,
} from "./types";

/**
 * NeviiOS Release & Operasyon Merkezi.
 *
 * Üç AYRI kavram:
 *   - Git commit: kaynak koddaki değişiklik (Git sahibidir; burada yalnız referans).
 *   - Release (ReleaseManifest): "şu sürüm, şu özetle, şu riskle yayınlandı" kararı.
 *     Her commit release DEĞİLDİR; release açıkça oluşturulur.
 *   - Deployment: bir commit'in bir ortama dağıtılması (Vercel vb.). Release'e opsiyonel bağlanır.
 *
 * V1: GitHub/Vercel API çağrısı veya webhook kaydı YOK. Kayıtlar yalnız
 * (1) platform sahibinin elle girişi (`source: "manual"`) veya (2) ileride
 * imzalı CI olayı (`POST /api/v1/platform/releases/events`, HMAC; secret
 * yoksa uç kapalı) ile gelir. Canlı sağlayıcı verisi taklit edilmez; çalışan
 * sürümün bilgisi yalnız sağlayıcının runtime env'inden (varsa) okunur.
 */

const sha = z.string().regex(/^[0-9a-f]{7,40}$/i, "Commit SHA 7-40 hex karakter olmalı");
const env = z.enum(RELEASE_ENVIRONMENTS);
const url = z.string().url().max(500).nullable().optional();

export const releaseInputSchema = z.object({
  product: z.enum(RELEASE_PRODUCTS),
  name: z.string().trim().min(3).max(120),
  version: z.string().trim().min(1).max(40),
  commit: z.object({
    sha,
    branch: z.string().trim().min(1).max(120),
    prNumber: z.number().int().positive().nullable().optional(),
    prUrl: url,
  }),
  environment: env,
  deploymentUrl: url,
  build: z.enum(CHECK_STATUSES).default("unknown"),
  tests: z.enum(CHECK_STATUSES).default("unknown"),
  migrations: z
    .array(z.object({ name: z.string().trim().min(3).max(120), status: z.enum(["pending", "applied", "unknown"]), appliedAt: z.string().nullable().optional() }))
    .max(50)
    .default([]),
  rollbackTarget: z.string().trim().max(120).nullable().optional(),
  affectedTenants: z.union([z.literal("all"), z.array(z.string().min(1)).max(500)]).default("all"),
  affectedModules: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  summary: z.string().trim().min(10, "Kullanıcıya anlaşılır özet en az 10 karakter").max(2000),
  technicalNotes: z.string().trim().max(5000).default(""),
  knownRisks: z.string().trim().max(2000).default(""),
});

export const deploymentInputSchema = z.object({
  product: z.enum(RELEASE_PRODUCTS),
  provider: z.enum(["vercel", "manual"]).default("manual"),
  environment: env,
  url,
  commitSha: sha,
  branch: z.string().trim().min(1).max(120),
  status: z.enum(["queued", "building", "ready", "error", "canceled", "unknown"]).default("unknown"),
  releaseId: z.string().min(1).nullable().optional(),
});

function toManifest(input: z.infer<typeof releaseInputSchema>, by: string, source: ReleaseManifest["source"]): ReleaseManifest {
  const now = new Date().toISOString();
  return {
    id: uid("rel"),
    product: input.product,
    name: input.name,
    version: input.version,
    commit: { sha: input.commit.sha.toLowerCase(), branch: input.commit.branch, prNumber: input.commit.prNumber ?? null, prUrl: input.commit.prUrl ?? null },
    environment: input.environment,
    deploymentUrl: input.deploymentUrl ?? null,
    build: input.build,
    tests: input.tests,
    migrations: input.migrations.map((m) => ({ name: m.name, status: m.status, appliedAt: m.appliedAt ?? null })),
    rollbackTarget: input.rollbackTarget ?? null,
    affectedTenants: input.affectedTenants,
    affectedModules: input.affectedModules,
    summary: input.summary,
    technicalNotes: input.technicalNotes,
    knownRisks: input.knownRisks,
    publishedBy: by,
    publishedAt: now,
    source,
    createdAt: now,
  };
}

async function audit(ctx: ServiceContext, action: string, entityType: string, entityId: string, after: unknown) {
  await appendPlatformAudit({
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    actorTenantId: ctx.tenantId,
    targetTenantId: null,
    action,
    entityType,
    entityId,
    before: null,
    after: (after ?? null) as never,
    requestId: ctx.requestId || "n/a",
    outcome: "success",
  });
}

export async function createRelease(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ release: ReleaseManifest }>> {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = releaseInputSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz release");
  if (Array.isArray(parsed.data.affectedTenants)) {
    const known = new Set((await listPlatformTenants()).map((t) => t.tenantId));
    const unknown = parsed.data.affectedTenants.filter((t) => !known.has(t));
    if (unknown.length) return fail("NOT_FOUND", `Bilinmeyen kurum: ${unknown.join(", ")}`);
  }
  const release = await saveRelease(toManifest(parsed.data, ctx.userId, "manual"));
  await audit(ctx, "platform.release.create", "PlatformRelease", release.id, {
    product: release.product,
    version: release.version,
    environment: release.environment,
    commit: release.commit.sha,
    source: release.source,
  });
  return ok({ release });
}

export async function recordDeployment(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ deployment: DeploymentRecord }>> {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = deploymentInputSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz deployment");
  if (parsed.data.releaseId && !(await listReleases()).some((r) => r.id === parsed.data.releaseId)) return fail("NOT_FOUND", "Release bulunamadı");
  const deployment = await saveDeployment({
    id: uid("dep"),
    product: parsed.data.product,
    provider: parsed.data.provider,
    environment: parsed.data.environment,
    url: parsed.data.url ?? null,
    commitSha: parsed.data.commitSha.toLowerCase(),
    branch: parsed.data.branch,
    status: parsed.data.status,
    releaseId: parsed.data.releaseId ?? null,
    createdAt: new Date().toISOString(),
    recordedBy: ctx.userId,
    source: "manual",
  });
  await audit(ctx, "platform.deployment.record", "PlatformDeployment", deployment.id, { ...deployment });
  return ok({ deployment });
}

// ───────────── Çalışan sürüm + migration durumu (gerçek kaynaklardan) ─────────────

export type RuntimeBuildInfo = {
  provider: "vercel" | "unknown";
  environment: string;
  commitSha: string | null;
  branch: string | null;
  url: string | null;
  note: string;
};

/** Yalnız sağlayıcının runtime env'i (Vercel otomatik set eder). Yoksa "bilinmiyor" — tahmin edilmez. */
export function getRuntimeBuildInfo(e: NodeJS.ProcessEnv = process.env): RuntimeBuildInfo {
  if (e.VERCEL) {
    return {
      provider: "vercel",
      environment: e.VERCEL_ENV ?? "unknown",
      commitSha: e.VERCEL_GIT_COMMIT_SHA ?? null,
      branch: e.VERCEL_GIT_COMMIT_REF ?? null,
      url: e.VERCEL_URL ? `https://${e.VERCEL_URL}` : null,
      note: "Vercel runtime ortam değişkenlerinden (VERCEL_*) okundu.",
    };
  }
  return {
    provider: "unknown",
    environment: e.NODE_ENV ?? "development",
    commitSha: null,
    branch: null,
    url: null,
    note: "Yayın ortamı bilgisi yok (yerel çalışma). Kod/yayın bilgisi uydurulmaz.",
  };
}

export type MigrationStatusRow = { name: string; inRepo: boolean; applied: boolean | null; appliedAt: string | null };

/**
 * Repo'daki migration klasörleri + (yalnız db modunda) `_prisma_migrations`
 * tablosundan SALT-OKUR uygulanma durumu. json/memory'de uygulanma bilinmez (null).
 */
export async function getMigrationStatus(): Promise<{ rows: MigrationStatusRow[]; source: "db" | "repo_only"; note: string }> {
  let repo: string[] = [];
  try {
    repo = (await fs.readdir(path.join(process.cwd(), "prisma", "migrations"), { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    repo = [];
  }
  if (!isDbMode) {
    return {
      rows: repo.map((name) => ({ name, inRepo: true, applied: null, appliedAt: null })),
      source: "repo_only",
      note: "Veritabanı kipi açık değil — uygulanma durumu okunmadı.",
    };
  }
  try {
    const { getPrisma } = await import("../db");
    const applied = (await getPrisma().$queryRawUnsafe(
      'SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE rolled_back_at IS NULL'
    )) as { migration_name: string; finished_at: Date | null }[];
    const byName = new Map(applied.map((a) => [a.migration_name, a.finished_at]));
    const names = [...new Set([...repo, ...applied.map((a) => a.migration_name)])].sort();
    return {
      rows: names.map((name) => ({
        name,
        inRepo: repo.includes(name),
        applied: byName.has(name) ? byName.get(name) !== null : false,
        appliedAt: byName.get(name)?.toISOString() ?? null,
      })),
      source: "db",
      note: "_prisma_migrations tablosundan salt-okur.",
    };
  } catch {
    return { rows: repo.map((name) => ({ name, inRepo: true, applied: null, appliedAt: null })), source: "repo_only", note: "Migration tablosu okunamadı." };
  }
}

// ───────────── Sağlayıcı adaptörü (sözleşme) ─────────────

/**
 * Deployment durum sağlayıcısı sözleşmesi. V1'de yalnız "yapılandırılmadı"
 * durumu döner; gerçek adaptör (Vercel REST, token server-side) bu arayüzü
 * uygular ve kayıtları `source: "provider"` ile yazar.
 */
export type DeploymentProviderStatus = {
  provider: "vercel";
  configured: boolean;
  lastSyncAt: string | null;
  note: string;
};

export function getDeploymentProviderStatus(): DeploymentProviderStatus {
  return {
    provider: "vercel",
    configured: false,
    lastSyncAt: null,
    note: "Vercel adaptörü bu sürümde bağlı değil: API çağrısı ve webhook kaydı yok. Kayıtlar elle veya imzalı CI olayıyla girilir.",
  };
}

// ───────────── İmzalı CI olayı (ileride GitHub Action) ─────────────

export const RELEASE_EVENT_SIGNATURE_HEADER = "x-neviios-signature";
const TOLERANCE_SEC = 300;

/** ReleaseEvent — CI'nin göndereceği tipli olay. */
export const releaseEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("release.created"), eventId: z.string().min(8).max(80), release: releaseInputSchema }),
  z.object({ type: z.literal("deployment.reported"), eventId: z.string().min(8).max(80), deployment: deploymentInputSchema }),
]);
export type ReleaseEvent = z.infer<typeof releaseEventSchema>;

/**
 * `x-neviios-signature: t=<unix>,v1=<hex hmac-sha256(secret, "<t>.<rawBody>")>`
 * 5 dk tolerans (replay). Sabit zamanlı karşılaştırma.
 */
export function verifyReleaseEventSignature(rawBody: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > TOLERANCE_SEC || !parts.v1) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(parts.v1, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signReleaseEvent(rawBody: string, secret: string, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex")}`;
}

// ponytail: tekrar (replay) koruması tolerans penceresi + süreç içi eventId kümesiyle; çok instance'ta kalıcı tekilleştirme için eventId unique kolonu eklenir.
const seenEvents = new Set<string>();

export async function ingestReleaseEvent(event: ReleaseEvent): Promise<ServiceResult<{ id: string; duplicate: boolean }>> {
  if (seenEvents.has(event.eventId)) return ok({ id: event.eventId, duplicate: true });
  seenEvents.add(event.eventId);
  const system: ServiceContext = { role: "HYPER_ADMIN", userId: "ci", tenantId: "tenant_platform", channel: "web", requestId: event.eventId };
  if (event.type === "release.created") {
    const release = await saveRelease(toManifest(event.release, "ci", "signed_ci_event"));
    await audit(system, "platform.release.ingest", "PlatformRelease", release.id, { version: release.version, commit: release.commit.sha, eventId: event.eventId });
    return ok({ id: release.id, duplicate: false });
  }
  const d = event.deployment;
  const deployment = await saveDeployment({
    id: uid("dep"),
    product: d.product,
    provider: d.provider,
    environment: d.environment,
    url: d.url ?? null,
    commitSha: d.commitSha.toLowerCase(),
    branch: d.branch,
    status: d.status,
    releaseId: d.releaseId ?? null,
    createdAt: new Date().toISOString(),
    recordedBy: "ci",
    source: "signed_ci_event",
  });
  await audit(system, "platform.deployment.ingest", "PlatformDeployment", deployment.id, { commit: deployment.commitSha, eventId: event.eventId });
  return ok({ id: deployment.id, duplicate: false });
}

// ───────────── Genel bakış ─────────────

export async function getReleaseCenter(ctx: ServiceContext) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const [releases, deployments, migrations] = await Promise.all([listReleases(), listDeployments(), getMigrationStatus()]);
  const latest: Partial<Record<`${ReleaseProduct}:${ReleaseEnvironment}`, ReleaseManifest>> = {};
  for (const r of releases) {
    const k = `${r.product}:${r.environment}` as const;
    if (!latest[k]) latest[k] = r;
  }
  return ok({
    runtime: getRuntimeBuildInfo(),
    provider: getDeploymentProviderStatus(),
    eventIngest: { enabled: Boolean(process.env.RELEASE_EVENT_SECRET), header: RELEASE_EVENT_SIGNATURE_HEADER },
    latest,
    releases,
    deployments,
    migrations,
  });
}
