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
   * İş 4 — rol hiyerarşisi: Nilüfer Acar (kurum sahibi) SUPER_ADMIN,
   * Ezgi Güçlü (kurum yöneticisi) SCHOOL_ADMIN, `tenant_nilufer_acar`
   * (=DEFAULT_TENANT_ID) ile sınırlı. Gerçek e-postaları verilmedi —
   * deterministik, normalize edilmiş kurumsal placeholder üretildi (aynı
   * `ad.soyad@niluferacar.com.tr` deseni, seed.ts'teki t1..t7 öğretmen
   * e-postalarıyla AYNI kural). Gerçek e-postaya geçiş: bu iki `email`
   * alanını (ve varsa .env'deki AUTH_OWNER_EMAIL/AUTH_MANAGER_EMAIL'i,
   * eklenmiş değilse env override YOK, doğrudan burada değiştirilmeli)
   * güncelleyin — kod başka hiçbir yerde bu e-postaları sabit varsaymaz.
   * Şifre: env var öncelikli (AUTH_OWNER_PASSWORD/AUTH_MANAGER_PASSWORD),
   * yoksa yalnızca bu dosyadaki diğer demo hesaplarla AYNI desende
   * belgelenmiş bir geçici şifreye düşer — düz metin hiçbir DB/store
   * satırına yazılmaz, yalnızca bcrypt hash'i (`HASHED` — aşağıda) saklanır.
   */
  {
    userId: "user_owner_nilufer",
    email: "nilufer.acar@niluferacar.com.tr",
    password: process.env.AUTH_OWNER_PASSWORD || "demo-owner-nilufer",
    role: "SUPER_ADMIN",
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
    role: "PARENT",
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
    role: "PARENT",
    tenantId: DEFAULT_TENANT_ID,
    studentId: "s5",
  },
  {
    /** Demo persona: kısmi ödeme + öncelikli (okul kaynaklı) telafi talebi (s4) */
    userId: "user_parent_s4",
    email: "mehmet@email.com",
    password: process.env.AUTH_PARENT_PASSWORD || "demo-parent",
    role: "PARENT",
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

const HASHED = BOOTSTRAP.map((u) => ({
  ...u,
  passwordHash: hashPasswordSync(u.password),
}));

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
  if (!row) {
    logAuthFailureReason(email, "no_such_user");
    return null;
  }
  const valid = await verifyPassword(password, row.passwordHash);
  if (!valid) {
    logAuthFailureReason(email, "bad_password", row.tenantId);
    return null;
  }
  return toAuthUser(row);
}

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
  return row?.userId ?? null;
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
  if (!row) return null;
  return toAuthUser(row);
}

/**
 * Öğrenci/öğretmen kaydı oluşturulduğunda kendi login `User` satırını
 * otomatik sağlar (EPIC 6A gap kapatma — daha önce panelden eklenen hiçbir
 * öğrenci/öğretmen giriş yapamıyordu, çünkü `createStudentTool`/
 * `createTeacherTool` yalnızca iş kaydını (Student/Teacher) yazıyor,
 * hiçbir yol `User` satırı oluşturmuyordu).
 *
 * Yalnızca `STORE_MODE=db`'de çalışır: `json`/`memory` modundaki BOOTSTRAP
 * listesi derleme zamanında sabit bir dizi — çalışma zamanında yeni girişler
 * eklenemez (bkz. dosya başındaki mode-parity notları). Bu iki demo/test
 * modu zaten üretimde kullanılmıyor (CLAUDE.md), üretimde her zaman `db`
 * modu kullanılır — bu yüzden gerçek kullanıcılar için hiçbir işlevsellik
 * kaybı yok.
 *
 * E-posta zaten bir `User`'a aitse (aynı tenant) dokunulmaz — idempotent.
 * Başarıyla yeni bir hesap oluşturulursa geçici şifreyi döner (admin'in
 * öğrenciye/öğretmene iletmesi için); aksi halde `null`.
 */
export async function provisionEntityLogin(params: {
  tenantId: string;
  email: string;
  role: Extract<AppRole, "STUDENT" | "TEACHER">;
  studentId?: string;
  teacherId?: string;
}): Promise<{ tempPassword: string } | null> {
  if (!isDbMode) return null;
  const email = params.email.trim().toLowerCase();
  if (!email) return null;

  const { getPrisma } = await import("../db");
  const prisma = getPrisma();

  const existing = await prisma.user.findFirst({
    where: { tenantId: params.tenantId, email },
  });
  if (existing) return null;

  const tempPassword = Math.random().toString(36).slice(2, 10);
  await prisma.user.create({
    data: {
      id: uid("user"),
      tenantId: params.tenantId,
      email,
      passwordHash: hashPasswordSync(tempPassword),
      role: params.role,
      teacherId: params.teacherId,
      studentId: params.studentId,
      active: true,
    },
  });
  return { tempPassword };
}

export type ChangeOwnPasswordResult =
  | { ok: true }
  | { ok: false; code: "MODE_NOT_SUPPORTED" | "USER_NOT_FOUND" | "WRONG_PASSWORD" | "WEAK_PASSWORD" };

/**
 * Hesabım ekranındaki "şifre değiştir" — yalnızca KENDİ hesabı (userId
 * session'dan gelir, hiçbir zaman body'den) ve yalnızca `STORE_MODE=db`'de
 * çalışır: `json`/`memory` modundaki kullanıcılar `BOOTSTRAP`/`HASHED`
 * (bu dosyanın başında) derleme zamanında sabit bir dizi — çalışma
 * zamanında değiştirilemez (bkz. `provisionEntityLogin` ile AYNI mode-parity
 * kısıtı). Üretimde her zaman `db` modu kullanıldığından (CLAUDE.md) gerçek
 * kullanıcılar için işlevsellik kaybı yok; json/memory'de açık bir
 * MODE_NOT_SUPPORTED döner (sessizce yok saymak yerine).
 */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<ChangeOwnPasswordResult> {
  if (!isDbMode) return { ok: false, code: "MODE_NOT_SUPPORTED" };
  if (newPassword.length < 8) return { ok: false, code: "WEAK_PASSWORD" };

  const { getPrisma } = await import("../db");
  const prisma = getPrisma();

  const row = await prisma.user.findFirst({ where: { id: userId, active: true } });
  if (!row) return { ok: false, code: "USER_NOT_FOUND" };

  const valid = await verifyPassword(currentPassword, row.passwordHash);
  if (!valid) return { ok: false, code: "WRONG_PASSWORD" };

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashPasswordSync(newPassword) },
  });
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

/** @deprecated use authenticateUser */
export async function authenticateDemoUser(
  email: string,
  password: string
): Promise<AuthUser | null> {
  return authenticateUser(email, password);
}

export type { AppRole };
