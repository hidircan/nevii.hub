import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { listTrialLessonsTool } from "@/lib/services";
import { Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { TrialLessonCreateForm } from "@/components/trial-lesson-create-form";
import { TrialLessonsTable, type TrialRow } from "@/components/trial-lessons-table";
import { canRunCriticalActions } from "@/lib/critical-action-password";
import { readData } from "@/lib/store";
import { resolveActorLabels } from "@/lib/contract-payment-plan-view";
import { DEFAULT_APP_TIMEZONE, isoToWallDateTimeInput, toZonedYmd } from "@/lib/timezone";

export const dynamic = "force-dynamic";

/**
 * Deneme dersleri — planlama + geçmiş/gelecek tüm kayıtlar. Her satırda
 * planlayan personel ve (varsa) kayda dönüşüm bilgisi: kim, ne zaman, hangi öğrenci.
 */
export default async function TrialLessonsPage({
  searchParams,
}: {
  searchParams: Promise<{ planlandi?: string; deneme?: string }>;
}) {
  const { planlandi, deneme } = await searchParams;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/deneme");
  }
  if (session.role === "STUDENT") redirect("/login");

  const data = await readData();
  const result = await listTrialLessonsTool(session);
  const trials = result.ok ? result.data.trials : [];
  // Kapsam hatası (ör. atanmış şubesi olmayan şube müdürü) sessizce boş
  // listeye gömülmüyor — kullanıcı NEDEN buton göremediğini anlar.
  const listError = result.ok ? null : result.error.message;

  const names = await resolveActorLabels({
    tenantId: session.tenantId,
    userIds: trials.flatMap((t) => [t.createdBy, t.convertedByUserId, t.resultNotesByUserId]),
    teachers: data.teachers,
  });
  const now = new Date().getTime();
  const rows: TrialRow[] = trials.map((t) => ({
    id: t.id,
    name: t.name,
    phone: t.phone,
    instrument: t.instrument,
    teacherId: t.teacherId,
    teacherName: data.teachers.find((x) => x.id === t.teacherId)?.name ?? "—",
    branchId: t.branchId,
    branchName: data.settings.branches.find((b) => b.id === t.branchId)?.shortName ?? "—",
    startAt: t.startAt,
    dayYmd: toZonedYmd(new Date(t.startAt), DEFAULT_APP_TIMEZONE),
    startLabel: formatDateTime(t.startAt),
    startLocal: isoToWallDateTimeInput(t.startAt),
    notes: t.notes,
    resultNotes: t.resultNotes,
    resultNotesLabel: t.resultNotesAt
      ? `Son güncelleme: ${names.get(t.resultNotesByUserId ?? "") ?? "Bilinmeyen kullanıcı"} · ${formatDateTime(t.resultNotesAt)}`
      : undefined,
    isStarted: new Date(t.startAt).getTime() <= now,
    // 11. tur iş #1 — süresi kayıtlarda olmayan çok eski denemelerde gerçek
    // uzunluk başlangıç-bitiş farkından türetilir; düzenleme formu mevcut
    // değeri "(mevcut kayıt)" olarak korur, sessiz süre değişimi olmaz.
    durationMinutes:
      t.durationMinutes ??
      Math.max(1, Math.round((new Date(t.endAt).getTime() - new Date(t.startAt).getTime()) / 60000)),
    status: t.status,
    createdByName: names.get(t.createdBy) ?? "Bilinmeyen kullanıcı",
    convertedStudentId: t.convertedStudentId,
    convertedStudentName: t.convertedStudentId ? data.students.find((s) => s.id === t.convertedStudentId)?.name : undefined,
    convertedByName: t.convertedByUserId ? names.get(t.convertedByUserId) : undefined,
    convertedAtLabel: t.convertedAt ? formatDateTime(t.convertedAt) : undefined,
    isPast: new Date(t.endAt).getTime() < now,
  }));

  const teachers = data.teachers.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }));
  const branches = data.settings.branches.map((b) => ({ id: b.id, name: b.shortName }));
  const converted = rows.filter((r) => r.convertedStudentId).length;
  const decided = rows.filter((r) => r.isPast && r.status !== "cancelled").length;
  // Şube müdürü revize eder + statü değiştirir; YENİ deneme planlamaz ve
  // kayda dönüştürmez (öğrenci kaydı ayrı yetki — fail-closed).
  const isBranchManager = session.role === "BRANCH_MANAGER";
  const canWriteTrial =
    session.role === "SUPER_ADMIN" ||
    session.role === "SCHOOL_ADMIN" ||
    session.role === "TEACHER" ||
    isBranchManager;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Deneme dersleri"
        description={`${rows.length} deneme · ${converted} kayda dönüştü${decided > 0 ? ` · dönüşüm oranı %${Math.round((converted / decided) * 100)}` : ""}`}
      />
      {!isBranchManager ? (
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-trial)" }}>
            Deneme dersi planla
          </p>
          <TrialLessonCreateForm teachers={teachers} branches={branches} />
        </Card>
      ) : null}
      {listError ? (
        <Card>
          <p role="alert" className="text-sm font-medium" style={{ color: "var(--color-danger)" }}>
            {listError}
          </p>
        </Card>
      ) : null}
      <section>
        <TrialLessonsTable
          key={`${planlandi ?? "list"}:${deneme ?? ""}`}
          rows={rows}
          canWrite={canWriteTrial}
          canConvertTrial={!isBranchManager}
          canDelete={canWriteTrial && canRunCriticalActions(session.role)}
          isTeacher={session.role === "TEACHER"}
          teachers={teachers}
          branches={branches}
          initialPromptTrialId={planlandi}
          initialOpenTrialId={deneme}
        />
      </section>
      <Link href="/panel/program" className="text-sm font-medium text-[var(--color-primary)]">
        ← Ders programı
      </Link>
    </div>
  );
}
