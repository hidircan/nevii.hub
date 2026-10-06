"use client";

/**
 * 2026-10-06 — Telafi Merkezi filtre çubuğu: öğrenci otomatik tamamlama + şube + öğretmen + "Filtreleri temizle".
 *
 * Veri: sunucunun kapsamlı (kurum/yetki) okumasından türetilmiş, YALNIZ aktif kişilerin kimlik/ad/şube listesi
 * prop olarak gelir; arama tamamen istemcide `foldTurkishForSearch` ile süzülür — tuş başına sunucu isteği yok,
 * dolayısıyla eski yanıtın yenisini ezmesi de mümkün değil. Seçim KİMLİKLE URL'e yazılır (`?ogrenci=`,
 * `?sube=`, `?ogretmen=`); asıl süzme ve kimlik doğrulaması sayfada (server) yapılır. Filtre değişince `sayfa`
 * düşer (1. sayfa), `durum` sekmesi korunur. Desen: `student-attendance-picker.tsx` (combobox + listbox).
 */

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { foldTurkishForSearch } from "@/lib/normalize";
import { Select } from "@/components/ui";
import {
  filtersForBranchChange,
  makeupFilterHref,
  optionsForBranch,
  type MakeupFilterOption,
  type MakeupFilters,
} from "@/lib/makeup-filters";

/** Seçili ama seçilebilir listede olmayan (pasif/silinmiş) kişi — yalnız seçili değeri göstermek için. */
export type MakeupSelectedPerson = MakeupFilterOption & { inactive: boolean };

export function MakeupFilterBar({
  branches,
  studentOptions,
  teacherOptions,
  filters,
  selectedStudent,
  selectedTeacher,
  durum,
  legacyQuery,
}: {
  branches: { id: string; name: string }[];
  studentOptions: MakeupFilterOption[];
  teacherOptions: MakeupFilterOption[];
  filters: MakeupFilters;
  selectedStudent: MakeupSelectedPerson | null;
  selectedTeacher: MakeupSelectedPerson | null;
  durum: string;
  /** Eski `?q=` bağlantıları — yalnız "Filtreleri temizle" ile düşer. */
  legacyQuery: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);

  function apply(next: MakeupFilters, keepLegacyQuery = true) {
    startTransition(() => {
      router.push(makeupFilterHref({ ...next, durum, q: keepLegacyQuery ? legacyQuery : "" }));
    });
  }

  const knownStudents = selectedStudent ? [...studentOptions, selectedStudent] : studentOptions;
  const knownTeachers = selectedTeacher ? [...teacherOptions, selectedTeacher] : teacherOptions;
  const branchStudents = optionsForBranch(studentOptions, filters.branchId);
  const branchTeachers = optionsForBranch(teacherOptions, filters.branchId);
  const hasAny = Boolean(filters.studentId || filters.branchId || filters.teacherId || legacyQuery);

  return (
    <div
      role="search"
      aria-label="Telafi talebi filtreleri"
      aria-busy={isPending}
      className="mb-3 grid gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center"
    >
      <StudentCombobox
        options={branchStudents}
        selected={selectedStudent}
        branchName={(ids) => ids.map((id) => branchName.get(id)).filter(Boolean).join(", ")}
        onSelect={(id) => apply({ ...filters, studentId: id })}
      />
      <Select
        aria-label="Şube"
        value={filters.branchId}
        onChange={(e) => apply(filtersForBranchChange(filters, e.target.value, knownStudents, knownTeachers))}
      >
        <option value="">Tüm şubeler</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
      <Select aria-label="Öğretmen" value={filters.teacherId} onChange={(e) => apply({ ...filters, teacherId: e.target.value })}>
        <option value="">Tüm öğretmenler</option>
        {selectedTeacher?.inactive ? (
          <option value={selectedTeacher.id} disabled>
            {selectedTeacher.name} (pasif)
          </option>
        ) : null}
        {branchTeachers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
      <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin text-[var(--color-text-muted)]" aria-label="Filtre uygulanıyor" /> : null}
        {hasAny ? (
          <button
            type="button"
            onClick={() => apply({ studentId: "", branchId: "", teacherId: "" }, false)}
            className="whitespace-nowrap rounded-[var(--radius-md)] px-2 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]"
          >
            Filtreleri temizle
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Saf arama — boş sorguda tüm (aktif, şubeye uygun) öğrenciler. Birim testlerinde DOM'suz çağrılır. */
export function searchMakeupStudents(options: MakeupFilterOption[], query: string): MakeupFilterOption[] {
  const q = foldTurkishForSearch(query);
  if (!q) return options;
  return options.filter((o) => foldTurkishForSearch(o.name).includes(q));
}

function StudentCombobox({
  options,
  selected,
  branchName,
  onSelect,
}: {
  options: MakeupFilterOption[];
  selected: MakeupSelectedPerson | null;
  branchName: (ids: string[]) => string;
  onSelect: (studentId: string) => void;
}) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const selectedText = selected ? `${selected.name}${selected.inactive ? " (pasif)" : ""}` : "";
  const [query, setQuery] = useState(selectedText);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Seçim dışarıdan değişirse (geri/ileri, temizle) kutu metni senkron kalsın — kontrollü input'un tek kaynağı.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(selectedText);
  }, [selectedText]);

  const typing = query !== selectedText;
  const results = useMemo(() => searchMakeupStudents(options, typing ? query : ""), [options, query, typing]);

  useEffect(() => {
    // Sorgu/açık durumu değişince vurgulanan satır başa döner — KASITLI.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIndex(0);
  }, [query, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery(selectedText);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen, selectedText]);

  function choose(option: MakeupFilterOption) {
    setIsOpen(false);
    setQuery(option.name);
    if (option.id !== selected?.id) onSelect(option.id);
  }

  function clear() {
    setQuery("");
    setIsOpen(false);
    if (selected) onSelect("");
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) return setIsOpen(true);
      setActiveIndex((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (isOpen) setActiveIndex((i) => (results.length === 0 ? 0 : (i - 1 + results.length) % results.length));
    } else if (e.key === "Enter") {
      if (isOpen && results[activeIndex]) {
        e.preventDefault();
        choose(results[activeIndex]);
      }
    } else if (e.key === "Escape") {
      if (isOpen || typing) {
        e.preventDefault();
        setIsOpen(false);
        setQuery(selectedText);
      }
    }
  }

  const activeOptionId = isOpen && results[activeIndex] ? `${baseId}-opt-${results[activeIndex].id}` : undefined;

  return (
    <div ref={rootRef} className="relative min-w-0">
      <label htmlFor={`${baseId}-input`} className="sr-only">
        Öğrenci ara ve seç
      </label>
      <input
        ref={inputRef}
        id={`${baseId}-input`}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
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
        placeholder="Öğrenci adı yazın…"
        className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 pr-8 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:ring-2 focus:ring-[var(--color-focus-ring)]/30"
      />
      {query || selected ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Öğrenci seçimini temizle"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
      {isOpen ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Öğrenci sonuçları"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
        >
          {results.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-[var(--color-text-muted)]">Bu adla eşleşen aktif öğrenci yok.</p>
          ) : (
            results.map((o, idx) => (
              <button
                key={o.id}
                id={`${baseId}-opt-${o.id}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={o.id === selected?.id}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => choose(o)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                style={
                  idx === activeIndex
                    ? { background: "var(--color-primary-soft)", color: "var(--color-primary-soft-text)" }
                    : { color: "var(--color-text)" }
                }
              >
                <span className="min-w-0 truncate">{o.name}</span>
                <span className="shrink-0 text-xs text-[var(--color-text-muted)]">{branchName(o.branchIds)}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
