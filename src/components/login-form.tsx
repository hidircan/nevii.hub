"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui";
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
}: {
  nextPath?: string;
  lang?: AppLocale;
  /** NeviiOS platform kapısı: HYPER_ADMIN yalnız /platform altına, kurum rolleri kendi evine gider. */
  platformGate?: boolean;
}) {
  const copy = authCopy(lang);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // N — "başka cihazda aktif" onayı: cihaz özeti + son görülme.
  const [takeoverInfo, setTakeoverInfo] = useState<{ device: string | null; lastSeenAt: string | null } | null>(null);

  async function performLogin(loginEmail: string, loginPassword: string, takeover = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: loginEmail, password: loginPassword, clientSupportsTakeover: true, takeover }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { user: { role: string }; resumeTo?: string | null };
        error?: { code?: string; message: string; details?: { device?: string | null; lastSeenAt?: string | null } };
      };
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
              disabled={loading}
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
      </ModalShell>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label>{copy.email}</Label>
          <Input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>{copy.password}</Label>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error ? (
          <p className="rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? copy.signingIn : copy.signIn}
        </Button>
        {/*
          P0 UAT (2026-09-08) — "Şifremi unuttum" akışı giriş ekranından
          erişilebilir DEĞİLDİ. Backend zaten tamdı ve güvenliydi
          (nötr anti-enumeration yanıtı, e-posta/IP rate limit, sha256 hash'li
          tek kullanımlık 30 dk'lık token, audit log — bkz.
          docs/security/PASSWORD_RESET_DESIGN.md); eksik olan tek şey bu
          bağlantı ve kodu istemeyi sağlayan adımdı.
        */}
        <Link
          href="/sifre-sifirla"
          className="block text-center text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          {copy.forgot}
        </Link>
      </form>
    </div>
  );
}
