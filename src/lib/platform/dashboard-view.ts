/**
 * Özet görünüm tercihi — sunucu + istemci ortak sabitleri.
 * (İstemci dosyasından sunucu bileşenine sabit aktarılamaz; bu modül
 * framework-bağımsız saf sabittir.)
 */

/** Tercih çerezi: gizli bölüm id'leri, virgülle ayrılmış. */
export const DASHBOARD_VIEW_COOKIE = "neviios-ozet";

/** Özet bölümleri — id'ler platform/page.tsx ile aynı olmalı. */
export const DASHBOARD_SECTIONS = [
  { id: "gostergeler", label: "Özet kartları" },
  { id: "hizli", label: "Hızlı işlemler" },
  { id: "bekleyen", label: "Bekleyen işler" },
  { id: "odemeler", label: "Son ödeme hareketleri" },
  { id: "hareketler", label: "Son hareketler" },
  { id: "arama", label: "Kurum ara ve dağılım" },
  { id: "durum", label: "Sistem durumu" },
] as const;

export type DashboardSectionId = (typeof DASHBOARD_SECTIONS)[number]["id"];
