"use client";

import { useRouter } from "next/navigation";
import { CriticalDeleteDialog } from "@/components/critical-delete-dialog";
import { apiFetch } from "@/lib/api/client-fetch";
import { friendlyApiErrorMessage } from "@/lib/api/friendly-error";
import type { ClubDeleteImpact } from "@/lib/clubs";

const tl = (n: number) => `${n.toLocaleString("tr-TR")} ₺`;

/** 2026-10-06 — yanlışlıkla oluşturulan kulübü sil: kritik şifre + gerekçe; etki önceden gösterilir, engel varsa izin yok. */
export function ClubDeleteButton({ clubId, clubName }: { clubId: string; clubName: string }) {
  const router = useRouter();
  return (
    <CriticalDeleteDialog
      triggerLabel="Kulübü sil"
      title={`${clubName} — kulübü sil`}
      meaning="Yanlışlıkla oluşturulan kulüp için. Kulüp listeden kalkar; kayıt silinmez (silen kişi ve gerekçe saklanır). Ödenmemiş kulüp ücretleri iptal edilir, gelecek oturumlar iptal olur, açık üyelikler bugün sona erer."
      confirmationName="SİL"
      confirmationLabel="Onay için kutuya yazın"
      submitLabel="Kulübü sil"
      loadImpact={async () => {
        try {
          const res = await apiFetch(`/api/v1/clubs?deleteImpact=${encodeURIComponent(clubId)}`);
          const j = (await res.json()) as { ok: boolean; data?: ClubDeleteImpact; error?: { code?: string; message?: string } };
          if (!j.ok || !j.data) return { ok: false, message: friendlyApiErrorMessage(j.error, "Silme etkisi okunamadı.") };
          const d = j.data;
          return {
            ok: true,
            data: {
              lines: [
                ["Aktif üye (üyelik biter)", String(d.activeMembers)],
                ["İptal edilecek ödenmemiş ücret", `${d.openFeeRows} satır · ${tl(d.openFeeTotal)}`],
                ["İptal edilecek gelecek oturum", String(d.futureSessions)],
              ],
              allowed: !d.blocker,
              blockReason: d.blocker,
              criticalPasswordConfigured: true,
            },
          };
        } catch {
          return { ok: false, message: "Sunucuya ulaşılamadı; bağlantınızı kontrol edip tekrar deneyin." };
        }
      }}
      onSubmit={async ({ criticalPassword, reason, confirmation }) => {
        if (!["sil", "sıl"].includes(confirmation.trim().toLocaleLowerCase("tr"))) return { ok: false, message: 'Onay için kutuya "SİL" yazın.' };
        try {
          const res = await apiFetch("/api/v1/clubs", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clubId, criticalPassword, reason }),
          });
          const j = (await res.json()) as { ok: boolean; error?: { code?: string; message?: string } };
          if (!j.ok) return { ok: false, message: friendlyApiErrorMessage(j.error, "Kulüp silinemedi; hiçbir şey değişmedi.") };
          router.push("/panel/kulupler");
          router.refresh();
          return { ok: true };
        } catch {
          return { ok: false, message: "Sunucuya ulaşılamadı; bağlantınızı kontrol edip tekrar deneyin." };
        }
      }}
    />
  );
}
