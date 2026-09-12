import { withApiHandler } from "@/lib/api/handler";
import { fail } from "@/lib/services/result";
import {
  createPolicyDraft,
  discardPolicyDraft,
  listPolicyHistory,
  previewPolicyDraft,
  publishPolicyDraft,
  rollbackPolicy,
} from "@/lib/platform/policy-versions";

export const dynamic = "force-dynamic";

/** `?scope=<tenantId|platform>` — kritik politika sürüm geçmişi. */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) => listPolicyHistory(ctx, searchParams.get("scope") ?? ""),
  { hyperAdminOnly: true, permission: "platform:read" }
);

/** body.op: draft | preview | publish | discard | rollback */
export const POST = withApiHandler(
  async ({ ctx, body, searchParams }) => {
    const scope = searchParams.get("scope") ?? "";
    const b = (body ?? {}) as { op?: string; draftId?: string };
    switch (b.op) {
      case "draft":
        return createPolicyDraft(ctx, scope, body);
      case "preview":
        return previewPolicyDraft(ctx, scope, String(b.draftId ?? ""));
      case "publish":
        return publishPolicyDraft(ctx, scope, body);
      case "discard":
        return discardPolicyDraft(ctx, scope, body);
      case "rollback":
        return rollbackPolicy(ctx, scope, body);
      default:
        return fail("VALIDATION_ERROR", "Bilinmeyen işlem");
    }
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);
