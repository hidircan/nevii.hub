import { withApiHandler } from "@/lib/api/handler";
import { platformSearch } from "@/lib/platform/search";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async ({ ctx, searchParams }) => platformSearch(ctx, searchParams.get("q") ?? ""),
  { hyperAdminOnly: true, permission: "platform:read" }
);
