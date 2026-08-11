"use client";

/**
 * Yoklama Takvimi'nin öğrenci filtresi. Paket 6 — kompakt açılabilir liste,
 * takvimin ÜSTÜNDE render edilir (yanında değil). Yalnız server tarafından
 * tenant-scoped olarak geçirilen `students` listesi içinde filtreler —
 * burada hiçbir ek fetch/veri erişimi yoktur, dolayısıyla cross-tenant
 * sızıntı riski yok. Seçim `?studentId=` query param'ına yazılır; asıl
 * doğrulama (bu ID'nin gerçekten scoped listede olup olmadığı) sayfa
 * (server component) tarafında `resolveAttendanceCalendarStudentId` ile
 * tekrar yapılır.
 *
 * İş 1 — çok sayıda öğrenci olduğunda düz `<select>` içinde aranan ismi
 * bulmak zorlaşıyordu. Bir arama kutusu eklendi: Türkçe karakter/büyük-
 * küçük harf/boşluk toleranslı (TEK kaynak `normalizeMatchKey`, CSV
 * import normalizasyonuyla AYNI — ayrı bir eşleştirme mantığı yazılmadı),
 * TAMAMEN istemci tarafında (zaten elde olan `students` prop'u üzerinde
 * filtreler — hiçbir yeni API isteği yok). Arama metni BİLİNÇLİ olarak
 * URL'e YAZILMAZ (yalnızca yerel state) — her tuş vuruşunda `router.push`
 * yapmak, bu sayfadaki server component'i (readScopedData dahil) yeniden
 * çalıştırıp gereksiz sunucu isteği üretirdi; yalnızca NİHAİ `studentId`
 * seçimi (mevcut davranışla birebir aynı) `?studentId=` param'ına yazılır
 * — mevcut `attTerm`/`attYear` parametrelerine dokunulmaz.
 */

import { useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { foldTurkishForSearch } from "@/lib/normalize";

export type AttendanceStudentOption = { id: string; name: string; branchName?: string };

export function StudentAttendancePicker({
  students,
  selectedStudentId,
}: {
  students: AttendanceStudentOption[];
  selectedStudentId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = foldTurkishForSearch(query);
    if (!q) return students;
    return students.filter((s) => foldTurkishForSearch(s.name).includes(q));
  }, [students, query]);

  function select(studentId: string) {
    if (!studentId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("studentId", studentId);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="max-w-xs space-y-1.5">
      <div className="relative">
        <label htmlFor="attendance-student-search" className="sr-only">
          Öğrenci ara
        </label>
        <input
          id="attendance-student-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Öğrenci ara… (ör. Çağla, Şule)"
          aria-describedby="attendance-student-search-count"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 pr-8 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Aramayı temizle"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <p id="attendance-student-search-count" className="text-xs text-[var(--color-text-muted)]" aria-live="polite">
        {query ? `${filtered.length} öğrenci bulundu` : `${students.length} öğrenci`}
      </p>

      {query && filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
          Bu aramayla eşleşen öğrenci bulunamadı.
        </p>
      ) : (
        <label className="block">
          <span className="sr-only">Öğrenci seç</span>
          <select
            value={selectedStudentId ?? ""}
            onChange={(e) => select(e.target.value)}
            aria-label="Öğrenci seç"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
          >
            <option value="" disabled>
              Öğrenci seçin…
            </option>
            {filtered.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.branchName ? ` — ${s.branchName}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
