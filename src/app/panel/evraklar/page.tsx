import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { requireSessionContext } from "@/lib/auth/session";
import { listAllDocumentTemplatesTool, listDocumentInstancesTool } from "@/lib/services";
import { documentKindLabel } from "@/lib/documents";
import { findContractIdsByDocumentInstanceIds } from "@/lib/contracts";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { DocumentsTable, type DocumentRow } from "@/components/documents-table";
import { DocumentTemplateManager } from "@/components/document-template-manager";
import { ContractTemplateDiagnosticsPanel } from "@/components/contract-template-diagnostics";
import { DocumentDirectUploadForm } from "@/components/document-direct-upload-form";
import { readData } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Evraklar Merkezi — kurumun tüm resmî belge arşivi.
 *
 * 2026-09-20 iki kök düzeltme:
 *  1) TEK KANONİK SÖZLEŞME GÖRÜNTÜLEYİCİ — sözleşme satırları artık
 *     `/sozlesme-yazdir/[contractId]`e gider (öğrenci ekranıyla aynı güncel
 *     görünüm). Dondurulmuş arşiv nüshası ayrı bir bağlantıyla korunur.
 *  2) STATÜ SEMANTİĞİ — üretilmiş belgeler "Taslak" görünmüyor; evraka özel
 *     `documentStatusLabel` kullanılır ve listenin altında belgenin kalıcı
 *     olduğu açıkça yazar.
 */
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

  const [allTemplatesResult, documentsResult, data] = await Promise.all([
    listAllDocumentTemplatesTool(session),
    listDocumentInstancesTool(session, studentId ? { studentId } : teacherId ? { teacherId } : {}),
    readData(),
  ]);
  const allTemplates = allTemplatesResult.ok ? allTemplatesResult.data.templates : [];
  const documents = documentsResult.ok ? documentsResult.data.documents : [];
  const students = data.students.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }));
  const teachers = data.teachers.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }));

  // Belge → sözleşme eşlemesi TEK sorguyla (satır başına arama YOK).
  const contractIdByDocument = await findContractIdsByDocumentInstanceIds(
    session.tenantId,
    documents.filter((d) => d.kind === "student_enrollment_contract").map((d) => d.id)
  );

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
      contractId: contractIdByDocument[d.id],
    };
  });

  return (
    <div>
      <PageHeader
        title="Evraklar Merkezi"
        description="Kurumun resmî belge arşivi — sözleşmeler, KVKK/rıza formları ve yüklenen dosyalar."
      />

      <div
        className="mb-4 rounded-[var(--radius-md)] border px-3 py-2.5"
        style={{
          borderColor: "color-mix(in srgb, var(--color-success) 30%, transparent)",
          background: "var(--color-success-soft)",
        }}
      >
        <p className="flex items-start gap-2 text-xs" style={{ color: "var(--color-success)" }}>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Bu arşivdeki her belge kalıcıdır: referans numarası, içerik anlık görüntüsü ve yüklenen imzalı
            nüshalar kaydedilir; şablon güncellemeleri geçmiş belgeleri değiştirmez ve hiçbir belge otomatik
            olarak silinmez.
          </span>
        </p>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          title="Henüz evrak yok"
          description="Aşağıdaki “Dosya Yükle” bölümünden ilk belgenizi ekleyin veya bir öğrenciye sözleşme oluşturun."
        />
      ) : (
        <DocumentsTable rows={rows} students={students} activeStudentId={studentId} />
      )}

      <Card className="mt-6">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--color-primary)]">Dosya Yükle</p>
        <DocumentDirectUploadForm students={students} teachers={teachers} />
      </Card>

      <Card className="mt-6">
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
    </div>
  );
}
