/**
 * Ders planlama öğretmen seçici — tek kural (2026-09-26).
 *
 * Kök neden (test DB, Gülce Özalp / Mine Öztopçu): öğrenci Evka 3'te, atanmış
 * öğretmen yalnız Erzene'ye atanmış. Seçici öğretmeni YALNIZ birincil şubesiyle
 * süzüyordu → atanmış öğretmen listeden sessizce düşüyor, kullanıcı yalnız
 * şubedeki diğer öğretmenleri (Ebru, Şevval) görüyordu. Sunucu tarafı
 * (`validateLessonSlot` → `teacherServesBranch`) ek şubeleri (`branchIds`)
 * de sayar; seçici aynı kuralı kullanmıyordu.
 *
 * Yeni kural: aday = aktif + enstrümanı veren + şubede ders veren (birincil
 * veya ek şube). Öğrencinin atanmış öğretmeni uygun değilse GİZLENMEZ: listede
 * seçilemez (disabled) olarak ve nedeniyle görünür; sessizce başka öğretmene
 * geçilmez.
 */

import { isTeacherSchedulable, teacherServesBranch } from "./teacher-branches";
import type { Instrument, Student, Teacher } from "./types";

export type LessonTeacherOption = {
  id: string;
  name: string;
  isAssigned: boolean;
  eligible: boolean;
  /** Uygun değilse Türkçe neden. */
  reason?: string;
};

export function teacherIneligibilityReason(
  teacher: Teacher,
  ctx: { instrument: Instrument; branchId?: string; branchName?: string }
): string | undefined {
  if (!isTeacherSchedulable(teacher)) return `${teacher.name} pasif veya işten ayrılmış.`;
  if (!teacher.instruments.includes(ctx.instrument)) {
    return `${teacher.name} ${ctx.instrument} dersi vermiyor (Öğretmenler ekranından branşlarını kontrol edin).`;
  }
  if (ctx.branchId && !teacherServesBranch(teacher, ctx.branchId)) {
    return `${teacher.name} ${ctx.branchName ?? "bu"} şubesinde ders vermiyor. Öğretmenler ekranından öğretmene bu şubeyi ekleyin veya başka öğretmen seçin.`;
  }
  return undefined;
}

export function lessonTeacherOptions(
  teachers: Teacher[],
  ctx: { instrument: Instrument; branchId?: string; branchName?: string; student?: Pick<Student, "teacherId" | "branchId"> }
): LessonTeacherOption[] {
  const assignedId = ctx.student?.teacherId;
  const out: LessonTeacherOption[] = [];
  for (const t of teachers) {
    const reason = teacherIneligibilityReason(t, ctx);
    const isAssigned = t.id === assignedId;
    if (reason && !isAssigned) continue;
    out.push({ id: t.id, name: t.name, isAssigned, eligible: !reason, reason });
  }
  return out.sort((a, b) => {
    if (a.isAssigned !== b.isAssigned) return a.isAssigned ? -1 : 1;
    return a.name.localeCompare(b.name, "tr");
  });
}

/** Öğrenci seçilince önerilen öğretmen: atanmış öğretmen uygunsa o, değilse boş (sessiz geçiş yok). */
export function defaultLessonTeacherId(options: LessonTeacherOption[]): string {
  return options.find((o) => o.isAssigned && o.eligible)?.id ?? "";
}
