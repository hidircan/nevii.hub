"use client";

/**
 * 2026-10-04 — yeni öğrenci kaydında ilk branşın YANINDA ek branşlar (bir öğrenci, N branş kaydı).
 * 2026-10-09 — her satır kendi öğrenci türü, haftalık ders sayısı ve aylık ücretiyle gelir (branşlar eşittir; ana/yedek
 * yok). Değer gizli `extraEnrollments` alanında JSON olarak gönderilir; doğrulama sunucuda (upsertStudentEnrollmentTool).
 * Paket/indirim, ödeme günü ve ders gün/saati kayıttan sonra öğrenci kartındaki "Branş kayıtları"ndan düzenlenir.
 */
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input, Label, Select } from "@/components/ui";
import type { TeacherOption } from "@/components/student-instrument-teacher-fields";
import { STUDENT_TYPES } from "@/lib/types";

type Row = { instrument: string; teacherId: string; lessonDurationMinutes: number; weeklyLessonCount: number; studentType: string; monthlyFee: string };

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
      <input
        type="hidden"
        name="extraEnrollments"
        value={
          rows.length
            ? JSON.stringify(
                rows
                  .filter((r) => r.teacherId)
                  .map((r) => ({
                    instrument: r.instrument,
                    teacherId: r.teacherId,
                    lessonDurationMinutes: r.lessonDurationMinutes,
                    weeklyLessonCount: r.weeklyLessonCount,
                    studentTypes: r.studentType ? [r.studentType] : [],
                    monthlyFee: r.monthlyFee ? Number(r.monthlyFee) : 0,
                  }))
              )
            : ""
        }
      />
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-[var(--color-border)] p-2 sm:grid-cols-[1fr_1fr_6rem_7rem_1fr_7rem_auto]">
          <div>
            <Label>Ek branş {i + 1} — enstrüman</Label>
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
          <div>
            <Label>Haftalık</Label>
            <Select value={String(r.weeklyLessonCount)} onChange={(e) => update(i, { weeklyLessonCount: Number(e.target.value) })}>
              {[1, 2, 3].map((m) => (
                <option key={m} value={m}>
                  Haftada {m}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Öğrenci türü</Label>
            <Select value={r.studentType} onChange={(e) => update(i, { studentType: e.target.value })}>
              <option value="">Seçilmedi</option>
              {STUDENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Aylık ücret (₺)</Label>
            <Input inputMode="numeric" value={r.monthlyFee} onChange={(e) => update(i, { monthlyFee: e.target.value.replace(/[^\d]/g, "") })} />
          </div>
          <button
            type="button"
            aria-label={`Ek branş ${i + 1}'i kaldır`}
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
          setRows((prev) => [
            ...prev,
            { instrument, teacherId: teachersFor(instrument)[0]?.id ?? "", lessonDurationMinutes: 40, weeklyLessonCount: 1, studentType: "", monthlyFee: "" },
          ]);
        }}
        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Başka bir branş ekle (farklı enstrüman/öğretmen)
      </button>
    </div>
  );
}
