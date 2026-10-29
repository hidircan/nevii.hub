/**
 * İK panel sayfaları için ortak oturum kapısı: yalnız SCHOOL_ADMIN / SUPER_ADMIN, tek kurum seçili.
 * Dönen `ctx` araçlara verilir; sayfa `runWithTenantAsync` altında çalışır.
 */
import { redirect } from "next/navigation";
import { requireSessionContext } from "../auth/session";
import { resolveWriteScope } from "../institution/write-scope";
import type { ServiceContext } from "../services/context";

export async function requireRecruitmentPage(next: string): Promise<{ ctx: ServiceContext; allMode: boolean }> {
  let session: ServiceContext;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") redirect("/panel");
  const scope = await resolveWriteScope(session);
  if (scope.mode !== "single") return { ctx: session, allMode: true };
  return { ctx: { ...session, tenantId: scope.tenantId, channel: "web" }, allMode: false };
}
