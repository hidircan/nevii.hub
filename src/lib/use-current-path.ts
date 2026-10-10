"use client";

import { usePathname, useSearchParams } from "next/navigation";

/** Şu anki panel yolu + sorgu (filtreler dahil) — alt ekrana `returnTo` olarak taşınır. */
export function useCurrentPath(): string {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  return query ? `${pathname}?${query}` : pathname;
}
