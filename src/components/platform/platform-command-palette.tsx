"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { callApi } from "@/components/platform/api";

type Result = { group: string; label: string; detail?: string; href: string };

/**
 * NeviiOS global arama (⌘K / Ctrl+K). Sonuçlar sunucuda HYPER_ADMIN
 * yetkisiyle üretilir; bu bileşen yalnız sunumdur.
 */
export function PlatformCommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [state, setState] = useState<{ status: "idle" | "loading" | "error" | "done"; results: Result[]; error?: string }>({ status: "idle", results: [] });
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(async () => {
      setState((s) => ({ ...s, status: "loading" }));
      const res = await callApi<{ results: Result[] }>(`/api/v1/platform/search?q=${encodeURIComponent(term)}`, "GET");
      if (!res.ok) setState({ status: "error", results: [], error: res.error.message });
      else setState({ status: "done", results: res.data.results });
      setActive(0);
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  const tooShort = q.trim().length < 2;

  function close() {
    setOpen(false);
    setQ("");
    triggerRef.current?.focus();
  }

  function go(r: Result) {
    close();
    router.push(r.href);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        aria-label="Ara (Ctrl+K)"
      >
        <Search className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Ara…</span>
        <kbd className="hidden rounded border px-1 text-[10px] sm:inline" style={{ borderColor: "var(--color-border)" }}>⌘K</kbd>
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="NeviiOS global arama"
            className="w-full max-w-xl overflow-hidden rounded-[var(--radius-lg)] border shadow-[var(--shadow-md)]"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Sayfa, kurum, şube, kullanıcı, paket, modül, ayar…"
              aria-label="Arama"
              role="combobox"
              aria-expanded={state.results.length > 0}
              aria-controls="neviios-search-results"
              aria-activedescendant={state.results[active] ? `neviios-sr-${active}` : undefined}
              className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none"
              style={{ borderColor: "var(--color-border)" }}
              onKeyDown={(e) => {
                if (e.key === "Escape") close();
                else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, state.results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter" && !tooShort && state.results[active]) go(state.results[active]!);
              }}
            />
            <div className="max-h-[50vh] overflow-auto p-2 text-sm" aria-live="polite">
              {tooShort || state.status === "idle" ? <p className="px-2 py-3 text-[var(--color-text-muted)]">En az 2 karakter yazın.</p> : null}
              {!tooShort && state.status === "loading" ? <p className="px-2 py-3 text-[var(--color-text-muted)]">Aranıyor…</p> : null}
              {!tooShort && state.status === "error" ? <p role="alert" className="px-2 py-3 text-[var(--color-danger)]">{state.error}</p> : null}
              {!tooShort && state.status === "done" && state.results.length === 0 ? (
                <p className="px-2 py-3 text-[var(--color-text-muted)]">Sonuç bulunamadı.</p>
              ) : null}
              <ul id="neviios-search-results" role="listbox" aria-label="Sonuçlar">
                {(tooShort ? [] : state.results).map((r, i) => (
                  <li
                    key={`${r.group}-${r.href}-${r.label}-${i}`}
                    id={`neviios-sr-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={`cursor-pointer rounded px-2 py-1.5 ${i === active ? "bg-[var(--color-surface-muted)]" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                  >
                    <span className="mr-2 text-[10px] font-semibold text-[var(--color-text-muted)]">{r.group}</span>
                    {r.label}
                    {r.detail ? <span className="ml-2 text-xs text-[var(--color-text-muted)]">{r.detail}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
