import { cache } from "react";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedStudentData } from "@/lib/institution/context";
import type { Student } from "@/lib/types";
import type { StudentScopeData } from "@/lib/reference-data";
import type { ServiceContext } from "@/lib/services/context";

/**
 * J — Öğrenci detayı artık tek uzun sayfa değil, sekme başına ayrı bir route.
 *
 * Layout ve o anki sekme sayfası aynı istek içinde AYNI veriye ihtiyaç duyar.
 * `cache()` (React 19) bunu istek başına TEK okumaya indirger — sekmeye
 * bölmek sunucu okuma sayısını ARTIRMAZ. Tersine: her sekme yalnız kendi
 * servis çağrılarını yapar, bu yüzden eski tek sayfadaki "her açılışta 7 tool
 * + tüm evraklar + tüm değerlendirmeler" maliyeti ortadan kalkar.
 *
 * DB egress (2026-09-30): `data` artık YALNIZ bu öğrencinin dilimi (ders/yoklama/telafi/ödeme
 * satırları + referans veri; bkz. `StudentScopeData`). Sekmelerdeki her ağır erişim zaten
 * `studentId` ile süzülüyordu; başka öğrencinin satırına bakacak kod buraya YAZILMAMALI.
 */
export type StudentPageContext = {
  session: ServiceContext;
  kurum: Awaited<ReturnType<typeof getInstitutionContext>>;
  data: StudentScopeData;
  student: Student | undefined;
  /** Yönetici/okul yöneticisi — düzenleme ve hassas veri yetkisi. */
  canManage: boolean;
};

export const loadStudentPageContext = cache(async (studentId: string): Promise<StudentPageContext> => {
  const session = await requireSessionContext();
  const kurum = await getInstitutionContext(session);
  const data = await readScopedStudentData(kurum.scope, studentId);
  const student = data.students.find((s) => s.id === studentId);
  const canManage = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
  return { session, kurum, data, student, canManage };
});
