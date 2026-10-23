import { redirect } from "next/navigation";
import Link from "@/components/link";
import { requireSessionContext } from "@/lib/auth/session";
import { readReferenceData } from "@/lib/store";
import {
  getReportsOverviewTool,
  listLessonAssessmentsForAdminTool,
  listPeriodicAssessmentsForAdminTool,
  listTeacherFeedbackForReviewTool,
} from "@/lib/services";
import { computeOverallScore } from "@/lib/assessment/score";
import { getPublicAppBaseUrl } from "@/lib/email/config";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader, Pagination } from "@/components/ui";
import { CopyLinkField, InviteLinkCreator } from "@/components/reports/invite-link-button";

export const dynamic = "force-dynamic";

type Tab = "bekleyen" | "gelisim" | "donemsel" | "degerlendirme";

const TABS: { id: Tab; label: string }[] = [
  { id: "bekleyen", label: "Bekleyenler" },
  { id: "gelisim", label: "Ders raporları" },
  { id: "donemsel", label: "4 haftalık raporlar" },
  { id: "degerlendirme", label: "Öğrenci değerlendirmeleri" },
];
const PAGE_SIZE = 25;
/** Bekleyenler görünümünde her listeden en çok bu kadar satır; fazlası öğretmen filtresiyle daraltılır. */
const PENDING_LIMIT = 30;
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
const snippet = (s: string | undefined, n = 140) => (s && s.length > n ? `${s.slice(0, n)}…` : (s ?? ""));

const selectClass =
  "min-h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm";
const ghostBtn =
  "inline-flex min-h-8 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]";
const primaryBtn =
  "inline-flex min-h-8 items-center rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 text-xs font-medium text-white hover:opacity-95";

function ScorePill({ value }: { value?: number }) {
  if (value === undefined || Number.isNaN(value)) return null;
  return (
    <span className="rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--color-primary)]">
      {value.toFixed(1)} / 5
    </span>
  );
}

/**
 * Raporlar — karar verdiren ekran (2026-10-23). Varsayılan görünüm "Bekleyenler": yazılmamış ders raporları ve
 * 4 haftalık raporlar (aksiyon gerektirenler). Tamamlanan raporlar ayrı sekmelerde, tarih filtreli ve sayfalı arşivdir.
 * Kota: yalnız açık sekmenin verisi okunur (eskiden her açılışta 5 kaynak + 120 günlük pencere + öğrenci başına tüm
 * ders raporları okunuyordu). Öğrenci değerlendirmelerinde öğrenci kimliği MASKELİ (mevcut inceleme kuralı).
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
  const tab: Tab = TABS.some((t) => t.id === sp.sekme) ? (sp.sekme as Tab) : "bekleyen";
  const now = new Date();
  const isDay = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
  const bas = isDay(sp.bas) ? sp.bas! : ymd(new Date(now.getTime() - 30 * 86_400_000));
  const bit = isDay(sp.bit) ? sp.bit! : ymd(now);
  const page = Math.max(1, Number.parseInt(sp.sayfa ?? "1", 10) || 1);
  const teacherId = sp.ogretmen || undefined;
  const range = { from: dayStartIso(bas), to: dayEndIso(bit) };
  const archive = { teacherId, studentId: sp.ogrenci || undefined, ...range, page, pageSize: PAGE_SIZE };

  const [ref, overview, lessonRes, periodicRes, feedbackRes] = await Promise.all([
    readReferenceData(),
    tab === "bekleyen" ? getReportsOverviewTool(session, { teacherId, limit: PENDING_LIMIT }) : null,
    tab === "gelisim" ? listLessonAssessmentsForAdminTool(session, archive) : null,
    tab === "donemsel" ? listPeriodicAssessmentsForAdminTool(session, archive) : null,
    tab === "degerlendirme" ? listTeacherFeedbackForReviewTool(session, { teacherId, ...range, page, pageSize: PAGE_SIZE }) : null,
  ]);
  const teacherName = (id: string) => ref.teachers.find((t) => t.id === id)?.name;
  const studentName = (id: string) => ref.students.find((s) => s.id === id)?.name ?? "—";

  const ov = overview?.ok ? overview.data : undefined;
  const lessonRows = lessonRes?.ok ? lessonRes.data.rows : [];
  const periodicRows = periodicRes?.ok ? periodicRes.data.rows : [];
  const feedback = feedbackRes?.ok ? feedbackRes.data.feedback : [];
  const total =
    tab === "gelisim"
      ? lessonRes?.ok ? lessonRes.data.total : 0
      : tab === "donemsel"
        ? periodicRes?.ok ? periodicRes.data.total : 0
        : tab === "degerlendirme"
          ? feedbackRes?.ok ? (feedbackRes.data.total ?? feedback.length) : 0
          : (ov?.pendingTotal ?? 0) + (ov?.pendingPeriodicTotal ?? 0);
  const totalPages = tab === "bekleyen" ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const loadError = [overview, lessonRes, periodicRes, feedbackRes].find((r) => r && !r.ok);

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { sekme: tab, ogretmen: sp.ogretmen, ogrenci: sp.ogrenci, bas: sp.bas, bit: sp.bit, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/panel/raporlar?${p.toString()}`;
  };

  const activeStudents = ref.students
    .filter((s) => s.active && !s.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name, "tr"))
    .map((s) => ({ id: s.id, name: s.name }));
  const showStudentFilter = tab === "gelisim" || tab === "donemsel";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Raporlar"
        description="Önce yazılmayı bekleyen raporlar; tamamlanan ders ve 4 haftalık raporlar arşiv sekmelerinde, PDF olarak alınabilir."
      />

      <nav aria-label="Rapor görünümü" className="flex flex-wrap gap-1 rounded-[var(--radius-lg)] bg-[var(--color-surface-muted)] p-1">
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
            {t.label}
            {tab === t.id && total > 0 ? <span className="ml-1 tabular-nums text-[var(--color-text-muted)]">({total})</span> : null}
          </Link>
        ))}
      </nav>

      <form method="get" action="/panel/raporlar" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="sekme" value={tab} />
        <select name="ogretmen" defaultValue={sp.ogretmen ?? ""} aria-label="Öğretmen" className={selectClass}>
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
        {showStudentFilter ? (
          <select name="ogrenci" defaultValue={sp.ogrenci ?? ""} aria-label="Öğrenci" className={selectClass}>
            <option value="">Tüm öğrenciler</option>
            {activeStudents.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : null}
        {tab !== "bekleyen" ? (
          <>
            <input type="date" name="bas" defaultValue={bas} aria-label="Başlangıç" className={selectClass} />
            <input type="date" name="bit" defaultValue={bit} aria-label="Bitiş" className={selectClass} />
          </>
        ) : null}
        <button type="submit" className="min-h-10 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 text-sm font-medium text-white">
          Uygula
        </button>
      </form>

      {loadError && !loadError.ok ? (
        <Card className="border-[var(--color-danger)]/40 text-sm text-[var(--color-danger)]">
          Raporlar yüklenemedi: {loadError.error.message} Sayfayı yenileyin; sorun sürerse filtreleri temizleyin.
        </Card>
      ) : null}

      {tab === "bekleyen" && ov ? (
        <div className="space-y-5">
          <section className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">
                Raporu yazılmamış dersler <span className="tabular-nums text-[var(--color-text-muted)]">({ov.pendingTotal})</span>
              </h2>
              <span className="text-xs text-[var(--color-text-muted)]">Son 14 gün · öğretmen raporu yazınca listeden düşer</span>
            </div>
            {ov.pendingByTeacher.length > 1 && !teacherId ? (
              <div className="flex flex-wrap gap-1.5">
                {ov.pendingByTeacher.map((p) => (
                  <Link key={p.teacherId} href={qs({ ogretmen: p.teacherId })} className={ghostBtn}>
                    {teacherName(p.teacherId) ?? "—"} <strong className="ml-1 tabular-nums">{p.count}</strong>
                  </Link>
                ))}
              </div>
            ) : null}
            {ov.pendingLessons.length === 0 ? (
              <EmptyState title="Raporu bekleyen ders yok" description="Son 14 gündeki tüm derslerin raporu yazılmış." />
            ) : (
              <Card className="!p-0">
                <ul className="divide-y divide-[var(--color-border)]">
                  {ov.pendingLessons.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <Link href={`/panel/ogrenciler/${l.studentId}/gelisim`} className="block truncate font-medium text-[var(--color-text)] hover:underline">
                          {studentName(l.studentId)}
                        </Link>
                        <p className="truncate text-xs text-[var(--color-text-muted)]">
                          {teacherName(l.teacherId) ?? "—"} · {formatDateTime(l.startAt)}
                          {l.instrument ? ` · ${l.instrument}` : ""}
                        </p>
                      </div>
                      <Badge status="pending">Yazılmadı</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {ov.pendingTotal > ov.pendingLessons.length ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                İlk {ov.pendingLessons.length} ders gösteriliyor; daraltmak için öğretmen seçin.
              </p>
            ) : null}
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">
                Yazılmayı bekleyen 4 haftalık raporlar{" "}
                <span className="tabular-nums text-[var(--color-text-muted)]">({ov.pendingPeriodicTotal})</span>
              </h2>
              <span className="text-xs text-[var(--color-text-muted)]">Son rapordan sonra 4 ders tamamlanınca açılır</span>
            </div>
            {ov.pendingPeriodic.length === 0 ? (
              <EmptyState title="Bekleyen 4 haftalık rapor yok" description="4 dersini tamamlayan tüm öğrencilerin raporu yazılmış." />
            ) : (
              <Card className="!p-0">
                <ul className="divide-y divide-[var(--color-border)]">
                  {ov.pendingPeriodic.map((p) => (
                    <li key={`${p.studentId}:${p.teacherId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <Link href={`/panel/ogrenciler/${p.studentId}/gelisim`} className="block truncate font-medium text-[var(--color-text)] hover:underline">
                          {p.studentName}
                        </Link>
                        <p className="truncate text-xs text-[var(--color-text-muted)]">
                          {teacherName(p.teacherId) ?? "—"} · {formatDate(p.periodStart)} – {formatDate(p.periodEnd)} · {p.lessonCount} ders
                        </p>
                      </div>
                      <Badge status="pending">Yazılmadı</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {ov.pendingPeriodicTotal > ov.pendingPeriodic.length ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                İlk {ov.pendingPeriodic.length} rapor gösteriliyor; daraltmak için öğretmen seçin.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}

      {tab === "gelisim" && lessonRes?.ok ? (
        lessonRows.length > 0 ? (
          <Card className="!p-0">
            <ul className="divide-y divide-[var(--color-border)]">
              {lessonRows.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/panel/ogrenciler/${a.studentId}/gelisim`} className="font-semibold text-[var(--color-text)] hover:underline">
                        {studentName(a.studentId)}
                      </Link>
                      <ScorePill value={computeOverallScore(a)} />
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Hazırlayan: {teacherName(a.teacherId) ?? a.teacherSignedName ?? "—"} · {formatDateTime(a.createdAt)}
                    </p>
                    {a.nextStepsNote ? (
                      <p className="mt-0.5 truncate text-xs text-[var(--color-text)]">Sonraki ders: {snippet(a.nextStepsNote)}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Link href={`/degerlendirme/${a.id}`} className={ghostBtn}>
                      Gör
                    </Link>
                    <Link href={`/degerlendirme/${a.id}?yazdir=1`} target="_blank" className={primaryBtn}>
                      PDF
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState title="Bu filtrede ders raporu yok" description="Tarih aralığını genişletin veya öğretmen/öğrenci filtresini temizleyin." />
        )
      ) : null}

      {tab === "donemsel" && periodicRes?.ok ? (
        periodicRows.length > 0 ? (
          <Card className="!p-0">
            <ul className="divide-y divide-[var(--color-border)]">
              {periodicRows.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/panel/ogrenciler/${p.studentId}/gelisim`} className="font-semibold text-[var(--color-text)] hover:underline">
                        {studentName(p.studentId)}
                      </Link>
                      <ScorePill value={p.overallScore ?? (p.scores ? computeOverallScore(p.scores) : undefined)} />
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {formatDate(p.periodStart)} – {formatDate(p.periodEnd)} · Hazırlayan: {teacherName(p.teacherId) ?? p.teacherSignedName ?? "—"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[var(--color-text)]">{snippet(p.overallProgressNote)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Link href={`/degerlendirme/rapor/${p.studentId}?donem=${p.id}`} className={ghostBtn}>
                      Gör
                    </Link>
                    <Link href={`/degerlendirme/rapor/${p.studentId}?donem=${p.id}&yazdir=1`} target="_blank" className={primaryBtn}>
                      PDF
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState title="Bu filtrede 4 haftalık rapor yok" description="Tarih aralığını genişletin veya öğretmen/öğrenci filtresini temizleyin." />
        )
      ) : null}

      {tab === "degerlendirme" ? (
        <div className="space-y-4">
          {feedback.length > 0 ? (
            <Card className="!p-0">
              <ul className="divide-y divide-[var(--color-border)]">
                {feedback.map((f) => {
                  const vals = Object.values(f.scores ?? {}) as number[];
                  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined;
                  return (
                    <li key={f.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link href={`/panel/ogretmenler/${f.teacherId}/geri-bildirim`} className="text-sm font-semibold text-[var(--color-text)] hover:underline">
                          {teacherName(f.teacherId) ?? "—"}
                        </Link>
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {SOURCE_LABEL[f.submitterRole] ?? "Öğrenci/veli"} · {formatDateTime(f.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--color-text)]">
                        <ScorePill value={avg} />
                        {f.continueWithTeacher ? <span className="text-xs text-[var(--color-text-muted)]">{CONTINUE_LABEL[f.continueWithTeacher]}</span> : null}
                      </p>
                      {f.comment ? <p className="mt-1 text-sm text-[var(--color-text-muted)]">{snippet(f.comment)}</p> : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : (
            <EmptyState title="Bu aralıkta öğrenci değerlendirmesi yok" description="Aşağıdaki bağlantıyı öğrenci/veliyle paylaşabilirsiniz." />
          )}

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Paylaşılacak bağlantılar</h2>
            <div className="grid gap-2 md:grid-cols-2">
              <CopyLinkField label="Öğretmenler — gelişim raporu formu" url={`${getPublicAppBaseUrl()}/gelisim`} />
              <CopyLinkField label="Öğrenci/veli — öğretmen değerlendirmesi (portal girişi)" url={`${getPublicAppBaseUrl()}/degerlendir`} />
            </div>
            <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
              <p className="text-sm font-medium text-[var(--color-text)]">
                Kişiye özel değerlendirme bağlantısı{" "}
                <span className="font-normal text-[var(--color-text-muted)]">· şifresi olmayan öğrenci/veli için, 14 gün geçerli</span>
              </p>
              <InviteLinkCreator students={activeStudents} />
            </div>
          </Card>
        </div>
      ) : null}

      {totalPages > 1 ? <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} hrefForPage={(p) => qs({ sayfa: String(p) })} /> : null}
    </div>
  );
}
