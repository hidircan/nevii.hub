import { redirect } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { Card, PageHeader } from "@/components/ui";
import { NewStudentForm } from "@/components/new-student-form";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { listInstrumentCatalogTool, getCurrentConsentTextVersionTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * Paket 7 — Yeni öğrenci kaydı, mevcut listeden AYRI, tam sayfa bir akış.
 * Alanlar öğrenci detay ekranıyla (StudentProfileEditor, StudentTermTypeEditor,
 * StudentPaymentProfileEditor) İŞ AÇISINDAN aynı bilgiyi kapsar — kayıttan
 * sonra zorunlu ek bilgi girmek için detay sayfasına gitmeye gerek kalmaz.
 * Veri modeli/validation (actionAddStudent, createStudentSchema) DEĞİŞMEDİ
 * — bu sadece formun kendi ekranı ve bölümlenmiş düzeni.
 */
export default async function NewStudentPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ogrenciler/yeni");
  }
  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const catalogResult = await listInstrumentCatalogTool(session, {});
  const instrumentOptions = catalogResult.ok
    ? catalogResult.data.entries.filter((e) => e.status === "active").map((e) => e.name)
    : ["Piyano", "Yan Flüt", "Gitar", "Bateri", "Keman", "Şan", "Elektro Gitar", "Bağlama"];
  const kvkkTextResult = await getCurrentConsentTextVersionTool(session, { consentType: "kvkk_general" });
  const kvkkText = kvkkTextResult.ok ? kvkkTextResult.data.version : undefined;

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <div className="mb-4">
        <BackButton fallbackHref="/panel/ogrenciler" label="Öğrencilere dön" />
      </div>
      <PageHeader title="Yeni Öğrenci Kaydı" />

      <Card className="mb-4 !border-cyan-200 !bg-cyan-50/70 dark:!border-cyan-900 dark:!bg-cyan-950/30">
        <p className="text-xs font-medium text-cyan-900 dark:text-cyan-200">
          Öğrenci kaydı tamamlandıktan sonra, öğrenci detay sayfasındaki{" "}
          <strong>&quot;Kayıt ve Ödeme Planı / Sözleşmeler&quot;</strong> bölümünden program, süre,
          taksit planı ve imzalayan bilgilerini girerek kayıt sözleşmesini ve yazdırılabilir PDF&apos;i
          oluşturabilirsiniz.
        </p>
      </Card>

      {kurum.scope.mode !== "single" ? (
        <Card>
          <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-medium text-amber-800">
            &quot;Tüm kurumlar&quot; görünümündesiniz — yeni öğrenci eklemek için üstteki kurum
            seçiciden tek bir kurum seçin.
          </p>
        </Card>
      ) : (
        <NewStudentForm
          branches={data.settings.branches.map((b) => ({ id: b.id, name: b.name }))}
          teachers={data.teachers.map((t) => ({
            id: t.id,
            name: t.name,
            active: t.active,
            instruments: t.instruments,
          }))}
          instrumentOptions={instrumentOptions}
          packages={(data.packages ?? [])
            .filter((p) => p.status === "active")
            .map((p) => ({
              id: p.id,
              title: p.title,
              price30Min: p.price30Min,
              price40Min: p.price40Min,
              price50Min: p.price50Min,
            }))}
          kvkkText={kvkkText}
          workDayOverrides={data.closedDayOverrides ?? []}
          termWeeklyClosedDays={data.settings.termWeeklyClosedDays}
        />
      )}
    </div>
  );
}
