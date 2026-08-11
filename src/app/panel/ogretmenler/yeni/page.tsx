import { redirect } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { actionAddTeacher } from "@/lib/actions";
import { Button, Card, Input, Label, PageHeader, Select } from "@/components/ui";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { TeacherInstrumentsField } from "@/components/teacher-instruments-field";
import { TeacherAvailabilityField } from "@/components/teacher-availability-field";
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
        <form action={actionAddTeacher} className="space-y-6">
          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              Temel bilgiler
            </h2>
            <div className="space-y-3">
              <div>
                <Label>Ad soyad</Label>
                <Input name="name" required placeholder="Örn. Selin Kara" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>E-posta</Label>
                  <Input name="email" type="email" placeholder="ogretmen@okul.com" />
                </div>
                <div>
                  <Label>Telefon</Label>
                  <Input name="phone" placeholder="05xx xxx xxxx" />
                </div>
              </div>
              <div>
                <Label>T.C. kimlik no (opsiyonel — şifreli saklanır)</Label>
                <Input name="nationalId" inputMode="numeric" maxLength={11} placeholder="11 haneli" />
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              Şube, enstrüman ve müsaitlik
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
              <div>
                <Label>Ana enstrüman (yalnızca hiç enstrüman eklenmezse kullanılır)</Label>
                <Select name="instrument" defaultValue={instrumentOptions?.[0] ?? "Piyano"}>
                  {(instrumentOptions ?? ["Piyano", "Yan Flüt", "Gitar", "Bateri", "Keman", "Şan"]).map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Enstrümanlar ve seviyeleri</Label>
                <TeacherInstrumentsField name="instrumentLevelsJson" instrumentOptions={instrumentOptions} />
              </div>
              <div>
                <Label>Haftalık müsaitlik (şube bazlı — opsiyonel)</Label>
                <TeacherAvailabilityField
                  name="availabilityJson"
                  branches={data.settings.branches.map((b) => ({ id: b.id, name: b.name }))}
                />
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  Şube seçilmezse pencere tüm şubeler için geçerli sayılır. Daha sonra öğretmen detay
                  ekranından da düzenlenebilir.
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              Kişisel ve eğitim bilgileri
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Doğum tarihi (opsiyonel)</Label>
                  <Input name="birthDate" type="date" />
                </div>
                <div>
                  <Label>Ev adresi (opsiyonel)</Label>
                  <Input name="address" placeholder="Opsiyonel" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Lise (opsiyonel)</Label>
                  <Input name="highSchool" placeholder="Örn. Bornova Anadolu Lisesi" />
                </div>
                <div>
                  <Label>Üniversite (opsiyonel)</Label>
                  <Input name="university" placeholder="Örn. İzmir DEÜ" />
                </div>
                <div>
                  <Label>Mezuniyet yılı (opsiyonel)</Label>
                  <Input name="graduationYear" type="number" min={1950} max={2100} placeholder="2015" />
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              Özlük bilgileri
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Çalışma şekli (opsiyonel)</Label>
                  <Select name="employmentType" defaultValue="">
                    <option value="">Belirtilmemiş</option>
                    <option value="tam_zamanli">Tam zamanlı</option>
                    <option value="yari_zamanli">Yarı zamanlı</option>
                    <option value="serbest">Serbest</option>
                  </Select>
                </div>
                <div>
                  <Label>İşe giriş tarihi (opsiyonel)</Label>
                  <Input name="hireDate" type="date" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Sözleşme başlangıcı (opsiyonel)</Label>
                  <Input name="contractStartDate" type="date" />
                </div>
                <div>
                  <Label>Sözleşme bitişi (opsiyonel)</Label>
                  <Input name="contractEndDate" type="date" />
                </div>
              </div>
              <div>
                <Label>Haftalık ders saati eşiği (opsiyonel)</Label>
                <Input name="weeklyHoursThreshold" type="number" min={1} max={80} placeholder="Örn. 20" />
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  Bu eşiğin üstü nakit, altı havale ödeme türü varsayılan alınır.
                </p>
              </div>
              <div>
                <Label>Özlük notu (opsiyonel)</Label>
                <Input name="personnelNotes" placeholder="Yalnızca yöneticiler görür" />
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              Acil durum iletişimi
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Ad soyad (opsiyonel)</Label>
                <Input name="emergencyContactName" placeholder="Acil durumda aranacak kişi" />
              </div>
              <div>
                <Label>Telefon (opsiyonel)</Label>
                <Input name="emergencyContactPhone" placeholder="05xx xxx xxxx" />
              </div>
            </div>
          </Card>

          <Button type="submit" className="w-full">
            Öğretmen ekle
          </Button>
        </form>
      )}
    </div>
  );
}
