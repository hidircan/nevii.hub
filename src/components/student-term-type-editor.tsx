"use client";

/**
 * ÖNCELİK 4 (devam) — öğrenci detayında dönem (Güz/Yaz) seçici. Yalnızca
 * SCHOOL_ADMIN/SUPER_ADMIN render edilir (çağıran taraftan kontrol edilir,
 * bkz. öğrenci detay sayfası); backend'de de yalnız bu roller yazabilir
 * (updateStudentProfileTool RBAC'ı) — bu bileşen ikinci bir savunma
 * katmanıdır, tek kaynak değildir. Kaydedilince sayfa yenilenir; Yoklama
 * Takvimi ve Program ekranlarındaki dönem çözümlemesi aynı Student.termType
 * alanını okuduğu için anında doğru yansır.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionUpdateStudentProfile } from "@/lib/actions";

export function StudentTermTypeEditor({
  studentId,
  initialTermType,
}: {
  studentId: string;
  initialTermType?: "guz" | "yaz";
}) {
  const router = useRouter();
  const [value, setValue] = useState<"guz" | "yaz">(initialTermType ?? "guz");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onChange(next: "guz" | "yaz") {
    setValue(next);
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const result = await actionUpdateStudentProfile({ studentId, termType: next });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-center gap-1 rounded-md border border-[var(--color-border)] p-0.5" role="group" aria-label="Öğrenci dönemi">
        <button
          type="button"
          disabled={pending}
          aria-pressed={value === "guz"}
          onClick={() => onChange("guz")}
          className={`rounded px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50 ${
            value === "guz" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]"
          }`}
        >
          Güz Dönemi
        </button>
        <button
          type="button"
          disabled={pending}
          aria-pressed={value === "yaz"}
          onClick={() => onChange("yaz")}
          className={`rounded px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50 ${
            value === "yaz" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]"
          }`}
        >
          Yaz Dönemi
        </button>
      </div>
      {error ? <p className="mt-1 text-[11px] font-medium text-[var(--color-danger)]">{error}</p> : null}
      {saved && !pending ? <p className="mt-1 text-[11px] text-emerald-700">Kaydedildi.</p> : null}
    </div>
  );
}
