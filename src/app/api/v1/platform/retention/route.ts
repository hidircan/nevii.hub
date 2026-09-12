import { withApiHandler } from "@/lib/api/handler";
import { fail } from "@/lib/services/result";
import { getRetentionOverview, runRetentionFromPanel } from "@/lib/platform/retention";
import { updatePlatformDefaultSetting } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

/** GET — politika, kategoriler, zamanlanmış iş sözleşmesi. Yalnız HYPER_ADMIN. */
export const GET = withApiHandler(async ({ ctx }) => getRetentionOverview(ctx), { hyperAdminOnly: true, permission: "platform:read" });

/**
 * body.op: run { dryRun (vars. true), confirm } | policy { days: {kategori: gün}, reason, confirm }
 * Policy yazımı `retention.days` platform ayarıdır (kritik → onay + sürüm + audit).
 */
export const POST = withApiHandler(
  async ({ ctx, body }) => {
    const b = (body ?? {}) as { op?: string; days?: unknown; reason?: string; confirm?: boolean };
    switch (b.op) {
      case "run":
        return runRetentionFromPanel(ctx, body);
      case "policy":
        return updatePlatformDefaultSetting(ctx, { key: "retention.days", value: b.days, reason: b.reason, confirm: b.confirm });
      default:
        return fail("VALIDATION_ERROR", "Bilinmeyen işlem");
    }
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);
