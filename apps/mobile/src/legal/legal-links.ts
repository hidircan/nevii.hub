/**
 * Yasal linkler — tek kaynak. URL'ler yapılandırılmadıysa `null` döner;
 * arayüz placeholder URL hard-code ETMEZ, eksikliği release blocker olarak
 * gösterir. Değerler daha sonra app.json `extra` / EAS env üzerinden
 * doldurulacak (şu an backend/hukuki karar bekleniyor — bkz. release docs).
 *
 * Hesap oluşturma mobilde desteklenmiyor (kurumun verdiği hesap) — buna
 * rağmen Apple/Google hesap-silme gereksinimi için sahte "silindi"
 * davranışı YOK; silme akışı kurum yöneticisi üzerinden bilgi ekranıdır.
 */
export type LegalLinks = {
  privacyPolicyUrl: string | null;
  termsUrl: string | null;
  /** Google Play'in istediği uygulama-dışı herkese açık silme talep URL'i. */
  accountDeletionUrl: string | null;
};

export function getLegalLinks(): LegalLinks {
  return {
    privacyPolicyUrl: null,
    termsUrl: null,
    accountDeletionUrl: null,
  };
}

/** Yapılandırılmamış yasal URL'ler release blocker'dır. */
export function missingLegalLinks(links: LegalLinks): Array<keyof LegalLinks> {
  return (Object.keys(links) as Array<keyof LegalLinks>).filter((k) => !links[k]);
}
