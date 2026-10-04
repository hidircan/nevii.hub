"use client";

/**
 * 2026-10-04 — yeni öğrenci kaydında birincil eğitimin YANINDA ek eğitimler (bir öğrenci, N eğitim).
 * Her satır enstrüman + öğretmen + ders süresini BİRLİKTE taşır (iki kopuk liste değil). Değer gizli
 * `extraEnrollments` alanında JSON olarak gönderilir; doğrulama sunucuda (upsertStudentEnrollmentTool).
 */
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Label, Select } from "@/components/ui";
import type { TeacherOption } from "@/components/student-instrument-teacher-fields";

type Row = { instrument: string; teacherId: string; lessonDurationMinutes: number };

export function ExtraEnrollmentsFields({ instrumentOptions, teachers }: { instrumentOptions: string[]; teachers: TeacherOption[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const active = teachers.filter((t) => t.active);
  const teachersFor = (instrument: string) => active.filter((t) => t.instruments.includes(instrument));
  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        const next = { ...r, ...patch };
        if (patch.instrument && !teachersFor(patch.instrument).some((t) => t.id === next.teacherId)) {
          next.teacherId = teachersFor(patch.instrument)[0]?.id ?? "";
        }
        return next;
      })
    );

  return (
    <div className="space-y-2">
      <input type="hidden" name="extraEnrollments" value={rows.length ? JSON.stringify(rows.filter((r) => r.teacherId)) : ""} />
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_6rem_auto] items-end gap-2 rounded-lg border border-[var(--color-border)] p-2">
          <div>
            <Label>Ek eğitim {i + 1} — enstrüman</Label>
            <Select value={r.instrument} onChange={(e) => update(i, { instrument: e.target.value })}>
              {instrumentOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Öğretmen</Label>
            {teachersFor(r.instrument).length === 0 ? (
              <p className="text-xs text-amber-700">&quot;{r.instrument}&quot; veren aktif öğretmen yok.</p>
            ) : (
              <Select value={r.teacherId} onChange={(e) => update(i, { teacherId: e.target.value })}>
                {teachersFor(r.instrument).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <div>
            <Label>Süre</Label>
            <Select value={String(r.lessonDurationMinutes)} onChange={(e) => update(i, { lessonDurationMinutes: Number(e.target.value) })}>
              {[30, 40, 50].map((m) => (
                <option key={m} value={m}>
                  {m} dk
                </option>
              ))}
            </Select>
          </div>
          <button
            type="button"
            aria-label={`Ek eğitim ${i + 1}'i kaldır`}
            onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
            className="mb-1 rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const instrument = instrumentOptions[0] ?? "";
          setRows((prev) => [...prev, { instrument, teacherId: teachersFor(instrument)[0]?.id ?? "", lessonDurationMinutes: 40 }]);
        }}
        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Başka bir eğitim ekle (farklı enstrüman/öğretmen)
      </button>
    </div>
  );
}
