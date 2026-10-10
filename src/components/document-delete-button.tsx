"use client";

import { useRouter } from "next/navigation";
import { actionDeleteDocument, actionGetDocumentDeletionImpact } from "@/lib/actions";
import { CriticalDeleteDialog } from "@/components/critical-delete-dialog";
import { documentStatusLabel } from "@/lib/document-status";

/**
 * 2026-09-29 — evrak "Sil": yalnız arşivlenmiş ve sözleşmeye bağlı olmayan evrak için
 * soft delete (kayıt + dosya DB'de kalır, listelerden/erişimden kalkar). Etki özeti
 * sunucudan gelir; arşivlenmemiş evrakta neden silinemediği ve ne yapılacağı yazılır.
 */
export function DocumentDeleteButton({
  documentId,
  reference,
  afterDeleteHref,
}: {
  documentId: string;
  reference: string;
  /** Detay sayfasından silinince gidilecek yer; verilmezse liste yenilenir. */
  afterDeleteHref?: string;
}) {
  const router = useRouter();
  return (
    <CriticalDeleteDialog
      triggerLabel="Sil"
      title={`${reference} evrakını sil`}
      meaning="Evrak listelerden, detay ve indirme erişiminden kaldırılır. Kayıt, dosya ve imzalı sürüm geçmişi yasal saklama için veritabanında tutulur; kim, ne zaman, hangi gerekçeyle sildi denetim kaydına yazılır."
      confirmationName={reference}
      confirmationLabel="Onay için evrak numarasını aynen yazın"
      submitLabel="Evrakı sil"
      loadImpact={async () => {
        const res = await actionGetDocumentDeletionImpact(documentId);
        if (!res.ok) return res;
        const d = res.data;
        return {
          ok: true,
          data: {
            lines: [
              ["Evrak no", d.reference],
              ["Durum", documentStatusLabel(d.status)],
              ["İmzalı dosya", d.hasSignedFile ? "Var — silinmez, erişimden kalkar" : "Yok"],
              ["İmzalı sürüm kaydı", String(d.signedVersionCount)],
              ["Açık bağlı iş", d.openTaskCount > 0 ? `${d.openTaskCount} — iş kaydı kalır, evrak bağlantısı açılmaz` : "Yok"],
            ],
            allowed: d.allowed,
            blockReason: d.blockReason,
            criticalPasswordConfigured: d.criticalPasswordConfigured,
          },
        };
      }}
      onSubmit={async (input) => {
        const res = await actionDeleteDocument({ documentId, ...input });
        if (!res.ok) return res;
        if (afterDeleteHref) router.push(afterDeleteHref);
        else router.refresh();
        return { ok: true };
      }}
    />
  );
}
