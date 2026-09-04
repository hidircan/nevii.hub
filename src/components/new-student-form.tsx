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
import {
  estimatePeriodBillingLines,
  derivePerLessonAmount,
  referenceMonthlyLessonCount,
  countExactWeekdayLessons,
} from "@/lib/period-lesson-billing";

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

/** P0-C — `Date.getUTCDay()` ile aynı 0=Pazar..6=Cumartesi kodlaması (kodda zaten yaygın `dayOfWeek` konvansiyonu). */
const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Pazartesi" },
  { value: 2, label: "Salı" },
  { value: 3, label: "Çarşamba" },
  { value: 4, label: "Perşembe" },
  { value: 5, label: "Cuma" },
  { value: 6, label: "Cumartesi" },
  { value: 0, label: "Pazar" },
];

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs font-medium text-rose-600" role="alert">
      {message}
    </p>
  );
}

/** P0-C — tüm zorunlu alan etiketlerinde AYNI görsel işaretçi (kırmızı `*`, ekran okuyucu için erişilebilir). */
function RequiredMark() {
  return (
    <span className="text-rose-600" aria-hidden="true">
      {" "}
      *
    </span>
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
    /** P0-C — true ise `firstPeriodPlannedLessons` seçilen GERÇEK ders günlerinden kesin sayıldı, projeksiyon DEĞİL. */
    lessonsAreExact: boolean;
  } | null>(null);
  // P0-B (2026-09-02) — kayıt esnasında fiilen girilen tutarı CANLI izler
  // (sistem önerisiyle karşılaştırıp "Fark" satırını göstermek için).
  const [enteredFirstPayment, setEnteredFirstPayment] = useState<number | undefined>(() => {
    const raw = v("firstPaymentAmount");
    return raw ? Number(raw.replace(/[^\d]/g, "")) : undefined;
  });
  // P0-C — seçilen ders günlerini CANLI izler (weeklyLessonCount ile
  // TAM/TEKİL eşleşmesini göstermek ve önizlemeyi GERÇEK günlerle
  // yeniden hesaplamak için).
  const [selectedLessonDays, setSelectedLessonDays] = useState<number[]>(() =>
    (values.lessonDays ?? "")
      .split(",")
      .filter(Boolean)
      .map(Number)
  );
  // P0-D (2026-09-02) — öğrenci e-postasını ve portal erişim türünü CANLI
  // izler: "Öğrencinin kendisi" seçiliyken davet e-postası alanı öğrenci
  // e-postasıyla SENKRON kalır, kullanıcı aynı e-postayı iki kez yazmaz.
  const [studentEmailLive, setStudentEmailLive] = useState(() => v("email") ?? "");
  const [portalAccessType, setPortalAccessType] = useState(() => v("invitePortalAccessType") || "GUARDIAN");
  const [inviteToPortalChecked, setInviteToPortalChecked] = useState(() => checkedVal("inviteToPortal", "1"));
  // Varsayılan: öğrenci e-postasını OTOMATİK kullan. Yalnız önceki bir
  // gönderimde (hata sonrası) fiilen FARKLI bir davet e-postası girilmişse
  // (bilinçli bir override'ın kanıtı) override açık başlar — aksi halde
  // kullanıcının az önce yazdığı farklı e-posta sessizce öğrenci
  // e-postasıyla EZİLİR.
  const [useDifferentPortalEmail, setUseDifferentPortalEmail] = useState(
    () => portalAccessType === "SELF" && !!v("invitePortalEmail") && v("invitePortalEmail") !== v("email")
  );

  function recomputePreview() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const monthlyFee = Number(fd.get("monthlyFee") || 0);
    const weeklyLessonCount = Number(fd.get("weeklyLessonCount") || 0);
    const startDay = String(fd.get("enrollmentStartDate") || "") || new Date().toISOString().slice(0, 10);
    const firstPaymentRaw = String(fd.get("firstPaymentAmount") || "").replace(/[^\d]/g, "");
    setEnteredFirstPayment(firstPaymentRaw ? Number(firstPaymentRaw) : undefined);
    const lessonDays = fd.getAll("lessonDays").map(Number);
    setSelectedLessonDays(lessonDays);
    setStudentEmailLive(String(fd.get("email") || ""));
    setPortalAccessType(String(fd.get("invitePortalAccessType") || "GUARDIAN"));
    setInviteToPortalChecked(fd.get("inviteToPortal") === "1");
    if (!Number.isInteger(monthlyFee) || monthlyFee <= 0 || weeklyLessonCount <= 0) {
      setPreview(null);
      return;
    }
    try {
      const derived = derivePerLessonAmount(monthlyFee, weeklyLessonCount);
      const endDay = monthEndDay(startDay);
      const lines = estimatePeriodBillingLines({
        enrollmentStartDay: startDay,
        enrollmentEndDay: endDay,
        perLessonNetFee: derived,
        weeklyLessonCount,
      });
      // P0-C — TAM OLARAK weeklyLessonCount kadar GERÇEK gün seçildiyse
      // (ör. haftada 2 ders için 2 farklı gün), projeksiyon yerine o
      // günlerin ilk dönem içinde KAÇ KEZ geçtiğini TAM sayarak daha
      // isabetli bir önizleme gösterilir — sunucudaki resmi
      // `autoSuggestedAmount` hesabını DEĞİŞTİRMEZ, yalnız istemci
      // önizlemesini iyileştirir (bkz. period-lesson-billing.ts yorumu).
      const hasExactDays = lessonDays.length === weeklyLessonCount && new Set(lessonDays).size === weeklyLessonCount;
      const exactCount = hasExactDays ? countExactWeekdayLessons(startDay, lines[0]?.periodEnd ?? endDay, lessonDays) : null;
      const plannedLessons = exactCount ?? lines[0]?.billableLessonCount ?? 0;
      // P0 (2026-09-03) — "3 ders eşiği": sunucudaki (createStudentTool)
      // AYNI kural — kayıt ayında kalan gerçek ders sayısı 3'ten azsa
      // sonraki ayın tam ücreti de öneriye eklenir. Tek kaynak sunucudur;
      // burası yalnız İSTEMCİ önizlemesi, resmi hesap değildir.
      const suggestedAmount = plannedLessons >= 3 ? plannedLessons * derived : plannedLessons * derived + monthlyFee;
      setPreview({
        monthlyFee,
        weeklyLessonCount,
        referenceCount: referenceMonthlyLessonCount(weeklyLessonCount),
        derivedPerLessonAmount: derived,
        firstPeriodPlannedLessons: plannedLessons,
        firstPeriodSuggestedAmount: suggestedAmount,
        lessonsAreExact: hasExactDays,
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
  // P0-B — yalnız İKİSİ de bilinip GERÇEKTEN farklıysa "düzeltme" durumu.
  const hasFirstPaymentMismatch =
    firstPeriodAutoAmount !== undefined &&
    enteredFirstPayment !== undefined &&
    enteredFirstPayment !== firstPeriodAutoAmount;

  // P0-A (2026-09-02) — GERÇEK kök neden (react-dom kaynağından doğrulandı,
  // bkz. `updateOptions`/`postMountWrapper` react-dom-client.development.js):
  // React 19 form action'ları tamamlandığında (başarı/hata fark etmeksizin)
  // native `<form>.reset()` çağırır. Metin `<input>`larında ZARARSIZDIR
  // (`.defaultValue` gerçekten `value` İÇERİK ATTRIBUTE'unu yansıtır, reset
  // doğru değere döner). AMA `<select>` için React eşleşen `<option>`'a
  // YALNIZ `.selected` IDL PROPERTY'sini yazar — `.defaultSelected`/`selected`
  // İÇERİK ATTRIBUTE'unu ASLA yazmaz — bu, controlled/uncontrolled/`key` ile
  // yeniden-mount fark etmeksizin GEÇERLİDİR (yeniden mount edilen bir
  // <select> bile, taze DOM node'unda AYNI eksik-attribute sorununu taşır).
  // Sonuç: tarayıcının native reset() algoritması hiçbir option'da
  // `defaultSelected` bulamaz ve HER ZAMAN ilk option'a ("Piyano" vb.) döner
  // — React'ın KENDİ state'i (ör. `instrument`) hâlâ doğru değeri bilir,
  // yalnız GÖRÜNEN DOM/bir sonraki submit'te taşınacak FormData yanlış olur.
  // `key` ile yeniden-mount denemesi (önceki deneme) BU YÜZDEN işe yaramadı.
  // Tek güvenilir çözüm: reset SONRASI, formdaki HER `<select>`/`<input>`ın
  // DOM değerini son GERÇEKTEN gönderilen `values`'tan (submit anında,
  // reset'ten ÖNCE `captureStudentFormValues` ile yakalanan FormData —
  // bkz. actions.ts) doğrudan DOM üzerinden GERİ YAZMAK. Tek noktadan tüm
  // alanlar için (yalnız enstrüman değil — aynı kusur `branchId`/`termType`/
  // `firstPaymentMethod`/`packageId`/`discountType` vb. HER <select>'i
  // etkiler), hidden/checkbox/radio hariç.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    for (const el of Array.from(form.elements)) {
      if (!(el instanceof HTMLSelectElement || el instanceof HTMLInputElement)) continue;
      if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio" || el.type === "hidden")) {
        continue;
      }
      if (!el.name || !(el.name in values)) continue;
      const wanted = values[el.name];
      if (wanted !== undefined && el.value !== wanted) el.value = wanted;
    }
    // `values` bilerek deps dışı: bu efekt yalnız server action `state`
    // DEĞİŞTİĞİNDE (reset sonrası DOM'u son gönderilen değerlere geri
    // yazmak için) çalışmalı — her tuş vuruşunda `values` değiştiğinde
    // YENİDEN çalışırsa kullanıcı yazarken DOM'a müdahale eder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (hasError) summaryRef.current?.focus();
  }, [hasError, state]);

  // P0-C (2026-09-02) — üstteki genel özet ("Formda düzeltilmesi gereken
  // alanlar var") ODAKLANIR ama HANGİ alanın hatalı olduğunu göstermez;
  // kullanıcı formu elle kaydırıp bulmak zorunda kalıyordu. Alan-bazlı bir
  // hata varsa (ör. "İlk ödeme türü seçilmelidir", "Kayıt başlangıç tarihi
  // zorunludur") ilgili form kontrolüne (native `form.elements.namedItem` —
  // `name` ile eşleşen HERHANGİ bir alan/alan grubu için çalışır, ayrı ref
  // gerektirmez) otomatik kaydırılıp odaklanılır.
  useEffect(() => {
    const errorKeys = Object.keys(fieldErrors);
    const form = formRef.current;
    if (errorKeys.length === 0 || !form) return;
    for (const key of errorKeys) {
      const el = form.elements.namedItem(key);
      const target = el instanceof RadioNodeList ? el[0] : el;
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.focus({ preventScroll: true });
        break;
      }
    }
    // `fieldErrors` bilerek deps dışı: aynı `state`ten türetilir, yalnız
    // `state` değiştiğinde (yeni submit sonucu) bir kez kaydırıp odaklanmalı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

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

      {/* 1. Temel Bilgiler — Öğrenci türü + Temel bilgiler + (eski ayrı "Kişisel bilgiler" başlığı KALDIRILDI, alanları buraya taşındı, yinelenmedi). */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
          Temel Bilgiler
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
          <div>
            <Label>
              Ad soyad
              <RequiredMark />
            </Label>
            <Input name="name" required aria-required defaultValue={v("name")} placeholder="Örn. Deniz Ak" aria-invalid={!!fieldErrors.name} />
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
              <Label>
                Veli adı
                <RequiredMark />
              </Label>
              <Input
                name="parentName"
                required
                aria-required
                defaultValue={v("parentName")}
                placeholder="Veli adı"
                aria-invalid={!!fieldErrors.parentName}
              />
              <FieldError message={fieldErrors.parentName} />
            </div>
            <div>
              <Label>
                Veli telefon
                <RequiredMark />
              </Label>
              <Input
                name="parentPhone"
                required
                aria-required
                defaultValue={v("parentPhone")}
                placeholder="05xx xxx xxxx"
                aria-invalid={!!fieldErrors.parentPhone}
              />
              <FieldError message={fieldErrors.parentPhone} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Öğrenci e-posta (opsiyonel)</Label>
              <Input name="email" type="email" defaultValue={v("email")} placeholder="ogrenci@email.com" aria-invalid={!!fieldErrors.email} />
              <FieldError message={fieldErrors.email} />
            </div>
            <div>
              <Label>
                Öğrenci telefon
                <RequiredMark />
              </Label>
              <Input
                name="phone"
                required
                aria-required
                defaultValue={v("phone")}
                placeholder="05xx xxx xxxx"
                aria-invalid={!!fieldErrors.phone}
              />
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
          <div>
            <Label>
              Şube
              <RequiredMark />
            </Label>
            <Select
              name="branchId"
              required
              aria-required
              defaultValue={v("branchId") || branches[0]?.id}
              aria-invalid={!!fieldErrors.branchId}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <FieldError message={fieldErrors.branchId} />
          </div>
        </div>
      </Card>

      {/* 2. Akademik Bilgiler — enstrüman/öğretmen BURADA, Temel Bilgiler'den hemen sonra; enstrüman burada değiştirilebilir (bkz. P0-A). Şube idari bir alan olduğu için Temel Bilgiler'e taşındı (2026-09-05). */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
          Akademik Bilgiler
        </h2>
        <div className="space-y-3">
          <div>
            <Label>
              Enstrüman / Öğretmen
              <RequiredMark />
            </Label>
            <StudentInstrumentTeacherFields
              instrumentOptions={instrumentOptions}
              teachers={teachers}
              defaultInstrument={v("instrument")}
              defaultTeacherId={v("teacherId")}
            />
          </div>
          <FieldError message={fieldErrors.instrument ?? fieldErrors.teacherId} />
          <div>
            <Label>Yoklama Takvimi dönemi</Label>
            <Select name="termType" defaultValue={v("termType") || "guz"}>
              <option value="guz">Güz Dönemi</option>
              <option value="yaz">Yaz Dönemi</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>
                Kayıt başlangıç tarihi
                <RequiredMark />
              </Label>
              <Input
                name="enrollmentStartDate"
                type="date"
                required
                aria-required
                defaultValue={v("enrollmentStartDate")}
                aria-invalid={!!fieldErrors.enrollmentStartDate}
              />
              <FieldError message={fieldErrors.enrollmentStartDate} />
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
            <Label>Not (opsiyonel)</Label>
            <Input name="notes" defaultValue={v("notes")} placeholder="Opsiyonel" />
          </div>
        </div>
      </Card>

      {/* 3. Ders Planı ve Ücretlendirme — haftalık ders sayısı, gerekli ders günleri, süre, paket/ücret, ders başı hesap karşılığı (bilgi amaçlı) hep burada. */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
          Ders Planı ve Ücretlendirme
        </h2>
        <div className="space-y-3">
          <div>
            <Label>
              Haftalık ders sıklığı
              <RequiredMark />
            </Label>
            <Select
              name="weeklyLessonCount"
              required
              aria-required
              defaultValue={state && "values" in state && state.values?.weeklyLessonCount ? state.values.weeklyLessonCount : "1"}
              aria-invalid={!!fieldErrors.weeklyLessonCount}
            >
              <option value="1">Haftada 1 ders</option>
              <option value="2">Haftada 2 ders</option>
            </Select>
            <FieldError message={fieldErrors.weeklyLessonCount} />
          </div>
          <div>
            <Label>
              Ders günleri (haftalık ders sayısı kadar farklı gün seçin)
              <RequiredMark />
            </Label>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {WEEKDAY_OPTIONS.map((d) => (
                <label key={d.value} className="flex items-center gap-1.5 text-sm text-[var(--color-text)]">
                  <input
                    type="checkbox"
                    name="lessonDays"
                    value={d.value}
                    defaultChecked={selectedLessonDays.includes(d.value)}
                    aria-invalid={!!fieldErrors.lessonDays}
                  />
                  {d.label}
                </label>
              ))}
            </div>
            <FieldError message={fieldErrors.lessonDays} />
          </div>
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
          <div>
            <Label>Paket (serbest metin — geçmişle uyum için)</Label>
            <Input
              name="packageName"
              defaultValue={v("packageName") || "Bireysel Aylık — 4 ders"}
              aria-invalid={!!fieldErrors.packageName}
            />
            <FieldError message={fieldErrors.packageName} />
          </div>
          {/* P0-A deseniyle AYNI: gönderim sonrası (başarı/hata fark etmeksizin) DOM
              değerlerini geri yazan genel `useEffect` (yukarıda, [state] deps) zaten
              packageId/discountType/discountValue/monthlyFee alanlarını KAPSAR (isim
              eşleşmesiyle çalışır) — burada AYRI bir initial-value prop mekanizması
              kurmak AYNI düzeltmeyi iki kez uygulamak olurdu, tek kaynak korunur. */}
          <StudentPackagePricingFields packages={packages} />
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
          <div className="border-t border-[var(--color-border)] pt-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Ders başı hesap karşılığı (bilgi amaçlı)
            </h3>
            <p className="mb-3 text-xs text-[var(--color-text-muted)]">
              Bu alanı siz girmezsiniz — yukarıdaki aylık ücret ve haftalık ders sıklığından sistem otomatik
              hesaplar. Yalnız fiilen tahsil ettiğiniz tutarı aşağıdaki &quot;İlk Ödeme&quot; bölümünde teyit
              edersiniz.
            </p>
            {preview ? (
              <>
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
                    <dt className="text-xs text-[var(--color-text-muted)]">
                      Bu ilk dönemde planlanan ders {preview.lessonsAreExact ? "(kesin)" : "(tahmini)"}
                    </dt>
                    <dd className="font-semibold text-[var(--color-text)]">{preview.firstPeriodPlannedLessons}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--color-text-muted)]">Sistem önerilen ilk tahsilat</dt>
                    <dd className="font-semibold text-[var(--color-text)]">{formatTL(preview.firstPeriodSuggestedAmount)}</dd>
                  </div>
                </dl>
                {!preview.lessonsAreExact ? (
                  <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                    Bu bir tahmindir — kesinleşmesi için ders günlerini seçin.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-[var(--color-text-muted)]">
                Aylık ücret ve haftalık ders sıklığı girildiğinde burada otomatik hesap gösterilir.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* 4. İlk Ödeme */}
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
          {/* P0-B (2026-09-02) — fiili tutar sistem önerisinden farklı girildiğinde
              CANLI fark dökümü (Sistem önerisi / Fiili tahsilat / Fark). */}
          {hasFirstPaymentMismatch ? (
            <div
              role="status"
              className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
            >
              <div className="flex items-center justify-between">
                <span>Sistem önerisi</span>
                <span className="font-semibold">{formatTL(firstPeriodAutoAmount!)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Fiili tahsilat</span>
                <span className="font-semibold">{formatTL(enteredFirstPayment!)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-amber-300/60 pt-1 dark:border-amber-800/60">
                <span>Fark</span>
                <span className="font-semibold">
                  {enteredFirstPayment! - firstPeriodAutoAmount! > 0 ? "+" : ""}
                  {formatTL(enteredFirstPayment! - firstPeriodAutoAmount!)}
                </span>
              </div>
              <p className="pt-1">Tutar farklı olduğundan aşağıdaki düzeltme gerekçesi zorunludur.</p>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>
                Ödeme yöntemi
                <RequiredMark />
              </Label>
              <Select
                name="firstPaymentMethod"
                defaultValue={v("firstPaymentMethod") || ""}
                required
                aria-required
                aria-invalid={!!fieldErrors.firstPaymentMethod || !!fieldErrors.firstPaymentCollected}
              >
                <option value="">Seçiniz</option>
                <option value="cash">Nakit</option>
                <option value="transfer">Havale/EFT</option>
                <option value="credit_card">Kredi Kartı</option>
              </Select>
              <FieldError message={fieldErrors.firstPaymentMethod} />
            </div>
            <div>
              <Label>
                Tahsil edilen tutar (TL)
                <RequiredMark />
              </Label>
              <Input
                name="firstPaymentAmount"
                inputMode="numeric"
                pattern="[0-9]*"
                defaultValue={v("firstPaymentAmount")}
                placeholder={firstPeriodAutoAmount !== undefined ? String(firstPeriodAutoAmount) : "Örn. 3000"}
                required
                aria-required
                aria-invalid={!!fieldErrors.firstPaymentCollected}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>
                Tahsilat tarihi
                <RequiredMark />
              </Label>
              <Input name="firstPaymentDate" type="date" defaultValue={v("firstPaymentDate")} required aria-required />
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
            <Label>
              Düzeltme gerekçesi (yalnız tutar otomatik önerilenden farklıysa zorunlu)
              {hasFirstPaymentMismatch ? <RequiredMark /> : null}
            </Label>
            <Input
              name="firstPaymentAdjustmentReason"
              defaultValue={v("firstPaymentAdjustmentReason")}
              placeholder="Örn. Aile maddi zorluk, yönetici onayı"
              required={hasFirstPaymentMismatch}
              aria-required={hasFirstPaymentMismatch}
              aria-invalid={!!fieldErrors.firstPaymentAdjustmentReason}
            />
            <FieldError message={fieldErrors.firstPaymentAdjustmentReason} />
          </div>
        </div>
      </Card>

      {/* 5. Sözleşme / KVKK / Fotoğraf-Video (varsa) */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
          Sözleşme / KVKK / Fotoğraf-Video İzni
        </h2>
        <div className="space-y-3">
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
              Sosyal medya paylaşım (fotoğraf/video) izni var
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

      {/* 6. Portal Erişimi — SPESİFİK OLARAK en altta (P0-C). */}
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
              {/* P0-D (2026-09-02) — "Öğrencinin kendisi" seçiliyken (SELF) ve
                  kullanıcı bilinçli olarak "Farklı e-posta" DEMEDİYSE, bu alan
                  yukarıdaki öğrenci e-postasıyla OTOMATİK senkron kalır —
                  kullanıcı aynı e-postayı iki kez yazmak ZORUNDA kalmaz.
                  `readOnly` (disabled DEĞİL) — form submit'inde değeri yine
                  gönderilir. Veli (GUARDIAN) modunda davranış DEĞİŞMEDİ. */}
              {portalAccessType === "SELF" && !useDifferentPortalEmail ? (
                <Input
                  name="invitePortalEmail"
                  type="email"
                  value={studentEmailLive}
                  readOnly
                  placeholder="Önce öğrenci e-postasını girin"
                  className="cursor-not-allowed opacity-80"
                />
              ) : (
                <Input
                  name="invitePortalEmail"
                  type="email"
                  defaultValue={v("invitePortalEmail")}
                  placeholder={portalAccessType === "SELF" ? "ogrenci@email.com" : "veli@email.com"}
                />
              )}
              {inviteToPortalChecked && portalAccessType === "SELF" && !studentEmailLive && !useDifferentPortalEmail ? (
                <p className="mt-1 text-xs font-medium text-rose-600" role="alert">
                  Öğrencinin kendisine davet göndermek için yukarıda &quot;Temel Bilgiler&quot; bölümündeki öğrenci
                  e-postasını girin, ya da farklı bir davet e-postası kullanın.
                </p>
              ) : null}
            </div>
          </div>
          {portalAccessType === "SELF" ? (
            <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <input
                type="checkbox"
                checked={useDifferentPortalEmail}
                onChange={(e) => setUseDifferentPortalEmail(e.target.checked)}
              />
              Farklı portal e-postası kullan (öğrenci e-postasından farklı bir adrese davet gönder)
            </label>
          ) : null}
          <p className="text-xs text-[var(--color-text-muted)]">
            Düz metin şifre asla gönderilmez — alıcı, e-postadaki tek kullanımlık bağlantıyla kendi şifresini
            oluşturur. İşaretlemezseniz giriş hesabı oluşturulmaz; daveti daha sonra öğrenci düzenleme ekranından da
            gönderebilirsiniz.
          </p>
        </div>
      </Card>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Ekleniyor…" : "Öğrenci ekle"}
      </Button>
    </form>
  );
}
