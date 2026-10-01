"use client";

import { useEffect } from "react";
import Link from "@/components/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";

export default function TeacherProgramError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Öğretmen program görünümü hatası:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-cyan-50 to-slate-50 px-4">
      <div className="max-w-sm text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" />
        <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-50">Program yüklenirken bir sorun oluştu.</p>
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
