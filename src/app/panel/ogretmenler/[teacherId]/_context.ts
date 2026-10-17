import { cache } from "react";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData, readScopedReferenceData } from "@/lib/institution/context";
import type { AppData, Teacher } from "@/lib/types";
import type { ReferenceData } from "@/lib/reference-data";
import type { ServiceContext } from "@/lib/services/context";

/**
 * Öğretmen detayı sekme başına ayrı route; layout + sekme aynı istekte
 * aynı veriye ihtiyaç duyar. `cache()` istek başına TEK okumaya indirger.
 *
 * DB egress (2026-10-17) — layout ve hafif sekmeler (Bilgiler, Müsaitlik, Öğrenciler, Geri bildirim,
 * Performans) yalnız referans dilimini okur; ders/hakediş gösteren sekmeler `loadTeacherFullData` ile
 * tam okumayı AYRICA ister (canlıda her sekme açılışı ~2,6 MB tam okumaydı).
 */
export type TeacherPageContext = {
  session: ServiceContext;
  kurum: Awaited<ReturnType<typeof getInstitutionContext>>;
  data: ReferenceData;
  teacher: Teacher | undefined;
  /** Yönetici/okul yöneticisi — düzenleme ve hassas veri yetkisi. */
  canManage: boolean;
};

export const loadTeacherPageContext = cache(async (teacherId: string): Promise<TeacherPageContext> => {
  const session = await requireSessionContext();
  const kurum = await getInstitutionContext(session);
  const data = await readScopedReferenceData(kurum.scope);
  const teacher = data.teachers.find((t) => t.id === teacherId);
  const canManage = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
  return { session, kurum, data, teacher, canManage };
});

/** Ders/hakediş sekmeleri için tam kurum verisi (istek başına tek okuma). */
export const loadTeacherFullData = cache(async (teacherId: string): Promise<AppData> => {
  const { kurum } = await loadTeacherPageContext(teacherId);
  return readScopedData(kurum.scope);
});
