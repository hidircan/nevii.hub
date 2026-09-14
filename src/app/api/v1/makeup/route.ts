import { withApiHandler } from "@/lib/api/handler";
import { listMakeupRequestsTool } from "@/lib/services/mobile-read";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/makeup — oturumun kapsamındaki telafi kayıtları (salt-okunur).
 * TEACHER: kendi kayıtları · STUDENT (SELF/GUARDIAN): aktif erişimli öğrenci(ler) ·
 * SCHOOL_ADMIN/SUPER_ADMIN: kurum. Kapsam parametresi alınmaz. Mutasyonlar
 * mevcut `/makeup/{create,confirm,cancel}` uçlarındadır.
 */
export const GET = withApiHandler(async ({ ctx }) => listMakeupRequestsTool(ctx));
