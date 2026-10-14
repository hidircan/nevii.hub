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
 *
 * 2026-10-15 — etkileşim (combobox/listbox, klavye, kademeli liste) `StudentSearchCombobox`'a taşındı; Öğrenciler
 * ekranı aynı bileşeni kullanır.
 *
 * İş 2 — iki aşamalı arama-kutusu + ayrı `<select>` deneyimi, tek adımlı bir
 * combobox + anlık dropdown'a dönüştürüldü (`role="combobox"` + `listbox`).
 * Yine TEK kaynak `foldTurkishForSearch`; yeni fetch/veri erişimi yok — aynı
 * `students` prop'u üzerinde filtrelenmeye devam eder.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { foldTurkishForSearch } from "@/lib/normalize";
import { StudentSearchCombobox } from "@/components/student-search-combobox";

export type AttendanceStudentOption = { id: string; name: string; branchName?: string };

/**
 * Saf filtre fonksiyonu — arama boşsa TÜM öğrenciler döner (önceden burada
 * ilk 10 sonuçla sınırlayan bir RESULT_LIMIT vardı; kaydırılabilir listbox
 * zaten kullanılabilirlik sınırını sağladığı için kaldırıldı). Birim
 * testlerinde DOM'suz doğrudan çağrılabilir.
 */
export function filterAttendanceStudents(
  students: AttendanceStudentOption[],
  query: string
): AttendanceStudentOption[] {
  const q = foldTurkishForSearch(query);
  if (!q) return students;
  return students.filter((s) => foldTurkishForSearch(s.name).includes(q));
}

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
  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) ?? null,
    [students, selectedStudentId]
  );
  const [query, setQuery] = useState(selectedStudent?.name ?? "");
  /**
   * P0 performans (2026-09-07) — öğrenci seçimi bir SUNUCU gezinmesidir (`?studentId=` → server component yeniden
   * render). `useTransition` tıklama anında bekleme geri bildirimi verir; gerçek süreyi kısaltmaz.
   */
  const [isPending, startTransition] = useTransition();

  // Seçili öğrenci DIŞARIDAN (tarayıcı geri/ileri, ?studentId) değiştiğinde input metnini senkronlamak KASITLI.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(selectedStudent?.name ?? "");
  }, [selectedStudent]);

  const filtered = useMemo(() => filterAttendanceStudents(students, query), [students, query]);

  function select(student: { id: string; name: string }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("studentId", student.id);
    setQuery(student.name);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="max-w-xs space-y-1.5">
      <StudentSearchCombobox
        idPrefix="attendance-student"
        label="Öğrenci ara ve seç"
        placeholder="Öğrenci ara… (ör. Çağla, Şule)"
        query={query}
        onQueryChange={setQuery}
        options={filtered.map((s) => ({ id: s.id, name: s.name, hint: s.branchName }))}
        selectedId={selectedStudentId}
        onSelect={select}
        onClear={() => setQuery("")}
        busy={isPending}
        statusText={isPending ? "Öğrenci açılıyor…" : query ? `${filtered.length} öğrenci bulundu` : `${students.length} öğrenci`}
      />
    </div>
  );
}
