"use client";

import { printText } from "@/lib/print-text";

export function PrintButton({ title, text }: { title: string; text: string }) {
  return (
    <button type="button" onClick={() => printText(title, text) || window.print()} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#5c3d00] hover:bg-amber-50">
      PDF olarak indir / yazdır
    </button>
  );
}
