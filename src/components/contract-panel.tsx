"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { LessonScheduleSlotsPicker } from "@/components/lesson-schedule-slots-picker";
import { parseDateOnlyInput, isValidDateOnlyInput, toIsoDateOrNull, dayOfMonthUtc } from "@/lib/date-input";
import { describePaymentDueRule, paymentMethodLabel } from "@/lib/payment-due-rule-client";
import { findLatestActiveContractForRenewal } from "@/lib/contract-list-helpers";
import { formatDateTr } from "@/lib/timezone";
import { friendlyApiErrorMessage } from "@/lib/api/friendly-error";

/** 2026-2027 sözleşme kaynağı — Fotoğraf/Video Açık Rıza Formu'nun 5 kanalı, HER BİRİ ayrı değerlendirilir. */
const PHOTO_VIDEO_CONSENT_CHANNELS: { value: string; label: string }[] = [
  { value: "website", label: "Kurumun resmi internet sitesi" },
  { value: "instagram", label: "Kurumun resmi Instagram ve diğer sosyal medya hesapları" },
  { value: "print_materials", label: "Kurumun basılı tanıtım materyalleri (broşür, afiş vb.)" },
  { value: "digital_ads", label: "Kurumun dijital tanıtım/reklam çalışmaları" },
  { value: "in_house_board", label: "Kurum içi pano ve etkinlik tanıtımları" },
];

type ContractRow = {
  id: string;
  contractNumber: string;
  versionNumber: number;
  contractType: "initial" | "renewal" | "amendment";
  status: string;
  programmeName: string;
  enrollmentStartDate: string;
  enrollmentEndDate: string;
  monthlyAmount: number;
  totalContractAmount: number;
  installmentCount: number;
  paymentMethod?: string;
  signatoryFullName: string;
  /** 1-2 aylık tanışma paketi kayıtlarında yok — formal sözleşme belgesi üretilmedi. */
  documentInstanceId?: string;
};

type InstallmentPreviewRow = {
  sequence: number;
  dueDate: string;
  amount: number;
  kind?: "deposit" | "first_collection" | "first_collection_combined" | "period_fee";
  periodLabel?: string;
  breakdown?: { periodLabel: string; amount: number }[];
  computationSource?: "auto" | "manual";
};

const INSTALLMENT_KIND_LABELS: Record<string, string> = {
  deposit: "Kaparo",
  first_collection: "İlk tahsilat",
  first_collection_combined: "İlk tahsilat (birleştirilmiş)",
  period_fee: "Dönem ücreti",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Taslak",
  generated: "Oluşturuldu",
  printed: "Yazdırıldı",
  wet_signature_pending: "Islak imza bekleniyor",
  signed: "İmzalandı",
  recorded: "Kayıt tamamlandı (sözleşme gerekmiyor)",
  superseded: "Yenilendi (eski sürüm)",
  cancelled: "İptal edildi",
};

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  initial: "İlk Kayıt",
  renewal: "Yenileme",
  amendment: "Değişiklik",
};

function formatTL(n: number) {
  return new Intl.NumberFormat("tr-TR").format(n) + " ₺";
}

async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  type Json = { ok: boolean; data?: T; error?: { code?: string; message?: string } };
  const send = async () =>
    (await (
      await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    ).json()) as Json;
  try {
    let json = await send();
    // Erişim anahtarı 15 dk'da dolar; uzun sözleşme formunda "Invalid or expired
    // access token" ham metni görünüyordu. Bir kez sessizce yenilenip tekrar denenir.
    if (json.error?.code === "UNAUTHORIZED") {
      const refreshed = await fetch("/api/v1/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (refreshed.ok) json = await send();
    }
    if (!json.ok) {
      const code = json.error?.code;
      return {
        ok: false,
        message:
          code === "UNAUTHORIZED" || code === "FORBIDDEN"
            ? friendlyApiErrorMessage(json.error, "İşlem başarısız.")
            : json.error?.message || "İşlem başarısız.",
      };
    }
    return { ok: true, data: json.data as T };
  } catch {
    return { ok: false, message: "Bağlantı hatası. Lütfen tekrar deneyin." };
  }
}

type ContractPrefill = {
  programmeName?: string;
  monthlyAmount?: number;
  paymentMethod?: string;
  enrollmentStartDate?: string;
  durationMonths?: number;
  /** P0 (2026-09-03) — öğrenci per-lesson fiyatlandırma kullanıyorsa (Student.derivedPerLessonAmount dolu) true. */
  usePerLessonBilling?: boolean;
  /** P0 (2026-09-05) — kayıt sırasında zaten seçilmiş GERÇEK ders günü/saatinden türetilir; kullanıcı aynı bilgiyi sıfırdan tekrar girmesin diye — hâlâ düzenlenebilir, zorunlu değil. */
  lessonScheduleText?: string;
};

/**
 * Sözleşmenin öğrenci kaydından aldığı bilgiler (2026-09-15). Kayıt ekranı
 * bunların TEK kaynağıdır; sözleşme formu bunları salt-okunur özet olarak
 * gösterir ve formdaki değer kayıttakinden saparsa yanında söyler — kullanıcı
 * bir çelişkiyi anlamak için ekran değiştirmek zorunda kalmaz.
 */
export type RegistrationSummary = {
  registeredAt?: string;
  contractStartDay?: string;
  intendedDurationMonths?: number;
  monthlyFee: number;
  paymentMethod?: string;
  paymentMethodLabel: string;
  firstPayment?: { amount: number; paidAt: string; methodLabel: string };
  signatoryName: string;
  signatoryRelationship: "veli" | "öğrenci";
  address?: string;
};

type FieldErrors = Record<string, string>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs font-medium text-rose-600" role="alert">
      {message}
    </p>
  );
}

/** Yenileme önceki bitişin ERTESİ günü başlar — aynı gün başlasa "başlangıç ayı = 1. ay" kuralı bitiş ayını yeniden sayardı. */
function dayAfter(isoDay: string): string {
  const d = new Date(`${isoDay.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Kayıttan gelen bilgiler — salt-okunur. Formdaki değer kayıttakinden
 * saparsa satırın altında iki değer yan yana söylenir; sunucunun "ilk ödeme
 * 1. taksitle aynı değil" gibi reddetmelerinin nedeni burada önceden görünür.
 */
function RegistrationSummaryCard({
  studentId,
  registration,
  current,
}: {
  studentId: string;
  registration: RegistrationSummary;
  current: { startDay: string; monthlyAmount: number | ""; paymentMethod: string; durationMonths: number };
}) {
  const diffs: string[] = [];
  if (registration.contractStartDay && current.startDay && current.startDay !== registration.contractStartDay) {
    diffs.push(
      `Sözleşme başlangıcı (${formatDateTr(current.startDay)}) kayıttaki ders başlangıcından (${formatDateTr(registration.contractStartDay)}) farklı.`
    );
  }
  if (current.monthlyAmount !== "" && current.monthlyAmount !== registration.monthlyFee) {
    diffs.push(`Aylık ücret (${formatTL(current.monthlyAmount)}) kayıttakinden (${formatTL(registration.monthlyFee)}) farklı.`);
  }
  if (registration.paymentMethod && current.paymentMethod !== registration.paymentMethod) {
    diffs.push(
      `Ödeme yöntemi (${paymentMethodLabel(current.paymentMethod)}) kayıttakinden (${registration.paymentMethodLabel}) farklı.`
    );
  }
  if (registration.intendedDurationMonths && current.durationMonths !== registration.intendedDurationMonths) {
    diffs.push(`Süre (${current.durationMonths} ay) kayıtta seçilen süreden (${registration.intendedDurationMonths} ay) farklı.`);
  }
  return (
    <div className="mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-[var(--color-text)]">Kayıttan gelen bilgiler</p>
        <Link
          href={`/panel/ogrenciler/${studentId}?duzenle=kayit#genel`}
          className="font-medium text-[var(--color-primary)] hover:underline"
        >
          Kayıtta düzenle →
        </Link>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {registration.registeredAt ? (
          <div>
            <dt className="inline text-[var(--color-text-muted)]">Kayıt tarihi: </dt>
            <dd className="inline">{formatDateTr(registration.registeredAt)}</dd>
          </div>
        ) : null}
        {registration.contractStartDay ? (
          <div>
            <dt className="inline text-[var(--color-text-muted)]">Ders başlangıcı: </dt>
            <dd className="inline">{formatDateTr(registration.contractStartDay)}</dd>
          </div>
        ) : null}
        {registration.intendedDurationMonths ? (
          <div>
            <dt className="inline text-[var(--color-text-muted)]">Seçilen süre: </dt>
            <dd className="inline">{registration.intendedDurationMonths} ay</dd>
          </div>
        ) : null}
        <div>
          <dt className="inline text-[var(--color-text-muted)]">Aylık ücret: </dt>
          <dd className="inline">
            {formatTL(registration.monthlyFee)} · {registration.paymentMethodLabel}
          </dd>
        </div>
        <div>
          <dt className="inline text-[var(--color-text-muted)]">İlk tahsilat: </dt>
          <dd className="inline">
            {registration.firstPayment
              ? `${formatTL(registration.firstPayment.amount)} · ${formatDateTr(registration.firstPayment.paidAt)} · ${registration.firstPayment.methodLabel}`
              : "Kayıtta ilk tahsilat bulunamadı — formal sözleşme oluşturulamaz, önce kayıtta ilk ödemeyi girin."}
          </dd>
        </div>
        <div>
          <dt className="inline text-[var(--color-text-muted)]">Muhatap: </dt>
          <dd className="inline">
            {registration.signatoryName} ({registration.signatoryRelationship})
          </dd>
        </div>
      </dl>
      {diffs.length > 0 ? (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 font-medium text-amber-800 dark:text-amber-300">
          {diffs.map((d) => (
            <li key={d}>{d} Bilinçliyse sorun yok; değilse formu veya kaydı düzeltin.</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ContractForm({
  studentId,
  previousContract,
  prefill,
  registration,
  onDone,
  onCancel,
}: {
  studentId: string;
  previousContract: ContractRow | null;
  prefill?: ContractPrefill;
  registration?: RegistrationSummary;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const isRenewal = !!previousContract;
  const [programmeName, setProgrammeName] = useState(previousContract?.programmeName ?? prefill?.programmeName ?? "");
  // P0 (2026-09-03) — yalnız YENİ (initial) kayıt akışından, per-lesson
  // fiyatlandırma kullanan bir öğrenci için gelir; yenilemede prefill zaten
  // undefined olduğundan bu her zaman false kalır — eski davranış korunur.
  const usePerLessonBilling = !isRenewal && (prefill?.usePerLessonBilling ?? false);
  const [lessonScheduleText, setLessonScheduleText] = useState(prefill?.lessonScheduleText ?? "");
  const [enrollmentStartDate, setEnrollmentStartDate] = useState(
    isRenewal
      ? dayAfter(previousContract!.enrollmentEndDate)
      : (prefill?.enrollmentStartDate?.slice(0, 10) ?? "")
  );
  const [durationMonths, setDurationMonths] = useState(isRenewal ? 3 : (prefill?.durationMonths ?? 1));
  // Bitiş tercihi (bkz. contracts.ts computeContractEndDate) — iki seçenekte de son taksit N. aydadır.
  const [endDatePreference, setEndDatePreference] = useState<"month_end" | "date_based">("month_end");
  // P0 (2026-09-04) — "Sözleşmenin son döneminde eksik kalan dersler nasıl
  // ücretlendirilsin?" — yalnız per-lesson fiyatlandırma (usePerLessonBilling)
  // kullanan öğrenciler için anlamlı; "remaining_lessons" (varsayılan/eski
  // davranış) motorun zaten yaptığı şeydir, DEĞİŞİKLİK YOK.
  const [lastPeriodPricingMode, setLastPeriodPricingMode] = useState<"remaining_lessons" | "regular_fee" | "manual">(
    "remaining_lessons"
  );
  const [lastPeriodManualAmount, setLastPeriodManualAmount] = useState<number | "">("");
  // P0 (2026-09-03) — `firstPaymentAmount`/`depositAmount` ile AYNI desen
  // (new-student-form.tsx'te de kullanılan proje standardı): başlangıçta
  // BOŞ, "0" görünmez, kullanıcı doğrudan yazar. `!monthlyAmount` guard'ı
  // (validateForm) "" için zaten falsy döner, otomatik 0'a ÇEVİRMEZ.
  const [monthlyAmount, setMonthlyAmount] = useState<number | "">(previousContract?.monthlyAmount ?? prefill?.monthlyAmount ?? "");
  const [installmentCount, setInstallmentCount] = useState(isRenewal ? 3 : (prefill?.durationMonths ?? 1));
  const [firstDueDate, setFirstDueDate] = useState(
    isRenewal ? dayAfter(previousContract!.enrollmentEndDate) : (prefill?.enrollmentStartDate?.slice(0, 10) ?? "")
  );
  const [depositAmount, setDepositAmount] = useState<number | "">("");
  const [paymentMethod, setPaymentMethod] = useState(previousContract?.paymentMethod ?? prefill?.paymentMethod ?? "cash");
  // İmzalayan, kayıttaki ödeme/iletişim muhatabından (veli ↔ öğrenci) ve adresten ön doldurulur — aynı bilgi iki kez girilmez.
  const [signatoryFullName, setSignatoryFullName] = useState(previousContract?.signatoryFullName ?? registration?.signatoryName ?? "");
  const [signatoryNationalId, setSignatoryNationalId] = useState("");
  const [signatoryAddress, setSignatoryAddress] = useState(registration?.address ?? "");
  const [signatoryRelationship, setSignatoryRelationship] = useState<"veli" | "öğrenci">(
    registration?.signatoryRelationship ?? "veli"
  );
  const [photoConsent, setPhotoConsent] = useState<"granted" | "denied" | "unset">("unset");
  const [photoScopes, setPhotoScopes] = useState<Set<string>>(new Set());
  const [kvkkNoticeDelivered, setKvkkNoticeDelivered] = useState(false);
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [overlapReason, setOverlapReason] = useState("");
  // Owner policy (2026-08-29) — "İlk ödeme her zaman kayıt esnasında alınacaktır." Kayıt anı
  // tahsilatı, taksit planındaki 1. taksitin (firstDueDate) ödeme PENCERESİ kontrolünden AYRI bir
  // olgu: bu, paranın GERÇEKTEN ne zaman/hangi yöntemle/ne kadar tahsil edildiğinin kaydıdır.
  const [firstPaymentMethod, setFirstPaymentMethod] = useState(paymentMethod);
  const [firstPaymentAmount, setFirstPaymentAmount] = useState<number | "">("");
  const [firstPaymentCollectedAt, setFirstPaymentCollectedAt] = useState(enrollmentStartDate);
  const [firstPaymentReference, setFirstPaymentReference] = useState("");
  const [firstPaymentNote, setFirstPaymentNote] = useState("");
  const [firstPaymentDateExceptionReason, setFirstPaymentDateExceptionReason] = useState("");

  // Faz 1B/5B — GÜVENLİ tarih hesabı: `new Date(str).setMonth(...)` gibi UTC
  // ayrıştırma + YEREL saat dilimi mutasyonunu KARIŞTIRAN kalıplar saat
  // dilimi kaymasına yol açabilir. `parseDateOnlyInput` her zaman UTC
  // öğlende ayrıştırır, `setUTCMonth` ile AYNI saat diliminde ilerletilir —
  // kayma imkansızdır. Geçersiz/boş girdide SESSİZCE "" döner (fırlatmaz).
  // `contracts.ts` `computeContractEndDate` ile AYNI algoritma — o dosya
  // sunucu-only import'lar (fs/path) taşıdığından client bileşenine
  // doğrudan import edilemez, bilerek burada yansıtılır (server-side test
  // kapsamı `contracts.test.ts`'te).
  const enrollmentEndDate = (() => {
    const start = parseDateOnlyInput(enrollmentStartDate);
    if (!start || !durationMonths) return "";
    // Başlangıç ayı = 1. ay. Ay sonu: 10 Eylül + 10 → 30 Haziran; tarih bazlı: → 9 Temmuz.
    const y = start.getUTCFullYear();
    const m = start.getUTCMonth();
    if (endDatePreference === "date_based") {
      const lastDay = new Date(Date.UTC(y, m + durationMonths + 1, 0)).getUTCDate();
      return new Date(Date.UTC(y, m + durationMonths, Math.min(start.getUTCDate(), lastDay) - 1)).toISOString().slice(0, 10);
    }
    return new Date(Date.UTC(y, m + durationMonths, 0)).toISOString().slice(0, 10);
  })();

  const isFormal = durationMonths >= 3;

  // Çakışma her render'da YENİDEN hesaplanan bir TÜRETİLMİŞ değerdir (state
  // DEĞİL) — tarih/süre alanı her değiştiğinde otomatik güncellenir, asla
  // eski/stale bir sunucu hata mesajı olarak TAKILI KALMAZ.
  const hasOverlap =
    isRenewal && isValidDateOnlyInput(enrollmentStartDate)
      ? new Date(enrollmentStartDate).getTime() < new Date(previousContract!.enrollmentEndDate).getTime()
      : false;

  // Faz 2C — istisna alanının GÖRÜNÜRLÜĞÜ, en son önizlemenin (`preview`)
  // ÖNBELLEĞİNDEN DEĞİL, GÜNCEL form girdilerinden (ödeme yöntemi + ilk
  // taksit tarihi) her render'da YENİDEN hesaplanır. Bu, "ödeme yöntemi/
  // tarih değiştirildiğinde eski görünürlük takılı kalıyor" hatasını
  // YAPISAL olarak imkansız kılar — kart→EFT→kart, standart→istisna→
  // standart geçişleri her zaman doğru sonucu verir, önizleme butonuna
  // basılmasını BEKLEMEZ.
  const dueRule = describePaymentDueRule(paymentMethod);
  const firstDueDay = dayOfMonthUtc(toIsoDateOrNull(firstDueDate));
  const firstDueDateKnownInvalid = firstDueDate !== "" && firstDueDay === null;
  // P0 (2026-09-05) — kurumun düzenli ödeme penceresi (kart 1-5, nakit/EFT
  // 1-15) yalnız SONRAKİ dönem taksitleri içindir; ilk tahsilat serbest
  // tarihlidir (bkz. contracts.ts createContract aynı gerekçe) — bu yüzden
  // ilk taksit tarihi için artık "istisna gerekçesi" zorunluluğu YOK.
  // Owner policy — kayıt anı tahsilat tarihi, kayıt (enrollmentStartDate) tarihinden FARKLIYSA
  // istisnai/gecikmeli kayıt sayılır. Bu, yukarıdaki firstDueDate PENCERE kontrolünden AYRI bir
  // kontrol — sırf ilk taksit vadesi ayın 5/15'inden sonraysa bu alan GÖSTERİLMEZ.
  const firstPaymentDateNeedsException =
    isFormal &&
    isRenewal &&
    isValidDateOnlyInput(firstPaymentCollectedAt) &&
    isValidDateOnlyInput(enrollmentStartDate) &&
    firstPaymentCollectedAt !== enrollmentStartDate;

  const [preview, setPreview] = useState<{
    totalContractAmount: number;
    installments: InstallmentPreviewRow[];
    paymentDueRuleText: string;
    enrollmentEndDate?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const formTitleId = useId();

  function focusSummarySoon() {
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  async function onPreview() {
    setFormError(null);
    if (!durationMonths || !monthlyAmount || !installmentCount || !isValidDateOnlyInput(firstDueDate)) {
      setFormError("Süre, aylık ücret, taksit sayısı ve ilk vade tarihi zorunlu.");
      focusSummarySoon();
      return;
    }
    setBusy(true);
    const res = await postJson<{
      totalContractAmount: number;
      installments: InstallmentPreviewRow[];
      isFormal: boolean;
      paymentDueRuleText: string;
      firstDueDateInWindow: boolean;
      enrollmentEndDate?: string;
    }>("/api/v1/contracts/preview-plan", {
      durationMonths,
      monthlyAmount,
      installmentCount,
      firstDueDate,
      depositAmount: depositAmount === "" ? undefined : depositAmount,
      paymentMethod,
      usePerLessonBilling,
      endDatePreference,
      studentId,
      enrollmentStartDate: toIsoDateOrNull(enrollmentStartDate) ?? undefined,
      enrollmentEndDate: toIsoDateOrNull(enrollmentEndDate) ?? undefined,
      lastPeriodPricingMode: usePerLessonBilling ? lastPeriodPricingMode : undefined,
      lastPeriodManualAmount:
        usePerLessonBilling && lastPeriodPricingMode === "manual" && lastPeriodManualAmount !== ""
          ? lastPeriodManualAmount
          : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setFormError(res.message);
      focusSummarySoon();
      return;
    }
    setPreview(res.data);
  }

  /** Faz 5C/5D — TÜM alanları denetler, alan-bazlı Türkçe hata döner. Sunucu doğrulaması OTORİTE olarak KALIR; bu yalnızca görünür, erken geri bildirimdir. */
  function validateForm(): FieldErrors {
    const errors: FieldErrors = {};
    if (!programmeName.trim()) errors.programmeName = "Program/enstrüman zorunludur.";
    if (!isValidDateOnlyInput(enrollmentStartDate)) errors.enrollmentStartDate = "Sözleşme başlangıç tarihi zorunludur.";
    if (!durationMonths || durationMonths < 1 || durationMonths > 12) {
      errors.durationMonths = "Süre 1-12 ay arasında olmalıdır.";
    }
    if (!monthlyAmount || monthlyAmount <= 0) errors.monthlyAmount = "Aylık ücret zorunludur.";
    if (!installmentCount || installmentCount < 1 || installmentCount > 12) {
      errors.installmentCount = "Taksit sayısı 1-12 arasında olmalıdır.";
    }
    if (!isValidDateOnlyInput(firstDueDate)) {
      errors.firstDueDate = "İlk ödeme tarihi zorunludur.";
    }
    if (!paymentMethod) errors.paymentMethod = "Ödeme yöntemi seçilmelidir.";
    if (isFormal && isRenewal) {
      // Owner policy — yenileme imzası anında tahsil edilmeden yenileme tamamlanamaz. İlk
      // (initial) sözleşmede bu ödeme kayıt sırasında zaten alınmıştır (reuseFirstPaymentId).
      if (!firstPaymentMethod) errors.firstPaymentMethod = "İlk ödeme yöntemi seçilmelidir.";
      if (!firstPaymentAmount || firstPaymentAmount <= 0) {
        errors.firstPaymentAmount = "Kayıt anında tahsil edilen tutar sıfırdan büyük olmalıdır.";
      }
      if (!isValidDateOnlyInput(firstPaymentCollectedAt)) {
        errors.firstPaymentCollectedAt = "İlk ödeme tarihi zorunludur.";
      } else if (firstPaymentDateNeedsException && !firstPaymentDateExceptionReason.trim()) {
        errors.firstPaymentCollectedAt =
          "İlk ödeme sözleşme başlangıç tarihinden farklı — istisnai/gecikmeli kayıt gerekçesi zorunludur.";
      }
    }
    if (usePerLessonBilling && lastPeriodPricingMode === "manual" && (!lastPeriodManualAmount || lastPeriodManualAmount <= 0)) {
      errors.lastPeriodManualAmount = "Son dönem tutarı manuel seçildiğinde sıfırdan büyük bir tutar girilmelidir.";
    }
    if (!signatoryFullName.trim()) errors.signatoryFullName = "Yasal imza sahibi adı soyadı zorunludur.";
    if (isRenewal && hasOverlap) {
      if (!allowOverlap) {
        errors.overlap = "Yeni başlangıç tarihi önceki sözleşmenin bitişiyle çakışıyor — kasıtlı örtüşmeye izin verin veya tarihi düzeltin.";
      } else if (!overlapReason.trim()) {
        errors.overlapReason = "Örtüşme gerekçesi zorunludur.";
      }
    }
    return errors;
  }

  async function onCreate() {
    if (busy) return; // Faz 5E — çift tıklamada ikinci istek başlatılmaz.
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError(isRenewal ? "Sözleşme yenileme bilgilerini tamamlayın." : "Sözleşme bilgilerini tamamlayın.");
      focusSummarySoon();
      return; // Faz 5B — DOĞRULAMA BAŞARISIZ OLDUĞUNDA hiçbir istek/serileştirme YAPILMAZ — girdi asla silinmez.
    }
    setFieldErrors({});
    setFormError(null);
    setBusy(true);
    const res = await postJson("/api/v1/contracts", {
      studentId,
      contractType: isRenewal ? "renewal" : "initial",
      previousContractId: previousContract?.id,
      programmeName: programmeName.trim(),
      lessonScheduleText: lessonScheduleText.trim() || undefined,
      enrollmentStartDate: toIsoDateOrNull(enrollmentStartDate),
      enrollmentEndDate: toIsoDateOrNull(enrollmentEndDate),
      durationMonths,
      monthlyAmount,
      installmentCount,
      usePerLessonBilling,
      endDatePreference,
      lastPeriodPricingMode: usePerLessonBilling ? lastPeriodPricingMode : undefined,
      lastPeriodManualAmount:
        usePerLessonBilling && lastPeriodPricingMode === "manual" && lastPeriodManualAmount !== ""
          ? lastPeriodManualAmount
          : undefined,
      firstDueDate: toIsoDateOrNull(firstDueDate),
      depositAmount: depositAmount === "" ? undefined : depositAmount,
      paymentMethod,
      signatoryFullName: signatoryFullName.trim(),
      signatoryNationalId: signatoryNationalId.trim() || undefined,
      signatoryAddress: signatoryAddress.trim() || undefined,
      signatoryRelationship,
      allowOverlap,
      overlapReason: overlapReason.trim() || undefined,
      firstPaymentExceptionReason:
        (firstPaymentDateNeedsException ? firstPaymentDateExceptionReason.trim() : "") || undefined,
      firstPaymentCollected: isFormal && isRenewal
        ? {
            method: firstPaymentMethod,
            amount: firstPaymentAmount === "" ? 0 : firstPaymentAmount,
            collectedAt: toIsoDateOrNull(firstPaymentCollectedAt),
            reference: firstPaymentReference.trim() || undefined,
            note: firstPaymentNote.trim() || undefined,
          }
        : undefined,
      photoVideoConsent:
        photoConsent === "unset"
          ? undefined
          : {
              granted: photoConsent === "granted",
              representativeName: signatoryFullName.trim(),
              relationship: signatoryRelationship,
              scopes: photoConsent === "granted" ? Array.from(photoScopes) : undefined,
            },
      kvkkNoticeDelivered,
    });
    setBusy(false);
    if (!res.ok) {
      // Faz 5D — sunucu hatası GÖRÜNÜR şekilde gösterilir, girilen veriler SİLİNMEZ, kullanıcı düzeltip tekrar deneyebilir.
      setFormError(res.message);
      focusSummarySoon();
      return;
    }
    router.refresh();
    onDone();
  }

  const hasAnyError = formError !== null || Object.keys(fieldErrors).length > 0;

  return (
    <Card className="mb-4 !p-4">
      <p className="mb-1 text-sm font-semibold text-[var(--color-text)]" id={formTitleId}>
        {isRenewal
          ? `Sözleşme Yenile / Süre Uzat — Gözden Geçir (önceki: ${previousContract!.contractNumber})`
          : "Yeni Kayıt Sözleşmesi — Gözden Geçir ve Oluştur"}
      </p>
      {isRenewal ? (
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          Önceki sözleşme: {previousContract!.contractNumber} · {STATUS_LABELS[previousContract!.status] ?? previousContract!.status} ·{" "}
          {formatDateTr(previousContract!.enrollmentStartDate)} – {formatDateTr(previousContract!.enrollmentEndDate)} ·{" "}
          {formatTL(previousContract!.monthlyAmount)}/ay. Yeni dönem aşağıda önceki tutar/yöntemle ÖN DOLDURULDU —
          gerekirse değiştirin. Önceki sözleşme değişmeden, ayrı bir sürüm olarak arşivde kalır.
        </p>
      ) : null}
      {!isRenewal && registration ? (
        <RegistrationSummaryCard
          studentId={studentId}
          registration={registration}
          current={{ startDay: enrollmentStartDate, monthlyAmount, paymentMethod, durationMonths }}
        />
      ) : null}

      {hasAnyError ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          aria-labelledby={formTitleId}
          className="mb-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs dark:border-rose-900 dark:bg-rose-950/30"
        >
          <p className="font-semibold text-rose-800 dark:text-rose-300">{formError ?? "Aşağıdaki alanları düzeltin."}</p>
          {Object.keys(fieldErrors).length > 0 ? (
            <ul className="mt-1 list-inside list-disc text-rose-700 dark:text-rose-300">
              {Object.values(fieldErrors).map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Program / Enstrüman</Label>
          <Input
            value={programmeName}
            onChange={(e) => setProgrammeName(e.target.value)}
            placeholder="Piyano"
            aria-invalid={!!fieldErrors.programmeName}
          />
          <FieldError message={fieldErrors.programmeName} />
        </div>
        <div>
          <Label>Sözleşme başlangıç tarihi</Label>
          <Input
            type="date"
            value={enrollmentStartDate}
            onChange={(e) => setEnrollmentStartDate(e.target.value)}
            aria-invalid={!!fieldErrors.enrollmentStartDate}
          />
          <FieldError message={fieldErrors.enrollmentStartDate} />
        </div>
        <div>
          <Label>Süre (ay, 1-12)</Label>
          <Input
            type="number"
            min={1}
            max={12}
            value={durationMonths}
            onChange={(e) => setDurationMonths(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
            aria-invalid={!!fieldErrors.durationMonths}
          />
          <FieldError message={fieldErrors.durationMonths} />
        </div>
        <div>
          <Label>Sözleşme bitiş tercihi</Label>
          <select
            value={endDatePreference}
            onChange={(e) => setEndDatePreference(e.target.value as "month_end" | "date_based")}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
          >
            <option value="month_end">Takvim ayı sonuna kadar</option>
            <option value="date_based">Başlangıç tarihinden itibaren</option>
          </select>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            İki seçenekte de taksit sayısı süre kadardır; son aydan taşan günler son taksite eklenir.
          </p>
        </div>
        <div>
          <Label>Sözleşme bitiş tarihi (otomatik)</Label>
          <Input type="date" value={enrollmentEndDate} disabled />
          {/* Sunucu (createStudentContractTool) birleşik ilk tahsilatta bitişi kayıt ayını 1. ay sayarak kısaltır — önizleme bunu görünür kılar. */}
          {preview?.enrollmentEndDate && preview.enrollmentEndDate.slice(0, 10) !== enrollmentEndDate ? (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              İlk tahsilat kayıt ayı + takip eden ay olarak birleştirildiği için sözleşme{" "}
              {formatDateTr(preview.enrollmentEndDate)} tarihinde biter.
            </p>
          ) : null}
        </div>
        {usePerLessonBilling ? (
          <div className="sm:col-span-2">
            <Label>Son dönemde eksik kalan dersler nasıl ücretlendirilsin?</Label>
            <div className="mt-1 space-y-1.5">
              {(
                [
                  { value: "remaining_lessons", label: "Kalan ders sayısına göre hesapla (varsayılan)" },
                  { value: "regular_fee", label: "Normal dönem ücreti uygula" },
                  { value: "manual", label: "Son dönem tutarını manuel belirle" },
                ] as const
              ).map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                  <input
                    type="radio"
                    name="lastPeriodPricingMode"
                    value={opt.value}
                    checked={lastPeriodPricingMode === opt.value}
                    onChange={() => setLastPeriodPricingMode(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {lastPeriodPricingMode === "manual" ? (
              <div className="mt-2">
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Son dönem tutarı (TL)"
                  value={lastPeriodManualAmount === "" ? "" : String(lastPeriodManualAmount)}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^0-9]/g, "");
                    setLastPeriodManualAmount(digits === "" ? "" : Number(digits));
                  }}
                  aria-invalid={!!fieldErrors.lastPeriodManualAmount}
                />
                <FieldError message={fieldErrors.lastPeriodManualAmount} />
              </div>
            ) : null}
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              Bu seçim yalnızca sözleşmenin son dönemindeki tahsilatı etkiler.
            </p>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs">
            {isFormal ? (
              <>
                <p className="font-medium text-amber-800 dark:text-amber-300">Formal sözleşme oluşturulmaya hazır (3-12 ay).</p>
                <p className="mt-1 text-[var(--color-text-muted)]">
                  Yaşam döngüsü: Taslak/inceleme → Oluşturuldu → PDF önizleme → Yazdırıldı → Islak imza bekleniyor →
                  İmzalandı. PDF üretimi TEK BAŞINA ıslak imza yerine GEÇMEZ — fiziksel imza gereklidir.
                </p>
              </>
            ) : (
              <p className="font-medium text-sky-800 dark:text-sky-300">
                Tanışma Paketi — Formal sözleşme gerekmiyor. Yalnızca kayıt/ödeme planı kaydedilir, resmi sözleşme
                PDF&apos;i üretilmez.
              </p>
            )}
          </div>
        </div>
        <div>
          <Label>Aylık ücret (TL)</Label>
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Örn. 3000"
            value={monthlyAmount === "" ? "" : String(monthlyAmount)}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, "");
              setMonthlyAmount(digits === "" ? "" : Number(digits));
            }}
            aria-invalid={!!fieldErrors.monthlyAmount}
          />
          <FieldError message={fieldErrors.monthlyAmount} />
        </div>
        <div>
          <Label>Taksit sayısı (1-12)</Label>
          <Input
            type="number"
            min={1}
            max={12}
            value={installmentCount}
            onChange={(e) => setInstallmentCount(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
            aria-invalid={!!fieldErrors.installmentCount}
          />
          <FieldError message={fieldErrors.installmentCount} />
        </div>
        <div>
          <Label>Ödeme yöntemi</Label>
          <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} aria-invalid={!!fieldErrors.paymentMethod}>
            <option value="cash">Nakit</option>
            <option value="credit_card">Kredi kartı</option>
            <option value="transfer">Havale/EFT</option>
          </Select>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">{dueRule.ruleText}</p>
          <FieldError message={fieldErrors.paymentMethod} />
        </div>
        <div>
          <Label>İlk ödeme tarihi</Label>
          <Input
            type="date"
            value={firstDueDate}
            onChange={(e) => setFirstDueDate(e.target.value)}
            aria-invalid={!!fieldErrors.firstDueDate}
          />
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            İlk tahsilat herhangi bir günde alınabilir — yukarıdaki ödeme kuralı yalnız sonraki dönem taksitleri için geçerlidir.
          </p>
          <FieldError message={fieldErrors.firstDueDate} />
          {firstDueDateKnownInvalid ? <FieldError message="Geçersiz tarih." /> : null}
        </div>
        <div>
          <Label>Kaparo / depozito (opsiyonel, TL)</Label>
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Opsiyonel"
            value={depositAmount === "" ? "" : String(depositAmount)}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, "");
              setDepositAmount(digits === "" ? "" : Number(digits));
            }}
          />
        </div>
        <div>
          <Label>İmzalayan ad-soyad (veli veya 18+ öğrenci)</Label>
          <Input
            value={signatoryFullName}
            onChange={(e) => setSignatoryFullName(e.target.value)}
            aria-invalid={!!fieldErrors.signatoryFullName}
          />
          <FieldError message={fieldErrors.signatoryFullName} />
        </div>
        <div>
          <Label>İmzalayan kimliği</Label>
          <Select value={signatoryRelationship} onChange={(e) => setSignatoryRelationship(e.target.value as "veli" | "öğrenci")}>
            <option value="veli">Veli</option>
            <option value="öğrenci">Öğrenci (18 yaş+)</option>
          </Select>
        </div>
        <div>
          <Label>T.C. Kimlik No (opsiyonel)</Label>
          <Input value={signatoryNationalId} onChange={(e) => setSignatoryNationalId(e.target.value)} />
        </div>
        <div>
          <Label>Adres (opsiyonel)</Label>
          <Input value={signatoryAddress} onChange={(e) => setSignatoryAddress(e.target.value)} />
        </div>
      </div>

      {isFormal && !isRenewal ? (
        <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-xs text-[var(--color-text-muted)]">
          İlk ödeme, öğrenci kaydı sırasında zaten tahsil edildi — bu sözleşme o ödeme kaydını
          kullanır, yeniden tahsilat girilmez.
        </div>
      ) : null}

      {isFormal && isRenewal ? (
        <fieldset className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
          <legend className="px-1 text-xs font-semibold text-[var(--color-text)]">
            İlk Ödeme / Yenileme Anı Tahsilatı
          </legend>
          <p className="mb-2 text-[11px] text-[var(--color-text-muted)]">
            İlk taksit her zaman yenileme imzası anında alınır — yenileme, gerçekten tahsil edilen
            bir ödeme olmadan tamamlanamaz.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Ödeme yöntemi</Label>
              <Select
                id="firstPaymentMethod"
                value={firstPaymentMethod}
                onChange={(e) => setFirstPaymentMethod(e.target.value)}
                aria-invalid={!!fieldErrors.firstPaymentMethod}
              >
                <option value="cash">Nakit</option>
                <option value="credit_card">Kredi kartı</option>
                <option value="transfer">Havale/EFT</option>
              </Select>
              <FieldError message={fieldErrors.firstPaymentMethod} />
            </div>
            <div>
              <Label>Tahsil edilen tutar (TL)</Label>
              <Input
                id="firstPaymentAmount"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Örn. 3000"
                value={firstPaymentAmount === "" ? "" : String(firstPaymentAmount)}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, "");
                  setFirstPaymentAmount(digits === "" ? "" : Number(digits));
                }}
                aria-invalid={!!fieldErrors.firstPaymentAmount}
              />
              <FieldError message={fieldErrors.firstPaymentAmount} />
            </div>
            <div>
              <Label>Ödeme tarihi</Label>
              <Input
                id="firstPaymentCollectedAt"
                type="date"
                value={firstPaymentCollectedAt}
                onChange={(e) => setFirstPaymentCollectedAt(e.target.value)}
                aria-invalid={!!fieldErrors.firstPaymentCollectedAt}
              />
              <FieldError message={fieldErrors.firstPaymentCollectedAt} />
            </div>
            <div>
              <Label>Referans/işlem no (opsiyonel)</Label>
              <Input
                id="firstPaymentReference"
                value={firstPaymentReference}
                onChange={(e) => setFirstPaymentReference(e.target.value.slice(0, 100))}
                maxLength={100}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Personel notu (opsiyonel)</Label>
              <Input
                id="firstPaymentNote"
                value={firstPaymentNote}
                onChange={(e) => setFirstPaymentNote(e.target.value.slice(0, 500))}
                maxLength={500}
              />
            </div>
          </div>
          {firstPaymentDateNeedsException ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/30">
              <Label>İstisnai ilk ödeme tarihi gerekçesi (gecikmeli/geç kayıt)</Label>
              <p className="mb-2 text-[var(--color-text-muted)]">
                İlk ödeme tarihi sözleşme başlangıç tarihinden farklı — yalnızca yetkili onaylı, gecikmeli/geriye
                dönük kayıt durumları için doldurun.
              </p>
              <Input
                placeholder="Örn. Öğrenci 3 gün sonra ödeme yapabildi, veli ile mutabık kalındı."
                value={firstPaymentDateExceptionReason}
                onChange={(e) => setFirstPaymentDateExceptionReason(e.target.value.slice(0, 500))}
                maxLength={500}
                aria-invalid={!!fieldErrors.firstPaymentCollectedAt}
              />
            </div>
          ) : null}
        </fieldset>
      ) : null}

      <div className="mt-3">
        <Label>Ders günü / saati (opsiyonel)</Label>
        {prefill?.lessonScheduleText ? (
          <p className="mb-1 text-[11px] text-[var(--color-text-muted)]">
            Kayıttaki ders programından otomatik dolduruldu — gerekirse düzenleyebilirsiniz.
          </p>
        ) : null}
        <LessonScheduleSlotsPicker value={lessonScheduleText} onChange={setLessonScheduleText} />
      </div>

      <div className="mt-3">
        <Label>Fotoğraf/Video Açık Rıza Formu (Madde 19 — ayrı belge)</Label>
        <Select value={photoConsent} onChange={(e) => setPhotoConsent(e.target.value as typeof photoConsent)}>
          <option value="unset">Belirtilmedi</option>
          <option value="granted">İzin veriyorum</option>
          <option value="denied">İzin vermiyorum</option>
        </Select>
        {photoConsent === "granted" ? (
          <div className="mt-2 space-y-1.5 rounded-lg border border-[var(--color-border)] p-2.5 text-xs">
            <p className="font-medium text-[var(--color-text)]">İzin verilen kanallar (her biri ayrı değerlendirilir):</p>
            {PHOTO_VIDEO_CONSENT_CHANNELS.map((c) => (
              <label key={c.value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={photoScopes.has(c.value)}
                  onChange={(e) => {
                    const next = new Set(photoScopes);
                    if (e.target.checked) next.add(c.value);
                    else next.delete(c.value);
                    setPhotoScopes(next);
                  }}
                />
                {c.label}
              </label>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-3">
        <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
          <input type="checkbox" checked={kvkkNoticeDelivered} onChange={(e) => setKvkkNoticeDelivered(e.target.checked)} />
          KVKK Aydınlatma Metni ayrıca teslim edildi / bilgilendirme yapıldı (Madde 20 — açık rıza DEĞİL, yalnızca teslimat kaydı)
        </label>
      </div>

      {hasOverlap ? (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs dark:border-rose-900 dark:bg-rose-950/30">
          <p className="font-medium text-rose-700 dark:text-rose-300">
            Yeni başlangıç tarihi ({formatDateTr(enrollmentStartDate)}), önceki sözleşmenin bitiş tarihinden (
            {formatDateTr(previousContract!.enrollmentEndDate)}) ÖNCE — tarihler çakışıyor.
          </p>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" checked={allowOverlap} onChange={(e) => setAllowOverlap(e.target.checked)} />
            Kasıtlı örtüşmeye izin ver
          </label>
          {allowOverlap ? (
            <>
              <Input
                className="mt-2"
                placeholder="Örtüşme gerekçesi (zorunlu)"
                value={overlapReason}
                onChange={(e) => setOverlapReason(e.target.value)}
                aria-invalid={!!fieldErrors.overlapReason}
              />
              <FieldError message={fieldErrors.overlapReason} />
            </>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" onClick={onPreview} disabled={busy} className="!bg-slate-600 hover:!bg-slate-700">
          Ödeme Planını Önizle
        </Button>
        <Button type="button" onClick={() => void onCreate()} disabled={busy}>
          {busy
            ? "İşleniyor…"
            : isFormal
              ? isRenewal
                ? "Sözleşmeyi Onayla ve Yenile"
                : "Sözleşmeyi Onayla ve Oluştur"
              : isRenewal
                ? "Tanışma Uzatmasını Kaydet"
                : "Tanışma Kaydını Oluştur"}
        </Button>
        <Button type="button" onClick={onCancel} disabled={busy} className="!bg-transparent !text-[var(--color-text-muted)] hover:!bg-[var(--color-surface-muted)]">
          Vazgeç
        </Button>
      </div>

      {preview ? (
        <div className="mt-4 rounded-lg border border-[var(--color-border)] p-3 text-xs">
          <p className="mb-2 font-semibold text-[var(--color-text)]">
            Toplam sözleşme tutarı: {formatTL(preview.totalContractAmount)}
          </p>
          {/* Sahibi onaylı NİHAİ karar (2026-08-29) — tüm müşteriye-görünür tutarlar KDV
              dahildir, "+ KDV" hiçbir yerde gösterilmez, oran icat edilmez. */}
          <p className="mb-2 text-[var(--color-text-muted)]">Tüm eğitim ücretleri KDV dahildir.</p>
          <p className="mb-2 text-[var(--color-text-muted)]">{preview.paymentDueRuleText}</p>
          {/* P0 (2026-09-05) — kullanıcı raporu: "ilk tahsilat tutarı ile aylık
              dönem ücreti karışıyor". Bu dört alan HER ZAMAN ayrı ayrı,
              tabloyu okumaya gerek kalmadan görünmeli — hepsi preview'daki
              AYNI kaynaktan (installments[0] = TEK gerçek ilk tahsilat satırı). */}
          {preview.installments[0] ? (
            <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5 sm:grid-cols-4">
              <div>
                <dt className="text-[var(--color-text-muted)]">İlk Tahsilat Tutarı</dt>
                <dd className="font-semibold text-[var(--color-text)]">{formatTL(preview.installments[0].amount)}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-muted)]">İlk Tahsilat Tarihi</dt>
                <dd className="font-semibold text-[var(--color-text)]">{formatDateTr(preview.installments[0].dueDate)}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-muted)]">Aylık Dönem Ücreti</dt>
                <dd className="font-semibold text-[var(--color-text)]">{formatTL(monthlyAmount === "" ? 0 : monthlyAmount)}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-muted)]">Kalan Borç</dt>
                <dd className="font-semibold text-[var(--color-text)]">
                  {formatTL(preview.installments.slice(1).reduce((s, r) => s + r.amount, 0))}
                </dd>
              </div>
            </dl>
          ) : null}
          <table className="w-full text-left">
            <thead>
              <tr className="text-[var(--color-text-muted)]">
                <th className="pr-2">Sıra</th>
                <th className="pr-2">Tahsilat türü</th>
                <th className="pr-2">Kapsanan dönem</th>
                <th className="pr-2">Vade</th>
                <th>Tutar</th>
              </tr>
            </thead>
            <tbody>
              {preview.installments.map((row) => (
                <tr key={row.sequence} className="align-top">
                  <td className="pr-2 py-1">{row.kind === "first_collection_combined" ? "1–2" : row.sequence}</td>
                  <td className="pr-2 py-1">
                    {row.kind ? INSTALLMENT_KIND_LABELS[row.kind] ?? row.kind : "—"}
                    {row.computationSource === "manual" ? (
                      <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                        manuel düzenlendi
                      </span>
                    ) : row.kind ? (
                      <span className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        otomatik hesaplandı
                      </span>
                    ) : null}
                  </td>
                  <td className="pr-2 py-1">
                    {row.periodLabel ?? "—"}
                    {row.breakdown ? (
                      <ul className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
                        {row.breakdown.map((b) => (
                          <li key={b.periodLabel}>
                            {b.periodLabel}: {formatTL(b.amount)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                  <td className="pr-2 py-1">{formatDateTr(row.dueDate)}</td>
                  <td className="py-1">{formatTL(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}

export function ContractPanel({
  studentId,
  contracts,
  canManage,
  autoOpenInitial,
  prefill,
  registration,
}: {
  studentId: string;
  contracts: ContractRow[];
  canManage: boolean;
  /** Faz 4 — yeni öğrenci kaydından hemen sonra "Sözleşmeyi Gözden Geçir ve Oluştur" akışı için formu doğrudan açık başlatır. */
  autoOpenInitial?: boolean;
  prefill?: ContractPrefill;
  registration?: RegistrationSummary;
}) {
  const router = useRouter();
  const [formMode, setFormMode] = useState<"none" | "initial" | "renewal">(
    autoOpenInitial && canManage ? "initial" : "none"
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  // Faz 5 (kök neden) — sözleşme YENİLEME için önceki sözleşme YALNIZCA
  // aktif (iptal edilmemiş/yenilenmemiş) olabilir; sunucu (createContract)
  // zaten "İptal edilmiş veya zaten yenilenmiş bir sözleşme tekrar
  // yenilenemez" der. Eski kod `latest = contracts.find(aktif) ??
  // contracts[0]` idi — TÜM sözleşmeler iptal/yenilenmişse bu SESSİZCE
  // iptal edilmiş bir sözleşmeyi "önceki sözleşme" olarak seçiyor, "Sözleşme
  // Yenile" butonunu YANILTICI biçimde gösteriyor ve formu boş
  // `firstDueDate` ile açıyordu (çökme kök nedeni). "GÜNCEL" rozeti/geçmiş
  // gösterimi (salt görsel) ile YENİLEME UYGUNLUĞU (aksiyon) artık AYRI
  // değişkenlerdir.
  const mostRecentForDisplay = contracts[0] ?? null;
  const latestActive = findLatestActiveContractForRenewal(contracts);
  const hasOnlyInactiveHistory = contracts.length > 0 && !latestActive;

  async function runAction(id: string, path: string) {
    setBusyId(id);
    setRowError(null);
    const res = await postJson(`/api/v1/contracts/${id}/${path}`, {});
    setBusyId(null);
    if (!res.ok) {
      setRowError(res.message);
      return;
    }
    router.refresh();
  }

  async function onUploadSigned(id: string, file: File) {
    setUploadingId(id);
    setRowError(null);
    const fileData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
      reader.onerror = () => reject(new Error("Dosya okunamadı"));
      reader.readAsDataURL(file);
    });
    const res = await postJson(`/api/v1/contracts/${id}/upload-signed`, {
      fileName: file.name,
      fileMimeType: file.type,
      fileData,
    });
    setUploadingId(null);
    if (!res.ok) {
      setRowError(res.message);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {canManage && formMode === "none" ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {!latestActive ? (
            <Button type="button" onClick={() => setFormMode("initial")}>
              Yeni Kayıt Sözleşmesi Oluştur
            </Button>
          ) : (
            <Button type="button" onClick={() => setFormMode("renewal")}>
              Sözleşme Yenile / Süre Uzat
            </Button>
          )}
          {hasOnlyInactiveHistory ? (
            <span className="text-xs text-[var(--color-text-muted)]">
              Bu öğrencinin aktif bir sözleşmesi yok (geçmişte iptal edilmiş/yenilenmiş) — yeni bir İLK KAYIT
              sözleşmesi oluşturulacak.
            </span>
          ) : null}
        </div>
      ) : null}

      {formMode === "initial" ? (
        <ContractForm
          studentId={studentId}
          previousContract={null}
          prefill={prefill}
          registration={registration}
          onDone={() => setFormMode("none")}
          onCancel={() => setFormMode("none")}
        />
      ) : null}
      {formMode === "renewal" && latestActive ? (
        <ContractForm
          studentId={studentId}
          previousContract={latestActive}
          onDone={() => setFormMode("none")}
          onCancel={() => setFormMode("none")}
        />
      ) : null}

      {rowError ? <p className="mb-2 text-xs font-medium text-rose-600">{rowError}</p> : null}

      {contracts.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">Bu öğrenci için henüz kayıt sözleşmesi oluşturulmadı.</p>
      ) : (
        <div className="space-y-2">
          {contracts.map((c) => (
            <Card key={c.id} className="!p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">
                    {c.contractNumber} · v{c.versionNumber} · {CONTRACT_TYPE_LABELS[c.contractType]}
                    {c.id === mostRecentForDisplay?.id ? <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">GÜNCEL</span> : null}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {c.programmeName} · {formatDateTr(c.enrollmentStartDate)} – {formatDateTr(c.enrollmentEndDate)}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Aylık {formatTL(c.monthlyAmount)} · Toplam {formatTL(c.totalContractAmount)} · {c.installmentCount} taksit
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[var(--color-surface-muted)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-muted)]">
                  {STATUS_LABELS[c.status] ?? c.status}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {c.documentInstanceId ? (
                  <Link href={`/sozlesme-yazdir/${c.id}`} target="_blank" className="font-medium text-[var(--color-primary)] hover:underline">
                    Görüntüle / Yazdır
                  </Link>
                ) : (
                  <span className="text-[var(--color-text-muted)]">Tanışma paketi — resmi sözleşme belgesi yok.</span>
                )}
                {canManage && c.status === "generated" ? (
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => runAction(c.id, "print")}
                    className="font-medium text-[var(--color-primary)] hover:underline disabled:opacity-50"
                  >
                    Yazdırıldı olarak işaretle
                  </button>
                ) : null}
                {canManage && c.status === "printed" ? (
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => runAction(c.id, "wet-signature-pending")}
                    className="font-medium text-[var(--color-primary)] hover:underline disabled:opacity-50"
                  >
                    Islak imza bekleniyor olarak işaretle
                  </button>
                ) : null}
                {canManage && (c.status === "printed" || c.status === "wet_signature_pending") ? (
                  <label className="cursor-pointer font-medium text-[var(--color-primary)] hover:underline">
                    {uploadingId === c.id ? "Yükleniyor…" : "İmzalı nüsha yükle"}
                    <input
                      type="file"
                      accept="application/pdf,image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void onUploadSigned(c.id, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                ) : null}
                {canManage && (c.status === "generated" || c.status === "recorded") ? (
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => runAction(c.id, "cancel")}
                    className="font-medium text-rose-600 hover:underline disabled:opacity-50"
                  >
                    İptal et
                  </button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
