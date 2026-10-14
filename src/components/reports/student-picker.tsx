"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import Link from "@/components/link";
import { foldTurkishForSearch } from "@/lib/normalize";

/** Öğretmenin kendi öğrencileri — istemcide süzülür (sunucuya istek yok). */
export function StudentPicker({ students }: { students: { id: string; name: string; meta: string }[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const f = foldTurkishForSearch(q.trim());
    return f ? students.filter((s) => foldTurkishForSearch(s.name).includes(f)) : students;
  }, [q, students]);

  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Öğrenci ara</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Öğrenci adı yazın"
          className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 text-base text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-focus-ring)] sm:text-sm"
        />
      </label>
      {filtered.length === 0 ? (
        <p className="px-1 text-sm text-[var(--color-text-muted)]">“{q}” ile eşleşen öğrenciniz yok.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((s) => (
            <li key={s.id}>
              <Link
                href={`/gelisim/${s.id}`}
                className="flex min-h-12 items-center justify-between rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 hover:border-[var(--color-border-strong)]"
              >
                <span className="truncate text-sm font-medium text-[var(--color-text)]">{s.name}</span>
                <span className="ml-3 shrink-0 text-xs text-[var(--color-text-muted)]">{s.meta}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
