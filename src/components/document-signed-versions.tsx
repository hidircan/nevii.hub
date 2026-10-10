"use client";

import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/utils";
import { CriticalDeleteDialog } from "@/components/critical-delete-dialog";

export type SignedVersionRow = {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: string;
  deletedAt?: string;
  /** Bu sürüm şu an güncel (indirilen) sürüm mü — yalnızca görsel etiket için. */
  isCurrent: boolean;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** İmzalı sürüm geçmişi — soft-delete edilenler "Kaldırıldı" olarak işaretli kalır (audit izi), listeden kaybolmaz. */
export function DocumentSignedVersions({
  documentId,
  versions,
  canDelete = false,
}: {
  documentId: string;
  versions: SignedVersionRow[];
  /** 2026-09-29 — kaldırma yalnız kurum sahibi/yöneticisi + kritik şifre + gerekçe. */
  canDelete?: boolean;
}) {
  const router = useRouter();

  async function onDelete(
    versionId: string,
    input: { criticalPassword: string; reason: string }
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      const res = await fetch(`/api/v1/documents/${documentId}/signed-versions/${versionId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) return { ok: false, message: json.error?.message || "Sürüm kaldırılamadı; hiçbir kayıt değişmedi." };
      router.refresh();
      return { ok: true };
    } catch {
      return { ok: false, message: "Sunucuya ulaşılamadı; bağlantınızı kontrol edip tekrar deneyin." };
    }
  }

  if (versions.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">Henüz sürüm geçmişi yok.</p>;
  }

  return (
    <div className="space-y-1.5">
      {versions.map((v) => (
        <div
          key={v.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--color-bg)] p-2 text-xs"
        >
          <div className={v.deletedAt ? "text-[var(--color-text-muted)] line-through" : "text-[var(--color-text)]"}>
            <span className="font-medium">{v.fileName}</span> · {formatSize(v.fileSize)} ·{" "}
            {formatDateTime(v.uploadedAt)}
            {v.isCurrent && !v.deletedAt ? (
              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                Güncel
              </span>
            ) : null}
            {v.deletedAt ? <span className="ml-2 italic">Kaldırıldı</span> : null}
          </div>
          {!v.deletedAt && canDelete ? (
            <CriticalDeleteDialog
              triggerLabel="Kaldır"
              title="İmzalı sürümü kaldır"
              meaning={
                v.isCurrent
                  ? "Güncel imzalı dosya kaldırılır: dosya içeriği artık indirilemez ve evrak 'İmzaya verildi' durumuna döner. Sürüm kaydı geçmişte 'Kaldırıldı' olarak kalır. Yanlış dosyayı düzeltmek için doğrusunu yeni sürüm olarak yüklemeyi tercih edin."
                  : "Sürüm kaydı geçmişte 'Kaldırıldı' olarak işaretlenir; güncel dosya değişmez."
              }
              confirmationName="SİL"
              confirmationLabel="Onay için kutuya yazın"
              submitLabel="Sürümü kaldır"
              loadImpact={async () => ({
                ok: true,
                data: {
                  lines: [
                    ["Dosya", v.fileName],
                    ["Yüklenme", formatDateTime(v.uploadedAt)],
                    ["Güncel sürüm", v.isCurrent ? "Evet" : "Hayır"],
                  ],
                  allowed: true,
                  criticalPasswordConfigured: true,
                },
              })}
              onSubmit={async ({ criticalPassword, reason, confirmation }) => {
                if (!["sil", "sıl"].includes(confirmation.trim().toLocaleLowerCase("tr"))) {
                  return { ok: false, message: 'Onay için kutuya "SİL" yazın.' };
                }
                return onDelete(v.id, { criticalPassword, reason });
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
