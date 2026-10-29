/**
 * Karma Portal Erişimi — json/memory modu için ÇALIŞMA ZAMANI kullanıcı
 * oluşturma deposu.
 *
 * KÖK NEDEN (2026-08-31, CEO bildirdi — "mevcut öğrenciye davet gönderilemedi"):
 * `HASHED`/`BOOTSTRAP` (bkz. `./users.ts`) derleme zamanında SABİT bir dizi.
 * `provisionEntityLogin` eskiden yalnızca `db` modunda yeni bir `User` satırı
 * oluşturabiliyordu — "json/memory üretimde kullanılmıyor" varsayımına
 * dayanan bir yorum vardı. Bu varsayım GERÇEK DIŞI: gerçek müşteri (Nilüfer
 * Acar, 94 öğrenci + 8 öğretmen) BUGÜN `STORE_MODE=json` altında çalışıyor
 * (bkz. `docs/project-brain/KNOWN_GAPS.md` #1-2). Sonuç: `HASHED` dizisinde
 * olmayan (yani neredeyse TÜM gerçek öğrenci/öğretmenler) hiçbir kullanıcı
 * için portal daveti/erişimi ASLA çalışmıyordu — "Kullanıcı hesabı
 * oluşturulamadı/bulunamadı" hatası.
 *
 * Bu dosya `student-portal-access.ts`/`password-reset.ts` ile AYNI dosya-
 * tabanlı kalıcılık desenini kullanır (bkz. o dosyalardaki loadAll/saveAll).
 * `db` modunu HİÇ ETKİLEMEZ — orada gerçek Prisma `User` tablosu zaten var,
 * bu dosya yalnızca `!isDbMode` dallarından çağrılır.
 */
import path from "path";
import { resolveDataDir } from "../config";
import { uid } from "../utils";
import type { AppRole } from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "dynamic-users.json");

/** Resolved store path — testler aynı dosyayı temizleyebilsin diye açığa çıkarılır. */
export const DYNAMIC_USERS_FILE = FILE;

export type DynamicUserRecord = {
  userId: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  role: AppRole;
  teacherId: string | null;
  studentId: string | null;
  invitationPending?: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

async function loadAll(): Promise<DynamicUserRecord[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as DynamicUserRecord[];
  } catch {
    return [];
  }
}

/** Tek dosya okuma — kurum listesi gibi toplu görünümler için (N+1 yok). */
export async function listDynamicUsers(): Promise<DynamicUserRecord[]> {
  return loadAll();
}

async function saveAll(rows: DynamicUserRecord[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

export async function findDynamicUserByEmail(tenantId: string, email: string): Promise<DynamicUserRecord | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const all = await loadAll();
  return all.find((u) => u.tenantId === tenantId && u.email.toLowerCase() === normalized) ?? null;
}

/**
 * Tenant sınırı olmadan e-posta arar — `authenticateUser`/`findUserByEmail`
 * (login, şifremi unuttum) tenantId almaz; `HASHED.find`'ın mevcut
 * (tenant'sız) davranışıyla AYNI kapsam korunur.
 */
export async function findDynamicUserByEmailAnyTenant(email: string): Promise<DynamicUserRecord | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const all = await loadAll();
  return all.find((u) => u.email.toLowerCase() === normalized) ?? null;
}

export async function findDynamicUserById(userId: string): Promise<DynamicUserRecord | null> {
  const all = await loadAll();
  return all.find((u) => u.userId === userId) ?? null;
}

export async function findDynamicUserByTeacherId(tenantId: string, teacherId: string): Promise<DynamicUserRecord | null> {
  const all = await loadAll();
  return all.find((u) => u.tenantId === tenantId && u.teacherId === teacherId) ?? null;
}

export async function findDynamicUserByStudentId(tenantId: string, studentId: string): Promise<DynamicUserRecord | null> {
  const all = await loadAll();
  return all.find((u) => u.tenantId === tenantId && u.studentId === studentId) ?? null;
}

/**
 * Yeni bir çalışma-zamanı kullanıcısı oluşturur ve dosyaya kalıcı olarak
 * yazar. Çağıran (`provisionEntityLogin`) e-postanın zaten var olup
 * olmadığını (HASHED + bu depo, active durumundan BAĞIMSIZ) önce kendi
 * kontrol eder — bu fonksiyon idempotency kontrolü YAPMAZ, doğrudan ekler.
 */
export async function createDynamicUser(input: {
  tenantId: string;
  email: string;
  passwordHash: string;
  role: AppRole;
  teacherId?: string;
  studentId?: string;
  invitationPending?: boolean;
}): Promise<DynamicUserRecord> {
  const all = await loadAll();
  const now = new Date().toISOString();
  const record: DynamicUserRecord = {
    userId: uid("user"),
    tenantId: input.tenantId,
    email: input.email.trim().toLowerCase(),
    passwordHash: input.passwordHash,
    role: input.role,
    teacherId: input.teacherId ?? null,
    studentId: input.studentId ?? null,
    invitationPending: input.invitationPending ?? false,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  all.push(record);
  await saveAll(all);
  return record;
}

export async function updatePendingTeacherInvitationEmail(
  tenantId: string,
  userId: string,
  teacherId: string,
  email: string
): Promise<"updated" | "not_pending" | "email_taken"> {
  const normalized = email.trim().toLowerCase();
  const all = await loadAll();
  const owner = all.find((user) => user.tenantId === tenantId && user.email.toLowerCase() === normalized);
  if (owner && owner.userId !== userId) return "email_taken";

  const index = all.findIndex(
    (user) =>
      user.userId === userId &&
      user.tenantId === tenantId &&
      user.teacherId === teacherId &&
      user.role === "TEACHER" &&
      user.invitationPending === true
  );
  if (index < 0) return "not_pending";
  all[index] = { ...all[index]!, email: normalized, updatedAt: new Date().toISOString() };
  await saveAll(all);
  return "updated";
}

export async function setDynamicTeacherInvitationPending(
  tenantId: string,
  userId: string,
  invitationPending: boolean
): Promise<boolean> {
  const all = await loadAll();
  const index = all.findIndex(
    (user) => user.userId === userId && user.tenantId === tenantId && user.role === "TEACHER"
  );
  if (index < 0) return false;
  all[index] = { ...all[index]!, invitationPending, updatedAt: new Date().toISOString() };
  await saveAll(all);
  return true;
}

export async function setDynamicUserActive(userId: string, active: boolean): Promise<boolean> {
  const all = await loadAll();
  const idx = all.findIndex((u) => u.userId === userId);
  if (idx === -1) return false;
  all[idx] = { ...all[idx], active, updatedAt: new Date().toISOString() };
  await saveAll(all);
  return true;
}

export async function setDynamicUserPasswordHash(userId: string, passwordHash: string): Promise<boolean> {
  const all = await loadAll();
  const idx = all.findIndex((u) => u.userId === userId);
  if (idx === -1) return false;
  all[idx] = { ...all[idx], passwordHash, updatedAt: new Date().toISOString() };
  await saveAll(all);
  return true;
}

/**
 * 10. tur iş #1 — SELF davet bağlaması / bayat bağ onarımının dosya-tabanlı
 * yazma ucu. `null` bağlamayı temizler (veli-çoklu-öğrenci onarımı).
 */
export async function setDynamicUserStudentId(userId: string, studentId: string | null): Promise<boolean> {
  const all = await loadAll();
  const idx = all.findIndex((u) => u.userId === userId);
  if (idx === -1) return false;
  all[idx] = { ...all[idx], studentId, updatedAt: new Date().toISOString() };
  await saveAll(all);
  return true;
}

/** E-posta değiştirme akışının dynamic-kullanıcı yazma ucu (kalıcı dosya). */
export async function setDynamicUserEmail(userId: string, email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const all = await loadAll();
  const idx = all.findIndex((u) => u.userId === userId);
  if (idx === -1) return false;
  all[idx] = { ...all[idx], email: normalized, updatedAt: new Date().toISOString() };
  await saveAll(all);
  return true;
}
