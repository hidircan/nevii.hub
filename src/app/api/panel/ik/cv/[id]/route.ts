/** Yönetici: adayın CV dosyasını indirir (oturum + tenant eşleşmesi zorunlu). */
import { getSessionContext } from "@/lib/auth/session";
import { resolveWriteScope } from "@/lib/institution/write-scope";
import { runWithTenantAsync } from "@/lib/tenant-context";
import { getCvFileTool } from "@/lib/recruitment/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext().catch(() => null);
  if (!session) return new Response("Oturum gerekli.", { status: 401 });
  const scope = await resolveWriteScope(session);
  if (scope.mode !== "single") return new Response("Önce tek bir kurum seçin.", { status: 400 });
  const { id } = await params;
  const ctx = { ...session, tenantId: scope.tenantId };
  const res = await runWithTenantAsync(scope.tenantId, () => getCvFileTool(ctx, { applicationId: id }));
  if (!res.ok) return new Response(res.error.message, { status: res.error.code === "FORBIDDEN" ? 403 : 404 });
  const name = res.data.fileName.replace(/["\r\n]/g, "_");
  return new Response(new Uint8Array(res.data.data), {
    headers: {
      "Content-Type": res.data.mimeType,
      "Content-Disposition": `inline; filename="cv.${res.data.mimeType === "application/pdf" ? "pdf" : "docx"}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
