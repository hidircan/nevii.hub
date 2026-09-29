/**
 * Evrak statüsü — BELGEYE ÖZEL Türkçe etiketler. SAF modül: hiçbir I/O,
 * Prisma veya `pg` importu YOK, bu yüzden `"use client"` bileşenlerinden de
 * güvenle import edilir (bkz. documents/index.ts — o dosya Prisma çeker).
 *
 * Genel `statusLabel` (src/lib/utils.ts) `draft`i "Taslak" olarak çevirir;
 * bu, tahsilat mesajı gibi GERÇEKTEN taslak olan kayıtlar için doğru ama
 * üretilmiş bir resmî evrak için YANLIŞ ve güven kırıcıydı (kullanıcı
 * raporu: "sözleşme oluştu ama draft yazıyor").
 */
import type { DocumentInstanceStatus } from "./types";

const DOCUMENT_STATUS_LABELS: Record<DocumentInstanceStatus, string> = {
  draft: "Düzenlendi", // legacy kayıtlar — anlamı "issued" ile aynı
  issued: "Düzenlendi",
  printed: "Yazdırıldı",
  sent_for_signature: "İmzaya verildi",
  signed: "İmzalandı",
  uploaded: "İmzalı nüsha yüklendi",
  cancelled: "İptal edildi",
  expired: "Süresi doldu",
  deleted: "Silindi",
};

/** Statünün ne anlama geldiğini bir cümleyle anlatır — tooltip/altyazı için. */
const DOCUMENT_STATUS_HINTS: Record<DocumentInstanceStatus, string> = {
  draft: "Belge üretildi ve arşivde kalıcı olarak saklanıyor.",
  issued: "Belge üretildi ve arşivde kalıcı olarak saklanıyor.",
  printed: "Belge en az bir kez yazdırıldı; arşivde kalıcı.",
  sent_for_signature: "Belge imza için iletildi; imzalı nüsha henüz yüklenmedi.",
  signed: "Belge imzalandı.",
  uploaded: "İmzalı/taranmış nüsha sisteme yüklendi.",
  cancelled: "Belge iptal edildi; kayıt arşivde saklanır, silinmez.",
  expired: "Belgenin geçerlilik süresi doldu; kayıt arşivde saklanır, silinmez.",
  deleted: "Evrak silindi: listelerden ve erişimden kaldırıldı; kayıt ve dosya yasal saklama için veritabanında tutulur.",
};

export function documentStatusLabel(status: string): string {
  return DOCUMENT_STATUS_LABELS[status as DocumentInstanceStatus] ?? status;
}

export function documentStatusHint(status: string): string {
  return DOCUMENT_STATUS_HINTS[status as DocumentInstanceStatus] ?? "";
}

/** İptal/süresi dolmuş dışındaki her evrak "yürürlükte" sayılır. */
export function isActiveDocumentStatus(status: string): boolean {
  return status !== "cancelled" && status !== "expired" && status !== "deleted";
}
