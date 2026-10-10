"use client";

import { useRouter, useSearchParams } from "next/navigation";

/** Native date input that navigates the program page to the picked date's week (URL-driven, no local state). Seçili dönem/yıl parametreleri korunur. */
export function WeekDatePicker({ value }: { value: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  return (
    <input
      type="date"
      defaultValue={value}
      onChange={(event) => {
        if (event.target.value) {
          const params = new URLSearchParams(searchParams.toString());
          params.set("week", event.target.value);
          router.push(`/panel/program?${params.toString()}`);
        }
      }}
      aria-label="Tarihe git"
      title="Tarihe git"
      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
    />
  );
}
