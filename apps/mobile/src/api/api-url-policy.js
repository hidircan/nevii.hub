/**
 * Production API URL politikası — saf, RN-bağımsız (CommonJS: hem `app.config.js`
 * build-time kontrolü hem de runtime `client.ts` kullanır; tek kaynak).
 *
 * Production (mağaza) build'i yalnız genel HTTPS backend'e bakabilir:
 * localhost/127.*, LAN IP (10.*, 172.16–31.*, 192.168.*), link-local, `.local`,
 * tek etiketli host ve düz http:// reddedilir. Dev/preview bu kuralı almaz.
 */

const PRIVATE_IPV4 = /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/** Güvensizse nedenini (Türkçe), güvenliyse null döner. */
function unsafeProductionApiUrlReason(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "EXPO_PUBLIC_API_URL tanımlı değil";
  let url;
  try {
    url = new URL(value);
  } catch {
    return "EXPO_PUBLIC_API_URL geçerli bir URL değil";
  }
  if (url.protocol !== "https:") return "production build yalnız https:// kullanabilir (http reddedildi)";
  if (url.username || url.password) return "URL kullanıcı bilgisi içeremez";
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return "localhost production build'de kullanılamaz";
  if (host.endsWith(".local") || host.endsWith(".internal")) return "yerel ağ adı (.local/.internal) production build'de kullanılamaz";
  if (host.includes(":")) return "IPv6 adresi production build'de kullanılamaz";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return PRIVATE_IPV4.test(host)
      ? "özel/LAN IP adresi production build'de kullanılamaz"
      : "ham IP adresi production build'de kullanılamaz (alan adı kullanın)";
  }
  if (!host.includes(".")) return "tek etiketli host production build'de kullanılamaz";
  return null;
}

/** Production varyantında güvensiz URL'yi fail-fast reddeder. */
function assertProductionApiUrl(raw) {
  const reason = unsafeProductionApiUrlReason(raw);
  if (reason) {
    throw new Error(
      `[Nevii Hub] Production build durduruldu: ${reason}. ` +
        "EXPO_PUBLIC_API_URL production için genel bir HTTPS backend adresi olmalı (bkz. docs/release/MOBILE_PRODUCTION_RELEASE_RUNBOOK.md)."
    );
  }
}

module.exports = { unsafeProductionApiUrlReason, assertProductionApiUrl };
