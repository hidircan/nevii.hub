"use client";

/**
 * Öğrenci arama combobox'ı — Yoklama Takvimi ve Öğrenciler ekranı ORTAK kullanır (2026-10-15).
 * Yalnız sunum + etkileşim: filtreleme çağıranın işidir (`options` zaten süzülmüş gelir), böylece her ekran kendi
 * kapsam/filtre/yetki kuralını uygular; ek fetch yoktur. Odak/tıklamada boş sorguda liste açılır, yazdıkça süzülür.
 * Büyük listede DOM'a 50'şer satır basılır; listenin sonuna kaydırınca sonraki grup eklenir (sayaç gerçek toplamı söyler).
 * Klavye: ↓/↑ gezinme (kapalıyken ↓ açar), Home/End, Enter seç, Escape kapat; dışarı tıklama kapatır.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export type StudentSearchOption = { id: string; name: string; hint?: string };

const CHUNK = 50;

export function StudentSearchCombobox({
  idPrefix,
  label,
  placeholder,
  query,
  onQueryChange,
  options,
  selectedId,
  onSelect,
  onClear,
  busy = false,
  statusText,
  emptyText = "Bu aramayla eşleşen öğrenci bulunamadı.",
  className,
}: {
  idPrefix: string;
  label: string;
  placeholder: string;
  query: string;
  onQueryChange: (q: string) => void;
  options: StudentSearchOption[];
  selectedId: string | null;
  onSelect: (o: StudentSearchOption) => void;
  onClear: () => void;
  busy?: boolean;
  /** Listenin altındaki canlı bölge metni; verilmezse "N öğrenci". */
  statusText?: ReactNode;
  emptyText?: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [limit, setLimit] = useState(CHUNK);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = `${idPrefix}-listbox`;
  const optionId = (id: string) => `${idPrefix}-option-${id}`;
  const visible = options.slice(0, limit);

  // Sorgu/açılış değişince vurgu başa, görünür grup ilk 50'ye döner — KASITLI senkronizasyon.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIndex(0);
    setLimit(CHUNK);
  }, [query, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  // Klavyeyle vurgulanan satır görünür kalsın.
  useEffect(() => {
    if (!isOpen) return;
    const el = options[activeIndex] ? document.getElementById(optionId(options[activeIndex].id)) : null;
    el?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, isOpen]);

  function move(to: number) {
    if (options.length === 0) return;
    const next = (to + options.length) % options.length;
    if (next >= limit) setLimit(Math.ceil((next + 1) / CHUNK) * CHUNK);
    setActiveIndex(next);
  }

  function choose(o: StudentSearchOption) {
    onSelect(o);
    setIsOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) setIsOpen(true);
      else move(activeIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (isOpen) move(activeIndex - 1);
    } else if (e.key === "Home" && isOpen) {
      e.preventDefault();
      move(0);
    } else if (e.key === "End" && isOpen) {
      e.preventDefault();
      move(options.length - 1);
    } else if (e.key === "Enter") {
      if (isOpen && options[activeIndex]) {
        e.preventDefault();
        choose(options[activeIndex]);
      }
    } else if (e.key === "Escape") {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    } else if (e.key === "Tab") {
      setIsOpen(false);
    }
  }

  function onListScroll() {
    const el = listRef.current;
    if (el && limit < options.length && el.scrollTop + el.clientHeight >= el.scrollHeight - 48) setLimit((n) => n + CHUNK);
  }

  const activeOptionId = isOpen && options[activeIndex] ? optionId(options[activeIndex].id) : undefined;
  const statusId = `${idPrefix}-status`;

  return (
    <div ref={rootRef} className={`relative w-full min-w-0 ${className ?? ""}`}>
      <label htmlFor={`${idPrefix}-input`} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={`${idPrefix}-input`}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          aria-describedby={statusId}
          aria-busy={busy}
          autoComplete="off"
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onClick={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 pr-8 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
        />
        {query || selectedId ? (
          <button
            type="button"
            onClick={() => {
              onClear();
              setIsOpen(true);
              inputRef.current?.focus();
            }}
            aria-label="Aramayı ve seçimi temizle"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}

        {isOpen ? (
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={`${label} — sonuçlar`}
            onScroll={onListScroll}
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto overscroll-contain rounded-lg border shadow-lg"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
          >
            {options.length === 0 ? (
              <p className="px-3 py-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
                {emptyText}
              </p>
            ) : (
              <>
                {visible.map((o, idx) => {
                  const active = idx === activeIndex;
                  const selected = o.id === selectedId;
                  return (
                    <div
                      key={o.id}
                      id={optionId(o.id)}
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(o)}
                      className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                      style={
                        active
                          ? { background: "var(--color-primary-soft)", color: "var(--color-primary-soft-text)" }
                          : { color: "var(--color-text)" }
                      }
                    >
                      <span className="min-w-0 truncate">
                        {o.name}
                        {o.hint ? (
                          <span className="ml-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                            — {o.hint}
                          </span>
                        ) : null}
                      </span>
                      {selected ? (
                        <span className="shrink-0 text-xs font-medium" style={{ color: "var(--color-primary)" }}>
                          Seçili
                        </span>
                      ) : null}
                    </div>
                  );
                })}
                {limit < options.length ? (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setLimit((n) => n + CHUNK)}
                    className="w-full px-3 py-2 text-left text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]"
                  >
                    {options.length} öğrenciden {limit} gösteriliyor — kaydırın veya daha fazlasını gösterin
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
      <p id={statusId} className="mt-1 text-xs text-[var(--color-text-muted)]" aria-live="polite">
        {statusText ?? `${options.length} öğrenci`}
      </p>
    </div>
  );
}
