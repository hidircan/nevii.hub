/**
 * Yasal linkler — tek kaynak. URL'ler backend'in public hukuki
 * sayfalarına (`/gizlilik`, `/kullanim-kosullari`, `/hesap-silme-talebi`)
 * işaret eder; API taban adresinden türetilir — placeholder URL YOK.
 * Arayüz bu modül DIŞINDA yasal URL hard-code ETMEZ.
 *
 * NOT: taban adres `api/client.ts` ile AYNI kuralla çözülür
 * (`EXPO_PUBLIC_API_URL`, sondaki `/` temizlenir) ama bu modül
 * React Native'e BAĞIMLANMAZ (node test ortamında da çalışır).
 */
export type LegalLinks = {
  privacyPolicyUrl: string;
  termsUrl: string;
  /** Google Play'in istediği uygulama-dışı herkese açık silme talep URL'i. */
  accountDeletionUrl: string;
};

export function resolveLegalBaseUrl(raw: string | undefined): string {
  return (raw ?? "http://localhost:3000").trim().replace(/\/+$/, "");
}

export function getLegalLinks(): LegalLinks {
  const base = resolveLegalBaseUrl(process.env.EXPO_PUBLIC_API_URL);
  return {
    privacyPolicyUrl: `${base}/gizlilik`,
    termsUrl: `${base}/kullanim-kosullari`,
    accountDeletionUrl: `${base}/hesap-silme-talebi`,
  };
}

/** Yapılandırılmamış yasal URL'ler release blocker'dır (artık hepsi dolu). */
export function missingLegalLinks(links: LegalLinks): Array<keyof LegalLinks> {
  return (Object.keys(links) as Array<keyof LegalLinks>).filter((k) => !links[k]);
}
