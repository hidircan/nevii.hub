import Link from "@/components/link";
import { redirect } from "next/navigation";
import { requireSessionContext, homePathForRole } from "@/lib/auth/session";
import { readReferenceData } from "@/lib/store";
import { getAssessmentTool } from "@/lib/services";
import {
  ASSESSMENT_SECTIONS,
  ASSESSMENT_ITEM_LABELS,
  computeOverallScore,
  computeSectionScore,
} from "@/lib/assessment/score";
import { printSurfaceCss } from "@/lib/contract-print-theme";
import { reportInstitutionName } from "@/lib/reports/identity";
import { formatDate } from "@/lib/utils";
import { AssessmentActions } from "@/components/assessment-actions";

export const dynamic = "force-dynamic";

function NoticeScreen({ title, description, backHref }: { title: string; description: string; backHref: string }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center">
      <p className="text-lg font-semibold text-[var(--color-text)]">{title}</p>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{description}</p>
      <Link href={backHref} className="mt-6 inline-block text-sm font-medium text-[var(--color-primary)] hover:underline">
        Geri dön
      </Link>
    </div>
  );
}

export default async function AssessmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ assessmentId: string }>;
  searchParams?: Promise<{ yazdir?: string }>;
}) {
  const { assessmentId } = await params;
  const sp = searchParams ? await searchParams : {};

  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/degerlendirme/${assessmentId}`);
  }

  const isStaff = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
  const backHref = isStaff ? "/panel/raporlar?sekme=gelisim" : homePathForRole(session.role);
  const backLabel = isStaff ? "Raporlara dön" : "Geri dön";

  const result = await getAssessmentTool(session, { assessmentId });
  if (!result.ok) {
    return (
      <NoticeScreen
        title="Değerlendirme bulunamadı."
        description="Bu kayıt silinmiş olabilir veya erişim yetkiniz yok."
        backHref={backHref}
      />
    );
  }
  const assessment = result.data.assessment;

  const data = await readReferenceData();
  const institutionName = reportInstitutionName(data.settings);
  const student = data.students.find((s) => s.id === assessment.studentId);
  const teacher = data.teachers.find((t) => t.id === assessment.teacherId);
  const branch = student ? data.settings.branches.find((b) => b.id === student.branchId) : undefined;
  const overall = computeOverallScore(assessment);

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
                Öğrenci Ders Gelişim Değerlendirme Raporu
              </h1>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Hazırlayan: {teacher?.name ?? assessment.teacherSignedName ?? "—"} · Düzenlenme: {formatDate(assessment.createdAt, "d MMMM yyyy")} · Rapor No: {assessment.id}
              </p>
            </div>
            <div className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-2.5 text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Genel Puan
              </p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums text-[var(--color-text)]">
                {overall.toFixed(1)} <span className="text-sm font-normal text-[var(--color-text-muted)]">/ 5.0</span>
              </p>
            </div>
          </header>

          {/* Öğrenci ve Öğretmen Künyesi */}
          <section className="mt-5 grid grid-cols-2 gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)]/60 p-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Öğrenci</p>
              <p className="mt-0.5 font-semibold text-[var(--color-text)]">{student?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Hazırlayan öğretmen</p>
              <p className="mt-0.5 font-medium text-[var(--color-text)]">{teacher?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Branş / Enstrüman</p>
              <p className="mt-0.5 text-[var(--color-text)]">
                {student?.instruments?.length ? student.instruments.join(", ") : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Değerlendirme Tarihi</p>
              <p className="mt-0.5 text-[var(--color-text)]">{formatDate(assessment.createdAt, "d MMMM yyyy")}</p>
            </div>
          </section>

          {/* Bölüm Bazlı ve Detaylı Puan Tablosu */}
          <section className="mt-6 print:break-inside-avoid">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              1. Gelişim Kriterleri ve Puan Tablosu (1–5 Ölçeği)
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Bölüm</th>
                  <th>Değerlendirme Kriteri</th>
                  <th className="num">Kriter Puanı</th>
                  <th className="num">Bölüm Ortalaması</th>
                </tr>
              </thead>
              <tbody>
                {ASSESSMENT_SECTIONS.map((section) => {
                  const secScore = computeSectionScore(assessment, section.id);
                  return section.items.map((item, idx) => (
                    <tr key={item}>
                      {idx === 0 ? (
                        <td rowSpan={section.items.length} className="font-semibold">
                          {section.id}. {section.label}
                        </td>
                      ) : null}
                      <td>{ASSESSMENT_ITEM_LABELS[item]}</td>
                      <td className="num font-semibold">{assessment[item]} / 5</td>
                      {idx === 0 ? (
                        <td rowSpan={section.items.length} className="num font-bold">
                          {secScore.toFixed(1)} / 5
                        </td>
                      ) : null}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </section>

          {/* Çalışılan Konular */}
          {assessment.piecesWorked || assessment.etudesWorked || assessment.technicalWork || assessment.theoryWork ? (
            <section className="mt-6 print:break-inside-avoid">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                2. Derste Çalışılan Konular ve Repertuvar
              </h2>
              <table>
                <tbody>
                  {assessment.piecesWorked ? (
                    <tr>
                      <th className="w-48">İşlenen Parçalar</th>
                      <td>{assessment.piecesWorked}</td>
                    </tr>
                  ) : null}
                  {assessment.etudesWorked ? (
                    <tr>
                      <th className="w-48">İşlenen Etütler</th>
                      <td>{assessment.etudesWorked}</td>
                    </tr>
                  ) : null}
                  {assessment.technicalWork ? (
                    <tr>
                      <th className="w-48">Teknik Çalışmalar</th>
                      <td>{assessment.technicalWork}</td>
                    </tr>
                  ) : null}
                  {assessment.theoryWork ? (
                    <tr>
                      <th className="w-48">Teorik / Pratik Konular</th>
                      <td>{assessment.theoryWork}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </section>
          ) : null}

          {/* Pedagojik Değerlendirme Notları */}
          <section className="mt-6 space-y-3 print:break-inside-avoid">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              3. Öğretmen Pedagojik Değerlendirmesi
            </h2>
            <div className="grid gap-3">
              <div className="rounded-md border border-[var(--color-border)] p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Güçlü Yönler
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-text)]">{assessment.strengthNote}</p>
              </div>
              <div className="rounded-md border border-[var(--color-border)] p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Gelişime Açık Alanlar
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-text)]">{assessment.improvementNote}</p>
              </div>
              <div className="rounded-md border border-[var(--color-border)] p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Sonraki Adımlar ve Çalışma Planı
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-text)]">{assessment.nextStepsNote}</p>
              </div>
              {assessment.parentPrivateNote ? (
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Veli / Yönetici Bilgilendirme Notu
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-text)]">
                    {assessment.parentPrivateNote}
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          {/* İmza ve Onay */}
          <footer className="mt-10 flex items-end justify-between border-t border-[var(--color-border)] pt-6 print:break-inside-avoid">
            <div className="text-xs text-[var(--color-text-muted)]">
              <p className="font-medium text-[var(--color-text)]">{institutionName}</p>
              <p className="mt-0.5">Bu resmi gelişim raporu Nevii Hub üzerinden onaylanarak oluşturulmuştur.</p>
            </div>
            <div className="min-w-[220px] text-center">
              <p className="text-sm font-semibold text-[var(--color-text)]">{assessment.teacherSignedName}</p>
              <div className="mt-6 border-b border-[var(--color-border)]" />
              <p className="mt-1.5 text-xs font-medium text-[var(--color-text-muted)]">
                Öğretmen Onayı · {formatDate(assessment.teacherSignedAt, "d MMMM yyyy")}
              </p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
