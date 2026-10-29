"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { TeacherFeedbackForm, type InitialFeedback } from "@/components/teacher-feedback-form";

export type EligibleTeacher = {
  teacherId: string;
  name: string;
  instruments: string[];
  lastLessonDate?: string;
  initialFeedback: InitialFeedback | null;
};

export function TeacherFeedbackCards({ studentId, teachers }: { studentId: string; teachers: EligibleTeacher[] }) {
  const [openTeacherId, setOpenTeacherId] = useState<string | null>(null);
  const [justUpdated, setJustUpdated] = useState<Record<string, boolean>>({});

  if (teachers.length === 0) {
    return (
      <Card>
        <p className="text-sm font-medium text-[var(--color-text-muted)]">Değerlendirebileceğiniz bir öğretmen bulunmuyor</p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Aktif veya yakın geçmişte ders aldığınız bir öğretmen olduğunda burada görünecek.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {teachers.map((t) => {
        const isOpen = openTeacherId === t.teacherId;
        const hasFeedback = Boolean(t.initialFeedback) || justUpdated[t.teacherId];
        return (
          <Card key={t.teacherId} className="!p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-[var(--color-text)]">{t.name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{t.instruments.join(", ") || "—"}</p>
                {t.lastLessonDate ? (
                  <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">Son ders: {t.lastLessonDate}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setOpenTeacherId(isOpen ? null : t.teacherId)}
                className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
              >
                {isOpen ? "Kapat" : hasFeedback ? "Değerlendirmeyi Güncelle" : "Değerlendir"}
              </button>
            </div>
            {isOpen ? (
              <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                <TeacherFeedbackForm
                  studentId={studentId}
                  teacherId={t.teacherId}
                  teacherName={t.name}
                  initialFeedback={t.initialFeedback}
                  onSubmitted={() => setJustUpdated((prev) => ({ ...prev, [t.teacherId]: true }))}
                />
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
