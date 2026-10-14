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
import { Card, EmptyState, PageHeader, Pagination, StatCard } from "@/components/ui";
import { CopyLinkField, InviteLinkCreator } from "@/components/reports/invite-link-button";

export const dynamic = "force-dynamic";

type Tab = "gelisim" | "donemsel" | "degerlendirme";
const TABS: { id: Tab; label: string }[] = [
  { id: "gelisim", label: "Ders gelişimi" },
  { id: "donemsel", label: "4 haftalık" },
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
const snippet = (s: string | undefined, n = 110) => (s && s.length > n ? `${s.slice(0, n)}…` : (s ?? ""));

/**
 * Rapor portalı (2026-10-14) — yönetici takip ekranı: ders gelişimi, 4 haftalık ve öğrenci değerlendirmeleri; filtreli,
 * sayfalı. Öğrenci değerlendirmelerinde öğrenci kimliği MASKELİ (mevcut inceleme kuralı; açma gerekçeli/audit'li).
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ sekme?: string; ogretmen?: string; ogrenci?: string; bas?: string; bit?: string; sayfa?: string }>;
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

  const [ref, lessonRes, periodicRes, feedbackRes, overview] = await Promise.all([
    readReferenceData(),
    listLessonAssessmentsForAdminTool(session, { ...filter, page: tab === "gelisim" ? page : 1, pageSize: tab === "gelisim" ? PAGE_SIZE : 5 }),
    listPeriodicAssessmentsForAdminTool(session, { ...filter, page: tab === "donemsel" ? page : 1, pageSize: tab === "donemsel" ? PAGE_SIZE : 5 }),
    listTeacherFeedbackForReviewTool(session, { teacherId: filter.teacherId, from: filter.from, to: filter.to }),
    getReportsOverviewTool(session),
  ]);
  const teacherName = (id: string) => ref.teachers.find((t) => t.id === id)?.name ?? "—";
  const studentName = (id: string) => ref.students.find((s) => s.id === id)?.name ?? "—";
  const feedback = feedbackRes.ok ? feedbackRes.data.feedback : [];
  const totals = {
    gelisim: lessonRes.ok ? lessonRes.data.total : 0,
    donemsel: periodicRes.ok ? periodicRes.data.total : 0,
    degerlendirme: feedback.length,
  };
  const totalPages = Math.max(1, Math.ceil(totals[tab] / PAGE_SIZE));
  const ov = overview.ok ? overview.data : { pendingByTeacher: [], pendingTotal: 0, activeInvites: 0 };

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { sekme: tab, ogretmen: sp.ogretmen, ogrenci: sp.ogrenci, bas, bit, ...patch };
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
        title="Raporlar"
        description="Öğretmenlerin gelişim raporları ve öğrencilerin öğretmen değerlendirmeleri. Her yeni gönderimde bildirim alırsınız."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ders gelişimi" value={totals.gelisim} hint={`${formatDate(dayStartIso(bas))} – ${formatDate(dayEndIso(bit))}`} />
        <StatCard label="4 haftalık" value={totals.donemsel} hint="Seçili tarih aralığı" />
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

      <form method="get" action="/panel/raporlar" className="grid gap-2 sm:grid-cols-5">
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
          <span className="flex items-center text-xs text-[var(--color-text-muted)]">Öğrenci kimliği gizli</span>
        )}
        <input type="date" name="bas" defaultValue={bas} aria-label="Başlangıç" className="min-h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm" />
        <input type="date" name="bit" defaultValue={bit} aria-label="Bitiş" className="min-h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm" />
        <button type="submit" className="min-h-10 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 text-sm font-medium text-white">
          Uygula
        </button>
      </form>

      {tab === "gelisim" ? (
        lessonRes.ok && lessonRes.data.rows.length > 0 ? (
          <ul className="space-y-2">
            {lessonRes.data.rows.map((a) => (
              <li key={a.id}>
                <Card className="!p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`/panel/ogrenciler/${a.studentId}/gelisim`} className="text-sm font-semibold text-[var(--color-text)] hover:underline">
                      {studentName(a.studentId)}
                    </Link>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {teacherName(a.teacherId)} · {formatDateTime(a.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-text)]">
                    Genel puan <span className="font-semibold tabular-nums">{computeOverallScore(a).toFixed(1)}</span>/5
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{snippet(a.strengthNote)}</p>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Bu aralıkta ders gelişim raporu yok" description="Tarih aralığını genişletin veya filtreyi temizleyin." />
        )
      ) : null}

      {tab === "donemsel" ? (
        periodicRes.ok && periodicRes.data.rows.length > 0 ? (
          <ul className="space-y-2">
            {periodicRes.data.rows.map((p) => (
              <li key={p.id}>
                <Card className="!p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`/panel/ogrenciler/${p.studentId}/gelisim`} className="text-sm font-semibold text-[var(--color-text)] hover:underline">
                      {studentName(p.studentId)}
                    </Link>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {teacherName(p.teacherId)} · {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{snippet(p.overallProgressNote)}</p>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Bu aralıkta 4 haftalık değerlendirme yok" description="Tarih aralığını genişletin veya filtreyi temizleyin." />
        )
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
