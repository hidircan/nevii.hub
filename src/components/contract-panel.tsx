"use client";
import { withReturnTo } from "@/lib/safe-return-to";
import { useCurrentPath } from "@/lib/use-current-path";

import { parseAmountInput } from "@/lib/amount-input";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { LessonScheduleSlotsPicker } from "@/components/lesson-schedule-slots-picker";
import {
  ContractLessonScheduleGenerator,
  type SchedulePickerOption,
} from "@/components/contract-lesson-schedule-generator";
import { ContractCancelDialog } from "@/components/contract-cancel-dialog";
import { parseDateOnlyInput, isValidDateOnlyInput, toIsoDateOrNull, dayOfMonthUtc } from "@/lib/date-input";
import { describePaymentDueRule, paymentMethodLabel } from "@/lib/payment-due-rule-client";
import {
  findLatestActiveContractForRenewal,
  isTerminalContractStatus,
  selectCurrentContract,
  sortContractsForDisplay,
} from "@/lib/contract-list-helpers";
import { prefillFromContract } from "@/lib/contract-prefill";
import { formatDateTr } from "@/lib/timezone";
import { paymentMethodLabelTr } from "@/lib/utils";
import { friendlyApiErrorMessage } from "@/lib/api/friendly-error";
import { actionUpdateStudentProfile } from "@/lib/actions";
import { contractDateGuidance } from "@/lib/contract-date-guidance";
import { clearContractDraft, hasContractDraft, useContractDraft } from "@/lib/contract-draft";

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
  createdAt?: string;
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
  dueDateSource?: "auto" | "manual";
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

/** PATCH — `postJson` ile AYNI oturum yenileme ve anlaşılır hata davranışı. */
async function patchJson(url: string, body: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
  type Json = { ok: boolean; error?: { code?: string; message?: string } };
  const send = async () =>
    (await (
      await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    ).json()) as Json;
  try {
    let json = await send();
    if (json.error?.code === "UNAUTHORIZED") {
      const refreshed = await fetch("/api/v1/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
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
    return { ok: true };
  } catch {
    return { ok: false, message: "Bağlantı hatası. Lütfen tekrar deneyin." };
  }
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
  /** P0 revizyonu — kayıtta GERÇEKTEN alınmış ilk tahsilatın kaydı (kayıt
   * anı ödemesi). Önizlemedeki "İlk Tahsilat Tarihi"/"Ödeme Türü" bu
   * kaynaktan beslenir — ders başlangıç tarihi asla tahsilat tarihi gibi
   * gösterilmez. Yoksa (henüz tahsilat yok) "Henüz tahsil edilmedi" yazılır. */
  firstCollectionAt?: string;
  firstCollectionMethod?: string;
  firstCollectionAmount?: number;
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
  /** C — öğrencinin TEK kanonik ders süresi (dk); sözleşme ekranından da girilebilir/değiştirilebilir. */
  lessonDurationMinutes?: number;
  /** Haftalık düzenli ders adedi — ücret tavanı (haftalık × 4) buradan gelir. */
  weeklyLessonCount?: number;
  monthlyFee: number;
  paymentMethod?: string;
  paymentMethodLabel: string;
  firstPayment?: { paymentId: string; amount: number; paidAt: string; method?: string; methodLabel: string };
  /** Kayıt anında "takip eden ayı da ekle" seçildi mi (Payment.firstCollectionIncludesNextMonth). */
  firstCollectionIncludesNextMonth?: boolean;
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

/** Yerel gün, yyyy-MM-dd (date-only input ile aynı konvansiyon — UTC kayması yok). */
function todayLocalDateOnly(): string {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  onApplyToForm,
}: {
  studentId: string;
  registration: RegistrationSummary;
  current: { startDay: string; monthlyAmount: number | ""; paymentMethod: string; durationMonths: number };
  /** 2026-09-19 — kayıtta düzeltilen süre/ders başlangıcı forma ANINDA yansır; kullanıcı ekrandan çıkmaz. */
  onApplyToForm: (values: { durationMonths: number; lessonStartDay: string }) => void;
}) {
  const router = useRouter();
  // 2026-09-19 — "yukarıdaki bilgileri düzenle" artık bu ekranda: süre ve ders başlangıcı
  // öğrenci kaydına yazılır (Student.intendedDurationMonths / lessonStartDate), form güncellenir.
  const [regEditing, setRegEditing] = useState(false);
  const [regDuration, setRegDuration] = useState(registration.intendedDurationMonths ?? current.durationMonths);
  const [regLessonStart, setRegLessonStart] = useState(registration.contractStartDay ?? current.startDay);
  const [regBusy, setRegBusy] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  async function saveRegistration() {
    if (regBusy) return;
    if (!isValidDateOnlyInput(regLessonStart)) {
      setRegError("Ders başlangıç tarihini takvimden seçin.");
      return;
    }
    setRegBusy(true);
    setRegError(null);
    const res = await actionUpdateStudentProfile({
      studentId,
      intendedDurationMonths: regDuration,
      lessonStartDate: regLessonStart,
    });
    setRegBusy(false);
    if (!res.ok) {
      setRegError(res.message);
      return;
    }
    onApplyToForm({ durationMonths: regDuration, lessonStartDay: regLessonStart });
    setRegEditing(false);
    router.refresh();
  }
  // Sahip kararı (2026-09-16) — kayıt anı ilk tahsilatında hata görülürse kullanıcı
  // ekran değiştirmeden burada düzeltebilir (PATCH /api/v1/payments/:id).
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState<number | "">(registration.firstPayment?.amount ?? "");
  const [editDate, setEditDate] = useState(registration.firstPayment?.paidAt?.slice(0, 10) ?? "");
  const [editMethod, setEditMethod] = useState(registration.firstPayment?.method ?? "cash");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function saveFirstPayment() {
    const paymentId = registration.firstPayment?.paymentId;
    if (!paymentId || editBusy) return;
    if (editAmount === "" || editAmount <= 0) {
      setEditError("Tahsil edilen tutar sıfırdan büyük olmalıdır.");
      return;
    }
    if (!isValidDateOnlyInput(editDate)) {
      setEditError("Tahsilat tarihini takvimden seçin.");
      return;
    }
    setEditBusy(true);
    setEditError(null);
    const res = await patchJson(`/api/v1/payments/${paymentId}`, {
      amount: editAmount,
      paidAt: editDate,
      method: editMethod,
    });
    setEditBusy(false);
    if (!res.ok) {
      setEditError(res.message);
      return;
    }
    setEditing(false);
    // Sayfa sunucudan TAZE okunur: kart, ön doldurulan alanlar ve plan aynı veriyi görür.
    router.refresh();
  }

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
        <button
          type="button"
          onClick={() => setRegEditing((e) => !e)}
          className="font-medium text-[var(--color-primary)] hover:underline"
          aria-expanded={regEditing}
        >
          {regEditing ? "Vazgeç" : "Süre / ders başlangıcını burada düzenle"}
        </button>
      </div>
      {regEditing ? (
        <div className="mb-2 flex flex-wrap items-end gap-2 rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-surface-muted)] p-2">
          <div>
            <Label>Kayıt süresi (ay)</Label>
            <Select value={regDuration} onChange={(e) => setRegDuration(Number(e.target.value))} className="w-40">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m} ay {m <= 2 ? "(Tanışma)" : ""}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Ders başlangıcı</Label>
            <Input type="date" value={regLessonStart} onChange={(e) => setRegLessonStart(e.target.value)} className="w-40" />
          </div>
          <Button type="button" onClick={() => void saveRegistration()} disabled={regBusy}>
            {regBusy ? "Kaydediliyor…" : "Kayda işle ve forma uygula"}
          </Button>
          <p className="w-full text-[11px] text-[var(--color-text-muted)]">
            Öğrenci kaydı güncellenir; aşağıdaki sözleşme formu (süre, sözleşme başlangıcı) aynı anda yenilenir.
            Ücret, ödeme yöntemi ve haftalık ders düzeni için aşağıdaki form alanlarını kullanın.
          </p>
          {regError ? <p className="w-full text-xs font-medium text-rose-600" role="alert">{regError}</p> : null}
        </div>
      ) : null}
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
        <div>
          <dt className="inline text-[var(--color-text-muted)]">Seçilen süre: </dt>
          <dd className="inline">
            {registration.intendedDurationMonths
              ? `${registration.intendedDurationMonths} ay`
              : "kayıtta seçilmemiş — formda varsayılan kullanılıyor"}
          </dd>
        </div>
        {registration.weeklyLessonCount ? (
          <div>
            <dt className="inline text-[var(--color-text-muted)]">Haftalık ders: </dt>
            <dd className="inline">
              {registration.weeklyLessonCount} · ayda en fazla {registration.weeklyLessonCount * 4} ders ücretlendirilir
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="inline text-[var(--color-text-muted)]">Aylık ücret: </dt>
          <dd className="inline">
            {formatTL(registration.monthlyFee)} · {registration.paymentMethodLabel}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="inline text-[var(--color-text-muted)]">İlk tahsilat: </dt>
          <dd className="inline">
            {registration.firstPayment
              ? `${formatTL(registration.firstPayment.amount)} · ${formatDateTr(registration.firstPayment.paidAt)} · ${registration.firstPayment.methodLabel}`
              : "Kayıtta alınmış ilk tahsilat yok — aşağıdaki \"İlk tahsilat\" bölümüne girin; sözleşme ile birlikte kaydedilir."}
            {registration.firstPayment ? (
              <>
                {" · "}
                {registration.firstCollectionIncludesNextMonth
                  ? "takip eden ay dahil"
                  : "yalnız kayıt ayı"}
                <button
                  type="button"
                  onClick={() => setEditing((e) => !e)}
                  className="ml-2 font-medium text-[var(--color-primary)] hover:underline"
                >
                  {editing ? "Vazgeç" : "Düzenle"}
                </button>
              </>
            ) : null}
          </dd>
          {editing && registration.firstPayment ? (
            <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-[var(--color-border)] p-2">
              <div>
                <Label>Tahsil edilen tutar (TL)</Label>
                <Input
                  type="number"
                  min={1}
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value === "" ? "" : Number(e.target.value.replace(/[^\d]/g, "")))}
                  className="w-32"
                />
              </div>
              <div>
                <Label>Tahsilat tarihi</Label>
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="w-40" />
              </div>
              <div>
                <Label>Ödeme yöntemi</Label>
                <Select value={editMethod} onChange={(e) => setEditMethod(e.target.value)} className="w-36">
                  <option value="cash">Nakit</option>
                  <option value="transfer">Havale/EFT</option>
                  <option value="credit_card">Kredi kartı</option>
                </Select>
              </div>
              <Button type="button" onClick={saveFirstPayment} disabled={editBusy}>
                {editBusy ? "Kaydediliyor…" : "Kaydet"}
              </Button>
              {editError ? <p className="w-full text-xs font-medium text-rose-600">{editError}</p> : null}
            </div>
          ) : null}
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

/**
 * B — SÖZLEŞME OLUŞTURULDUKTAN SONRAKİ DURUM (2026-09-20).
 *
 * Kök sorun: `onCreate` başarıda yalnız `router.refresh()` + formu kapat
 * yapıyordu; sunucunun döndürdüğü sözleşme KULLANILMIYORDU. Form kapanınca
 * sayfa kısalıyor, kullanıcı ekranın ortasında kalıyor ve "Sözleşmeyi
 * görüntüle" bağlantısını geçmiş listesinde aramak zorunda kalıyordu.
 *
 * Çözüm: oluşan sözleşme üst bileşene taşınır, formun yerine sabit bir
 * başarı durumu çizilir, görünüme kaydırılır ve sonraki adımlar tek tıkla
 * verilir. Mobilde CTA'lar tam genişlikte alt alta dizilir.
 */
export type CreatedContractSummary = {
  id: string;
  contractNumber: string;
  versionNumber: number;
  programmeName: string;
  enrollmentStartDate: string;
  enrollmentEndDate: string;
  monthlyAmount: number;
  totalContractAmount: number;
  installmentCount: number;
  documentInstanceId?: string;
};

function ContractCreatedPanel({
  contract,
  studentId,
  onDismiss,
  schedulePickers,
  scheduleText,
}: {
  contract: CreatedContractSummary;
  studentId: string;
  onDismiss: () => void;
  schedulePickers?: { teachers: SchedulePickerOption[]; rooms: SchedulePickerOption[]; defaultTeacherId?: string };
  scheduleText?: string;
}) {
  const currentPath = useCurrentPath();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Kullanıcıyı elle kaydırmaya zorlamamak için: panel açılır açılmaz görünür olur.
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      className="mb-4 rounded-[var(--radius-lg)] border p-4 outline-none"
      style={{
        borderColor: "color-mix(in srgb, var(--color-success) 40%, transparent)",
        background: "var(--color-success-soft)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--color-success)" }}>
            Sözleşme oluşturuldu — {contract.contractNumber} (v{contract.versionNumber})
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {contract.programmeName} · {formatDateTr(contract.enrollmentStartDate)} –{" "}
            {formatDateTr(contract.enrollmentEndDate)} · Aylık {formatTL(contract.monthlyAmount)} · Toplam{" "}
            {formatTL(contract.totalContractAmount)} · {contract.installmentCount} taksit
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Sözleşme ve taksit planı kaydedildi; arşivde kalıcıdır.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
        >
          Kapat
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
        <Link
          href={withReturnTo(`/sozlesme-yazdir/${contract.id}`, currentPath)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
        >
          Sözleşmeyi Görüntüle / PDF
        </Link>
        <Link
          href={`/panel/odemeler/${studentId}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
        >
          Ödeme Planını Gör
        </Link>
        <Link
          href={`/panel/ogrenciler/${studentId}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
        >
          Öğrenciye Dön
        </Link>
      </div>

      {/* K — sözleşme onaylandı; ders programı buradan, aynı gün/saatle üretilir. */}
      {schedulePickers && scheduleText ? (
        <div className="mt-3">
          <ContractLessonScheduleGenerator
            contractId={contract.id}
            scheduleText={scheduleText}
            teachers={schedulePickers.teachers}
            rooms={schedulePickers.rooms}
            defaultTeacherId={schedulePickers.defaultTeacherId}
          />
        </div>
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
  /** Oluşan sözleşmeyi ÜST bileşene taşır — başarı ekranı CTA'ları bundan üretilir. */
  onDone: (created: CreatedContractSummary) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const isRenewal = !!previousContract;
  const draftKey = `${studentId}:${previousContract?.id ?? "initial"}`;
  // Taslak yalnız bellekte: yenileme/sekme kapatma onu siler → kaydedilmemiş girdi varken tarayıcı uyarır.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (hasContractDraft(draftKey)) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draftKey]);
  const [programmeName, setProgrammeName] = useContractDraft(draftKey, "programmeName", previousContract?.programmeName ?? prefill?.programmeName ?? "");
  // P0 (2026-09-03) — yalnız YENİ (initial) kayıt akışından, per-lesson
  // fiyatlandırma kullanan bir öğrenci için gelir; yenilemede prefill zaten
  // undefined olduğundan bu her zaman false kalır — eski davranış korunur.
  const usePerLessonBilling = !isRenewal && (prefill?.usePerLessonBilling ?? false);
  const [lessonScheduleText, setLessonScheduleText] = useContractDraft(draftKey, "lessonScheduleText", prefill?.lessonScheduleText ?? "");
  const [enrollmentStartDate, setEnrollmentStartDate] = useContractDraft(draftKey, "enrollmentStartDate", 
    isRenewal
      ? dayAfter(previousContract!.enrollmentEndDate)
      : (prefill?.enrollmentStartDate?.slice(0, 10) ?? "")
  );
  const [durationMonths, setDurationMonths] = useContractDraft(draftKey, "durationMonths", isRenewal ? 3 : (prefill?.durationMonths ?? 1));
  // Bitiş tercihi (bkz. contracts.ts computeContractEndDate) — iki seçenekte de son taksit N. aydadır.
  const [endDatePreference, setEndDatePreference] = useContractDraft<"month_end" | "date_based">(draftKey, "endDatePreference", "month_end");
  // Sahip kararı (2026-09-16) — ilk tahsilat takip eden ayı da kapsıyor mu?
  // Varsayılan, kayıt ekranında verilen ve ödemeye yazılan seçimdir; burada değiştirilebilir.
  const [mergeFirstCollection, setMergeFirstCollection] = useContractDraft(draftKey, "mergeFirstCollection", registration?.firstCollectionIncludesNextMonth ?? false);
  // Önizleme tablosunda elle düzenlenen taksit tutarları (sıra no → tutar).
  const [amountOverrides, setAmountOverrides] = useContractDraft<Record<number, number>>(draftKey, "amountOverrides", {});
  // 2026-09-19 — önizlemede elle değiştirilen vade tarihleri (sıra no → yyyy-MM-dd). Otomatik
  // hesap yeniden çalışsa da (tekrar önizleme) korunur; "↺" ile otomatiğe dönülür.
  const [dueDateOverrides, setDueDateOverrides] = useContractDraft<Record<number, string>>(draftKey, "dueDateOverrides", {});
  // Formdaki süre değişikliği öğrenci kaydına da yazılır (yeniden açınca/yenileyince aynı kalsın).
  const [durationSaveNote, setDurationSaveNote] = useState<string | null>(null);
  // C — ders süresi: öğrenci kaydındaki tek kanonik alan; burada seçilince anında öğrenciye yazılır.
  const [lessonMinutes, setLessonMinutes] = useState<string>(
    registration?.lessonDurationMinutes ? String(registration.lessonDurationMinutes) : ""
  );
  const [lessonMinutesNote, setLessonMinutesNote] = useState<{ ok: boolean; text: string } | null>(null);
  const durationSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // P0 (2026-09-04) — "Sözleşmenin son döneminde eksik kalan dersler nasıl
  // ücretlendirilsin?" — yalnız per-lesson fiyatlandırma (usePerLessonBilling)
  // kullanan öğrenciler için anlamlı; "remaining_lessons" (varsayılan/eski
  // davranış) motorun zaten yaptığı şeydir, DEĞİŞİKLİK YOK.
  const [lastPeriodPricingMode, setLastPeriodPricingMode] = useContractDraft<"remaining_lessons" | "regular_fee" | "manual">(draftKey, "lastPeriodPricingMode", 
    "remaining_lessons"
  );
  const [lastPeriodManualAmount, setLastPeriodManualAmount] = useContractDraft<number | "">(draftKey, "lastPeriodManualAmount", "");
  // P0 (2026-09-03) — `firstPaymentAmount`/`depositAmount` ile AYNI desen
  // (new-student-form.tsx'te de kullanılan proje standardı): başlangıçta
  // BOŞ, "0" görünmez, kullanıcı doğrudan yazar. `!monthlyAmount` guard'ı
  // (validateForm) "" için zaten falsy döner, otomatik 0'a ÇEVİRMEZ.
  const [monthlyAmount, setMonthlyAmount] = useContractDraft<number | "">(draftKey, "monthlyAmount", previousContract?.monthlyAmount ?? prefill?.monthlyAmount ?? "");
  const [installmentCount, setInstallmentCount] = useContractDraft(draftKey, "installmentCount", isRenewal ? 3 : (prefill?.durationMonths ?? 1));
  const [firstDueDate, setFirstDueDate] = useContractDraft(draftKey, "firstDueDate", 
    isRenewal ? dayAfter(previousContract!.enrollmentEndDate) : (prefill?.enrollmentStartDate?.slice(0, 10) ?? "")
  );
  const [depositAmount, setDepositAmount] = useContractDraft<number | "">(draftKey, "depositAmount", "");
  const [paymentMethod, setPaymentMethod] = useContractDraft(draftKey, "paymentMethod", previousContract?.paymentMethod ?? prefill?.paymentMethod ?? "cash");
  // İmzalayan, kayıttaki ödeme/iletişim muhatabından (veli ↔ öğrenci) ve adresten ön doldurulur — aynı bilgi iki kez girilmez.
  const [signatoryFullName, setSignatoryFullName] = useContractDraft(draftKey, "signatoryFullName", previousContract?.signatoryFullName ?? registration?.signatoryName ?? "");
  const [signatoryNationalId, setSignatoryNationalId] = useContractDraft(draftKey, "signatoryNationalId", "");
  const [signatoryAddress, setSignatoryAddress] = useContractDraft(draftKey, "signatoryAddress", registration?.address ?? "");
  const [signatoryRelationship, setSignatoryRelationship] = useContractDraft<"veli" | "öğrenci">(draftKey, "signatoryRelationship", 
    registration?.signatoryRelationship ?? "veli"
  );
  const [photoConsent, setPhotoConsent] = useContractDraft<"granted" | "denied" | "unset">(draftKey, "photoConsent", "unset");
  const [photoScopes, setPhotoScopes] = useContractDraft<Set<string>>(draftKey, "photoScopes", new Set());
  const [kvkkNoticeDelivered, setKvkkNoticeDelivered] = useContractDraft(draftKey, "kvkkNoticeDelivered", false);
  const [allowOverlap, setAllowOverlap] = useContractDraft(draftKey, "allowOverlap", false);
  const [overlapReason, setOverlapReason] = useContractDraft(draftKey, "overlapReason", "");
  // Owner policy (2026-08-29) — "İlk ödeme her zaman kayıt esnasında alınacaktır." Kayıt anı
  // tahsilatı, taksit planındaki 1. taksitin (firstDueDate) ödeme PENCERESİ kontrolünden AYRI bir
  // olgu: bu, paranın GERÇEKTEN ne zaman/hangi yöntemle/ne kadar tahsil edildiğinin kaydıdır.
  const [firstPaymentMethod, setFirstPaymentMethod] = useContractDraft(draftKey, "firstPaymentMethod", paymentMethod);
  const [firstPaymentAmount, setFirstPaymentAmount] = useContractDraft<number | "">(draftKey, "firstPaymentAmount", "");
  // P0 revizyonu — yenileme tahsilatı bu formun gönderildiği AN yapılır; bu
  // yüzden varsayılan tahsilat tarihi DERS BAŞLANGICI (önceki sözleşme bitişi)
  // DEĞİL, bugündür (yerel gün — date-only input ile aynı konvansiyon).
  // Ders başlangıç tarihi ile tahsilat tarihi iki bağımsız kavramdır; form
  // gönderilmeden tarih değiştirilebilir, istisna kuralı aynen korunur.
  // 2026-09-19 — ilk sözleşmede kayıtta tahsilat yoksa (sistemde önceden kayıtlı öğrenci)
  // ilk tahsilat da bu formda girilir; yenilemeyle AYNI alanlar ve AYNI doğrulama.
  const needsFirstPaymentEntryBase = isRenewal || !registration?.firstPayment;
  const [firstPaymentCollectedAt, setFirstPaymentCollectedAt] = useContractDraft(draftKey, "firstPaymentCollectedAt", 
    needsFirstPaymentEntryBase ? todayLocalDateOnly() : enrollmentStartDate
  );
  const [firstPaymentReference, setFirstPaymentReference] = useContractDraft(draftKey, "firstPaymentReference", "");
  const [firstPaymentNote, setFirstPaymentNote] = useContractDraft(draftKey, "firstPaymentNote", "");
  const [firstPaymentDateExceptionReason, setFirstPaymentDateExceptionReason] = useContractDraft(draftKey, "firstPaymentDateExceptionReason", "");

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
  const needsFirstPaymentEntry = isFormal && needsFirstPaymentEntryBase;

  function changeDuration(next: number) {
    setDurationMonths(next);
    // Taksit sayısı süreyle eşitse birlikte ilerler (kullanıcı ayrıca değiştirmediyse).
    if (installmentCount === durationMonths) setInstallmentCount(next);
    if (isRenewal) return;
    if (durationSaveTimer.current) clearTimeout(durationSaveTimer.current);
    durationSaveTimer.current = setTimeout(async () => {
      const res = await actionUpdateStudentProfile({ studentId, intendedDurationMonths: next });
      setDurationSaveNote(res.ok ? `Süre (${next} ay) öğrenci kaydına da işlendi.` : `Süre öğrenci kaydına yazılamadı: ${res.message}`);
    }, 500);
  }

  async function changeLessonMinutes(next: string) {
    setLessonMinutes(next);
    if (!next) return;
    const res = await actionUpdateStudentProfile({ studentId, lessonDurationMinutes: Number(next) });
    setLessonMinutesNote(
      res.ok
        ? { ok: true, text: `Ders süresi ${next} dk olarak öğrenci kaydına işlendi; yeni planlanan dersler bu süreyle açılır.` }
        : { ok: false, text: `Ders süresi kaydedilemedi: ${res.message}` }
    );
    if (res.ok) {
      setPreview(null);
      router.refresh();
    }
  }

  function applyRegistrationEdit(values: { durationMonths: number; lessonStartDay: string }) {
    setDurationMonths(values.durationMonths);
    setInstallmentCount(values.durationMonths);
    if (firstDueDate === enrollmentStartDate) setFirstDueDate(values.lessonStartDay);
    setEnrollmentStartDate(values.lessonStartDay);
    setPreview(null);
    setDurationSaveNote(`Kayıt güncellendi: ${values.durationMonths} ay, ders başlangıcı ${formatDateTr(values.lessonStartDay)}. Planı yeniden önizleyin.`);
  }

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

  const installmentAmountOverrides = Object.entries(amountOverrides)
    .map(([sequence, amount]) => ({ sequence: Number(sequence), amount }))
    // 1. satır formdaki ilk tahsilattan gelir (kayıt anı tahsilatı yoksa) — ayrıca ezilmez.
    .filter((o) => !(o.sequence === 1 && needsFirstPaymentEntry && !isRenewal));
  const installmentDueDateOverrides = Object.entries(dueDateOverrides)
    .filter(([, dueDate]) => isValidDateOnlyInput(dueDate))
    .map(([sequence, dueDate]) => ({ sequence: Number(sequence), dueDate }));
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
    // Owner kuralı — boş ekran + genel cümle YERİNE hangi alanın eksik olduğu
    // alan altında da söylenir (iptal sonrası boş form senaryosunun görünürlüğü).
    const missing: FieldErrors = {};
    if (!durationMonths || durationMonths < 1 || durationMonths > 12) missing.durationMonths = "Süre 1-12 ay arasında olmalıdır.";
    if (!monthlyAmount || monthlyAmount <= 0) missing.monthlyAmount = "Aylık ücret zorunludur.";
    if (!installmentCount || installmentCount < 1 || installmentCount > 12) {
      missing.installmentCount = "Taksit sayısı 1-12 arasında olmalıdır.";
    }
    if (!isValidDateOnlyInput(enrollmentStartDate)) missing.enrollmentStartDate = "Sözleşme başlangıç tarihi zorunludur.";
    if (!isValidDateOnlyInput(firstDueDate)) missing.firstDueDate = "İlk ödeme tarihi zorunludur.";
    if (Object.keys(missing).length > 0) {
      setFieldErrors(missing);
      setFormError(`Ödeme planı hesaplanamadı — eksik alanlar: ${Object.values(missing).join(" ")}`);
      focusSummarySoon();
      return;
    }
    setFieldErrors({});
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
      mergeFirstCollection,
      installmentAmountOverrides,
      installmentDueDateOverrides,
      firstPaymentAmount: needsFirstPaymentEntry && firstPaymentAmount !== "" ? firstPaymentAmount : undefined,
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
    if (needsFirstPaymentEntry) {
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
    const res = await postJson<{ contract: CreatedContractSummary }>("/api/v1/contracts", {
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
      mergeFirstCollection,
      installmentAmountOverrides,
      installmentDueDateOverrides,
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
      firstPaymentCollected: needsFirstPaymentEntry
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
    clearContractDraft(draftKey);
    onDone(res.data.contract);
  }

  // Elle düzenlenen tutarlar uygulanmış satırlar — ekrandaki her toplam bunlardan hesaplanır.
  // İlk sözleşmede kayıt anı tahsilatı yoksa 1. satır = formda girilen ilk tahsilat (tek kaynak):
  // tabloda da, "İlk tahsilat" alanında da AYNI state düzenlenir, sunucu da aynı tutarı yazar.
  const firstRowFollowsEntry = needsFirstPaymentEntry && !isRenewal;
  const liveRows = preview
    ? preview.installments.map((r) => ({
        ...r,
        amount:
          r.sequence === 1 && firstRowFollowsEntry && firstPaymentAmount !== ""
            ? firstPaymentAmount
            : amountOverrides[r.sequence] ?? r.amount,
        dueDate: dueDateOverrides[r.sequence] ?? r.dueDate,
        dueDateManual: dueDateOverrides[r.sequence] !== undefined || r.dueDateSource === "manual",
      }))
    : [];
  const dateNotices = contractDateGuidance({
    registeredAt: registration?.registeredAt,
    lessonStartDay: registration?.contractStartDay,
    contractStartDay: enrollmentStartDate,
    firstPaymentCollectedAt: needsFirstPaymentEntry ? firstPaymentCollectedAt : registration?.firstPayment?.paidAt,
    firstDueDate,
    today: todayLocalDateOnly(),
    installments: liveRows.map((r) => ({ sequence: r.sequence, dueDate: r.dueDate, manual: r.dueDateManual })),
  });
  const liveTotal = liveRows.reduce((s, r) => s + r.amount, 0) + (depositAmount === "" ? 0 : depositAmount);
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
          onApplyToForm={applyRegistrationEdit}
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
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            Ücret ve taksitlerin hesaplandığı gün (genelde ilk ders). Kayıt tarihinden farklı olabilir; geçmiş bir gün de seçilebilir.
          </p>
          <FieldError message={fieldErrors.enrollmentStartDate} />
        </div>
        <div>
          <Label>Süre (ay, 1-12)</Label>
          <Input
            type="number"
            min={1}
            max={12}
            value={durationMonths}
            onChange={(e) => changeDuration(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
            aria-invalid={!!fieldErrors.durationMonths}
          />
          {durationSaveNote ? (
            <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300" aria-live="polite">
              {durationSaveNote}
            </p>
          ) : null}
          <FieldError message={fieldErrors.durationMonths} />
        </div>
        <div>
          <Label>Ders süresi (dk)</Label>
          <Select
            value={lessonMinutes}
            onChange={(e) => void changeLessonMinutes(e.target.value)}
            aria-invalid={!lessonMinutes}
          >
            {!lessonMinutes ? <option value="">Seçin…</option> : null}
            {[30, 40, 50].map((d) => (
              <option key={d} value={d}>
                {d} dk
              </option>
            ))}
          </Select>
          {lessonMinutesNote ? (
            <p
              className={`mt-1 text-[11px] font-medium ${lessonMinutesNote.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700"}`}
              aria-live="polite"
            >
              {lessonMinutesNote.text}
            </p>
          ) : !lessonMinutes ? (
            <p className="mt-1 text-[11px] font-medium" style={{ color: "var(--color-warning)" }}>
              Öğrencinin ders süresi girilmemiş. Buradan seçin; öğrenci kaydına da yazılır.
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              Öğrenci kaydındaki süre. Değiştirirseniz öğrenci kaydı da güncellenir.
            </p>
          )}
        </div>
        {!isRenewal ? (
          <div className="sm:col-span-2">
            <label className="flex items-start gap-2 text-sm text-[var(--color-text)]">
              <input
                type="checkbox"
                checked={mergeFirstCollection}
                onChange={(e) => setMergeFirstCollection(e.target.checked)}
                className="mt-1 h-3.5 w-3.5"
              />
              <span>
                İlk tahsilat takip eden ayı da kapsıyor
                <span className="block text-xs text-[var(--color-text-muted)]">
                  Kayıt ekranındaki seçimden gelir. İşaretliyse 1. taksit kayıt ayı + takip eden ayı kapsar (2 ay
                  sayılır); işaretli değilse takip eden ay ayrı taksit olarak kalır. Değiştirdikten sonra
                  &quot;Ödeme Planını Önizle&quot;ye basın.
                </span>
              </span>
            </label>
          </div>
        ) : null}
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
            onChange={(e) => setMonthlyAmount(parseAmountInput(e.target.value) ?? "")}
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
          <Label>1. taksit vadesi</Label>
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

      {isFormal && !needsFirstPaymentEntry ? (
        <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-xs text-[var(--color-text-muted)]">
          İlk ödeme, öğrenci kaydı sırasında zaten tahsil edildi — bu sözleşme o ödeme kaydını
          kullanır, yeniden tahsilat girilmez.
        </div>
      ) : null}

      {needsFirstPaymentEntry ? (
        <fieldset className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
          <legend className="px-1 text-xs font-semibold text-[var(--color-text)]">
            {isRenewal ? "İlk Ödeme / Yenileme Anı Tahsilatı" : "İlk tahsilat (ilk sözleşme)"}
          </legend>
          <p className="mb-2 text-[11px] text-[var(--color-text-muted)]">
            {isRenewal
              ? "İlk taksit her zaman yenileme imzası anında alınır — yenileme, gerçekten tahsil edilen bir ödeme olmadan tamamlanamaz."
              : "Bu öğrencinin kayıtta alınmış bir ilk tahsilatı yok. Tahsil edilen tutarı ve GERÇEK tahsilat gününü girin; sözleşme ile birlikte ödeme kaydı oluşur ve öğrenci detayı/finans ekranlarında görünür."}
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

      {dateNotices.length > 0 ? (
        <div className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/30" role="status">
          <p className="font-semibold text-amber-900 dark:text-amber-200">Tarihleri kontrol edin (engel değil, bilgi):</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {dateNotices.map((n) => (
              <li key={n.text} className={n.level === "warning" ? "font-medium text-amber-900 dark:text-amber-200" : "text-amber-800 dark:text-amber-300"}>
                {n.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="mt-3 text-[11px] text-[var(--color-text-muted)]">
        <summary className="cursor-pointer font-medium text-[var(--color-text)]">Tarihler ne anlama geliyor?</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li><strong>Kayıt tarihi:</strong> öğrencinin sisteme kaydedildiği gün (yalnız bilgi).</li>
          <li><strong>Ders başlangıcı:</strong> ilk dersin günü; kayıttan önce veya sonra olabilir.</li>
          <li><strong>Sözleşme başlangıcı:</strong> ücret ve taksitlerin hesaplandığı gün (genelde ders başlangıcı).</li>
          <li><strong>Sözleşme bitişi:</strong> süreden otomatik hesaplanır (başlangıç ayı 1. aydır).</li>
          <li><strong>İlk tahsilat tarihi:</strong> paranın gerçekten alındığı gün.</li>
          <li><strong>Taksit vadesi:</strong> ödemenin beklendiği gün; önizleme tablosunda elle değiştirilebilir.</li>
        </ul>
      </details>

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
        <Button type="button" onClick={() => { clearContractDraft(draftKey); onCancel(); }} disabled={busy} className="!bg-transparent !text-[var(--color-text-muted)] hover:!bg-[var(--color-surface-muted)]">
          Vazgeç
        </Button>
      </div>

      {preview ? (
        <div className="mt-4 rounded-lg border border-[var(--color-border)] p-3 text-xs">
          {/* Elle düzenlenen tutarlar ANINDA yansır: toplam, ilk tahsilat ve kalan borç
              hep aşağıdaki tablodaki satırlardan hesaplanır (kaydedince sunucu da aynı
              satırları yazar — ekranda görülenle kaydedilen asla ayrışmaz). */}
          <p className="mb-2 font-semibold text-[var(--color-text)]">
            Toplam sözleşme tutarı: {formatTL(liveTotal)}
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
                <dd className="font-semibold text-[var(--color-text)]">{formatTL(liveRows[0]?.amount ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-muted)]">İlk Tahsilat Tarihi</dt>
                <dd className="font-semibold text-[var(--color-text)]">
                  {/*
                    P0 revizyonu — burası plan/vade tarihi DEĞİL, GERÇEK ilk
                    tahsilatın alındığı tarihtir. Yenilemede formun tahsilat
                    tarihi girdisi; ilk kayıtta kayıt anı ödemesi (yoksa
                    "Henüz tahsil edilmedi" — ders başlangıcı asla yazılmaz).
                  */}
                  {needsFirstPaymentEntry
                    ? formatDateTr(firstPaymentCollectedAt)
                    : prefill?.firstCollectionAt
                      ? formatDateTr(prefill.firstCollectionAt)
                      : "Henüz tahsil edilmedi"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-muted)]">Aylık Dönem Ücreti</dt>
                <dd className="font-semibold text-[var(--color-text)]">{formatTL(monthlyAmount === "" ? 0 : monthlyAmount)}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-muted)]">Kalan Borç</dt>
                <dd className="font-semibold text-[var(--color-text)]">
                  {formatTL(liveRows.slice(1).reduce((s, r) => s + r.amount, 0))}
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
                <th className="pr-2">Ödeme Türü</th>
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
                  <td className="pr-2 py-1">
                    {row.sequence === 1 ? (
                      // 1. satır = gerçekten alınan ilk tahsilat; tarihi tahsilat alanından gelir.
                      formatDateTr(row.dueDate)
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <input
                          type="date"
                          value={(dueDateOverrides[row.sequence] ?? row.dueDate).slice(0, 10)}
                          onChange={(e) => {
                            const value = e.target.value;
                            setDueDateOverrides((prev) => ({ ...prev, [row.sequence]: value }));
                          }}
                          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-xs text-[var(--color-text)]"
                          aria-label={`${row.sequence}. taksit vade tarihi`}
                        />
                        {dueDateOverrides[row.sequence] !== undefined ? (
                          <>
                            <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                              elle
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setDueDateOverrides((prev) => {
                                  const next = { ...prev };
                                  delete next[row.sequence];
                                  return next;
                                })
                              }
                              className="text-[10px] font-medium text-[var(--color-primary)] hover:underline"
                              aria-label={`${row.sequence}. taksit vadesini otomatiğe döndür`}
                            >
                              ↺ otomatik
                            </button>
                          </>
                        ) : null}
                      </span>
                    )}
                  </td>
                  {/*
                    P0 revizyonu — "Ödeme Türü" sütunu: 1. satırda GERÇEK ilk
                    tahsilatın yöntemi (yenilemede form seçimi, ilk kayıtta
                    kayıt anı ödemesi), sonraki satırlarda henüz tahsilat
                    yoktur — "—" (uydurma yöntem yazılmaz).
                  */}
                  <td className="pr-2 py-1">
                    {row.sequence === 1
                      ? paymentMethodLabelTr(needsFirstPaymentEntry ? firstPaymentMethod : prefill?.firstCollectionMethod)
                      : "—"}
                  </td>
                  <td className="py-1">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={
                        row.sequence === 1 && firstRowFollowsEntry && firstPaymentAmount !== ""
                          ? firstPaymentAmount
                          : amountOverrides[row.sequence] ?? row.amount
                      }
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d]/g, "");
                        if (row.sequence === 1 && firstRowFollowsEntry) {
                          // 1. satır = gerçekten tahsil edilen ilk ödeme; tek alan düzenlenir.
                          setFirstPaymentAmount(raw === "" ? "" : Number(raw));
                          return;
                        }
                        setAmountOverrides((prev) => ({ ...prev, [row.sequence]: raw === "" ? 0 : Number(raw) }));
                      }}
                      className="w-28 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-right text-xs text-[var(--color-text)]"
                      aria-label={`${row.sequence}. taksit tutarı`}
                    />
                  </td>
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
  schedulePickers,
}: {
  studentId: string;
  contracts: ContractRow[];
  canManage: boolean;
  /** Faz 4 — yeni öğrenci kaydından hemen sonra "Sözleşmeyi Gözden Geçir ve Oluştur" akışı için formu doğrudan açık başlatır. */
  autoOpenInitial?: boolean;
  prefill?: ContractPrefill;
  registration?: RegistrationSummary;
  /** K — sözleşmeden ders programı üretimi için seçenekler (öğretmen/oda). */
  schedulePickers?: {
    teachers: SchedulePickerOption[];
    rooms: SchedulePickerOption[];
    defaultTeacherId?: string;
  };
}) {
  const currentPath = useCurrentPath();
  const router = useRouter();
  const [formMode, setFormMode] = useState<"none" | "initial" | "renewal">(
    (autoOpenInitial || hasContractDraft(`${studentId}:initial`)) && canManage ? "initial" : "none"
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  // Geçmiş (iptal/yenilenmiş) bir sözleşmeyi TEMEL ALARAK yeni sözleşme açmak:
  // kullanıcı aynı değerleri elle yeniden girmesin diye. Fiyatlandırma modeli
  // yine öğrencinin kaydından gelir (bkz. prefillFromContract).
  const [basisPrefill, setBasisPrefill] = useState<ContractPrefill | null>(null);
  /** B — oluşturma sonrası başarı durumu; formun yerine çizilir ve görünüme kaydırılır. */
  const [createdContract, setCreatedContract] = useState<CreatedContractSummary | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  /** İptal sonucu özeti — kaç ders iptal edildi, kaçı korundu (bkz. ContractCancelDialog). */
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
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
  const currentContract = selectCurrentContract(contracts);
  const latestActive = findLatestActiveContractForRenewal(contracts);
  const hasOnlyInactiveHistory = contracts.length > 0 && !latestActive;
  const orderedContracts = sortContractsForDisplay(contracts);

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
      {createdContract ? (
        <ContractCreatedPanel
          contract={createdContract}
          studentId={studentId}
          onDismiss={() => setCreatedContract(null)}
          schedulePickers={schedulePickers}
          scheduleText={prefill?.lessonScheduleText}
        />
      ) : null}

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
              sözleşmesi oluşturulacak. Form, öğrencinin kayıt bilgilerinden (ücret, ders başlangıcı, ilk tahsilat)
              otomatik doldurulur; isterseniz aşağıdaki geçmiş sözleşmelerden birini temel alabilirsiniz.
            </span>
          ) : null}
        </div>
      ) : null}

      {formMode === "initial" ? (
        <ContractForm
          studentId={studentId}
          previousContract={null}
          prefill={basisPrefill ?? prefill}
          registration={registration}
          onDone={(created) => {
            setBasisPrefill(null);
            setFormMode("none");
            setCreatedContract(created);
          }}
          onCancel={() => {
            setBasisPrefill(null);
            setFormMode("none");
          }}
        />
      ) : null}
      {formMode === "renewal" && latestActive ? (
        <ContractForm
          studentId={studentId}
          previousContract={latestActive}
          onDone={(created) => {
            setFormMode("none");
            setCreatedContract(created);
          }}
          onCancel={() => setFormMode("none")}
        />
      ) : null}

      {rowError ? <p className="mb-2 text-xs font-medium text-rose-600">{rowError}</p> : null}
      {cancelNotice ? (
        <p
          className="mb-2 rounded-[var(--radius-md)] px-3 py-2 text-xs font-medium"
          style={{ background: "var(--color-info-soft)", color: "var(--color-info)" }}
          role="status"
        >
          {cancelNotice}
        </p>
      ) : null}

      {contracts.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">Bu öğrenci için henüz kayıt sözleşmesi oluşturulmadı.</p>
      ) : (
        <div className="space-y-2">
          {orderedContracts.map((c, index) => {
            const isCurrent = c.id === currentContract?.id;
            const terminal = isTerminalContractStatus(c.status);
            const showHistoryHeading = !isCurrent && (index === 0 || orderedContracts[index - 1]?.id === currentContract?.id);
            return (
            <div key={c.id}>
            {showHistoryHeading ? (
              <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Geçmiş sözleşmeler
              </p>
            ) : null}
            <Card className={isCurrent ? "!border-[var(--color-primary)] !p-3" : terminal ? "!p-3 opacity-70" : "!p-3"}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">
                    {c.contractNumber} · v{c.versionNumber} · {CONTRACT_TYPE_LABELS[c.contractType]}
                    {isCurrent ? (
                      <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        Güncel
                      </span>
                    ) : terminal ? (
                      <span className="ml-2 rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-text-muted)]">
                        Geçmiş
                      </span>
                    ) : null}
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
                  <Link href={withReturnTo(`/sozlesme-yazdir/${c.id}`, currentPath)} target="_blank" className="font-medium text-[var(--color-primary)] hover:underline">
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
                {canManage && !terminal ? (
                  <ContractCancelDialog
                    contractId={c.id}
                    contractNumber={c.contractNumber}
                    onCancelled={(summary) => {
                      setCancelNotice(summary);
                      setRowError(null);
                      router.refresh();
                    }}
                  />
                ) : null}
                {canManage && !latestActive && (c.status === "cancelled" || c.status === "superseded") ? (
                  <button
                    type="button"
                    onClick={() => {
                      setBasisPrefill(prefillFromContract(c, prefill ?? {}));
                      setFormMode("initial");
                    }}
                    className="font-medium text-[var(--color-primary)] hover:underline"
                  >
                    Bunu temel alarak yeniden oluştur
                  </button>
                ) : null}
              </div>
            </Card>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
