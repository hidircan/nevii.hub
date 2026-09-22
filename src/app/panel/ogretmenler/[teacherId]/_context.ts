import { cache } from "react";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import type { AppData, Teacher } from "@/lib/types";
import type { ServiceContext } from "@/lib/services/context";

/**
 * Öğretmen detayı sekme başına ayrı route; layout + sekme aynı istekte
 * aynı veriye ihtiyaç duyar. `cache()` istek başına TEK okumaya indirger.
 */
export type TeacherPageContext = {
  session: ServiceContext;
  kurum: Awaited<ReturnType<typeof getInstitutionContext>>;
  data: AppData;
  teacher: Teacher | undefined;
  /** Yönetici/okul yöneticisi — düzenleme ve hassas veri yetkisi. */
  canManage: boolean;
};

export const loadTeacherPageContext = cache(async (teacherId: string): Promise<TeacherPageContext> => {
  const session = await requireSessionContext();
  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const teacher = data.teachers.find((t) => t.id === teacherId);
  const canManage = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
  return { session, kurum, data, teacher, canManage };
});
