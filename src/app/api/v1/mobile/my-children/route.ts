import { withApiHandler } from "@/lib/api/handler";
import { getStudentProfileTool } from "@/lib/services";
import { ok } from "@/lib/services/result";
import { listAccessForUser } from "@/lib/student-portal-access";

export const dynamic = "force-dynamic";

export type MyChildItem = {
  id: string;
  displayName: string;
  accessType: "GUARDIAN" | "SELF";
  photoPath: string | null;
  instruments: string[];
  teacherName?: string;
};

/**
 * GET /api/v1/mobile/my-children — velinin TÜM aktif öğrenci erişimleri (sınırsız).
 *
 * Güvenlik (sözleşme, istisnasız):
 * - Kimlik doğrulama zorunlu (withApiHandler; public DEĞİL).
 * - tenantId/userId yalnız güvenilir session bağlamından (`ctx`), query/body'den ASLA.
 * - Yalnız `status === "active"` kayıtları; `invited`/`revoked` ASLA dönmez.
 * - SELF öğrenci ve STUDENT-dışı roller için `children: []` (kendi bağlamı session akışındadır).
 * - Her kayıt `getStudentProfileTool` üzerinden okunur — o da `assertStudentAccess`
 *   uygular (çift katman); okunamayan kayıt sessizce atlanır, ID/isim sızdırılmaz.
 * - PII-minimize: id, displayName, accessType, photoPath, instruments, teacherName.
 *   Telefon/veli telefonu/e-posta ASLA dönmez.
 * - Deterministik sıra: displayName artan (tr), sonra id.
 * - Salt-okunur: migration/RBAC değişikliği yok.
 */
export const GET = withApiHandler(async ({ ctx }) => {
  if (ctx.role !== "STUDENT") return ok({ children: [] satisfies MyChildItem[] });

  const active = (await listAccessForUser(ctx.tenantId, ctx.userId)).filter((r) => r.status === "active");
  if (active.length === 0) return ok({ children: [] satisfies MyChildItem[] });

  // SELF tekil bağlamdır — liste yalnız GUARDIAN çoklu-erişim içindir.
  const guardian = active.filter((r) => r.accessType === "GUARDIAN");
  if (guardian.length === 0) return ok({ children: [] satisfies MyChildItem[] });

  const children: MyChildItem[] = [];
  for (const record of guardian) {
    const profile = await getStudentProfileTool(ctx, { studentId: record.studentId });
    if (!profile.ok) continue;
    children.push({
      id: profile.data.id,
      displayName: profile.data.name,
      accessType: "GUARDIAN",
      photoPath: profile.data.photoPath,
      instruments: Array.isArray(profile.data.instruments) ? profile.data.instruments.filter(Boolean) : [],
      teacherName: profile.data.teacherName,
    });
  }

  children.sort(
    (a, b) => a.displayName.localeCompare(b.displayName, "tr") || a.id.localeCompare(b.id)
  );
  return ok({ children });
});
