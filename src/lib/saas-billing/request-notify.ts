/**
 * Yeni talep bildirimi — YALNIZCA ilk kayıtta (taslak düzenlemesi,
 * replay veya geri dönüşte DEĞİL).
 *
 * - Alıcı sunucu ayarından gelir (SAAS_OWNER_NOTIFY_EMAIL, varsayılan
 *   info@neviihub.com); public istek alıcıyı belirleyemez.
 * - Gönderim mevcut SaaS posta korumasından geçer (test modunda izin
 *   listesi dışı = engelli, sahte başarı yok). Localde gerçek mail çıkmaz.
 * - Posta hatası başvuruyu KAYBETTİRMEZ ve ikinci talep YARATMAZ;
 *   sonuç denetim kaydına yazılır (Denetim + Özet/Son hareketler).
 * - İçerik: kurum, talep türü, tarih/saat, NeviiOS detay bağlantısı.
 *   Fatura/kimlik verisi ve token YOK.
 */
import { getPublicAppBaseUrl } from "../email/config";
import { sendNewRequestNotification } from "./emails";

export type NewRequestKind = "deneme" | "satin-alma" | "teklif" | "taslak";

const KIND_LABEL: Record<NewRequestKind, string> = {
  deneme: "deneme başvurusu",
  "satin-alma": "satın alma başvurusu",
  teklif: "teklif isteği",
  taslak: "satın alma taslağı",
};

export function ownerNotifyEmail(): string {
  return (process.env.SAAS_OWNER_NOTIFY_EMAIL || "info@neviihub.com").trim().toLowerCase();
}

export async function notifyOwnerNewRequest(args: {
  kind: NewRequestKind;
  id: string;
  institutionName: string;
  createdAt: string;
}): Promise<{ mailed: "sent" | "blocked" | "failed"; reason: string }> {
  const detailUrl = `${getPublicAppBaseUrl()}/platform/basvurular/${args.kind}/${args.id}`;
  const createdAtDisplay = (() => {
    try {
      return new Date(args.createdAt).toLocaleString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return args.createdAt;
    }
  })();
  let mailed: "sent" | "blocked" | "failed" = "failed";
  let reason = "bilinmeyen hata";
  try {
    const res = await sendNewRequestNotification({
      to: ownerNotifyEmail(),
      kindLabel: KIND_LABEL[args.kind],
      institutionName: args.institutionName,
      createdAtDisplay,
      detailUrl,
    });
    if (res.sent) {
      mailed = "sent";
      reason = res.messageId ?? "gönderildi";
    } else {
      mailed = res.reason.startsWith("TEST_MODE_BLOCKED") ? "blocked" : "failed";
      reason = res.reason;
    }
  } catch (e) {
    mailed = "failed";
    reason = e instanceof Error ? e.message : "posta hatası";
  }
  try {
    const { appendPlatformAudit } = await import("../platform/store");
    await appendPlatformAudit({
      actorUserId: "system",
      actorRole: "system",
      actorTenantId: "",
      targetTenantId: null,
      action: "saas.request.notified",
      entityType: `request:${args.kind}`,
      entityId: args.id,
      before: null,
      after: { kind: args.kind, mailed, reason } as unknown as import("../platform/types").JsonValue,
      requestId: "n/a",
      outcome: mailed === "failed" ? "error" : "success",
    });
  } catch {
    /* denetim yazılamazsa bildirim sonucu kaybolur ama başvuru korunur */
  }
  return { mailed, reason };
}
