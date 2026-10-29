import { getUserAccountStatus } from "../auth/users";
import { isDbMode } from "../config";

/**
 * Mobil oturum yanıtındaki `fullName` — Hesabım ekranı başlığında e-posta
 * yerine gerçek ad soyad gösterilir.
 *
 * Sıra: TEACHER için `Teacher.name` (kendi domain kaydı; `tenantId` +
 * `teacherId` ile sunucu tarafında doğrulanır) → `User.displayName` → `null`.
 * `null` "kimlik henüz çözülmedi" demektir; istemci iskelet gösterir, ada
 * ASLA e-posta veya rol etiketi konmaz.
 */
export async function resolveSessionFullName(input: {
  tenantId: string;
  userId: string;
  teacherId?: string | null;
}): Promise<string | null> {
  const teacherId = input.teacherId?.trim();
  if (teacherId) {
    try {
      if (isDbMode) {
        const { getPrisma } = await import("../db");
        const teacher = await getPrisma().teacher.findFirst({
          where: { id: teacherId, tenantId: input.tenantId },
          select: { name: true },
        });
        const name = teacher?.name?.trim();
        if (name) return name;
      } else {
        const [{ readReferenceData }, { runWithTenantAsync }] = await Promise.all([
          import("../store"),
          import("../tenant-context"),
        ]);
        const data = await runWithTenantAsync(input.tenantId, () => readReferenceData());
        const name = data.teachers.find((t) => t.id === teacherId)?.name?.trim();
        if (name) return name;
      }
    } catch {
      // Öğretmen kaydı okunamadı — hesap adına düşülür (aşağıda).
    }
  }

  try {
    const status = await getUserAccountStatus(input.userId);
    return status?.displayName?.trim() || null;
  } catch {
    return null;
  }
}
