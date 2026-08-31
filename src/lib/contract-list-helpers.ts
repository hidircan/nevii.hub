/**
 * Faz 5 (ENROLLMENT_PAYMENT_RENEWAL_VALIDATION_FIX) — istemci-güvenli, saf
 * yardımcılar. `src/lib/contracts.ts`'in `getLatestContractForStudent`'ı
 * (sunucu-only, fs/db kullanır) BAŞKA bir amaca hizmet eder: "gösterim için
 * en güncel" — tüm sözleşmeler iptal/yenilenmişse bile `all[0]`'a düşer.
 * Bu fonksiyon YENİLEME UYGUNLUĞU için ayrı ve daha KATI bir kuraldır:
 * iptal edilmiş/yenilenmiş bir sözleşme ASLA "önceki sözleşme" olarak
 * seçilmez — sunucudaki `createContract`'ın renewal reddiyle (bkz.
 * contracts.ts: "İptal edilmiş veya zaten yenilenmiş bir sözleşme tekrar
 * yenilenemez.") TUTARLIDIR. Eskiden bu iki kavram `contract-panel.tsx`
 * içinde TEK bir `latest` değişkeninde karışmıştı — bu, iptal edilen TEK
 * sözleşmeden sonra "Sözleşme Yenile" butonunun YANILTICI biçimde
 * görünmesine (ve boş `firstDueDate` ile forma girilince çökmeye) yol
 * açan kök nedendi.
 */

export function findLatestActiveContractForRenewal<T extends { status: string }>(contracts: T[]): T | null {
  return contracts.find((c) => c.status !== "superseded" && c.status !== "cancelled") ?? null;
}
