import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { listDocumentTemplatesTool, listAllDocumentTemplatesTool, listDocumentInstancesTool } from "@/lib/services";
import { documentKindLabel } from "@/lib/documents";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { DocumentCreateForm } from "@/components/document-create-form";
import { DocumentsTable, type DocumentRow } from "@/components/documents-table";
import { DocumentTemplateManager } from "@/components/document-template-manager";
import { ContractTemplateDiagnosticsPanel } from "@/components/contract-template-diagnostics";
import { DocumentDirectUploadForm } from "@/components/document-direct-upload-form";
import { readData } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Kullanıcı isteğiyle şimdilik kapatıldı — "Yeni Evrak Oluştur" ve "Şablon
 * Yönetimi" bölümleri tekrar açılana kadar gizli. Diğer her şey (Dosya Yükle,
 * evrak listesi) etkilenmez. */
const SHOW_TEMPLATE_SECTIONS = false;

/** PRODUCT_BACKLOG §6 — Evraklar Merkezi: profesyonel doküman merkezi görünümü. */
export default async function DocumentsCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string; teacherId?: string }>;
}) {
  const { studentId, teacherId } = await searchParams;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/evraklar");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const [templatesResult, allTemplatesResult, documentsResult, data] = await Promise.all([
    listDocumentTemplatesTool(session),
    listAllDocumentTemplatesTool(session),
    listDocumentInstancesTool(session, studentId ? { studentId } : teacherId ? { teacherId } : {}),
    readData(),
  ]);
  const templates = templatesResult.ok ? templatesResult.data.templates : [];
  const allTemplates = allTemplatesResult.ok ? allTemplatesResult.data.templates : [];
  const documents = documentsResult.ok ? documentsResult.data.documents : [];
  const students = data.students.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }));
  const teachers = data.teachers.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }));

  const rows: DocumentRow[] = documents.map((d) => {
    const relatedStudent = d.studentId ? data.students.find((s) => s.id === d.studentId) : undefined;
    const person = relatedStudent?.name || (d.teacherId && data.teachers.find((t) => t.id === d.teacherId)?.name) || "—";
    const branchName = d.branchId ? data.settings.branches.find((b) => b.id === d.branchId)?.shortName : undefined;
    return {
      id: d.id,
      reference: d.reference,
      kindLabel: documentKindLabel(d.kind),
      personName: person,
      parentName: relatedStudent?.parentName,
      branchName,
      status: d.status,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  });

  return (
    <div>
      <PageHeader title="Evraklar Merkezi" />

      <Card className="mb-6">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--color-primary)]">
          Dosya Yükle
        </p>
        <DocumentDirectUploadForm students={students} teachers={teachers} />
      </Card>

      <Card className="mb-6">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--color-primary)]">
          Sözleşme Şablonları
        </p>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          Yalnızca öğrenci kayıt sözleşmesi şablonları — formal sözleşme PDF&apos;i her zaman aşağıdaki AKTİF
          şablondan üretilir. Şablonu güncellemek yeni bir versiyon oluşturur; halihazırda üretilmiş sözleşmeler
          KENDİ şablon sürümlerini (immutable snapshot) korur, geriye dönük ETKİLENMEZ.
        </p>
        <ContractTemplateDiagnosticsPanel />
        <DocumentTemplateManager
          lockKind="student_enrollment_contract"
          templates={allTemplates
            .filter((t) => t.kind === "student_enrollment_contract")
            .map((t) => ({
              id: t.id,
              name: t.name,
              kind: t.kind,
              active: t.active,
              version: t.version,
              updatedAt: t.updatedAt,
              bodyHtml: t.bodyHtml,
              hasSourceFile: !!t.sourceFileData,
            }))}
        />
      </Card>

      {SHOW_TEMPLATE_SECTIONS ? (
        <>
          <Card className="mb-6">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--color-primary)]">
              Yeni Evrak Oluştur (şablondan)
            </p>
            {templates.length === 0 ? (
              <EmptyState title="Şablon yok" description="Aşağıdaki 'Şablon Yönetimi' bölümünden yeni bir şablon oluşturun." />
            ) : (
              <DocumentCreateForm
                templates={templates.map((t) => ({ id: t.id, name: t.name, kind: t.kind }))}
                students={students}
                teachers={teachers}
                defaultStudentId={studentId}
                defaultTeacherId={teacherId}
              />
            )}
          </Card>

          <Card className="mb-6">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--color-primary)]">Şablon Yönetimi</p>
            <DocumentTemplateManager
              templates={allTemplates.map((t) => ({
                id: t.id,
                name: t.name,
                kind: t.kind,
                active: t.active,
                version: t.version,
                updatedAt: t.updatedAt,
                bodyHtml: t.bodyHtml,
                hasSourceFile: !!t.sourceFileData,
              }))}
            />
          </Card>
        </>
      ) : null}

      {documents.length === 0 ? (
        <EmptyState
          title="Henüz evrak yok"
          description="Yukarıdaki 'Dosya Yükle' bölümünden ilk belgenizi ekleyin."
        />
      ) : (
        <DocumentsTable rows={rows} />
      )}
    </div>
  );
}
