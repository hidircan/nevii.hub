"use client";

import { useRouter } from "next/navigation";
import { CriticalDeleteDialog } from "@/components/critical-delete-dialog";

/** 2026-09-29 — AI hafıza kaydı silme: kurum sahibi/yöneticisi + kritik şifre + gerekçe (sunucuda zorunlu). */
export function MemoryDeleteButton({ id, summary }: { id: string; summary: string }) {
  const router = useRouter();
  return (
    <CriticalDeleteDialog
      triggerLabel="Sil"
      title="AI hafıza kaydını sil"
      meaning="Kayıt AI hafızasından kalıcı olarak silinir; asistan bu bilgiyi artık kullanmaz. Silen kişi ve gerekçe denetim kaydına yazılır."
      confirmationName="SİL"
      confirmationLabel="Onay için kutuya yazın"
      submitLabel="Kaydı sil"
      loadImpact={async () => ({
        ok: true,
        data: { lines: [["Kayıt", summary.slice(0, 80)]], allowed: true, criticalPasswordConfigured: true },
      })}
      onSubmit={async ({ criticalPassword, reason, confirmation }) => {
        if (!["sil", "sıl"].includes(confirmation.trim().toLocaleLowerCase("tr"))) {
          return { ok: false, message: 'Onay için kutuya "SİL" yazın.' };
        }
        try {
          const res = await fetch("/api/v1/ai/memory", {
            method: "DELETE",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, criticalPassword, reason }),
          });
          const json = (await res.json()) as { ok: boolean; error?: { message: string } };
          if (!json.ok) return { ok: false, message: json.error?.message || "Kayıt silinemedi; hiçbir şey değişmedi." };
          router.refresh();
          return { ok: true };
        } catch {
          return { ok: false, message: "Sunucuya ulaşılamadı; bağlantınızı kontrol edip tekrar deneyin." };
        }
      }}
    />
  );
}
