"use client";

import { useState, useTransition } from "react";
import {
  THEME_PROFILE_VALUES,
  FONT_VALUES,
  THEME_PROFILE_LABELS,
  THEME_PROFILE_DESCRIPTIONS,
  FONT_LABELS,
  DEFAULT_THEME_PROFILE,
  DEFAULT_FONT_CHOICE,
  DENSITY_VALUES,
  DENSITY_LABELS,
  type ThemeProfile,
  type FontChoice,
  type Density,
} from "@/lib/theme";
import { actionSetThemeProfile, actionSetFont, actionResetThemePreferences, actionSetDensity } from "@/lib/actions";
import { Button, Card } from "@/components/ui";

/** İkinci renk — koyu/nötr temalarda arka plan da gösterilir, yalnız vurgu rengi yeterli kontrast vermez. */
const PROFILE_SWATCH: Record<ThemeProfile, { accent: string; bg?: string }> = {
  gold: { accent: "#A56A00" },
  obsidian: { accent: "#d4a017", bg: "#0b0b0d" },
  navy: { accent: "#1e3a5f" },
  forest: { accent: "#1f5c3f" },
  burgundy: { accent: "#6b1f2b" },
  ocean: { accent: "#0e7490" },
  lavender: { accent: "#5b4b8a" },
  atolye: { accent: "#93441c", bg: "#f1ece1" },
  murekkep: { accent: "#14213d", bg: "#eef0f2" },
};

/** Önizleme, globals.css'teki gerçek `[data-font]` eşlemesiyle BİREBİR aynı font ailesini kullanır. */
const FONT_PREVIEW_STYLE: Record<FontChoice, string> = {
  roboto_serif: "var(--font-roboto-serif), Georgia, 'Times New Roman', serif",
  playfair_display: "var(--font-playfair-display), Georgia, 'Times New Roman', serif",
  inter: "var(--font-inter), Inter, 'Helvetica Neue', Arial, sans-serif",
  noto_sans: "var(--font-noto-sans), 'Helvetica Neue', Arial, sans-serif",
  gloock: "var(--font-gloock), Gloock, Georgia, 'Times New Roman', serif",
};

export function ThemePreferencesForm({
  initialProfile,
  initialFont,
  initialDensity,
  allowedProfiles,
  fontLocked = false,
}: {
  initialProfile: ThemeProfile;
  initialFont: FontChoice;
  initialDensity: Density;
  /** NeviiOS görünüm politikası: verilirse yalnız bu profiller seçilebilir (sunucu da reddeder). */
  allowedProfiles?: readonly ThemeProfile[];
  fontLocked?: boolean;
}) {
  const [profile, setProfile] = useState<ThemeProfile>(initialProfile);
  const [font, setFont] = useState<FontChoice>(initialFont);
  const [density, setDensity] = useState<Density>(initialDensity);
  const [, startTransition] = useTransition();

  function applyDensity(next: Density) {
    setDensity(next);
    document.documentElement.setAttribute("data-density", next);
    startTransition(() => {
      void actionSetDensity(next);
    });
  }

  function applyProfile(next: ThemeProfile) {
    setProfile(next);
    document.documentElement.setAttribute("data-theme-profile", next);
    startTransition(() => {
      void actionSetThemeProfile(next);
    });
  }

  function applyFont(next: FontChoice) {
    setFont(next);
    document.documentElement.setAttribute("data-font", next);
    startTransition(() => {
      void actionSetFont(next);
    });
  }

  function resetDefaults() {
    applyProfile(DEFAULT_THEME_PROFILE);
    applyFont(DEFAULT_FONT_CHOICE);
    startTransition(() => {
      void actionResetThemePreferences();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <p className="mb-3 text-sm font-semibold text-[var(--color-text)]">Tema profili</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {THEME_PROFILE_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={profile === value}
              disabled={allowedProfiles ? !allowedProfiles.includes(value) : false}
              onClick={() => applyProfile(value)}
              className={`rounded-[var(--radius-lg)] border p-3 text-left transition ${
                profile === value
                  ? "border-[var(--color-primary)] ring-2 ring-[var(--color-focus-ring)]/30"
                  : "border-[var(--color-border-strong)] hover:border-[var(--color-primary)]"
              }`}
            >
              <span
                className="mb-2 flex h-8 w-full items-center gap-1.5 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] px-1.5"
                style={{ background: PROFILE_SWATCH[value].bg ?? "#ffffff" }}
                aria-hidden
              >
                <span
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{ background: PROFILE_SWATCH[value].accent }}
                />
              </span>
              <span className="block text-sm font-medium text-[var(--color-text)]">{THEME_PROFILE_LABELS[value]}</span>
              <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">{THEME_PROFILE_DESCRIPTIONS[value]}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <p className="mb-3 text-sm font-semibold text-[var(--color-text)]">Yoğunluk</p>
        <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
          {DENSITY_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={density === value}
              onClick={() => applyDensity(value)}
              className={`rounded-[var(--radius-lg)] border p-3 text-left transition ${
                density === value
                  ? "border-[var(--color-primary)] ring-2 ring-[var(--color-focus-ring)]/30"
                  : "border-[var(--color-border-strong)] hover:border-[var(--color-primary)]"
              }`}
            >
              <span className="block text-sm font-medium text-[var(--color-text)]">{DENSITY_LABELS[value]}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <p className="mb-3 text-sm font-semibold text-[var(--color-text)]">Yazı tipi</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FONT_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={font === value}
              disabled={fontLocked}
              onClick={() => applyFont(value)}
              className={`rounded-[var(--radius-lg)] border p-3 text-left transition ${
                font === value
                  ? "border-[var(--color-primary)] ring-2 ring-[var(--color-focus-ring)]/30"
                  : "border-[var(--color-border-strong)] hover:border-[var(--color-primary)]"
              }`}
            >
              <span className="block text-lg" style={{ fontFamily: FONT_PREVIEW_STYLE[value] }}>
                Aa Bb Cc
              </span>
              <span className="mt-1 block text-sm font-medium text-[var(--color-text)]">{FONT_LABELS[value]}</span>
              {value === "playfair_display" ? (
                <span className="mt-0.5 block text-[11px] text-[var(--color-text-muted)]">
                  Yalnızca başlıklarda kullanılır
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </Card>

      <Button variant="secondary" onClick={resetDefaults}>
        Varsayılana Dön
      </Button>

      <p className="text-xs text-[var(--color-text-muted)]">
        Bu tercih yalnızca sizin oturumunuza aittir (tarayıcı cookie&apos;si) — kurum genelini veya diğer
        kullanıcıları etkilemez. Yetki, veri, rota ve filtre durumlarını değiştirmez.
      </p>
    </div>
  );
}
