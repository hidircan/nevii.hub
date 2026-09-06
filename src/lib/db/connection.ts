/**
 * PostgreSQL bağlantı yapılandırması — node `pg` sürücüsü için TEK kaynak.
 *
 * NEDEN: Supabase pooler (`*.pooler.supabase.com`) sertifikasını KENDİ özel
 * CA'sı ("Supabase Root 2021 CA") ile imzalar; bu CA public trust store'da
 * YOKTUR. `pg` 8.23 + `pg-connection-string` 2.14 ile birlikte connection
 * string'deki `sslmode=require` artık libpq anlamına gelmiyor (libpq'da
 * "şifrele, doğrulama" demekti) — sertifika TAM doğrulanıyor ve bağlantı
 * `SELF_SIGNED_CERT_IN_CHAIN` ile düşüyor. `sslmode` hiç verilmezse de `pg`
 * TLS'i tamamen kapatıyor, yani trafik ŞİFRESİZ gidiyor.
 *
 * ÇÖZÜM: doğrulamayı kapatmak (`rejectUnauthorized: false`) yerine Supabase'in
 * yayınladığı kök sertifikayı PINLE ve tam doğrulama yap. Aşağıdaki PEM,
 * Supabase'in yayınladığı `prod-ca-2021.crt` ile bire bir aynıdır:
 *   SHA-256: 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:
 *            82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA
 *   Geçerlilik: 2021-04-28 → 2031-04-26
 * Doğrulamak için:
 *   openssl x509 -in <(...) -noout -fingerprint -sha256
 *
 * GİZLİLİK: bu modül connection string'i, parolayı veya host'u LOGLAMAZ.
 */

/** Supabase Root 2021 CA — https://supabase.com > Database Settings > SSL. */
export const SUPABASE_ROOT_CA_2021 = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----
`;

export type PgConnection = {
  /** `pg` Pool/Client'a verilecek connection string (ssl parametreleri temizlenmiş). */
  connectionString: string;
  /** Açık TLS yapılandırması; Supabase dışı host'larda `undefined`. */
  ssl?: { ca: string; rejectUnauthorized: true; servername: string };
};

/** `pg`'nin connection string'den okuduğu, bizim override etmemiz gereken anahtarlar. */
const SSL_PARAMS = ["sslmode", "ssl", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"];

function isSupabaseHost(hostname: string): boolean {
  return hostname.endsWith(".pooler.supabase.com") || hostname.endsWith(".supabase.co");
}

/**
 * DATABASE_URL'i `pg` için normalize eder.
 *
 * `pg`, `new Pool({ connectionString, ssl })` çağrısında connection string'i
 * PARSE EDİP açık `ssl` alanının ÜSTÜNE yazar (bkz. pg/lib/connection-parameters.js:
 * `Object.assign({}, config, parse(config.connectionString))`). Bu yüzden
 * ssl parametrelerini string'den ÇIKARIP TLS'i açıkça veriyoruz — aksi halde
 * pinlenen CA sessizce yok sayılırdı.
 */
export function resolvePgConnection(rawUrl: string): PgConnection {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { connectionString: rawUrl };
  }

  if (!isSupabaseHost(url.hostname)) return { connectionString: rawUrl };

  for (const param of SSL_PARAMS) url.searchParams.delete(param);

  return {
    connectionString: url.toString(),
    ssl: { ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true, servername: url.hostname },
  };
}
