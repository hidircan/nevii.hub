"use client";

/**
 * P0-2 (2026-08-29, "Invalid input" runtime hatası düzeltmesi) — bu form
 * ÖNCEDEN `yeni/page.tsx` içinde düz `<form action={actionAddStudent}>`
 * (useActionState YOK) olarak yaşıyordu; herhangi bir doğrulama hatası
 * `actionAddStudent`'ın THROW etmesine ve bunun da yakalanmamış bir sunucu
 * action hatası olarak istemciye "Runtime Error" şeklinde sızmasına yol
 * açıyordu — form KAYBOLUYOR, girilen veriler SİLİNİYORDU.
 *
 * Artık `useActionState` kullanır: `actionAddStudent` normal kullanıcı
 * hatalarında (eksik/geçersiz alan, iş kuralı ihlali) ASLA throw etmez,
 * `NewStudentFormState` döner. React bu durumda formu YENİDEN MONTE ETMEZ —
 * uncontrolled input'ların DOM değerleri KORUNUR, yalnızca hata state'i
 * güncellenir. Alan bazlı hatalar ilgili alanın altında, genel özet üstte
 * (role="alert", odak otomatik taşınır) gösterilir. `isPending` ile submit
 * butonu devre dışı bırakılır — çift submit duplicate kayıt OLUŞTURMAZ.
 */

import { useActionState, useEffect, useRef, useState } from "react";
import { actionAddStudent, type NewStudentFormState } from "@/lib/actions";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { StudentInstrumentTeacherFields, type TeacherOption } from "@/components/student-instrument-teacher-fields";
import { StudentPackagePricingFields, type PricingPackageOption } from "@/components/student-package-pricing-fields";
import { STUDENT_TYPES } from "@/lib/types";
import { estimatePeriodBillingLines, derivePerLessonAmount, referenceMonthlyLessonCount } from "@/lib/period-lesson-billing";

function formatTL(amount: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(
    amount
  );
}

/** Ayın son günü — istemci tarafı önizleme için (sunucudaki asıl hesap `period-lesson-billing.ts`'in AYNISI). */
function monthEndDay(startDay: string): string {
  const [y, m] = startDay.slice(0, 7).split("-").map(Number) as [number, number];
  return `${startDay.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

type BranchOption = { id: string; name: string };
type KvkkTextOption = { version: number; bodyText: string };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs font-medium text-rose-600" role="alert">
      {message}
    </p>
  );
}

export function NewStudentForm({
  branches,
  teachers,
  instrumentOptions,
  packages,
  kvkkText,
}: {
  branches: BranchOption[];
  teachers: TeacherOption[];
  instrumentOptions: string[];
  packages: PricingPackageOption[];
  kvkkText?: KvkkTextOption;
}) {
  const [state, formAction, isPending] = useActionState<NewStudentFormState, FormData>(actionAddStudent, null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const fieldErrors = state?.fieldErrors ?? {};
  const hasError = !!state?.formError;
  // P0-4 — form action'ları başarı/hata fark etmeksizin uncontrolled alanları
  // SIFIRLAR; her alan burada yeniden beslenmezse bir doğrulama hatasında
  // sessizce boşalır. `v(key)` tüm düz metin/select/tarih alanları için TEK
  // kaynak; checkbox'lar `checkedVal` ile ayrıca ele alınır.
  const values = state && "values" in state ? (state.values ?? {}) : {};
  const v = (key: string): string | undefined => values[key];
  const selectedStudentTypes = new Set((values.studentTypes ?? "").split(",").filter(Boolean));
  const checkedVal = (key: string, expected: string): boolean => v(key) === expected;

  // P0-1 (2026-09-02 düzeltme) — ders başı ücret yöneticinin girdiği/seçtiği
  // BİR ALAN DEĞİL: yönetici yalnız aylık ücret + haftalık ders sıklığı
  // girer, ders başı karşılığı salt-okunur bir bilgi kartında GÖSTERİLİR
  // (`derivePerLessonAmount` — sunucudaki `createStudentTool`'un kullandığı
  // AYNI saf fonksiyon). Formun geri kalanı bilinçli olarak uncontrolled
  // kaldığı için (bkz. üstteki not) bu alanları ayrıca controlled state'e
  // ALMAK yerine, `<form>` seviyesinde `onInput` ile her değişiklikte
  // `FormData` okunup yeniden hesaplanır.
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<{
    monthlyFee: number;
    weeklyLessonCount: number;
    referenceCount: number;
    derivedPerLessonAmount: number;
    firstPeriodPlannedLessons: number;
    firstPeriodSuggestedAmount: number;
  } | null>(null);

  function recomputePreview() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const monthlyFee = Number(fd.get("monthlyFee") || 0);
    const weeklyLessonCount = Number(fd.get("weeklyLessonCount") || 0);
    const startDay = String(fd.get("enrollmentStartDate") || "") || new Date().toISOString().slice(0, 10);
    if (!Number.isInteger(monthlyFee) || monthlyFee <= 0 || weeklyLessonCount <= 0) {
      setPreview(null);
      return;
    }
    try {
      const derived = derivePerLessonAmount(monthlyFee, weeklyLessonCount);
      const lines = estimatePeriodBillingLines({
        enrollmentStartDay: startDay,
        enrollmentEndDay: monthEndDay(startDay),
        perLessonNetFee: derived,
        weeklyLessonCount,
      });
      setPreview({
        monthlyFee,
        weeklyLessonCount,
        referenceCount: referenceMonthlyLessonCount(weeklyLessonCount),
        derivedPerLessonAmount: derived,
        firstPeriodPlannedLessons: lines[0]?.billableLessonCount ?? 0,
        firstPeriodSuggestedAmount: lines[0]?.autoCalculatedAmount ?? 0,
      });
    } catch {
      setPreview(null);
    }
  }

  // İlk mont'ta (ör. hatalı bir gönderimden dönen `state.values` ile) da hesapla.
  useEffect(() => {
    recomputePreview();
  }, []);

  const firstPeriodAutoAmount = preview?.firstPeriodSuggestedAmount;

  useEffect(() => {
    if (hasError) summaryRef.current?.focus();
  }, [hasError, state]);

  return (
    <form ref={formRef} action={formAction} onInput={recomputePreview} onChange={recomputePreview} className="space-y-6" noValidate>
      {hasError ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 outline-none dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
        >
          {state!.formError}
        </div>
      ) : null}

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
          Öğrenci türü
        </h2>
        <div className="space-y-3">
          <div>
            <Label>Öğrenci türü (opsiyonel, birden fazla seçilebilir)</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {STUDENT_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-sm text-[var(--color-text)]">
                  <input type="checkbox" name="studentTypes" value={t} defaultChecked={selectedStudentTypes.has(t)} />
                  {t}
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              Öğrencinin bağlı olduğu akademik program/kurum türü — paket önerisi ve raporlamayı etkiler.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
          Temel bilgiler
        </h2>
        <div className="space-y-3">
          <div>
            <Label>Ad soyad</Label>
            <Input name="name" required defaultValue={v("name")} placeholder="Örn. Deniz Ak" aria-invalid={!!fieldErrors.name} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label>T.C. kimlik no (opsiyonel — şifreli saklanır)</Label>
            <Input name="nationalId" defaultValue={v("nationalId")} inputMode="numeric" maxLength={11} placeholder="11 haneli" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Anne adı (opsiyonel)</Label>
              <Input name="motherName" defaultValue={v("motherName")} placeholder="Anne adı" />
            </div>
            <div>
              <Label>Baba adı (opsiyonel)</Label>
              <Input name="fatherName" defaultValue={v("fatherName")} placeholder="Baba adı" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Veli adı</Label>
              <Input name="parentName" defaultValue={v("parentName")} placeholder="Veli adı" aria-invalid={!!fieldErrors.parentName} />
              <FieldError message={fieldErrors.parentName} />
            </div>
            <div>
              <Label>Veli telefon</Label>
              <Input name="parentPhone" defaultValue={v("parentPhone")} placeholder="05xx xxx xxxx" aria-invalid={!!fieldErrors.parentPhone} />
              <FieldError message={fieldErrors.parentPhone} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Öğrenci e-posta</Label>
              <Input name="email" type="email" defaultValue={v("email")} placeholder="ogrenci@email.com" aria-invalid={!!fieldErrors.email} />
              <FieldError message={fieldErrors.email} />
            </div>
            <div>
              <Label>Öğrenci telefon</Label>
              <Input name="phone" defaultValue={v("phone")} placeholder="05xx xxx xxxx" aria-invalid={!!fieldErrors.phone} />
              <FieldError message={fieldErrors.phone} />
            </div>
          </div>
          <div>
            <Label>Ödeme/iletişim muhatabı</Label>
            <Select name="accountResponsibility" defaultValue={v("accountResponsibility") || "PARENT_MANAGED"}>
              <option value="PARENT_MANAGED">Veli (varsayılan)</option>
              <option value="SELF_MANAGED">Öğrencinin kendisi</option>
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
          Portal erişimi (opsiyonel)
        </h2>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
            <input type="checkbox" name="inviteToPortal" value="1" defaultChecked={checkedVal("inviteToPortal", "1")} />
            Kayıt tamamlanınca portal davet e-postası gönder
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Davet edilecek</Label>
              <Select name="invitePortalAccessType" defaultValue={v("invitePortalAccessType") || "GUARDIAN"}>
                <option value="GUARDIAN">Veli</option>
                <option value="SELF">Öğrencinin kendisi</option>
              </Select>
            </div>
            <div>
              <Label>Davet e-postası</Label>
              <Input name="invitePortalEmail" type="email" defaultValue={v("invitePortalEmail")} placeholder="veli@email.com" />
            </div>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Düz metin şifre asla gönderilmez — alıcı, e-postadaki tek kullanımlık bağlantıyla kendi şifresini
            oluşturur. İşaretlemezseniz giriş hesabı oluşturulmaz; daveti daha sonra öğrenci düzenleme ekranından da
            gönderebilirsiniz.
          </p>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
          Kişisel bilgiler
        </h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Doğum tarihi (opsiyonel)</Label>
              <Input name="birthDate" type="date" defaultValue={v("birthDate")} />
            </div>
            <div>
              <Label>Doğum yeri (opsiyonel)</Label>
              <Input name="birthPlace" defaultValue={v("birthPlace")} placeholder="Örn. İzmir" />
            </div>
          </div>
          <div>
            <Label>Okulu / mesleği (opsiyonel)</Label>
            <Input name="schoolOrOccupation" defaultValue={v("schoolOrOccupation")} placeholder="Örn. Erzene İlkokulu 3-A" />
          </div>
          <div>
            <Label>Ev adresi (opsiyonel)</Label>
            <Input name="address" defaultValue={v("address")} placeholder="Opsiyonel" />
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
            <Select name="branchId" defaultValue={v("branchId") || branches[0]?.id} aria-invalid={!!fieldErrors.branchId}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <FieldError message={fieldErrors.branchId} />
          </div>
          <StudentInstrumentTeacherFields
            instrumentOptions={instrumentOptions}
            teachers={teachers}
            defaultInstrument={v("instrument")}
            defaultTeacherId={v("teacherId")}
          />
          <FieldError message={fieldErrors.instrument ?? fieldErrors.teacherId} />
          <div>
            <Label>Haftalık ders sıklığı</Label>
            <Select
              name="weeklyLessonCount"
              defaultValue={state && "values" in state && state.values?.weeklyLessonCount ? state.values.weeklyLessonCount : "1"}
              aria-invalid={!!fieldErrors.weeklyLessonCount}
            >
              <option value="1">Haftada 1 ders</option>
              <option value="2">Haftada 2 ders</option>
            </Select>
            <FieldError message={fieldErrors.weeklyLessonCount} />
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
          Kayıt süresi
        </h2>
        <div className="space-y-3">
          <div>
            <Label>Kayıt süresi (ay)</Label>
            <Select name="intendedDurationMonths" defaultValue={v("intendedDurationMonths") || "3"}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                <option key={month} value={month}>
                  {month} Aylık Kayıt {month <= 2 ? "(Tanışma)" : "(Formal sözleşme)"}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              1–2 ay Tanışma paketidir, öğrenci kayıt detayında kalır. 3–12 ay Formal sözleşme akışına
              (Sözleşme Merkezi) yönlendirir ve süre orada ön-dolu gelir; kesin süre sözleşme ekranında
              onaylanır.
            </p>
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
            <Input
              name="packageName"
              defaultValue={v("packageName") || "Bireysel Aylık — 4 ders"}
              aria-invalid={!!fieldErrors.packageName}
            />
            <FieldError message={fieldErrors.packageName} />
          </div>
          <StudentPackagePricingFields
            packages={packages}
            initialPackageId={state && "values" in state ? state.values?.packageId : undefined}
            initialDuration={
              state && "values" in state && state.values?.lessonDurationMinutes
                ? Number(state.values.lessonDurationMinutes)
                : undefined
            }
            initialDiscountType={
              state && "values" in state && (state.values?.discountType === "percent" || state.values?.discountType === "amount")
                ? state.values.discountType
                : undefined
            }
            initialDiscountValue={state && "values" in state ? state.values?.discountValue : undefined}
            initialMonthlyFee={
              state && "values" in state && state.values?.monthlyFee ? Number(state.values.monthlyFee) : undefined
            }
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Ödeme türü (opsiyonel)</Label>
              <Select name="paymentMethod" defaultValue={v("paymentMethod") || ""}>
                <option value="">Belirtilmemiş</option>
                <option value="cash">Nakit</option>
                <option value="transfer">Havale</option>
                <option value="credit_card">Kredi Kartı</option>
              </Select>
            </div>
            <div>
              <Label>Ödeme günü kuralı</Label>
              <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
                Kredi kartı: her ayın 1–5&apos;i. Havale/EFT/nakit: her ayın 1–15&apos;i. Kurum politikasıdır,
                öğrenci bazında değiştirilemez.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
          Ders başı hesap karşılığı (bilgi amaçlı)
        </h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          Bu alanı siz girmezsiniz — yukarıdaki aylık ücret ve haftalık ders sıklığından sistem otomatik
          hesaplar. Yalnız fiilen tahsil ettiğiniz tutarı aşağıdaki &quot;İlk Ödeme&quot; bölümünde teyit
          edersiniz.
        </p>
        {preview ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-[var(--color-text-muted)]">Aylık referans ücret</dt>
              <dd className="font-semibold text-[var(--color-text)]">{formatTL(preview.monthlyFee)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-text-muted)]">Haftalık ders sıklığı</dt>
              <dd className="font-semibold text-[var(--color-text)]">{preview.weeklyLessonCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-text-muted)]">Referans aylık ders adedi</dt>
              <dd className="font-semibold text-[var(--color-text)]">{preview.referenceCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-text-muted)]">Sistem ders başı hesap karşılığı</dt>
              <dd className="font-semibold text-[var(--color-text)]">{formatTL(preview.derivedPerLessonAmount)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-text-muted)]">Bu ilk dönemde planlanan ders</dt>
              <dd className="font-semibold text-[var(--color-text)]">{preview.firstPeriodPlannedLessons}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-text-muted)]">Sistem önerilen ilk tahsilat</dt>
              <dd className="font-semibold text-[var(--color-text)]">{formatTL(preview.firstPeriodSuggestedAmount)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">
            Aylık ücret ve haftalık ders sıklığı girildiğinde burada otomatik hesap gösterilir.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
          İlk Ödeme / Kayıt Anı Tahsilatı
        </h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          Owner politikası: ilk ödeme kayıt sırasında (ay içindeki günden bağımsız) tahsil edilmeden kayıt
          tamamlanamaz. Tutar otomatik önerilenle aynıysa gerekçe istenmez; farklı bir net tutar girerseniz
          gerekçe zorunludur ve fark audit kaydına yazılır.
        </p>
        <div className="space-y-3">
          {firstPeriodAutoAmount !== undefined ? (
            <p className="rounded-lg border border-cyan-200 bg-cyan-50/70 px-3 py-2 text-xs font-medium text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
              Sistem önerilen ilk tahsilat: <strong>{formatTL(firstPeriodAutoAmount)}</strong> — fiilen farklı bir
              tutar tahsil ettiyseniz onu girin, aşağıya gerekçe yazın.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Ödeme yöntemi</Label>
              <Select
                name="firstPaymentMethod"
                defaultValue={v("firstPaymentMethod") || ""}
                required
                aria-invalid={!!fieldErrors.firstPaymentCollected}
              >
                <option value="">Seçiniz</option>
                <option value="cash">Nakit</option>
                <option value="transfer">Havale/EFT</option>
                <option value="credit_card">Kredi Kartı</option>
              </Select>
            </div>
            <div>
              <Label>Tahsil edilen tutar (TL)</Label>
              <Input
                name="firstPaymentAmount"
                inputMode="numeric"
                pattern="[0-9]*"
                defaultValue={v("firstPaymentAmount")}
                placeholder={firstPeriodAutoAmount !== undefined ? String(firstPeriodAutoAmount) : "Örn. 3000"}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Tahsilat tarihi</Label>
              <Input name="firstPaymentDate" type="date" defaultValue={v("firstPaymentDate")} required />
            </div>
            <div>
              <Label>Dekont / referans no (varsa)</Label>
              <Input name="firstPaymentReference" defaultValue={v("firstPaymentReference")} placeholder="Opsiyonel" />
            </div>
          </div>
          <div>
            <Label>Tahsilat notu (opsiyonel)</Label>
            <Input name="firstPaymentNote" defaultValue={v("firstPaymentNote")} placeholder="Opsiyonel" />
          </div>
          <div>
            <Label>Düzeltme gerekçesi (yalnız tutar otomatik önerilenden farklıysa zorunlu)</Label>
            <Input
              name="firstPaymentAdjustmentReason"
              defaultValue={v("firstPaymentAdjustmentReason")}
              placeholder="Örn. Aile maddi zorluk, yönetici onayı"
              aria-invalid={!!fieldErrors.firstPaymentAdjustmentReason}
            />
            <FieldError message={fieldErrors.firstPaymentAdjustmentReason} />
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
            <Select name="termType" defaultValue={v("termType") || "guz"}>
              <option value="guz">Güz Dönemi</option>
              <option value="yaz">Yaz Dönemi</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Kayıt başlangıç tarihi (opsiyonel)</Label>
              <Input name="enrollmentStartDate" type="date" defaultValue={v("enrollmentStartDate")} />
            </div>
            <div>
              <Label>Seviye (opsiyonel)</Label>
              <Input name="level" defaultValue={v("level")} placeholder="Örn. Başlangıç, Orta, İleri" />
            </div>
          </div>
          <div>
            <Label>Hedef sınav / performans dönemi (opsiyonel)</Label>
            <Input name="targetExam" defaultValue={v("targetExam")} placeholder="Örn. 2027 Konservatuvar giriş sınavı" />
          </div>
          <div>
            <Label>Not</Label>
            <Input name="notes" defaultValue={v("notes")} placeholder="Opsiyonel" />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="social-media-consent"
              type="checkbox"
              name="socialMediaConsent"
              value="granted"
              defaultChecked={checkedVal("socialMediaConsent", "granted")}
              className="h-4 w-4"
            />
            <label htmlFor="social-media-consent" className="text-sm text-[var(--color-text)]">
              Sosyal medya paylaşım izni var
            </label>
          </div>
          {kvkkText ? (
            <div className="rounded-lg border border-[var(--color-border)] p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                KVKK Açık Rıza Metni (v{kvkkText.version})
              </p>
              <p className="mb-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-[var(--color-text-muted)]">
                {kvkkText.bodyText}
              </p>
              <div className="flex items-center gap-2">
                <input
                  id="kvkk-consent"
                  type="checkbox"
                  name="kvkkConsent"
                  value="granted"
                  defaultChecked={checkedVal("kvkkConsent", "granted")}
                  className="h-4 w-4"
                />
                <label htmlFor="kvkk-consent" className="text-sm text-[var(--color-text)]">
                  Veli/vasi yukarıdaki KVKK aydınlatma/açık rıza metnini okudu, onaylıyor
                </label>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Ekleniyor…" : "Öğrenci ekle"}
      </Button>
    </form>
  );
}
