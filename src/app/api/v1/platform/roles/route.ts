import { withApiHandler } from "@/lib/api/handler";
import { fail } from "@/lib/services/result";
import { getRoleDirectory, previewManagerPreset, setManagerPreset, toggleCustomRoleScreen } from "@/lib/platform/role-directory";

export const dynamic = "force-dynamic";

/** GET ?tenantId= — rol dizini (kullanıcı sayıları, listeler, ekranlar, preset). Yalnız HYPER_ADMIN. */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) => getRoleDirectory(ctx, { tenantId: searchParams.get("tenantId") }),
  { hyperAdminOnly: true, permission: "platform:read" }
);

/** body.op: preset_preview | preset_apply | screen_toggle — hepsi tenantId ister. */
export const POST = withApiHandler(
  async ({ ctx, body }) => {
    const b = (body ?? {}) as { op?: string; tenantId?: string };
    if (!b.tenantId) return fail("VALIDATION_ERROR", "tenantId gerekli");
    switch (b.op) {
      case "preset_preview":
        return previewManagerPreset(ctx, b.tenantId, body);
      case "preset_apply":
        return setManagerPreset(ctx, b.tenantId, body);
      case "screen_toggle":
        return toggleCustomRoleScreen(ctx, b.tenantId, body);
      default:
        return fail("VALIDATION_ERROR", "Bilinmeyen işlem");
    }
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);
