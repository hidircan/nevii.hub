import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { StudentArchiveToggle } from "@/components/student-archive-toggle";
import { StudentDetailTabs } from "@/components/student-detail-tabs";
import { QuickTaskLink } from "@/components/quick-task-link";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { effectiveStudentTypes } from "@/lib/student-types";
import { formatDate } from "@/lib/utils";
import { loadStudentPageContext } from "./_context";

export const dynamic = "force-dynamic";

/**
 * Öğrenci detayı — tüm sekmelerin paylaştığı kimlik başlığı ve navigasyon.
 * Sekme içeriği `children` olarak gelir; her sekme kendi verisini kendisi
 * okur (bkz. `_context.ts` — istek başına tek okuma).
 */
export default async function StudentDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  let ctx;
  try {
    ctx = await loadStudentPageContext(studentId);
  } catch {
    redirect(`/login?next=/panel/ogrenciler/${studentId}`);
  }
  const { kurum, data, student } = ctx;

  if (!student) {
    return (
      <div>
        <PageHeader title="Öğrenci bulunamadı" />
        <EmptyState
          title="Öğrenci bulunamadı"
          description="Bu kayıt mevcut kurum/şube kapsamınızda değil veya kaldırılmış olabilir."
        />
        <Link
          href="/panel/ogrenciler"
          className="mt-4 inline-block text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
        >
          ← Öğrencilere dön
        </Link>
      </div>
    );
  }

  const teacher = data.teachers.find((t) => t.id === student.teacherId);
  const branch = data.settings.branches.find((b) => b.id === student.branchId);

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "student", id: student.id, label: student.name }} />
      <BackButton fallbackHref="/panel/ogrenciler" label="Öğrencilere dön" className="mb-3" />
      <PageHeader
        title={student.name}
        description={`${student.displayId ? `${student.displayId} · ` : ""}${branch?.shortName ?? "—"} · ${
          student.packageName.split("—")[0]?.trim() ?? student.packageName
        }`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <QuickTaskLink
              relatedEntityType="student"
              relatedEntityId={student.id}
              relatedEntityLabel={student.name}
              title={`Öğrenci takibi — ${student.name}`}
              label="Bu öğrenci için görev oluştur"
              returnTo={`/panel/ogrenciler/${student.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-bg)]"
            />
            <StudentArchiveToggle studentId={student.id} active={student.active} />
          </div>
        }
      />

      <Card className="mb-4 !p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge status={student.active ? "confirmed" : "cancelled"}>{student.active ? "Aktif" : "Pasif"}</Badge>
          {effectiveStudentTypes(student).map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
          {student.educationMethod ? <Badge>{student.educationMethod}</Badge> : null}
          <span className="text-[var(--color-text-muted)]">
            Öğretmen: {teacher?.name ?? "—"} · Kayıt:{" "}
            {student.enrollmentStartDate ? formatDate(student.enrollmentStartDate) : formatDate(student.createdAt)}
          </span>
        </div>
        {/*
          MT-003 — bu ekranda öğretmen/enstrüman DEĞİŞTİRİLEMEZ; burada yalnızca
          kayıt zamanında geçerli olan atamanın artık geçersiz hâle geldiğini
          açık Türkçe uyarıyla göstererek sessiz veri kaybını önlüyoruz.
        */}
        {teacher && (!teacher.active || !student.instruments.some((i) => teacher.instruments.includes(i))) ? (
          <p
            className="mt-2 rounded-md px-3 py-2 text-xs font-medium"
            style={{ background: "var(--color-warning-soft)", color: "var(--color-warning)" }}
          >
            {!teacher.active
              ? `Uyarı: atanmış öğretmen "${teacher.name}" artık pasif.`
              : `Uyarı: atanmış öğretmen "${teacher.name}" artık "${student.instruments.join(", ")}" enstrümanını öğretmiyor.`}{" "}
            Devam etmeden önce Öğretmenler ekranından uygunluğu kontrol edin.
          </p>
        ) : null}
      </Card>

      <StudentDetailTabs studentId={student.id} />

      {children}
    </div>
  );
}
