import Link from "@/components/link";
import { redirect } from "next/navigation";
import { Music } from "lucide-react";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedReferenceData } from "@/lib/institution/context";
import { resolveActiveInstrumentNames } from "@/lib/instrument-catalog";
import { listCurriculumForStudentTool } from "@/lib/services";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { CurriculumTopicForm } from "@/components/curriculum-topic-form";
import { CurriculumTopicUpdateForm } from "@/components/curriculum-topic-update-form";
import { CurriculumBulkAssignWizard, type BulkStudentOption } from "@/components/curriculum-bulk-assign-wizard";
import { Badge, Card, EmptyState, PageHeader, Select } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import type { StudentCurriculumTopic } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Yönetici müfredat ekranı — enstrüman seçilir, o enstrümandaki öğrenciler
 * listelenir, bir öğrenci seçilince mevcut per-öğrenci konu formu/listesi
 * (aynı bileşenler /ogretmen/ogrenciler/[studentId] ile paylaşılır) burada
 * gösterilir. Silme desteklenmiyor — mevcut curriculum API'sinde DELETE yok.
 */
export default async function PanelMufredatPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; instrument?: string; studentId?: string }>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/mufredat");
  }

  const kurum = await getInstitutionContext(session);
  const data = await readScopedReferenceData(kurum.scope);
  const canWrite = kurum.scope.mode === "single";

  const instruments =
    kurum.scope.mode === "single"
      ? await resolveActiveInstrumentNames(kurum.scope.tenantId)
      : Array.from(new Set(data.students.flatMap((s) => s.instruments))).sort((a, b) =>
          a.localeCompare(b, "tr")
        );

  const { tab: tabParam, instrument: instrumentParam, studentId: studentIdParam } = await searchParams;
  const tab = tabParam === "bulk" ? "bulk" : "single";
  const instrument = instrumentParam && instruments.includes(instrumentParam) ? instrumentParam : instruments[0];

  const students = instrument
    ? data.students
        .filter((s) => s.active && (s.instruments as string[]).includes(instrument))
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
    return qs ? `/panel/mufredat?${qs}` : "/panel/mufredat";
  }

  const branchNameById = new Map(data.settings.branches.map((b) => [b.id, b.name]));
  const teacherNameById = new Map(data.teachers.map((t) => [t.id, t.name]));
  const bulkStudents: BulkStudentOption[] = data.students.map((s) => ({
    id: s.id,
    name: s.name,
    teacherId: s.teacherId,
    teacherName: teacherNameById.get(s.teacherId) ?? "—",
    instruments: s.instruments as string[],
    level: s.level ?? "",
    branchId: s.branchId,
    branchName: branchNameById.get(s.branchId) ?? s.branchId,
    active: s.active,
  }));
  const bulkTeachers = data.teachers.map((t) => ({ id: t.id, name: t.name }));

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "page", label: "Müfredat" }} />
      <PageHeader
        title="Müfredat"
        description="Enstrümana göre öğrenci müfredat konularını yönetin."
      />

      <div className="mb-4 flex gap-2">
        <Link
          href={`/panel/mufredat?tab=single${instrument ? `&instrument=${encodeURIComponent(instrument)}` : ""}`}
          className={`rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium ${
            tab === "single" ? "bg-[var(--color-primary)] text-white" : "border border-[var(--color-border)] text-[var(--color-text)]"
          }`}
        >
          Tek öğrenci
        </Link>
        <Link
          href="/panel/mufredat?tab=bulk"
          className={`rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium ${
            tab === "bulk" ? "bg-[var(--color-primary)] text-white" : "border border-[var(--color-border)] text-[var(--color-text)]"
          }`}
        >
          Toplu atama
        </Link>
      </div>

      {tab === "bulk" ? (
        canWrite ? (
          <CurriculumBulkAssignWizard students={bulkStudents} teachers={bulkTeachers} showTeacherFilter />
        ) : (
          <EmptyState
            title="Toplu atama bu görünümde yapılamaz"
            description="'Tüm kurumlar' birleşik görünümünde yazma işlemleri kapalıdır. Tek bir kurum seçin."
          />
        )
      ) : (
        <>
      <Card className="mb-4 !p-4">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          Enstrüman
        </label>
        {instruments.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Bu kurumda tanımlı enstrüman yok.</p>
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
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)]"
            >
              Uygula
            </button>
          </form>
        )}
      </Card>

      {instrument ? (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <Card className="!p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              <Music className="h-3.5 w-3.5" aria-hidden /> {instrument} · {students.length} öğrenci
            </p>
            {students.length === 0 ? (
              <EmptyState
                title="Bu enstrüman için henüz müfredat konusu yok."
                description="Bu enstrümana kayıtlı aktif öğrenci bulunmuyor."
              />
            ) : (
              <div className="space-y-1.5">
                {students.map((s) => (
                  <Link key={s.id} href={hrefFor({ studentId: s.id })} className="block">
                    <div
                      className={`rounded-[var(--radius-md)] border px-3 py-2 text-sm ${
                        selectedStudent?.id === s.id
                          ? "border-[var(--color-primary)] bg-[var(--color-surface-muted)] font-medium"
                          : "border-transparent hover:border-[var(--color-border)]"
                      }`}
                    >
                      {s.name}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <div>
            {!selectedStudent ? (
              <EmptyState
                title="Bir öğrenci seçin"
                description="Müfredat konularını görüntülemek/düzenlemek için soldan bir öğrenci seçin."
              />
            ) : (
              <>
                <Card className="mb-3 !p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--color-text)]">{selectedStudent.name}</p>
                    <p className="text-lg font-semibold text-[var(--color-primary)]" aria-label="Genel ilerleme">
                      %{curriculumOverall}
                    </p>
                  </div>
                </Card>

                {canWrite ? (
                  <Card className="mb-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                      Yeni konu ekle
                    </p>
                    <CurriculumTopicForm studentId={selectedStudent.id} />
                  </Card>
                ) : null}

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
                            <p className="font-medium text-[var(--color-text)]">{topic.title}</p>
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
                            <p className="mt-1 text-sm font-semibold text-[var(--color-primary)]">
                              %{topic.progressPercent}
                            </p>
                          </div>
                        </div>
                        {canWrite ? (
                          <CurriculumTopicUpdateForm
                            topicId={topic.id}
                            currentStatus={topic.status}
                          />
                        ) : null}
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}
      </>
      )}
    </div>
  );
}
