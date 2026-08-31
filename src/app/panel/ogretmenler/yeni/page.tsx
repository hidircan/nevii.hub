import { redirect } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { Card, PageHeader } from "@/components/ui";
import { NewTeacherForm } from "@/components/new-teacher-form";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { listInstrumentCatalogTool } from "@/lib/services";
import type { Instrument } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Paket 7 — Yeni öğretmen kaydı, mevcut listeden AYRI, tam sayfa bir akış
 * (bkz. öğrenci kaydındaki aynı desen — /panel/ogrenciler/yeni).
 */
export default async function NewTeacherPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ogretmenler/yeni");
  }
  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);

  const catalogResult = await listInstrumentCatalogTool(session, {});
  const instrumentOptions = (
    catalogResult.ok
      ? catalogResult.data.entries.filter((e) => e.status === "active").map((e) => e.name)
      : undefined
  ) as Instrument[] | undefined;

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <div className="mb-4">
        <BackButton fallbackHref="/panel/ogretmenler" label="Öğretmenlere dön" />
      </div>
      <PageHeader title="Yeni Öğretmen Kaydı" />

      {kurum.scope.mode !== "single" ? (
        <Card>
          <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-medium text-amber-800">
            &quot;Tüm kurumlar&quot; görünümündesiniz — yeni öğretmen eklemek için üstteki kurum
            seçiciden tek bir kurum seçin.
          </p>
        </Card>
      ) : (
        <NewTeacherForm
          branches={data.settings.branches.map((b) => ({ id: b.id, name: b.name }))}
          instrumentOptions={instrumentOptions}
        />
      )}
    </div>
  );
}
