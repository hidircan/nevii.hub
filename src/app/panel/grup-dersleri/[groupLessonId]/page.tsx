import Link from "@/components/link";
import { notFound, redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { GroupLessonActionButton, GroupLessonForm, GroupMemberAddExisting, GroupSessionAdd } from "@/components/group-lesson-components";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";
import { enrollmentTerms } from "@/lib/student-enrollments";
import { getGroupLesson, groupMembers, groupScheduleLabel, groupSessionViews, isSeatHolder, readGroupLessonData } from "@/lib/group-lessons";
import { resolveActiveInstrumentNames } from "@/lib/instrument-catalog";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "@/lib/timezone";
import { formatDateTime, formatMoney, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const trDate = (ymd?: string) => (ymd ? ymd.slice(0, 10).split("-").reverse().join(".") : "");

/** 2026-10-23 — Grup dersi: katılımcılar (branş kaydı), oturumlar, ek oturum, düzenleme, sonlandırma. */
export default async function GrupDersiPage({ params }: { params: Promise<{ groupLessonId: string }> }) {
  const { groupLessonId } = await params;
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
  // DB egress: yalnız bu grubun katılımcı satırları + referans veri (tüm dersler okunmaz).
  const [data, instruments] = await Promise.all([readGroupLessonData(g.id), resolveActiveInstrumentNames(session.tenantId)]);
  const today = toZonedYmd(new Date(), DEFAULT_APP_TIMEZONE);
  const nowMs = new Date().getTime();
  const members = groupMembers(data.students, g.id);
  const current = members.filter((m) => isSeatHolder(m, today));
  const past = members.filter((m) => !isSeatHolder(m, today));
  const sessions = groupSessionViews(g, data.lessons);
  const upcoming = sessions.filter((s) => Date.parse(s.endAt) > nowMs);
  const done = sessions.filter((s) => Date.parse(s.endAt) <= nowMs).reverse();
  const teacher = data.teachers.find((t) => t.id === g.teacherId);
  const room = data.rooms.find((r) => r.id === g.roomId);
  const memberIds = new Set(current.map((m) => m.student.id));
  const candidates = data.students
    .filter((s) => s.active && !s.deletedAt && !s.purgedAt && !memberIds.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, hint: s.displayId }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const branchShort = (id: string) => data.settings.branches.find((b) => b.id === id)?.shortName;
  const sessionRow = (s: (typeof sessions)[number]) => (
    <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <Link href={`/panel/grup-dersleri/${g.id}/oturum/${encodeURIComponent(s.key)}`} className="font-medium text-[var(--color-text)] hover:text-[var(--color-primary)]">
        {formatDateTime(s.startAt)}–{formatTime(s.endAt)}
        {s.extra ? " · ek oturum" : ""}
        {s.orphan ? " · eski düzen" : ""}
      </Link>
      <span className="text-xs text-[var(--color-text-muted)]">
        {s.rows.length ? `${s.rows.length} öğrenci · ${s.rows.filter((r) => r.studentAttended || r.lessonProcessed).length} geldi/işlendi` : "katılımcı satırı yok"}
      </span>
    </li>
  );

  return (
    <div className="space-y-5">
      <Link href="/panel/grup-dersleri" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">← Grup Dersleri</Link>
      <PageHeader
        title={g.name}
        description={`${g.instrument} · ${teacher?.name ?? "—"} · ${room?.name ?? "—"} · ${groupScheduleLabel(g)} · ${current.length}/${g.capacity} öğrenci · öğrenci başı ${formatMoney(g.monthlyFee)}/ay${g.status === "ended" ? " · SONA ERDİ" : ""}`}
      />

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Katılımcılar ({current.length}/{g.capacity})</h2>
        {current.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">Henüz katılımcı yok.</p> : null}
        <ul className="divide-y divide-[var(--color-border)]">
          {current.map((m) => {
            const t = enrollmentTerms(m.student, m.enrollment, data.teachers);
            return (
              <li key={m.enrollment.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <Link href={`/panel/ogrenciler/${m.student.id}`} className="font-medium text-[var(--color-text)] hover:text-[var(--color-primary)]">{m.student.name}</Link>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Başlangıç {trDate(t.lessonStartDate ?? t.startDate)}
                    {m.enrollment.endDate ? ` · bitiş ${trDate(m.enrollment.endDate)}` : ""} · {formatMoney(t.monthlyFee)}/ay
                    {m.student.paymentPauseStatus ? " · ödeme durduruldu" : ""}
                  </p>
                </div>
                <Link href={`/panel/ogrenciler/${m.student.id}?duzenleBrans=${encodeURIComponent(m.enrollment.id)}`} className="text-xs font-semibold text-[var(--color-primary)] hover:underline">
                  Kaydı düzenle / gruptan çıkar →
                </Link>
              </li>
            );
          })}
        </ul>
        {g.status === "active" ? (
          <div className="mt-3 border-t border-[var(--color-border)] pt-3">
            <GroupMemberAddExisting groupLessonId={g.id} candidates={candidates} full={current.length >= g.capacity} />
            <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
              Katılım, öğrencinin branş kaydı olarak açılır: öğrenci türü, ödeme, ilk tahsilat ve sözleşme bireysel kayıtla aynı formdan geçer; ücret grup
              fiyatıyla önerilir. Gruptan çıkarmak için öğrencinin grup kaydını “Sonlandır” ile bitirin — bitişten sonraki grup dersleri iptal edilir,
              geçmiş yoklama ve hakediş korunur. Bireyselden gruba geçişte önce bireysel kaydı geçiş tarihiyle sonlandırıp kalan bireysel dersleri iptal edin.
            </p>
          </div>
        ) : null}
        {past.length ? (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-[var(--color-text-muted)]">Eski katılımcılar ({past.length})</summary>
            <ul className="mt-1 space-y-1">
              {past.map((m) => (
                <li key={m.enrollment.id}>
                  <Link href={`/panel/ogrenciler/${m.student.id}`} className="hover:text-[var(--color-primary)]">{m.student.name}</Link>
                  {m.enrollment.endDate ? ` · bitiş ${trDate(m.enrollment.endDate)}` : ""}
                  {!m.student.active ? " · pasif öğrenci" : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Yaklaşan oturumlar ({upcoming.length})</h2>
        <ul className="divide-y divide-[var(--color-border)]">{upcoming.slice(0, 20).map(sessionRow)}</ul>
        {upcoming.length > 20 ? <p className="mt-1 text-xs text-[var(--color-text-muted)]">+{upcoming.length - 20} oturum daha</p> : null}
        {g.status === "active" ? (
          <div className="mt-3 border-t border-[var(--color-border)] pt-3">
            <GroupSessionAdd groupLessonId={g.id} />
          </div>
        ) : null}
      </Card>

      {done.length ? (
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Geçmiş oturumlar ({done.length})</h2>
          <ul className="divide-y divide-[var(--color-border)]">{done.slice(0, 30).map(sessionRow)}</ul>
          <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
            Öğretmen hakedişi bireysel dersle aynı kuralla hesaplanır: oturumda en az bir öğrenci “Geldi/İşlendi” ise oturum süresine göre TEK ders sayılır;
            kimse gelmediyse sayılmaz.
          </p>
        </Card>
      ) : null}

      {g.status === "active" ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Grup dersini düzenle</h2>
          <GroupLessonForm
            group={g}
            instruments={instruments.includes(g.instrument) ? instruments : [g.instrument, ...instruments]}
            teachers={data.teachers.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name, instruments: [...t.instruments] }))}
            rooms={data.rooms.filter((r) => (r.active !== false && !r.deletedAt) || r.id === g.roomId).map((r) => ({ id: r.id, name: r.name, branchName: branchShort(r.branchId) }))}
          />
          <div className="mt-4 flex flex-wrap gap-4 border-t border-[var(--color-border)] pt-3">
            <GroupLessonActionButton
              body={{ action: "sync", groupLessonId: g.id }}
              label="Satırları yenile"
              doneText="{created} eksik katılımcı satırı eklendi; kapalı güne denk gelen {skippedClosedDays} oturum atlandı."
            />
            <GroupLessonActionButton
              body={{ action: "end", groupLessonId: g.id }}
              label="Grubu sonlandır"
              danger
              confirmText={`"${g.name}" sonlandırılsın mı? Gelecek ve yoklamasız oturumlar iptal edilir; geçmiş korunur.`}
              doneText="Grup sonlandırıldı; {cancelled} gelecek satır iptal edildi."
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
