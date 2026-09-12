import { withApiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/services/result";
import { getPublicPriceList } from "@/lib/platform/commercial-catalog";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/catalog/plans — public. Yalnız YAYINDAKİ katalog; fiyatı
 * yayınlanmamış paket "Yayınlanmadı", enterprise "Özel teklif" döner.
 * Taslak (internal) fiyatlar asla bu uçtan çıkmaz. KDV hariç.
 */
export const GET = withApiHandler(async () => ok(await getPublicPriceList()), { public: true });
