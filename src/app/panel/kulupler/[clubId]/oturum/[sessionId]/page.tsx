import Link from "@/components/link";
import { notFound, redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { LessonOpsActions } from "@/components/lesson-ops-actions";
import { ClubSessionCancel, ClubSessionPostpone, ClubSessionReschedule, ClubSessionTeacher } from "@/components/club-components";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "@/lib/timezone";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";
import { groupClubSessions, listClubsTool } from "@/lib/clubs";
import { readLessonWindow } from "@/lib/store";
import { formatDateTime, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * 2026-10-06 — Kulüp oturumu: üyeler + öğrenci yoklaması (mevcut Geldi/Gelmedi/Mazeretli/İşlendi/Telafi; kulüpte
 * bireysel telafi talebi açılmaz), öğretmen yoklaması (hakediş oturum başına bir kez), toptan erteleme, iptal.
 */
export default async function KulupOturumPage({ params }: { params: Promise<{ clubId: string; sessionId: string }> }) {
  const { clubId, sessionId } = await params;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/panel/kulupler/${clubId}/oturum/${sessionId}`);
  }
  const kurum = await getInstitutionContext(session);
  if (kurum.scope.mode !== "single" || kurum.scope.tenantId !== session.tenantId) redirect("/panel/kulupler");
  const clubs = await listClubsTool(session);
  if (!clubs.ok) redirect("/panel/kulupler");
  const club = clubs.data.clubs.find((c) => c.id === clubId);
  if (!club) notFound();
  const nowMs = new Date().getTime();
  // DB egress (2026-10-19): yalnız kulüp satırları (tüm dersler değil).
  const data = await readLessonWindow(new Date(nowMs - 400 * 86_400_000).toISOString(), new Date(nowMs + 400 * 86_400_000).toISOString(), { clubOnly: true });
  const s = groupClubSessions(data.lessons, club.id).find((x) => x.sessionId === sessionId);
  if (!s) notFound();
  const studentName = (id: string) => data.students.find((x) => x.id === id)?.name ?? "Silinmiş öğrenci";
  const rooms = data.rooms
    .filter((r) => r.active !== false && !r.deletedAt && (!club.branchId || r.branchId === club.branchId))
    .map((r) => ({ id: r.id, name: r.name }));
  const started = Date.parse(s.startAt) <= nowMs;
  const touched = s.rows.some((r) => r.studentAttended || r.lessonProcessed || r.studentAbsent || r.studentExcused || r.opsMakeupFlag) || !!s.teacherAttendanceStatus;
  const startD = new Date(s.startAt);
  const initialLocal = `${toZonedYmd(startD, DEFAULT_APP_TIMEZONE)}T${startD.toLocaleTimeString("en-GB", { timeZone: DEFAULT_APP_TIMEZONE, hour: "2-digit", minute: "2-digit" })}`;
  const clubTeachers = club.teacherIds
    .map((id) => data.teachers.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t && t.active)
    .map((t) => ({ id: t.id, name: t.name }));
  const rows = [...s.rows].sort((a, b) => studentName(a.studentId).localeCompare(studentName(b.studentId), "tr"));

  return (
    <div className="space-y-5">
      <Link href={`/panel/kulupler/${club.id}`} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">← {club.name}</Link>
      <PageHeader
        title={`${club.name} · ${formatDateTime(s.startAt)}`}
        description={`${formatTime(s.startAt)}–${formatTime(s.endAt)} · ${data.rooms.find((r) => r.id === s.roomId)?.name ?? "—"} · ${data.teachers.find((t) => t.id === s.teacherId)?.name ?? "—"} · ${s.rows.length} üye${s.postponed ? " · ERTELENDİ (Telafi)" : s.cancelled ? " · İPTAL" : ""}`}
      />
      {s.postponed ? (
        <p className="rounded-md bg-[var(--color-warning-soft)] px-3 py-2 text-sm text-[var(--color-warning)]">
          Bu oturum ertelendi; tüm üyelerin satırı Telafi. {s.rows[0]?.notes ? `(${s.rows[0].notes})` : ""}
        </p>
      ) : null}
      <Card>
        <ClubSessionTeacher sessionId={s.sessionId} initial={s.teacherAttendanceStatus} />
        <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Öğretmen hakedişi: “Geldi” olan oturum, süresine göre bir ders olarak sayılır.</p>
      </Card>
      <Card>
        <h2 className="mb-2 text-sm font-semibold">Üyeler ve yoklama</h2>
        {!started ? <p className="mb-2 text-xs text-[var(--color-text-muted)]">Oturum henüz başlamadı; yoklama oturum saatinde/sonrasında girilir.</p> : null}
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
          Kulüpte öğrenci bazında “Telafi” yalnız statüdür (bireysel telafi talebi açılmaz). Oturum tümüyle yapılamadıysa aşağıdan erteleyin.
        </p>
      </Card>
      {!s.postponed && !touched ? (
        <Card>
          <h2 className="mb-1 text-sm font-semibold">Oturumu düzelt (yanlış girilen tarih/saat, oda, öğretmen)</h2>
          <p className="mb-2 text-xs text-[var(--color-text-muted)]">Erteleme değildir: Telafi açılmaz, oturum doğru zamana taşınır. Çakışma ve kapalı gün kontrol edilir. Oturumu tamamen kaldırmak için aşağıdaki “Oturumu iptal et”i kullanın.</p>
          <ClubSessionReschedule
            sessionId={s.sessionId}
            initialLocal={initialLocal}
            rooms={rooms}
            teachers={clubTeachers}
            defaultRoomId={s.roomId}
            defaultTeacherId={s.teacherId}
          />
        </Card>
      ) : null}
      {!s.postponed && s.teacherAttendanceStatus !== "geldi" ? (
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Oturumu ertele (tüm üyeler için Telafi)</h2>
          <ClubSessionPostpone sessionId={s.sessionId} rooms={rooms} defaultRoomId={s.roomId} clubId={club.id} />
          <div className="mt-3 border-t border-[var(--color-border)] pt-3">
            <ClubSessionCancel sessionId={s.sessionId} clubId={club.id} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
