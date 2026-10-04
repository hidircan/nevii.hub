"use client";

/**
 * 2026-10-04 — öğrencinin eğitimleri (tek öğrenci, N eğitim). Ekle, öğretmen/süre değiştir, kapat/yeniden aç.
 * Öğretmen değişikliği geçmiş dersleri DEĞİŞTİRMEZ (yalnız bundan sonra planlanan dersler yeni öğretmenle gelir).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Label, Select } from "@/components/ui";
import { actionUpsertStudentEnrollment } from "@/lib/actions";

type Enrollment = {
  id: string;
  instrument: string;
  teacherId?: string;
  lessonDurationMinutes?: number;
  active: boolean;
  primary?: boolean;
  legacy?: boolean;
};
type TeacherOpt = { id: string; name: string; instruments: string[]; active: boolean };
type Draft = { id?: string; instrument: string; teacherId: string; lessonDurationMinutes: number; primary?: boolean };

export function StudentEnrollmentsCard({
  studentId,
  enrollments,
  teachers,
  instrumentOptions,
  canManage,
}: {
  studentId: string;
  enrollments: Enrollment[];
  teachers: TeacherOpt[];
  instrumentOptions: string[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const teacherName = (id?: string) => teachers.find((t) => t.id === id)?.name ?? "Öğretmen atanmamış";
  const teachersFor = (instrument: string) => teachers.filter((t) => t.active && t.instruments.includes(instrument));

  async function save(input: Draft & { active?: boolean }) {
    setBusy(true);
    setError(null);
    const res = await actionUpsertStudentEnrollment({ studentId, enrollment: input });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setDraft(null);
    router.refresh();
  }

  return (
    <Card className="!p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Eğitimler</h2>
        {canManage && !draft ? (
          <button
            type="button"
            onClick={() => {
              const instrument = instrumentOptions[0] ?? "";
              setDraft({ instrument, teacherId: teachersFor(instrument)[0]?.id ?? "", lessonDurationMinutes: 40 });
            }}
            className="text-xs font-medium text-[var(--color-primary)] hover:underline"
          >
            + Eğitim ekle
          </button>
        ) : null}
      </div>
      <ul className="divide-y divide-[var(--color-border)] text-sm">
        {enrollments.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <span className="font-medium text-[var(--color-text)]">{e.instrument}</span>
              <span className="text-[var(--color-text-muted)]"> · {teacherName(e.teacherId)}</span>
              {e.lessonDurationMinutes ? <span className="text-[var(--color-text-muted)]"> · {e.lessonDurationMinutes} dk</span> : null}
              {e.primary ? <span className="ml-2"><Badge>Birincil</Badge></span> : null}
              {!e.active ? <span className="ml-2"><Badge>Kapandı</Badge></span> : null}
            </span>
            {canManage ? (
              <span className="flex gap-3 text-xs">
                <button
                  type="button"
                  className="font-medium text-[var(--color-primary)] hover:underline"
                  onClick={() =>
                    setDraft({
                      id: e.id,
                      instrument: e.instrument,
                      teacherId: e.teacherId ?? teachersFor(e.instrument)[0]?.id ?? "",
                      lessonDurationMinutes: e.lessonDurationMinutes ?? 40,
                      primary: e.primary,
                    })
                  }
                >
                  Düzenle
                </button>
                {e.teacherId ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="font-medium text-[var(--color-text-muted)] hover:underline"
                    onClick={() =>
                      void save({ id: e.id, instrument: e.instrument, teacherId: e.teacherId!, lessonDurationMinutes: e.lessonDurationMinutes ?? 40, active: !e.active })
                    }
                  >
                    {e.active ? "Eğitimi kapat" : "Yeniden aç"}
                  </button>
                ) : null}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {draft ? (
        <div className="mt-2 grid grid-cols-1 gap-2 rounded-lg border border-[var(--color-border)] p-3 sm:grid-cols-4">
          <div>
            <Label>Enstrüman</Label>
            <Select
              value={draft.instrument}
              disabled={Boolean(draft.id)}
              onChange={(ev) => setDraft({ ...draft, instrument: ev.target.value, teacherId: teachersFor(ev.target.value)[0]?.id ?? "" })}
            >
              {instrumentOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Öğretmen</Label>
            <Select value={draft.teacherId} onChange={(ev) => setDraft({ ...draft, teacherId: ev.target.value })}>
              {teachersFor(draft.instrument).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Ders süresi</Label>
            <Select value={String(draft.lessonDurationMinutes)} onChange={(ev) => setDraft({ ...draft, lessonDurationMinutes: Number(ev.target.value) })}>
              {[30, 40, 50].map((m) => (
                <option key={m} value={m}>
                  {m} dk
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button type="button" disabled={busy || !draft.teacherId} onClick={() => void save(draft)}>
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </Button>
            <button type="button" className="text-xs text-[var(--color-text-muted)] hover:underline" onClick={() => setDraft(null)}>
              Vazgeç
            </button>
          </div>
          {draft.id ? (
            <p className="text-[11px] text-[var(--color-text-muted)] sm:col-span-4">
              Öğretmen değişikliği geçmiş dersleri değiştirmez; yalnız bundan sonra planlanan dersler yeni öğretmenle gelir.
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs font-medium text-rose-600">{error}</p> : null}
    </Card>
  );
}
