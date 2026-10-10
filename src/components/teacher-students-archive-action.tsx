"use client";

/**
 * 2026-09-17 — öğretmen detayı "Öğrencilerini pasife al". Onay zorunlu;
 * kısmi sonuçta hangi öğrencilerin pasife alınamadığı açıkça yazılır.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionArchiveTeacherStudents } from "@/lib/actions";
import { Button } from "@/components/ui";

export function TeacherStudentsArchiveAction({
  teacherId,
  teacherName,
  activeStudentCount,
}: {
  teacherId: string;
  teacherName: string;
  activeStudentCount: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function onConfirm() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await actionArchiveTeacherStudents({ teacherId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setConfirming(false);
      if (result.failedNames.length > 0) {
        setError(
          `${result.archivedCount} öğrenci pasife alındı; şu öğrenciler pasife alınamadı: ${result.failedNames.join(", ")}. Bu öğrencileri kendi detay sayfasından tekrar deneyin.`
        );
      } else {
        setNotice(`${result.archivedCount} öğrenci pasife alındı.`);
      }
      router.refresh();
    });
  }

  return (
    <div className="text-right">
      {confirming ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-xs font-medium text-[var(--color-text)]">
            {teacherName} öğretmenine atanmış {activeStudentCount} aktif öğrenci pasife alınsın mı?
          </span>
          <Button variant="danger" className="!px-2.5 !py-1 !text-xs" disabled={pending} onClick={onConfirm}>
            {pending ? "…" : "Evet, pasife al"}
          </Button>
          <Button variant="ghost" className="!px-2.5 !py-1 !text-xs" disabled={pending} onClick={() => setConfirming(false)}>
            Vazgeç
          </Button>
        </div>
      ) : activeStudentCount > 0 ? (
        <Button variant="danger" className="!text-xs" onClick={() => setConfirming(true)}>
          Öğrencilerini pasife al
        </Button>
      ) : null}
      {error ? (
        <p className="mt-1 text-[11px] font-medium text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="mt-1 text-[11px] font-medium text-emerald-600">{notice}</p> : null}
    </div>
  );
}
