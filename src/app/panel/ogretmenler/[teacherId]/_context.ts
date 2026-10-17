import { cache } from "react";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedReferenceData, readScopedTeacherLessons } from "@/lib/institution/context";
import type { AppData, Teacher } from "@/lib/types";
import type { ReferenceData } from "@/lib/reference-data";
import type { ServiceContext } from "@/lib/services/context";

/**
 * Öğretmen detayı sekme başına ayrı route; layout + sekme aynı istekte
 * aynı veriye ihtiyaç duyar. `cache()` istek başına TEK okumaya indirger.
 *
 * DB egress (2026-10-17) — layout ve hafif sekmeler (Bilgiler, Müsaitlik, Öğrenciler, Geri bildirim,
 * Performans) yalnız referans dilimini okur; ders gösteren sekmeler (Özet/Program/Yoklama) `loadTeacherLessonsData` ile
 * yalnız o öğretmenin derslerini ekler (eskiden her sekme açılışı ~2,6 MB tam okumaydı).
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

/**
 * Ders gösteren sekmeler (Özet / Program / Yoklama): referans veri + yalnız bu öğretmenin dersleri.
 * DB egress (2026-10-18): eskiden her biri tam kurum okumasıydı.
 */
export const loadTeacherLessonsData = cache(async (teacherId: string): Promise<ReferenceData & Pick<AppData, "lessons">> => {
  const { kurum, data } = await loadTeacherPageContext(teacherId);
  return { ...data, lessons: await readScopedTeacherLessons(kurum.scope, teacherId) };
});
