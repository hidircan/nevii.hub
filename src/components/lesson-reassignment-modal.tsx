"use client";

/**
 * Faz 13 — bir dersin öğretmenini ve/veya şubesini/odasını değiştirir.
 * Kendi içinde kapalı (self-contained) — program-studio.tsx'in zaten karmaşık
 * state'ine dokunmaz, yalnızca gerekli listeleri prop olarak alır.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select, Label } from "@/components/ui";
import { actionChangeLessonTeacherOrBranch } from "@/lib/actions";
import type { Lesson, Room, Teacher } from "@/lib/types";

type Scope = "single" | "fromHereOnward" | "entireSeries";

export function LessonReassignmentModal({
  lesson,
  teachers,
  rooms,
  branchNames,
}: {
  lesson: Lesson;
  teachers: Teacher[];
  rooms: Room[];
  branchNames: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("single");
  const [teacherId, setTeacherId] = useState(lesson.teacherId);
  const [branchId, setBranchId] = useState(lesson.branchId);
  const [roomId, setRoomId] = useState(lesson.roomId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSeriesMember = Boolean(lesson.seriesId);

  const eligibleTeachers = useMemo(
    () => teachers.filter((t) => t.active && t.instruments.includes(lesson.instrument)),
    [teachers, lesson.instrument]
  );
  const branchIds = useMemo(
    () => Object.keys(branchNames).sort((a, b) => (branchNames[a] ?? "").localeCompare(branchNames[b] ?? "", "tr")),
    [branchNames]
  );
  const roomsInBranch = useMemo(
    () => rooms.filter((r) => r.branchId === branchId && (r.active ?? true) && r.instruments.includes(lesson.instrument)),
    [rooms, branchId, lesson.instrument]
  );

  function reset() {
    setScope("single");
    setTeacherId(lesson.teacherId);
    setBranchId(lesson.branchId);
    setRoomId(lesson.roomId);
    setError(null);
  }

  async function submit() {
    const branchChanged = branchId !== lesson.branchId;
    const teacherChanged = teacherId !== lesson.teacherId;
    const roomChanged = roomId !== lesson.roomId;
    if (!teacherChanged && !branchChanged && !roomChanged) {
      setError("Değişiklik yapılmadı — en az öğretmen veya şube/oda seçin.");
      return;
    }
    const summary =
      `Öğretmen: ${lesson.teacherId === teacherId ? "(değişmiyor)" : eligibleTeachers.find((t) => t.id === teacherId)?.name}\n` +
      `Şube: ${branchNames[branchId]}${branchChanged ? " (değişiyor)" : ""}\n` +
      `Kapsam: ${scope === "single" ? "Yalnızca bu ders" : scope === "fromHereOnward" ? "Bu ders ve sonrası" : "Tüm seri"}`;
    if (!window.confirm(`Bu değişikliği uygulamak istiyor musunuz?\n\n${summary}`)) return;

    setSubmitting(true);
    setError(null);
    const result = await actionChangeLessonTeacherOrBranch({
      lessonId: lesson.id,
      scope,
      newTeacherId: teacherChanged ? teacherId : undefined,
      newBranchId: branchChanged ? branchId : undefined,
      newRoomId: branchChanged || roomChanged ? roomId : undefined,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Öğretmen / şube değiştir
      </Button>
    );
  }

  return (
    <div className="w-full basis-full space-y-2 rounded-lg border border-[var(--color-border)] p-3">
      {isSeriesMember ? (
        <div>
          <Label>Kapsam</Label>
          <Select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            <option value="single">Yalnızca bu ders</option>
            <option value="fromHereOnward">Bu ders ve sonrası</option>
            <option value="entireSeries">Tüm seri</option>
          </Select>
        </div>
      ) : null}
      <div>
        <Label>Yeni öğretmen</Label>
        <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          {eligibleTeachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Yeni şube</Label>
        <Select
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value);
            const firstRoom = rooms.find(
              (r) => r.branchId === e.target.value && (r.active ?? true) && r.instruments.includes(lesson.instrument)
            );
            setRoomId(firstRoom?.id ?? "");
          }}
        >
          {branchIds.map((id) => (
            <option key={id} value={id}>
              {branchNames[id]}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Yeni oda</Label>
        <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          {roomsInBranch.length === 0 ? <option value="">Bu şubede uygun oda yok</option> : null}
          {roomsInBranch.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>

      {error ? <p className="text-xs font-medium text-[#8b3a3a]">{error}</p> : null}

      <div className="flex gap-2">
        <Button
          type="button"
          disabled={submitting || (branchId !== lesson.branchId && !roomId)}
          onClick={() => void submit()}
        >
          {submitting ? "Uygulanıyor…" : "Değişikliği uygula"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            reset();
          }}
        >
          Vazgeç
        </Button>
      </div>
    </div>
  );
}
