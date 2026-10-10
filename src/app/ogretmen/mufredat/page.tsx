import Link from "@/components/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Music } from "lucide-react";
import { readReferenceData } from "@/lib/store";
import { requireSessionContext } from "@/lib/auth/session";
import { ownStudents } from "@/lib/teacher-portal-scope";
import { listCurriculumForStudentTool } from "@/lib/services";
import { CurriculumTopicForm } from "@/components/curriculum-topic-form";
import { CurriculumTopicUpdateForm } from "@/components/curriculum-topic-update-form";
import { CurriculumBulkAssignWizard, type BulkStudentOption } from "@/components/curriculum-bulk-assign-wizard";
import { Badge, Card, EmptyState, Select } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import type { StudentCurriculumTopic } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Öğretmen müfredat ekranı — yalnızca kendi öğrencileri (ownStudents),
 * enstrümana göre filtrelenir. Seçilen öğrencinin konu formu/listesi
 * /ogretmen/ogrenciler/[studentId] ile aynı bileşenleri paylaşır.
 */
export default async function OgretmenMufredatPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; instrument?: string; studentId?: string }>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogretmen/mufredat");
  }
  if (session.role !== "TEACHER") redirect("/ogretmen");

  const data = await readReferenceData();
  const teacherId = session.teacherId || "t2";
  const myStudents = ownStudents(data.students, teacherId).filter((s) => s.active);

  const instruments: string[] = Array.from(new Set(myStudents.flatMap((s) => s.instruments))).sort((a, b) =>
    a.localeCompare(b, "tr")
  );

  const { tab: tabParam, instrument: instrumentParam, studentId: studentIdParam } = await searchParams;
  const tab = tabParam === "bulk" ? "bulk" : "single";
  const instrument = instrumentParam && instruments.includes(instrumentParam) ? instrumentParam : instruments[0];

  const students = instrument
    ? myStudents
        .filter((s) => (s.instruments as string[]).includes(instrument))
        .sort((a, b) => a.name.localeCompare(b.name, "tr"))
    : [];

  const selectedStudent = studentIdParam ? students.find((s) => s.id === studentIdParam) : undefined;

  let curriculumTopics: StudentCurriculumTopic[] = [];
  let curriculumOverall = 0;
  if (selectedStudent) {
    const res = await listCurriculumForStudentTool(session, { studentId: selectedStudent.id });
    if (res.ok) {
      curriculumTopics = res.data.topics as StudentCurriculumTopic[];
      curriculumOverall = res.data.overallPercent;
    }
  }

  function hrefFor(next: { instrument?: string; studentId?: string }) {
    const params = new URLSearchParams();
    const i = next.instrument ?? instrument;
    if (i) params.set("instrument", i);
    if (next.studentId) params.set("studentId", next.studentId);
    const qs = params.toString();
    return qs ? `/ogretmen/mufredat?${qs}` : "/ogretmen/mufredat";
  }

  const branchNameById = new Map(data.settings.branches.map((b) => [b.id, b.name]));
  const bulkStudents: BulkStudentOption[] = myStudents.map((s) => ({
    id: s.id,
    name: s.name,
    teacherId: s.teacherId,
    teacherName: "",
    instruments: s.instruments as string[],
    level: s.level ?? "",
    branchId: s.branchId,
    branchName: branchNameById.get(s.branchId) ?? s.branchId,
    active: s.active,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-slate-50">
      <header className="border-b border-cyan-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto max-w-lg px-4 py-4">
          <Link
            href="/ogretmen"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-muted)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Geri
          </Link>
          <div className="mt-2 flex items-center gap-2">
            <Music className="h-5 w-5 text-cyan-700" aria-hidden />
            <h1 className="text-xl font-semibold text-[var(--color-text)] dark:text-slate-50">Müfredat</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-24">
        <div className="flex gap-2">
          <Link
            href={`/ogretmen/mufredat?tab=single${instrument ? `&instrument=${encodeURIComponent(instrument)}` : ""}`}
            className={`rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium ${
              tab === "single" ? "bg-cyan-600 text-white" : "border border-[var(--color-border)] text-[var(--color-text)]"
            }`}
          >
            Tek öğrenci
          </Link>
          <Link
            href="/ogretmen/mufredat?tab=bulk"
            className={`rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium ${
              tab === "bulk" ? "bg-cyan-600 text-white" : "border border-[var(--color-border)] text-[var(--color-text)]"
            }`}
          >
            Toplu atama
          </Link>
        </div>

        {tab === "bulk" ? (
          <CurriculumBulkAssignWizard students={bulkStudents} teachers={[]} showTeacherFilter={false} />
        ) : instruments.length === 0 ? (
          <EmptyState title="Aktif öğrenciniz yok" description="Enstrüman seçimi için önce aktif öğrenciniz olmalı." />
        ) : (
          <form method="get" className="flex flex-wrap gap-2">
            <Select name="instrument" defaultValue={instrument}>
              {instruments.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </Select>
            <button
              type="submit"
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] dark:text-slate-50"
            >
              Uygula
            </button>
          </form>
        )}

        {instrument ? (
          <>
            <Card className="!p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                {instrument} · {students.length} öğrenci
              </p>
              {students.length === 0 ? (
                <EmptyState title="Bu enstrüman için henüz müfredat konusu yok." />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {students.map((s) => (
                    <Link key={s.id} href={hrefFor({ studentId: s.id })}>
                      <span
                        className={`inline-block rounded-full border px-3 py-1 text-xs ${
                          selectedStudent?.id === s.id
                            ? "border-cyan-600 bg-cyan-50 font-medium text-cyan-700"
                            : "border-[var(--color-border)] text-[var(--color-text)]"
                        }`}
                      >
                        {s.name}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            {selectedStudent ? (
              <>
                <Card className="!p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">
                      {selectedStudent.name}
                    </p>
                    <p className="text-lg font-semibold text-cyan-800" aria-label="Genel ilerleme">
                      %{curriculumOverall}
                    </p>
                  </div>
                </Card>

                <Card>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-cyan-600">Yeni konu ekle</p>
                  <CurriculumTopicForm studentId={selectedStudent.id} />
                </Card>

                {curriculumTopics.length === 0 ? (
                  <EmptyState
                    title="Bu enstrüman için henüz müfredat konusu yok."
                    description="Yukarıdan bu öğrenci için konu ekleyebilirsiniz."
                  />
                ) : (
                  <div className="space-y-2">
                    {curriculumTopics.map((topic) => (
                      <Card key={topic.id} className="!p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-[var(--color-text)] dark:text-slate-50">{topic.title}</p>
                            {topic.description ? (
                              <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{topic.description}</p>
                            ) : null}
                            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                              Son güncelleme: {formatDateTime(topic.updatedAt)}
                            </p>
                            {topic.notes ? (
                              <p className="mt-1 text-xs text-[var(--color-text-muted)]">Not: {topic.notes}</p>
                            ) : null}
                          </div>
                          <div className="text-right">
                            <Badge status={topic.status}>{topic.status}</Badge>
                            <p className="mt-1 text-sm font-semibold text-cyan-700">%{topic.progressPercent}</p>
                          </div>
                        </div>
                        <CurriculumTopicUpdateForm
                          topicId={topic.id}
                          currentStatus={topic.status}
                        />
                      </Card>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
