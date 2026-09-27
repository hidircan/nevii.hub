"use client";

/**
 * 9. tur — İptal/Telafi seçildiğinde açılan BAĞLAMSAL kaynak sorusu (günlük
 * yoklama akışını uzatmaz: yalnız İptal/Telafi'de görünür). İptal/Telafi
 * kendiliğinden "öğretmen gelmedi" demek değildir; öğretmen katılımı yalnız
 * öğretmen kaynaklı seçildiğinde ve kullanıcı AÇIKÇA işaretlerse yazılır.
 */

import { DISRUPTION_SOURCE_LABEL, DISRUPTION_SOURCES, type DisruptionSource } from "@/lib/lesson-disruption";

export type DisruptionFormValue = {
  source?: DisruptionSource;
  teacherAttendance?: "gelmedi" | "mazeretli" | "none";
};

const SOURCE_HINT: Record<DisruptionSource, string> = {
  teacher: "Öğretmen gelemedi/erteledi. Öğrencinin kişisel telafi hakkından düşmez.",
  institution: "Kurum kararı (tatil, oda, organizasyon). Öğretmen devamsızlığına yazılmaz, telafi hakkından düşmez.",
  student: "Öğrenci/veli talebi veya devamsızlık. Telafi, öğrencinin kişisel hakkından düşer.",
  other: "Yukarıdakilere uymayan durum — açıklamaya yazın. Telafi hakkı kuralı öğrenci kaynaklı gibi uygulanır.",
};

export function isDisruptionFormComplete(value: DisruptionFormValue): boolean {
  if (!value.source) return false;
  return value.source !== "teacher" || value.teacherAttendance !== undefined;
}

export function disruptionPayload(value: DisruptionFormValue, note?: string) {
  return {
    disruptionSource: value.source,
    disruptionNote: note?.trim() || undefined,
    teacherAttendance:
      value.source === "teacher" && value.teacherAttendance && value.teacherAttendance !== "none"
        ? value.teacherAttendance
        : undefined,
  };
}

export function DisruptionSourceFields({
  idPrefix,
  kind,
  value,
  onChange,
}: {
  idPrefix: string;
  kind: "İptal" | "Telafi";
  value: DisruptionFormValue;
  onChange: (next: DisruptionFormValue) => void;
}) {
  return (
    <div className="space-y-2">
      <fieldset>
        <legend className="mb-1 font-medium text-[var(--color-text)]">{kind} kararının kaynağı (zorunlu)</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {DISRUPTION_SOURCES.map((source) => (
            <label
              key={source}
              className="flex cursor-pointer items-start gap-2 rounded-md border border-[var(--color-border)] px-2 py-1.5 has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-[var(--color-primary-soft)]"
            >
              <input
                type="radio"
                name={`${idPrefix}-source`}
                className="mt-0.5"
                checked={value.source === source}
                onChange={() =>
                  onChange({ source, teacherAttendance: source === "teacher" ? value.teacherAttendance : undefined })
                }
              />
              <span>
                <span className="font-semibold text-[var(--color-text)]">{DISRUPTION_SOURCE_LABEL[source]}</span>
                <span className="block text-[10px] leading-snug text-[var(--color-text-muted)]">{SOURCE_HINT[source]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {value.source === "teacher" ? (
        <fieldset>
          <legend className="mb-1 font-medium text-[var(--color-text)]">Öğretmen katılımı (performans raporuna yazılır)</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {(
              [
                ["gelmedi", "Öğretmen derse gelmedi"],
                ["mazeretli", "Mazeretli (önceden bildirdi)"],
                ["none", "Şimdi girme"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`${idPrefix}-teacher-attendance`}
                  checked={value.teacherAttendance === key}
                  onChange={() => onChange({ ...value, teacherAttendance: key })}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
