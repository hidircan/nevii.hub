import Link from "@/components/link";
import { notFound, redirect } from "next/navigation";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import {
  ClubApplicationsToggle,
  ClubForm,
  ClubMemberAdd,
  ClubMemberDates,
  ClubMemberDelete,
  ClubMemberEnd,
  ClubMemberStartFee,
  ClubSessionScheduler,
  CopyLinkButton,
} from "@/components/club-components";
import { ClubDeleteButton } from "@/components/club-delete-button";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";
import {
  CLUB_AUDIENCE_LABEL,
  CLUB_FEE_PERIOD_LABEL,
  clubApplicationIssues,
  clubOpeningIssues,
  clubPeriodLabel,
  findClubFeeRow,
  groupClubSessions,
  isMembershipActive,
  isSolfegeClub,
  listClubsTool,
  membershipEndScheduled,
} from "@/lib/clubs";
import { careerSlugForTenant } from "@/lib/recruitment/institution";
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
  const [data, instruments, terminal, slug] = await Promise.all([
    readPaymentsPageData({ clubOnly: true }), // DB egress (2026-10-19): yalnız kulüp ücretleri okunur
    resolveActiveInstrumentNames(session.tenantId),
    listTerminalContractIds(session.tenantId),
    careerSlugForTenant(session.tenantId),
  ]);
  const allClubs = result.data.clubs;
  const solfegeClubs = allClubs.filter(isSolfegeClub).map((c) => ({ id: c.id, name: c.name, audience: c.audience, branchId: c.branchId }));
  const includedSolfege = club.includedSolfegeClubId ? allClubs.find((c) => c.id === club.includedSolfegeClubId) : undefined;
  // Portalda görünürlük (halka açık kabul) ile açma/kaydetme eksikleri (toplam ders sayısı dahil) ayrı.
  const portalVisibleIssues = clubApplicationIssues(club, toZonedYmd(new Date(), DEFAULT_APP_TIMEZONE));
  const portalIssues = clubOpeningIssues(club, toZonedYmd(new Date(), DEFAULT_APP_TIMEZONE));
  const clubLink = `/basvuru/${slug}/kulup?kulup=${encodeURIComponent(club.id)}`;
  const today = toZonedYmd(new Date(), DEFAULT_APP_TIMEZONE);
  const month = today.slice(0, 7);
  const all = result.data.memberships.filter((m) => m.clubId === club.id);
  // TEK aktif tanımı (isMembershipActive): sonlanan üyelik aynı gün aktif listeden çıkar, "Ayrılan üyeler"de görünür.
  const active = all.filter((m) => isMembershipActive(m, today));
  const past = all.filter((m) => !isMembershipActive(m, today));
  const studentName = (id: string) => data.students.find((s) => s.id === id)?.name ?? "Silinmiş öğrenci";
  const teachers = data.teachers.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }));
  const branches = data.settings.branches.map((b) => ({ id: b.id, name: b.shortName || b.name }));
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
  // 2. aşama — oturumlar: 120 gün geri / 200 gün ileri pencere; DB egress (2026-10-19) yalnız kulüp satırları (~4.700 → ~150).
  const nowMs = new Date().getTime();
  const win = await readLessonWindow(new Date(nowMs - 120 * 86_400_000).toISOString(), new Date(nowMs + 200 * 86_400_000).toISOString(), { clubOnly: true });
  const sessions = groupClubSessions(win.lessons, club.id).filter((x) => !x.cancelled);
  const upcoming = sessions.filter((x) => Date.parse(x.endAt) >= nowMs);
  const pastSessions = sessions.filter((x) => Date.parse(x.endAt) < nowMs).reverse();
  // Ertelenen oturumun yerine yeni oturum açıldığı için ertelenmiş (Telafi) olan sayılmaz — çift sayım yok.
  const plannedLive = sessions.filter((x) => !x.postponed).length;
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
          {x.postponed ? " · Ertelendi (Telafi)" : Date.parse(x.startAt) <= nowMs ? " · Yapıldı" : ""}
        </span>
      </Link>
    </li>
  );

  return (
    <div className="space-y-5">
      <Link href="/panel/kulupler" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">← Kulüpler</Link>
      <PageHeader
        title={club.name}
        description={`${club.instrument}${club.audience ? ` · ${CLUB_AUDIENCE_LABEL[club.audience]}` : ""} · ${club.branchId ? (branches.find((b) => b.id === club.branchId)?.name ?? "—") : "Şube bağımsız"} · ${club.durationMinutes} dk oturum${club.active ? "" : " · PASİF"}`}
      />
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <ClubApplicationsToggle clubId={club.id} open={club.applicationsOpen} />
        {club.applicationsOpen && portalVisibleIssues.length === 0 ? (
          <>
            <a href={clubLink} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[var(--color-primary)] hover:underline">Portalda gör ↗</a>
            <CopyLinkButton path={clubLink} label="Kulübe özel başvuru bağlantısı" />
          </>
        ) : null}
        {portalIssues.length ? (
          <span className="text-[11px] text-[var(--color-text-muted)]">
            {club.applicationsOpen ? "Eksik (kaydetmeden önce tamamlayın)" : "Başvuruya açmak için eksik"}: {portalIssues.join(", ")}.
          </span>
        ) : null}
        <Link href={`/panel/kulupler/basvurular?clubId=${encodeURIComponent(club.id)}`} className="ml-auto text-xs font-semibold text-[var(--color-primary)] hover:underline">Bu kulübün başvuruları →</Link>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ["Üye", `${active.length} / ${club.maxMembers}`],
          ["Ücret", `${formatMoney(club.monthlyFee)} / ${CLUB_FEE_PERIOD_LABEL[club.feePeriod]}${club.feePeriod === "monthly" && club.feeMonths !== undefined ? ` · ${club.feeMonths} ay` : ""}`],
          ["Toplam ders", club.totalLessons !== undefined ? `${club.totalLessons} · planlı ${plannedLive}` : `Belirtilmedi · planlı ${plannedLive}`],
          [club.feePeriod === "monthly" ? "Aylık kulüp geliri" : "Dönem", club.feePeriod === "monthly" ? formatMoney(monthlyTotal) : `${club.startDate ? ymdTr(club.startDate) : "—"} – ${club.endDate ? ymdTr(club.endDate) : "—"}`],
          ["Öğretmen", club.teacherIds.length ? club.teacherIds.map((id) => data.teachers.find((t) => t.id === id)?.name ?? "—").join(", ") : "Seçilmedi"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{k}</dt>
            <dd className="mt-1 truncate text-sm font-semibold tabular-nums text-[var(--color-text)]">{v}</dd>
          </div>
        ))}
      </dl>

      {club.totalLessons !== undefined && plannedLive > 0 && plannedLive !== club.totalLessons ? (
        <p className="rounded-md bg-[var(--color-warning-soft)] px-3 py-2 text-xs text-[var(--color-warning)]">
          Planlı oturum sayısı ({plannedLive}, son 120 / önümüzdeki 200 gün) kulübün toplam ders sayısından ({club.totalLessons}) farklı. Başvuru portalı{" "}
          {club.totalLessons} gösterir; farklıysa “Kulübü düzenle”den toplam ders sayısını ya da oturum planını düzeltin.
        </p>
      ) : null}
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
                  const startRow = findClubFeeRow(data.payments, m.id, m.startDate.slice(0, 7));
                  return (
                    <tr key={m.id}>
                      <td className="py-2 pr-3">
                        <Link href={`/panel/ogrenciler/${m.studentId}/odemeler`} className="font-medium text-[var(--color-text)] hover:text-[var(--color-primary)]">
                          {studentName(m.studentId)}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-[var(--color-text-muted)]">
                        {ymdTr(m.startDate)}
                        {m.endDate ? <span className="block text-[11px]">Sonlanma: {ymdTr(m.endDate)}</span> : null}
                        <div><ClubMemberDates membershipId={m.id} startDate={m.startDate} endDate={m.endDate} /></div>
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {m.includedByMembershipIds?.length ? "Dahil (0 ₺)" : formatMoney(m.monthlyFee)}
                        {m.applicationId ? <span className="block text-[11px] text-[var(--color-text-muted)]">başvurudan</span> : null}
                        {!startRow && m.monthlyFee > 0 ? <ClubMemberStartFee membershipId={m.id} amountText={formatMoney(m.monthlyFee)} /> : null}
                      </td>
                      <td className="py-2 pr-3">
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: tone[st.tone][0], color: tone[st.tone][1] }}>
                          {st.text}
                        </span>
                      </td>
                      <td className="py-2 pr-3 tabular-nums" style={debt > 0 ? { color: "var(--color-danger)" } : undefined}>
                        {debt > 0 ? formatMoney(debt) : "—"}
                      </td>
                      <td className="py-2 text-right">
                        <span className="inline-flex flex-col items-end gap-1">
                          {/* Sonlanma tarihi planlı (gelecek) üyelikte sonlandırma eylemi yok — tarih "Tarihleri düzelt"ten değişir. */}
                          {membershipEndScheduled(m, today) ? (
                            <span className="text-[11px] text-[var(--color-text-muted)]">{ymdTr(m.endDate!)} tarihinde sona erecek</span>
                          ) : (
                            <ClubMemberEnd membershipId={m.id} studentName={studentName(m.studentId)} />
                          )}
                          <ClubMemberDelete membershipId={m.id} studentName={studentName(m.studentId)} clubName={club.name} />
                        </span>
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
            <ClubMemberAdd clubId={club.id} full={active.length >= club.maxMembers} />
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
              <li key={m.id} className="flex flex-wrap items-start justify-between gap-2 py-1.5">
                <span>
                  {studentName(m.studentId)} <span className="text-[11px] text-[var(--color-text-muted)]">· Sonlandı</span>
                </span>
                <span className="tabular-nums text-[var(--color-text-muted)]">
                  <ClubMemberDates membershipId={m.id} startDate={m.startDate} endDate={m.endDate} />{" "}
                  {ymdTr(m.startDate)} – {m.endDate ? ymdTr(m.endDate) : ""}
                  {clubDebt(m.id) > 0 ? <span style={{ color: "var(--color-danger)" }}> · açık {formatMoney(clubDebt(m.id))}</span> : null}
                </span>
                <ClubMemberDelete membershipId={m.id} studentName={studentName(m.studentId)} clubName={club.name} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <details className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Kulübü düzenle <span className="font-normal text-[var(--color-text-muted)]">— ad, dönem tarihleri, ücret, kontenjan, öğretmen, portal bilgileri</span>
        </summary>
        <div className="mt-3">
          <ClubForm club={club} instruments={instruments} branches={branches} teachers={teachers} solfegeClubs={solfegeClubs} />
        </div>
      </details>
      {club.description || club.includesText || includedSolfege || club.internalNote ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {club.description ? (
            <div className="rounded-lg border border-[var(--color-border)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Açıklama (portalda görünür)</p>
              <p className="mt-1 whitespace-pre-line text-sm">{club.description}</p>
            </div>
          ) : null}
          {club.includesText || includedSolfege ? (
            <div className="rounded-lg border border-[var(--color-border)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Ücrete dahil</p>
              {club.includesText ? <p className="mt-1 whitespace-pre-line text-sm">{club.includesText}</p> : null}
              {includedSolfege ? (
                <p className="mt-1 text-sm">
                  Dahil solfej: <Link href={`/panel/kulupler/${includedSolfege.id}`} className="font-medium text-[var(--color-primary)] hover:underline">{includedSolfege.name}</Link> (ek ücretsiz)
                </p>
              ) : null}
            </div>
          ) : null}
          {club.internalNote ? (
            <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] p-3 sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Yönetim notu (yalnız panel)</p>
              <p className="mt-1 whitespace-pre-line text-sm">{club.internalNote}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-end border-t border-[var(--color-border)] pt-4">
        <ClubDeleteButton clubId={club.id} clubName={club.name} />
      </div>
    </div>
  );
}
