/**
 * P0 (2026-09-05) — şifre oluşturma/sıfırlama SONRASI oturumu KORU ve doğru
 * portalı bildir. `accept-invitation` ve `reset-password` rotalarının ORTAK
 * son adımı; iki rotada mantık ikilenmez.
 *
 * Oturum: token zaten tek kullanımlık ve TÜKETİLMİŞTİR; kullanıcıyı bir de
 * `/login`e atıp şifresini yeniden yazdırmak gereksizdi. Burada `/login` ile
 * AYNI `issueTokenPair` + `applyAuthCookies` yolu kullanılır — ayrı/paralel
 * bir oturum mekanizması YOKTUR.
 */
import { NextResponse } from "next/server";
import { getUserById } from "./users";
import { issueTokenPair } from "./jwt";
import { applyAuthCookies } from "./cookies";
import {
  detectClientSurface,
  detectMobilePlatform,
  resolvePostPasswordDestination,
  type ClientSurface,
} from "./post-password-routing";

/** Uygulama tanımlı DEĞİLSE (env yok) hiçbir derin bağlantı/mağaza bağlantısı üretilmez. */
export function getMobileAppConfig() {
  return {
    scheme: process.env.MOBILE_APP_SCHEME || undefined,
    appStoreUrl: process.env.APP_STORE_URL || undefined,
    playStoreUrl: process.env.PLAY_STORE_URL || undefined,
  };
}

export async function buildPasswordSetupSessionResponse(input: {
  userId: string;
  request: Request;
  /** İstemcinin bildirdiği ortam — YALNIZ sunum; rol/portal kararını ETKİLEMEZ. */
  surface?: string;
}): Promise<NextResponse> {
  // Rol GÜVENİLİR kaynaktan: token'ın sahibi olan kullanıcı kaydı.
  const user = await getUserById(input.userId);
  if (!user) {
    // Şifre zaten güncellendi; portal bilgisi veremesek de akışı kırmayalım.
    return NextResponse.json({ ok: true as const, data: { destination: { webPath: "/login" } } });
  }

  const userAgent = input.request.headers.get("user-agent") ?? "";
  const surface: ClientSurface =
    input.surface === "mobile_app" || input.surface === "mobile_web" || input.surface === "desktop_web"
      ? input.surface
      : detectClientSurface(userAgent);

  const destination = resolvePostPasswordDestination({
    role: user.role,
    surface,
    app: getMobileAppConfig(),
    platform: detectMobilePlatform(userAgent),
  });

  // 10. tur iş #1 — davet kabulü sonrası JWT bayat pasif kayda kilitlenmesin
  // (kabul, bekleyen erişimleri aktive ETTİKTEN SONRA çağrılır — bkz. route).
  let setupStudentId = user.studentId;
  if (user.role === "STUDENT") {
    try {
      const { resolvePortalStudent } = await import("../portal-context");
      const resolved = await resolvePortalStudent(user.tenantId, user.userId, user.studentId ?? null);
      if (resolved.status === "ok") setupStudentId = resolved.studentId;
    } catch {
      setupStudentId = user.studentId;
    }
  }
  const tokens = await issueTokenPair({ ...user, studentId: setupStudentId });
  const res = NextResponse.json({
    ok: true as const,
    data: { role: user.role, destination },
  });
  applyAuthCookies(res, tokens);
  return res;
}
