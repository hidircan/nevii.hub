"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { actionSetFont, actionSetThemeProfile } from "@/lib/actions";
import { FONT_LABELS, FONT_VALUES, type FontChoice, type ThemeProfile } from "@/lib/theme";
import { applyAppearancePolicy, isProfileAllowed, type AppearancePolicy } from "@/lib/platform/policies";
import { initialsFromEmail } from "@/lib/auth/role-labels";

/**
 * NeviiOS sağ üst kullanıcı menüsü. Klavye: Enter/Space açar, ↑/↓ gezinir,
 * Escape kapatır ve odağı tetikleyiciye döndürür; dışarı tıklama kapatır.
 * Tema/font seçimi appearance policy sınırlarını aşamaz (sunucu da reddeder).
 */
export function PlatformUserMenu({
  email,
  displayName,
  roleLabel,
  profile,
  font,
  policy,
}: {
  email: string | null;
  displayName: string | null;
  roleLabel: string;
  profile: ThemeProfile;
  font: FontChoice;
  policy: AppearancePolicy;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const effective = applyAppearancePolicy(policy, { profile, font });
  const canLight = isProfileAllowed(policy, "gold");
  const canDark = isProfileAllowed(policy, "obsidian");
  const canHomebrew = isProfileAllowed(policy, "homebrew");

  useEffect(() => {
    if (!open) return;
    const items = () => [...(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled]),[role=menuitemradio]:not([disabled])") ?? [])];
    items()[0]?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const list = items();
        const idx = list.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "ArrowDown" ? (idx + 1) % list.length : (idx - 1 + list.length) % list.length;
        list[next]?.focus();
      }
    }
    function onPointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  function setTheme(next: ThemeProfile) {
    document.documentElement.setAttribute("data-theme-profile", next);
    startTransition(() => void actionSetThemeProfile(next).then(() => router.refresh()));
  }

  const [logoutError, setLogoutError] = useState<string | null>(null);
  async function logout() {
    // Sunucu çıkışı onaylamadan /login'e gitmez (cookie geçerli kalırsa sahte çıkış olurdu).
    const res = await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" }).catch(() => null);
    if (!res?.ok) return setLogoutError("Çıkış yapılamadı, tekrar deneyin.");
    router.replace("/login");
    router.refresh();
  }

  const itemCls = "block w-full rounded px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-muted)] focus:bg-[var(--color-surface-muted)] focus:outline-none disabled:opacity-50";
  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Kullanıcı menüsü"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-white" aria-hidden>
          {initialsFromEmail(email, displayName ?? "NH")}
        </span>
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Kullanıcı menüsü"
          className="absolute right-0 z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-[var(--radius-lg)] border p-2 shadow-[var(--shadow-md)]"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <div className="border-b px-3 pb-2" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-sm font-semibold">{displayName || email || "Platform kullanıcısı"}</p>
            {email ? <p className="truncate text-xs text-[var(--color-text-muted)]">{email}</p> : null}
            <p className="mt-1 inline-block rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-[11px]">{roleLabel}</p>
          </div>
          <Link role="menuitem" href="/platform/profil" className={itemCls} onClick={() => setOpen(false)}>Profilim</Link>
          <Link role="menuitem" href="/platform/profil#sifre" className={itemCls} onClick={() => setOpen(false)}>Şifre değiştir</Link>
          <Link role="menuitem" href="/gorunum-ayarlari" className={itemCls} onClick={() => setOpen(false)}>Görünüm tercihlerim</Link>
          <div className="border-t px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">Tema modu</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <button role="menuitemradio" type="button" className={`${itemCls} ${effective.profile === "gold" ? "bg-[var(--color-surface-muted)] font-semibold" : ""}`} disabled={!canLight || effective.profileLocked} aria-checked={effective.profile === "gold"} onClick={() => setTheme("gold")}>
                Açık
              </button>
              <button role="menuitemradio" type="button" className={`${itemCls} ${effective.profile === "homebrew" ? "bg-[var(--color-surface-muted)] font-semibold" : ""}`} disabled={!canHomebrew || effective.profileLocked} aria-checked={effective.profile === "homebrew"} onClick={() => setTheme("homebrew")}>
                Hacker
              </button>
              <button role="menuitemradio" type="button" className={`${itemCls} ${effective.profile === "obsidian" ? "bg-[var(--color-surface-muted)] font-semibold" : ""}`} disabled={!canDark || effective.profileLocked} aria-checked={effective.profile === "obsidian"} onClick={() => setTheme("obsidian")}>
                Koyu
              </button>
            </div>
            {effective.profileLocked || !canDark || !canLight ? <p className="text-[11px] text-[var(--color-text-muted)]">Tema modu kurum politikasıyla sınırlı.</p> : null}
            <label className="mt-2 block text-[11px] font-semibold text-[var(--color-text-muted)]">
              Yazı tipi
              <select
                className="mt-1 w-full rounded border bg-[var(--color-surface)] px-2 py-1 text-sm"
                style={{ borderColor: "var(--color-border)" }}
                value={effective.font}
                disabled={effective.fontLocked}
                onChange={(e) => {
                  document.documentElement.setAttribute("data-font", e.target.value);
                  startTransition(() => void actionSetFont(e.target.value));
                }}
              >
                {FONT_VALUES.map((f) => (
                  <option key={f} value={f}>{FONT_LABELS[f]}</option>
                ))}
              </select>
            </label>
            <label className="mt-2 block text-[11px] font-semibold text-[var(--color-text-muted)]">
              Dil
              <select className="mt-1 w-full rounded border bg-[var(--color-surface)] px-2 py-1 text-sm" style={{ borderColor: "var(--color-border)" }} disabled value="tr" aria-describedby="lang-note">
                <option value="tr">Türkçe</option>
              </select>
              <span id="lang-note" className="font-normal">Diğer diller çeviri altyapısı hazır olunca açılacak.</span>
            </label>
          </div>
          <button role="menuitem" type="button" className={`${itemCls} text-[var(--color-danger)]`} onClick={() => void logout()}>
            Oturumu kapat
          </button>
          {logoutError ? <p role="alert" className="px-3 text-xs text-[var(--color-danger)]">{logoutError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
