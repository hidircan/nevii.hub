import { cache } from "react";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import type { AppData, Student } from "@/lib/types";
import type { ServiceContext } from "@/lib/services/context";

/**
 * J — Öğrenci detayı artık tek uzun sayfa değil, sekme başına ayrı bir route.
 *
 * Layout ve o anki sekme sayfası aynı istek içinde AYNI veriye ihtiyaç duyar.
 * `cache()` (React 19) bunu istek başına TEK okumaya indirger — sekmeye
 * bölmek sunucu okuma sayısını ARTIRMAZ. Tersine: her sekme yalnız kendi
 * servis çağrılarını yapar, bu yüzden eski tek sayfadaki "her açılışta 7 tool
 * + tüm evraklar + tüm değerlendirmeler" maliyeti ortadan kalkar.
 */
export type StudentPageContext = {
  session: ServiceContext;
  kurum: Awaited<ReturnType<typeof getInstitutionContext>>;
  data: AppData;
  student: Student | undefined;
  /** Yönetici/okul yöneticisi — düzenleme ve hassas veri yetkisi. */
  canManage: boolean;
};

export const loadStudentPageContext = cache(async (studentId: string): Promise<StudentPageContext> => {
  const session = await requireSessionContext();
  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const student = data.students.find((s) => s.id === studentId);
  const canManage = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
  return { session, kurum, data, student, canManage };
});
