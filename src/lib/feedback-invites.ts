/**
 * Rapor portalı (2026-10-14) — kişiye özel öğretmen değerlendirme bağlantısı (`/degerlendir/<kod>`).
 *
 * Güvenlik: kod 32 bayt rastgele (base64url); veritabanında yalnız sha256 özeti tutulur — dökümden bağlantı üretilemez.
 * 14 gün geçerli; aynı öğrenci için yeni bağlantı eskisini iptal eder; her öğretmen bir kez değerlendirilir.
 * Mod paritesi: db → Prisma (tamamlanma işareti tek koşullu SQL ifadesi), json/memory → dosya.
 */
import path from "path";
import { createHash, randomBytes } from "crypto";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "feedback-invites.json");
export const FEEDBACK_INVITES_FILE = FILE;
export const FEEDBACK_INVITE_TTL_DAYS = 14;

export type FeedbackInviteRow = {
  id: string;
  tenantId: string;
  studentId: string;
  tokenHash: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  completedTeacherIds: string[];
};

export type ResolvedInvite =
  | { status: "ok"; invite: FeedbackInviteRow }
  | { status: "expired" | "revoked"; invite: FeedbackInviteRow }
  | { status: "not_found" };

export function hashInviteCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

function isActive(row: FeedbackInviteRow, nowMs: number): boolean {
  return !row.revokedAt && Date.parse(row.expiresAt) > nowMs;
}

async function loadAll(): Promise<FeedbackInviteRow[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(FILE, "utf8")) as FeedbackInviteRow[];
  } catch {
    return [];
  }
}

async function saveAll(rows: FeedbackInviteRow[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

type DbRow = {
  id: string;
  tenantId: string;
  studentId: string;
  tokenHash: string;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  completedTeacherIds: unknown;
};

function mapDb(r: DbRow): FeedbackInviteRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    studentId: r.studentId,
    tokenHash: r.tokenHash,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    revokedAt: r.revokedAt ? r.revokedAt.toISOString() : undefined,
    completedTeacherIds: Array.isArray(r.completedTeacherIds) ? (r.completedTeacherIds as string[]) : [],
  };
}

/** Yeni bağlantı üretir; aynı öğrencinin etkin bağlantısı iptal edilir. Düz kod YALNIZ burada döner. */
export async function createInvite(
  tenantId: string,
  studentId: string,
  createdBy: string,
  now: Date = new Date()
): Promise<{ invite: FeedbackInviteRow; code: string }> {
  const code = randomBytes(32).toString("base64url");
  const row: FeedbackInviteRow = {
    id: uid("finv"),
    tenantId,
    studentId,
    tokenHash: hashInviteCode(code),
    createdBy,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + FEEDBACK_INVITE_TTL_DAYS * 86_400_000).toISOString(),
    completedTeacherIds: [],
  };
  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.$transaction([
      prisma.feedbackInvite.updateMany({
        where: { tenantId, studentId, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      }),
      prisma.feedbackInvite.create({
        data: { ...row, createdAt: now, expiresAt: new Date(row.expiresAt), revokedAt: null },
        select: { id: true },
      }),
    ]);
    return { invite: row, code };
  }
  const all = await loadAll();
  const nowMs = now.getTime();
  for (const r of all) {
    if (r.tenantId === tenantId && r.studentId === studentId && isActive(r, nowMs)) r.revokedAt = now.toISOString();
  }
  all.push(row);
  await saveAll(all);
  return { invite: row, code };
}

/** Kodu çözer. Tenant kodun satırından gelir (oturum yok). */
export async function resolveInvite(code: string, now: Date = new Date()): Promise<ResolvedInvite> {
  if (!code || code.length < 20 || code.length > 100) return { status: "not_found" };
  const tokenHash = hashInviteCode(code);
  let row: FeedbackInviteRow | undefined;
  if (isDbMode) {
    const { prisma } = await import("./db");
    const r = await prisma.feedbackInvite.findUnique({ where: { tokenHash } });
    row = r ? mapDb(r) : undefined;
  } else {
    row = (await loadAll()).find((r) => r.tokenHash === tokenHash);
  }
  if (!row) return { status: "not_found" };
  if (row.revokedAt) return { status: "revoked", invite: row };
  if (Date.parse(row.expiresAt) <= now.getTime()) return { status: "expired", invite: row };
  return { status: "ok", invite: row };
}

/** Öğretmeni "değerlendirildi" işaretler; zaten işaretliyse `false` (yarışta tek kazanan). */
export async function markInviteTeacherCompleted(inviteId: string, teacherId: string): Promise<boolean> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    // Tek ifade, koşullu: aynı öğretmen ikinci kez eklenmez (eşzamanlı iki gönderimde biri 0 satır günceller).
    const n = await prisma.$executeRaw`
      UPDATE "FeedbackInvite"
      SET "completedTeacherIds" = "completedTeacherIds" || to_jsonb(${teacherId}::text)
      WHERE "id" = ${inviteId} AND NOT ("completedTeacherIds" ? ${teacherId})`;
    return n === 1;
  }
  const all = await loadAll();
  const row = all.find((r) => r.id === inviteId);
  if (!row || row.completedTeacherIds.includes(teacherId)) return false;
  row.completedTeacherIds.push(teacherId);
  await saveAll(all);
  return true;
}

/** Talep geri alınır (yazım başarısız olursa yer ayırtma bırakılır). */
export async function releaseInviteTeacher(inviteId: string, teacherId: string): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.$executeRaw`
      UPDATE "FeedbackInvite" SET "completedTeacherIds" = "completedTeacherIds" - ${teacherId}::text WHERE "id" = ${inviteId}`;
    return;
  }
  const all = await loadAll();
  const row = all.find((r) => r.id === inviteId);
  if (!row) return;
  row.completedTeacherIds = row.completedTeacherIds.filter((t) => t !== teacherId);
  await saveAll(all);
}

/** Bağlantı sayfasında tam ad yerine "Ad S." (bağlantı başkasına geçerse kişisel veri en aza iner). */
export function maskStudentName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  const last = parts[parts.length - 1];
  return `${parts.slice(0, -1).join(" ")} ${last.charAt(0).toLocaleUpperCase("tr")}.`;
}

export async function revokeInvite(tenantId: string, inviteId: string, now: Date = new Date()): Promise<boolean> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    try {
      await prisma.feedbackInvite.update({
        where: { id: inviteId, tenantId, revokedAt: null },
        data: { revokedAt: now },
        select: { id: true },
      });
      return true;
    } catch {
      return false; // yok / başka kurum / zaten iptal
    }
  }
  const all = await loadAll();
  const row = all.find((r) => r.id === inviteId && r.tenantId === tenantId && !r.revokedAt);
  if (!row) return false;
  row.revokedAt = now.toISOString();
  await saveAll(all);
  return true;
}

/** Öğrencinin etkin bağlantısı (yönetici ekranı: "etkin link var, son geçerlilik …"). Kod geri verilemez. */
export async function findActiveInviteForStudent(
  tenantId: string,
  studentId: string,
  now: Date = new Date()
): Promise<FeedbackInviteRow | null> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const r = await prisma.feedbackInvite.findFirst({
      where: { tenantId, studentId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    return r ? mapDb(r) : null;
  }
  const nowMs = now.getTime();
  const rows = (await loadAll()).filter((r) => r.tenantId === tenantId && r.studentId === studentId && isActive(r, nowMs));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

export async function countActiveInvites(tenantId: string, now: Date = new Date()): Promise<number> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    return prisma.feedbackInvite.count({ where: { tenantId, revokedAt: null, expiresAt: { gt: now } } });
  }
  const nowMs = now.getTime();
  return (await loadAll()).filter((r) => r.tenantId === tenantId && isActive(r, nowMs)).length;
}
