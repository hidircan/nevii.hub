/**
 * Portal öğrenci bağlamı — veli/öğrenci portalında "hangi öğrenci" sorusunun
 * TEK gerçek kaynağı.
 *
 * Kök neden (UAT 10. tur, iş #1): aynı veli e-postası birden fazla öğrenciye
 * (aktif + pasif) bağlı olabiliyordu; ancak portal bağlamı statik
 * `User.studentId`/`JWT studentId` tekil alanından çözülüyordu. E-posta daha
 * önce pasife alınmış bir öğrenciye SELF davetle bağlanmışsa JWT o pasif
 * kayda kilitleniyor, veli yeni aktif öğrencisine davet edilip giriş yapsa
 * bile "Bugün"/"Program" ekranlarında "Hesabınız pasif durumda" uyarısı
 * görüyordu. Öğrenci seçici yoktu; mobil `resolveActivePortalAccess` de
 * öğrenci aktifliğine bakmıyordu.
 *
 * Ürün kuralları (bu modülde uygulanır):
 * - Varsayılan bağlam HER ZAMAN aktif erişimi olan AKTİF bir öğrencidir;
 *   tercih (cookie/JWT) pasif kayda işaret ediyorsa YOK SAYILIR (pasif
 *   veriyi açmaz), aktif alternatife düşülür.
 * - Aktif erişim yoksa: yalnızca-pasif erişim varsa `passive-only`
 *   (uyarı ekranı), hiç erişim yoksa `no-access` (kayıt-eksik yönlendirmesi).
 * - Silinmiş (`deletedAt` dolu) veya kaydı bulunamayan öğrenci asla
 *   seçilmez; kardeş listesinde de gösterilmez.
 * - Pasif kardeşler YALNIZCA isim + "(pasif)" etiketiyle listelenir —
 *   detay verisi asla açılmaz.
 */
import type { PortalAccessType, StudentPortalAccessRecord } from "./student-portal-access";

/** Veli portalında seçili öğrenciyi taşıyan HttpOnly cookie (yol: /ogrenci, /veli). */
export const PORTAL_STUDENT_COOKIE = "nh_portal_student";

export type PortalSibling = {
  studentId: string;
  name: string;
  active: boolean;
  accessType: PortalAccessType;
};

export type PortalResolution =
  | {
      status: "ok";
      studentId: string;
      studentName: string;
      accessType: PortalAccessType;
      siblings: PortalSibling[];
    }
  | { status: "passive-only"; siblings: PortalSibling[] }
  | { status: "no-access"; siblings: [] };

export type PortalStudentLike = { id: string; name: string; active: boolean; deletedAt?: string };

function byActivationThenId(a: StudentPortalAccessRecord, b: StudentPortalAccessRecord): number {
  return (
    (a.activatedAt ?? a.createdAt).localeCompare(b.activatedAt ?? b.createdAt) || a.studentId.localeCompare(b.studentId)
  );
}

/**
 * Saf seçim — IO yok, birim testlerin ana hedefi. `activeAccessRows`
 * YALNIZCA status=active satırlar içermelidir (çağıran filtreler veya bu
 * fonksiyon filtreler — savunma amaçlı burada da filtrelenir).
 */
export function pickPortalStudent(
  activeAccessRows: StudentPortalAccessRecord[],
  students: PortalStudentLike[],
  preferredStudentId?: string | null
): PortalResolution {
  const active = activeAccessRows.filter((r) => r.status === "active");
  const byId = new Map(students.map((s) => [s.id, s]));
  const siblings: PortalSibling[] = [];
  for (const row of [...active].sort(byActivationThenId)) {
    const student = byId.get(row.studentId);
    // Kaydı silinmiş/kayıp öğrenci: kardeş listesine bile girmez (veri sızıntısı yok).
    if (!student || student.deletedAt) continue;
    if (siblings.some((s) => s.studentId === student.id)) continue;
    siblings.push({
      studentId: student.id,
      name: student.name,
      active: student.active,
      accessType: row.accessType,
    });
  }
  if (siblings.length === 0) return { status: "no-access", siblings: [] };

  const usable = siblings.filter((s) => s.active);
  // Tercih YALNIZCA aktif erişim + aktif öğrenci ise geçerlidir; pasif
  // tercih sessizce yok sayılır (kilitlenme yok), aktif varsayılana düşülür.
  if (preferredStudentId) {
    const preferred = usable.find((s) => s.studentId === preferredStudentId);
    if (preferred) {
      return {
        status: "ok",
        studentId: preferred.studentId,
        studentName: preferred.name,
        accessType: preferred.accessType,
        siblings,
      };
    }
  }
  const first = usable[0];
  if (first) {
    return {
      status: "ok",
      studentId: first.studentId,
      studentName: first.name,
      accessType: first.accessType,
      siblings,
    };
  }
  return { status: "passive-only", siblings };
}

/**
 * IO'lu çözüm — tenant kapsamlı öğrenci okuması yapar. `preferredStudentId`
 * cookie/JWT/sorgu tercihidir (güvenilmez girdi: erişim + aktiflik
 * doğrulamasından geçer).
 */
export async function resolvePortalStudent(
  tenantId: string,
  userId: string,
  preferredStudentId?: string | null
): Promise<PortalResolution> {
  const { listAccessForUser } = await import("./student-portal-access");
  const rows = await listAccessForUser(tenantId, userId);
  let active = rows.filter((r) => r.status === "active");
  if (active.length === 0 && preferredStudentId) {
    // Bootstrap sözleşmesi (student-portal-access.ts'teki fallback ile AYNI):
    // DB-dışı modlarda kaydı olmayan demo (HASHED) kullanıcı, User.studentId
    // eşleşirse SELF sayılır. `getActiveAccessType` bu yedeği İÇERİR (DB
    // modunda asla); sentetik satır normal yoldan akar — öğrenci aktifliği
    // /silinmişlik kuralları demo kullanıcılara da uygulanır.
    const { getActiveAccessType } = await import("./student-portal-access");
    const fallbackType = await getActiveAccessType(tenantId, userId, preferredStudentId);
    if (fallbackType) {
      const now = new Date().toISOString();
      active = [
        {
          id: `bootstrap:${userId}:${preferredStudentId}`,
          tenantId,
          userId,
          studentId: preferredStudentId,
          accessType: fallbackType,
          status: "active",
          invitedBy: null,
          invitedAt: now,
          activatedAt: now,
          revokedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ];
    }
  }
  if (active.length === 0) return { status: "no-access", siblings: [] };
  const { runWithTenantAsync } = await import("./tenant-context");
  const { readData } = await import("./store");
  const data = await runWithTenantAsync(tenantId, () => readData());
  return pickPortalStudent(active, data.students, preferredStudentId ?? null);
}

/**
 * Portal ALT sayfaları için tek satırlık bağlam: STUDENT rolünde çözümlenmiş
 * aktif öğrenci id'si; admin önizlemede eski `session.studentId` yolu;
 * çözümlenemezse `null` (çağıran `PORTAL_RECORD_MISSING_REDIRECT` yapar).
 * `session.studentId || "s1"` gibi güvensiz yedekler KULLANILMAZ.
 */
export async function getPortalPageStudentId(session: {
  role: string;
  tenantId: string;
  userId: string;
  studentId?: string;
}): Promise<string | null> {
  if (session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN") return session.studentId ?? null;
  if (session.role !== "STUDENT") return session.studentId ?? null;
  const resolved = await getPortalStudentContext(session);
  return resolved.status === "ok" ? resolved.studentId : null;
}

/**
 * Web portal sayfaları için: cookie tercihini okur (`next/headers`, SADECE
 * Server Component/Route Handler içinde çağrılmalıdır), JWT yedeğiyle
 * (`session.studentId`) birleştirip çözer.
 */
export async function getPortalStudentContext(session: {
  tenantId: string;
  userId: string;
  studentId?: string;
}): Promise<PortalResolution> {
  let cookiePreferred: string | null = null;
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    const raw = jar.get(PORTAL_STUDENT_COOKIE)?.value?.trim();
    cookiePreferred = raw ? raw.slice(0, 128) : null;
  } catch {
    cookiePreferred = null;
  }
  return resolvePortalStudent(session.tenantId, session.userId, cookiePreferred || session.studentId || null);
}
