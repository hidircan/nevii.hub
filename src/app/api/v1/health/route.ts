import { withApiHandler } from "@/lib/api/handler";
import { BRAND } from "@/lib/brand";
import { ok } from "@/lib/services/result";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/health — PUBLIC liveness. Yalnız `{ service, healthy, time }`;
 * store modu/sürüm/altyapı bilgisi public yanıta KONMAZ. `STORE_MODE=db`
 * deploy öncesi `npm run validate:mobile-review-env` ile doğrulanır.
 */
export const GET = withApiHandler(
  async () => ok({ service: BRAND.name, healthy: true, time: new Date().toISOString() }),
  { public: true }
);
