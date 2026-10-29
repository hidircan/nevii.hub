import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Eski hesap adımı → yeni bilgiler adımı (ürün kararıyla birleşti).
 * Seçim korunur; kayıt defteri uyumluluğu için yönlendirme bırakıldı.
 */
export default async function CheckoutAccountRedirect({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
}) {
  const params = await searchParams;
  const qp = new URLSearchParams();
  if (params.plan) qp.set("plan", params.plan);
  if (params.interval) qp.set("interval", params.interval);
  redirect(`/satin-al/bilgiler?${qp.toString()}`);
}
