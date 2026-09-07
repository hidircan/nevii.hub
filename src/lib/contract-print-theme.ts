/**
 * P0 UAT (2026-09-07) — Sözleşme baskı yüzeyinin TEMADAN BAĞIMSIZ paleti.
 *
 * KÖK NEDEN (ölçüldü, tahmin değil): kullanıcı koyu tema profilindeyken
 * (`data-theme-profile="obsidian"`) baskı medyasında sözleşme yüzeyinin
 * arka planı `rgb(23,23,26)`, başlık rengi `rgba(245,241,232,.96)` oluyordu.
 * Tarayıcıların yazdırma diyaloğunda "arka plan grafikleri" VARSAYILAN OLARAK
 * KAPALIDIR: koyu zemin basılmaz (kağıt beyaz kalır), metin ise beyaz kalır
 * → indirilen PDF TAMAMEN BOŞ BEYAZ SAYFA.
 *
 * Ölçülen mürekkep oranı (baskı medyasında, beyaz kağıt üzerinde):
 *   hatalı durum  %0.39  (pratikte boş)
 *   düzeltilmiş   %6.12
 *
 * Bu palet, sözleşme yüzeyinde tema değişkenlerini SABİTLER; böylece içeriye
 * gömülen sözleşme HTML'indeki her `var(--color-*)` kullanımı (bugünküler ve
 * gelecekte eklenecekler) otomatik olarak okunur bir renge çözülür.
 * Şablonun kendi bilinçli gri tonları (#888/#555/#777) korunur.
 */
export const CONTRACT_PRINT_PALETTE = {
  surface: "#ffffff",
  text: "#1a1a1a",
  textMuted: "#3f3f46",
  surfaceMuted: "#f4f4f5",
  border: "#333333",
} as const;

/** Baskı yüzeyinde sabitlenen tema değişkenleri — sızıntı olursa test yakalar. */
export const CONTRACT_PRINT_PINNED_VARS = [
  "--color-text",
  "--color-text-muted",
  "--color-surface",
  "--color-surface-muted",
  "--color-border",
  "--color-primary",
] as const;
