"use client";

/**
 * Panel geneli komut menüsü — Cmd+K/Ctrl+K. Sayfalar + hızlı işlemler
 * TAMAMEN yerel bir katalogdan (sidebar ile AYNI kaynak, `panel-nav.ts`)
 * gelir — her tuş vuruşunda ağır bir istek yok. Öğrenci/öğretmen/personel
 * araması, mevcut tenant-scoped `/api/v1/search` endpoint'ine (aynı RBAC/
 * tenant sınırları — `globalSearchTool`) debounce'lı gider; sonuçlar yalnız
 * en son sorgu için render edilir (race guard: `requestSeqRef`).
 *
 * `GlobalAssistant`'ın aksine (bkz. o dosyadaki not) burası gerçek bir
 * modal/command-palette olduğu için scrim'e tıklamak KASITLI olarak kapatır
 * — kullanıcının "bir sonraki tıklaması" burada zaten palette içinde kalır.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  GraduationCap,
  Users,
  UserCog,
  UserPlus,
  ClipboardCheck,
  CalendarPlus,
  Wallet,
  FileSpreadsheet,
  ScrollText,
  ReceiptText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { foldTurkishForSearch } from "@/lib/normalize";
import type { AppRole } from "@/lib/auth/types";
import {
  PANEL_MAIN_NAV,
  PANEL_FINANCE_NAV,
  PANEL_OPS_NAV,
  PANEL_AI_NAV,
  PANEL_SYSTEM_NAV,
  PANEL_SEARCH_ONLY_NAV,
  type PanelNavItem,
} from "@/lib/nav/panel-nav";

const SEARCH_DEBOUNCE_MS = 250;
const ALL_PAGES: PanelNavItem[] = [
  ...PANEL_MAIN_NAV,
  ...PANEL_FINANCE_NAV,
  ...PANEL_OPS_NAV,
  ...PANEL_AI_NAV,
  ...PANEL_SYSTEM_NAV,
  ...PANEL_SEARCH_ONLY_NAV,
];

type QuickAction = {
  href: string;
  label: string;
  icon: PanelNavItem["icon"];
  roles?: Array<"SUPER_ADMIN" | "SCHOOL_ADMIN">;
};

/** Mevcut "yeni" rotalarına/ekranlarına yönlendirir — yeni bir işlem/modal sistemi icat etmez. */
const QUICK_ACTIONS: QuickAction[] = [
  { href: "/panel/ogrenciler/yeni", label: "Yeni öğrenci ekle", icon: UserPlus, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  { href: "/panel/ogretmenler/yeni", label: "Yeni öğretmen ekle", icon: UserPlus, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  { href: "/panel/yoklama", label: "Yoklama aç", icon: ClipboardCheck },
  { href: "/panel/program", label: "Ders planla", icon: CalendarPlus },
  { href: "/panel/odemeler", label: "Tahsilat ekle", icon: ReceiptText },
  { href: "/panel/personel", label: "Personel ekle", icon: UserCog, roles: ["SUPER_ADMIN"] },
  { href: "/panel/personel/bordrolar", label: "Bordro oluştur", icon: Wallet, roles: ["SUPER_ADMIN"] },
  { href: "/panel/personel/izinler", label: "İzin kaydı oluştur", icon: ScrollText, roles: ["SUPER_ADMIN"] },
  { href: "/panel/finans-ozeti", label: "Gider ekle", icon: Wallet, roles: ["SUPER_ADMIN"] },
  { href: "/panel/veri-aktar", label: "CSV içe aktar", icon: FileSpreadsheet },
];

type EntityItem = { kind: "student" | "teacher" | "staff"; id: string; label: string; description?: string };

type FlatOption = { key: string; label: string; description?: string; icon: typeof Search; onSelect: () => void };
type Section = { title: string; options: FlatOption[] };

function isVisible(roles: string[] | undefined, role?: AppRole): boolean {
  if (!roles) return true;
  if (!role) return false;
  return roles.includes(role);
}

function entityRoute(item: EntityItem): string {
  if (item.kind === "student") return `/panel/ogrenciler/${item.id}`;
  if (item.kind === "teacher") return `/panel/ogretmenler/${item.id}`;
  return "/panel/personel";
}

function entityIcon(kind: EntityItem["kind"]) {
  if (kind === "student") return GraduationCap;
  if (kind === "teacher") return Users;
  return UserCog;
}

export function CommandPalette({ role }: { role?: AppRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [entityItems, setEntityItems] = useState<EntityItem[]>([]);
  const [entityLoading, setEntityLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestSeqRef = useRef(0);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setEntityItems([]);
    setActiveIndex(0);
  }, []);

  // Cmd+K / Ctrl+K açar, Escape kapatır — global, sayfa/route'tan bağımsız.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (e.key === "Escape" && open) close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Türkçe/ASCII toleranslı varlık araması — debounce'lı, tenant-scoped
  // `/api/v1/search`; eski isteğin sonucu yeni sorgunun üstüne yazmasın diye
  // her isteğe artan bir sıra numarası verilip yalnız SONUNCUSU uygulanır.
  // 1 karakterlik sorgu her tuş vuruşunda tüm öğrenci/öğretmen/personel
  // listesine karşı geniş bir server-side taramayı tetikler; 2 karakter
  // altını yerel sayfa/aksiyon eşleşmesine bırakıp entity fetch'ini atla.
  // `entityItems`/`entityLoading` state'i yalnız aktif bir arama sırasında
  // anlamlı — pasif durumda ham state'i effect içinde senkron temizlemek
  // yerine (render'da kademeli re-render yaratan bir setState-in-effect
  // deseni) render sırasında türetilmiş "efektif" değerler kullanılır.
  const activeSearch = open && query.trim().length >= 2;
  const effectiveEntityItems = activeSearch ? entityItems : [];
  const effectiveEntityLoading = activeSearch ? entityLoading : false;

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) return;
    const seq = ++requestSeqRef.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
        const json = await res.json();
        if (requestSeqRef.current !== seq) return; // daha yeni bir sorgu zaten başladı
        if (res.ok && json.ok) {
          setEntityItems(json.data.items as EntityItem[]);
        } else {
          setEntityItems([]);
        }
      } catch {
        if (requestSeqRef.current === seq) setEntityItems([]);
      } finally {
        if (requestSeqRef.current === seq) setEntityLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open]);

  function go(href: string) {
    close();
    router.push(href);
  }

  const sections = useMemo<Section[]>(() => {
    const q = foldTurkishForSearch(query.trim());
    const visiblePages = ALL_PAGES.filter((p) => isVisible(p.roles, role));
    const visibleActions = QUICK_ACTIONS.filter((a) => isVisible(a.roles, role));

    const pageMatches = q
      ? visiblePages.filter((p) => foldTurkishForSearch(p.label).includes(q))
      : visiblePages.slice(0, 6);
    const actionMatches = q
      ? visibleActions.filter((a) => foldTurkishForSearch(a.label).includes(q))
      : visibleActions.slice(0, 4);

    const result: Section[] = [];
    result.push({
      title: q ? "Sayfalar" : "Sık kullanılan sayfalar",
      options: pageMatches.slice(0, 8).map((p) => ({
        key: `page:${p.href}`,
        label: p.label,
        icon: p.icon,
        onSelect: () => go(p.href),
      })),
    });
    result.push({
      title: "Hızlı işlemler",
      options: actionMatches.slice(0, 8).map((a) => ({
        key: `action:${a.href}:${a.label}`,
        label: a.label,
        icon: a.icon,
        onSelect: () => go(a.href),
      })),
    });

    if (q) {
      const byKind = (kind: EntityItem["kind"], title: string) => {
        const items = effectiveEntityItems.filter((i) => i.kind === kind);
        if (items.length === 0) return;
        result.push({
          title,
          options: items.map((i) => ({
            key: `${i.kind}:${i.id}`,
            label: i.label,
            description: i.description,
            icon: entityIcon(i.kind),
            onSelect: () => go(entityRoute(i)),
          })),
        });
      };
      byKind("student", "Öğrenciler");
      byKind("teacher", "Öğretmenler");
      byKind("staff", "Personel");
    }

    return result.filter((s) => s.options.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, role, effectiveEntityItems]);

  const flat = useMemo(() => sections.flatMap((s) => s.options), [sections]);
  const totalResults = flat.length;

  // Reset the highlighted result when the result set changes shape (new query
  // or a different section count) — adjusted synchronously during render
  // (React's documented pattern for this) instead of a post-commit effect,
  // which avoided an extra cascading render on every keystroke.
  const resultsKey = `${query}:${sections.length}`;
  const [prevResultsKey, setPrevResultsKey] = useState(resultsKey);
  if (resultsKey !== prevResultsKey) {
    setPrevResultsKey(resultsKey);
    setActiveIndex(0);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (flat.length === 0 ? 0 : (i + 1) % flat.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (flat.length === 0 ? 0 : (i - 1 + flat.length) % flat.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      flat[activeIndex]?.onSelect();
    }
  }

  const isEmpty = query.trim().length > 0 && !effectiveEntityLoading && totalResults === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Uygulamada ara"
        className="flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full border text-left text-sm transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] sm:h-9 sm:w-auto sm:justify-start sm:rounded-lg sm:px-3 sm:py-2"
        style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)", background: "var(--color-surface)" }}
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden flex-1 truncate sm:inline">Uygulamada ara…</span>
        <kbd
          className="hidden shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium sm:inline-block"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
        >
          ⌘K
        </kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
          {/* Scrim — burada KASITLI olarak tıklanınca kapatır (gerçek bir modal, GlobalAssistant'ın aksine). */}
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={close}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Uygulamada ara"
            className="relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border shadow-2xl"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
          >
            <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
              <Search className="h-4 w-4 shrink-0" style={{ color: "var(--color-text-muted)" }} />
              <label htmlFor="command-palette-input" className="sr-only">
                Sayfa, işlem, öğrenci, öğretmen veya personel ara
              </label>
              <input
                id="command-palette-input"
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  const next = e.target.value;
                  setQuery(next);
                  // Yeni sorgu aktif aramayı tetikleyecekse yükleme durumunu
                  // BURADA (olay işleyicisinde) senkron ayarla — effect'in
                  // gövdesinde senkron setState kademeli render'a yol açar
                  // (react-hooks/set-state-in-effect); asıl fetch/debounce
                  // effect'te kalır, yalnızca "yükleniyor" bayrağı sorgunun
                  // kendi kaynağına (bu olay) taşındı.
                  if (open && next.trim().length >= 2) setEntityLoading(true);
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Sayfa, işlem, öğrenci, öğretmen veya personel ara…"
                autoComplete="off"
                role="combobox"
                aria-expanded={flat.length > 0}
                aria-controls="command-palette-listbox"
                aria-activedescendant={flat[activeIndex]?.key}
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: "var(--color-text)" }}
              />
            </div>

            <p className="sr-only" aria-live="polite">
              {query.trim() ? `${totalResults} sonuç bulundu` : ""}
            </p>

            <div id="command-palette-listbox" role="listbox" aria-label="Arama sonuçları" className="flex-1 overflow-y-auto p-2">
              {isEmpty ? (
                <p className="px-3 py-6 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                  Eşleşen sayfa, işlem veya kayıt bulunamadı.
                </p>
              ) : (
                sections.map((section) => (
                  <div key={section.title} className="mb-2 last:mb-0">
                    <p
                      className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {section.title}
                    </p>
                    {section.options.map((opt) => {
                      const idx = flat.indexOf(opt);
                      const active = idx === activeIndex;
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.key}
                          id={opt.key}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={opt.onSelect}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition",
                            active ? "font-medium" : ""
                          )}
                          style={
                            active
                              ? { background: "var(--color-primary-soft)", color: "var(--color-primary-soft-text)" }
                              : { color: "var(--color-text)" }
                          }
                        >
                          <Icon className="h-4 w-4 shrink-0" style={{ color: active ? "var(--color-primary)" : "var(--color-text-muted)" }} />
                          <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                          {opt.description ? (
                            <span className="shrink-0 truncate text-xs" style={{ color: "var(--color-text-muted)" }}>
                              {opt.description}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
              {effectiveEntityLoading ? (
                <p className="px-3 py-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                  Aranıyor…
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
