"use client";
import { withReturnTo } from "@/lib/safe-return-to";
import { useCurrentPath } from "@/lib/use-current-path";

/**
 * ÖNCELİK 4 — Yoklama Takvimi. Öğrenci detayında (admin/öğretmen düzenleyebilir)
 * VE veli portalında (salt okunur, `readOnly`) aynı veri kaynağını (
 * `/api/v1/attendance-calendar/month`) kullanan dönem takvimi. Güz: Eylül–
 * Haziran, Yaz: Temmuz–Ağustos + uzatma. Akademik yıl (`attYear`) ve dönem
 * (`attTerm`) URL query string'inde tutulur — sayfa yenilenince korunur.
 *
 * Bir güne tıklayınca o günün dersleri + (yalnızca `readOnly=false` iken)
 * Geldi/İşlendi/Telafi aksiyonları açılır. Kapalı günler siyah render edilir;
 * yalnızca `canEdit` (admin) aynı ekrandan zorla aç/kapat + Tutar
 * güncelleyebilir. Veli görünümünde ne override ne Tutar ne de yoklama
 * değiştirme aksiyonu render edilmez — backend zaten (assertStudentAccess +
 * admin-only tool RBAC) bunu kesin olarak da engeller, bu yalnızca UI
 * katmanındaki ikinci bir savunma.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "@/components/link";
import { cn, formatTime } from "@/lib/utils";
import { apiFetch } from "@/lib/api/client-fetch";
import type { CalendarMonthPlan } from "@/lib/attendance-calendar-plan";
import { TriangleAlert } from "lucide-react";
import { LessonOpsActions } from "./lesson-ops-actions";
import { LessonStatusBadge } from "./lesson-status-badge";
import { AttendanceCalendarCollectPaymentButton } from "./attendance-calendar-collect-payment-button";
import {
  currentAcademicAnchorYear,
  resolveDayFillSegments,
  attendanceCalendarTextColor,
  ATTENDANCE_CALENDAR_COLORS,
  leadingBlankDayCount,
  trailingBlankDayCount,
  type AttendanceCalendarColorKey,
} from "@/lib/attendance-calendar";

/** Pazartesi→Pazar — takvim grid header'ı ve boş hücre hizalaması bu sırayı kullanır. */
const WEEKDAY_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cts", "Paz"];
const WEEKDAY_FULL_NAMES = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

/** `yyyy-MM-dd` → tam gün adı — İş 2: başlık satırı gizlense bile ekran okuyucular için gün bilgisini korur. */
export function weekdayFullNameFor(dateStr: string): string {
  return WEEKDAY_FULL_NAMES[new Date(`${dateStr}T00:00:00`).getDay()] ?? "";
}

/**
 * Asıl tanım `src/lib/attendance-calendar.ts`'de (`currentAcademicAnchorYear`)
 * — sunucu bileşenlerinden de (RSC) güvenle içe aktarılabilsin diye orada
 * tutulur. Burada, mevcut testlerin/çağrı sitelerinin import ettiği isimle
 * (`currentAnchorYear`) geriye dönük uyumlu, tip-daraltılmış bir sarmalayıcı
 * olarak yeniden dışa aktarılır.
 */
export function currentAnchorYear(termType: string): number {
  return currentAcademicAnchorYear(termType === "yaz" ? "yaz" : "guz");
}

/**
 * Yarış koşulu koruması — saf, DOM'suz test edilebilir (bkz.
 * attendance-calendar-race.test.ts). Term/yıl hızlı değiştirildiğinde birden
 * fazla `/month` isteği aynı anda uçuşabilir; yalnızca EN SON başlatılan
 * isteğin yanıtı state'e yazılmalı — daha önce başlayıp geç dönen bir yanıt,
 * sonradan başlayıp erken dönen daha güncel bir yanıtı EZMEMELİ.
 */
export function shouldApplyMonthsResult(latestRequestId: number, respondingRequestId: number): boolean {
  return latestRequestId === respondingRequestId;
}

type LessonPaymentInfo = {
  paymentId: string;
  lessonId: string;
  amount: number;
  paidAmount: number;
  /** "Tutar kayıt tarihi" — bu tutarın sisteme kaydedildiği tarih-saat. */
  recordedAt: string;
  /** GERÇEK tahsilat anı — yalnızca status=paid'de dolu, recordedAt'tan AYRI. */
  paidAt?: string;
  method?: string;
  methodIsStudentDefault: boolean;
  status: string;
  source: string;
};

type DayLessonOpsInfo = {
  lessonId: string;
  opsStatus: "attended" | "processed" | "makeup" | "makeup_planned" | "cancelled" | "planned" | "absent" | "excused" | null;
  startAt: string;
  durationMinutes: number;
  teacherName?: string;
  instrument: string;
  roomName?: string;
  availabilityOverride: boolean;
};

type DayInfo = {
  date: string;
  status: "open" | "closed";
  reason: string;
  label: string;
  inTerm?: boolean;
  lessonIds: string[];
  lessons: DayLessonOpsInfo[];
  payments: LessonPaymentInfo[];
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Nakit",
  transfer: "Havale",
  credit_card: "Kredi Kartı",
};

function formatMoneyTL(amount: number): string {
  return `${amount.toLocaleString("tr-TR")} TL`;
}

function formatRecordedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

type MonthResponse = {
  year: number;
  month: number;
  term: string;
  /**
   * P0 (2026-09-09) — bu ayın ödenecek tutarı SÖZLEŞMENİN dondurulmuş ödeme
   * planından gelir; istemci de sunucu da tutarı yeniden HESAPLAMAZ. Tip
   * sunucudaki saf modülden İTHAL EDİLİR (elle yazılmış ikinci bir kopya
   * tutulmaz — eski `billing` alanı böyle ayrışabiliyordu).
   */
  plan: CalendarMonthPlan;
  /** YALNIZ BİLGİ — bu ayın ücretlendirilebilir ders sayısı; tutarla ilgisi YOKTUR. */
  billableLessonCount: number;
  days: DayInfo[];
};

const MONTH_LABELS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

export type AttendanceTerm = "guz" | "yaz";

/** Dışa açık — saf, DOM'suz test edilebilir (bkz. attendance-calendar-nav.test.ts). */
export function termMonthList(termType: string, anchorYear: number): { year: number; month: number }[] {
  if (termType === "yaz") {
    return [
      { year: anchorYear, month: 7 },
      { year: anchorYear, month: 8 },
      { year: anchorYear, month: 9 },
    ];
  }
  const months: { year: number; month: number }[] = [];
  for (let m = 9; m <= 12; m++) months.push({ year: anchorYear, month: m });
  for (let m = 1; m <= 6; m++) months.push({ year: anchorYear + 1, month: m });
  return months;
}


/**
 * Gün kutusunun ARKA PLAN DOLGUSU — TEK kaynak `ATTENDANCE_CALENDAR_COLORS` +
 * `resolveDayFillSegments` (bkz. src/lib/attendance-calendar.ts). Kapalı gün
 * her zaman tek siyah dolgu (statü hiç yazılamaz — en yüksek öncelik). Aynı
 * günde birden fazla ders, FARKLI statülerdeyse tek renge indirgenmez: her
 * dersin kendi rengi eşit genişlikte bir dikey şeritte gösterilir (segmentli
 * dolgu) — hiçbir ders diğerini gizlemez. Tüm dersler aynı statüdeyse (veya
 * tek ders varsa) düz tek renk döner. Dersi olan günler ayrıca kalın siyah
 * çerçeve + ders sayısı rozetiyle de işaretlenir (renk körlüğünde bile
 * ayırt edilebilir ikinci bir sinyal).
 */
export function dayFillStyle(day: DayInfo): { style: CSSProperties; segmentCount: number } {
  let segments = resolveDayFillSegments(day.status, day.lessons);
  // 8. tur (I) — aynı statüdeki birden çok ders tek renge indirgenince dışarıdan TEK kutu
  // gibi görünüyordu. Kapalı gün hariç her ders kendi şeridini alır; şeritler arasına
  // (renk ne olursa olsun) 2px siyah ayırıcı çizilir. Arka plan olduğu için hücre genişliği değişmez.
  if (segments.length === 1 && day.lessons.length > 1 && day.status !== "closed") {
    segments = day.lessons.map(() => segments[0]!);
  }
  if (segments.length <= 1) {
    const key: AttendanceCalendarColorKey = segments[0] ?? "open";
    return {
      style: { backgroundColor: ATTENDANCE_CALENDAR_COLORS[key], color: attendanceCalendarTextColor(key) },
      segmentCount: 1,
    };
  }
  const n = segments.length;
  const stops = segments
    .map((key, i) => `${ATTENDANCE_CALENDAR_COLORS[key]} ${(i / n) * 100}% ${((i + 1) / n) * 100}%`)
    .join(", ");
  const dividers = segments
    .slice(1)
    .map((_, i) => {
      const at = ((i + 1) / n) * 100;
      return `linear-gradient(90deg, transparent calc(${at}% - 1px), #000 calc(${at}% - 1px), #000 calc(${at}% + 1px), transparent calc(${at}% + 1px))`;
    });
  const uniform = new Set(segments).size === 1;
  return {
    style: {
      backgroundImage: [...dividers, `linear-gradient(90deg, ${stops})`].join(", "),
      ...(uniform
        ? { color: attendanceCalendarTextColor(segments[0]!) }
        : { color: "#ffffff", textShadow: "0 0 2px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,0.85)" }),
    },
    segmentCount: n,
  };
}

const PLAN_STATUS_LABEL: Record<string, string> = {
  pending: "Ödenmedi",
  overdue: "Gecikmiş",
  partial: "Kısmi ödendi",
  paid: "Ödendi",
  voided: "İptal edildi",
};

/**
 * Ay kutusunun finansal özeti — TAMAMEN sözleşmenin dondurulmuş plan
 * satırından beslenir. Burada hiçbir tutar HESAPLANMAZ; `plan` ne diyorsa o
 * gösterilir. Plan yoksa tutar UYDURULMAZ, açık durum yazılır.
 */
/** 2026-10-05 — ayın tahsilatı sabit görünür: "Ödendi · 05.10.2026 · Nakit" (birden çok tahsilatta her biri). */
function MonthCollections({ plan }: { plan: CalendarMonthPlan }) {
  if (plan.state !== "ok" && plan.state !== "student_plan") return null;
  if (plan.collections.length === 0) return null;
  const fullyPaid = plan.remaining <= 0;
  return (
    <ul className="mt-1 space-y-0.5" aria-label="Bu ayın tahsilatları">
      {plan.collections.map((c, i) => (
        <li
          key={`${c.paidAt}-${i}`}
          className="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium tabular-nums"
          style={{
            background: fullyPaid ? "var(--color-success-soft)" : "var(--color-warning-soft)",
            color: fullyPaid ? "var(--color-success)" : "var(--color-warning)",
          }}
        >
          <span aria-hidden="true">{fullyPaid ? "✓" : "◐"}</span>
          <span>{fullyPaid ? "Ödendi" : "Kısmi"}</span>
          <span>· {new Date(c.paidAt).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</span>
          <span>· {c.method ? PAYMENT_METHOD_LABEL[c.method] ?? c.method : "Şekil belirtilmemiş"}</span>
          {plan.collections.length > 1 || !fullyPaid ? <span className="ml-auto">{formatMoneyTL(c.amount)}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Tam ödenmiş ayda giriş alanları kapalı gelir (kutu sade kalır); gerekirse açılır. */
function PaidMonthEntry({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  if (!collapsed) return <>{children}</>;
  return (
    <details className="mt-1 text-[11px]">
      <summary className="cursor-pointer select-none text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
        Yeni tahsilat / düzelt
      </summary>
      {children}
    </details>
  );
}

function MonthPlanSummary({ plan }: { plan: CalendarMonthPlan }) {
  if (plan.state === "ok") {
    return (
      <p className="text-[10px] text-[var(--color-text-muted)]">
        <span className="font-medium text-[var(--color-text)]">{formatMoneyTL(plan.amount)}</span>
        {" · ödenen "}
        {formatMoneyTL(plan.paidAmount)}
        {" · kalan "}
        <span className={plan.remaining > 0 ? "font-medium text-[var(--color-text)]" : undefined}>
          {formatMoneyTL(plan.remaining)}
        </span>
        {" · "}
        {PLAN_STATUS_LABEL[plan.status] ?? plan.status}
        {plan.periodLabel ? ` · ${plan.periodLabel}` : ""}
      </p>
    );
  }
  if (plan.state === "multiple_active_contracts") {
    return (
      <p className="text-[10px] font-medium text-[var(--color-danger)]" role="alert">
        {plan.message} ({plan.contractNumbers.join(", ")})
      </p>
    );
  }
  if (plan.state === "student_plan") {
    // 8. tur — sözleşmesiz öğrencinin kendi planı: gerçek satırlar varsa onların toplamı,
    // yoksa yalnız anlaşılan aylık ücret bilgi olarak (borç gibi gösterilmez).
    return (
      <p className="text-[10px] text-[var(--color-text-muted)]">
        {plan.paymentIds.length > 0 ? (
          <>
            <span className="font-medium text-[var(--color-text)]">{formatMoneyTL(plan.amount)}</span>
            {" · ödenen "}
            {formatMoneyTL(plan.paidAmount)}
            {" · kalan "}
            <span className={plan.remaining > 0 ? "font-medium text-[var(--color-text)]" : undefined}>
              {formatMoneyTL(plan.remaining)}
            </span>
            {plan.status ? ` · ${PLAN_STATUS_LABEL[plan.status] ?? plan.status}` : ""}
            {" · "}
          </>
        ) : null}
        Sözleşmesiz aylık plan
        {plan.monthlyFee ? ` (aylık ${formatMoneyTL(plan.monthlyFee)})` : ""}
        {plan.paymentIds.length === 0 ? " — bu ay henüz ödeme kaydı yok" : ""}
      </p>
    );
  }
  // no_active_contract | no_installment_for_month
  return <p className="text-[10px] text-[var(--color-text-muted)]">{plan.message}</p>;
}

export function AttendanceCalendarPanel({
  studentId,
  termType,
  canEdit,
  readOnly = false,
  studentActive = true,
  showWeekdayLabels = true,
}: {
  studentId: string;
  /** Öğrencinin kayıtlı dönemi — ilk açılışta seçili dönem olarak kullanılır, kullanıcı değiştirebilir. */
  termType: string;
  /** Admin: gün override + aylık Tutar düzenleyebilir. */
  canEdit: boolean;
  /** Veli/salt-okunur görünüm: override, Tutar, Geldi/İşlendi/Telafi aksiyonları HİÇ render edilmez. */
  readOnly?: boolean;
  /** Pasif/arşiv öğrenci için takvimden tahsilat aksiyonu render edilmez (yeni ders/tahsilat akışıyla tutarlı). */
  studentActive?: boolean;
  /*
   * P0 (2026-09-09) — `defaultMonthlyFee` ve `defaultMonthlyAmount` prop'ları
   * KALDIRILDI. İkisi de ay kutusunun tutar alanına "varsayılan" besliyordu;
   * sözleşmenin plan satırı yokken bu, tahsilat tutarını UYDURMANIN en sessiz
   * yoluydu (yönetici boş bırakıp Kaydet'e basınca ilgisiz bir tutar
   * kaydedilebiliyordu). Tutar artık YALNIZ sözleşme planından gelir; plan
   * yoksa açık durum gösterilir ve tutar elle girilmek zorundadır.
   */
  /**
   * İş 2 — veli portalinde Pzt/Sal/Çar/… başlık satırı mobilde ekranı
   * sıkıştırıyordu. Varsayılan true (panel/admin/öğretmen kullanımları
   * ETKİLENMEZ) — yalnızca veli sayfası açıkça `false` geçer. Başlıklar
   * gizlense bile grid hizası bozulmasın diye header satırı KALDIRILMAZ,
   * yalnızca metin boş bırakılır (7 hücre + boş gün hücreleri aynı 7
   * kolonluk grid'de kalır) ve erişilebilirlik için her gün hücresine
   * `aria-label` (tarih + gün adı) eklenir.
   */
  showWeekdayLabels?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const studentDefaultTerm: AttendanceTerm = termType === "yaz" ? "yaz" : "guz";
  const urlTerm = searchParams.get("attTerm");
  // ÖNCELİK 4 (devam) — veli (readOnly) görünümünde dönem seçimi KULLANICIYA
  // AÇILMAZ: URL'den bile değiştirilemez, her zaman öğrencinin kayıtlı
  // termType'ından otomatik çözülür. Admin/öğretmen görünümünde (readOnly
  // false) URL'deki attTerm tercih edilir, yoksa öğrencinin termType'ı.
  const urlYear = searchParams.get("attYear");
  const [term, setTerm] = useState<AttendanceTerm>(
    readOnly ? studentDefaultTerm : urlTerm === "guz" || urlTerm === "yaz" ? urlTerm : studentDefaultTerm
  );
  const [anchorYear, setAnchorYear] = useState<number>(() => {
    const parsed = urlYear ? Number(urlYear) : NaN;
    return Number.isFinite(parsed) ? parsed : currentAnchorYear(term);
  });

  const syncUrl = useCallback(
    (nextTerm: AttendanceTerm, nextYear: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("attTerm", nextTerm);
      params.set("attYear", String(nextYear));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  function changeTerm(nextTerm: AttendanceTerm) {
    const nextYear = currentAnchorYear(nextTerm);
    setTerm(nextTerm);
    setAnchorYear(nextYear);
    syncUrl(nextTerm, nextYear);
  }

  function changeYear(nextYear: number) {
    setAnchorYear(nextYear);
    syncUrl(term, nextYear);
  }

  function goToday() {
    changeYear(currentAnchorYear(term));
  }

  const [byMonth, setByMonth] = useState<Record<string, MonthResponse>>({});
  const defaultMonths = useMemo(() => termMonthList(term, anchorYear), [term, anchorYear]);
  const months = useMemo(() => {
    const loaded = Object.values(byMonth)
      .map((m) => ({ year: m.year, month: m.month }))
      .sort((a, b) => a.year - b.year || a.month - b.month);
    return loaded.length > 0 ? loaded : defaultMonths;
  }, [byMonth, defaultMonths]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  /** Ay kutusu — ödeme tarihi (yyyy-MM-dd). Tutar alanıyla AYNI ilkeyle: yalnızca yerel giriş arabelleği, sunucudan önceden doldurulmaz (mevcut Tutar davranışıyla tutarlı). */
  const [dueDates, setDueDates] = useState<Record<string, string>>({});
  /** Ay kutusu — ödeme şekli (nakit/kredi kartı/havale). */
  const [methods, setMethods] = useState<Record<string, string>>({});
  /**
   * §C.2 — ay kutusu tahsilat notu (dekont no, kısmi ödeme gerekçesi vb.).
   * Zorunlu değil; verilirse `Payment.paymentNote`e KALICI yazılır ve
   * Ödemeler ekranındaki ödeme detayında görünür. Tutar/tarih/yöntem
   * alanlarıyla aynı ilke: yalnızca yerel giriş arabelleği.
   */
  const [collectionNotes, setCollectionNotes] = useState<Record<string, string>>({});
  const [savingMonth, setSavingMonth] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  /** Her `loadMonths` çağrısını benzersiz kılar — yalnızca EN SON çağrının
   * sonucu state'e yazılır. Term/yıl hızlı değiştirildiğinde önce başlayan
   * ama GEÇ dönen (yavaş) bir isteğin, sonra başlayan ama ERKEN dönen daha
   * güncel isteğin sonucunu ezmesini engeller (asıl kök neden buydu —
   * `setByMonth(results)` koşulsuzca TÜM haritayı, artık geçersiz olan bir
   * `cancelled` bayrağına bakmadan, değiştiriyordu).
   */
  const requestIdRef = useRef(0);

  /**
   * P0 performans (2026-09-07) — dönemin TÜM ayları TEK istekte gelir.
   * Önceden burada `for (const m of months) await fetch(...)` vardı: güz
   * için 10 ARDIŞIK istek, her biri sunucuda tenant'ın tüm `AppData`'sını
   * yeniden okuyordu; ölçülen süre ~10 sn'ydi (bkz.
   * docs/performance/ADMIN_WEB_P0_BASELINE.md). Tek ay uç noktası
   * KALDIRILMADI — yoklama/override sonrası tekil ay tazelemesi hâlâ onu
   * kullanır (aşağıya bkz.).
   */
  const loadMonths = useCallback(
    async (signal: AbortSignal, requestId: number) => {
      setLoading(true);
      setLoadError(false);
      // Bayat veri koruması: öğrenci/dönem/yıl değiştiğinde ÖNCEKİ seçimin
      // takvimi ekranda BIRAKILMAZ. Eskiden `byMonth` temizlenmiyordu ve
      // iskelet yalnızca harita BOŞKEN gösteriliyordu; sonuç, yeni öğrencinin
      // adı altında önceki öğrencinin yoklamasının saniyelerce görünmesiydi.
      setByMonth({});
      try {
        const res = await apiFetch(
          `/api/v1/attendance-calendar/term?studentId=${studentId}&term=${term}&anchorYear=${anchorYear}`,
          { signal }
        );
        const json = (await res.json()) as { ok: boolean; data?: { months: MonthResponse[] } };
        // Yarışı önleyen asıl koruma: yanıt geldiğinde bu artık en son istek
        // DEĞİLSE (kullanıcı arada öğrenci/dönem/yıl değiştirdiyse) state'e hiç yazma.
        if (!shouldApplyMonthsResult(requestIdRef.current, requestId)) return;
        if (json.ok && json.data) {
          const results: Record<string, MonthResponse> = {};
          for (const m of json.data.months) results[`${m.year}-${m.month}`] = m;
          setByMonth(results);
          setLoadError(false);
        } else {
          setByMonth({});
          setLoadError(true);
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        if (!shouldApplyMonthsResult(requestIdRef.current, requestId)) return;
        setByMonth({});
        setLoadError(true);
      }
      setLoading(false);
    },
    [studentId, term, anchorYear]
  );

  const runLoadMonths = useCallback(() => {
    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    void loadMonths(controller.signal, requestId);
    return controller;
  }, [loadMonths]);

  useEffect(() => {
    const controller = runLoadMonths();
    return () => controller.abort();
  }, [runLoadMonths]);

  function onDayClick(day: DayInfo) {
    setSelectedDay(day.date);
    setError(null);
  }

  /**
   * Yoklama Takvimi kutu rengi anında güncellenir — `LessonOpsActions`'ın
   * `effective` statüsü değiştiği her an (iyimser set, hata sonrası geri
   * alma, onaylanan geçiş) bu callback tetiklenir; sayfa yenilenmeden
   * yalnızca ilgili dersin günündeki `lessons[].opsStatus` yerinde güncellenir.
   */
  const onLessonStatusChange = useCallback(
    (lessonId: string, flag: "attended" | "processed" | "makeup" | "absent" | "excused" | null) => {
      setByMonth((prev) => {
        let changed = false;
        const next: Record<string, MonthResponse> = { ...prev };
        for (const key of Object.keys(next)) {
          const month = next[key]!;
          const dayIdx = month.days.findIndex((d) => d.lessonIds.includes(lessonId));
          if (dayIdx === -1) continue;
          const day = month.days[dayIdx]!;
          const lessonIdx = day.lessons.findIndex((l) => l.lessonId === lessonId);
          if (lessonIdx === -1) continue;
          if (day.lessons[lessonIdx]!.opsStatus === flag) continue;
          const nextLessons = day.lessons.slice();
          nextLessons[lessonIdx] = { ...nextLessons[lessonIdx]!, opsStatus: flag };
          const nextDays = month.days.slice();
          nextDays[dayIdx] = { ...day, lessons: nextLessons };
          next[key] = { ...month, days: nextDays };
          changed = true;
        }
        return changed ? next : prev;
      });
    },
    []
  );

  /**
   * İstek tamamlandığında (başarı/hata fark etmeksizin) o ayı sunucudan
   * tazeler — böylece yukarıdaki iyimser renk güncellemesi, gerçek
   * (tutar/ödeme dahil) sunucu verisiyle nihai olarak doğrulanır/düzeltilir.
   */
  const onLessonOpsSettled = useCallback(
    (lessonId: string) => {
      const monthEntry = Object.entries(byMonth).find(([, m]) => m.days.some((d) => d.lessonIds.includes(lessonId)));
      if (!monthEntry) return;
      const [key, month] = monthEntry;
      void (async () => {
        try {
          const res = await apiFetch(
            `/api/v1/attendance-calendar/month?studentId=${studentId}&year=${month.year}&month=${month.month}`
          );
          const json = (await res.json()) as { ok: boolean; data?: MonthResponse };
          if (json.ok && json.data) setByMonth((prev) => ({ ...prev, [key]: json.data! }));
        } catch {
          // sessizce atla — iyimser renk zaten görünür durumda
        }
      })();
    },
    [byMonth, studentId]
  );

  async function onToggleOverride(day: DayInfo) {
    if (!canEdit || readOnly) return;
    setError(null);
    try {
      const res = await apiFetch("/api/v1/attendance-calendar/day-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: day.date,
          isOpen: day.status === "closed",
          name: day.status === "closed" ? "Zorla açık" : "Kapalı (yönetici)",
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) {
        setError(json.error?.message ?? "İşlem başarısız.");
        return;
      }
      const [y, m] = day.date.split("-");
      const res2 = await apiFetch(
        `/api/v1/attendance-calendar/month?studentId=${studentId}&year=${y}&month=${Number(m)}`
      );
      const json2 = (await res2.json()) as { ok: boolean; data?: MonthResponse };
      if (json2.ok && json2.data) {
        setByMonth((prev) => ({ ...prev, [`${Number(y)}-${Number(m)}`]: json2.data! }));
      }
    } catch {
      setError("Bağlantı hatası.");
    }
  }

  async function onSaveAmount(key: string) {
    if (!canEdit || readOnly) return;
    const raw = amounts[key];
    const plan = byMonth[key]?.plan;
    // P0 (2026-09-09) — tutar alanı boş bırakıldığında ARTIK "varsayılan aylık
    // ücret"e düşülmez. Sözleşmenin plan satırı yoksa tahsilat tutarı UYDURULMAZ
    // (ne sıfır, ne önceki ay, ne yeniden hesap) — açık hata gösterilir.
    let amount: number;
    if (raw !== undefined && raw.trim() !== "") {
      amount = Number(raw);
    } else if (plan?.state === "ok") {
      amount = plan.remaining > 0 ? plan.remaining : plan.amount;
    } else if (plan?.state === "student_plan" && plan.remaining > 0) {
      amount = plan.remaining;
    } else if (plan?.state === "student_plan") {
      setError("Sözleşmesiz aylık planda bu ay için açık borç yok — tahsil edilecek tutarı elle girin.");
      return;
    } else {
      setError(
        plan?.state === "multiple_active_contracts" || plan?.state === "no_installment_for_month"
          ? plan.message
          : "Bu ay için aktif ödeme planı bulunmuyor — tahsil edilecek tutarı elle girin."
      );
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Geçerli bir tutar girin.");
      return;
    }
    setSavingMonth(key);
    setError(null);
    try {
      const [year, month] = key.split("-").map(Number);
      const monthStr = `${year}-${String(month).padStart(2, "0")}`;
      const dueDate = dueDates[key];
      const method = methods[key];
      const note = collectionNotes[key]?.trim();
      const res = await apiFetch("/api/v1/attendance-calendar/monthly-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          month: monthStr,
          amount,
          ...(dueDate ? { dueDate } : {}),
          ...(method ? { method } : {}),
          ...(note ? { note } : {}),
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) {
        setError(json.error?.message ?? "Tutar kaydedilemedi.");
        return;
      }
      const res2 = await apiFetch(
        `/api/v1/attendance-calendar/month?studentId=${studentId}&year=${year}&month=${month}`
      );
      const json2 = (await res2.json()) as { ok: boolean; data?: MonthResponse };
      if (json2.ok && json2.data) {
        setByMonth((prev) => ({ ...prev, [key]: json2.data! }));
      }
    } catch {
      setError("Bağlantı hatası.");
    } finally {
      setSavingMonth(null);
    }
  }

  const isCurrentAnchor = anchorYear === currentAnchorYear(term);

  return (
    <div className="space-y-4">
      {canEdit && !readOnly ? (
        <Link
          href={`/panel/odemeler/${studentId}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
        >
          Tüm ödemeleri Ödemeler ekranında görüntüle →
        </Link>
      ) : null}
      {/* Sabit renk lejantı */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs">
        <LegendDot color={ATTENDANCE_CALENDAR_COLORS.attended} label="Geldi" />
        <LegendDot color={ATTENDANCE_CALENDAR_COLORS.processed} label="İşlendi" />
        <LegendDot color={ATTENDANCE_CALENDAR_COLORS.makeup} label="Telafi (kaçırılan ders)" />
        <LegendDot color={ATTENDANCE_CALENDAR_COLORS.makeup_planned} label="Planlanan telafi" />
        <LegendDot color={ATTENDANCE_CALENDAR_COLORS.closed} label="Kapalı" />
        <LegendDot color={ATTENDANCE_CALENDAR_COLORS.open} label="Açık / işaretsiz" />
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm border-2 border-black"
            style={{ backgroundColor: ATTENDANCE_CALENDAR_COLORS.planned }}
          />
          Planlı dersi var, statü henüz girilmedi
        </span>
      </div>

      {/* Dönem + akademik yıl gezinme */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        {readOnly ? (
          // ÖNCELİK 4 (devam) — veli görünümünde dönem seçici YOK; sistem
          // öğrencinin kayıtlı dönemini otomatik gösterir (salt bilgi etiketi).
          <span className="rounded-md bg-[var(--color-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)]">
            {term === "guz" ? "Güz dönemi" : "Yaz dönemi"} (öğrencinin kayıtlı dönemi)
          </span>
        ) : (
          <div className="flex items-center gap-1 rounded-md border border-[var(--color-border)] p-0.5" role="group" aria-label="Dönem seçimi">
            <button
              type="button"
              aria-pressed={term === "guz"}
              onClick={() => changeTerm("guz")}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-semibold transition",
                term === "guz" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]"
              )}
            >
              Güz
            </button>
            <button
              type="button"
              aria-pressed={term === "yaz"}
              onClick={() => changeTerm("yaz")}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-semibold transition",
                term === "yaz" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]"
              )}
            >
              Yaz
            </button>
          </div>
        )}

        {canEdit && !readOnly ? (
          <Link
            href={`/ogrenci-dokum/${studentId}?term=${term}&year=${anchorYear}`}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-bg)]"
          >
            Yazdır
          </Link>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Önceki akademik yıl"
            onClick={() => changeYear(anchorYear - 1)}
            className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-xs font-semibold hover:bg-[var(--color-bg)]"
          >
            ← {term === "guz" ? `${anchorYear - 1}–${anchorYear}` : anchorYear - 1}
          </button>
          <span className="rounded-md bg-[var(--color-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)]">
            {term === "guz" ? `${anchorYear}–${anchorYear + 1} Güz` : `${anchorYear} Yaz`}
          </span>
          <button
            type="button"
            aria-label="Sonraki akademik yıl"
            onClick={() => changeYear(anchorYear + 1)}
            className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-xs font-semibold hover:bg-[var(--color-bg)]"
          >
            {term === "guz" ? `${anchorYear + 1}–${anchorYear + 2}` : anchorYear + 1} →
          </button>
          {!isCurrentAnchor ? (
            <button
              type="button"
              onClick={goToday}
              className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              Bugün
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-xs font-medium text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {loading && Object.keys(byMonth).length === 0 ? (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="status"
          aria-label="Takvim yükleniyor"
        >
          {months.map((m) => (
            <div
              key={`skeleton-${m.year}-${m.month}`}
              className="h-40 animate-pulse rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <div className="mb-3 h-4 w-24 rounded bg-[var(--color-bg)]" />
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 28 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded bg-[var(--color-bg)]" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {loadError ? (
        <div className="flex items-center justify-between gap-3 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-xs font-medium text-[var(--color-danger)]" role="alert">
          <span>Takvim verisi yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.</span>
          <button
            type="button"
            onClick={() => runLoadMonths()}
            className="rounded-md border border-[var(--color-danger)] px-2 py-1 text-[11px] font-semibold hover:bg-[var(--color-danger-soft)]"
          >
            Tekrar dene
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {months.map((m) => {
          const key = `${m.year}-${m.month}`;
          const data = byMonth[key];
          return (
            <div key={key} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              {/* 10. tur iş #7 — kompakt ay başlığı: tutar+tarih BİR satırda,
                  şekil+not+kaydet BİR satırda; eskiden 4 satıra taşan sarma
                  düzeni 2 sabit satıra indi. Tüm alanlar/işlevler korunur;
                  açıklama metni Kaydet düğmesinin başlık/ipucuna taşındı. */}
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-[var(--color-text)]">
                  {MONTH_LABELS[m.month - 1]} {m.year}
                </h3>
                {canEdit && !readOnly && data ? <MonthPlanSummary plan={data.plan} /> : null}
                {data ? <MonthCollections plan={data.plan} /> : null}
                {canEdit && !readOnly ? (
                  <PaidMonthEntry
                    collapsed={
                      (data?.plan.state === "ok" || data?.plan.state === "student_plan") &&
                      data.plan.collections.length > 0 &&
                      data.plan.remaining <= 0
                    }
                  >
                  <div className="mt-1.5 space-y-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="number"
                        min={0}
                        // Plan yoksa "varsayılan aylık ücret" ÖNERİLMEZ — yanlış
                        // tutarın sessizce kaydedilmesinin en kolay yolu budur.
                        placeholder={
                          data?.plan.state === "ok"
                            ? String(data.plan.remaining > 0 ? data.plan.remaining : data.plan.amount)
                            : data?.plan.state === "student_plan" && data.plan.remaining > 0
                              ? String(data.plan.remaining)
                              : "Tutar"
                        }
                        value={amounts[key] ?? ""}
                        onChange={(e) => setAmounts((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="w-full min-w-0 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs"
                        aria-label={`${MONTH_LABELS[m.month - 1]} tutarı`}
                      />
                      <input
                        type="date"
                        value={dueDates[key] ?? ""}
                        onChange={(e) => setDueDates((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="w-full min-w-0 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs"
                        aria-label={`${MONTH_LABELS[m.month - 1]} ödeme tarihi`}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={methods[key] ?? ""}
                        onChange={(e) => setMethods((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="w-24 shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 text-xs"
                        aria-label={`${MONTH_LABELS[m.month - 1]} ödeme şekli`}
                      >
                        <option value="">Ödeme şekli</option>
                        <option value="cash">Nakit</option>
                        <option value="transfer">Havale</option>
                        <option value="credit_card">Kredi Kartı</option>
                      </select>
                      <input
                        type="text"
                        maxLength={200}
                        placeholder="Not (dekont no…)"
                        value={collectionNotes[key] ?? ""}
                        onChange={(e) => setCollectionNotes((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs"
                        aria-label={`${MONTH_LABELS[m.month - 1]} tahsilat notu`}
                      />
                      <button
                        type="button"
                        disabled={savingMonth === key}
                        aria-busy={savingMonth === key || undefined}
                        onClick={() => void onSaveAmount(key)}
                        title="Bu ayın ödemesini girilen tutar/tarih/yöntemle tahsil edilmiş (Ödendi) olarak kaydeder."
                        aria-label={`${MONTH_LABELS[m.month - 1]} ödemesini Ödendi olarak kaydet`}
                        className="shrink-0 rounded-md border border-[var(--color-primary)] bg-[var(--color-primary-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-primary-soft-text)] hover:bg-[var(--color-primary)] hover:text-[var(--color-text-inverted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-focus-ring)] disabled:cursor-wait disabled:opacity-70"
                      >
                        {savingMonth === key ? "Kaydediliyor…" : "Kaydet"}
                      </button>
                    </div>
                  </div>
                  </PaidMonthEntry>
                ) : null}
              </div>

              {!data ? (
                <p className="text-xs text-[var(--color-text-muted)]">
                  {months.some((mm) => `${mm.year}-${mm.month}` === key) && !loading ? "Bu dönem için ders yok / veri bulunamadı." : "Yükleniyor…"}
                </p>
              ) : (
                <div className="grid grid-cols-7 gap-1">
                  {showWeekdayLabels
                    ? WEEKDAY_LABELS.map((label) => (
                        <span
                          key={label}
                          className="pb-0.5 text-center text-[9px] font-semibold uppercase text-[var(--color-text-muted)]"
                        >
                          {label}
                        </span>
                      ))
                    : // Grid hizası (7 sütun) korunur — yalnızca görünür metin
                      // kaldırılır, boş dekoratif hücreler ekran okuyucudan
                      // gizlenir (gün bilgisi zaten her gün hücresinin kendi
                      // aria-label'ında var, bkz. aşağısı).
                      WEEKDAY_LABELS.map((label) => <span key={label} aria-hidden="true" />)}
                  {Array.from({ length: leadingBlankDayCount(m.year, m.month) }).map((_, i) => (
                    <span key={`lead-${i}`} aria-hidden="true" />
                  ))}
                  {data.days.map((day) => {
                    const { style, segmentCount } = dayFillStyle(day);
                    const dayTitle = `${day.date} — ${weekdayFullNameFor(day.date)} — ${day.label}${day.lessonIds.length ? ` · ${day.lessonIds.length} ders` : ""}`;
                    return (
                      <button
                        key={day.date}
                        type="button"
                        title={dayTitle}
                        aria-label={dayTitle}
                        onClick={() => onDayClick(day)}
                        className={cn(
                          "relative aspect-square rounded text-[10px] font-semibold transition",
                          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary)]",
                          "hover:brightness-95 active:brightness-90",
                          day.lessonIds.length > 0 && "border-2 border-black",
                          day.inTerm === false && "opacity-40",
                          selectedDay === day.date && "ring-2 ring-[var(--color-primary)]"
                        )}
                        style={style}
                      >
                        {Number(day.date.slice(8, 10))}
                        {segmentCount > 1 ? (
                          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-primary)] text-[8px] font-bold text-white">
                            {segmentCount}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                  {Array.from({ length: trailingBlankDayCount(m.year, m.month) }).map((_, i) => (
                    <span key={`trail-${i}`} aria-hidden="true" />
                  ))}
                </div>
              )}

              {selectedDay && data?.days.some((d) => d.date === selectedDay) ? (
                <DayDetail
                  day={data.days.find((d) => d.date === selectedDay)!}
                  canEdit={canEdit}
                  readOnly={readOnly}
                  studentActive={studentActive}
                  onToggleOverride={onToggleOverride}
                  onLessonStatusChange={onLessonStatusChange}
                  onLessonOpsSettled={onLessonOpsSettled}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * İş 2 — aynı günün birden fazla dersini ayırt etmek için minimum kimlik
 * bilgisi: saat, öğretmen, enstrüman, oda, süre. Öğretmen müsaitlik dışı
 * onaylı planlandıysa (bkz. İş 3 availabilityOverride) küçük bir uyarı
 * ikonuyla işaretlenir.
 */
function LessonSummaryLine({ lesson }: { lesson: DayLessonOpsInfo }) {
  return (
    <p className="mb-1 flex flex-wrap items-center gap-1 text-[11px] font-medium text-[var(--color-text)]">
      <span>{formatTime(lesson.startAt)}</span>
      <span className="text-[var(--color-text-muted)]">· {lesson.durationMinutes} dk</span>
      {lesson.teacherName ? <span className="text-[var(--color-text-muted)]">· {lesson.teacherName}</span> : null}
      <span className="text-[var(--color-text-muted)]">· {lesson.instrument}</span>
      {lesson.roomName ? <span className="text-[var(--color-text-muted)]">· {lesson.roomName}</span> : null}
      <LessonStatusBadge
        status={
          lesson.opsStatus === "attended" ||
          lesson.opsStatus === "processed" ||
          lesson.opsStatus === "makeup" ||
          lesson.opsStatus === "makeup_planned" ||
          lesson.opsStatus === "cancelled"
            ? lesson.opsStatus
            : "planned"
        }
      />
      {lesson.availabilityOverride ? (
        <span
          title="Öğretmen bu saatte müsait görünmüyordu — onaylı planlandı"
          className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800"
        >
          <TriangleAlert className="h-2.5 w-2.5" /> müsaitlik dışı
        </span>
      ) : null}
    </p>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function DayDetail({
  day,
  canEdit,
  readOnly,
  studentActive,
  onToggleOverride,
  onLessonStatusChange,
  onLessonOpsSettled,
}: {
  day: DayInfo;
  canEdit: boolean;
  readOnly: boolean;
  studentActive: boolean;
  onToggleOverride: (day: DayInfo) => void | Promise<void>;
  onLessonStatusChange: (lessonId: string, flag: "attended" | "processed" | "makeup" | "absent" | "excused" | null) => void;
  onLessonOpsSettled: (lessonId: string) => void;
}) {
  const currentPath = useCurrentPath();
  // Takvimden tahsilat: yoklama statüsüyle (Geldi/İşlendi/Telafi) ZORLA
  // bağlanmaz — ayrı bir kavramdır. Ancak mevcut iş kuralı gereği tahsilat
  // yalnızca kapalı OLMAYAN bir günde, aktif bir öğrenci için, admin/yönetici
  // rolündeyken (canEdit) ve salt-okunur (veli) görünümde DEĞİLKEN sunulur.
  const canCollectPayment = canEdit && !readOnly && day.status !== "closed" && studentActive;
  return (
    <div className="mt-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-[var(--color-text)]">
          {day.date} · {day.label}
        </p>
        {canEdit && !readOnly ? (
          <button
            type="button"
            onClick={() => void onToggleOverride(day)}
            className="rounded-md border border-stone-300 bg-[var(--color-surface)] px-2 py-1 text-[11px] font-semibold text-stone-800 hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]"
          >
            {day.status === "closed" ? "Zorla Aç" : "Kapat"}
          </button>
        ) : null}
      </div>
      {day.status === "closed" ? (
        <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
          Kapalı gün — yoklama/tahsilat işlemi yapılamaz.
        </p>
      ) : day.lessonIds.length === 0 ? (
        <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Bu gün ders yok.</p>
      ) : readOnly ? (
        <div className="mt-2 space-y-2">
          {day.lessons.map((l) => (
            <LessonSummaryLine key={l.lessonId} lesson={l} />
          ))}
          <p className="text-[11px] text-[var(--color-text-muted)]">
            Durum güncellemeleri okul yönetimi tarafından yapılır.
          </p>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          {/*
            İş 2 — aynı gün birden fazla ders varsa (day.lessonIds.length > 1)
            her ders kendi satırında, kendi kimlik bilgisiyle (saat/öğretmen/
            enstrüman/oda/süre) ve BAĞIMSIZ Geldi/İşlendi/Telafi kontrolleriyle
            gösterilir — bir dersin durumu değiştirilmesi diğerini asla
            etkilemez (her biri kendi lessonId'siyle ayrı bir API çağrısı
            yapar, bkz. LessonOpsActions/setLessonOpsFlagTool).
          */}
          {day.lessonIds.map((lessonId) => {
            const lessonInfo = day.lessons.find((l) => l.lessonId === lessonId);
            const opsStatus = lessonInfo?.opsStatus ?? null;
            return (
              <div key={lessonId} className="rounded-md border border-[var(--color-border)] p-1.5">
                {lessonInfo ? <LessonSummaryLine lesson={lessonInfo} /> : null}
                <LessonOpsActions
                  lessonId={lessonId}
                  compact
                  studentAttended={opsStatus === "attended"}
                  lessonProcessed={opsStatus === "processed"}
                  opsMakeupFlag={opsStatus === "makeup"}
                  studentAbsent={opsStatus === "absent"}
                  studentExcused={opsStatus === "excused"}
                  onStatusChange={onLessonStatusChange}
                  onSettled={onLessonOpsSettled}
                />
              </div>
            );
          })}
        </div>
      )}
      {day.payments.length > 0 ? (
        <div className="mt-2 space-y-1.5 border-t border-[var(--color-border)] pt-2">
          {day.payments.map((p) => (
            <div key={p.lessonId} className="rounded-md bg-[var(--color-surface)] p-1.5 text-[11px]">
              <p className="font-semibold text-[var(--color-text)]">{formatMoneyTL(p.amount)}</p>
              <p className="text-[var(--color-text-muted)]">Tutar kayıt tarihi: {formatRecordedAt(p.recordedAt)}</p>
              <p className="text-[var(--color-text-muted)]">
                Ödeme şekli: {p.method ? PAYMENT_METHOD_LABEL[p.method] ?? p.method : "Belirtilmemiş"}
                {p.methodIsStudentDefault ? " (öğrenci varsayılanı — tahmini)" : ""}
              </p>
              {/*
                Tahsilat alanı — yoklama (Geldi/İşlendi/Telafi) aksiyonlarından
                görsel olarak AYRI bir bölge (üstte kesik çizgi + farklı
                arka plan): aynı Payment kaynağını okur/yazar (Ödemeler
                ekranıyla aynı `/api/v1/payments/:paymentId/pay` uç noktası),
                yeni/paralel bir ödeme kaydı YOK.
              */}
              <div className="mt-1.5 border-t border-dashed border-[var(--color-border)] pt-1.5">
                {p.status === "voided" ? (
                  <p className="text-[var(--color-text-muted)]">Ders iptal edildiği için tahsilat iptal edildi.</p>
                ) : p.status === "paid" ? (
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        Tahsil edildi — {formatMoneyTL(p.amount)}
                      </span>
                      <Link
                        href={withReturnTo(`/makbuz/${p.paymentId}`, currentPath)}
                        className="font-medium text-[var(--color-primary)] hover:underline"
                      >
                        Makbuz →
                      </Link>
                    </div>
                    {p.paidAt ? (
                      <p className="text-[var(--color-text-muted)]">Ödeme tarihi: {formatRecordedAt(p.paidAt)}</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {p.paidAmount > 0 ? (
                      <p className="font-medium text-amber-700 dark:text-amber-400">
                        {formatMoneyTL(p.paidAmount)} alındı / {formatMoneyTL(p.amount - p.paidAmount)} kaldı
                      </p>
                    ) : null}
                    {canCollectPayment ? (
                      <AttendanceCalendarCollectPaymentButton
                        paymentId={p.paymentId}
                        lessonId={p.lessonId}
                        defaultMethod={p.method}
                        registeredAmount={p.amount - p.paidAmount}
                        onSettled={onLessonOpsSettled}
                      />
                    ) : (
                      <span className="text-[var(--color-text-muted)]">
                        {!canEdit || readOnly
                          ? "Tahsil edilmedi."
                          : day.status === "closed"
                            ? "Kapalı gün — tahsilat alınamaz."
                            : !studentActive
                              ? "Pasif öğrenci — tahsilat alınamaz."
                              : "Tahsil edilmedi."}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
