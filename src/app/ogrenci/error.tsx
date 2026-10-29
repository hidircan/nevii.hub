"use client";

import { useEffect } from "react";
import Link from "@/components/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";

export default function OgrenciPortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Öğrenci portalı hatası:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-emerald-50 to-slate-50 px-4">
      <div className="max-w-sm text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" />
        <p className="mt-3 text-sm font-semibold text-[var(--color-text)]">Programınız yüklenirken bir sorun oluştu.</p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Lütfen tekrar deneyin. Sorun devam ederse kurumunuzla iletişime geçin.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button type="button" onClick={reset}>
            Tekrar dene
          </Button>
          <Link
            href="/ogrenci"
            className="inline-flex items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
          >
            Portala dön
          </Link>
        </div>
      </div>
    </div>
  );
}
