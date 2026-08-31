"use client";

/**
 * Yoklama Takvimi'nin öğrenci filtresi. Paket 6 — kompakt açılabilir liste,
 * takvimin ÜSTÜNDE render edilir (yanında değil). Yalnız server tarafından
 * tenant-scoped olarak geçirilen `students` listesi içinde filtreler —
 * burada hiçbir ek fetch/veri erişimi yoktur, dolayısıyla cross-tenant
 * sızıntı riski yok. Seçim `?studentId=` query param'ına yazılır; asıl
 * doğrulama (bu ID'nin gerçekten scoped listede olup olmadığı) sayfa
 * (server component) tarafında `resolveAttendanceCalendarStudentId` ile
 * tekrar yapılır.
 *
 * İş 1 — çok sayıda öğrenci olduğunda düz `<select>` içinde aranan ismi
 * bulmak zorlaşıyordu. Bir arama kutusu eklendi: Türkçe karakter/büyük-
 * küçük harf/boşluk toleranslı (TEK kaynak `normalizeMatchKey`, CSV
 * import normalizasyonuyla AYNI — ayrı bir eşleştirme mantığı yazılmadı),
 * TAMAMEN istemci tarafında (zaten elde olan `students` prop'u üzerinde
 * filtreler — hiçbir yeni API isteği yok). Arama metni BİLİNÇLİ olarak
 * URL'e YAZILMAZ (yalnızca yerel state) — her tuş vuruşunda `router.push`
 * yapmak, bu sayfadaki server component'i (readScopedData dahil) yeniden
 * çalıştırıp gereksiz sunucu isteği üretirdi; yalnızca NİHAİ `studentId`
 * seçimi (mevcut davranışla birebir aynı) `?studentId=` param'ına yazılır
 * — mevcut `attTerm`/`attYear` parametrelerine dokunulmaz.
 *
 * İş 2 — iki aşamalı arama-kutusu + ayrı `<select>` deneyimi, tek adımlı bir
 * combobox + anlık dropdown'a dönüştürüldü (`role="combobox"` + `listbox`).
 * Yine TEK kaynak `foldTurkishForSearch`; yeni fetch/veri erişimi yok — aynı
 * `students` prop'u üzerinde filtrelenmeye devam eder.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { foldTurkishForSearch } from "@/lib/normalize";
import { cn } from "@/lib/utils";

export type AttendanceStudentOption = { id: string; name: string; branchName?: string };

/**
 * Saf filtre fonksiyonu — arama boşsa TÜM öğrenciler döner (önceden burada
 * ilk 10 sonuçla sınırlayan bir RESULT_LIMIT vardı; kaydırılabilir listbox
 * zaten kullanılabilirlik sınırını sağladığı için kaldırıldı). Birim
 * testlerinde DOM'suz doğrudan çağrılabilir.
 */
export function filterAttendanceStudents(
  students: AttendanceStudentOption[],
  query: string
): AttendanceStudentOption[] {
  const q = foldTurkishForSearch(query);
  if (!q) return students;
  return students.filter((s) => foldTurkishForSearch(s.name).includes(q));
}

export function StudentAttendancePicker({
  students,
  selectedStudentId,
}: {
  students: AttendanceStudentOption[];
  selectedStudentId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) ?? null,
    [students, selectedStudentId]
  );

  const [query, setQuery] = useState(selectedStudent?.name ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Seçili öğrenci sayfa dışından (ör. tarayıcı geri/ileri, ?studentId
  // değişimi) değişirse input metni senkron kalsın.
  useEffect(() => {
    // Seçili öğrenci DIŞARIDAN (tarayıcı geri/ileri, ?studentId) değiştiğinde
    // input metnini senkronlamak KASITLI — kontrollü input'un tek doğruluk
    // kaynağı burasıdır.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(selectedStudent?.name ?? "");
  }, [selectedStudent]);

  const filtered = useMemo(() => filterAttendanceStudents(students, query), [students, query]);

  // İş 3 — önceden ilk 10 sonuçla sınırlıydı (RESULT_LIMIT); kaydırılabilir
  // listbox (aşağıda `max-h-80 overflow-y-auto`) zaten performans/kullanılabilirlik
  // sınırını sağlıyor, artık ayrı bir üst sınır YOK — tüm eşleşenler (veya
  // arama boşsa tüm öğrenciler) kaydırarak erişilebilir.
  const visible = filtered;

  useEffect(() => {
    // Arama metni/açık-kapalı durumu değişince vurgulanan satırı sıfırla — KASITLI.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIndex(0);
  }, [query, isOpen]);

  // Dışarı tıklanınca kapat.
  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  function select(student: AttendanceStudentOption) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("studentId", student.id);
    router.push(`${pathname}?${params.toString()}`);
    setQuery(student.name);
    setIsOpen(false);
  }

  function clear() {
    setQuery("");
    setIsOpen(true);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      setActiveIndex((i) => (visible.length === 0 ? 0 : (i + 1) % visible.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) return;
      setActiveIndex((i) => (visible.length === 0 ? 0 : (i - 1 + visible.length) % visible.length));
    } else if (e.key === "Enter") {
      if (isOpen && visible[activeIndex]) {
        e.preventDefault();
        select(visible[activeIndex]);
      }
    } else if (e.key === "Escape") {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    }
  }

  const activeOptionId = isOpen && visible[activeIndex] ? `attendance-student-option-${visible[activeIndex].id}` : undefined;

  return (
    <div ref={rootRef} className="relative max-w-xs space-y-1.5">
      <label htmlFor="attendance-student-search" className="sr-only">
        Öğrenci ara ve seç
      </label>
      <div className="relative">
        <input
          id="attendance-student-search"
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="attendance-student-listbox"
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Öğrenci ara… (ör. Çağla, Şule)"
          aria-describedby="attendance-student-search-count"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 pr-8 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
        />
        {query ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Aramayı temizle"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}

        {isOpen ? (
          <div
            id="attendance-student-listbox"
            role="listbox"
            aria-label="Öğrenci sonuçları"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border shadow-lg"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
          >
            {visible.length === 0 ? (
              <p className="px-3 py-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
                &quot;Bu aramayla eşleşen öğrenci bulunamadı.&quot;
              </p>
            ) : (
              visible.map((s, idx) => {
                const active = idx === activeIndex;
                const selected = s.id === selectedStudentId;
                return (
                  <button
                    key={s.id}
                    id={`attendance-student-option-${s.id}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => select(s)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition"
                    )}
                    style={
                      active
                        ? { background: "var(--color-primary-soft)", color: "var(--color-primary-soft-text)" }
                        : { color: "var(--color-text)" }
                    }
                  >
                    <span className="min-w-0 truncate">
                      {s.name}
                      {s.branchName ? (
                        <span className="ml-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                          — {s.branchName}
                        </span>
                      ) : null}
                    </span>
                    {selected ? (
                      <span className="shrink-0 text-xs font-medium" style={{ color: "var(--color-primary)" }}>
                        Seçili
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      <p id="attendance-student-search-count" className="text-xs text-[var(--color-text-muted)]" aria-live="polite">
        {query ? `${filtered.length} öğrenci bulundu` : `${students.length} öğrenci`}
      </p>
    </div>
  );
}
