"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check } from "lucide-react";
import { actionSaveDashboardBranch } from "@/lib/actions";

export type BranchOption = { id: string; name: string };

/**
 * C — Günlük Özet şube seçici.
 *
 * Owner kuralı: Nihal varsayılan Evka 3, Ezgi varsayılan Erzene görür; ikisi
 * de istediğinde diğer şubeye geçebilir. Seçim HESABA yazılır (cihaz
 * değişince kaybolmaz) ve YETKİYİ DEĞİŞTİRMEZ — yalnız hangi şubenin
 * süzüldüğünü belirler. "Varsayılanım yap" ayrı bir adımdır ki bir kerelik
 * bakış, kalıcı tercihi sessizce ezmesin.
 */
export function DashboardBranchSwitcher({
  branches,
  activeBranchId,
  defaultBranchId,
}: {
  branches: BranchOption[];
  activeBranchId: string;
  defaultBranchId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savedNote, setSavedNote] = useState<string | null>(null);

  if (branches.length === 0) return null;

  const options: BranchOption[] = [{ id: "all", name: "Tüm şubeler" }, ...branches];
  const isDefault = activeBranchId === defaultBranchId;

  function select(branchId: string) {
    setSavedNote(null);
    const params = new URLSearchParams(window.location.search);
    if (branchId === defaultBranchId) params.delete("sube");
    else params.set("sube", branchId);
    router.replace(`/panel${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
  }

  function makeDefault() {
    startTransition(async () => {
      await actionSaveDashboardBranch(activeBranchId);
      setSavedNote(
        `Varsayılan şubeniz “${options.find((o) => o.id === activeBranchId)?.name ?? activeBranchId}” olarak kaydedildi.`
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        <Building2 className="h-3.5 w-3.5" aria-hidden />
        Şube
      </span>
      <div role="group" aria-label="Şube seçimi" className="flex flex-wrap gap-1">
        {options.map((o) => {
          const active = o.id === activeBranchId;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={active}
              onClick={() => select(o.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-text)]"
                  : "border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]"
              }`}
            >
              {o.name}
              {o.id === defaultBranchId ? <span className="ml-1 opacity-60">★</span> : null}
            </button>
          );
        })}
      </div>
      {!isDefault ? (
        <button
          type="button"
          onClick={makeDefault}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border-strong)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50"
        >
          <Check className="h-3 w-3" aria-hidden />
          {pending ? "Kaydediliyor…" : "Varsayılanım yap"}
        </button>
      ) : null}
      {savedNote ? (
        <span className="text-xs font-medium" style={{ color: "var(--color-success)" }}>
          {savedNote}
        </span>
      ) : null}
    </div>
  );
}
