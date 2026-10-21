"use client";

/**
 * 9. tur — İptal/Telafi seçildiğinde açılan BAĞLAMSAL kaynak sorusu (günlük
 * yoklama akışını uzatmaz: yalnız İptal/Telafi'de görünür). "Öğretmen kaynaklı"
 * seçimi öğretmen performansının TEK kaynağıdır (ayrı öğretmen yoklaması yok —
 * bkz. lesson-disruption.ts `isTeacherCausedDisruption`).
 */

import { DISRUPTION_SOURCE_LABEL, DISRUPTION_SOURCES, type DisruptionSource } from "@/lib/lesson-disruption";

export type DisruptionFormValue = {
  source?: DisruptionSource;
};

const SOURCE_HINT: Record<DisruptionSource, string> = {
  teacher: "Öğretmen gelemedi/erteledi. Öğretmen performansına yazılır; öğrencinin kişisel telafi hakkından düşmez.",
  institution: "Kurum kararı (tatil, oda, organizasyon). Öğretmen devamsızlığına yazılmaz, telafi hakkından düşmez.",
  student: "Öğrenci/veli talebi veya devamsızlık. Telafi, öğrencinin kişisel hakkından düşer.",
  other: "Yukarıdakilere uymayan durum — açıklamaya yazın. Telafi hakkı kuralı öğrenci kaynaklı gibi uygulanır.",
};

export function isDisruptionFormComplete(value: DisruptionFormValue): boolean {
  return !!value.source;
}

export function disruptionPayload(value: DisruptionFormValue, note?: string) {
  return {
    disruptionSource: value.source,
    disruptionNote: note?.trim() || undefined,
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
                onChange={() => onChange({ source })}
              />
              <span>
                <span className="font-semibold text-[var(--color-text)]">{DISRUPTION_SOURCE_LABEL[source]}</span>
                <span className="block text-[10px] leading-snug text-[var(--color-text-muted)]">{SOURCE_HINT[source]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
