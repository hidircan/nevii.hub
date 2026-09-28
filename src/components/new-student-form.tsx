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
import {
  StudentPackagePricingFields,
  type PackageAutofill,
  type PricingCampaignOption,
  type PricingChange,
  type PricingPackageOption,
} from "@/components/student-package-pricing-fields";
import type { DayOverride, TermWeeklyClosedDaysOverride } from "@/lib/work-days";
import { LessonScheduleSlotsPicker } from "@/components/lesson-schedule-slots-picker";
import { lessonWeekdaysFromText } from "@/lib/lesson-schedule-text";
import {
  DEFAULT_FIRST_COLLECTION_MERGE_THRESHOLD_LESSONS,
  STUDENT_TYPES,
  REFERRAL_SOURCES,
  REFERRAL_SOURCE_LABELS,
  shouldMergeFirstCollection,
} from "@/lib/types";
import { MEB_LEVEL_OPTIONS } from "@/lib/student-level-rules";
import {
  estimatePeriodBillingLines,
  derivePerLessonAmount,
  computePeriodAmount,
  referenceMonthlyLessonCount,
  countExactWeekdayLessons,
  resolveLessonStartDay,
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
  campaigns = [],
  kvkkText,
  workDayOverrides,
  termWeeklyClosedDays,
  prefill,
  trialSummary,
}: {
  /** H — deneme dersinden dönüşümde formun ön değerleri (kullanıcı hâlâ düzenler). */
  prefill?: Record<string, string>;
  /** Ön doldurmanın kaynağı — formun üstünde bilgi bandı. */
  trialSummary?: string;
  branches: BranchOption[];
  teachers: TeacherOption[];
  instrumentOptions: string[];
  packages: PricingPackageOption[];
  campaigns?: PricingCampaignOption[];
  kvkkText?: KvkkTextOption;
  /**
   * ÇALIŞMA GÜNÜ — TEK KAYNAK. İlk dönem ders sayısı önizlemesi kapalı
   * günleri saymaz; sunucudaki `createStudentTool` ile AYNI listeyi kullanır
   * ki ekrandaki tutar ile kaydedilen tutar ayrışmasın.
   */
  workDayOverrides: DayOverride[];
  termWeeklyClosedDays?: TermWeeklyClosedDaysOverride;
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
  const v = (key: string): string | undefined => values[key] ?? prefill?.[key];
  const selectedStudentTypes = new Set((values.studentTypes ?? "").split(",").filter(Boolean));
  const checkedVal = (key: string, expected: string): boolean => v(key) === expected;

  // P0-1 (2026-09-02 düzeltme) — ders başı ücret yöneticinin girdiği/seçtiği
  // BİR ALAN DEĞİL: yönetici yalnız aylık ücret + haftalık ders sıklığı
  // girer, ders başı karşılığı salt-okunur bir bilgi kartında GÖSTERİLİR
  // (`derivePerLessonAmount` — sunucudaki `createStudentTool`'un kullandığı
  // AYNI saf fonksiyon). Formun geri kalanı bilinçli olarak uncontrolled
  // kaldığı için (bkz. üstteki not) bu alanları ayrıca controlled state'e
  // ALMAK yerine, `<form>` seviyesinde `onChange` ile her değişiklikte
  // `FormData` okunup yeniden hesaplanır.
  //
  // P0 (2026-09-05) — burada BİLEREK `onInput` YOK. React `<select>`'in
  // `onChange`'ini native `change` olayından türetir, ama `onInput` native
  // `input` olayında çalışır ve `input`, `change`'ten ÖNCE gelir. Formda bir
  // `onInput` handler'ı olursa, kullanıcı bir `<select>`'i değiştirdiğinde:
  // (1) `input` → `recomputePreview` → parent setState → React senkron
  // yeniden render eder ve controlled `<select value={...}>` alanlarının DOM
  // değerini ESKİ state'e GERİ YAZAR; (2) ardından gelen `change` olayı artık
  // eski değeri taşır, alanın kendi `onChange`'i no-op olur. Sonuç: enstrüman/
  // ders süresi/ödeme muhatabı seçimleri gerçek tarayıcıda hiç değişmiyormuş
  // gibi görünür (native olaylarla doğrulandı: input=Keman → change=Piyano).
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
  /**
   * K (2026-09-20) — TEK GİRİŞ: ders gün/saati artık Sözleşme Merkezi ile
   * AYNI bileşenden (`LessonScheduleSlotsPicker`) alınır ve `lessonDays`
   * ondan TÜRETİLİR. Eskiden burada yalnız GÜN (checkbox) soruluyordu, saat
   * sözleşmede ikinci kez soruluyordu ve ikisi birbirini doğrulamıyordu.
   */
  const [lessonScheduleText, setLessonScheduleText] = useState<string>(() => values.lessonScheduleText ?? "");
  const selectedLessonDays: number[] = lessonWeekdaysFromText(lessonScheduleText);
  // P0-D (2026-09-02) — öğrenci e-postasını ve portal erişim türünü CANLI
  // izler: "Öğrencinin kendisi" seçiliyken davet e-postası alanı öğrenci
  // e-postasıyla SENKRON kalır, kullanıcı aynı e-postayı iki kez yazmaz.
  const [studentEmailLive, setStudentEmailLive] = useState(() => v("email") ?? "");
  const [portalAccessType, setPortalAccessType] = useState(() => v("invitePortalAccessType") || "GUARDIAN");
  // P0 (2026-09-05) — ödeme/iletişim muhatabı seçimi, veli/öğrenci telefon
  // alanlarının hangisinin zorunlu olduğunu CANLI belirler (bkz. aşağıdaki
  // RequiredMark/required koşulları ve validation.ts studentSchema.refine).
  const [accountResponsibility, setAccountResponsibility] = useState(() => v("accountResponsibility") || "PARENT_MANAGED");
  // P1 revizyonu — "Bizi nereden buldunuz?" `Diğer` seçilince serbest metin
  // alanı görünür. Opsiyonel alan; hata sonrası değerler state'te korunur.
  const [referralSource, setReferralSource] = useState(() => v("referralSource") ?? "");
  // MEB Paneli — MEB türü checkbox'ı CANLI izlenir: seçiliyken seviye +
  // dönem tarihleri zorunlu bölüm görünür; işaret kaldırılınca gizlenir
  // (gizli değerler kayda YAZILMAZ — sunucu strip eder, bkz. createStudentTool).
  const [mebSelected, setMebSelected] = useState(() => selectedStudentTypes.has("MEB"));
  const [inviteToPortalChecked, setInviteToPortalChecked] = useState(() => checkedVal("inviteToPortal", "1"));
  // Varsayılan: öğrenci e-postasını OTOMATİK kullan. Yalnız önceki bir
  // gönderimde (hata sonrası) fiilen FARKLI bir davet e-postası girilmişse
  // (bilinçli bir override'ın kanıtı) override açık başlar — aksi halde
  // kullanıcının az önce yazdığı farklı e-posta sessizce öğrenci
  // e-postasıyla EZİLİR.
  const [useDifferentPortalEmail, setUseDifferentPortalEmail] = useState(
    () => portalAccessType === "SELF" && !!v("invitePortalEmail") && v("invitePortalEmail") !== v("email")
  );
  // P0 (2026-09-05) — davet e-postası alanı HER ZAMAN controlled: önceden
  // "Öğrencinin kendisi" (SELF) modunda `value`, diğer modlarda `defaultValue`
  // kullanılıyordu. İkisi de AYNI konumdaki AYNI `<input>` olduğu için React
  // alanı yeniden monte etmiyor, yalnızca controlled↔uncontrolled geçişi
  // yapıyordu — konsolda "A component is changing an uncontrolled input to be
  // controlled" uyarısı bundan çıkıyordu. Tek bir state ile çözülür; SELF
  // modunda gösterilen değer öğrenci e-postasıdır (salt okunur), kullanıcının
  // elle yazdığı adres bu state'te KORUNUR ve "farklı e-posta" seçilince geri
  // gelir.
  const [portalEmail, setPortalEmail] = useState(() => v("invitePortalEmail") ?? "");
  // Sahip kararı (2026-09-16) — ilk tahsilata takip eden ayın ücretini ekleme SEÇENEĞİ.
  // Kullanıcı dokunmadıysa "3 ders eşiği" varsayılanı uygulanır; dokunduysa seçimi korunur.
  const [includeNextMonth, setIncludeNextMonth] = useState(false);
  const includeNextMonthRef = useRef(false);
  const includeTouchedRef = useRef(false);
  const portalEmailMirrorsStudent = portalAccessType === "SELF" && !useDifferentPortalEmail;

  // Paket & Kampanya Motoru — fiyat bileşeninden gelen CANLI durum (Bug #1:
  // paketli akışta FormData'daki gizli `monthlyFee` bir render GERİDEN gelir,
  // önizleme bu bildirimi okur). `pricingRef` effect-dışı okuma içindir.
  const [pricing, setPricing] = useState<PricingChange>({
    packageId: "",
    packageTitle: "",
    finalMonthlyFee: null,
    campaignIds: [],
  });
  const pricingRef = useRef(pricing);
  function handlePricingChange(p: PricingChange) {
    pricingRef.current = p;
    setPricing(p);
  }
  // Paket seçiminde önerilen haftalık ders — `key` yalnız paket değişiminde
  // artar, kullanıcının sonradan değiştirdiği değer korunur (override).
  const [packageAutofill, setPackageAutofill] = useState<{ weekly?: string; nonce: number }>({
    weekly: undefined,
    nonce: 0,
  });
  function handlePackageAutofill(a: PackageAutofill) {
    if (a.weeklyLessonCount === undefined) return;
    setPackageAutofill((p) => ({ weekly: String(a.weeklyLessonCount), nonce: p.nonce + 1 }));
  }

  function recomputePreview(includeOverride?: boolean) {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    // Bug #1 — nihai ücret BİLDİRİMDEN okunur (FormData'daki gizli input,
    // indirimi değiştiren olay anında henüz ESKİ değeri taşır). Bildirim
    // null ise (paketsiz + kampanyasız legacy) FormData'daki serbest ücrete düşülür.
    const live = pricingRef.current;
    const monthlyFee =
      live.finalMonthlyFee !== null ? live.finalMonthlyFee : Number(fd.get("monthlyFee") || 0);
    const weeklyLessonCount = Number(fd.get("weeklyLessonCount") || 0);
    // P0 (2026-09-05) — önizleme de sunucuyla AYNI kaynaktan (resolveLessonStartDay)
    // ders başlangıç gününü çözer: ilk tahsilat kayıt tarihinden değil, ders
    // başlangıcından itibaren sayar.
    const startDay = resolveLessonStartDay({
      lessonStartDate: String(fd.get("lessonStartDate") || ""),
      enrollmentStartDate: String(fd.get("enrollmentStartDate") || ""),
      fallbackToday: new Date().toISOString().slice(0, 10),
    });
    const firstPaymentRaw = String(fd.get("firstPaymentAmount") || "").replace(/[^\d]/g, "");
    setEnteredFirstPayment(firstPaymentRaw ? Number(firstPaymentRaw) : undefined);
    const lessonDays = lessonWeekdaysFromText(String(fd.get("lessonScheduleText") ?? ""));
    setStudentEmailLive(String(fd.get("email") || ""));
    setPortalAccessType(String(fd.get("invitePortalAccessType") || "GUARDIAN"));
    setInviteToPortalChecked(fd.get("inviteToPortal") === "1");
    // Bug #1 — 0 ücret GEÇERLİ bir önizlemedir (%100 indirim → ders başı 0);
    // yalnız geçersiz/negatif değerler ile seçilmemiş sıklık kartı gizler.
    if (!Number.isInteger(monthlyFee) || monthlyFee < 0 || weeklyLessonCount <= 0) {
      setPreview(null);
      return;
    }
    try {
      const derived = derivePerLessonAmount(monthlyFee, weeklyLessonCount);
      const endDay = monthEndDay(startDay);
      const lines = estimatePeriodBillingLines({
        enrollmentStartDay: startDay,
        enrollmentEndDay: endDay,
        monthlyFee,
        weeklyLessonCount,
      });
      // P0-C — TAM OLARAK weeklyLessonCount kadar GERÇEK gün seçildiyse
      // (ör. haftada 2 ders için 2 farklı gün), projeksiyon yerine o
      // günlerin ilk dönem içinde KAÇ KEZ geçtiğini TAM sayarak daha
      // isabetli bir önizleme gösterilir — sunucudaki resmi
      // `autoSuggestedAmount` hesabını DEĞİŞTİRMEZ, yalnız istemci
      // önizlemesini iyileştirir (bkz. period-lesson-billing.ts yorumu).
      const hasExactDays = lessonDays.length === weeklyLessonCount && new Set(lessonDays).size === weeklyLessonCount;
      const exactCount = hasExactDays
        ? countExactWeekdayLessons(startDay, lines[0]?.periodEnd ?? endDay, lessonDays, {
            term: (fd.get("termType") as string) === "yaz" ? "yaz" : "guz",
            overrides: workDayOverrides,
            weeklyClosedDays: termWeeklyClosedDays,
          })
        : null;
      const plannedLessons = exactCount ?? lines[0]?.billableLessonCount ?? 0;
      // P0 (2026-09-03) — "3 ders eşiği": sunucudaki (createStudentTool)
      // AYNI kural — kayıt ayında kalan gerçek ders sayısı 3'ten azsa
      // sonraki ayın tam ücreti de öneriye eklenir. Tek kaynak sunucudur;
      // burası yalnız İSTEMCİ önizlemesi, resmi hesap değildir.
      // P0-1 (2026-09-09) — `plannedLessons * derived` ÇİFT YUVARLAMAYDI
      // (5.950 → 5.952). Sunucudaki `createStudentTool` ile AYNI
      // `computePeriodAmount` fonksiyonundan geçer; ayrı formül YOK.
      const firstPeriodAmount = computePeriodAmount(monthlyFee, weeklyLessonCount, plannedLessons);
      // Sahip kararı (2026-09-16) — takip eden ayı eklemek kullanıcının seçimi;
      // "3 ders eşiği" yalnız kullanıcı dokunmadıysa varsayılanı belirler.
      const ruleDefault = shouldMergeFirstCollection(plannedLessons, DEFAULT_FIRST_COLLECTION_MERGE_THRESHOLD_LESSONS);
      const effectiveInclude = includeOverride ?? (includeTouchedRef.current ? includeNextMonthRef.current : ruleDefault);
      if (!includeTouchedRef.current && effectiveInclude !== includeNextMonthRef.current) {
        includeNextMonthRef.current = effectiveInclude;
        setIncludeNextMonth(effectiveInclude);
      }
      const suggestedAmount = effectiveInclude ? firstPeriodAmount + monthlyFee : firstPeriodAmount;
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

  // Bug #1 — fiyat bileşeni her bildirimde önizlemeyi YENİDEN hesapla: form
  // seviyesindeki `onChange`, indirimi değiştiren olay anında henüz ESKİ
  // bildirimi görür; bu effect state commit'inden SONRA doğru değerle çalışır.
  // `recomputePreview` bilerek deps dışı: form DOM'unu okur, her render'da
  // yeniden oluşan bir fonksiyon kimliğine bağlanmak effect'i her tuşta tetikler.
  useEffect(() => {
    recomputePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricing]);

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
    <form ref={formRef} action={formAction} onChange={() => recomputePreview()} className="space-y-6" noValidate>
      {v("convertedFromTrialId") ? (
        <>
          <input type="hidden" name="convertedFromTrialId" value={v("convertedFromTrialId")} />
          <div
            className="rounded-lg border px-4 py-3 text-sm"
            style={{ borderColor: "var(--color-trial)", background: "var(--color-trial-soft)", color: "var(--color-text)" }}
          >
            <p className="font-semibold">Deneme dersinden kayıt</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              {trialSummary ?? "Bilgiler deneme kaydından dolduruldu."} Kaydı tamamladığınızda deneme &quot;kayda dönüştü&quot;
              olarak işaretlenir ve dönüşümü yapan kişi olarak siz kaydedilirsiniz.
            </p>
          </div>
        </>
      ) : null}
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
                  <input
                    type="checkbox"
                    name="studentTypes"
                    value={t}
                    defaultChecked={selectedStudentTypes.has(t)}
                    onChange={t === "MEB" ? (e) => setMebSelected(e.target.checked) : undefined}
                  />
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
          {/* P0 (2026-09-05) — kullanıcı raporu: bu alan önceden veli/öğrenci
              iletişim bilgilerinden SONRA geliyordu; hangi tarafın telefon/
              iletişim muhatabı olduğu, o kişinin bilgilerini girmeden ÖNCE
              bilinmesi daha mantıklı — bu yüzden buraya, iletişim
              bilgilerinin HEMEN ÖNÜNE taşındı. */}
          <div>
            <Label>Ödeme/iletişim muhatabı</Label>
            <Select
              name="accountResponsibility"
              value={accountResponsibility}
              onChange={(e) => setAccountResponsibility(e.target.value)}
            >
              <option value="PARENT_MANAGED">Veli (varsayılan)</option>
              <option value="SELF_MANAGED">Öğrencinin kendisi</option>
            </Select>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              Ödeme/iletişimin kime ait olduğunu belirler — aşağıdaki zorunlu telefon alanını etkiler.
            </p>
          </div>
          <div>
            <Label>T.C. kimlik no (opsiyonel — şifreli saklanır)</Label>
            <Input name="nationalId" defaultValue={v("nationalId")} inputMode="numeric" maxLength={11} placeholder="11 haneli" aria-invalid={!!fieldErrors.nationalId} />
            <FieldError message={fieldErrors.nationalId} />
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
                {accountResponsibility === "PARENT_MANAGED" ? <RequiredMark /> : null}
              </Label>
              <Input
                name="parentName"
                required={accountResponsibility === "PARENT_MANAGED"}
                aria-required={accountResponsibility === "PARENT_MANAGED"}
                defaultValue={v("parentName")}
                placeholder={accountResponsibility === "PARENT_MANAGED" ? "Veli adı" : "Veli adı (opsiyonel)"}
                aria-invalid={!!fieldErrors.parentName}
              />
              <FieldError message={fieldErrors.parentName} />
            </div>
            <div>
              <Label>
                Veli telefon
                {accountResponsibility === "PARENT_MANAGED" ? <RequiredMark /> : null}
              </Label>
              <Input
                name="parentPhone"
                required={accountResponsibility === "PARENT_MANAGED"}
                aria-required={accountResponsibility === "PARENT_MANAGED"}
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
                {accountResponsibility === "SELF_MANAGED" ? <RequiredMark /> : null}
              </Label>
              <Input
                name="phone"
                required={accountResponsibility === "SELF_MANAGED"}
                aria-required={accountResponsibility === "SELF_MANAGED"}
                defaultValue={v("phone")}
                placeholder="05xx xxx xxxx"
                aria-invalid={!!fieldErrors.phone}
              />
              <FieldError message={fieldErrors.phone} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Doğum tarihi (opsiyonel)</Label>
              <Input name="birthDate" type="date" defaultValue={v("birthDate")} aria-invalid={!!fieldErrors.birthDate} />
              <FieldError message={fieldErrors.birthDate} />
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
            <Label>Bizi nereden buldunuz? (opsiyonel)</Label>
            <Select
              name="referralSource"
              value={referralSource}
              onChange={(e) => setReferralSource(e.target.value)}
              aria-invalid={!!fieldErrors.referralSource}
            >
              <option value="">Seçiniz (opsiyonel)</option>
              {REFERRAL_SOURCES.map((value) => (
                <option key={value} value={value}>
                  {REFERRAL_SOURCE_LABELS[value]}
                </option>
              ))}
            </Select>
            <FieldError message={fieldErrors.referralSource} />
          </div>
          {referralSource === "diger" ? (
            <div>
              <Label>Kaynak açıklaması (opsiyonel)</Label>
              <Input
                name="referralSourceDetail"
                defaultValue={v("referralSourceDetail")}
                placeholder="Örn. komşumuz Ayşe Hanım önerdi"
              />
            </div>
          ) : null}
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
          {/*
            P0 (2026-09-05) — KAYIT TARİHİ ile DERS BAŞLANGIÇ TARİHİ ayrı iki
            alandır: öğrenci bugün kaydolup dersleri ileri bir tarihte
            başlatabilir. İlk tahsilat/ders sayımı DERS BAŞLANGICINDAN itibaren
            yapılır (bkz. resolveLessonStartDay — sunucu ve bu önizleme AYNI
            fonksiyonu kullanır).
          */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>
                Kayıt tarihi
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
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Öğrencinin sisteme kaydedildiği gün.</p>
            </div>
            <div>
              <Label>Ders başlangıç tarihi (opsiyonel)</Label>
              <Input
                name="lessonStartDate"
                type="date"
                defaultValue={v("lessonStartDate")}
                aria-invalid={!!fieldErrors.lessonStartDate}
              />
              <FieldError message={fieldErrors.lessonStartDate} />
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                Derslerin fiilen başladığı gün. Boş bırakılırsa kayıt tarihi kullanılır. İlk tahsilat yalnızca bu
                tarihten sonraki dersleri sayar.
              </p>
            </div>
          </div>
          {/*
            MEB Paneli — MEB seçiliyken seviye (1–8) + dönem tarihleri ZORUNLU
            bölüm görünür; seçim kaldırılınca gizlenir ve değerleri kayda
            yazılmaz. Sınav tarihi opsiyoneldir; "Girdi" tarih ister.
          */}
          {mebSelected ? (
            <div
              className="space-y-3 rounded-lg border px-3 py-3"
              style={{ borderColor: "var(--color-primary)", background: "var(--color-surface-muted)" }}
            >
              <p className="text-sm font-semibold text-[var(--color-text)]">MEB bilgileri</p>
              <div>
                <Label>
                  MEB seviyesi
                  <RequiredMark />
                </Label>
                <Select name="level" required aria-required defaultValue={v("level") ?? ""} aria-invalid={!!fieldErrors.level}>
                  <option value="">Seviye seçin</option>
                  {MEB_LEVEL_OPTIONS.map((l) => (
                    <option key={l} value={l}>
                      {l}. Seviye
                    </option>
                  ))}
                </Select>
                <FieldError message={fieldErrors.level} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>
                    MEB seviye başlangıç tarihi
                    <RequiredMark />
                  </Label>
                  <Input
                    name="mebLevelStartDate"
                    type="date"
                    required
                    aria-required
                    defaultValue={v("mebLevelStartDate")}
                    aria-invalid={!!fieldErrors.mebLevelStartDate}
                  />
                  <FieldError message={fieldErrors.mebLevelStartDate} />
                </div>
                <div>
                  <Label>
                    MEB seviye bitiş tarihi
                    <RequiredMark />
                  </Label>
                  <Input
                    name="mebLevelEndDate"
                    type="date"
                    required
                    aria-required
                    defaultValue={v("mebLevelEndDate")}
                    aria-invalid={!!fieldErrors.mebLevelEndDate}
                  />
                  <FieldError message={fieldErrors.mebLevelEndDate} />
                </div>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Dönem tarihleri kayıt/ders tarihlerinden bağımsızdır; bitiş başlangıçtan önce olamaz.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>MEB sınav tarihi (opsiyonel)</Label>
                  <Input name="mebExamDate" type="date" defaultValue={v("mebExamDate")} aria-invalid={!!fieldErrors.mebExamDate} />
                  <FieldError message={fieldErrors.mebExamDate} />
                </div>
                <div>
                  <Label>Sınava girdi mi?</Label>
                  <Select name="mebExamStatus" defaultValue={v("mebExamStatus") ?? ""} aria-invalid={!!fieldErrors.mebExamAttended}>
                    <option value="">Bilinmiyor</option>
                    <option value="not_attended">Girmedi</option>
                    <option value="attended">Girdi</option>
                  </Select>
                  <FieldError message={fieldErrors.mebExamAttended} />
                </div>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                “Girdi” için sınav tarihi zorunludur ve gelecekte olamaz. MEB işaretini kaldırırsanız bu alanlar
                kayda yazılmaz.
              </p>
            </div>
          ) : (
            <div>
              <Label>Seviye (opsiyonel)</Label>
              <Input name="level" defaultValue={v("level")} placeholder="Örn. Başlangıç, Orta, İleri" />
            </div>
          )}
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
              key={`weekly-${packageAutofill.nonce}`}
              name="weeklyLessonCount"
              required
              aria-required
              defaultValue={
                packageAutofill.weekly ??
                (state && "values" in state && state.values?.weeklyLessonCount
                  ? state.values.weeklyLessonCount
                  : "1")
              }
              aria-invalid={!!fieldErrors.weeklyLessonCount}
            >
              <option value="1">Haftada 1 ders</option>
              <option value="2">Haftada 2 ders</option>
            </Select>
            <FieldError message={fieldErrors.weeklyLessonCount} />
          </div>
          <div>
            <Label>
              Ders günü ve saati (haftalık ders sayısı kadar farklı gün seçin)
              <RequiredMark />
            </Label>
            <LessonScheduleSlotsPicker
              value={lessonScheduleText}
              onChange={setLessonScheduleText}
              name="lessonScheduleText"
            />
            {/* `lessonDays` sunucu doğrulaması ve ilk dönem ders sayımı için
                gerekir; AYRI bir kullanıcı girişi DEĞİL, yukarıdaki seçimden
                türetilir — iki alan asla birbirinden ayrışamaz. */}
            {selectedLessonDays.map((d) => (
              <input key={d} type="hidden" name="lessonDays" value={d} />
            ))}
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              Buraya girdiğiniz gün/saat kaydedilir: Sözleşme Merkezi&apos;nde ön-dolu gelir ve sözleşme
              onaylandıktan sonra ders programını tek tıkla buradan üretebilirsiniz. Aynı bilgiyi tekrar
              girmeniz gerekmez.
            </p>
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
          {/* Paket & Kampanya Motoru — serbest metin paket alanı KALDIRILDI;
              packageName seçili paketin başlığından otomatik gelir (sunucu da
              ayrıca türetir). Eski kayıtların packageName değeri aynen korunur. */}
          <input
            type="hidden"
            name="packageName"
            value={pricing.packageTitle || v("packageName") || "Bireysel Aylık — 4 ders"}
          />
          <StudentPackagePricingFields
            key={JSON.stringify({
              p: v("packageId"),
              d: v("discountType"),
              dv: v("discountValue"),
              c: values.campaignIds,
              m: v("monthlyFee"),
            })}
            packages={packages}
            campaigns={campaigns}
            initialPackageId={v("packageId") ?? ""}
            initialDiscountType={v("discountType") ?? ""}
            initialDiscountValue={v("discountValue") ?? ""}
            initialCampaignIds={(values.campaignIds ?? "").split(",").filter(Boolean)}
            initialPaymentDueDay={v("paymentDueDay") ?? ""}
            onPricingChange={handlePricingChange}
            onPackageAutofill={handlePackageAutofill}
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
                    <dd className="font-semibold text-[var(--color-text)]">
                      {preview.firstPeriodPlannedLessons}
                      {preview.firstPeriodPlannedLessons > preview.referenceCount ? (
                        <span className="ml-1 text-xs font-normal text-amber-700">
                          (ücret en fazla {preview.referenceCount} ders üzerinden)
                        </span>
                      ) : null}
                    </dd>
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
          <label className="flex items-start gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs">
            <input
              type="checkbox"
              checked={includeNextMonth}
              onChange={(e) => {
                includeTouchedRef.current = true;
                includeNextMonthRef.current = e.target.checked;
                setIncludeNextMonth(e.target.checked);
                recomputePreview(e.target.checked);
              }}
              className="mt-0.5 h-3.5 w-3.5"
            />
            <span>
              İlk tahsilata takip eden ayın tam ücretini de ekle
              <span className="block text-[var(--color-text-muted)]">
                Kayıt ayında 3&apos;ten az ders kalıyorsa varsayılan olarak işaretlenir. İşaretliyse sözleşmenin ilk
                taksiti kayıt ayı + takip eden ayı kapsar; işaretli değilse takip eden ay ayrı taksit olarak kalır.
              </span>
            </span>
          </label>
          <input type="hidden" name="firstCollectionIncludesNextMonth" value={includeNextMonth ? "1" : "0"} />
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

      {/* 5. KVKK açık rıza — yalnız yürürlükte bir metin varsa.
          P0 (2026-09-05) — "Sosyal medya paylaşım (fotoğraf/video) izni var"
          onay kutusu BURADAN KALDIRILDI: aynı rıza sözleşme ekranındaki
          Fotoğraf/Video Açık Rıza Formu akışında (Madde 19) zaten alınıyor,
          aynı onay iki ayrı yerden sorulmuyor. Geçmiş kayıtlar
          (`SocialMediaConsent`) DEĞİŞMEDİ; öğrenci detayındaki "SOSYAL MEDYA
          İZNİ" alanı ve belge akışları aynen çalışmaya devam eder. */}
      {kvkkText ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
            KVKK Açık Rıza
          </h2>
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
        </Card>
      ) : null}

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
              <Input
                name="invitePortalEmail"
                type="email"
                value={portalEmailMirrorsStudent ? studentEmailLive : portalEmail}
                onChange={(e) => setPortalEmail(e.target.value)}
                readOnly={portalEmailMirrorsStudent}
                placeholder={
                  portalEmailMirrorsStudent
                    ? "Önce öğrenci e-postasını girin"
                    : portalAccessType === "SELF"
                      ? "ogrenci@email.com"
                      : "veli@email.com"
                }
                className={portalEmailMirrorsStudent ? "cursor-not-allowed opacity-80" : undefined}
              />
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

      {/*
        2026-09-22 ürün kararı — sözleşme kayıtta ZORUNLU DEĞİL. Öğrenci sözleşmesiz
        geçerli bir kayıt olarak yaşayabilir; sözleşme daha sonra Sözleşme Merkezi'nden
        aynı kanonik akışla oluşturulur.
      */}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="submit" name="afterSave" value="contract" className="w-full" disabled={isPending}>
          {isPending ? "Kaydediliyor…" : "Kaydet ve sözleşme oluştur"}
        </Button>
        <Button type="submit" name="afterSave" value="student" variant="secondary" className="w-full" disabled={isPending}>
          {isPending ? "Kaydediliyor…" : "Sadece öğrenci kaydını oluştur"}
        </Button>
      </div>
      <p className="text-center text-xs text-[var(--color-text-muted)]">
        Sözleşme zorunlu değildir. &quot;Sadece öğrenci kaydını oluştur&quot; seçilirse öğrenci &quot;Sözleşme
        bekliyor&quot; olarak listelenir; sözleşmeyi daha sonra öğrencinin Sözleşme Merkezi&apos;nden oluşturabilirsiniz.
      </p>
    </form>
  );
}
