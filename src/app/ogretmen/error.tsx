"use client";

import { useEffect } from "react";
import Link from "@/components/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * Faz 2 güvenlik/kalite taraması — `/ogretmen` (öğretmen portalı, ~13 alt
 * sayfa) yalnızca `/ogretmen/program` altında kendi error.tsx'ine sahipti;
 * geri kalan tüm sayfalarda (ödevler, materyaller, hakediş, iş takip, vb.)
 * beklenmeyen bir sunucu hatası Next.js'in varsayılan (markasız, dev'de
 * yığın izi gösteren) hata sayfasına düşüyordu. Bu dosya `/ogretmen`
 * KÖKÜNE eklenerek TÜM alt sayfaları tek bir paylaşılan sınırla kapsar —
 * `program/error.tsx` ile aynı renk şeması (bkz. o dosya), sayfa başına
 * değil paylaşılan seviyede düzeltme.
 */
export default function TeacherPortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Öğretmen portalı hatası:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-cyan-50 to-slate-50 px-4">
      <div className="max-w-sm text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" />
        <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-50">
          Bu sayfa yüklenirken bir sorun oluştu.
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Lütfen tekrar deneyin. Sorun devam ederse kurumunuzla iletişime geçin.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button type="button" onClick={reset}>
            Tekrar dene
          </Button>
          <Link
            href="/ogretmen"
            className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Portala dön
          </Link>
        </div>
      </div>
    </div>
  );
}
