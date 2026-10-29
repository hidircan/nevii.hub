import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Rapor portalı (2026-10-14) — öğrencilere/velilere verilen kısa bağlantı (`neviihub.com/degerlendir`).
 * Oturum varsa öğrenci portalındaki öğretmen değerlendirmesine, yoksa girişe yönlendirir.
 */
export default async function FeedbackShortLinkPage() {
  const session = await getSessionContext().catch(() => null);
  redirect(session ? "/ogrenci/degerlendirme" : "/login?next=/ogrenci/degerlendirme");
}
