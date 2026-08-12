"use client";

/**
 * İş 3D — "Glass 3D Mobile" portal sunumu ayarı. Genel temalardan (Kurumsal/
 * Atölye/Mürekkep/Gece) KASITLI olarak bağımsız, ayrı bir tercih kartı —
 * ikisi birlikte de seçilebilir. Tema profili/yoğunlukla AYNI cookie
 * mekanizması (`actionSetPortalPresentation`), localStorage yok.
 */
import { useState, useTransition } from "react";
import { Smartphone, Monitor } from "lucide-react";
import { actionSetPortalPresentation } from "@/lib/actions";
import { PORTAL_PRESENTATION_LABELS, type PortalPresentation } from "@/lib/theme";
import { Card } from "@/components/ui";

const GLASS_PREVIEW_ACCENT = "#4fb8ab";

export function PortalPresentationForm({ initialPresentation }: { initialPresentation: PortalPresentation }) {
  const [presentation, setPresentation] = useState<PortalPresentation>(initialPresentation);
  const [, startTransition] = useTransition();

  function apply(next: PortalPresentation) {
    setPresentation(next);
    startTransition(() => {
      void actionSetPortalPresentation(next);
    });
  }

  return (
    <Card>
      <p className="mb-1 text-sm font-semibold text-[var(--color-text)]">Öğretmen / Veli / Öğrenci — mobil portal görünümü</p>
      <p className="mb-3 text-xs text-[var(--color-text-muted)]">
        Genel renk temanızdan (Kurumsal/Atölye/Mürekkep/Gece) bağımsız, ayrı bir tercih — ikisini birlikte kullanabilirsiniz.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          aria-pressed={presentation === "standard"}
          onClick={() => apply("standard")}
          className={`rounded-[var(--radius-lg)] border p-3 text-left transition ${
            presentation === "standard"
              ? "border-[var(--color-primary)] ring-2 ring-[var(--color-focus-ring)]/30"
              : "border-[var(--color-border-strong)] hover:border-[var(--color-primary)]"
          }`}
        >
          <span className="mb-2 flex h-16 w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)]" style={{ background: "var(--color-surface)" }}>
            <Monitor className="h-5 w-5" style={{ color: "var(--color-text-muted)" }} aria-hidden />
          </span>
          <span className="block text-sm font-medium text-[var(--color-text)]">{PORTAL_PRESENTATION_LABELS.standard}</span>
          <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
            Seçili renk temanızın normal, düz yüzeyleri — masaüstü ve mobilde aynı.
          </span>
        </button>

        <button
          type="button"
          aria-pressed={presentation === "glass"}
          onClick={() => apply("glass")}
          className={`rounded-[var(--radius-lg)] border p-3 text-left transition ${
            presentation === "glass"
              ? "border-[var(--color-primary)] ring-2 ring-[var(--color-focus-ring)]/30"
              : "border-[var(--color-border-strong)] hover:border-[var(--color-primary)]"
          }`}
        >
          <span
            className="mb-2 flex h-16 w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] border"
            style={{ background: "linear-gradient(160deg, #0c1119, #171e28)", borderColor: "rgba(255,255,255,0.14)" }}
          >
            <Smartphone className="h-5 w-5" style={{ color: GLASS_PREVIEW_ACCENT }} aria-hidden />
          </span>
          <span className="block text-sm font-medium text-[var(--color-text)]">{PORTAL_PRESENTATION_LABELS.glass}</span>
          <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
            Mobil kullanım için katmanlı, sakin ve dokunsal arayüz.
          </span>
        </button>
      </div>

      <div className="mt-3 rounded-[var(--radius-md)] border px-3 py-2 text-xs" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-muted)", color: "var(--color-text-muted)" }}>
        {presentation === "glass" ? (
          <p>
            Öğretmen, veli ve öğrenci portalının <strong>mobil</strong> görünümünde (üst bar, alt navigasyon ve ana özet
            kartı) uygulanır. <strong>Masaüstünde</strong> (1024px ve üzeri) bu seçim etkisizdir — portal her zaman standart,
            okunaklı web düzeninde kalır.
          </p>
        ) : (
          <p>Masaüstünde her zaman standart görünüm kullanılır; bu ayar yalnız mobil genişliklerde fark yaratır.</p>
        )}
      </div>
    </Card>
  );
}
