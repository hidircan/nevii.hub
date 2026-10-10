import Link from "@/components/link";
import { withReturnTo } from "@/lib/safe-return-to";
import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getDocumentInstanceTool } from "@/lib/services";
import { documentKindLabel, documentStatusLabel, documentStatusHint } from "@/lib/documents";
import { findContractIdByDocumentInstanceId } from "@/lib/contracts";
import { listAuditLogs } from "@/lib/audit/log";
import { readReferenceData } from "@/lib/store";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { DocumentSignedUpload } from "@/components/document-signed-upload";
import { QuickTaskLink } from "@/components/quick-task-link";
import { DocumentSignedVersions, type SignedVersionRow } from "@/components/document-signed-versions";
import { DocumentDeleteButton } from "@/components/document-delete-button";
import { canRunCriticalActions } from "@/lib/critical-action-password";
import { DocumentArchiveButton } from "@/components/document-archive-button";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/panel/evraklar/${documentId}`);
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN" && session.role !== "BRANCH_MANAGER") {
    redirect("/panel");
  }
  // Şube müdürü: görüntüleme + arşivleme (kapsam tool katmanında).
  // Görev oluşturma ve imzalı sürüm yükleme adminlerde kalır.
  const isBranchManager = session.role === "BRANCH_MANAGER";
  const canDelete = canRunCriticalActions(session.role);

  const result = await getDocumentInstanceTool(session, { documentId });
  if (!result.ok) {
    return (
      <div>
        <PageHeader title="Evrak bulunamadı" />
        <EmptyState title="Evrak bulunamadı" description="Bu belge mevcut kurum kapsamınızda değil veya kaldırılmış olabilir." />
        <BackButton fallbackHref="/panel/evraklar" label="Evraklar Merkezine dön" className="mt-4" />
      </div>
    );
  }

  const doc = result.data.document;
  const data = await readReferenceData();
  const student = doc.studentId ? data.students.find((s) => s.id === doc.studentId) : undefined;
  const teacher = doc.teacherId ? data.teachers.find((t) => t.id === doc.teacherId) : undefined;
  const branch = doc.branchId ? data.settings.branches.find((b) => b.id === doc.branchId) : undefined;

  const auditEntries = await listAuditLogs(session.tenantId, { entityId: doc.id, entityType: "DocumentInstance", limit: 20 });

  /**
   * TEK KANONİK SÖZLEŞME GÖRÜNTÜLEYİCİ — belge bir kayıt sözleşmesiyse,
   * "Yazdırma görünümü" jenerik `/evrak-yazdir` yerine öğrenci ekranıyla
   * AYNI `/sozlesme-yazdir/[contractId]` ekranını açar. Aşağıdaki "Önizleme"
   * bloğu, üretim anındaki DONDURULMUŞ nüshadır ve bilinçli olarak korunur
   * (hukuki arşiv) — ama artık ne olduğu açıkça yazıyor.
   */
  const contractId = await findContractIdByDocumentInstanceId(session.tenantId, doc.id);
  const printHref = withReturnTo(
    contractId ? `/sozlesme-yazdir/${contractId}` : `/evrak-yazdir/${doc.id}`,
    `/panel/evraklar/${doc.id}`
  );

  // İş Takip Faz 3B-1A — "cancelled"/"expired" evrak, işlevsel karşılığı
  // arşivlenmiş belge sayılır: yeni görev bağlamı için eylem gizlenir.
  const canCreateTask = doc.status !== "cancelled" && doc.status !== "expired";

  return (
    <div>
      <BackButton fallbackHref="/panel/evraklar" label="Evraklar Merkezine dön" className="mb-3" />
      <PageHeader
        title={doc.reference}
        description={documentKindLabel(doc.kind)}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={printHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
            >
              {contractId ? "Sözleşmeyi görüntüle / yazdır" : "Yazdırma görünümü"}
            </Link>
            {canCreateTask && !isBranchManager ? (
              <QuickTaskLink
                relatedEntityType="document"
                relatedEntityId={doc.id}
                relatedEntityLabel={doc.reference}
                title={`Evrak inceleme — ${doc.reference}`}
                label="Bu evrakla ilgili görev oluştur"
                returnTo={`/panel/evraklar/${doc.id}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
              />
            ) : null}
            {doc.status !== "cancelled" ? <DocumentArchiveButton documentId={doc.id} variant="button" /> : null}
            {canDelete ? (
              <DocumentDeleteButton documentId={doc.id} reference={doc.reference} afterDeleteHref="/panel/evraklar" />
            ) : null}
            <span title={documentStatusHint(doc.status)}>
              <Badge status={doc.status}>{documentStatusLabel(doc.status)}</Badge>
            </span>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Arşiv nüshası (üretildiği andaki hali)
            </p>
            <p className="mb-3 text-xs text-[var(--color-text-muted)]">
              {contractId
                ? "Bu, sözleşmenin üretildiği anda dondurulmuş nüshasıdır ve değişmez. Güncel görünüm için yukarıdaki “Sözleşmeyi görüntüle / yazdır” bağlantısını kullanın."
                : "Belgenin üretildiği andaki hali; şablon sonradan güncellense bile bu içerik değişmez."}
            </p>
            {doc.renderedHtml ? (
              <div className="prose prose-sm max-w-none rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                <div dangerouslySetInnerHTML={{ __html: doc.renderedHtml }} />
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">Önizleme yok.</p>
            )}
          </Card>

          <Card>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">İmzalı / taranmış sürüm</p>
            {doc.fileData ? (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">{doc.fileName}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Yüklendi: {doc.signedUploadedAt ? formatDateTime(doc.signedUploadedAt) : "—"}
                    {doc.signedBy ? ` · Yükleyen: ${doc.signedBy}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={`/api/v1/documents/${doc.id}/file`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
                  >
                    Görüntüle / indir
                  </a>
                  {!isBranchManager ? <DocumentSignedUpload documentId={doc.id} hasExisting /> : null}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-[var(--color-text-muted)]">Henüz imzalı sürüm yüklenmedi.</p>
                {!isBranchManager ? <DocumentSignedUpload documentId={doc.id} /> : null}
              </div>
            )}
            {(doc.signedVersions ?? []).length > 0 ? (
              <div className="mt-4 border-t border-[var(--color-border)] pt-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  Sürüm geçmişi
                </p>
                <DocumentSignedVersions
                  documentId={doc.id}
                  canDelete={canDelete}
                  versions={(doc.signedVersions ?? []).map(
                    (v): SignedVersionRow => ({
                      id: v.id,
                      fileName: v.fileName,
                      fileSize: v.fileSize,
                      uploadedAt: v.uploadedAt,
                      uploadedBy: v.uploadedBy,
                      deletedAt: v.deletedAt,
                      isCurrent: v.fileName === doc.fileName && v.uploadedAt === doc.signedUploadedAt,
                    })
                  )}
                />
              </div>
            ) : null}
          </Card>

          <Card>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Denetim kaydı (oluşturma / yazdırma / yükleme / arşivleme)
            </p>
            {auditEntries.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                Denetim kaydı yok (yalnızca STORE_MODE=db altında tutulur).
              </p>
            ) : (
              <ul className="space-y-1.5 text-xs text-[var(--color-text-muted)]">
                {auditEntries.map((a) => (
                  <li key={a.id}>
                    {formatDateTime(a.createdAt.toISOString())} · {a.action} · {a.actorRole}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Bilgiler</p>
            <dl className="space-y-2 text-sm">
              <Field label="İlgili kişi" value={student?.name ?? teacher?.name ?? "—"} />
              <Field label="Şube" value={branch?.name ?? "—"} />
              <Field label="Şablon sürümü" value={doc.templateId} />
              <Field label="Yazdırma sayısı" value={String(doc.printCount)} />
              <Field label="Oluşturulma" value={formatDateTime(doc.createdAt)} />
              <Field label="Son güncelleme" value={formatDateTime(doc.updatedAt)} />
              <Field label="Oluşturan" value={doc.createdBy} />
            </dl>
          </Card>
          {student ? (
            <Link href={`/panel/ogrenciler/${student.id}`} className="block text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
              Öğrenci Detayında Aç →
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-0.5 font-medium text-[var(--color-text)]">{value}</dd>
    </div>
  );
}
