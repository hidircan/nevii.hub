import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedReferenceData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { BackButton } from "@/components/back-button";
import { PageHeader } from "@/components/ui";
import { StaffCreateForm } from "@/components/staff-create-form";

export const dynamic = "force-dynamic";

/**
 * Yeni personel kayıt sayfası — liste ekranındaki "Yeni personel ekle"
 * butonuyla gelinir. Yetki sınırı liste sayfasıyla AYNI
 * (SCHOOL_ADMIN/SUPER_ADMIN + finans/personel özeti görebilen).
 */
export default async function YeniPersonelPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/personel/yeni");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }
  const { canViewFinanceAndStaffSummary } = await import("@/lib/auth/platform-access");
  if (!canViewFinanceAndStaffSummary(session)) redirect("/panel");

  const kurum = await getInstitutionContext(session);
  const data = await readScopedReferenceData(kurum.scope);

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <BackButton fallbackHref="/panel/personel" label="Personele dön" className="mb-3" />
      <PageHeader
        title="Yeni personel ekle"
        description="Öğretmen dışı personel kaydı — idari, muhasebe, resepsiyon vb."
      />
      {kurum.scope.mode === "single" ? (
        <StaffCreateForm branches={data.settings.branches.map((b) => ({ id: b.id, shortName: b.shortName }))} />
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Yeni personel kaydı birleşik kurum görünümünde kapalı — önce tek bir kurum seçin.
        </p>
      )}
    </div>
  );
}
