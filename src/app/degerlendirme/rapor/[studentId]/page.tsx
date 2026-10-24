import Link from "@/components/link";
import { redirect } from "next/navigation";
import { requireSessionContext, homePathForRole } from "@/lib/auth/session";
import { readReferenceData } from "@/lib/store";
import { getAssessmentReportTool, listPeriodicAssessmentsForStudentTool } from "@/lib/services";
import {
  ASSESSMENT_ITEM_LABELS,
  ASSESSMENT_SECTIONS,
  computeOverallScore,
  computeSectionScore,
} from "@/lib/assessment/score";
import { printSurfaceCss } from "@/lib/contract-print-theme";
import { reportInstitutionName } from "@/lib/reports/identity";
import { formatDate, formatDateTime } from "@/lib/utils";
import { AssessmentActions } from "@/components/assessment-actions";

export const dynamic = "force-dynamic";

export default async function AssessmentReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams?: Promise<{ donem?: string; yazdir?: string }>;
}) {
  const { studentId } = await params;
  const sp = searchParams ? await searchParams : {};

  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/degerlendirme/rapor/${studentId}`);
  }

  const isStaff = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
  const backHref = isStaff
    ? sp.donem
      ? "/panel/raporlar?sekme=donemsel"
      : "/panel/raporlar"
    : homePathForRole(session.role);
  const backLabel = isStaff ? "Raporlara dön" : "Geri dön";

  const result = await getAssessmentReportTool(session, { studentId });
  if (!result.ok) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <p className="text-lg font-semibold text-[var(--color-text)]">Rapor oluşturulamadı.</p>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Bu öğrenciye erişim yetkiniz olmayabilir.</p>
        <Link href={backHref} className="mt-6 inline-block text-sm font-medium text-[var(--color-primary)] hover:underline">
          {backLabel}
        </Link>
      </div>
    );
  }

  const data = await readReferenceData();
  const institutionName = reportInstitutionName(data.settings);
  const student = data.students.find((s) => s.id === studentId);
  const branch = student ? data.settings.branches.find((b) => b.id === student.branchId) : undefined;
  const teacherName = (tid: string) => data.teachers.find((t) => t.id === tid)?.name ?? "—";

  const { assessments, trend } = result.data;
  const periodicResult = await listPeriodicAssessmentsForStudentTool(session, { studentId });
  const allPeriodic = periodicResult.ok ? periodicResult.data.assessments : [];
  const periodicAssessments = sp.donem
    ? allPeriodic.filter((p) => p.id === sp.donem || p.periodStart === sp.donem)
    : allPeriodic;

  const focusedPeriodic = sp.donem && periodicAssessments.length === 1 ? periodicAssessments[0] : undefined;
  const headerScore =
    focusedPeriodic?.overallScore ??
    (focusedPeriodic?.scores ? computeOverallScore(focusedPeriodic.scores) : undefined) ??
    (assessments[0] ? computeOverallScore(assessments[0]) : undefined);

  return (
    <div className="print-light-palette min-h-screen bg-[#f4f2f8] px-4 py-8 print:bg-white print:p-0 sm:px-6">
      <style>{`@media print { @page { size: A4; margin: 12mm; } }${printSurfaceCss("doc-print-surface")}`}</style>
      <div className="mx-auto max-w-3xl">
        <AssessmentActions backHref={backHref} backLabel={backLabel} autoPrint={sp.yazdir === "1"} />

        <div className="doc-print-surface rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
          {/* Kurumsal Başlık */}
          <header className="flex items-start justify-between gap-4 border-b-2 border-[var(--color-border)] pb-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                {institutionName}
                {branch ? ` · ${branch.name}` : ""}
              </p>
              <h1 className="mt-1 text-xl font-bold text-[var(--color-text)]">
                {focusedPeriodic
                  ? "4 Haftalık Gelişim Raporu"
                  : "Öğrenci Bütüncül Gelişim ve Dönem Raporu"}
              </h1>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                {focusedPeriodic
                  ? `Dönem: ${formatDate(focusedPeriodic.periodStart)} – ${formatDate(focusedPeriodic.periodEnd)} · Hazırlayan: ${teacherName(focusedPeriodic.teacherId)} · ${formatDate(focusedPeriodic.approvedAt ?? focusedPeriodic.submittedAt, "d MMMM yyyy")}`
                  : `Rapor Tarihi: ${formatDate(new Date().toISOString(), "d MMMM yyyy")}`}
              </p>
            </div>
            {headerScore !== undefined ? (
              <div className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-2.5 text-right">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Dönem Puanı
                </p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-[var(--color-text)]">
                  {headerScore.toFixed(1)}{" "}
                  <span className="text-sm font-normal text-[var(--color-text-muted)]">/ 5.0</span>
                </p>
              </div>
            ) : null}
          </header>

          {/* Öğrenci Künyesi */}
          <section className="mt-5 grid grid-cols-2 gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)]/60 p-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Öğrenci</p>
              <p className="mt-0.5 font-semibold text-[var(--color-text)]">{student?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Hazırlayan öğretmen</p>
              <p className="mt-0.5 font-medium text-[var(--color-text)]">
                {focusedPeriodic
                  ? teacherName(focusedPeriodic.teacherId)
                  : student
                    ? teacherName(student.teacherId)
                    : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Branş / Enstrüman</p>
              <p className="mt-0.5 text-[var(--color-text)]">
                {student?.instruments?.length ? student.instruments.join(", ") : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Durum</p>
              <p className="mt-0.5 font-semibold text-[var(--color-text)]">Onaylandı</p>
            </div>
          </section>

          {/* 4 Haftalık / 4 Derslik Raporlar */}
          {periodicAssessments.length > 0 ? (
            <div className="mt-6 space-y-8">
              {periodicAssessments.map((pa) => {
                const paScore = pa.overallScore ?? (pa.scores ? computeOverallScore(pa.scores) : undefined);
                return (
                  <section key={pa.id} className="space-y-5 border-t border-[var(--color-border)] pt-6 first:border-t-0 first:pt-0 print:break-inside-avoid">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <h2 className="text-base font-bold text-[var(--color-text)]">
                          4 Derslik Dönem: {formatDate(pa.periodStart)} – {formatDate(pa.periodEnd)}
                        </h2>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          Öğretmen: {pa.teacherSignedName || teacherName(pa.teacherId)} · Onay Tarihi:{" "}
                          {formatDate(pa.approvedAt ?? pa.submittedAt, "d MMMM yyyy")}
                        </p>
                      </div>
                      {paScore !== undefined ? (
                        <span className="rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1 text-sm font-bold tabular-nums text-[var(--color-text)]">
                          Dönem Ortalaması: {paScore.toFixed(1)} / 5
                        </span>
                      ) : null}
                    </div>

                    {/* 4 Derslik Özet Tablosu */}
                    {pa.lessonSummaries && pa.lessonSummaries.length > 0 ? (
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                          Dönem İçindeki 4 Dersin Özeti
                        </h3>
                        <table>
                          <thead>
                            <tr>
                              <th>Ders</th>
                              <th>Tarih / Saat</th>
                              <th>Çalışılan Konular & Repertuvar</th>
                              <th>Ders Notu</th>
                              <th className="num">Puan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pa.lessonSummaries.map((ls, idx) => (
                              <tr key={ls.lessonId}>
                                <td className="font-semibold">{idx + 1}. Ders</td>
                                <td>
                                  {formatDateTime(ls.startAt)}
                                  {ls.instrument ? ` (${ls.instrument})` : ""}
                                </td>
                                <td>
                                  {[ls.piecesWorked, ls.etudesWorked, ls.technicalWork, ls.theoryWork]
                                    .filter(Boolean)
                                    .join(" · ") || "—"}
                                </td>
                                <td>{ls.strengthNote || "—"}</td>
                                <td className="num font-semibold">
                                  {ls.overallScore !== undefined ? `${ls.overallScore.toFixed(1)} / 5` : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}

                    {/* Dönem Puan Tablosu */}
                    {pa.scores ? (
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                          4 Haftalık Dönem Puan Kırılımı
                        </h3>
                        <table>
                          <thead>
                            <tr>
                              <th>Bölüm</th>
                              <th>Değerlendirme Kriteri</th>
                              <th className="num">Puan</th>
                              <th className="num">Bölüm Ort.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ASSESSMENT_SECTIONS.map((section) => {
                              const secAvg = computeSectionScore(pa.scores!, section.id);
                              return section.items.map((item, idx) => (
                                <tr key={item}>
                                  {idx === 0 ? (
                                    <td rowSpan={section.items.length} className="font-semibold">
                                      {section.id}. {section.label}
                                    </td>
                                  ) : null}
                                  <td>{ASSESSMENT_ITEM_LABELS[item]}</td>
                                  <td className="num font-semibold">{pa.scores![item]} / 5</td>
                                  {idx === 0 ? (
                                    <td rowSpan={section.items.length} className="num font-bold">
                                      {secAvg.toFixed(1)} / 5
                                    </td>
                                  ) : null}
                                </tr>
                              ));
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : null}

                    {/* Değerlendirme Alanları */}
                    <div className="grid gap-3">
                      <div className="rounded-md border border-[var(--color-border)] p-3.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                          4 Derslik Genel Gelişim Değerlendirmesi
                        </p>
                        <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-text)]">
                          {pa.overallProgressNote}
                        </p>
                      </div>
                      {pa.strengthsNote ? (
                        <div className="rounded-md border border-[var(--color-border)] p-3.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            Öne Çıkan Güçlü Yönler
                          </p>
                          <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-text)]">{pa.strengthsNote}</p>
                        </div>
                      ) : null}
                      {pa.areasForImprovementNote ? (
                        <div className="rounded-md border border-[var(--color-border)] p-3.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            Gelişime Açık Alanlar
                          </p>
                          <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-text)]">
                            {pa.areasForImprovementNote}
                          </p>
                        </div>
                      ) : null}
                      {pa.recommendationNote ? (
                        <div className="rounded-md border border-[var(--color-border)] p-3.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            Sonraki Dönem İçin Hedef ve Öneriler
                          </p>
                          <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-text)]">
                            {pa.recommendationNote}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : null}

          {/* Tekil Ders Değerlendirmeleri ve Trend (Eğer tek bir döneme filtrelenmemişse) */}
          {!focusedPeriodic ? (
            trend.length === 0 && periodicAssessments.length === 0 ? (
              <p className="mt-6 text-sm text-[var(--color-text-muted)]">Henüz değerlendirme kaydı yok.</p>
            ) : assessments.length > 0 ? (
              <section className="mt-8 border-t border-[var(--color-border)] pt-6 print:break-inside-avoid">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Ders Bazlı Gelişim Kayıtları ve Puan Trendi (Son {assessments.length} Ders)
                </h2>
                <table>
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Çalışılan Konular</th>
                      <th>Güçlü Yönler</th>
                      <th>Sonraki Adımlar</th>
                      <th className="num">Genel Puan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assessments.map((a) => (
                      <tr key={a.id}>
                        <td className="whitespace-nowrap font-medium">{formatDate(a.createdAt, "d MMM yyyy")}</td>
                        <td>
                          {[a.piecesWorked, a.etudesWorked, a.technicalWork, a.theoryWork]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </td>
                        <td>{a.strengthNote}</td>
                        <td>{a.nextStepsNote}</td>
                        <td className="num font-bold">{computeOverallScore(a).toFixed(1)} / 5</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null
          ) : null}

          {/* Kurumsal İmza Alanı */}
          <footer className="mt-10 flex items-end justify-between border-t border-[var(--color-border)] pt-6 print:break-inside-avoid">
            <div className="text-xs text-[var(--color-text-muted)]">
              <p className="font-medium text-[var(--color-text)]">{institutionName}</p>
              <p className="mt-0.5">Bu resmi gelişim raporu sistem tarafından oluşturulmuştur.</p>
            </div>
            <div className="min-w-[220px] text-center">
              <p className="text-sm font-semibold text-[var(--color-text)]">
                {focusedPeriodic?.teacherSignedName ||
                  (focusedPeriodic ? teacherName(focusedPeriodic.teacherId) : student ? teacherName(student.teacherId) : "Öğretmen")}
              </p>
              <div className="mt-6 border-b border-[var(--color-border)]" />
              <p className="mt-1.5 text-xs font-medium text-[var(--color-text-muted)]">Öğretmen Onayı ve İmzası</p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
