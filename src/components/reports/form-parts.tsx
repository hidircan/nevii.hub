"use client";

/**
 * Rapor portalı (2026-10-14) — gelişim formlarının ortak, mobil öncelikli parçaları. Kurumsal/minimal: tek sütun,
 * ≥ 44 px dokunma alanı, mobilde 16 px yazı (iOS yakınlaştırması tetiklenmez), mevcut tasarım tokenları.
 */

import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import Link from "@/components/link";
import { cn } from "@/lib/utils";

export const SCORE_SCALE_HINT = "1 = geliştirilmeli · 3 = beklenen düzeyde · 5 = çok iyi";

/** 1–5 puan: yerel radyo düğmeleri (klavye/ekran okuyucu erişimi kendiliğinden), segment görünümünde. */
export function ScoreSegment({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 flex w-full items-baseline justify-between text-sm text-[var(--color-text)]">
        <span>{label}</span>
        <span className="text-xs tabular-nums text-[var(--color-text-muted)]">{value}/5</span>
      </legend>
      <div className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="relative">
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex min-h-11 cursor-pointer select-none items-center justify-center rounded-[var(--radius-md)] border text-base font-medium tabular-nums transition",
                "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]",
                "peer-checked:border-[var(--color-primary)] peer-checked:bg-[var(--color-primary)] peer-checked:text-white",
                "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--color-focus-ring)]"
              )}
            >
              {n}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FieldTextarea({
  id,
  label,
  value,
  onChange,
  required,
  hint,
  rows = 3,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">
        {label}
        {required ? <span className="ml-0.5 text-[var(--color-danger)]">*</span> : null}
      </label>
      {hint ? <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">{hint}</p> : null}
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={maxLength}
        required={required}
        className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-base text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-focus-ring)] sm:text-sm"
      />
    </div>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <header>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{title}</h3>
        {description ? <p className="mt-1 text-xs text-[var(--color-text-muted)]">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** İsteğe bağlı alanlar: varsayılan kapalı, tek dokunuşla açılır. */
export function OptionalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium text-[var(--color-text)]">
        {title}
        <span className="text-xs text-[var(--color-text-muted)] group-open:hidden">isteğe bağlı · aç</span>
        <span className="hidden text-xs text-[var(--color-text-muted)] group-open:inline">kapat</span>
      </summary>
      <div className="space-y-4 border-t border-[var(--color-border)] p-4">{children}</div>
    </details>
  );
}

/** Mobilde ekranın altına yapışan gönder çubuğu (iPhone güvenli alanı dahil). */
export function SubmitBar({ busy, label, error }: { busy: boolean; label: string; error: string | null }) {
  return (
    <div className="sticky bottom-0 z-10 rounded-t-[var(--radius-lg)] border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      {error ? (
        <p role="alert" className="mb-2 text-sm font-medium text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="flex min-h-12 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 text-base font-semibold text-white transition hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
      >
        {busy ? "Gönderiliyor…" : label}
      </button>
    </div>
  );
}

export function SuccessPanel({
  title,
  description,
  primary,
  onAnother,
}: {
  title: string;
  description: string;
  primary?: { href: string; label: string };
  onAnother?: () => void;
}) {
  return (
    <div role="status" className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
      <CheckCircle2 className="mx-auto h-10 w-10 text-[var(--color-success)]" aria-hidden />
      <h3 className="mt-3 text-lg font-semibold text-[var(--color-text)]">{title}</h3>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p>
      <div className="mt-5 grid gap-2">
        {primary ? (
          <Link
            href={primary.href}
            className="flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 text-sm font-semibold text-white"
          >
            {primary.label}
          </Link>
        ) : null}
        {onAnother ? (
          <button
            type="button"
            onClick={onAnother}
            className="flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-4 text-sm font-medium text-[var(--color-text)]"
          >
            Yeni rapor yaz
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Sunucu hata mesajı zaten Türkçe ve nedenli; yalnız oturum düşmesi için kullanıcı dostu metin. */
export function reportErrorMessage(error: { code?: string; message?: string }, fallback: string): string {
  if (error.code === "UNAUTHORIZED") return "Oturumunuz sona erdi. Lütfen yeniden giriş yapıp tekrar gönderin; yazdıklarınız bu cihazda saklı.";
  return error.message || fallback;
}
