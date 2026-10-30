import { z } from "zod";
import { NextResponse } from "next/server";
import { jsonFail } from "@/lib/api/http";
import type { ApiHandlerArgs } from "@/lib/api/handler";
import { authenticateUser, issueTokenPair, auditLog } from "@/lib/auth";
import { applyAuthCookies } from "@/lib/auth/cookies";
import { nowSec } from "@/lib/session-policy";
import { clientIp } from "@/lib/http/client-ip";
import { consumeRateLimit } from "@/lib/rate-limit";
import { startUserSession } from "@/lib/auth/session-registry";
import { TURNSTILE_FAILURES, turnstileStatus, verifyTurnstileToken } from "@/lib/auth/turnstile";
import { clearLoginThrottle, LOGIN_THROTTLE_WINDOW_MS, readLoginThrottle, recordLoginFailure } from "@/lib/auth/login-throttle";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  /** N — istemci "başka cihazda aktif" onay diyaloğunu gösterebiliyorsa true. */
  clientSupportsTakeover: z.boolean().optional(),
  /** N — kullanıcı onayladı: diğer oturumu kapat ve giriş yap. */
  takeover: z.boolean().optional(),
  /** Web formundaki Turnstile token'ı (tek kullanımlık). */
  turnstileToken: z.string().max(4096).optional(),
});

const LOGIN_RATE_WINDOW_MS = 15 * 60_000;
const LOGIN_RATE_MAX_PER_IP = 20;
const LOGIN_RATE_MAX_PER_IP_EMAIL = 5;
/** Native uçta Turnstile yok: IP başına sınır web'in yarısıdır. */
const LOGIN_RATE_MAX_PER_IP_NATIVE = 10;

/**
 * Giriş akışının tek gövdesi. İki kapı vardır ve ayrım istemcinin beyanına değil
 * çağrılan uca dayanır (bypass başlığı yoktur):
 * - `web` (POST /api/v1/auth/login): Turnstile etkinse HER istekte token şarttır;
 *   JWT gövdede + HttpOnly çerez.
 * - `native` (POST /api/v1/auth/mobile/login): Turnstile çalışamadığı için token
 *   istemez; çerez yazmaz, sıkı rate limit uygular ve platform sahibi hesabını açmaz.
 */
export async function handleLogin({ body, ctx, request }: ApiHandlerArgs, channel: "web" | "native") {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", "Geçerli bir e-posta adresi ve şifre girin.", parsed.error.flatten());
    }

    const ip = clientIp(request);
    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    // Two buckets: coarse per-IP (any account) and tighter per-IP+account, so a single
    // attacker can't credential-stuff many accounts from one IP, nor hammer one account.
    const ipOk = consumeRateLimit("auth-login-ip", ip, {
      windowMs: LOGIN_RATE_WINDOW_MS,
      max: LOGIN_RATE_MAX_PER_IP,
    });
    const ipEmailOk = consumeRateLimit("auth-login-ip-email", `${ip}:${normalizedEmail}`, {
      windowMs: LOGIN_RATE_WINDOW_MS,
      max: LOGIN_RATE_MAX_PER_IP_EMAIL,
    });
    const nativeOk =
      channel !== "native" ||
      consumeRateLimit("auth-login-native-ip", ip, { windowMs: LOGIN_RATE_WINDOW_MS, max: LOGIN_RATE_MAX_PER_IP_NATIVE });
    if (!ipOk || !ipEmailOk || !nativeOk) {
      auditLog({
        action: "auth.login_rate_limited",
        requestId: ctx.requestId || "unknown",
        outcome: "denied",
        meta: { email: normalizedEmail },
      });
      const res = jsonFail("RATE_LIMITED", "Çok fazla giriş denemesi yapıldı. Güvenlik için 15 dakika bekleyip tekrar deneyin.");
      res.headers.set("Retry-After", String(Math.ceil(LOGIN_RATE_WINDOW_MS / 1000)));
      return res;
    }

    // Hesap sınırı IP'den bağımsızdır: dağıtık deneme de burada durur. Yanıt IP sınırıyla aynıdır.
    const throttle = await readLoginThrottle(normalizedEmail);
    if (throttle.blocked) {
      auditLog({
        action: "auth.login_account_throttled",
        requestId: ctx.requestId || "unknown",
        outcome: "denied",
        meta: { email: normalizedEmail },
      });
      const res = jsonFail("RATE_LIMITED", "Çok fazla giriş denemesi yapıldı. Güvenlik için 15 dakika bekleyip tekrar deneyin.");
      res.headers.set("Retry-After", String(Math.ceil(LOGIN_THROTTLE_WINDOW_MS / 1000)));
      return res;
    }

    // Parolaya bakılmadan önce: doğrulamayı geçmeyen istek parola bilgisi öğrenemez.
    const turnstile = turnstileStatus();
    if (channel === "web" && (turnstile === "active" || turnstile === "observe")) {
      const check = await verifyTurnstileToken(parsed.data.turnstileToken, {
        requestHost: new URL(request.url).hostname,
        remoteIp: ip,
      });
      if (!check.ok || turnstile === "observe") {
        auditLog({
          action: turnstile === "observe" ? "auth.login_turnstile_observed" : "auth.login_turnstile_failed",
          requestId: ctx.requestId || "unknown",
          outcome: check.ok ? "success" : "denied",
          meta: { email: normalizedEmail, reason: check.ok ? "passed" : check.reason },
        });
      }
      if (!check.ok && turnstile === "active") {
        const failure = TURNSTILE_FAILURES[check.reason];
        return NextResponse.json({ ok: false as const, error: { code: failure.code, message: failure.message } }, { status: failure.status });
      }
    }

    const authenticated = await authenticateUser(parsed.data.email, parsed.data.password);
    if (!authenticated) await recordLoginFailure(normalizedEmail);
    else if (throttle.hasCounter) await clearLoginThrottle(normalizedEmail);
    // Platform sahibi hesabı challenge'sız uçtan açılamaz; yanıt hatalı parolayla aynıdır.
    const user = channel === "native" && authenticated?.role === "HYPER_ADMIN" ? null : authenticated;
    if (!user) {
      auditLog({
        action: "auth.login_failed",
        requestId: ctx.requestId || "unknown",
        outcome: "denied",
        meta: { email: parsed.data.email },
      });
      return jsonFail("UNAUTHORIZED", "E-posta veya şifre hatalı. Bilgileri kontrol edin; şifrenizi hatırlamıyorsanız “Şifremi unuttum” bağlantısını kullanın.");
    }

    // N — tek aktif oturum. Son 30 dk'da görülmüş başka oturum varsa ve istemci onay
    // diyaloğunu destekliyorsa giriş durur; onaylanırsa (takeover) eski oturum kapatılır.
    // Diyalog desteklemeyen istemcide (eski mobil sürüm) kural yine uygulanır: eski oturum kapanır.
    const { listOpenSessions, closeOpenSessions, isRecentlyActive } = await import("@/lib/auth/session-concurrency");
    let openSessions: Awaited<ReturnType<typeof listOpenSessions>> = [];
    try {
      openSessions = await listOpenSessions(user.userId);
    } catch {
      openSessions = []; // oturum kaydı okunamazsa giriş engellenmez (sid'siz akışla aynı davranış)
    }
    const activeElsewhere = openSessions.filter((row) => isRecentlyActive(row));
    if (activeElsewhere.length > 0 && parsed.data.clientSupportsTakeover && !parsed.data.takeover) {
      const latest = activeElsewhere[0]!;
      return NextResponse.json(
        {
          ok: false as const,
          error: {
            code: "SESSION_ACTIVE_ELSEWHERE",
            message: "Bu kullanıcı şu anda başka bir cihazda aktif. Devam ederseniz mevcut oturum kapatılacaktır.",
            details: { device: latest.device, lastSeenAt: latest.lastSeenAt },
          },
        },
        { status: 409 }
      );
    }
    if (openSessions.length > 0) {
      const closed = await closeOpenSessions(user.userId, openSessions);
      if (activeElsewhere.length > 0) {
        auditLog({
          action: "auth.session_takeover",
          requestId: ctx.requestId || "unknown",
          userId: user.userId,
          tenantId: user.tenantId,
          role: user.role,
          outcome: "success",
          meta: { closedSessions: closed, previousDevice: activeElsewhere[0]!.device },
        });
      }
    }

    // NeviiOS: tekil oturum kaydı (sid) — canlı operasyon ekranından sonlandırılabilir.
    const sid = await startUserSession(user, request);
    // 10. tur iş #1 — veli/öğrenci JWT'si bayat bir pasif kayda kilitlenmesin:
    // girişte varsayılan bağlam, aktif erişimi olan AKTİF öğrenciye çözülür.
    // Çözümleme başarısız olursa eski davranış (user.studentId) korunur.
    let loginStudentId = user.studentId;
    if (user.role === "STUDENT") {
      try {
        const { resolvePortalStudent, PORTAL_STUDENT_COOKIE } = await import("@/lib/portal-context");
        // Önceki oturumda seçilmiş öğrenci (HttpOnly cookie) varsa tercih edilir —
        // çözümleyici erişim + aktiflik doğrulaması yapar, geçersizse yok sayar.
        let cookiePreferred: string | null = null;
        try {
          const cookieHeader = request.headers.get("cookie") ?? "";
          const match = cookieHeader
            .split(";")
            .map((p) => p.trim().split("="))
            .find(([k]) => k === PORTAL_STUDENT_COOKIE);
          const raw = match?.[1]?.trim();
          cookiePreferred = raw ? decodeURIComponent(raw).slice(0, 128) : null;
        } catch {
          cookiePreferred = null;
        }
        const resolved = await resolvePortalStudent(
          user.tenantId,
          user.userId,
          cookiePreferred || user.studentId || null
        );
        if (resolved.status === "ok") loginStudentId = resolved.studentId;
      } catch {
        loginStudentId = user.studentId;
      }
    }
    // Web hareketsizlik politikası yalnız tarayıcı oturumuna: tarayıcı POST'ta Origin gönderir, mobil (React Native)
    // göndermez. act token'a gömülür ve hangi yoldan gelirse gelsin uygulanır (çerez/Bearer ayrımı yok).
    const browserLogin = channel === "web" && Boolean(request.headers.get("origin"));
    const tokens = await issueTokenPair({ ...user, studentId: loginStudentId, sid, ...(browserLogin ? { act: nowSec() } : {}) });
    auditLog({
      action: "auth.login_success",
      requestId: ctx.requestId || "unknown",
      userId: user.userId,
      tenantId: user.tenantId,
      role: user.role,
      outcome: "success",
    });

    // P1 (2026-09-11) — workspace bootstrap: YALNIZCA giriş yapan hesabın
    // kaydı istemci önbelleğine yazılır (Ezgi/Nihal ayrımı). Kayıt yoksa
    // varsayılanlar; policy'e aykırı kayıtlı değer güvenli değere düşer.
    // `resumeTo`, rolüne hâlâ yetkili olduğu son güvenli rotadır.
    let resumeTo: string | null = null;
    let bootstrap:
      | { theme: string; font: string; density: string; collapsed: boolean | null }
      | null = null;
    try {
      const { getUserPreferences, resolveResumeRoute } = await import("@/lib/user-preferences");
      const { clampPreferencesToPolicy } = await import("@/lib/appearance-policy");
      const prefs = await getUserPreferences(user.userId, user.tenantId);
      const clamped = clampPreferencesToPolicy({
        themeProfile: prefs.themeProfile,
        fontChoice: prefs.fontChoice,
        density: prefs.density,
      });
      bootstrap = {
        theme: clamped.themeProfile,
        font: clamped.fontChoice,
        density: clamped.density,
        collapsed: typeof prefs.sidebarCollapsed === "boolean" ? prefs.sidebarCollapsed : null,
      };
      const home = user.role === "TEACHER" ? "/ogretmen" : user.role === "STUDENT" ? "/ogrenci" : "/panel";
      const resolved = resolveResumeRoute(user.role, prefs.lastRoute, home);
      resumeTo = resolved === home ? null : resolved;
    } catch {
      // best-effort — giriş BAŞARILIDIR, bootstrap sessizce atlanır.
    }

    const res = NextResponse.json({
      ok: true as const,
      data: {
        user: {
          userId: user.userId,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          teacherId: user.teacherId,
          studentId: loginStudentId,
        },
        resumeTo,
        ...tokens,
      },
    });
    if (channel === "native") return res;
    const year = 60 * 60 * 24 * 365;
    let lang: "tr" | "en" = "tr";
    if (user.role !== "HYPER_ADMIN") {
      try {
        const { resolveTenantLanguage } = await import("@/lib/i18n/locale");
        lang = await resolveTenantLanguage(user.tenantId);
      } catch {
        lang = "tr";
      }
    }
    res.cookies.set("nevii_lang", lang, { path: "/", maxAge: year, sameSite: "lax" });
    if (bootstrap) {
      res.cookies.set("notaplan_theme_profile", bootstrap.theme, { path: "/", maxAge: year, sameSite: "lax" });
      res.cookies.set("notaplan_font", bootstrap.font, { path: "/", maxAge: year, sameSite: "lax" });
      res.cookies.set("notaplan_density", bootstrap.density, { path: "/", maxAge: year, sameSite: "lax" });
      if (bootstrap.collapsed !== null) {
        res.cookies.set("notaplan_sidebar_collapsed", bootstrap.collapsed ? "1" : "0", {
          path: "/",
          maxAge: year,
          sameSite: "lax",
        });
      }
    }
    applyAuthCookies(res, tokens);
    return res;
}
