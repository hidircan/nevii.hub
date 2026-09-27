import Link from "next/link";
import { withReturnTo } from "@/lib/safe-return-to";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import { listStudentDocumentsTool } from "@/lib/services";
import { documentKindLabel, documentStatusLabel, documentStatusHint } from "@/lib/documents";
import { findContractIdsByDocumentInstanceIds } from "@/lib/contracts";
import { formatDate } from "@/lib/utils";
import {
  actionGenerateKvkkNoticeDocument,
  actionGeneratePhotoVideoConsentDocument,
  actionGenerateKvkkAndPhotoVideoConsentDocuments,
} from "@/lib/actions";
import { loadStudentPageContext } from "../_context";

export const dynamic = "force-dynamic";

/**
 * Evraklar sekmesi — öğrenciye bağlı tüm resmî belgeler.
 * Sözleşme nüshaları, Evraklar Merkezi'yle AYNI kanonik görüntüleyiciye
 * (`/sozlesme-yazdir/[contractId]`) gider — iki ekranda iki farklı sözleşme
 * görünümü bırakılmaz.
 */
export default async function StudentDocumentsTab({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const { session, student, canManage } = await loadStudentPageContext(studentId);
  if (!student) notFound();

  const documentsResult = await listStudentDocumentsTool(session, { studentId: student.id });
  const documents = documentsResult.ok ? documentsResult.data.documents : [];
  const contractIdByDocument = await findContractIdsByDocumentInstanceIds(
    session.tenantId,
    documents.filter((d) => d.kind === "student_enrollment_contract").map((d) => d.id)
  );

  return (
    <div>
      <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-[var(--color-text)]">
        Evraklar
        <Link
          href={`/panel/evraklar?studentId=${student.id}`}
          className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
        >
          Evraklar Merkezinde Aç →
        </Link>
      </h2>

      {documents.length === 0 ? (
        <EmptyState
          title="Bu öğrenciye bağlı evrak yok"
          description="Sözleşme oluşturulduğunda veya Evraklar Merkezi'nden dosya yüklendiğinde burada listelenir."
        />
      ) : (
        <div className="space-y-2">
          {documents.map((d) => {
            const contractId = contractIdByDocument[d.id];
            return (
              <Card key={d.id} className="!p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={withReturnTo(
                        contractId ? `/sozlesme-yazdir/${contractId}` : `/panel/evraklar/${d.id}`,
                        `/panel/ogrenciler/${studentId}/evraklar`
                      )}
                      className="text-sm font-medium text-[var(--color-primary)] hover:underline"
                    >
                      {d.reference}
                    </Link>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {documentKindLabel(d.kind)} · {formatDate(d.createdAt)}
                    </p>
                  </div>
                  <span
                    title={documentStatusHint(d.status)}
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={
                      d.status === "cancelled" || d.status === "expired"
                        ? { background: "var(--color-surface-muted)", color: "var(--color-text-muted)" }
                        : d.status === "signed" || d.status === "uploaded"
                          ? { background: "var(--color-success-soft)", color: "var(--color-success)" }
                          : { background: "var(--color-info-soft)", color: "var(--color-info)" }
                    }
                  >
                    {documentStatusLabel(d.status)}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 text-xs text-[var(--color-text-muted)]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-success)" }} />
        <span>
          Bu belgeler kalıcı arşiv kayıtlarıdır; şablon güncellemeleri geçmiş belgeleri değiştirmez ve hiçbir
          belge otomatik olarak silinmez.
        </span>
      </p>

      {/*
        L (2026-09-20) — KVKK / Fotoğraf-Video belgeleri.

        ESKİ YER: Sözleşme Merkezi'nin EN ALTINDA, sözleşme oluşturma akışının
        hemen ardında duruyordu. Kullanıcı bunu sözleşmenin bir adımı sanıyor,
        tıklayınca beklediğinden farklı bir şey oluyordu ("işlevsiz hissi").

        YENİ YER: Evraklar — çünkü yaptığı iş tam olarak bu: AYRI referans
        numaralı bir ARŞİV BELGESİ üretmek. Normal akışta gerekmez; bu yüzden
        varsayılan olarak KAPALI ve üç soruyu açıkça cevaplıyor:
        sözleşmenin parçası mı / ayrı belge mi / ne zaman üretilir.
      */}
      {canManage ? (
        <details className="mt-6 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
          <summary className="cursor-pointer select-none text-sm font-semibold text-[var(--color-text)]">
            KVKK ve Fotoğraf/Video — ayrı arşiv nüshası oluştur
          </summary>
          <dl className="mt-3 space-y-2 text-xs text-[var(--color-text-muted)]">
            <div>
              <dt className="font-medium text-[var(--color-text)]">Sözleşmenin parçası mı?</dt>
              <dd>
                Evet. Sözleşmeyi “Görüntüle / Yazdır” ile açtığınızda KVKK ve Fotoğraf/Video bölümleri
                sözleşmenin ardına, bu sırayla, TEK çıktı olarak zaten eklenir. <strong>Normal akışta bu
                bölüme hiç girmeniz gerekmez.</strong>
              </dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--color-text)]">O zaman burası ne işe yarar?</dt>
              <dd>
                Aynı iki metnin, kendi referans numarasıyla <strong>bağımsız arşiv belgesi</strong> olarak
                üretilmesi gerektiğinde (kurum arşivi, kurum dışı talep, yeniden imzalatma) kullanılır.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--color-text)]">Ne zaman üretilir?</dt>
              <dd>
                Butona bastığınız anda. Fotoğraf/Video bölümü için bu öğrenciye ait kaydedilmiş bir izin
                kararı gerekir (sözleşme oluşturma ekranında kaydedilir); izin kaydı yoksa hiçbir belge
                üretilmez ve nedeni bildirilir.
              </dd>
            </div>
          </dl>

          <form
            className="mt-3"
            action={async () => {
              "use server";
              await actionGenerateKvkkAndPhotoVideoConsentDocuments({ studentId });
            }}
          >
            <button
              type="submit"
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
            >
              İkisini birlikte oluştur
            </button>
          </form>

          <div className="mt-2 flex flex-wrap gap-2">
            <form
              action={async () => {
                "use server";
                await actionGenerateKvkkNoticeDocument({ studentId });
              }}
            >
              <button
                type="submit"
                className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
              >
                Yalnız KVKK Aydınlatma Metni
              </button>
            </form>
            <form
              action={async () => {
                "use server";
                await actionGeneratePhotoVideoConsentDocument({ studentId });
              }}
            >
              <button
                type="submit"
                className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
              >
                Yalnız Fotoğraf/Video Açık Rıza Formu
              </button>
            </form>
          </div>
        </details>
      ) : null}
    </div>
  );
}
