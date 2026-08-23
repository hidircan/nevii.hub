/**
 * İş Takip görev atama seçici (Faz 2 madde 6) için "seçilebilir personel"
 * listesi — YENİ bir kullanıcı yönetim sistemi DEĞİL, yalnızca mevcut
 * Teacher kayıtlarından + mevcut User (admin) kimliklerinden bir GÖRÜNTÜLEME
 * listesi türetir. `assigneeId` alanının anlamı (Teacher.id veya User.id)
 * Faz 1'den beri aynı kalır — bu modül yalnızca ham ID yerine okunabilir bir
 * isim/etiket sağlar.
 */

import { isDbMode } from "./config";
import type { Teacher } from "./types";

export type AssignableStaff = {
  id: string;
  label: string;
  role: "TEACHER" | "SCHOOL_ADMIN" | "SUPER_ADMIN";
};

async function listAdminStaff(tenantId: string): Promise<AssignableStaff[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const users = await prisma.user.findMany({
      where: { tenantId, active: true, role: { in: ["SCHOOL_ADMIN", "SUPER_ADMIN"] } },
      orderBy: { email: "asc" },
    });
    return users.map((u) => ({ id: u.id, label: u.email, role: u.role as AssignableStaff["role"] }));
  }
  // json/memory demo modu — dinamik bir User tablosu yok; sabit bootstrap
  // kimlikleri (bkz. src/lib/auth/users.ts) yalnızca OKUNUR. `passwordHash`e
  // hiç ihtiyaç yok — `getBootstrapUsersForSeed` (seed amaçlı) DEĞİL, onu
  // hiç tetiklemeyen `listAdminUsersForTenant` kullanılır (kök neden:
  // seed fonksiyonu passwordHash'i okuyup lazy bcrypt getter'ını tetikler).
  const { listAdminUsersForTenant } = await import("./auth/users");
  return listAdminUsersForTenant(tenantId).map((u) => ({
    id: u.id,
    label: u.email,
    role: u.role as AssignableStaff["role"],
  }));
}

/**
 * Görev atanabilecek TÜM personel: aktif öğretmenler + admin kullanıcılar.
 * `teachers` çağıran tarafça zaten tenant-scoped okunmuş olmalı (ör.
 * `readScopedData`/`readData` sonucu) — burada tekrar okunmaz, gereksiz
 * ikinci bir veri kaynağı açılmaz.
 */
export async function listAssignableStaff(
  tenantId: string,
  teachers: Pick<Teacher, "id" | "name" | "active">[]
): Promise<AssignableStaff[]> {
  const admins = await listAdminStaff(tenantId);
  const teacherEntries: AssignableStaff[] = teachers
    .filter((t) => t.active)
    .map((t) => ({ id: t.id, label: t.name, role: "TEACHER" }));
  return [...admins, ...teacherEntries];
}

/** Bir ID'yi ("assigneeId") okunabilir bir etikete çevirir — bulunamazsa ham ID'ye düşer (veri kaybı/hata yok). */
export function resolveStaffLabel(staff: AssignableStaff[], id: string | undefined): string | undefined {
  if (!id) return undefined;
  return staff.find((s) => s.id === id)?.label ?? id;
}
