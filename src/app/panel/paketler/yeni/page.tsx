import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { PageHeader, Card } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { PackageCreateForm } from "@/components/package-manager";

export const dynamic = "force-dynamic";

export default async function YeniPaketPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/paketler/yeni");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const kurum = await getInstitutionContext(session);
  if (kurum.scope.mode !== "single") {
    return (
      <div>
        <KurumScopeNote scope={kurum.scope} />
        <PageHeader title="Yeni paket" />
        <p className="rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-warning)]">
          &quot;Tüm kurumlar&quot; görünümünde paket oluşturulamaz. Üstten tek kurum seçin.
        </p>
        <BackButton fallbackHref="/panel/paketler" label="Paketlere dön" className="mt-4" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <KurumScopeNote scope={kurum.scope} />
      <BackButton fallbackHref="/panel/paketler" label="Paketlere dön" className="mb-3" />
      <PageHeader
        title="Yeni paket"
        description="30/40/50 dk fiyatlarını tanımlayın. Oluşturduktan sonra listeye dönersiniz."
      />
      <Card>
        <PackageCreateForm />
      </Card>
      <p className="mt-4 text-xs text-[var(--color-text-muted)]">
        <Link href="/panel/paketler" className="font-medium text-[var(--color-primary)] hover:underline">
          ← Listeye dön
        </Link>
      </p>
    </div>
  );
}
