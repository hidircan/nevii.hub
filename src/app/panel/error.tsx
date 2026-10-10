"use client";

import { useEffect } from "react";
import Link from "@/components/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * Faz 2 güvenlik/kalite taraması — `/panel` (yönetim portalı, ~29 sayfa)
 * hiçbir error.tsx'e sahip değildi: bir sayfanın sunucu bileşeninde
 * beklenmeyen bir hata (ör. `readScopedData` fırlatması) Next.js'in
 * VARSAYILAN hata sayfasına düşüyordu — üretimde jenerik/markasız, dev'de
 * tam yığın izini (stack trace) gösteren bir ekran. Aynı desen zaten
 * `/ogrenci` ve `/ogretmen/program`'da vardı (bkz. o dosyalar); burada TÜM
 * panel sayfalarını TEK bir sınırla kapsayacak şekilde uygulanıyor —
 * sayfa başına değil, paylaşılan seviyede (bkz. CLAUDE.md "shared
 * fetch-handling level" ilkesi).
 */
export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Panel hatası:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" />
        <p className="mt-3 text-sm font-semibold text-[var(--color-text)]">
          Bu sayfa yüklenirken bir sorun oluştu.
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Lütfen tekrar deneyin. Sorun devam ederse destek ekibine başvurun.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button type="button" onClick={reset}>
            Tekrar dene
          </Button>
          <Link
            href="/panel"
            className="inline-flex items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
          >
            Panele dön
          </Link>
        </div>
      </div>
    </div>
  );
}
