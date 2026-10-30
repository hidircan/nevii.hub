"use client";

import { useState } from "react";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { TurnstileField } from "@/components/turnstile-field";
import { ModalShell, modalButton } from "@/components/modal-shell";
import { authCopy, formatInLocale, loginErrorText, type AppLocale } from "@/lib/i18n/copy";
import { resolvePlatformLoginDest, resolveSafeLoginNext } from "@/lib/auth/role-routes";
import type { AppRole } from "@/lib/auth/types";

/**
 * P0 UAT (2026-09-07) — GİRİŞ EKRANINDA DEMO KİMLİK BİLGİSİ YOK.
 *
 * Burada eskiden `DEMO_PERSONAS` adlı, 14 hesabın e-posta ve AÇIK METİN
 * PAROLASINI içeren bir dizi vardı ve "Demo ile giriş" düğmeleri olarak
 * render ediliyordu. Bu bir client component olduğu için o parolalar
 * yalnızca ekranda değil, HER ZİYARETÇİYE giden JS paketinin İÇİNDE de
 * bulunuyordu — koşullu gizleme bunu çözmezdi, bu yüzden liste tamamen
 * SİLİNDİ (parola alanının ön-doldurulması da kaldırıldı).
 *
 * Test hesapları test veritabanında durmaya devam eder; envanterleri
 * `docs/testing/TEST_ACCOUNT_CATALOG.md`'de PAROLASIZ tutulur, parolalar
 * yalnız parola yöneticisinde saklanır.
 *
 * NOT (operatör aksiyonu): bu parolalar git geçmişinde kalmıştır; ekrandan
 * kaldırılmaları rotasyon YERİNE GEÇMEZ.
 */
export function LoginForm({
  nextPath,
  lang = "tr",
  platformGate = false,
  turnstileSiteKey = null,
  turnstileRequired = true,
}: {
  nextPath?: string;
  lang?: AppLocale;
  /** NeviiOS platform kapısı: HYPER_ADMIN yalnız /platform altına, kurum rolleri kendi evine gider. */
  platformGate?: boolean;
  /** Koruma etkinse public anahtar; null ise widget çizilmez. */
  turnstileSiteKey?: string | null;
  /** false: gözlem modu; doğrulama bitmese de giriş açık kalır. */
  turnstileRequired?: boolean;
}) {
  const copy = authCopy(lang);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  // N — "başka cihazda aktif" onayı: cihaz özeti + son görülme.
  const [takeoverInfo, setTakeoverInfo] = useState<{ device: string | null; lastSeenAt: string | null } | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileRound, setTurnstileRound] = useState(0);
  const challengePending = !!turnstileSiteKey && turnstileRequired && !turnstileToken;
  /** Token tek kullanımlıktır: sonuçsuz her denemeden sonra alan yeniden kurulur. */
  const renewTurnstile = () => {
    setTurnstileToken(null);
    setTurnstileRound((n) => n + 1);
  };
  const turnstileField = turnstileSiteKey ? (
    <TurnstileField key={turnstileRound} siteKey={turnstileSiteKey} lang={lang} onToken={setTurnstileToken} showErrors={turnstileRequired} />
  ) : null;

  async function performLogin(loginEmail: string, loginPassword: string, takeover = false) {
    if (challengePending) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
          clientSupportsTakeover: true,
          takeover,
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { user: { role: string }; resumeTo?: string | null };
        error?: { code?: string; message: string; details?: { device?: string | null; lastSeenAt?: string | null } };
      };
      if (!json.ok) renewTurnstile();
      if (!json.ok && json.error?.code === "SESSION_ACTIVE_ELSEWHERE") {
        setTakeoverInfo({ device: json.error.details?.device ?? null, lastSeenAt: json.error.details?.lastSeenAt ?? null });
        setLoading(false);
        return;
      }
      setTakeoverInfo(null);
      if (!json.ok) {
        setError(loginErrorText(lang, json.error?.code, json.error?.message || (lang === "en" ? "Sign-in failed. Check your details and try again." : "Giriş yapılamadı. Bilgilerinizi kontrol edip tekrar deneyin.")));
        setLoading(false);
        return;
      }

      const role = json.data?.user.role;
      // Control Center (2026-09-28) — `next` HER İKİ kapıda da doğrulanır
      // (open redirect kapalı); doğrulanamazsa fallback'e düşülür.
      const safeNext = resolveSafeLoginNext(nextPath, "");
      let dest: string;
      if (platformGate) {
        dest = resolvePlatformLoginDest(role as AppRole, safeNext || null);
      } else {
        // P1 (2026-09-11) — açık `next` YOKSA ve hesapta güvenli son rota
        // varsa oraya dön (server `isSafeLastRoute` + rol filtresiyle
        // doğruladı); yoksa rol ana sayfası.
        const resumeTo = json.data?.resumeTo;
        dest = safeNext || "/panel";
        if (!safeNext) {
          if (resumeTo && resumeTo.startsWith("/")) dest = resumeTo;
          else if (role === "TEACHER") dest = "/ogretmen";
          else if (role === "STUDENT") dest = "/ogrenci";
          else dest = "/panel";
        }
      }
      router.replace(dest);
      router.refresh();
    } catch {
      renewTurnstile();
      setError("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.");
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void performLogin(email, password);
  }

  return (
    <div className="space-y-5">
      <ModalShell
        open={!!takeoverInfo}
        tone="warning"
        busy={loading}
        title="Bu hesap başka bir cihazda açık"
        onClose={() => setTakeoverInfo(null)}
        footer={
          <>
            <button type="button" className={modalButton.secondary} onClick={() => setTakeoverInfo(null)} disabled={loading}>
              Vazgeç
            </button>
            <button
              type="button"
              className={modalButton.primary}
              disabled={loading || challengePending}
              onClick={() => void performLogin(email, password, true)}
            >
              {loading ? copy.signingIn : copy.takeoverAction}
            </button>
          </>
        }
      >
        <p>{copy.takeover}</p>
        {takeoverInfo?.device || takeoverInfo?.lastSeenAt ? (
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            Açık oturum: {takeoverInfo.device ?? "Bilinmeyen cihaz"}
            {takeoverInfo.lastSeenAt
              ? ` · ${formatInLocale(takeoverInfo.lastSeenAt, lang)}`
              : ""}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          Diğer cihazdaki kullanıcı bilgilendirilir ve giriş ekranına yönlendirilir. İşlem denetim kaydına yazılır.
        </p>
        {/* Onay yeni token ister; doğrulama etkileşim gerektirirse diyalog üstünde görünmeli. */}
        {takeoverInfo ? <div className="mt-3">{turnstileField}</div> : null}
      </ModalShell>
      <form onSubmit={onSubmit} className="space-y-4" noValidate={false}>
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">
            {copy.email}
          </label>
          <Input
            id="login-email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
            className="h-11 text-base sm:text-sm"
            required
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label htmlFor="login-password" className="block text-sm font-medium text-[var(--color-text)]">
              {copy.password}
            </label>
            <Link
              href="/sifre-sifirla"
              className="rounded text-sm font-medium text-[var(--color-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
            >
              {copy.forgot}
            </Link>
          </div>
          <div className="relative">
            <Input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
              onBlur={() => setCapsLock(false)}
              aria-invalid={error ? true : undefined}
              aria-describedby={[error ? "login-error" : "", capsLock ? "login-caps" : ""].filter(Boolean).join(" ") || undefined}
              className="h-11 pr-20 text-base sm:text-sm"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              aria-controls="login-password"
              className="absolute inset-y-1 right-1 rounded-[var(--radius-sm)] px-3 text-xs font-semibold text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
            >
              {showPassword ? (lang === "en" ? "Hide" : "Gizle") : lang === "en" ? "Show" : "Göster"}
            </button>
          </div>
          {capsLock ? (
            <p id="login-caps" className="mt-1.5 text-xs font-medium text-[var(--color-warning)]">
              {lang === "en" ? "Caps Lock is on." : "Büyük harf kilidi (Caps Lock) açık."}
            </p>
          ) : null}
        </div>
        {takeoverInfo ? null : turnstileField}
        {error ? (
          <p
            id="login-error"
            role="alert"
            className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-3 py-2.5 text-sm text-[var(--color-danger)]"
          >
            {error}
          </p>
        ) : null}
        <Button type="submit" className="h-11 w-full text-base sm:text-sm" disabled={loading || challengePending} aria-busy={loading}>
          {loading ? (
            <span className="inline-flex items-center justify-center gap-2">
              <span
                aria-hidden
                className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
              />
              {copy.signingIn}
            </span>
          ) : (
            copy.signIn
          )}
        </Button>
        {challengePending ? (
          <p role="status" className="text-center text-xs text-[var(--color-text-muted)]">
            {lang === "en" ? "Waiting for the security check to finish." : "Güvenlik doğrulamasının bitmesi bekleniyor."}
          </p>
        ) : null}
      </form>
    </div>
  );
}
