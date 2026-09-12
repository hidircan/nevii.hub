"use client";

/**
 * P1 (2026-09-11) — çıkışta kullanıcıya ait İSTEMCİ önbelleğini temizler:
 * tercih cookie'leri server'da silinir (logout route), `notaplan_` önekli
 * localStorage anahtarları (sidebar sırası/durumu — hesap-ad-alanlı dahil)
 * burada silinir. Server'daki hesap kaydı KORUNUR.
 */
export function clearWorkspaceClientCache(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("notaplan_")) doomed.push(key);
    }
    for (const key of doomed) window.localStorage.removeItem(key);
  } catch {
    // sessizce yoksay.
  }
}
