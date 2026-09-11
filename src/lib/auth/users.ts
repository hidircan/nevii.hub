import { DEFAULT_TENANT_ID } from "./config";
import type { AppRole, AuthUser } from "./types";
import { APP_ROLES } from "./types";
import { hashPasswordSync, verifyPassword } from "./password";
import { isDbMode } from "../config";
import { auditLog } from "./audit";
import { uid } from "../utils";

type BootstrapUser = AuthUser & { password: string };

/** In-memory bootstrap identities (json/memory modes) with bcrypt hashes */
const BOOTSTRAP: BootstrapUser[] = [
  {
    userId: "user_super",
    email: "super@notaplan.app",
    password: process.env.AUTH_SUPER_PASSWORD || "demo-super",
    role: "SUPER_ADMIN",
    tenantId: DEFAULT_TENANT_ID,
  },
  {
    userId: "user_admin",
    email: "admin@niluferacar.com.tr",
    password: process.env.AUTH_ADMIN_PASSWORD || "demo-admin",
    role: "SCHOOL_ADMIN",
    tenantId: DEFAULT_TENANT_ID,
  },
  /**
   * İş 4 — rol hiyerarşisi (P0 2026-09-09): Nilüfer Acar kurum sahibidir
   * ama SUPER_ADMIN DEĞİLDİR. Platform sahibi yalnız `user_super`
   * (Hıdırcan Yağız). Ezgi Güçlü kurum müdürüdür (SCHOOL_ADMIN, finans/
   * personel özeti yok). Nihal Gedikli bu listede YOK — gerçek hesap
   * e-posta olmadan oluşturulmaz.
   */
  {
    userId: "user_owner_nilufer",
    email: "nilufer.acar@niluferacar.com.tr",
    password: process.env.AUTH_OWNER_PASSWORD || "demo-owner-nilufer",
    role: "SCHOOL_ADMIN",
    tenantId: DEFAULT_TENANT_ID,
  },
  {
    userId: "user_manager_ezgi",
    email: "ezgi.guclu@niluferacar.com.tr",
    password: process.env.AUTH_MANAGER_PASSWORD || "demo-manager-ezgi",
    role: "SCHOOL_ADMIN",
    tenantId: DEFAULT_TENANT_ID,
  },
  /**
   * KÖK NEDEN (öğretmen girişi çalışmıyordu) — `src/lib/seed.ts`'teki t1..t7
   * öğretmenleri (CSV'den içe aktarılan gerçek isimler/e-postalar) yalnızca
   * `STORE_MODE=db`'de, `scripts/seed-demo-csv-teachers.ts` çalıştırıldığında
   * gerçek bir Prisma `User` satırına kavuşuyordu. `json`/`memory` modunda
   * (varsayılan yerel/demo mod — bkz. CLAUDE.md) `authenticateUser` yalnızca
   * bu BOOTSTRAP listesine bakar; burada t1..t7 için HİÇ giriş kimliği YOKTU
   * (yalnızca artık var olmayan "can@niluferacar.com.tr" adında, hiçbir
   * gerçek Teacher kaydına karşılık gelmeyen tek bir satır vardı). Sonuç:
   * `login-form.tsx`'deki 7 "Öğretmen — …" demo persona'sının TÜMÜ, mode
   * parity ihlali yüzünden `json`/`memory` modunda her zaman "Invalid email
   * or password" ile başarısız oluyordu — şifre yanlış değildi, kullanıcı
   * satırı hiç yoktu. Düzeltme: her t1..t7 için, seed.ts'teki gerçek
   * e-postayla ve login-form.tsx/seed-demo-csv-teachers.ts ile AYNI
   * `demo-teacher-csv-N` şifresiyle bir BOOTSTRAP girişi eklendi.
   */
  {
    userId: "user_teacher_t1",
    email: "turgay.hosbas@niluferacar.com.tr",
    password: process.env.AUTH_DEMO_CSV_TEACHER_1 || "demo-teacher-csv-1",
    role: "TEACHER",
    tenantId: DEFAULT_TENANT_ID,
    teacherId: "t1",
  },
  {
    userId: "user_teacher_t2",
    email: "olcay.ozdemir@niluferacar.com.tr",
    password: process.env.AUTH_DEMO_CSV_TEACHER_2 || "demo-teacher-csv-2",
    role: "TEACHER",
    tenantId: DEFAULT_TENANT_ID,
    teacherId: "t2",
  },
  {
    userId: "user_teacher_t3",
    email: "ebru.sirince@niluferacar.com.tr",
    password: process.env.AUTH_DEMO_CSV_TEACHER_3 || "demo-teacher-csv-3",
    role: "TEACHER",
    tenantId: DEFAULT_TENANT_ID,
    teacherId: "t3",
  },
  {
    userId: "user_teacher_t4",
    email: "sevval.aydin@niluferacar.com.tr",
    password: process.env.AUTH_DEMO_CSV_TEACHER_4 || "demo-teacher-csv-4",
    role: "TEACHER",
    tenantId: DEFAULT_TENANT_ID,
    teacherId: "t4",
  },
  {
    userId: "user_teacher_t5",
    email: "gokhan.keskin@niluferacar.com.tr",
    password: process.env.AUTH_DEMO_CSV_TEACHER_5 || "demo-teacher-csv-5",
    role: "TEACHER",
    tenantId: DEFAULT_TENANT_ID,
    teacherId: "t5",
  },
  {
    userId: "user_teacher_t6",
    email: "hilal.isci@niluferacar.com.tr",
    password: process.env.AUTH_DEMO_CSV_TEACHER_6 || "demo-teacher-csv-6",
    role: "TEACHER",
    tenantId: DEFAULT_TENANT_ID,
    teacherId: "t6",
  },
  {
    userId: "user_teacher_t7",
    email: "pinar.celik@niluferacar.com.tr",
    password: process.env.AUTH_DEMO_CSV_TEACHER_7 || "demo-teacher-csv-7",
    role: "TEACHER",
    tenantId: DEFAULT_TENANT_ID,
    teacherId: "t7",
  },
  {
    userId: "user_parent_s1",
    email: "selin@email.com",
    password: process.env.AUTH_PARENT_PASSWORD || "demo-parent",
    role: "STUDENT",
    tenantId: DEFAULT_TENANT_ID,
    studentId: "s1",
  },
  {
    /**
     * EPIC 6A (IMPLEMENTATION_PLAN.md) — öğrencinin kendi hesabıyla giriş
     * yapabildiği ilk demo kimliği. Aynı öğrenciyi (s1) veli hesabının
     * YANINDA temsil eder — biri diğerinin yerini almaz.
     */
    userId: "user_student_s1",
    email: "ogrenci@email.com",
    password: process.env.AUTH_STUDENT_PASSWORD || "demo-student",
    role: "STUDENT",
    tenantId: DEFAULT_TENANT_ID,
    studentId: "s1",
  },
  /**
   * KÖK NEDEN (öğrenci girişi çalışmıyordu) — login-form.tsx'teki 5 "Öğrenci
   * — CSV" demo persona'sı (Ada Yılmaz vd.), t1..t7 öğretmen girişindeki
   * köküyle AYNI mode-parity sorunu yüzünden json/memory modunda hiç giriş
   * yapamıyordu: bu kimlikler yalnızca STORE_MODE=db'de
   * scripts/seed-demo-csv-teachers.ts çalıştırıldığında oluşuyordu. Karşılık
   * gelen Student kayıtları seed.ts'e s_csv_1..5 id'leriyle eklendi; burada da
   * aynı e-posta/şifre ile BOOTSTRAP girişleri eklendi.
   */
  {
    userId: "user_student_csv_1",
    email: "ada.yilmaz.demo@email.com",
    password: process.env.AUTH_DEMO_CSV_STUDENT_1 || "demo-student-csv-1",
    role: "STUDENT",
    tenantId: DEFAULT_TENANT_ID,
    studentId: "s_csv_1",
  },
  {
    userId: "user_student_csv_2",
    email: "kerem.sahin.demo@email.com",
    password: process.env.AUTH_DEMO_CSV_STUDENT_2 || "demo-student-csv-2",
    role: "STUDENT",
    tenantId: DEFAULT_TENANT_ID,
    studentId: "s_csv_2",
  },
  {
    userId: "user_student_csv_3",
    email: "nehir.kaya.demo@email.com",
    password: process.env.AUTH_DEMO_CSV_STUDENT_3 || "demo-student-csv-3",
    role: "STUDENT",
    tenantId: DEFAULT_TENANT_ID,
    studentId: "s_csv_3",
  },
  {
    userId: "user_student_csv_4",
    email: "toprak.demir.demo@email.com",
    password: process.env.AUTH_DEMO_CSV_STUDENT_4 || "demo-student-csv-4",
    role: "STUDENT",
    tenantId: DEFAULT_TENANT_ID,
    studentId: "s_csv_4",
  },
  {
    userId: "user_student_csv_5",
    email: "elif.aksoy.demo@email.com",
    password: process.env.AUTH_DEMO_CSV_STUDENT_5 || "demo-student-csv-5",
    role: "STUDENT",
    tenantId: DEFAULT_TENANT_ID,
    studentId: "s_csv_5",
  },
  {
    /** Demo persona: gecikmiş ödeme + açık telafi talebi (s5) */
    userId: "user_parent_s5",
    email: "deniz@email.com",
    password: process.env.AUTH_PARENT_PASSWORD || "demo-parent",
    role: "STUDENT",
    tenantId: DEFAULT_TENANT_ID,
    studentId: "s5",
  },
  {
    /** Demo persona: kısmi ödeme + öncelikli (okul kaynaklı) telafi talebi (s4) */
    userId: "user_parent_s4",
    email: "mehmet@email.com",
    password: process.env.AUTH_PARENT_PASSWORD || "demo-parent",
    role: "STUDENT",
    tenantId: DEFAULT_TENANT_ID,
    studentId: "s4",
  },
  {
    userId: "user_agent",
    email: "agent@notaplan.app",
    password: process.env.AUTH_AGENT_PASSWORD || "demo-agent",
    role: "AI_AGENT",
    tenantId: DEFAULT_TENANT_ID,
  },
  {
    /**
     * İkinci kurum (Test Kampüs) için ayrı bir SCHOOL_ADMIN — çoklu-kurum
     * demoda kurum izolasyonunu (SCHOOL_ADMIN'in yalnızca kendi kurumunu
     * görmesi) gerçek, ayrı bir hesapla doğrulamak için eklendi. Kimliği
     * DEFAULT_TENANT_ID'den FARKLI bir tenantId'ye bağlıdır — mevcut
     * admin@niluferacar.com.tr hesabıyla çakışmaz.
     */
    userId: "user_admin_test_kampus",
    email: "admin@testkampus.notaplan.app",
    password: process.env.AUTH_TEST_ADMIN_PASSWORD || "demo-test-admin",
    role: "SCHOOL_ADMIN",
    tenantId: "tenant_test_kampus",
  },
];

/**
 * Kök neden düzeltmesi — `passwordHash` eskiden modül yüklenirken TÜM
 * bootstrap kullanıcıları (25 hesap) için EAGER olarak hesaplanıyordu
 * (`bcrypt.hashSync`, bcryptjs — native değil, saf JS, 12 round). Bu tek
 * seferlik maliyet ~6sn sürüyor. Çoğu test dosyasında bu modül BAŞKA bir
 * yerden (statik import) test TOPLAMA aşamasında zaten ısıtılıyordu — ama
 * `student-portal-access.ts`'teki `bootstrapFallbackAccessType` bu modülü
 * BİLİNÇLİ olarak DİNAMİK import ediyor (db modunda hiç yüklenmesin diye).
 * O dinamik import ilk kez bir testin GÖVDESİ içinde tetiklenirse, 6sn'lik
 * senkron bcrypt maliyeti o testin 5sn'lik zaman aşımı bütçesine düşüyor
 * (bkz. access-control-matrix.test.ts regresyonu). `getUserById` gibi
 * çağıranların çoğu `passwordHash`'e hiç dokunmaz (`toAuthUser` onu
 * atar) — bu yüzden hash'i eager DEĞİL, yalnızca gerçekten okunduğunda
 * (login/seed) hesaplayıp bellekte önbelleğe alan bir getter'a çevirmek,
 * DAVRANIŞI değiştirmeden (aynı sonuç, aynı memoization) modülün
 * import/yükleme maliyetini sıfıra indiriyor.
 */
const HASHED = BOOTSTRAP.map((u) => {
  let cached: string | undefined;
  return Object.defineProperty({ ...u }, "passwordHash", {
    enumerable: true,
    get(): string {
      if (cached === undefined) cached = hashPasswordSync(u.password);
      return cached;
    },
  }) as BootstrapUser & { passwordHash: string };
});

function toAuthUser(u: {
  userId: string;
  role: AppRole;
  tenantId: string;
  email?: string;
  teacherId?: string | null;
  studentId?: string | null;
}): AuthUser {
  return {
    userId: u.userId,
    role: u.role,
    tenantId: u.tenantId,
    email: u.email,
    teacherId: u.teacherId ?? undefined,
    studentId: u.studentId ?? undefined,
  };
}

function isAppRole(value: string): value is AppRole {
  return (APP_ROLES as readonly string[]).includes(value);
}

/**
 * Kök neden düzeltmesi — `getBootstrapUsersForSeed` DB seed'i için
 * bilinçli olarak `passwordHash`'i okur (lazy getter'ı tetikler, bkz.
 * `HASHED`). Yalnızca id/email/role'e ihtiyaç duyan çağıranlar (ör.
 * `staff-directory.ts`'teki personel dizini görüntülemesi)
 * `getBootstrapUsersForSeed`'i kullanırsa, ihtiyaçları olmayan
 * `passwordHash`'i de tetiklemiş olur — her admin için ~saniyeler
 * süren bcrypt maliyetine yol açar. Bu, aynı alanları passwordHash'e
 * HİÇ dokunmadan döner.
 */
export function listAdminUsersForTenant(
  tenantId: string
): { id: string; email: string; role: AppRole }[] {
  return HASHED.filter((u) => u.tenantId === tenantId || u.role === "SUPER_ADMIN")
    .filter((u) => u.role === "SCHOOL_ADMIN" || u.role === "SUPER_ADMIN")
    .map((u) => ({ id: u.userId, email: u.email!, role: u.role }));
}

/**
 * Kök neden düzeltmesi (görev/bildirim zinciri) — `task-notifications.ts`
 * (`resolveTaskNotifyUserId`/`isTaskAssigneeActive`) yalnızca id/teacherId
 * eşleşmesi arıyordu ama bunun için `getBootstrapUsersForSeed`'i
 * çağırıyordu; o da her eşleşen satır için `passwordHash`'i okuyup lazy
 * bcrypt getter'ını tetikliyordu (bkz. `HASHED`, `listAdminUsersForTenant`
 * ile AYNI kök neden sınıfı — bu sefer admin dizini değil, görev
 * atama/bildirim çözümleme yolunda). `passwordHash`e HİÇ dokunmadan aynı
 * id/teacherId/rol alanlarını döner.
 */
export function listBootstrapUsersForTenant(
  tenantId: string
): { id: string; email: string; role: AppRole; teacherId?: string; studentId?: string }[] {
  return HASHED.filter((u) => u.tenantId === tenantId || u.role === "SUPER_ADMIN").map((u) => ({
    id: u.userId,
    email: u.email!,
    role: u.role,
    teacherId: u.teacherId,
    studentId: u.studentId,
  }));
}

/** Seed users for Prisma (tenant-scoped) */
export function getBootstrapUsersForSeed(tenantId: string) {
  return HASHED.filter((u) => u.tenantId === tenantId || u.role === "SUPER_ADMIN").map(
    (u) => ({
      id: u.userId,
      tenantId,
      email: u.email!,
      passwordHash: u.passwordHash,
      role: u.role,
      teacherId: u.teacherId,
      studentId: u.studentId,
      active: true,
    })
  );
}

/**
 * Audit-safe root-cause logging — NEVER logs the password, only a reason
 * code (`no_such_user` / `bad_password` / `inactive` / `bad_role`) plus the
 * normalized email, so a real login failure can be diagnosed from the audit
 * trail without weakening the generic "Invalid email or password" response
 * returned to the client (see /api/v1/auth/login).
 */
function logAuthFailureReason(email: string, reason: string, tenantId?: string) {
  auditLog({
    action: "auth.login_failure_reason",
    requestId: "n/a",
    outcome: "denied",
    tenantId,
    meta: { email, reason },
  });
}

export async function authenticateUser(
  emailInput: string,
  password: string
): Promise<AuthUser | null> {
  // Kök neden sınıfı: e-posta karşılaştırması normalize edilmezse (baştaki/
  // sondaki boşluk, farklı büyük/küçük harf) girişte gözle görünür doğru bir
  // e-posta ile giriş "Invalid email or password" ile başarısız olabilir.
  const email = emailInput.trim().toLowerCase();

  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const row = await prisma.user.findFirst({
        where: { email },
      });
      if (!row) {
        logAuthFailureReason(email, "no_such_user");
        return null;
      }
      if (!row.active) {
        logAuthFailureReason(email, "inactive", row.tenantId);
        return null;
      }
      const valid = await verifyPassword(password, row.passwordHash);
      if (!valid) {
        logAuthFailureReason(email, "bad_password", row.tenantId);
        return null;
      }
      if (!isAppRole(row.role)) {
        logAuthFailureReason(email, "bad_role", row.tenantId);
        return null;
      }
      return toAuthUser({
        userId: row.id,
        role: row.role,
        tenantId: row.tenantId,
        email: row.email,
        teacherId: row.teacherId,
        studentId: row.studentId,
      });
    } catch {
      // fall through to bootstrap if DB unavailable
    }
  }

  const row = HASHED.find((u) => u.email?.toLowerCase() === email);
  if (row) {
    const isActive = activeOverrides.get(row.userId) ?? true;
    if (!isActive) {
      logAuthFailureReason(email, "inactive", row.tenantId);
      return null;
    }
    const currentHash = passwordOverrides.get(row.userId) ?? row.passwordHash;
    const valid = await verifyPassword(password, currentHash);
    if (!valid) {
      logAuthFailureReason(email, "bad_password", row.tenantId);
      return null;
    }
    return toAuthUser(row);
  }

  // Portal Erişim Yönetimi kök neden düzeltmesi (2026-08-31) — HASHED yalnızca
  // derleme-zamanı demo/bootstrap hesaplarını kapsar. Gerçek öğrenci/öğretmen
  // hesapları (json/memory modunda `provisionEntityLogin` ile ÇALIŞMA
  // ZAMANINDA oluşturulur, bkz. `dynamic-users.ts`) burada da kontrol
  // edilmezse GERÇEK kullanıcılar asla giriş yapamaz.
  const { findDynamicUserByEmailAnyTenant } = await import("./dynamic-users");
  const dynRow = await findDynamicUserByEmailAnyTenant(email);
  if (!dynRow) {
    logAuthFailureReason(email, "no_such_user");
    return null;
  }
  if (!dynRow.active) {
    logAuthFailureReason(email, "inactive", dynRow.tenantId);
    return null;
  }
  const dynValid = await verifyPassword(password, dynRow.passwordHash);
  if (!dynValid) {
    logAuthFailureReason(email, "bad_password", dynRow.tenantId);
    return null;
  }
  if (!isAppRole(dynRow.role)) {
    logAuthFailureReason(email, "bad_role", dynRow.tenantId);
    return null;
  }
  return toAuthUser({
    userId: dynRow.userId,
    role: dynRow.role,
    tenantId: dynRow.tenantId,
    email: dynRow.email,
    teacherId: dynRow.teacherId ?? undefined,
    studentId: dynRow.studentId ?? undefined,
  });
}

/**
 * Kök neden — `changeOwnPassword`/şifre sıfırlama akışı json/memory modunda
 * BOOTSTRAP dizisini (derleme zamanında sabit) mutasyona uğratamaz. `db`
 * modu gerçek `User.passwordHash` sütununa yazar; bu Map yalnızca
 * json/memory'nin süreç-ömürlü (process-lifetime) eşdeğeridir — kalıcı
 * DEĞİLDİR, süreç yeniden başlarsa sıfırlanır (demo/test modunda beklenen
 * davranış). `authenticateUser`/`verifyCurrentPassword`nin json/memory
 * dalları bu haritayı `row.passwordHash`in ÖNÜNE kontrol eder.
 */
const passwordOverrides = new Map<string, string>();

/**
 * Öğretmenin (Teacher.id) kendi login `User.id`'sini bulur — ders bildirimi
 * gönderirken (İş 4) `targetUserId` çözmek için. Eşleşme yoksa (öğretmenin
 * henüz login hesabı yoksa) `null` — çağıran bildirim gönderimini sessizce
 * atlar, ders kaydını ETKİLEMEZ.
 */
export async function getUserIdByTeacherId(tenantId: string, teacherId: string): Promise<string | null> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const row = await prisma.user.findFirst({
        where: { tenantId, teacherId, active: true },
      });
      return row?.id ?? null;
    } catch {
      return null;
    }
  }
  const row = HASHED.find((u) => u.tenantId === tenantId && u.teacherId === teacherId);
  if (row) return row.userId;
  const { findDynamicUserByTeacherId } = await import("./dynamic-users");
  const dyn = await findDynamicUserByTeacherId(tenantId, teacherId);
  return dyn && dyn.active ? dyn.userId : null;
}

/**
 * @deprecated Karma Öğrenci Portalı — "PARENT" artık bir rol değil. Bu
 * fonksiyon şimdilik yalnızca eski `User.studentId` skalasına dayanan
 * STUDENT-role kullanıcıları döndürür (backward-compat); asıl kaynak
 * StudentPortalAccess olacak (bkz. src/lib/services/student-portal-access.ts).
 */
export async function getParentUserIdsByStudentId(tenantId: string, studentId: string): Promise<string[]> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const rows = await prisma.user.findMany({
        where: { tenantId, studentId, role: "STUDENT", active: true },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    } catch {
      return [];
    }
  }
  return HASHED.filter((u) => u.tenantId === tenantId && u.studentId === studentId && u.role === "STUDENT").map(
    (u) => u.userId
  );
}

export async function getUserIdByStudentId(tenantId: string, studentId: string): Promise<string | null> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const row = await prisma.user.findFirst({ where: { tenantId, studentId, active: true } });
      return row?.id ?? null;
    } catch {
      return null;
    }
  }
  const row = HASHED.find((u) => u.tenantId === tenantId && u.studentId === studentId);
  if (row) return row.userId;
  const { findDynamicUserByStudentId } = await import("./dynamic-users");
  const dyn = await findDynamicUserByStudentId(tenantId, studentId);
  return dyn && dyn.active ? dyn.userId : null;
}

/**
 * Karma Öğrenci Portalı — e-posta → userId. `getParentUserIdsByStudentId`/
 * `getUserIdByStudentId`'nin aksine deprecated `User.studentId` alanına
 * BAKMAZ; StudentPortalAccess akışı (provisionStudentPortalAccessTool) bir
 * kullanıcıyı ikinci bir öğrenciye bağlarken bu yüzden bunu kullanır.
 */
export async function getUserIdByEmail(tenantId: string, email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const row = await prisma.user.findFirst({ where: { tenantId, email: normalized, active: true } });
      return row?.id ?? null;
    } catch {
      return null;
    }
  }
  const row = HASHED.find((u) => u.tenantId === tenantId && u.email?.toLowerCase() === normalized);
  if (row) return row.userId;
  const { findDynamicUserByEmail } = await import("./dynamic-users");
  const dyn = await findDynamicUserByEmail(tenantId, normalized);
  return dyn && dyn.active ? dyn.userId : null;
}

/**
 * İş 4 — tenant'ın TÜM yönetici (SCHOOL_ADMIN + SUPER_ADMIN) kullanıcı
 * id'leri. Şube-bazlı bir "sorumlu yönetici" ilişkisi bu veri modelinde
 * (User'da branchId yok — bkz. final rapor) mevcut değil; bu yüzden
 * kapsam güvenle çözülebilen TEK sınır olan tenant'a göre belirlenir —
 * her iki admin rolü de zaten bu tenant'ın TÜM şubelerini yönetir
 * (bkz. /panel/subeler, hiçbir admin ekranı şube bazlı kısıtlama yapmaz).
 */
export async function listAdminUserIdsForTenant(tenantId: string): Promise<string[]> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const rows = await prisma.user.findMany({
        where: { tenantId, active: true, role: { in: ["SCHOOL_ADMIN", "SUPER_ADMIN"] } },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    } catch {
      return [];
    }
  }
  return HASHED.filter((u) => u.tenantId === tenantId && (u.role === "SCHOOL_ADMIN" || u.role === "SUPER_ADMIN")).map(
    (u) => u.userId
  );
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const row = await prisma.user.findFirst({
        where: { id: userId, active: true },
      });
      if (!row || !isAppRole(row.role)) return null;
      return toAuthUser({
        userId: row.id,
        role: row.role,
        tenantId: row.tenantId,
        email: row.email,
        teacherId: row.teacherId,
        studentId: row.studentId,
      });
    } catch {
      // fall through
    }
  }

  const row = HASHED.find((u) => u.userId === userId);
  if (row) return toAuthUser(row);
  const { findDynamicUserById } = await import("./dynamic-users");
  const dyn = await findDynamicUserById(userId);
  if (!dyn || !isAppRole(dyn.role)) return null;
  return toAuthUser({
    userId: dyn.userId,
    role: dyn.role,
    tenantId: dyn.tenantId,
    email: dyn.email,
    teacherId: dyn.teacherId ?? undefined,
    studentId: dyn.studentId ?? undefined,
  });
}

/**
 * Öğrenci/öğretmen kaydı oluşturulduğunda kendi login `User` satırını
 * otomatik sağlar (EPIC 6A gap kapatma — daha önce panelden eklenen hiçbir
 * öğrenci/öğretmen giriş yapamıyordu, çünkü `createStudentTool`/
 * `createTeacherTool` yalnızca iş kaydını (Student/Teacher) yazıyor,
 * hiçbir yol `User` satırı oluşturmuyordu).
 *
 * KÖK NEDEN DÜZELTMESİ (2026-08-31, CEO bildirdi — "mevcut öğrenciye davet
 * gönderilemedi"): Bu fonksiyon eskiden yalnızca `STORE_MODE=db`'de
 * çalışıyordu; "json/memory üretimde kullanılmıyor, üretimde her zaman db
 * modu kullanılır" varsayımına dayanıyordu. Bu varsayım GERÇEK DIŞI —
 * gerçek müşteri (Nilüfer Acar) BUGÜN `STORE_MODE=json` altında çalışıyor
 * (bkz. `docs/project-brain/KNOWN_GAPS.md` #1-2). Artık `json`/`memory`
 * modunda da (BOOTSTRAP listesindeki demo hesapların DIŞINDA) yeni bir
 * "çalışma zamanı" kullanıcı satırı oluşturabiliyor — bkz. `dynamic-users.ts`
 * (dosya-tabanlı kalıcı depo, `StudentPortalAccess`/`PasswordResetToken`
 * ile AYNI desen). `db` modunun kendi mantığı DEĞİŞMEDİ.
 *
 * E-posta zaten bir `User`'a aitse (aynı tenant, active durumundan
 * BAĞIMSIZ — `db` modundaki mevcut `findFirst` sorgusuyla AYNI, kasıtlı
 * olarak `active` filtrelemez ki kapalı bir hesap için YANLIŞLIKLA ikinci
 * bir kopya OLUŞTURULMASIN) dokunulmaz — idempotent. Başarıyla yeni bir
 * hesap oluşturulursa geçici şifreyi döner (yalnızca "anlık erişim"
 * aracının admin'e göstermesi için — davet e-postası akışı bunu hiç
 * kullanmaz, kullanıcı kendi şifresini linkle belirler); aksi halde `null`.
 */
export async function provisionEntityLogin(params: {
  tenantId: string;
  email: string;
  role: Extract<AppRole, "STUDENT" | "TEACHER">;
  studentId?: string;
  teacherId?: string;
}): Promise<{ tempPassword: string; userId: string } | null> {
  const email = params.email.trim().toLowerCase();
  if (!email) return null;

  if (isDbMode) {
    const { getPrisma } = await import("../db");
    const prisma = getPrisma();

    const existing = await prisma.user.findFirst({
      where: { tenantId: params.tenantId, email },
    });
    if (existing) return null;

    const tempPassword = Math.random().toString(36).slice(2, 10);
    const userId = uid("user");
    await prisma.user.create({
      data: {
        id: userId,
        tenantId: params.tenantId,
        email,
        passwordHash: hashPasswordSync(tempPassword),
        role: params.role,
        teacherId: params.teacherId,
        studentId: params.studentId,
        active: true,
      },
    });
    return { tempPassword, userId };
  }

  // json/memory modu — önce HASHED (demo/bootstrap), sonra dynamic-users
  // deposunda bu e-posta zaten var mı diye bak (active durumundan bağımsız,
  // db moduyla AYNI idempotency garantisi).
  const existingHashed = HASHED.find((u) => u.tenantId === params.tenantId && u.email?.toLowerCase() === email);
  if (existingHashed) return null;

  const { findDynamicUserByEmail, createDynamicUser } = await import("./dynamic-users");
  const existingDynamic = await findDynamicUserByEmail(params.tenantId, email);
  if (existingDynamic) return null;

  const tempPassword = Math.random().toString(36).slice(2, 10);
  const created = await createDynamicUser({
    tenantId: params.tenantId,
    email,
    passwordHash: hashPasswordSync(tempPassword),
    role: params.role,
    teacherId: params.teacherId,
    studentId: params.studentId,
  });
  return { tempPassword, userId: created.userId };
}

/**
 * P0 personel onboarding revizyonu — idari personel portal hesabı
 * (`SCHOOL_ADMIN`, öğretmen/öğrenci bağlantısız). `provisionEntityLogin`
 * ile AYNI idempotency garantisi: bu e-posta tenant'ta ZATEN varsa null
 * döner (çağıran, mevcut kullanıcıyla güvenli ilişkilendirme yapıp
 * yapamayacağına KENDİ karar verir — bkz. tools.ts staff portalı).
 * Yeni bir token/şifre mekanizması EKLEMEZ; davet, mevcut
 * `sendAccountInvitationEmail` akışıyla gönderilir.
 */
export async function provisionStaffLogin(params: {
  tenantId: string;
  email: string;
}): Promise<{ tempPassword: string; userId: string } | null> {
  const email = params.email.trim().toLowerCase();
  if (!email) return null;

  if (isDbMode) {
    const { getPrisma } = await import("../db");
    const prisma = getPrisma();

    const existing = await prisma.user.findFirst({
      where: { tenantId: params.tenantId, email },
    });
    if (existing) return null;

    const tempPassword = Math.random().toString(36).slice(2, 10);
    const userId = uid("user");
    await prisma.user.create({
      data: {
        id: userId,
        tenantId: params.tenantId,
        email,
        passwordHash: hashPasswordSync(tempPassword),
        role: "SCHOOL_ADMIN",
        active: true,
      },
    });
    return { tempPassword, userId };
  }

  const existingHashed = HASHED.find((u) => u.tenantId === params.tenantId && u.email?.toLowerCase() === email);
  if (existingHashed) return null;

  const { findDynamicUserByEmail, createDynamicUser } = await import("./dynamic-users");
  const existingDynamic = await findDynamicUserByEmail(params.tenantId, email);
  if (existingDynamic) return null;

  const tempPassword = Math.random().toString(36).slice(2, 10);
  const created = await createDynamicUser({
    tenantId: params.tenantId,
    email,
    passwordHash: hashPasswordSync(tempPassword),
    role: "SCHOOL_ADMIN",
  });
  return { tempPassword, userId: created.userId };
}

export type ChangeOwnPasswordResult =
  | { ok: true }
  | { ok: false; code: "USER_NOT_FOUND" | "WRONG_PASSWORD" | "WEAK_PASSWORD" };

/**
 * Tüm parola yazma yollarının (Hesabım'daki "şifre değiştir" VE şifremi
 * unuttum → sıfırlama akışı) kullandığı TEK yazma yolu — `db` modunda
 * gerçek `User.passwordHash` sütununa, json/memory modunda
 * `passwordOverrides`e (süreç-ömürlü) yazar. İki ayrı yazma mantığının
 * (ve dolayısıyla birbirinden sapma riskinin) önüne geçer.
 */
/**
 * Portal erişim yönetimi (görev: "portal erişimini aç/kapat") — `passwordOverrides`
 * ile AYNI desen: `db` modunda gerçek `User.active` sütunu, `json`/`memory`
 * modunda süreç-ömürlü bir override map'i (yalnızca BOOTSTRAP kullanıcıları için
 * anlamlı — bu iki mod zaten yeni öğrenci/öğretmen User satırı OLUŞTURMAZ, bkz.
 * `provisionEntityLogin` yorumu). Erişimi kapatmak `active=false` yazar — login
 * (`authenticateUser`) bunu HER istekte kontrol eder, JWT'de cache'lenmez, bu
 * yüzden iptal bir sonraki girişte hemen etkilidir. Hiçbir öğrenci/öğretmen/ödeme/
 * sözleşme verisi silinmez veya değiştirilmez — yalnızca bu bir User satırı.
 */
const activeOverrides = new Map<string, boolean>();

export async function setUserActive(userId: string, active: boolean): Promise<boolean> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      await prisma.user.update({ where: { id: userId }, data: { active } });
      return true;
    } catch {
      return false;
    }
  }
  if (HASHED.some((u) => u.userId === userId)) {
    activeOverrides.set(userId, active);
    return true;
  }
  const { setDynamicUserActive } = await import("./dynamic-users");
  return setDynamicUserActive(userId, active);
}

export type UserAccountStatus = {
  userId: string;
  email: string;
  role: AppRole;
  tenantId: string;
  active: boolean;
};

/**
 * `getUserById`'den FARKLI olarak `active` filtrelemez — kapalı bir hesabın
 * durumunu (admin ekranında "Kapalı" göstermek için) doğru okuyabilmek
 * gerekir; `getUserById` yalnızca aktif hesaplar için tasarlanmış (auth
 * doğrulaması), buradaki amaç DURUM GÖRÜNTÜLEME.
 */
export async function getUserAccountStatus(userId: string): Promise<UserAccountStatus | null> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const row = await prisma.user.findUnique({ where: { id: userId } });
      if (!row || !isAppRole(row.role)) return null;
      return { userId: row.id, email: row.email, role: row.role, tenantId: row.tenantId, active: row.active };
    } catch {
      return null;
    }
  }
  const row = HASHED.find((u) => u.userId === userId);
  if (row) {
    return {
      userId: row.userId,
      email: row.email ?? "",
      role: row.role,
      tenantId: row.tenantId,
      active: activeOverrides.get(userId) ?? true,
    };
  }
  const { findDynamicUserById } = await import("./dynamic-users");
  const dyn = await findDynamicUserById(userId);
  if (!dyn) return null;
  return { userId: dyn.userId, email: dyn.email, role: dyn.role, tenantId: dyn.tenantId, active: dyn.active };
}

/** `getUserIdByTeacherId`'den FARKLI olarak `active` filtrelemez — kapalı bir öğretmen hesabını da bulabilmek için (durum kartı + yeniden açma). */
export async function getUserAccountStatusForTeacher(tenantId: string, teacherId: string): Promise<UserAccountStatus | null> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const row = await prisma.user.findFirst({ where: { tenantId, teacherId } });
      if (!row || !isAppRole(row.role)) return null;
      return { userId: row.id, email: row.email, role: row.role, tenantId: row.tenantId, active: row.active };
    } catch {
      return null;
    }
  }
  const row = HASHED.find((u) => u.tenantId === tenantId && u.teacherId === teacherId);
  if (row) {
    return {
      userId: row.userId,
      email: row.email ?? "",
      role: row.role,
      tenantId: row.tenantId,
      active: activeOverrides.get(row.userId) ?? true,
    };
  }
  const { findDynamicUserByTeacherId } = await import("./dynamic-users");
  const dyn = await findDynamicUserByTeacherId(tenantId, teacherId);
  if (!dyn) return null;
  return { userId: dyn.userId, email: dyn.email, role: dyn.role, tenantId: dyn.tenantId, active: dyn.active };
}

export async function updatePasswordHash(userId: string, newHash: string): Promise<boolean> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      await prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
      return true;
    } catch {
      return false;
    }
  }
  if (HASHED.some((u) => u.userId === userId)) {
    passwordOverrides.set(userId, newHash);
    return true;
  }
  const { setDynamicUserPasswordHash } = await import("./dynamic-users");
  return setDynamicUserPasswordHash(userId, newHash);
}

/**
 * Hesabım ekranındaki "şifre değiştir" — yalnızca KENDİ hesabı (userId
 * session'dan gelir, hiçbir zaman body'den). `db` modunda gerçek
 * `User.passwordHash` sütununu okur/yazar; `json`/`memory` modunda
 * `passwordOverrides` (bkz. yukarı) üzerinden AYNI davranışı (değişiklik
 * kalıcı olmasa da doğru doğrulanır/yansır) verir — eskiden json/memory'de
 * sessizce MODE_NOT_SUPPORTED dönüyordu, bu artık yalnızca gerçek bir
 * DB yazma hatasında (bkz. updatePasswordHash) oluşabilir.
 */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<ChangeOwnPasswordResult> {
  if (newPassword.length < 8) return { ok: false, code: "WEAK_PASSWORD" };

  if (isDbMode) {
    const { getPrisma } = await import("../db");
    const prisma = getPrisma();

    const row = await prisma.user.findFirst({ where: { id: userId, active: true } });
    if (!row) return { ok: false, code: "USER_NOT_FOUND" };

    const valid = await verifyPassword(currentPassword, row.passwordHash);
    if (!valid) return { ok: false, code: "WRONG_PASSWORD" };

    await updatePasswordHash(userId, hashPasswordSync(newPassword));
    auditLog({
      action: "auth.password_changed",
      requestId: uid("req"),
      userId,
      tenantId: row.tenantId,
      role: row.role as AppRole,
      outcome: "success",
    });
    return { ok: true };
  }

  const row = HASHED.find((u) => u.userId === userId);
  if (row) {
    const currentHash = passwordOverrides.get(userId) ?? row.passwordHash;
    const valid = await verifyPassword(currentPassword, currentHash);
    if (!valid) return { ok: false, code: "WRONG_PASSWORD" };

    await updatePasswordHash(userId, hashPasswordSync(newPassword));
    auditLog({
      action: "auth.password_changed",
      requestId: uid("req"),
      userId,
      tenantId: row.tenantId,
      role: row.role,
      outcome: "success",
    });
    return { ok: true };
  }

  const { findDynamicUserById } = await import("./dynamic-users");
  const dyn = await findDynamicUserById(userId);
  if (!dyn) return { ok: false, code: "USER_NOT_FOUND" };

  const dynValid = await verifyPassword(currentPassword, dyn.passwordHash);
  if (!dynValid) return { ok: false, code: "WRONG_PASSWORD" };

  await updatePasswordHash(userId, hashPasswordSync(newPassword));
  auditLog({
    action: "auth.password_changed",
    requestId: uid("req"),
    userId,
    tenantId: dyn.tenantId,
    role: dyn.role,
    outcome: "success",
  });
  return { ok: true };
}

/**
 * Şifremi unuttum akışı için — şifre doğrulaması YAPMADAN e-postayla kullanıcı arar.
 * Yalnızca hesabın var olup olmadığını AÇIĞA ÇIKARMAYAN çağıranlar (`forgot-password`
 * route'u her zaman aynı nötr yanıtı döner) tarafından kullanılmalıdır.
 */
export async function findUserByEmail(emailInput: string): Promise<AuthUser | null> {
  const email = emailInput.trim().toLowerCase();

  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const row = await prisma.user.findFirst({ where: { email, active: true } });
      if (!row || !isAppRole(row.role)) return null;
      return toAuthUser({
        userId: row.id,
        role: row.role,
        tenantId: row.tenantId,
        email: row.email,
        teacherId: row.teacherId,
        studentId: row.studentId,
      });
    } catch {
      // fall through to bootstrap if DB unavailable
    }
  }

  const row = HASHED.find((u) => u.email?.toLowerCase() === email);
  if (row) return toAuthUser(row);
  const { findDynamicUserByEmailAnyTenant } = await import("./dynamic-users");
  const dyn = await findDynamicUserByEmailAnyTenant(email);
  if (!dyn) return null;
  return toAuthUser({
    userId: dyn.userId,
    role: dyn.role,
    tenantId: dyn.tenantId,
    email: dyn.email,
    teacherId: dyn.teacherId ?? undefined,
    studentId: dyn.studentId ?? undefined,
  });
}

/** @deprecated use authenticateUser */
export async function authenticateDemoUser(
  email: string,
  password: string
): Promise<AuthUser | null> {
  return authenticateUser(email, password);
}

export type { AppRole };
