import { BRAND } from "./brand";

/**
 * Merkezi site/kurum bilgileri — hukuki sayfalar (`/gizlilik`,
 * `/kullanim-kosullari`, `/hesap-silme-talebi`) ve store metinleri BURADAN
 * beslenir. TEK yapılandırma noktası.
 *
 * Kural: doğrulanmamış kurum unvanı/adres/MERSİS/iletişim ASLA uydurulmaz.
 * Env ile verilmedikçe alanlar boştur (`null`) ve sayfalar genel ifadeler
 * kullanır ("uygulama sağlayıcısı", "kurumunuz") — sahte bilgi YOK,
 * placeholder URL YOK.
 *
 * - NEVII_ORG_NAME: uygulamanın hukuki muhatabı (örn. kurum/şirket unvanı)
 * - NEVII_ORG_ADDRESS: tebligat/adres satırı
 * - NEVII_ORG_EMAIL: gizlilik/iletişim e-postası
 * - NEVII_LEGAL_EFFECTIVE_DATE: metinlerin yürürlük tarihi (yyyy-AA-gg)
 */
export type SiteConfig = {
  appName: string;
  orgName: string | null;
  orgAddress: string | null;
  orgEmail: string | null;
  effectiveDate: string | null;
};

function clean(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

export function getSiteConfig(env: NodeJS.ProcessEnv = process.env): SiteConfig {
  return {
    appName: BRAND.name,
    orgName: clean(env.NEVII_ORG_NAME),
    orgAddress: clean(env.NEVII_ORG_ADDRESS),
    orgEmail: clean(env.NEVII_ORG_EMAIL),
    effectiveDate: clean(env.NEVII_LEGAL_EFFECTIVE_DATE),
  };
}

/** Muhatap cümlelerde kullanılır: unvan varsa o, yoksa genel ifade. */
export function orgDisplayName(cfg: SiteConfig): string {
  return cfg.orgName ?? `${cfg.appName} uygulaması sağlayıcısı`;
}
