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

/** İptal veya yenilenmiş sürüm — asla "güncel sözleşme" değildir. */
export function isTerminalContractStatus(status: string): boolean {
  return status === "cancelled" || status === "superseded";
}

/**
 * Güncel sözleşme TEK kuralı:
 * 1. cancelled / superseded elenir (iptal edilmiş kayıt asla güncel değildir).
 * 2. Kalanlar arasında en yüksek `versionNumber`.
 * 3. Versiyon eşitse en yeni `createdAt`, o da eşitse id.
 * Hepsi terminal ise null — "son iptal edilen" güncel sayılmaz.
 */
export function selectCurrentContract<
  T extends { status: string; versionNumber?: number; createdAt?: string; id?: string },
>(contracts: T[]): T | null {
  const live = contracts.filter((c) => !isTerminalContractStatus(c.status));
  if (live.length === 0) return null;
  return [...live].sort(compareContractRecency)[0] ?? null;
}

/** Liste sırası: güncel üstte, sonra geçmiş (en yeni önce). */
export function sortContractsForDisplay<
  T extends { status: string; versionNumber?: number; createdAt?: string; id?: string },
>(contracts: T[]): T[] {
  const current = selectCurrentContract(contracts);
  const rest = contracts
    .filter((c) => c !== current)
    .sort(compareContractRecency);
  return current ? [current, ...rest] : rest;
}

function compareContractRecency<
  T extends { versionNumber?: number; createdAt?: string; id?: string },
>(a: T, b: T): number {
  const av = a.versionNumber ?? 0;
  const bv = b.versionNumber ?? 0;
  if (av !== bv) return bv - av;
  const ac = a.createdAt ?? "";
  const bc = b.createdAt ?? "";
  if (ac !== bc) return bc.localeCompare(ac);
  return (b.id ?? "").localeCompare(a.id ?? "");
}

export function findLatestActiveContractForRenewal<
  T extends { status: string; versionNumber?: number; createdAt?: string; id?: string },
>(contracts: T[]): T | null {
  return selectCurrentContract(contracts);
}
