/**
 * Karma Öğrenci Portalı — StudentPortalAccess store katmanı.
 * `notification-preferences.ts` ile AYNI ikili (json dosya ↔ Prisma DB) desen.
 * STORE_MODE=db → Prisma StudentPortalAccess (bkz. prisma/schema.prisma —
 * migration henüz UYGULANMADI, bkz. final rapor). STORE_MODE=json/memory →
 * dosya tabanlı store (demo/test).
 *
 * Bu, `canAccessStudent`/`assertStudentAccess`'in tek gerçek kaynağıdır:
 * veli/öğrenci ayrımı artık bir rol değil, buradaki `accessType`
 * ("GUARDIAN" | "SELF") ile çözülür. Erişim iptali (`status = revoked`)
 * bir sonraki istekte hemen etkili olur — JWT'de veya request-scope dışında
 * hiçbir yerde cache'lenmez.
 */
import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "student-portal-access.json");

/** Resolved store path — exposed so tests clean up the same file the module writes. */
export const STUDENT_PORTAL_ACCESS_FILE = FILE;

export type PortalAccessType = "GUARDIAN" | "SELF";
export type PortalAccessStatus = "invited" | "active" | "revoked";

export type StudentPortalAccessRecord = {
  id: string;
  tenantId: string;
  userId: string;
  studentId: string;
  accessType: PortalAccessType;
  status: PortalAccessStatus;
  invitedBy: string | null;
  invitedAt: string;
  activatedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

async function loadAll(): Promise<StudentPortalAccessRecord[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as StudentPortalAccessRecord[];
  } catch {
    return [];
  }
}

async function saveAll(rows: StudentPortalAccessRecord[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

function toRecord(r: {
  id: string;
  tenantId: string;
  userId: string;
  studentId: string;
  accessType: string;
  status: string;
  invitedBy: string | null;
  invitedAt: Date;
  activatedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): StudentPortalAccessRecord {
  return {
    id: r.id,
    tenantId: r.tenantId,
    userId: r.userId,
    studentId: r.studentId,
    accessType: r.accessType as PortalAccessType,
    status: r.status as PortalAccessStatus,
    invitedBy: r.invitedBy,
    invitedAt: r.invitedAt.toISOString(),
    activatedAt: r.activatedAt?.toISOString() ?? null,
    revokedAt: r.revokedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * STORE_MODE=json/memory'de BOOTSTRAP kimlikleri (`src/lib/auth/users.ts`
 * HASHED dizisi) derleme zamanında sabittir — hiçbir migration/seed betiği
 * bunlar için StudentPortalAccess satırı OLUŞTURAMAZ (bu iki mod zaten
 * `db push`/`migrate deploy` KULLANMAZ). Bu, json/memory modundaki HER
 * demo öğrenci/veli hesabının kendi verisine erişimi kaybetmesi anlamına
 * gelirdi (bkz. canlı ortamda bulunan gerçek regresyon — bootstrap
 * `user_student_s1` kendi ödemesi için FORBIDDEN alıyordu). Bu fallback
 * yalnızca DB-DIŞI modlarda ve yalnızca User.studentId (deprecated ama
 * bootstrap için TEK kaynak) eşleşirse devreye girer — eski
 * `ctx.studentId === studentId` davranışının doğrudan karşılığı, DB
 * modunu ETKİLEMEZ.
 */
async function bootstrapFallbackAccessType(
  tenantId: string,
  userId: string,
  studentId: string
): Promise<PortalAccessType | null> {
  if (isDbMode) return null;
  const { getUserById } = await import("./auth/users");
  const user = await getUserById(userId);
  if (user && user.tenantId === tenantId && user.studentId === studentId) return "SELF";
  return null;
}

/**
 * Tek gerçek erişim doğrulaması: tenantId + userId + studentId + status=active.
 * Her istekte async çağrılır — cache yalnızca request-scope olabilir (JWT'de
 * ASLA saklanmaz), böylece iptal bir sonraki istekte hemen etkili olur.
 */
export async function hasActiveStudentAccess(
  tenantId: string,
  userId: string,
  studentId: string
): Promise<boolean> {
  if (isDbMode) {
    try {
      const { prisma } = await import("./db");
      const row = await prisma.studentPortalAccess.findUnique({
        where: { tenantId_userId_studentId: { tenantId, userId, studentId } },
      });
      return row?.status === "active";
    } catch {
      return false;
    }
  }
  const all = await loadAll();
  const explicit = all.some(
    (r) => r.tenantId === tenantId && r.userId === userId && r.studentId === studentId && r.status === "active"
  );
  if (explicit) return true;
  return (await bootstrapFallbackAccessType(tenantId, userId, studentId)) !== null;
}

/**
 * Tek bir (tenant, user, student) kaydının accessType'ını döner — yalnızca
 * status=active ise. Bazı işlemler (ör. `submitHomeworkTool`) GUARDIAN'ı
 * DEĞİL yalnızca SELF'i kabul eder (eski PARENT rolü hiç ödev
 * yükleyemiyordu — bu davranış korunur, bkz. tools.ts yorumu).
 */
export async function getActiveAccessType(
  tenantId: string,
  userId: string,
  studentId: string
): Promise<PortalAccessType | null> {
  if (isDbMode) {
    try {
      const { prisma } = await import("./db");
      const row = await prisma.studentPortalAccess.findUnique({
        where: { tenantId_userId_studentId: { tenantId, userId, studentId } },
      });
      return row?.status === "active" ? (row.accessType as PortalAccessType) : null;
    } catch {
      return null;
    }
  }
  const all = await loadAll();
  const row = all.find(
    (r) => r.tenantId === tenantId && r.userId === userId && r.studentId === studentId && r.status === "active"
  );
  if (row) return row.accessType;
  return bootstrapFallbackAccessType(tenantId, userId, studentId);
}

export async function listAccessForUser(tenantId: string, userId: string): Promise<StudentPortalAccessRecord[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.studentPortalAccess.findMany({ where: { tenantId, userId } });
    return rows.map(toRecord);
  }
  const all = await loadAll();
  return all.filter((r) => r.tenantId === tenantId && r.userId === userId);
}

export async function listAccessForStudent(
  tenantId: string,
  studentId: string
): Promise<StudentPortalAccessRecord[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.studentPortalAccess.findMany({ where: { tenantId, studentId } });
    return rows.map(toRecord);
  }
  const all = await loadAll();
  return all.filter((r) => r.tenantId === tenantId && r.studentId === studentId);
}

/**
 * Faz 4 — duyuru hedef kitlesi çözümü (`announcements/index.ts`
 * `buildAnnouncementRecipientCandidates`) için tenant'ın TÜM aktif
 * (status="active") erişim kayıtları — hem SELF hem GUARDIAN.
 */
export async function listActiveAccessForTenant(tenantId: string): Promise<StudentPortalAccessRecord[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.studentPortalAccess.findMany({ where: { tenantId, status: "active" } });
    return rows.map(toRecord);
  }
  const all = await loadAll();
  return all.filter((r) => r.tenantId === tenantId && r.status === "active");
}

/**
 * @deprecated Yalnızca gerçek bir e-posta/SMS davet akışı eklenirse
 * kullanılacak alt-seviye primitif — bkz. `grantActiveStudentPortalAccess`.
 * Davet oluşturma (status=invited) — hiçbir zaman otomatik `active` yapmaz.
 * Aynı (tenant,user,student) için ikinci kez çağrılırsa mevcut kaydı döner
 * (idempotent) — revoked bir kaydı YENİDEN davet etmez, önce reaktive gerekir.
 */
export async function inviteStudentPortalAccess(input: {
  tenantId: string;
  userId: string;
  studentId: string;
  accessType: PortalAccessType;
  invitedBy: string;
}): Promise<StudentPortalAccessRecord> {
  const { tenantId, userId, studentId, accessType, invitedBy } = input;
  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.studentPortalAccess.findUnique({
      where: { tenantId_userId_studentId: { tenantId, userId, studentId } },
    });
    if (existing) return toRecord(existing);
    const created = await prisma.studentPortalAccess.create({
      data: { id: uid("spa"), tenantId, userId, studentId, accessType, status: "invited", invitedBy },
    });
    return toRecord(created);
  }
  const all = await loadAll();
  const existing = all.find((r) => r.tenantId === tenantId && r.userId === userId && r.studentId === studentId);
  if (existing) return existing;
  const now = new Date().toISOString();
  const record: StudentPortalAccessRecord = {
    id: uid("spa"),
    tenantId,
    userId,
    studentId,
    accessType,
    status: "invited",
    invitedBy,
    invitedAt: now,
    activatedAt: null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  all.push(record);
  await saveAll(all);
  return record;
}

/**
 * Admin'in "Portal erişimi oluştur / davet gönder" aksiyonu — GERÇEK bir
 * e-posta/SMS davet-linki + kullanıcının kendi şifresini belirlediği ayrı
 * bir "daveti kabul et" akışı YOK (bilinçli minimal kapsam, bkz. task #34
 * final rapor). Bu yüzden `invite` + `activate`'i İKİ AYRI adım gibi
 * göstermek yanıltıcı olurdu — admin'in tek tıkıyla verdiği erişim TEK,
 * atomik bir işlemde doğrudan `active` olarak yazılır. `inviteStudentPortalAccess`/
 * `activateStudentPortalAccess` alt-seviye primitifleri, gerçek bir
 * e-posta/SMS davet akışı eklenirse (kullanıcı linke tıklayana kadar
 * `invited` kalması gerektiğinde) kullanılmak üzere KORUNUYOR — bugün
 * hiçbir çağıran onları ayrı ayrı kullanmamalı.
 */
export async function grantActiveStudentPortalAccess(input: {
  tenantId: string;
  userId: string;
  studentId: string;
  accessType: PortalAccessType;
  invitedBy: string;
}): Promise<StudentPortalAccessRecord> {
  const { tenantId, userId, studentId, accessType, invitedBy } = input;
  if (isDbMode) {
    const { prisma } = await import("./db");
    const now = new Date();
    const existing = await prisma.studentPortalAccess.findUnique({
      where: { tenantId_userId_studentId: { tenantId, userId, studentId } },
    });
    if (existing) {
      if (existing.status === "active") return toRecord(existing);
      const updated = await prisma.studentPortalAccess.update({
        where: { tenantId_userId_studentId: { tenantId, userId, studentId } },
        data: { status: "active", accessType, activatedAt: now },
      });
      return toRecord(updated);
    }
    const created = await prisma.studentPortalAccess.create({
      data: { id: uid("spa"), tenantId, userId, studentId, accessType, status: "active", invitedBy, activatedAt: now },
    });
    return toRecord(created);
  }
  const all = await loadAll();
  const idx = all.findIndex((r) => r.tenantId === tenantId && r.userId === userId && r.studentId === studentId);
  const now = new Date().toISOString();
  if (idx !== -1) {
    if (all[idx].status === "active") return all[idx];
    all[idx] = { ...all[idx], status: "active", accessType, activatedAt: now, updatedAt: now };
    await saveAll(all);
    return all[idx];
  }
  const record: StudentPortalAccessRecord = {
    id: uid("spa"),
    tenantId,
    userId,
    studentId,
    accessType,
    status: "active",
    invitedBy,
    invitedAt: now,
    activatedAt: now,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  all.push(record);
  await saveAll(all);
  return record;
}

/**
 * @deprecated Yalnızca gerçek bir e-posta/SMS davet akışı eklenirse
 * kullanılacak alt-seviye primitif — bkz. `grantActiveStudentPortalAccess`.
 * Bugün hiçbir çağıran bunu tek başına kullanmamalı.
 */
/** Davetin kabulü / doğrudan aktivasyon (ör. migration backfill) — status=active. */
export async function activateStudentPortalAccess(
  tenantId: string,
  userId: string,
  studentId: string
): Promise<StudentPortalAccessRecord | null> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    try {
      const updated = await prisma.studentPortalAccess.update({
        where: { tenantId_userId_studentId: { tenantId, userId, studentId } },
        data: { status: "active", activatedAt: new Date() },
      });
      return toRecord(updated);
    } catch {
      return null;
    }
  }
  const all = await loadAll();
  const idx = all.findIndex((r) => r.tenantId === tenantId && r.userId === userId && r.studentId === studentId);
  if (idx === -1) return null;
  const now = new Date().toISOString();
  all[idx] = { ...all[idx], status: "active", activatedAt: now, updatedAt: now };
  await saveAll(all);
  return all[idx];
}

/** Erişimi iptal eder — bir sonraki istekten itibaren `hasActiveStudentAccess` false döner. */
export async function revokeStudentPortalAccess(
  tenantId: string,
  userId: string,
  studentId: string
): Promise<StudentPortalAccessRecord | null> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    try {
      const updated = await prisma.studentPortalAccess.update({
        where: { tenantId_userId_studentId: { tenantId, userId, studentId } },
        data: { status: "revoked", revokedAt: new Date() },
      });
      return toRecord(updated);
    } catch {
      return null;
    }
  }
  const all = await loadAll();
  const idx = all.findIndex((r) => r.tenantId === tenantId && r.userId === userId && r.studentId === studentId);
  if (idx === -1) return null;
  const now = new Date().toISOString();
  all[idx] = { ...all[idx], status: "revoked", revokedAt: now, updatedAt: now };
  await saveAll(all);
  return all[idx];
}
