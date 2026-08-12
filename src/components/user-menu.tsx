"use client";

/**
 * Sağ üst kullanıcı profil menüsü (İş 2). Avatar tıklanınca açılır; Escape
 * ve dışarı tıklama ile kapanır (klavye erişilebilir, `role="menu"`).
 * Görünüm tercihleri (tema/yoğunluk) buradan hızlıca değiştirilebilir —
 * TEK kaynak yine `src/lib/theme.ts`/`actions.ts` (aynı cookie mekanizması,
 * ikinci bir tercih sistemi icat edilmedi); tüm 7 profil + font seçimi
 * hâlâ `/gorunum-ayarlari` sayfasında (bağlantı burada).
 */
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, Monitor, Settings, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/auth/types";
import { roleLabelTr, initialsFromEmail } from "@/lib/auth/role-labels";
import { actionSetThemeProfile, actionResetThemePreferences, actionSetDensity } from "@/lib/actions";
import { QUICK_THEME_TO_PROFILE, type QuickThemeChoice, type Density } from "@/lib/theme";

export function UserMenu({
  email,
  role,
  kurumName,
  initialDensity,
}: {
  email: string | null;
  role: AppRole;
  kurumName: string | null;
  initialDensity: Density;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [density, setDensity] = useState<Density>(initialDensity);
  const [, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  function applyQuickTheme(choice: QuickThemeChoice) {
    if (choice === "system") {
      document.documentElement.removeAttribute("data-theme-profile");
      startTransition(() => void actionResetThemePreferences());
    } else {
      const profile = QUICK_THEME_TO_PROFILE[choice];
      document.documentElement.setAttribute("data-theme-profile", profile);
      startTransition(() => void actionSetThemeProfile(profile));
    }
  }

  function applyDensity(next: Density) {
    setDensity(next);
    document.documentElement.setAttribute("data-density", next);
    startTransition(() => void actionSetDensity(next));
  }

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
    router.replace("/login");
    router.refresh();
  }

  const initials = initialsFromEmail(email, role.slice(0, 2));

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Kullanıcı menüsü"
        className="flex h-10 min-h-10 w-10 min-w-10 items-center justify-center rounded-full border transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          style={{ background: "var(--color-primary-soft)", color: "var(--color-primary-soft-text)" }}
          aria-hidden
        >
          {initials}
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Kullanıcı menüsü"
          className="absolute right-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-[var(--radius-lg)] border shadow-[var(--shadow-md)]"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          {/* 1) Kullanıcı özeti */}
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
            <p className="truncate text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              {email ?? "Hesap"}
            </p>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {roleLabelTr(role)}
              {kurumName ? ` · ${kurumName}` : ""}
            </p>
          </div>

          {/* 2) Hesap */}
          <div className="border-b py-1.5" style={{ borderColor: "var(--color-border)" }}>
            <Link
              href="/panel/hesabim"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm transition hover:bg-[var(--color-surface-muted)]"
              style={{ color: "var(--color-text)" }}
            >
              <UserRound className="h-4 w-4" style={{ color: "var(--color-text-muted)" }} />
              Profilim / Hesap ayarları
            </Link>
            <Link
              href="/panel/hesabim"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm transition hover:bg-[var(--color-surface-muted)]"
              style={{ color: "var(--color-text)" }}
            >
              <KeyRound className="h-4 w-4" style={{ color: "var(--color-text-muted)" }} />
              Şifre değiştir
            </Link>
          </div>

          {/* 3) Görünüm */}
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
              <Settings className="h-3 w-3" /> Görünüm
            </p>
            <div className="mb-2 grid grid-cols-3 gap-1.5">
              <QuickThemeButton label="Sistem" icon={<Monitor className="h-3.5 w-3.5" />} onClick={() => applyQuickTheme("system")} />
              <QuickThemeButton label="Kurumsal" onClick={() => applyQuickTheme("kurumsal")} />
              <QuickThemeButton label="Atölye" onClick={() => applyQuickTheme("atolye")} />
            </div>
            <div className="mb-2 flex gap-1.5">
              <DensityButton label="Rahat" active={density === "comfortable"} onClick={() => applyDensity("comfortable")} />
              <DensityButton label="Kompakt" active={density === "compact"} onClick={() => applyDensity("compact")} />
            </div>
            <Link
              href="/gorunum-ayarlari"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="text-xs font-medium hover:underline"
              style={{ color: "var(--color-primary)" }}
            >
              Diğer görünüm ayarları (renk, yazı tipi) →
            </Link>
          </div>

          {/* 4) Oturum */}
          <div className="py-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={logout}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition hover:bg-[var(--color-surface-muted)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <LogOut className="h-4 w-4" />
              Çıkış yap
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function QuickThemeButton({ label, icon, onClick }: { label: string; icon?: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-1 rounded-[var(--radius-md)] border px-1.5 py-1.5 text-[11px] font-medium transition hover:border-[var(--color-primary)]"
      style={{ borderColor: "var(--color-border-strong)", color: "var(--color-text)" }}
    >
      {icon}
      {label}
    </button>
  );
}

function DensityButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex-1 rounded-[var(--radius-md)] border px-2 py-1.5 text-[11px] font-medium transition",
        active ? "border-[var(--color-primary)]" : "border-[var(--color-border-strong)] hover:border-[var(--color-primary)]"
      )}
      style={active ? { background: "var(--color-primary-soft)", color: "var(--color-primary-soft-text)" } : { color: "var(--color-text)" }}
    >
      {label}
    </button>
  );
}
