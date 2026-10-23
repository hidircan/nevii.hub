import Link from "@/components/link";
import { notFound, redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { LessonOpsActions } from "@/components/lesson-ops-actions";
import { GroupLessonActionButton } from "@/components/group-lesson-components";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";
import { getGroupLesson, groupRowTouched, groupSessionViews, readGroupLessonData } from "@/lib/group-lessons";
import { formatDateTime, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * 2026-10-23 — Grup dersi oturumu: TEK oturum, öğrenci başına yoklama (mevcut Geldi/Gelmedi/Mazeretli/İşlendi/Telafi —
 * bireysel dersle aynı kurallar; Telafi öğrencinin normal telafi hakkından işler). Oturum iptali yalnız gelecek ve yoklamasız.
 */
export default async function GrupDersiOturumPage({ params }: { params: Promise<{ groupLessonId: string; sessionKey: string }> }) {
  const { groupLessonId, sessionKey: rawKey } = await params;
  const sessionKey = decodeURIComponent(rawKey);
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/panel/grup-dersleri/${groupLessonId}`);
  }
  const kurum = await getInstitutionContext(session);
  if (kurum.scope.mode !== "single" || kurum.scope.tenantId !== session.tenantId) redirect("/panel/grup-dersleri");
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") redirect("/panel/grup-dersleri");
  const g = await getGroupLesson(session.tenantId, groupLessonId);
  if (!g) notFound();
  const data = await readGroupLessonData(g.id);
  const s = groupSessionViews(g, data.lessons).find((x) => x.key === sessionKey);
  if (!s) notFound();
  const studentName = (id: string) => data.students.find((x) => x.id === id)?.name ?? "Silinmiş öğrenci";
  const rows = [...s.rows].sort((a, b) => studentName(a.studentId).localeCompare(studentName(b.studentId), "tr"));
  const started = Date.parse(s.startAt) <= new Date().getTime();
  const touched = s.rows.some(groupRowTouched);

  return (
    <div className="space-y-5">
      <Link href={`/panel/grup-dersleri/${g.id}`} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">← {g.name}</Link>
      <PageHeader
        title={`${g.name} · ${formatDateTime(s.startAt)}`}
        description={`Grup dersi · ${formatTime(s.startAt)}–${formatTime(s.endAt)} · ${data.rooms.find((r) => r.id === s.roomId)?.name ?? "—"} · ${data.teachers.find((t) => t.id === s.teacherId)?.name ?? "—"} · ${s.rows.length} öğrenci`}
      />
      <Card>
        <h2 className="mb-2 text-sm font-semibold">Öğrenciler ve yoklama</h2>
        {!started ? <p className="mb-2 text-xs text-[var(--color-text-muted)]">Oturum henüz başlamadı; yoklama ders saatinde/sonrasında girilir.</p> : null}
        {rows.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">Bu oturumda katılımcı satırı yok.</p> : null}
        <ul className="divide-y divide-[var(--color-border)]">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link href={`/panel/ogrenciler/${r.studentId}`} className="text-sm font-medium text-[var(--color-text)] hover:text-[var(--color-primary)]">
                {studentName(r.studentId)}
              </Link>
              <LessonOpsActions
                lessonId={r.id}
                studentAttended={r.studentAttended}
                lessonProcessed={r.lessonProcessed}
                opsMakeupFlag={r.opsMakeupFlag}
                studentAbsent={r.studentAbsent}
                studentExcused={r.studentExcused}
                attendanceNote={r.studentAttendanceNote}
                compact
              />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
          Her öğrencinin yoklaması ayrı işlenir; bazıları geldi, bazıları gelmedi olabilir. Öğretmen hakedişi: en az bir öğrenci Geldi/İşlendi ise oturum
          bir ders sayılır (öğrenci sayısıyla çarpılmaz).
        </p>
      </Card>
      {!started && !touched ? (
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Oturumu iptal et</h2>
          <GroupLessonActionButton
            body={{ action: "cancelSession", groupLessonId: g.id, sessionKey: s.key }}
            label="Bu oturumu iptal et"
            danger
            confirmText="Bu oturum tüm öğrenciler için iptal edilsin mi? Gerekirse grup ekranından ek oturum ekleyebilirsiniz."
            doneText={(d) => `Oturum iptal edildi (${(d as { cancelled: number }).cancelled} satır).`}
          />
        </Card>
      ) : null}
    </div>
  );
}
