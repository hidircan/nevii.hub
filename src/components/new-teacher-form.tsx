"use client";

/**
 * P0-2 (2026-08-29) — `new-student-form.tsx` ile AYNI düzeltme: bu form
 * ÖNCEDEN düz `<form action={actionAddTeacher}>` (useActionState YOK) idi;
 * `createTeacherTool` doğrulama hatası (ör. şema gevşetmesiyle artık
 * mümkün olan "Geçersiz veya pasif enstrüman" — bkz. actions.ts yorumu)
 * yakalanmamış bir sunucu hatası olarak sızardı. `useActionState`'e
 * taşındı: form açık kalır, girilen değerler korunur, alan bazlı Türkçe
 * hatalar + üstte özet gösterilir, `isPending` çift-submit'i engeller.
 */

import { useActionState, useEffect, useRef } from "react";
import { actionAddTeacher, type NewTeacherFormState } from "@/lib/actions";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { TeacherInstrumentsField } from "@/components/teacher-instruments-field";
import { TeacherAvailabilityField } from "@/components/teacher-availability-field";
import type { Instrument } from "@/lib/types";

type BranchOption = { id: string; name: string };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs font-medium text-rose-600" role="alert">
      {message}
    </p>
  );
}

export function NewTeacherForm({
  branches,
  instrumentOptions,
}: {
  branches: BranchOption[];
  instrumentOptions: Instrument[] | undefined;
}) {
  const [state, formAction, isPending] = useActionState<NewTeacherFormState, FormData>(actionAddTeacher, null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const errorState = state && !state.ok ? state : null;
  const fieldErrors = errorState?.fieldErrors ?? {};
  const hasError = !!errorState?.formError;

  useEffect(() => {
    if (hasError) summaryRef.current?.focus();
  }, [hasError, state]);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {hasError && errorState ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 outline-none dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
        >
          {errorState.formError}
        </div>
      ) : null}

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
          Temel bilgiler
        </h2>
        <div className="space-y-3">
          <div>
            <Label>Ad soyad</Label>
            <Input name="name" required placeholder="Örn. Selin Kara" aria-invalid={!!fieldErrors.name} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>E-posta</Label>
              <Input name="email" type="email" placeholder="ogretmen@okul.com" aria-invalid={!!fieldErrors.email} />
              <FieldError message={fieldErrors.email} />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input name="phone" placeholder="05xx xxx xxxx" aria-invalid={!!fieldErrors.phone} />
              <FieldError message={fieldErrors.phone} />
            </div>
          </div>
          <div>
            <Label>T.C. kimlik no (opsiyonel — şifreli saklanır)</Label>
            <Input name="nationalId" inputMode="numeric" maxLength={11} placeholder="11 haneli" aria-invalid={!!fieldErrors.nationalId} />
            <FieldError message={fieldErrors.nationalId} />
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
          Şube, enstrüman ve müsaitlik
        </h2>
        <div className="space-y-3">
          <div>
            <Label>Birincil şube</Label>
            <Select name="branchId" defaultValue={branches[0]?.id} aria-invalid={!!fieldErrors.branchId}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <FieldError message={fieldErrors.branchId} />
          </div>
          {branches.length > 1 ? (
            <div>
              <Label>Ek atanmış şubeler (birincil şube her zaman dahildir)</Label>
              <div className="flex flex-wrap gap-2">
                {branches.map((b) => (
                  <label key={b.id} className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" name="branchIds" value={b.id} className="h-3.5 w-3.5" />
                    {b.name}
                  </label>
                ))}
              </div>
              <FieldError message={fieldErrors.branchIds} />
            </div>
          ) : null}
          <div>
            <Label>Ana enstrüman (yalnızca hiç enstrüman eklenmezse kullanılır)</Label>
            <Select name="instrument" defaultValue={instrumentOptions?.[0] ?? "Piyano"} aria-invalid={!!fieldErrors.instrument}>
              {(instrumentOptions ?? ["Piyano", "Yan Flüt", "Gitar", "Bateri", "Keman", "Şan"]).map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </Select>
            <FieldError message={fieldErrors.instrument} />
          </div>
          <div>
            <Label>Enstrümanlar ve seviyeleri</Label>
            <TeacherInstrumentsField name="instrumentLevelsJson" instrumentOptions={instrumentOptions} />
          </div>
          <div>
            <Label>Haftalık müsaitlik (şube bazlı — opsiyonel)</Label>
            <TeacherAvailabilityField name="availabilityJson" branches={branches} />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Şube seçilmezse pencere tüm şubeler için geçerli sayılır. Daha sonra öğretmen detay ekranından da
              düzenlenebilir.
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

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
          Portal erişimi (opsiyonel)
        </h2>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
            <input type="checkbox" name="inviteToPortal" value="1" />
            Kayıt tamamlanınca portal davet e-postası gönder
          </label>
          <p className="text-xs text-[var(--color-text-muted)]">
            Yukarıdaki e-posta adresine gönderilir. Düz metin şifre asla gönderilmez — öğretmen, e-postadaki tek
            kullanımlık bağlantıyla kendi şifresini oluşturur. İşaretlemezseniz giriş hesabı oluşturulmaz; daveti
            daha sonra öğretmen düzenleme ekranından da gönderebilirsiniz.
          </p>
        </div>
      </Card>

      {state?.ok && state.inviteWarning ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Öğretmen eklendi ancak portal daveti gönderilemedi: {state.inviteWarning}. Daveti öğretmen düzenleme
          ekranından tekrar gönderebilirsiniz.
        </div>
      ) : null}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Ekleniyor…" : "Öğretmen ekle"}
      </Button>
    </form>
  );
}
