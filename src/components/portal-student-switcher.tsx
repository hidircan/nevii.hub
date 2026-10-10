"use client";

/**
 * 10. tur iş #1 — veli portalında kardeşler arası öğrenci seçici. YALNIZCA
 * aktif öğrenciler seçilebilir; pasif kardeşler "(pasif)" etiketiyle
 * devre dışı listelenir (veri açılmaz, bilgi amaçlı). Seçim sunucu
 * tarafında doğrulanır (`actionSelectPortalStudent`); başarılıysa sayfa
 * tazelenir ve TÜM portal sayfaları aynı bağlamı kullanır (HttpOnly cookie).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { actionSelectPortalStudent } from "@/lib/actions";
import type { PortalSibling } from "@/lib/portal-context";

export function PortalStudentSwitcher({
  siblings,
  currentStudentId,
}: {
  siblings: PortalSibling[];
  currentStudentId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (siblings.length <= 1) return null;

  async function onChange(nextId: string) {
    if (nextId === currentStudentId || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await actionSelectPortalStudent({ studentId: nextId });
      if (!result.ok) {
        setError(result.message);
        setPending(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Öğrenci değiştirilirken beklenmeyen bir hata oluştu.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="portal-student-switcher" className="text-xs font-medium text-[var(--color-text-muted)]">
        Öğrenci:
      </label>
      <select
        id="portal-student-switcher"
        value={currentStudentId}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Portalı görüntülenen öğrenciyi değiştir"
        className="max-w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm font-medium text-[var(--color-text)] disabled:opacity-60"
      >
        {siblings.map((s) => (
          <option key={s.studentId} value={s.studentId} disabled={!s.active}>
            {s.name}
            {s.active ? "" : " (pasif)"}
          </option>
        ))}
      </select>
      {pending ? (
        <span role="status" aria-live="polite" className="text-xs text-[var(--color-text-muted)]">
          Değiştiriliyor…
        </span>
      ) : null}
      {error ? (
        <p role="alert" className="w-full text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
