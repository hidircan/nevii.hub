"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, SlidersHorizontal, X } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { PaginationControls, usePagination } from "@/components/pagination-controls";
import { StudentArchiveAction } from "@/components/student-archive-action";
import { StudentsBulkBar, type BulkOptions } from "@/components/students-bulk-bar";
import {
  DEFAULT_STUDENT_COLUMNS,
  STUDENT_COLUMN_LABELS,
  StudentColumnViewManager,
  loadLastUsedStudentColumns,
  type StudentColumnKey,
} from "@/components/student-column-view-manager";

/** Oluşturan kullanıcısı kaydedilmemiş eski öğrenciler için ortak etiket (filtre + sütun). */
export const LEGACY_CREATOR_LABEL = "Bilinmiyor (eski kayıt)";

export type StudentRow = {
  id: string;
  name: string;
  branchName?: string;
  instruments: string[];
  teacherName?: string;
  packageName: string;
  monthlyFee: number;
  active: boolean;
  /** Faz 1B — öğrenci birden fazla türe sahip olabilir; boş dizi = belirtilmemiş. */
  studentTypes: string[];
  enrollmentStartDate?: string;
  enrollmentEndDate?: string;
  level?: string;
  targetExam?: string;
  educationMethod?: string;
  /** Öğrencinin en güncel/aciliyeti en yüksek ödeme durumu — tek etiket. */
  paymentStatus: "paid" | "overdue" | "partial" | "pending" | "none";
  /**
   * D — Sözleşme filtreleri (2026-09-20). Öğrencinin GÜNCEL sözleşmesinin
   * özeti; `getLatestContractForStudent` ile AYNI "güncel" tanımından gelir
   * (bkz. listContractSummariesByStudent). Sözleşmesi hiç yoksa hepsi boş.
   */
  contractNumber?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  contractStatus?: string;
  /** Kayıtta seçilen süre (ay) — sözleşmesiz öğrencide "bekliyor" / "tanışma" ayrımı. */
  intendedDurationMonths?: number;
  /** Kayıt (öğrencinin sisteme eklendiği) zamanı — "oluşturulma tarihine göre" sıralama için. */
  createdAt?: string;
  /** F — kurum içi öğrenci numarası. */
  displayId?: string;
  /** F — kaydı oluşturan kişinin adı; eski kayıtlarda "Bilinmiyor (eski kayıt)". */
  createdByName?: string;
  /** Denemeden dönüştüyse dönüşümü yapan kişi (kaydı açandan farklı olabilir). */
  convertedByName?: string;
  fromTrial?: boolean;
};

/**
 * Sözleşme durumu — OPERASYONEL kategoriler (ham sözleşme statüsü değil).
 * Yöneticinin ekranda sorduğu soru "bu öğrencinin sözleşmesi tamam mı,
 * bitiyor mu, bitti mi?" — bu yüzden filtre bu dile göre kurulur.
 */
export type ContractFilterKey = "none" | "pending" | "active" | "expiring" | "expired" | "cancelled";

export const CONTRACT_FILTER_KEYS: ContractFilterKey[] = ["active", "expiring", "expired", "pending", "none", "cancelled"];

/**
 * Sözleşme kayıtta zorunlu değildir (2026-09-22). Sözleşmesiz öğrenci HATA değildir:
 * - "pending"  → uzun dönemli (3+ ay) ya da süresi bilinmeyen kayıt, sözleşme henüz yapılmadı.
 * - "none"     → tanışma paketi (1–2 ay); formal sözleşme gerekmiyor.
 */
export const CONTRACT_FILTER_LABELS: Record<ContractFilterKey, string> = {
  pending: "Sözleşme bekliyor",
  none: "Sözleşmesiz (tanışma)",
  active: "Aktif sözleşmeli",
  expiring: "Yakında bitecek (30 gün)",
  expired: "Süresi geçmiş",
  cancelled: "İptal/yenilenmiş",
};

/** Bir öğrencinin sözleşme durumunu tek kategoriye indirger. `today` yyyy-MM-dd. */
export function resolveContractFilterKey(row: StudentRow, today: string): ContractFilterKey {
  if (!row.contractNumber || !row.contractEndDate) {
    const months = row.intendedDurationMonths;
    return months !== undefined && months < 3 ? "none" : "pending";
  }
  if (row.contractStatus === "cancelled" || row.contractStatus === "superseded") return "cancelled";
  if (row.contractEndDate < today) return "expired";
  // 30 gün içinde bitiyorsa "yakında bitecek" — yenileme aksiyonu gerektirir.
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + 30);
  return row.contractEndDate <= limit.toISOString().slice(0, 10) ? "expiring" : "active";
}

export const SORT_OPTIONS = [
  { key: "name_asc", label: "İsim (A → Z)" },
  { key: "name_desc", label: "İsim (Z → A)" },
  { key: "created_desc", label: "Kayıt tarihi (yeniden eskiye)" },
  { key: "created_asc", label: "Kayıt tarihi (eskiden yeniye)" },
  { key: "contract_end_asc", label: "Sözleşme bitişi (en yakın önce)" },
  { key: "contract_start_desc", label: "Sözleşme başlangıcı (en yeni önce)" },
  { key: "fee_desc", label: "Aylık ücret (yüksekten düşüğe)" },
  { key: "fee_asc", label: "Aylık ücret (düşükten yükseğe)" },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]["key"];

/** Türkçe alfabetik sıralama — `localeCompare(..., "tr")` İ/ı/ş/ğ sırasını doğru verir. */
export function compareStudents(a: StudentRow, b: StudentRow, sort: SortKey): number {
  switch (sort) {
    case "name_asc":
      return a.name.localeCompare(b.name, "tr");
    case "name_desc":
      return b.name.localeCompare(a.name, "tr");
    case "created_desc":
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    case "created_asc":
      return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    case "contract_end_asc":
      // Sözleşmesi olmayanlar en sona — "en yakın biten" listesi boşlarla dolmasın.
      return (a.contractEndDate ?? "9999").localeCompare(b.contractEndDate ?? "9999");
    case "contract_start_desc":
      return (b.contractStartDate ?? "").localeCompare(a.contractStartDate ?? "");
    case "fee_desc":
      return b.monthlyFee - a.monthlyFee;
    case "fee_asc":
      return a.monthlyFee - b.monthlyFee;
    default:
      return 0;
  }
}

type StatusFilter = "active" | "inactive" | "all";

const STATUS_LABELS: Record<StatusFilter, string> = { active: "Aktif", inactive: "Pasif", all: "Tümü" };
const PAYMENT_LABELS: Record<StudentRow["paymentStatus"], string> = {
  paid: "Güncel",
  overdue: "Gecikmiş",
  partial: "Kısmi",
  pending: "Bekliyor",
  none: "Kayıt yok",
};
const PAYMENT_VALUES: StudentRow["paymentStatus"][] = ["paid", "overdue", "partial", "pending", "none"];

type FilterGroup = {
  key: string;
  label: string;
  type: "multi" | "status" | "dateRange" | "contractStartRange" | "contractEndRange";
  options?: string[];
};

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function uniqueSorted(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b, "tr"));
}

export function StudentsTable({
  rows,
  tenantId,
  userId,
  canManage = false,
  bulkOptions,
  deletedView = false,
}: {
  /** E — verilirse satır seçimi + toplu işlem çubuğu açılır (kurum sahibi/yöneticisi, tek kurum görünümü). */
  bulkOptions?: BulkOptions;
  /** Silinen öğrenciler görünümü — toplu işlem yalnız "Geri al". */
  deletedView?: boolean;
  rows: StudentRow[];
  /** Kolon görünüm tercihinin (localStorage) anahtarını oluşturmak için — kurum/tenant scope'undan bağımsız, yalnızca localStorage key izolasyonu içindir. */
  tenantId?: string;
  /** "Son kullanılan görünüm" kişiye özeldir — bu, hangi tarayıcı anahtarının kullanılacağını belirler. */
  userId?: string;
  /** Arşivle/Yeniden aktifleştir aksiyonu ve "Sütunlar / Görünüm yönetimi" yalnızca yönetici görür (mevcut yetki modeliyle aynı: SCHOOL_ADMIN/SUPER_ADMIN). */
  canManage?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [optionSearch, setOptionSearch] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState<StudentColumnKey[]>(DEFAULT_STUDENT_COLUMNS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const canBulk = canManage && !!bulkOptions;

  useEffect(() => {
    if (!tenantId || !userId) return;
    const lastUsed = loadLastUsedStudentColumns(tenantId, userId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage senkron, yalnız mount'ta bir kez
    if (lastUsed) setColumns(lastUsed);
  }, [tenantId, userId]);

  /**
   * P0 UAT (2026-09-07) — "öğrenci adı aratırken ciddi kasılma".
   *
   * KÖK NEDEN (ölçüldü): arama terimi YALNIZCA URL'de tutuluyordu
   * (`searchParams.get("q")`) ve input doğrudan ona bağlıydı. Her tuş
   * `router.replace` tetikliyor, sayfa `force-dynamic` olduğu için bu bir
   * SUNUCU RSC turu demek ve o tur `readScopedData()` ile tenant'ın TÜM
   * verisini yeniden okuyor. Ölçüm: 6 harflik bir aramada 12 adet
   * `/panel/ogrenciler` isteği. Üstelik input URL'den beslendiği için
   * yazılan karakter navigasyon tamamlanana kadar EKRANDA GÖRÜNMÜYORDU.
   *
   * Düzeltme: (1) input YEREL state ile sürülür → yazma asla bloklanmaz,
   * (2) filtreleme zaten istemci tarafında (`rows` bellekte) olduğu için
   * sonuç ANINDA gelir, sunucuya hiç gidilmez, (3) URL yalnızca 250 ms
   * gecikmeyle senkronlanır — derin bağlantı/geri-ileri davranışı korunur.
   */
  const urlSearch = searchParams.get("q") ?? "";
  const [searchInput, setSearchInput] = useState(urlSearch);

  /**
   * URL dışarıdan değişirse (geri/ileri, derin bağlantı, "Temizle") input'u
   * izle. Effect DEĞİL, React'in "prop değişince state'i ayarla" deseni.
   *
   * ÖNEMLİ: kendi debounced `router.replace` yankısını ASLA local input'un
   * üstüne yazma. Filtre açıkken (`?contract=active`) her `q` yazımı ayrı bir
   * soft nav olduğu için gecikme artar; kullanıcı `ab` yazmışken `q=a` yankısı
   * gelirse kör `setSearchInput(urlSearch)` "b"yi siler (imleç zıplaması).
   * Yalnız local hâlâ önceki URL ile aynıysa (gerçek dış değişiklik) uygula.
   */
  const [lastUrlSearch, setLastUrlSearch] = useState(urlSearch);
  if (urlSearch !== lastUrlSearch) {
    const previousUrlSearch = lastUrlSearch;
    setLastUrlSearch(urlSearch);
    if (searchInput === previousUrlSearch) {
      setSearchInput(urlSearch);
    }
  }

  // Filtre toggle'ları searchParams kimliğini değiştirir; debounce effect'inin
  // deps'inde tutmak yazma sırasında gereksiz yeniden zamanlama üretir.
  // Güncel params'ı ref'ten oku — q senkronu yalnız searchInput değişince.
  // Ref render sırasında yazılmaz (React 19 kuralı); effect'ler sırayla çalıştığı
  // için aşağıdaki debounce effect'i her zaman güncel değeri görür.
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  // Yazma bitince URL'i güncelle — tuş başına navigasyon YOK.
  useEffect(() => {
    if (searchInput === urlSearch) return;
    const id = setTimeout(() => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      if (searchInput) params.set("q", searchInput);
      else params.delete("q");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(id);
  }, [searchInput, urlSearch, router, pathname]);

  /** Filtre ve "aktif filtre var mı" göstergeleri ANINDA yerel değeri kullanır. */
  const search = searchInput;
  // Pasif öğrenciler varsayılan gizli — yalnız durum filtresiyle görünür.
  const statusFilter = (searchParams.get("status") ?? "active") as StatusFilter;
  const typeFilter = searchParams.getAll("type");
  const branchFilter = searchParams.getAll("branch");
  const packageFilter = searchParams.getAll("package");
  const teacherFilter = searchParams.getAll("teacher");
  const methodFilter = searchParams.getAll("method");
  const levelFilter = searchParams.getAll("level");
  const paymentFilter = searchParams.getAll("payment");
  const creatorFilter = searchParams.getAll("creator");
  const enrolledFrom = searchParams.get("from") ?? "";
  const enrolledTo = searchParams.get("to") ?? "";
  // D — sözleşme filtreleri
  const contractFilter = searchParams.getAll("contract") as ContractFilterKey[];
  const contractStartFrom = searchParams.get("csFrom") ?? "";
  const contractStartTo = searchParams.get("csTo") ?? "";
  const contractEndFrom = searchParams.get("ceFrom") ?? "";
  const contractEndTo = searchParams.get("ceTo") ?? "";
  // I — sıralama
  const sort = (searchParams.get("sort") as SortKey | null) ?? "name_asc";
  /** Sözleşme kategorileri "bugüne" göre çözülür; render başına tek kez hesaplanır. */
  const today = new Date().toISOString().slice(0, 10);

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function setSingle(key: string, value: string) {
    updateParams((params) => {
      if (value && value !== "") params.set(key, value);
      else params.delete(key);
    });
  }

  function toggleMulti(key: string, value: string, current: string[]) {
    updateParams((params) => {
      const next = toggleInList(current, value);
      params.delete(key);
      next.forEach((v) => params.append(key, v));
    });
  }

  function removeOne(key: string, value: string, current: string[]) {
    updateParams((params) => {
      params.delete(key);
      current.filter((v) => v !== value).forEach((v) => params.append(key, v));
    });
  }

  function clearAll() {
    // Debounce ortasında "Temizle" — local q'yu da sıfırla; aksi halde stale
    // echo koruması eski metni URL temizlendikten sonra bile tutardı.
    setSearchInput("");
    setLastUrlSearch("");
    router.replace(pathname, { scroll: false });
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setOpenGroup(null);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setOpenGroup(null);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const branchOptions = useMemo(() => uniqueSorted(rows.map((r) => r.branchName)), [rows]);
  const typeOptions = useMemo(() => uniqueSorted(rows.flatMap((r) => r.studentTypes)), [rows]);
  const packageOptions = useMemo(() => uniqueSorted(rows.map((r) => r.packageName)), [rows]);
  const teacherOptions = useMemo(() => uniqueSorted(rows.map((r) => r.teacherName)), [rows]);
  const methodOptions = useMemo(() => uniqueSorted(rows.map((r) => r.educationMethod)), [rows]);
  const levelOptions = useMemo(() => uniqueSorted(rows.map((r) => r.level)), [rows]);
  const creatorOptions = useMemo(() => uniqueSorted(rows.map((r) => r.createdByName ?? LEGACY_CREATOR_LABEL)), [rows]);

  const groups: FilterGroup[] = [
    { key: "status", label: "Durum", type: "status" },
    { key: "type", label: "Öğrenci türü", type: "multi", options: typeOptions },
    { key: "branch", label: "Şube", type: "multi", options: branchOptions },
    { key: "teacher", label: "Öğretmen", type: "multi", options: teacherOptions },
    { key: "method", label: "Eğitim metodu", type: "multi", options: methodOptions },
    { key: "package", label: "Paket", type: "multi", options: packageOptions },
    { key: "level", label: "MEB/LCM seviye", type: "multi", options: levelOptions },
    { key: "payment", label: "Ödeme durumu", type: "multi", options: PAYMENT_VALUES.map((v) => PAYMENT_LABELS[v]) },
    { key: "creator", label: "Kaydı oluşturan", type: "multi", options: creatorOptions },
    { key: "enrollment", label: "Kayıt tarihi", type: "dateRange" },
    { key: "contract", label: "Sözleşme durumu", type: "multi", options: CONTRACT_FILTER_KEYS.map((k) => CONTRACT_FILTER_LABELS[k]) },
    { key: "contractStart", label: "Sözleşme başlangıcı", type: "contractStartRange" },
    { key: "contractEnd", label: "Sözleşme bitişi", type: "contractEndRange" },
  ];

  function selectedFor(key: string): string[] {
    if (key === "type") return typeFilter;
    if (key === "branch") return branchFilter;
    if (key === "teacher") return teacherFilter;
    if (key === "method") return methodFilter;
    if (key === "package") return packageFilter;
    if (key === "level") return levelFilter;
    if (key === "creator") return creatorFilter;
    if (key === "payment") return paymentFilter.map((p) => PAYMENT_LABELS[p as StudentRow["paymentStatus"]] ?? p);
    if (key === "contract") return contractFilter.map((c) => CONTRACT_FILTER_LABELS[c] ?? c);
    return [];
  }

  function summaryFor(group: FilterGroup): string {
    if (group.type === "status") return statusFilter === "active" ? "Aktif" : STATUS_LABELS[statusFilter];
    if (group.type === "dateRange") {
      if (!enrolledFrom && !enrolledTo) return "Tümü";
      return `${enrolledFrom || "…"} – ${enrolledTo || "…"}`;
    }
    if (group.type === "contractStartRange") {
      if (!contractStartFrom && !contractStartTo) return "Tümü";
      return `${contractStartFrom || "…"} – ${contractStartTo || "…"}`;
    }
    if (group.type === "contractEndRange") {
      if (!contractEndFrom && !contractEndTo) return "Tümü";
      return `${contractEndFrom || "…"} – ${contractEndTo || "…"}`;
    }
    const selected = selectedFor(group.key);
    if (selected.length === 0) return "Tümü";
    if (selected.length === 1) return selected[0]!;
    return `${selected.length} seçili`;
  }

  function toggleOption(group: FilterGroup, option: string) {
    if (group.key === "payment") {
      const paymentValue = PAYMENT_VALUES.find((v) => PAYMENT_LABELS[v] === option) ?? option;
      toggleMulti("payment", paymentValue, paymentFilter);
      return;
    }
    if (group.key === "contract") {
      const contractValue = CONTRACT_FILTER_KEYS.find((v) => CONTRACT_FILTER_LABELS[v] === option) ?? option;
      toggleMulti("contract", contractValue, contractFilter);
      return;
    }
    toggleMulti(group.key, option, selectedFor(group.key));
  }

  const activeGroupCount =
    (statusFilter !== "active" ? 1 : 0) +
    (typeFilter.length ? 1 : 0) +
    (branchFilter.length ? 1 : 0) +
    (teacherFilter.length ? 1 : 0) +
    (methodFilter.length ? 1 : 0) +
    (packageFilter.length ? 1 : 0) +
    (levelFilter.length ? 1 : 0) +
    (paymentFilter.length ? 1 : 0) +
    (creatorFilter.length ? 1 : 0) +
    (enrolledFrom || enrolledTo ? 1 : 0) +
    (contractFilter.length ? 1 : 0) +
    (contractStartFrom || contractStartTo ? 1 : 0) +
    (contractEndFrom || contractEndTo ? 1 : 0);

  const filterQuery = search.trim().toLocaleLowerCase("tr");
  const filtered = rows.filter((row) => {
    if (
      filterQuery &&
      !row.name.toLocaleLowerCase("tr").includes(filterQuery) &&
      !(row.displayId ?? "").toLocaleLowerCase("tr").includes(filterQuery)
    )
      return false;
    if (statusFilter === "active" && !row.active) return false;
    if (statusFilter === "inactive" && row.active) return false;
    if (typeFilter.length && !row.studentTypes.some((t) => typeFilter.includes(t))) return false;
    if (branchFilter.length && !(row.branchName && branchFilter.includes(row.branchName))) return false;
    if (packageFilter.length && !packageFilter.includes(row.packageName)) return false;
    if (teacherFilter.length && !(row.teacherName && teacherFilter.includes(row.teacherName))) return false;
    if (methodFilter.length && !(row.educationMethod && methodFilter.includes(row.educationMethod))) return false;
    if (levelFilter.length && !(row.level && levelFilter.includes(row.level))) return false;
    if (paymentFilter.length && !paymentFilter.includes(row.paymentStatus)) return false;
    if (creatorFilter.length && !creatorFilter.includes(row.createdByName ?? LEGACY_CREATOR_LABEL)) return false;
    if (enrolledFrom && (!row.enrollmentStartDate || row.enrollmentStartDate < enrolledFrom)) return false;
    if (enrolledTo && (!row.enrollmentStartDate || row.enrollmentStartDate > enrolledTo)) return false;
    if (contractFilter.length && !contractFilter.includes(resolveContractFilterKey(row, today))) return false;
    if (contractStartFrom && (!row.contractStartDate || row.contractStartDate < contractStartFrom)) return false;
    if (contractStartTo && (!row.contractStartDate || row.contractStartDate > contractStartTo)) return false;
    if (contractEndFrom && (!row.contractEndDate || row.contractEndDate < contractEndFrom)) return false;
    if (contractEndTo && (!row.contractEndDate || row.contractEndDate > contractEndTo)) return false;
    return true;
  });
  // React Compiler zaten memoize ediyor; elle useMemo, `filtered`'ın her
  // render'da yeniden üretilmesi nedeniyle korunamıyor (lint uyarısı).
  const sorted = [...filtered].sort((a, b) => compareStudents(a, b, sort));

  const anyFilterActive = Boolean(search) || activeGroupCount > 0;
  // H — sayfa başına 10/20/50/100; seçim URL'de saklanır (yenileme/geri-ileri korur).
  const { pageItems, page, setPage, pageSize, setPageSize, totalPages, totalCount } = usePagination(sorted, 10, {
    urlParam: "per",
  });

  // Aktif filtreler için kaldırılabilir chip listesi.
  type Chip = { key: string; value: string; label: string; onRemove: () => void };
  const multiChipDefs: { key: string; label: string; values: string[] }[] = [
    { key: "type", label: "Tür", values: typeFilter },
    { key: "branch", label: "Şube", values: branchFilter },
    { key: "teacher", label: "Öğretmen", values: teacherFilter },
    { key: "method", label: "Metod", values: methodFilter },
    { key: "package", label: "Paket", values: packageFilter },
    { key: "level", label: "Seviye", values: levelFilter },
    { key: "creator", label: "Oluşturan", values: creatorFilter },
  ];
  const chips: Chip[] = [
    ...(statusFilter !== "active"
      ? [{ key: "status", value: statusFilter, label: `Durum: ${STATUS_LABELS[statusFilter]}`, onRemove: () => setSingle("status", "active") }]
      : []),
    ...multiChipDefs.flatMap((def) =>
      def.values.map((value) => ({
        key: def.key,
        value,
        label: `${def.label}: ${value}`,
        onRemove: () => removeOne(def.key, value, def.values),
      }))
    ),
    ...contractFilter.map((value) => ({
      key: "contract",
      value,
      label: `Sözleşme: ${CONTRACT_FILTER_LABELS[value] ?? value}`,
      onRemove: () => removeOne("contract", value, contractFilter),
    })),
    ...(contractStartFrom || contractStartTo
      ? [
          {
            key: "contractStart",
            value: "range",
            label: `Sözleşme başlangıcı: ${contractStartFrom || "…"} – ${contractStartTo || "…"}`,
            onRemove: () =>
              updateParams((params) => {
                params.delete("csFrom");
                params.delete("csTo");
              }),
          },
        ]
      : []),
    ...(contractEndFrom || contractEndTo
      ? [
          {
            key: "contractEnd",
            value: "range",
            label: `Sözleşme bitişi: ${contractEndFrom || "…"} – ${contractEndTo || "…"}`,
            onRemove: () =>
              updateParams((params) => {
                params.delete("ceFrom");
                params.delete("ceTo");
              }),
          },
        ]
      : []),
    ...paymentFilter.map((value) => ({
      key: "payment",
      value,
      label: `Ödeme: ${PAYMENT_LABELS[value as StudentRow["paymentStatus"]] ?? value}`,
      onRemove: () => removeOne("payment", value, paymentFilter),
    })),
    ...(enrolledFrom || enrolledTo
      ? [
          {
            key: "enrollment",
            value: "range",
            label: `Kayıt: ${enrolledFrom || "…"} – ${enrolledTo || "…"}`,
            onRemove: () =>
              updateParams((params) => {
                params.delete("from");
                params.delete("to");
              }),
          },
        ]
      : []),
  ];

  const openGroupDef = groups.find((g) => g.key === openGroup);
  const filteredOptions = openGroupDef?.options?.filter((o) => o.toLowerCase().includes(optionSearch.toLowerCase())) ?? [];

  return (
    <>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Ad soyad veya öğrenci no ara..."
            aria-label="Ad soyad veya öğrenci numarasına göre ara"
            className="w-full max-w-xs rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]/30 sm:w-auto"
          />

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => {
                setMenuOpen((v) => !v);
                setOpenGroup(null);
              }}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)]"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              Filtreler
              {activeGroupCount > 0 ? (
                <span className="ml-1 rounded-full bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {activeGroupCount}
                </span>
              ) : null}
            </button>

            {menuOpen ? (
              <div
                role="dialog"
                aria-label="Filtreler"
                className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)] sm:absolute sm:inset-auto sm:top-full sm:bottom-auto sm:mt-2 sm:w-80 sm:rounded-[var(--radius-lg)]"
              >
                {openGroup && openGroupDef ? (
                  <div>
                    <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setOpenGroup(null);
                          setOptionSearch("");
                        }}
                        aria-label="Geri"
                        className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                      >
                        <ChevronRight className="h-4 w-4 rotate-180" aria-hidden />
                      </button>
                      <p className="text-sm font-semibold text-[var(--color-text)]">{openGroupDef.label}</p>
                    </div>

                    {openGroupDef.type === "status" ? (
                      <ul role="listbox" aria-label={openGroupDef.label} className="p-2">
                        {(["active", "all", "inactive"] as StatusFilter[]).map((value) => (
                          <li key={value}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={statusFilter === value}
                              onClick={() => setSingle("status", value)}
                              className="flex w-full items-center justify-between rounded-[var(--radius-md)] px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-muted)]"
                            >
                              <span className="text-[var(--color-text)]">{STATUS_LABELS[value]}</span>
                              {statusFilter === value ? <span className="text-[var(--color-primary)]">✓</span> : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : openGroupDef.type === "dateRange" ||
                      openGroupDef.type === "contractStartRange" ||
                      openGroupDef.type === "contractEndRange" ? (
                      (() => {
                        // Üç tarih aralığı aynı UI'ı paylaşır; yalnız hangi
                        // parametreyi yazdıkları ve Türkçe açıklamaları farklı.
                        const range =
                          openGroupDef.type === "dateRange"
                            ? { fromKey: "from", toKey: "to", from: enrolledFrom, to: enrolledTo, hint: "Öğrencinin kuruma kayıt tarihi." }
                            : openGroupDef.type === "contractStartRange"
                              ? { fromKey: "csFrom", toKey: "csTo", from: contractStartFrom, to: contractStartTo, hint: "Güncel sözleşmenin başlangıç tarihi bu aralıkta olan öğrenciler." }
                              : { fromKey: "ceFrom", toKey: "ceTo", from: contractEndFrom, to: contractEndTo, hint: "Güncel sözleşmenin bitiş tarihi bu aralıkta olan öğrenciler." };
                        return (
                          <div className="space-y-2 p-3">
                            <p className="text-[11px] text-[var(--color-text-muted)]">{range.hint}</p>
                            <label className="block text-xs text-[var(--color-text-muted)]">
                              Şu tarihten sonra
                              <input
                                type="date"
                                value={range.from}
                                onChange={(e) => setSingle(range.fromKey, e.target.value)}
                                className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                              />
                            </label>
                            <label className="block text-xs text-[var(--color-text-muted)]">
                              Şu tarihten önce
                              <input
                                type="date"
                                value={range.to}
                                onChange={(e) => setSingle(range.toKey, e.target.value)}
                                className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                              />
                            </label>
                          </div>
                        );
                      })()
                    ) : (
                      <div>
                        {(openGroupDef.options?.length ?? 0) > 6 ? (
                          <div className="px-3 pt-2">
                            <input
                              type="text"
                              value={optionSearch}
                              onChange={(e) => setOptionSearch(e.target.value)}
                              placeholder={`${openGroupDef.label} içinde ara...`}
                              aria-label={`${openGroupDef.label} içinde ara`}
                              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]/30"
                            />
                          </div>
                        ) : null}
                        <ul role="listbox" aria-multiselectable="true" aria-label={openGroupDef.label} className="max-h-64 overflow-y-auto p-2">
                          {filteredOptions.length === 0 ? (
                            <li className="px-3 py-2 text-sm text-[var(--color-text-muted)]">Sonuç yok.</li>
                          ) : (
                            filteredOptions.map((opt) => {
                              const checked = selectedFor(openGroupDef.key).includes(opt);
                              return (
                                <li key={opt}>
                                  <label className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm hover:bg-[var(--color-surface-muted)]">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleOption(openGroupDef, opt)}
                                      className="h-4 w-4 accent-[var(--color-primary)]"
                                    />
                                    <span className="text-[var(--color-text)]">{opt}</span>
                                  </label>
                                </li>
                              );
                            })
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2.5">
                      <p className="text-sm font-semibold text-[var(--color-text)]">Filtreler</p>
                      <button type="button" onClick={() => setMenuOpen(false)} aria-label="Kapat" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] sm:hidden">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <ul role="list" className="p-2">
                      {groups.map((group) => (
                        <li key={group.key}>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenGroup(group.key);
                              setOptionSearch("");
                            }}
                            className="flex w-full items-center justify-between rounded-[var(--radius-md)] px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-muted)]"
                          >
                            <span className="text-[var(--color-text)]">{group.label}</span>
                            <span className="flex items-center gap-1 text-[var(--color-text-muted)]">
                              <span className="max-w-[9rem] truncate text-xs">{summaryFor(group)}</span>
                              <ChevronRight className="h-4 w-4" aria-hidden />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {anyFilterActive ? (
                      <div className="border-t border-[var(--color-border)] p-2">
                        <button
                          type="button"
                          onClick={clearAll}
                          className="w-full rounded-[var(--radius-md)] px-3 py-2 text-center text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                        >
                          Filtreleri Temizle
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <select
            value={sort}
            onChange={(e) => setSingle("sort", e.target.value === "name_asc" ? "" : e.target.value)}
            aria-label="Sıralama"
            className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>

          {canManage ? (
            <StudentColumnViewManager
              tenantId={tenantId ?? "default"}
              userId={userId ?? "unknown"}
              columns={columns}
              onChange={setColumns}
            />
          ) : null}

          <Link
            href={`${pathname}?${(() => {
              const p = new URLSearchParams(searchParams.toString());
              p.set("status", "inactive");
              return p.toString();
            })()}`}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:border-[var(--color-primary)]"
          >
            Arşiv
          </Link>

          {chips.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {chips.map((chip) => (
                <button
                  key={`${chip.key}-${chip.value}`}
                  type="button"
                  onClick={chip.onRemove}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                >
                  {chip.label}
                  <X className="h-3 w-3" aria-hidden />
                </button>
              ))}
            </div>
          ) : null}

          {anyFilterActive ? (
            <button
              type="button"
              onClick={clearAll}
              className="ml-auto hidden text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-danger)] sm:inline"
            >
              Filtreleri Temizle
            </button>
          ) : null}
        </div>

        {/* D — operasyonel hızlı filtreler: en sık sorulan dört soru tek tıkla. */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            Sözleşme
          </span>
          {CONTRACT_FILTER_KEYS.map((key) => {
            const active = contractFilter.includes(key);
            const count = rows.filter((r) => resolveContractFilterKey(r, today) === key).length;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => toggleMulti("contract", key, contractFilter)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-text)]"
                    : "border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]"
                }`}
              >
                {CONTRACT_FILTER_LABELS[key]}
                <span className="ml-1 opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-[var(--color-text-muted)]">
          <span>
            {anyFilterActive ? `${rows.length} öğrenciden ${filtered.length} öğrenci gösteriliyor` : `Toplam ${rows.length} öğrenci`}
          </span>
          {canBulk && selectedIds.size > 0 && selectedIds.size < sorted.length ? (
            <button
              type="button"
              onClick={() => setSelectedIds(new Set(sorted.map((r) => r.id)))}
              className="text-[var(--color-primary)] hover:underline"
            >
              Listedeki {sorted.length} öğrencinin tümünü seç
            </button>
          ) : null}
        </p>
      </Card>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            <tr>
              {canBulk ? (
                <th className="w-9 py-3 pl-4 pr-0">
                  <input
                    type="checkbox"
                    aria-label="Bu sayfadaki tüm öğrencileri seç"
                    checked={pageItems.length > 0 && pageItems.every((r) => selectedIds.has(r.id))}
                    ref={(el) => {
                      if (el) el.indeterminate = pageItems.some((r) => selectedIds.has(r.id)) && !pageItems.every((r) => selectedIds.has(r.id));
                    }}
                    onChange={(e) => {
                      const next = new Set(selectedIds);
                      for (const r of pageItems) {
                        if (e.target.checked) next.add(r.id);
                        else next.delete(r.id);
                      }
                      setSelectedIds(next);
                    }}
                    className="h-4 w-4 accent-[var(--color-primary)]"
                  />
                </th>
              ) : null}
              <th className="px-4 py-3">Öğrenci</th>
              {columns.map((key) => (
                <th key={key} className="px-4 py-3">
                  {STUDENT_COLUMN_LABELS[key]}
                </th>
              ))}
              {canManage ? <th className="px-4 py-3">İşlem</th> : null}
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={1 + columns.length + (canManage ? 1 : 0) + (canBulk ? 1 : 0)} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  Bu filtreye uyan öğrenci bulunamadı.
                </td>
              </tr>
            ) : (
              pageItems.map((s) => (
                <tr
                  key={s.id}
                  aria-selected={canBulk ? selectedIds.has(s.id) : undefined}
                  className={`border-b border-[var(--color-border)] align-top last:border-0 ${
                    selectedIds.has(s.id) ? "bg-[var(--color-primary-soft)]/40" : ""
                  }`}
                >
                  {canBulk ? (
                    <td className="w-9 py-3 pl-4 pr-0">
                      <input
                        type="checkbox"
                        aria-label={`${s.name} öğrencisini seç`}
                        checked={selectedIds.has(s.id)}
                        onChange={(e) => {
                          const next = new Set(selectedIds);
                          if (e.target.checked) next.add(s.id);
                          else next.delete(s.id);
                          setSelectedIds(next);
                        }}
                        className="h-4 w-4 accent-[var(--color-primary)]"
                      />
                    </td>
                  ) : null}
                  <td className="p-0">
                    <Link
                      href={`/panel/ogrenciler/${s.id}`}
                      className="block px-4 py-3 hover:bg-[var(--color-surface-muted)] focus-visible:bg-[var(--color-surface-muted)] focus-visible:outline-none"
                    >
                      <p className="font-medium text-[var(--color-text)]">{s.name}</p>
                      {!s.active ? <span className="text-xs font-medium text-[var(--color-danger)]">Pasif</span> : null}
                    </Link>
                  </td>
                  {columns.map((key) => (
                    <td key={key} className="px-4 py-3">
                      {key === "displayId" ? (
                        <span className="font-mono text-xs text-[var(--color-text)]">{s.displayId ?? "—"}</span>
                      ) : key === "createdBy" ? (
                        <span className="block text-[var(--color-text)]">
                          {s.createdByName ?? LEGACY_CREATOR_LABEL}
                          {s.fromTrial ? (
                            <span
                              className="mt-0.5 block text-[11px] font-medium"
                              style={{ color: "var(--color-trial)" }}
                            >
                              Denemeden{s.convertedByName ? ` · dönüştüren: ${s.convertedByName}` : ""}
                            </span>
                          ) : null}
                        </span>
                      ) : key === "branch" ? (
                        <span className="text-[var(--color-text-muted)]">{s.branchName ?? "—"}</span>
                      ) : key === "type" ? (
                        <>
                          {s.studentTypes.length > 0 ? (
                            <span className="flex flex-wrap gap-1">
                              {s.studentTypes.map((t) => (
                                <Badge key={t}>{t}</Badge>
                              ))}
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--color-text-muted)]">Belirtilmemiş</span>
                          )}
                          {s.level ? <p className="mt-1 text-xs text-[var(--color-text-muted)]">Seviye: {s.level}</p> : null}
                        </>
                      ) : key === "instruments" ? (
                        s.instruments.map((i) => <Badge key={i}>{i}</Badge>)
                      ) : key === "teacher" ? (
                        <span className="text-[var(--color-text)]">{s.teacherName}</span>
                      ) : key === "package" ? (
                        <span className="text-[var(--color-text-muted)]">{s.packageName.split("—")[0]?.trim() ?? s.packageName}</span>
                      ) : key === "level" ? (
                        <span className="text-[var(--color-text-muted)]">{s.level ?? "—"}</span>
                      ) : key === "method" ? (
                        <span className="text-[var(--color-text-muted)]">{s.educationMethod ?? "—"}</span>
                      ) : key === "payment" ? (
                        <span className="text-[var(--color-text-muted)]">{PAYMENT_LABELS[s.paymentStatus]}</span>
                      ) : key === "monthlyFee" ? (
                        <span className="text-[var(--color-text-muted)]">{s.monthlyFee.toLocaleString("tr-TR")} ₺</span>
                      ) : key === "contract" ? (
                        (() => {
                          const state = resolveContractFilterKey(s, today);
                          const tone =
                            state === "active"
                              ? { background: "var(--color-success-soft)", color: "var(--color-success)" }
                              : state === "expiring"
                                ? { background: "var(--color-warning-soft)", color: "var(--color-warning)" }
                                : state === "expired"
                                  ? { background: "var(--color-danger-soft)", color: "var(--color-danger)" }
                                  : state === "pending"
                                    ? { background: "var(--color-primary-soft)", color: "var(--color-primary-soft-text)" }
                                  : { background: "var(--color-surface-muted)", color: "var(--color-text-muted)" };
                          return (
                            <span className="block">
                              <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold" style={tone}>
                                {CONTRACT_FILTER_LABELS[state]}
                              </span>
                              {s.contractEndDate ? (
                                <span className="mt-1 block text-[11px] text-[var(--color-text-muted)]">
                                  Bitiş: {s.contractEndDate.split("-").reverse().join(".")}
                                </span>
                              ) : null}
                            </span>
                          );
                        })()
                      ) : null}
                    </td>
                  ))}
                  {canManage ? (
                    <td className="px-4 py-3">
                      <StudentArchiveAction studentId={s.id} studentName={s.name} archived={!s.active} />
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
        <PaginationControls
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </Card>
      {canBulk ? (
        <StudentsBulkBar
          selected={rows
            .filter((r) => selectedIds.has(r.id))
            .map((r) => ({ id: r.id, name: r.name, active: r.active }))}
          options={bulkOptions!}
          deletedView={deletedView}
          onClear={() => setSelectedIds(new Set())}
        />
      ) : null}
    </>
  );
}
