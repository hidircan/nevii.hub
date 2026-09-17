"use client";

/**
 * 2026-09-17 — yönetici öğretmen müsaitliğini DOĞRUDAN düzenler (öğretmen
 * self-service kapalı). Satır girişi `TeacherAvailabilityField` ile aynı;
 * yetki tek kaynağı `updateTeacherAvailabilityTool`.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionUpdateTeacherAvailability } from "@/lib/actions";
import { Button } from "@/components/ui";
import { TeacherAvailabilityField, type AvailabilityWindowRow } from "@/components/teacher-availability-field";

export function TeacherAvailabilityEditor({
  teacherId,
  initialRows,
  branches,
}: {
  teacherId: string;
  initialRows: AvailabilityWindowRow[];
  branches?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onSave() {
    setError(null);
    setSaved(false);
    const raw = formRef.current ? String(new FormData(formRef.current).get("availabilityJson") || "[]") : "[]";
    const availability = JSON.parse(raw) as AvailabilityWindowRow[];
    startTransition(async () => {
      const result = await actionUpdateTeacherAvailability({ teacherId, availability });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="space-y-3">
      <TeacherAvailabilityField name="availabilityJson" initialRows={initialRows} branches={branches} />
      <div className="flex items-center gap-3">
        <Button type="button" disabled={pending} onClick={onSave}>
          {pending ? "Kaydediliyor…" : "Müsaitliği kaydet"}
        </Button>
        {saved ? <span className="text-xs font-medium text-emerald-600">Kaydedildi.</span> : null}
      </div>
      {error ? (
        <p className="text-xs font-medium text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
