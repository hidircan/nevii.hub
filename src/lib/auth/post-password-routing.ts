/**
 * P0 (2026-09-05) — DAVET SONRASI YÖNLENDİRME.
 *
 * Kullanıcı raporu: davet edilen öğrenci/öğretmen şifresini oluşturduktan
 * sonra her durumda `/login`e atılıyordu — doğru portala değil. Beklenen:
 * rolüne ve içinde bulunduğu istemciye göre doğru portala gitmek.
 *
 * TASARIM KURALLARI (hepsi bilinçli):
 * - ROL, GÜVENİLİR sunucu verisinden gelir (davet token'ının sahibi olan
 *   kullanıcı kaydı) — user-agent'tan ya da client'ın gönderdiği bir
 *   alandan ASLA türetilmez. İstemci yalnızca "hangi ortamdayım" bilgisini
 *   (mobil/masaüstü) etkiler, HANGİ PORTALA gideceğini DEĞİL.
 * - AÇIK YÖNLENDİRME (open redirect) mümkün değildir: yönlendirme hedefi
 *   bu dosyadaki SABİT tablodan seçilir, hiçbir zaman kullanıcı girdisinden
 *   üretilmez. `isSafeInternalPath` dışarıdan gelen bir `next` parametresi
 *   kullanılacaksa tek geçit noktasıdır.
 * - MOBİL UYGULAMA HENÜZ YAYINDA DEĞİLSE SAHTE bir uygulama rotası/derin
 *   bağlantı ÜRETİLMEZ: derin bağlantı yalnızca `MOBILE_APP_SCHEME`
 *   tanımlıysa, mağaza bağlantısı yalnızca `APP_STORE_URL`/`PLAY_STORE_URL`
 *   tanımlıysa döner. Tanımlı değilse istemci doğrudan mobil web portalına
 *   gider — kırık bağlantı ya da yönlendirme döngüsü OLUŞMAZ.
 */
import type { AppRole } from "./types";
import { homePathForRole } from "./role-routes";

/** İstemci ortamı — sunucu bunu DAYATMAZ, istemci kendi ortamını bildirir; yalnız sunum/derin bağlantı seçimini etkiler. */
export type ClientSurface = "desktop_web" | "mobile_web" | "mobile_app";

export type PostPasswordDestination = {
  /** Her durumda geçerli olan web portal yolu — derin bağlantı çalışmazsa güvenli düşüş noktası. */
  webPath: string;
  /**
   * Mobil web'de uygulamayı açmayı DENEYECEK bağlantı. Yalnızca uygulama
   * gerçekten tanımlıysa (env) döner; aksi halde `undefined` — istemci
   * doğrudan `webPath`e gider.
   */
  deepLink?: string;
  /** Uygulama kurulu değilse gösterilecek mağaza bağlantısı (varsa). */
  appDownloadUrl?: string;
};

/** Rol → uygulama derin bağlantısının portal segmenti. Web yollarıyla AYNI ayrımı korur. */
const APP_PORTAL_SEGMENT: Partial<Record<AppRole, string>> = {
  STUDENT: "ogrenci",
  TEACHER: "ogretmen",
};

/**
 * Sadece uygulama İÇİ (in-app) bağlam için: uygulamanın kendi portal yolu.
 * Uygulama webview'da açıldığında web yolu zaten doğru portaldır — bu yüzden
 * ayrı bir "sahte" native rota UYDURULMAZ, aynı web yolu kullanılır.
 */
export function portalPathForRole(role: AppRole): string {
  return homePathForRole(role);
}

export type MobileAppConfig = {
  /** ör. "neviihub" → neviihub://ogrenci . Tanımsızsa derin bağlantı hiç üretilmez. */
  scheme?: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
};

export function resolvePostPasswordDestination(input: {
  role: AppRole;
  surface: ClientSurface;
  app?: MobileAppConfig;
  /** iOS/Android ayrımı — yalnız hangi mağaza bağlantısının döneceğini etkiler. */
  platform?: "ios" | "android" | "unknown";
}): PostPasswordDestination {
  const webPath = portalPathForRole(input.role);
  const segment = APP_PORTAL_SEGMENT[input.role];

  // Masaüstü ya da zaten uygulamanın içindeysek: doğrudan portal, derin
  // bağlantı denemesi YOK (uygulama içinde kendi kendini açmaya çalışmak
  // yönlendirme döngüsü riskidir).
  if (input.surface !== "mobile_web" || !segment) return { webPath };

  const scheme = input.app?.scheme?.trim();
  const store =
    input.platform === "ios"
      ? input.app?.appStoreUrl
      : input.platform === "android"
        ? input.app?.playStoreUrl
        : undefined;

  return {
    webPath,
    deepLink: scheme ? `${scheme}://${segment}` : undefined,
    appDownloadUrl: scheme ? store || undefined : undefined,
  };
}

/**
 * Dışarıdan gelen bir yönlendirme hedefi (ör. `?next=`) KULLANILACAKSA tek
 * geçit: yalnız tek eğik çizgiyle başlayan, protokole/host'a kaçamayan
 * göreli yollar kabul edilir. `//evil.com`, `https://evil.com`, `\\evil.com`
 * ve `javascript:` reddedilir.
 */
export function isSafeInternalPath(path: string | null | undefined): boolean {
  if (!path) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//") || path.startsWith("/\\")) return false;
  return true;
}

/** UA'dan istemci ortamı tahmini — YALNIZ sunum içindir, yetki/rol kararında ASLA kullanılmaz. */
export function detectClientSurface(userAgent: string, inAppFlag = false): ClientSurface {
  if (inAppFlag) return "mobile_app";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ? "mobile_web" : "desktop_web";
}

export function detectMobilePlatform(userAgent: string): "ios" | "android" | "unknown" {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "unknown";
}
