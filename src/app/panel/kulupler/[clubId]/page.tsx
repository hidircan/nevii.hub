import Link from "@/components/link";
import { notFound, redirect } from "next/navigation";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ClubForm, ClubMemberAdd, ClubMemberEnd, ClubSessionScheduler } from "@/components/club-components";
import { ClubDeleteButton } from "@/components/club-delete-button";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";
import { clubPeriodLabel, findClubFeeRow, groupClubSessions, isMembershipActive, listClubsTool } from "@/lib/clubs";
import { readLessonWindow } from "@/lib/store";
import { isLiveObligation } from "@/lib/payment-profile";
import { listTerminalContractIds } from "@/lib/contracts";
import { readPaymentsPageData } from "@/lib/store";
import { resolveActiveInstrumentNames } from "@/lib/instrument-catalog";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "@/lib/timezone";
import { formatDateTime, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ymdTr = (ymd: string) => ymd.split("-").reverse().join(".");

/** 2026-10-05 — Kulüp detayı: üyeler (ücret, bu ayın durumu, açık kulüp borcu), öğretmenler, üye ekle/çıkar, düzenle. */
export default async function KulupDetayPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/panel/kulupler/${clubId}`);
  }
  const kurum = await getInstitutionContext(session);
  if (kurum.scope.mode !== "single" || kurum.scope.tenantId !== session.tenantId) redirect("/panel/kulupler");
  const result = await listClubsTool(session);
  if (!result.ok) {
    return (
      <div>
        <PageHeader title="Kulüp" />
        <EmptyState title="Bu ekrana erişiminiz yok" description={result.error.message} />
      </div>
    );
  }
  const club = result.data.clubs.find((c) => c.id === clubId);
  if (!club) notFound();
  const [data, instruments, terminal] = await Promise.all([
    readPaymentsPageData(),
    resolveActiveInstrumentNames(session.tenantId),
    listTerminalContractIds(session.tenantId),
  ]);
  const today = toZonedYmd(new Date(), DEFAULT_APP_TIMEZONE);
  const month = today.slice(0, 7);
  const all = result.data.memberships.filter((m) => m.clubId === club.id);
  const active = all.filter((m) => isMembershipActive(m, today));
  const past = all.filter((m) => !isMembershipActive(m, today));
  const studentName = (id: string) => data.students.find((s) => s.id === id)?.name ?? "Silinmiş öğrenci";
  const teachers = data.teachers.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }));
  const branches = data.settings.branches.map((b) => ({ id: b.id, name: b.shortName || b.name }));
  const memberIds = new Set(active.map((m) => m.studentId));
  const candidates = data.students
    .filter((s) => s.active && !s.deletedAt && !memberIds.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"))
    .map((s) => ({ id: s.id, name: s.name }));
  const clubDebt = (membershipId: string) =>
    data.payments
      .filter((p) => p.source === "club" && p.clubMembershipId === membershipId && isLiveObligation(p, terminal))
      .reduce((s, p) => s + Math.max(p.amount - p.paidAmount, 0), 0);
  const monthState = (membershipId: string) => {
    const row = findClubFeeRow(data.payments, membershipId, month);
    if (!row) return { text: "Bu ay ücret yok", tone: "muted" as const };
    if (row.status === "voided") return { text: "İptal edildi", tone: "muted" as const };
    if (row.paidAmount >= row.amount) return { text: "Ödendi", tone: "success" as const };
    if (row.paidAmount > 0) return { text: `Kısmi · ${formatMoney(row.paidAmount)}`, tone: "warning" as const };
    return { text: "Bekliyor", tone: "warning" as const };
  };
  const tone = { success: ["var(--color-success-soft)", "var(--color-success)"], warning: ["var(--color-warning-soft)", "var(--color-warning)"], muted: ["var(--color-surface-muted)", "var(--color-text-muted)"] };
  const monthlyTotal = active.reduce((s, m) => s + m.monthlyFee, 0);
  // 2. aşama — oturumlar: 120 gün geri / 200 gün ileri pencere (DB egress: tüm dersler okunmaz).
  const nowMs = new Date().getTime();
  const win = await readLessonWindow(new Date(nowMs - 120 * 86_400_000).toISOString(), new Date(nowMs + 200 * 86_400_000).toISOString());
  const sessions = groupClubSessions(win.lessons, club.id).filter((x) => !x.cancelled);
  const upcoming = sessions.filter((x) => Date.parse(x.endAt) >= nowMs);
  const pastSessions = sessions.filter((x) => Date.parse(x.endAt) < nowMs).reverse();
  const clubTeachers = club.teacherIds.map((id) => ({ id, name: data.teachers.find((t) => t.id === id)?.name ?? "—" }));
  const clubRooms = win.rooms
    .filter((r) => r.active !== false && !r.deletedAt && (!club.branchId || r.branchId === club.branchId))
    .map((r) => ({ id: r.id, name: `${r.name}${club.branchId ? "" : ` · ${branches.find((b) => b.id === r.branchId)?.name ?? ""}`}` }));
  const sessionLine = (x: (typeof sessions)[number]) => (
    <li key={x.sessionId}>
      <Link href={`/panel/kulupler/${club.id}/oturum/${x.sessionId}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm hover:text-[var(--color-primary)]">
        <span className="tabular-nums">{formatDateTime(x.startAt)}</span>
        <span className="text-xs text-[var(--color-text-muted)]">
          {win.rooms.find((r) => r.id === x.roomId)?.name ?? "—"} · {data.teachers.find((t) => t.id === x.teacherId)?.name ?? "—"} · {x.rows.length} üye
          {x.postponed ? " · Ertelendi (Telafi)" : x.teacherAttendanceStatus === "geldi" ? " · Yapıldı" : x.teacherAttendanceStatus ? ` · Öğretmen ${x.teacherAttendanceStatus}` : ""}
        </span>
      </Link>
    </li>
  );

  return (
    <div className="space-y-5">
      <Link href="/panel/kulupler" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">← Kulüpler</Link>
      <PageHeader
        title={club.name}
        description={`${club.instrument} · ${club.branchId ? (branches.find((b) => b.id === club.branchId)?.name ?? "—") : "Şube bağımsız"} · ${club.durationMinutes} dk oturum${club.active ? "" : " · PASİF"}`}
      />
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Üye", `${active.length} / ${club.maxMembers}`],
          ["Aylık ücret", formatMoney(club.monthlyFee)],
          ["Aylık kulüp geliri", formatMoney(monthlyTotal)],
          ["Öğretmen", club.teacherIds.map((id) => data.teachers.find((t) => t.id === id)?.name ?? "—").join(", ")],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{k}</dt>
            <dd className="mt-1 truncate text-sm font-semibold tabular-nums text-[var(--color-text)]">{v}</dd>
          </div>
        ))}
      </dl>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Üyeler ({active.length})</h2>
          <span className="text-xs text-[var(--color-text-muted)]">{clubPeriodLabel(month)} ücret durumu</span>
        </div>
        {active.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Henüz üye yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)]">
                  <th className="py-2 pr-3 font-medium">Öğrenci</th>
                  <th className="py-2 pr-3 font-medium">Katılım</th>
                  <th className="py-2 pr-3 font-medium">Aylık ücret</th>
                  <th className="py-2 pr-3 font-medium">Bu ay</th>
                  <th className="py-2 pr-3 font-medium">Açık kulüp borcu</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {active.map((m) => {
                  const st = monthState(m.id);
                  const debt = clubDebt(m.id);
                  return (
                    <tr key={m.id}>
                      <td className="py-2 pr-3">
                        <Link href={`/panel/ogrenciler/${m.studentId}/odemeler`} className="font-medium text-[var(--color-text)] hover:text-[var(--color-primary)]">
                          {studentName(m.studentId)}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-[var(--color-text-muted)]">{ymdTr(m.startDate)}</td>
                      <td className="py-2 pr-3 tabular-nums">{formatMoney(m.monthlyFee)}</td>
                      <td className="py-2 pr-3">
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: tone[st.tone][0], color: tone[st.tone][1] }}>
                          {st.text}
                        </span>
                      </td>
                      <td className="py-2 pr-3 tabular-nums" style={debt > 0 ? { color: "var(--color-danger)" } : undefined}>
                        {debt > 0 ? formatMoney(debt) : "—"}
                      </td>
                      <td className="py-2 text-right">
                        <ClubMemberEnd membershipId={m.id} studentName={studentName(m.studentId)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {club.active ? (
          <div className="mt-4 border-t border-[var(--color-border)] pt-4">
            <ClubMemberAdd clubId={club.id} candidates={candidates} full={active.length >= club.maxMembers} />
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Oturumlar</h2>
        {club.active && clubRooms.length > 0 ? (
          <ClubSessionScheduler clubId={club.id} teachers={clubTeachers} rooms={clubRooms} />
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">
            {club.active ? "Kulübün şubesinde aktif oda yok — Odalar ekranından oda ekleyin." : "Pasif kulüpte yeni oturum planlanmaz."}
          </p>
        )}
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Yaklaşan ({upcoming.length})</p>
          {upcoming.length ? (
            <ul className="divide-y divide-[var(--color-border)]">{upcoming.slice(0, 20).map(sessionLine)}</ul>
          ) : (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Planlı oturum yok.</p>
          )}
        </div>
        {pastSessions.length ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Geçmiş oturumlar ({pastSessions.length})</summary>
            <ul className="divide-y divide-[var(--color-border)]">{pastSessions.slice(0, 40).map(sessionLine)}</ul>
          </details>
        ) : null}
      </Card>

      {past.length > 0 ? (
        <details className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <summary className="cursor-pointer text-sm font-semibold">Ayrılan üyeler ({past.length})</summary>
          <ul className="mt-2 divide-y divide-[var(--color-border)] text-sm">
            {past.map((m) => (
              <li key={m.id} className="flex justify-between py-1.5">
                <span>{studentName(m.studentId)}</span>
                <span className="tabular-nums text-[var(--color-text-muted)]">
                  {ymdTr(m.startDate)} – {m.endDate ? ymdTr(m.endDate) : ""}
                  {clubDebt(m.id) > 0 ? <span style={{ color: "var(--color-danger)" }}> · açık {formatMoney(clubDebt(m.id))}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <details className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <summary className="cursor-pointer text-sm font-semibold">Kulübü düzenle</summary>
        <div className="mt-3">
          <ClubForm club={club} instruments={instruments} branches={branches} teachers={teachers} />
        </div>
      </details>
      {club.description ? <p className="text-sm text-[var(--color-text-muted)]">{club.description}</p> : null}
      <div className="flex justify-end border-t border-[var(--color-border)] pt-4">
        <ClubDeleteButton clubId={club.id} clubName={club.name} />
      </div>
    </div>
  );
}
