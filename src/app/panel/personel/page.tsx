import { redirect } from "next/navigation";
import Link from "next/link";
import { Wallet, CalendarDays, CreditCard } from "lucide-react";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { listStaffTool } from "@/lib/services";
import { PageHeader, Card } from "@/components/ui";
import { StaffManager } from "@/components/staff-manager";

export const dynamic = "force-dynamic";

/**
 * Personel Modülü — öğretmen dışı personel (idari/muhasebe/resepsiyon vb.)
 * için yönetici ekranı. Yalnızca SCHOOL_ADMIN/SUPER_ADMIN erişebilir
 * (listStaffTool RBAC'ı zaten aynı kısıtı uygular; burada erken redirect
 * ile diğer roller ekranı hiç görmez).
 */
export default async function PersonelPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/personel");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }
  const { canViewFinanceAndStaffSummary } = await import("@/lib/auth/platform-access");
  if (!canViewFinanceAndStaffSummary(session)) redirect("/panel");

  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const result = await listStaffTool(session, {});
  const staff = result.ok ? result.data.staff : [];

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <PageHeader
        title="Personel"
        description="Öğretmen dışı personel kayıtları — idari, muhasebe, resepsiyon vb."
        actions={
          kurum.scope.mode === "single" ? (
            <Link
              href="/panel/personel/yeni"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--color-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
            >
              <span aria-hidden>+</span> Yeni personel ekle
            </Link>
          ) : undefined
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Link href="/panel/personel/bordrolar">
          <Card className="!p-4 transition hover:border-[var(--color-primary)]">
            <div className="flex items-center gap-2 text-[var(--color-primary)]">
              <Wallet className="h-4 w-4" />
              <p className="text-sm font-semibold">Bordrolar</p>
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Aylık bordro kayıtları ve ödeme durumu</p>
          </Card>
        </Link>
        <Link href="/panel/personel/izinler">
          <Card className="!p-4 transition hover:border-[var(--color-primary)]">
            <div className="flex items-center gap-2 text-[var(--color-primary)]">
              <CalendarDays className="h-4 w-4" />
              <p className="text-sm font-semibold">İzinler</p>
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">İzin talepleri ve onay durumu</p>
          </Card>
        </Link>
        <Link href="/panel/finans-ozeti">
          <Card className="!p-4 transition hover:border-[var(--color-primary)]">
            <div className="flex items-center gap-2 text-[var(--color-primary)]">
              <CreditCard className="h-4 w-4" />
              <p className="text-sm font-semibold">Finans Özeti</p>
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Kurum sahibi mali dashboard&apos;u</p>
          </Card>
        </Link>
      </div>
      <StaffManager
        staff={staff}
        branches={data.settings.branches.map((b) => ({ id: b.id, shortName: b.shortName }))}
        canWrite={kurum.scope.mode === "single"}
      />
    </div>
  );
}
