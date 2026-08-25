import { redirect } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { actionAddStudent } from "@/lib/actions";
import { Button, Card, Input, Label, PageHeader, Select } from "@/components/ui";
import { StudentInstrumentTeacherFields } from "@/components/student-instrument-teacher-fields";
import { StudentPackagePricingFields } from "@/components/student-package-pricing-fields";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { STUDENT_TYPES } from "@/lib/types";
import { listInstrumentCatalogTool } from "@/lib/services";

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

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <div className="mb-4">
        <BackButton fallbackHref="/panel/ogrenciler" label="Öğrencilere dön" />
      </div>
      <PageHeader title="Yeni Öğrenci Kaydı" />

      {kurum.scope.mode !== "single" ? (
        <Card>
          <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-medium text-amber-800">
            &quot;Tüm kurumlar&quot; görünümündesiniz — yeni öğrenci eklemek için üstteki kurum
            seçiciden tek bir kurum seçin.
          </p>
        </Card>
      ) : (
        <form action={actionAddStudent} className="space-y-6">
          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              Temel bilgiler
            </h2>
            <div className="space-y-3">
              <div>
                <Label>Ad soyad</Label>
                <Input name="name" required placeholder="Örn. Deniz Ak" />
              </div>
              <div>
                <Label>T.C. kimlik no (opsiyonel — şifreli saklanır)</Label>
                <Input name="nationalId" inputMode="numeric" maxLength={11} placeholder="11 haneli" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Anne adı (opsiyonel)</Label>
                  <Input name="motherName" placeholder="Anne adı" />
                </div>
                <div>
                  <Label>Baba adı (opsiyonel)</Label>
                  <Input name="fatherName" placeholder="Baba adı" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Veli adı</Label>
                  <Input name="parentName" placeholder="Veli adı" />
                </div>
                <div>
                  <Label>Veli telefon</Label>
                  <Input name="parentPhone" placeholder="05xx xxx xxxx" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Öğrenci e-posta</Label>
                  <Input name="email" type="email" placeholder="ogrenci@email.com" />
                </div>
                <div>
                  <Label>Öğrenci telefon</Label>
                  <Input name="phone" placeholder="05xx xxx xxxx" />
                </div>
              </div>
              <div>
                <Label>Ödeme/iletişim muhatabı</Label>
                <Select name="accountResponsibility" defaultValue="PARENT_MANAGED">
                  <option value="PARENT_MANAGED">Veli (varsayılan)</option>
                  <option value="SELF_MANAGED">Öğrencinin kendisi</option>
                </Select>
              </div>
            </div>
          </Card>

          <p className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
            Bu ekranda giriş hesabı oluşturulmaz. Öğrenci kaydedildikten sonra, düzenleme ekranındaki &ldquo;Öğrenci
            Portalı erişimi&rdquo; bölümünden davet gönderin — geçici şifre yalnızca o an, bir kez gösterilir.
          </p>

          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              Kişisel bilgiler
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Doğum tarihi (opsiyonel)</Label>
                  <Input name="birthDate" type="date" />
                </div>
                <div>
                  <Label>Doğum yeri (opsiyonel)</Label>
                  <Input name="birthPlace" placeholder="Örn. İzmir" />
                </div>
              </div>
              <div>
                <Label>Okulu / mesleği (opsiyonel)</Label>
                <Input name="schoolOrOccupation" placeholder="Örn. Erzene İlkokulu 3-A" />
              </div>
              <div>
                <Label>Ev adresi (opsiyonel)</Label>
                <Input name="address" placeholder="Opsiyonel" />
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              Şube, enstrüman ve öğretmen
            </h2>
            <div className="space-y-3">
              <div>
                <Label>Şube</Label>
                <Select name="branchId" defaultValue={data.settings.branches[0]?.id}>
                  {data.settings.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              <StudentInstrumentTeacherFields
                instrumentOptions={instrumentOptions}
                teachers={data.teachers.map((t) => ({
                  id: t.id,
                  name: t.name,
                  active: t.active,
                  instruments: t.instruments,
                }))}
              />
              <div>
                <Label>Haftalık ders</Label>
                <Input name="weeklyLessonCount" type="number" defaultValue={1} min={1} />
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              Paket ve ödeme
            </h2>
            <div className="space-y-3">
              <div>
                <Label>Paket (serbest metin — geçmişle uyum için)</Label>
                <Input name="packageName" defaultValue="Bireysel Aylık — 4 ders" />
              </div>
              <StudentPackagePricingFields
                packages={(data.packages ?? [])
                  .filter((p) => p.status === "active")
                  .map((p) => ({
                    id: p.id,
                    title: p.title,
                    price30Min: p.price30Min,
                    price40Min: p.price40Min,
                    price50Min: p.price50Min,
                  }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Ödeme türü (opsiyonel)</Label>
                  <Select name="paymentMethod" defaultValue="">
                    <option value="">Belirtilmemiş</option>
                    <option value="cash">Nakit</option>
                    <option value="transfer">Havale</option>
                    <option value="credit_card">Kredi Kartı</option>
                  </Select>
                </div>
                <div>
                  <Label>Ödeme günü (1–31, opsiyonel)</Label>
                  <Input name="paymentDueDay" type="number" min={1} max={31} />
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              Akademik bilgiler
            </h2>
            <div className="space-y-3">
              <div>
                <Label>Yoklama Takvimi dönemi</Label>
                <Select name="termType" defaultValue="guz">
                  <option value="guz">Güz Dönemi</option>
                  <option value="yaz">Yaz Dönemi</option>
                </Select>
              </div>
              <div>
                <Label>Öğrenci türleri (opsiyonel, birden fazla seçilebilir)</Label>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {STUDENT_TYPES.map((t) => (
                    <label key={t} className="flex items-center gap-1.5 text-sm text-[var(--color-text)]">
                      <input type="checkbox" name="studentTypes" value={t} />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Kayıt başlangıç tarihi (opsiyonel)</Label>
                  <Input name="enrollmentStartDate" type="date" />
                </div>
                <div>
                  <Label>Seviye (opsiyonel)</Label>
                  <Input name="level" placeholder="Örn. Başlangıç, Orta, İleri" />
                </div>
              </div>
              <div>
                <Label>Hedef sınav / performans dönemi (opsiyonel)</Label>
                <Input name="targetExam" placeholder="Örn. 2027 Konservatuvar giriş sınavı" />
              </div>
              <div>
                <Label>Not</Label>
                <Input name="notes" placeholder="Opsiyonel" />
              </div>
              <div className="flex items-center gap-2">
                <input id="social-media-consent" type="checkbox" name="socialMediaConsent" value="granted" className="h-4 w-4" />
                <label htmlFor="social-media-consent" className="text-sm text-[var(--color-text)]">
                  Sosyal medya paylaşım izni var
                </label>
              </div>
            </div>
          </Card>

          <Button type="submit" className="w-full">
            Öğrenci ekle
          </Button>
        </form>
      )}
    </div>
  );
}
