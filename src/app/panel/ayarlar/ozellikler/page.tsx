import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Owner kararı (2026-10-29): kurum özellikleri hiçbir kurum kullanıcısında
 * görünmez (yan menüden kaldırıldı); bu konfigürasyonları HYPER_ADMIN
 * NeviiOS üzerinden yürütür. Eski bağlantılar panele yönlenir.
 */
export default async function PanelKurumOzelliklerPage() {
  try {
    await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ayarlar/ozellikler");
  }
  redirect("/panel");
}
