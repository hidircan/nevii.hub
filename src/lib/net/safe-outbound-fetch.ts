/**
 * SSRF KORUMALI DIŞ İSTEK (2026-09-05).
 *
 * Sunucunun, kullanıcı etkisiyle belirlenen bir adrese istek atması (SSRF)
 * bu uygulamada OKUNABİLİR bir açıktır: indirilen bayt saklanır ve ekranda
 * gösterilir — yani iç ağdan/bulut metadata servisinden okunan içerik
 * doğrudan sızabilir. Bu yüzden dış istek yalnız BURADAN geçer.
 *
 * Uygulanan kurallar:
 *  - Yalnız `https:` (http/file/gopher/data vb. reddedilir).
 *  - Ana makine adı DNS ile çözülür ve DÖNEN TÜM adresler kontrol edilir;
 *    biri bile özel/loopback/link-local/reserved ise istek HİÇ yapılmaz.
 *  - Yönlendirmeler `redirect: "manual"` ile ELDE yürütülür; HER HOP aynı
 *    doğrulamadan geçer. Aksi hâlde meşru bir dış host, isteği
 *    `169.254.169.254` gibi bir iç adrese 302 ile taşıyabilirdi — tek başına
 *    "adres zaten kayıtlıydı" savunması bu yüzden YETERSİZDİR.
 *  - Hop sayısı ve gövde boyutu sınırlıdır (bellek/DoS).
 *
 * ponytail: DNS rebinding (doğrulama ile bağlantı arasındaki yarış) burada
 * KAPATILMADI — kapatmak, IP'ye bağlanıp TLS SNI/sertifika doğrulamasını elle
 * yönetmeyi gerektirir. Bu uç, yalnız kimliği doğrulanmış kurum yöneticisinin
 * tetiklediği tekil bir işlemdir; risk bilinçli olarak kabul edildi. Bu akış
 * kimlik doğrulamasız/otomatik hâle gelirse pinlenmiş IP ile bağlanan bir
 * agent'a geçin.
 */
import { promises as dns } from "dns";
import net from "net";

export type SafeFetchFailure = { ok: false; reason: string };
export type SafeFetchSuccess = { ok: true; response: Response; finalUrl: string };

const MAX_REDIRECTS = 3;

/** Özel/dahili adres blokları — IPv4 ve IPv6, IPv4-mapped IPv6 dahil. */
export function isBlockedAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 0) return true; // çözümlenemeyen değer güvenli sayılmaz

  if (version === 4) {
    const [a, b] = address.split(".").map(Number) as [number, number, number, number];
    if (a === 0) return true; // 0.0.0.0/8 "bu ağ"
    if (a === 10) return true; // özel
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local + bulut metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // özel
    if (a === 192 && b === 168) return true; // özel
    if (a === 192 && b === 0) return true; // 192.0.0/24 IETF protokol atamaları
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmark
    if (a >= 224) return true; // multicast (224/4) ve reserved (240/4)
    return false;
  }

  const lower = address.toLowerCase();
  // IPv4-mapped/compat (::ffff:10.0.0.1) — IPv4 kuralıyla yeniden değerlendir.
  const mapped = lower.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedAddress(mapped[1]!);
  if (lower === "::" || lower === "::1") return true; // unspecified / loopback
  const head = lower.split(":")[0] ?? "";
  if (/^f[cd]/.test(head)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(head)) return true; // fe80::/10 link-local
  if (head === "ff00" || /^ff/.test(head)) return true; // multicast
  return false;
}

async function assertPublicHost(hostname: string): Promise<string | null> {
  // IP literali de dahil: `lookup` literali aynen döndürür.
  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    return "Adres çözümlenemedi.";
  }
  if (addresses.length === 0) return "Adres çözümlenemedi.";
  if (addresses.some((a) => isBlockedAddress(a.address))) {
    return "Bu adres dahili/özel bir ağa işaret ediyor; güvenlik nedeniyle indirilemez.";
  }
  return null;
}

/**
 * Yalnız `https`, yalnız genel (public) adreslere giden, yönlendirmeleri elle
 * ve HER HOP doğrulayarak izleyen fetch. Gövdeyi OKUMAZ — çağıran, boyut
 * sınırını kendi uygular (bkz. readBodyWithLimit).
 */
export async function safeOutboundFetch(
  rawUrl: string,
  options: { timeoutMs?: number } = {}
): Promise<SafeFetchSuccess | SafeFetchFailure> {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let url: URL;
    try {
      url = new URL(current);
    } catch {
      return { ok: false, reason: "Geçersiz adres." };
    }
    if (url.protocol !== "https:") {
      return { ok: false, reason: "Yalnız https ile başlayan adresler indirilebilir." };
    }
    const hostProblem = await assertPublicHost(url.hostname);
    if (hostProblem) return { ok: false, reason: hostProblem };

    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      });
    } catch {
      return { ok: false, reason: "Adrese ulaşılamadı." };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { ok: false, reason: "Yönlendirme hedefi okunamadı." };
      // Sonraki hop DÖNGÜ BAŞINDA yeniden doğrulanır — iç ağa 302 ile
      // sıçramanın engellendiği yer tam olarak burasıdır.
      current = new URL(location, url).toString();
      continue;
    }
    return { ok: true, response, finalUrl: url.toString() };
  }
  return { ok: false, reason: "Çok fazla yönlendirme." };
}

/**
 * Gövdeyi en fazla `maxBytes` kadar okur. `Content-Length` yalanabileceği için
 * akış sırasında da sayılır — sunucu belleği "küçük" diyen bir başlıkla
 * doldurulamaz.
 */
export async function readBodyWithLimit(response: Response, maxBytes: number): Promise<Buffer | null> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!response.body) return null;

  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}
