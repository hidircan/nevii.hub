import { withApiHandler } from "@/lib/api/handler";
import { fail } from "@/lib/services/result";
import { createRelease, getReleaseCenter, recordDeployment } from "@/lib/platform/releases";

export const dynamic = "force-dynamic";

/** GET — release/deployment kayıtları, çalışan sürüm (runtime env), migration durumu. Yalnız HYPER_ADMIN. */
export const GET = withApiHandler(async ({ ctx }) => getReleaseCenter(ctx), { hyperAdminOnly: true, permission: "platform:read" });

/** body.op: release_create | deployment_record — elle giriş (source: manual), audit'li. */
export const POST = withApiHandler(
  async ({ ctx, body }) => {
    switch ((body as { op?: string } | null)?.op) {
      case "release_create":
        return createRelease(ctx, body);
      case "deployment_record":
        return recordDeployment(ctx, body);
      default:
        return fail("VALIDATION_ERROR", "Bilinmeyen işlem");
    }
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);
