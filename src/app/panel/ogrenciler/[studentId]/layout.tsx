import { canRunCriticalActions } from "@/lib/critical-action-password";
import Link from "@/components/link";
import { redirect } from "next/navigation";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { StudentArchiveToggle } from "@/components/student-archive-toggle";
import { StudentDeleteDialog, StudentDeletedBanner } from "@/components/student-delete-dialog";
import { StudentDetailTabs } from "@/components/student-detail-tabs";
import { StudentBranchSwitcher } from "@/components/student-branch-switcher";
import { Suspense } from "react";
import { effectiveEnrollments, enrollmentDisplayName, enrollmentTerms } from "@/lib/student-enrollments";
import { QuickTaskLink } from "@/components/quick-task-link";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { effectiveStudentTypes } from "@/lib/student-types";
import { formatDate, formatDateTime } from "@/lib/utils";
import { resolveActorLabel } from "@/lib/contract-payment-plan-view";
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
  const { kurum, data, student, session } = ctx;

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
  // 2026-10-10 — çok branşlı öğrencide başlıkta TEK öğretmen/paket/tür gösterilmez (öğrenci satırı yalnız uyumluluk aynasıdır);
  // her branş kendi öğretmeni ve türüyle listelenir.
  const branchList = effectiveEnrollments(student, data.teachers);
  const multiBranch = branchList.length > 1;
  const branchRows = branchList.map((e) => ({ enrollment: e, terms: enrollmentTerms(student, e, data.teachers), label: enrollmentDisplayName(e, branchList, data.teachers) }));
  const activeBranchRows = branchRows.filter((r) => r.enrollment.active);
  const convertedBy = student.convertedByUserId
    ? await resolveActorLabel({ tenantId: session.tenantId, userId: student.convertedByUserId, teachers: data.teachers })
    : null;
  const createdBy = student.createdByUserId
    ? await resolveActorLabel({ tenantId: session.tenantId, userId: student.createdByUserId, teachers: data.teachers })
    : null;
  // Silme/geri alma: kurum sahibi + kurum yöneticileri (onay kritik işlem şifresiyle, sunucuda).
  const isOwner = canRunCriticalActions(session.role);
  const deletedBy = student.deletedAt
    ? student.deletedByUserId
      ? await resolveActorLabel({ tenantId: session.tenantId, userId: student.deletedByUserId, teachers: data.teachers })
      : "Bilinmeyen kullanıcı"
    : null;

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "student", id: student.id, label: student.name }} />
      <BackButton fallbackHref="/panel/ogrenciler" label="Öğrencilere dön" className="mb-3" />
      <PageHeader
        title={student.name}
        description={`${student.displayId ? `${student.displayId} · ` : ""}${branch?.shortName ?? "—"} · ${
          multiBranch ? `${activeBranchRows.length} aktif branş` : (student.packageName.split("—")[0]?.trim() ?? student.packageName)
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
            {student.deletedAt ? null : <StudentArchiveToggle studentId={student.id} active={student.active} />}
            {isOwner && !student.deletedAt && kurum.scope.mode === "single" ? (
              <StudentDeleteDialog studentId={student.id} studentName={student.name} />
            ) : null}
          </div>
        }
      />

      {student.deletedAt ? (
        <StudentDeletedBanner
          studentId={student.id}
          deletedAtLabel={formatDateTime(student.deletedAt)}
          deletedBy={deletedBy ?? "—"}
          reason={isOwner ? student.deletionReason : undefined}
          canRestore={isOwner && kurum.scope.mode === "single"}
        />
      ) : null}

      <Card className="mb-4 !p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge status={student.active ? "confirmed" : "cancelled"}>{student.active ? "Aktif" : "Pasif"}</Badge>
          {multiBranch
            ? activeBranchRows.map((r) => (
                <span key={r.enrollment.id} className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs">
                  <span className="font-medium text-[var(--color-text)]">{r.label}</span>
                  {r.terms.studentTypes.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </span>
              ))
            : effectiveStudentTypes(student).map((t) => <Badge key={t}>{t}</Badge>)}
          {student.educationMethod ? <Badge>{student.educationMethod}</Badge> : null}
          <span className="text-[var(--color-text-muted)]">
            {multiBranch ? "" : `Öğretmen: ${teacher?.name ?? "—"} · `}Kayıt:{" "}
            {student.enrollmentStartDate ? formatDate(student.enrollmentStartDate) : formatDate(student.createdAt)}
            {` · Kaydı oluşturan: ${createdBy ?? "Bilinmiyor (eski kayıt)"}`}
          </span>
          {student.convertedFromTrialId ? (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: "var(--color-trial-soft)", color: "var(--color-trial)" }}
              title="Bu öğrenci deneme dersinden kayda dönüştürüldü"
            >
              Denemeden dönüştü{convertedBy ? ` · ${convertedBy}` : ""}
            </span>
          ) : null}
        </div>
        {/*
          MT-003 — bu ekranda öğretmen/enstrüman DEĞİŞTİRİLEMEZ; burada yalnızca
          kayıt zamanında geçerli olan atamanın artık geçersiz hâle geldiğini
          açık Türkçe uyarıyla göstererek sessiz veri kaybını önlüyoruz.
        */}
        {(multiBranch ? activeBranchRows.map((r) => ({ label: r.label, t: data.teachers.find((x) => x.id === r.terms.teacherId), instruments: [r.enrollment.instrument] })) : teacher ? [{ label: "", t: teacher, instruments: student.instruments as string[] }] : [])
          .filter((x) => x.t && (!x.t.active || !x.instruments.some((i) => x.t!.instruments.includes(i as never))))
          .map((x) => (
            <p key={x.label + x.t!.id} className="mt-2 rounded-md px-3 py-2 text-xs font-medium" style={{ background: "var(--color-warning-soft)", color: "var(--color-warning)" }}>
              {x.label ? `${x.label}: ` : ""}
              {!x.t!.active
                ? `Uyarı: atanmış öğretmen "${x.t!.name}" artık pasif.`
                : `Uyarı: atanmış öğretmen "${x.t!.name}" artık "${x.instruments.join(", ")}" enstrümanını öğretmiyor.`}{" "}
              Devam etmeden önce Öğretmenler ekranından uygunluğu kontrol edin.
            </p>
          ))}
      </Card>

      <Suspense fallback={null}>
        <StudentBranchSwitcher
          items={branchRows.map((r) => ({ id: r.enrollment.id, label: r.label, active: r.enrollment.active }))}
        />
      </Suspense>

      <Suspense fallback={null}>
        <StudentDetailTabs studentId={student.id} />
      </Suspense>

      {children}
    </div>
  );
}
