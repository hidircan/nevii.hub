import { withApiHandler } from "@/lib/api/handler";
import { deleteBlogPost, listBlogAdmin, readBlogAdmin, saveBlogPost, setBlogPublished } from "@/lib/platform/blog-admin";
import { fail } from "@/lib/services/result";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(async ({ ctx }) => listBlogAdmin(ctx), {
  hyperAdminOnly: true,
  permission: "platform:read",
});

export const POST = withApiHandler(
  async ({ ctx, body }) => {
    const { action, ...input } = (body ?? {}) as { action?: string; slug?: unknown };
    if (action === "read") return readBlogAdmin(ctx, input.slug);
    if (action === "save") return saveBlogPost(ctx, input);
    if (action === "publish") return setBlogPublished(ctx, input);
    if (action === "delete") return deleteBlogPost(ctx, input);
    return fail("VALIDATION_ERROR", "Bilinmeyen işlem. Sayfayı yenileyip tekrar deneyin.");
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);
