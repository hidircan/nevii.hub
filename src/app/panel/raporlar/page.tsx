import { redirect } from "next/navigation";
import Link from "@/components/link";
import { requireSessionContext } from "@/lib/auth/session";
import { readReferenceData } from "@/lib/store";
import {
  getReportsOverviewTool,
  listLessonAssessmentsForAdminTool,
  listPendingPeriodicAssessmentsTool,
  listPeriodicAssessmentsForAdminTool,
  listTeacherFeedbackForReviewTool,
} from "@/lib/services";
import { ASSESSMENT_SECTIONS, computeOverallScore, computeSectionScore } from "@/lib/assessment/score";
import { getPublicAppBaseUrl } from "@/lib/email/config";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader, Pagination, StatCard } from "@/components/ui";
import { CopyLinkField, InviteLinkCreator } from "@/components/reports/invite-link-button";

export const dynamic = "force-dynamic";

type Tab = "gelisim" | "donemsel" | "degerlendirme";
type StatusFilter = "tumu" | "tamamlanan" | "bekleyen";
type ScoreFilter = "tumu" | "4plus" | "3plus" | "low";

const TABS: { id: Tab; label: string }[] = [
  { id: "gelisim", label: "Ders gelişimi" },
  { id: "donemsel", label: "4 haftalık (4 ders)" },
  { id: "degerlendirme", label: "Öğrenci değerlendirmeleri" },
];
const PAGE_SIZE = 25;
const SOURCE_LABEL: Record<string, string> = { STUDENT: "Öğrenci", PARENT: "Veli", STUDENT_LINK: "Değerlendirme bağlantısı" };
const CONTINUE_LABEL: Record<string, string> = { yes: "Devam: evet", unsure: "Devam: kararsız", no: "Devam: hayır" };

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
/** Türkiye günü (UTC+3) sınırları. */
function dayStartIso(day: string) {
  return new Date(`${day}T00:00:00+03:00`).toISOString();
}
function dayEndIso(day: string) {
  return new Date(`${day}T23:59:59.999+03:00`).toISOString();
}
const snippet = (s: string | undefined, n = 160) => (s && s.length > n ? `${s.slice(0, n)}…` : (s ?? ""));

function matchesScoreFilter(score: number | undefined, filter: ScoreFilter): boolean {
  if (filter === "tumu") return true;
  if (score === undefined || Number.isNaN(score)) return false;
  if (filter === "4plus") return score >= 4;
  if (filter === "3plus") return score >= 3;
  if (filter === "low") return score < 3;
  return true;
}

/**
 * Rapor portalı — yönetici takip ekranı: ders gelişimi, 4 haftalık (4 derslik) ve öğrenci değerlendirmeleri;
 * öğretmen/öğrenci/tarih/durum/puan filtreli, kurumsal PDF dışa aktarımlı.
 * Öğrenci değerlendirmelerinde öğrenci kimliği MASKELİ (mevcut inceleme kuralı; açma gerekçeli/audit'li).
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    sekme?: string;
    ogretmen?: string;
    ogrenci?: string;
    bas?: string;
    bit?: string;
    durum?: string;
    puan?: string;
    sayfa?: string;
  }>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/raporlar");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") redirect("/panel");

  const sp = await searchParams;
  const tab: Tab = sp.sekme === "donemsel" || sp.sekme === "degerlendirme" ? sp.sekme : "gelisim";
  const durum: StatusFilter = sp.durum === "tamamlanan" || sp.durum === "bekleyen" ? sp.durum : "tumu";
  const puan: ScoreFilter = sp.puan === "4plus" || sp.puan === "3plus" || sp.puan === "low" ? sp.puan : "tumu";
  const now = new Date();
  const isDay = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
  const bas = isDay(sp.bas) ? sp.bas! : ymd(new Date(now.getTime() - 30 * 86_400_000));
  const bit = isDay(sp.bit) ? sp.bit! : ymd(now);
  const page = Math.max(1, Number.parseInt(sp.sayfa ?? "1", 10) || 1);
  const filter = {
    teacherId: sp.ogretmen || undefined,
    studentId: tab === "degerlendirme" ? undefined : sp.ogrenci || undefined,
    from: dayStartIso(bas),
    to: dayEndIso(bit),
  };

  const [ref, lessonRes, periodicRes, pendingPeriodicRes, feedbackRes, overview] = await Promise.all([
    readReferenceData(),
    listLessonAssessmentsForAdminTool(session, { ...filter, page: tab === "gelisim" ? page : 1, pageSize: tab === "gelisim" ? PAGE_SIZE : 5 }),
    listPeriodicAssessmentsForAdminTool(session, { ...filter, page: tab === "donemsel" ? page : 1, pageSize: tab === "donemsel" ? PAGE_SIZE : 5 }),
    listPendingPeriodicAssessmentsTool(session, {
      teacherId: filter.teacherId,
      studentId: filter.studentId,
    }),
    listTeacherFeedbackForReviewTool(session, { teacherId: filter.teacherId, from: filter.from, to: filter.to }),
    getReportsOverviewTool(session),
  ]);
  const teacherName = (id: string) => ref.teachers.find((t) => t.id === id)?.name ?? "—";
  const studentName = (id: string) => ref.students.find((s) => s.id === id)?.name ?? "—";
  const feedback = feedbackRes.ok ? feedbackRes.data.feedback : [];
  const ov = overview.ok
    ? overview.data
    : { pendingByTeacher: [], pendingLessons: [], pendingTotal: 0, activeInvites: 0 };
  const pendingPeriodicItems = pendingPeriodicRes.ok ? pendingPeriodicRes.data.items : [];
  const filteredPendingLessons = (ov.pendingLessons ?? []).filter(
    (l) => (!filter.teacherId || l.teacherId === filter.teacherId) && (!filter.studentId || l.studentId === filter.studentId)
  );

  const lessonRows = (lessonRes.ok ? lessonRes.data.rows : []).filter((a) =>
    matchesScoreFilter(computeOverallScore(a), puan)
  );
  const periodicRows = (periodicRes.ok ? periodicRes.data.rows : []).filter((p) => {
    const scoreVal = p.overallScore ?? (p.scores ? computeOverallScore(p.scores) : undefined);
    return matchesScoreFilter(scoreVal, puan);
  });

  const totals = {
    gelisim: lessonRes.ok ? lessonRes.data.total : 0,
    donemsel: periodicRes.ok ? periodicRes.data.total : 0,
    degerlendirme: feedback.length,
  };
  const totalPages = Math.max(1, Math.ceil(totals[tab] / PAGE_SIZE));

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = {
      sekme: tab,
      ogretmen: sp.ogretmen,
      ogrenci: sp.ogrenci,
      bas,
      bit,
      durum: durum === "tumu" ? undefined : durum,
      puan: puan === "tumu" ? undefined : puan,
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/panel/raporlar?${p.toString()}`;
  };

  const base = getPublicAppBaseUrl();
  const activeStudents = ref.students
    .filter((s) => s.active && !s.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name, "tr"))
    .map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Raporlar ve Değerlendirme Merkezi"
        description="Öğretmenlerin ders ve 4 haftalık (4 derslik) gelişim raporlarını inceleyin, filtreleyin ve kurumsal PDF olarak dışa aktarın."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ders gelişimi" value={totals.gelisim} hint={`${formatDate(dayStartIso(bas))} – ${formatDate(dayEndIso(bit))}`} />
        <StatCard
          label="4 haftalık rapor"
          value={totals.donemsel}
          hint={pendingPeriodicItems.length > 0 ? `${pendingPeriodicItems.length} onay bekliyor` : "Seçili tarih aralığı"}
        />
        <StatCard label="Öğrenci değerlendirmesi" value={totals.degerlendirme} hint="Seçili tarih aralığı" />
        <StatCard
          label="Raporu bekleyen ders"
          value={ov.pendingTotal}
          accent={ov.pendingTotal > 0 ? "warning" : "success"}
          hint={
            ov.pendingByTeacher.length > 0
              ? ov.pendingByTeacher.slice(0, 3).map((p) => `${teacherName(p.teacherId)} ${p.count}`).join(" · ")
              : "Son 14 gün"
          }
        />
      </div>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Paylaşılacak bağlantılar</h2>
        <div className="grid gap-2 md:grid-cols-2">
          <CopyLinkField label="Öğretmenler — gelişim raporu formu" url={`${base}/gelisim`} />
          <CopyLinkField label="Öğrenci/veli — öğretmen değerlendirmesi (portal girişi)" url={`${base}/degerlendir`} />
        </div>
        <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
          <p className="text-sm font-medium text-[var(--color-text)]">
            Kişiye özel değerlendirme bağlantısı <span className="font-normal text-[var(--color-text-muted)]">· şifresi olmayan öğrenci/veli için, 14 gün geçerli · etkin: {ov.activeInvites}</span>
          </p>
          <InviteLinkCreator students={activeStudents} />
        </div>
      </Card>

      <nav aria-label="Rapor türü" className="flex flex-wrap gap-1 rounded-[var(--radius-lg)] bg-[var(--color-surface-muted)] p-1">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={qs({ sekme: t.id, sayfa: undefined })}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium",
              tab === t.id ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)]" : "text-[var(--color-text-muted)]"
            )}
          >
            {t.label} <span className="tabular-nums text-[var(--color-text-muted)]">({totals[t.id]})</span>
          </Link>
        ))}
      </nav>

      <form method="get" action="/panel/raporlar" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
        <input type="hidden" name="sekme" value={tab} />
        <select name="ogretmen" defaultValue={sp.ogretmen ?? ""} aria-label="Öğretmen" className="min-h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm">
          <option value="">Tüm öğretmenler</option>
          {ref.teachers
            .filter((t) => !t.deletedAt)
            .sort((a, b) => a.name.localeCompare(b.name, "tr"))
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
        {tab !== "degerlendirme" ? (
          <select name="ogrenci" defaultValue={sp.ogrenci ?? ""} aria-label="Öğrenci" className="min-h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm">
            <option value="">Tüm öğrenciler</option>
            {activeStudents.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="flex items-center px-2 text-xs text-[var(--color-text-muted)]">Öğrenci kimliği gizli</span>
        )}
        <select name="durum" defaultValue={durum} aria-label="Durum" className="min-h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm">
          <option value="tumu">Durum: Tümü</option>
          <option value="tamamlanan">Tamamlanan / Onaylanan</option>
          <option value="bekleyen">Rapor / Onay Bekleyen</option>
        </select>
        <select name="puan" defaultValue={puan} aria-label="Puan filtresi" className="min-h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm">
          <option value="tumu">Puan: Tümü</option>
          <option value="4plus">4.0 ve üzeri (Çok iyi)</option>
          <option value="3plus">3.0 ve üzeri (İyi)</option>
          <option value="low">3.0 altı (Destek gerekli)</option>
        </select>
        <input type="date" name="bas" defaultValue={bas} aria-label="Başlangıç" className="min-h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm" />
        <input type="date" name="bit" defaultValue={bit} aria-label="Bitiş" className="min-h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm" />
        <button type="submit" className="min-h-10 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 text-sm font-medium text-white">
          Uygula
        </button>
      </form>

      {tab === "gelisim" ? (
        <div className="space-y-4">
          {durum !== "tamamlanan" && filteredPendingLessons.length > 0 ? (
            <Card className="space-y-2 border-[var(--color-warning)]/40 bg-[var(--color-warning-soft)]/30 !p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-warning)]">
                  Rapor Bekleyen Tamamlanmış Dersler ({filteredPendingLessons.length})
                </p>
                <span className="text-xs text-[var(--color-text-muted)]">Son 14 gün</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {filteredPendingLessons.slice(0, durum === "bekleyen" ? 50 : 6).map((pl) => (
                  <div
                    key={pl.id}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <Link href={`/panel/ogrenciler/${pl.studentId}/gelisim`} className=" block truncate font-semibold text-[var(--color-text)] hover:underline">
                        {studentName(pl.studentId)}
                      </Link>
                      <p className="truncate text-[var(--color-text-muted)]">
                        {teacherName(pl.teacherId)} · {formatDateTime(pl.startAt)}
                      </p>
                    </div>
                    <Badge status="pending">Bekliyor</Badge>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {durum !== "bekleyen" ? (
            lessonRows.length > 0 ? (
              <ul className="space-y-3">
                {lessonRows.map((a) => {
                  const overall = computeOverallScore(a);
                  const topics = [
                    a.piecesWorked ? `Eser: ${a.piecesWorked}` : null,
                    a.etudesWorked ? `Etüt: ${a.etudesWorked}` : null,
                    a.technicalWork ? `Teknik: ${a.technicalWork}` : null,
                    a.theoryWork ? `Teori: ${a.theoryWork}` : null,
                  ].filter((x): x is string => Boolean(x));

                  return (
                    <li key={a.id}>
                      <Card className="space-y-3 !p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Link href={`/panel/ogrenciler/${a.studentId}/gelisim`} className="text-base font-semibold text-[var(--color-text)] hover:underline">
                                {studentName(a.studentId)}
                              </Link>
                              <Badge status="approved">Tamamlandı</Badge>
                              <span className="rounded-full bg-[var(--color-primary-soft)] px-2.5 py-0.5 text-xs font-bold tabular-nums text-[var(--color-primary)]">
                                {overall.toFixed(1)} / 5
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                              Öğretmen: <strong className="font-medium text-[var(--color-text)]">{teacherName(a.teacherId)}</strong> · {formatDateTime(a.createdAt)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link
                              href={`/degerlendirme/${a.id}`}
                              className="inline-flex min-h-8 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
                            >
                              Raporu Gör
                            </Link>
                            <Link
                              href={`/degerlendirme/${a.id}?yazdir=1`}
                              target="_blank"
                              className="inline-flex min-h-8 items-center rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 text-xs font-medium text-white hover:opacity-95"
                            >
                              PDF İndir / Yazdır
                            </Link>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {ASSESSMENT_SECTIONS.map((sec) => (
                            <span
                              key={sec.id}
                              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)]"
                            >
                              {sec.label}: <strong className="tabular-nums text-[var(--color-text)]">{computeSectionScore(a, sec.id).toFixed(1)}</strong>
                            </span>
                          ))}
                        </div>

                        {topics.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {topics.map((t, idx) => (
                              <span key={idx} className="rounded-full bg-[var(--color-surface-muted)] px-2.5 py-0.5 text-xs text-[var(--color-text)]">
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        <div className="grid gap-2 border-t border-[var(--color-border)] pt-2.5 text-xs sm:grid-cols-3">
                          <div>
                            <p className="font-semibold text-[var(--color-text-muted)]">Güçlü Yönler</p>
                            <p className="mt-0.5 text-[var(--color-text)]">{snippet(a.strengthNote)}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-[var(--color-text-muted)]">Gelişim Alanı</p>
                            <p className="mt-0.5 text-[var(--color-text)]">{snippet(a.improvementNote)}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-[var(--color-text-muted)]">Sonraki Ders Odak & Ödev</p>
                            <p className="mt-0.5 text-[var(--color-text)]">{snippet(a.nextStepsNote)}</p>
                          </div>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="Bu filtrede ders gelişim raporu yok" description="Tarih aralığını genişletin veya durum/puan filtresini temizleyin." />
            )
          ) : filteredPendingLessons.length === 0 ? (
            <EmptyState title="Rapor bekleyen ders bulunmuyor" description="Seçili öğretmen/öğrenci için tüm ders raporları tamamlanmış." />
          ) : null}
        </div>
      ) : null}

      {tab === "donemsel" ? (
        <div className="space-y-4">
          {durum !== "tamamlanan" && pendingPeriodicItems.length > 0 ? (
            <Card className="space-y-2.5 border-[var(--color-warning)]/40 bg-[var(--color-warning-soft)]/30 !p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-warning)]">
                  Öğretmen Onayı Bekleyen 4 Haftalık / 4 Derslik Raporlar ({pendingPeriodicItems.length})
                </p>
                <span className="text-xs text-[var(--color-text-muted)]">Otomatik 4 ders özeti hazır</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {pendingPeriodicItems.map((item) => (
                  <div
                    key={`${item.studentId}-${item.periodStart}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs"
                  >
                    <div>
                      <Link href={`/panel/ogrenciler/${item.studentId}/gelisim`} className="font-semibold text-[var(--color-text)] hover:underline">
                        {item.studentName}
                      </Link>
                      <p className="mt-0.5 text-[var(--color-text-muted)]">
                        {teacherName(item.teacherId)} · {formatDate(item.periodStart)} – {formatDate(item.periodEnd)}
                      </p>
                      {item.draft ? (
                        <p className="mt-0.5 text-[11px] text-[var(--color-primary)]">
                          {item.draft.lessonCount} ders hazır · Önerilen ort. puan: {item.draft.overallScore.toFixed(1)}/5
                        </p>
                      ) : null}
                    </div>
                    <Badge status="pending">Onay Bekliyor</Badge>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {durum !== "bekleyen" ? (
            periodicRows.length > 0 ? (
              <ul className="space-y-3">
                {periodicRows.map((p) => {
                  const overall = p.overallScore ?? (p.scores ? computeOverallScore(p.scores) : undefined);
                  const lessonCount = p.lessonSummaries?.length || p.relatedLessonIds.length;

                  return (
                    <li key={p.id}>
                      <Card className="space-y-3 !p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Link href={`/panel/ogrenciler/${p.studentId}/gelisim`} className="text-base font-semibold text-[var(--color-text)] hover:underline">
                                {studentName(p.studentId)}
                              </Link>
                              <Badge status="approved">Onaylandı</Badge>
                              {overall !== undefined ? (
                                <span className="rounded-full bg-[var(--color-primary-soft)] px-2.5 py-0.5 text-xs font-bold tabular-nums text-[var(--color-primary)]">
                                  {overall.toFixed(1)} / 5
                                </span>
                              ) : null}
                              {lessonCount > 0 ? (
                                <span className="rounded-full bg-[var(--color-surface-muted)] px-2.5 py-0.5 text-xs text-[var(--color-text-muted)]">
                                  {lessonCount} ders özeti
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                              Öğretmen: <strong className="font-medium text-[var(--color-text)]">{p.teacherSignedName || teacherName(p.teacherId)}</strong> · Dönem:{" "}
                              {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link
                              href={`/degerlendirme/rapor/${p.studentId}?donem=${p.id}`}
                              className="inline-flex min-h-8 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
                            >
                              Raporu Gör
                            </Link>
                            <Link
                              href={`/degerlendirme/rapor/${p.studentId}?donem=${p.id}&yazdir=1`}
                              target="_blank"
                              className="inline-flex min-h-8 items-center rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 text-xs font-medium text-white hover:opacity-95"
                            >
                              PDF İndir / Yazdır
                            </Link>
                          </div>
                        </div>

                        {p.scores ? (
                          <div className="flex flex-wrap gap-1.5">
                            {ASSESSMENT_SECTIONS.map((sec) => (
                              <span
                                key={sec.id}
                                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)]"
                              >
                                {sec.label}: <strong className="tabular-nums text-[var(--color-text)]">{computeSectionScore(p.scores!, sec.id).toFixed(1)}</strong>
                              </span>
                            ))}
                          </div>
                        ) : null}

                        {p.lessonSummaries && p.lessonSummaries.length > 0 ? (
                          <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] p-2.5">
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                              Dönem İçindeki 4 Dersin Özeti
                            </p>
                            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                              {p.lessonSummaries.map((ls, idx) => (
                                <div key={ls.lessonId} className="rounded bg-[var(--color-surface)] px-2.5 py-1.5 text-xs">
                                  <div className="flex items-center justify-between font-medium text-[var(--color-text)]">
                                    <span>
                                      {idx + 1}. Ders ({formatDate(ls.startAt)})
                                    </span>
                                    {ls.overallScore !== undefined ? <span className="tabular-nums text-[var(--color-primary)]">{ls.overallScore.toFixed(1)}/5</span> : null}
                                  </div>
                                  {ls.piecesWorked || ls.technicalWork || ls.strengthNote ? (
                                    <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">
                                      {[ls.piecesWorked, ls.technicalWork, ls.strengthNote].filter(Boolean).join(" · ")}
                                    </p>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="grid gap-2 border-t border-[var(--color-border)] pt-2.5 text-xs sm:grid-cols-2 lg:grid-cols-4">
                          <div>
                            <p className="font-semibold text-[var(--color-text-muted)]">4 Derslik Genel Gelişim</p>
                            <p className="mt-0.5 text-[var(--color-text)]">{snippet(p.overallProgressNote)}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-[var(--color-text-muted)]">Öne Çıkan Kazanımlar</p>
                            <p className="mt-0.5 text-[var(--color-text)]">{snippet(p.strengthsNote)}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-[var(--color-text-muted)]">Odaklanılacak Alanlar</p>
                            <p className="mt-0.5 text-[var(--color-text)]">{snippet(p.areasForImprovementNote)}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-[var(--color-text-muted)]">Yeni 4 Ders Planı & Öneri</p>
                            <p className="mt-0.5 text-[var(--color-text)]">{snippet(p.recommendationNote)}</p>
                          </div>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="Bu filtrede 4 haftalık değerlendirme yok" description="Tarih aralığını genişletin veya durum/puan filtresini temizleyin." />
            )
          ) : pendingPeriodicItems.length === 0 ? (
            <EmptyState title="Onay bekleyen 4 haftalık rapor bulunmuyor" description="Seçili kriterlerde tüm 4 derslik dönem raporları tamamlanmış." />
          ) : null}
        </div>
      ) : null}

      {tab === "degerlendirme" ? (
        feedback.length > 0 ? (
          <ul className="space-y-2">
            {feedback.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((f) => {
              const vals = Object.values(f.scores ?? {}) as number[];
              const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
              return (
                <li key={f.id}>
                  <Card className="!p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={`/panel/ogretmenler/${f.teacherId}/geri-bildirim`} className="text-sm font-semibold text-[var(--color-text)] hover:underline">
                        {teacherName(f.teacherId)}
                      </Link>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {SOURCE_LABEL[f.submitterRole] ?? "Öğrenci/veli"} · {formatDateTime(f.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-text)]">
                      Ortalama <span className="font-semibold tabular-nums">{avg.toFixed(1)}</span>/5
                      {f.continueWithTeacher ? <span className="text-[var(--color-text-muted)]"> · {CONTINUE_LABEL[f.continueWithTeacher]}</span> : null}
                    </p>
                    {f.comment ? <p className="mt-1 text-sm text-[var(--color-text-muted)]">{snippet(f.comment)}</p> : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="Bu aralıkta öğrenci değerlendirmesi yok" description="Öğrencilere değerlendirme bağlantısı göndermek için yukarıdaki kutuyu kullanın." />
        )
      ) : null}

      {totalPages > 1 ? <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} hrefForPage={(p) => qs({ sayfa: String(p) })} /> : null}
    </div>
  );
}
