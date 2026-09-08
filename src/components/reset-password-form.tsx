"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui";
import {
  currentClientSurface,
  goToPostPasswordDestination,
  type PostPasswordDestinationPayload,
} from "@/lib/auth/post-password-redirect-client";

/**
 * Portal erişim yönetimi görevi — şifre sıfırlama formu. `accept-invitation-form.tsx`
 * ile AYNI kalıp (fetch → başarıda /login'e yönlendir). Kod alanı `initialToken`
 * ile (varsa, e-posta linkinden) önceden doldurulur ama salt-okunur DEĞİLDİR —
 * kod elle yazılabilir olacak şekilde tasarlandı (bkz. password-reset.ts).
 */
export function ResetPasswordForm({ initialToken }: { initialToken: string }) {
  const router = useRouter();
  /**
   * P0 UAT (2026-09-08) — "Şifremi unuttum akışı yok".
   *
   * AUDIT SONUCU: backend zaten TAMDI ve güvenliydi
   * (`/api/v1/auth/forgot-password`: nötr anti-enumeration yanıtı, e-posta
   * başına 5/15dk + IP başına 20/15dk limit, sha256 hash'li tek kullanımlık
   * 30 dk'lık token, audit log). Eksik olan tek şey KULLANICININ kodu
   * İSTEYEBİLECEĞİ adımdı: bu uç UI'dan hiç çağrılmıyordu, kod ancak bir
   * yönetici sıfırlama tetiklerse geliyordu. Bu yüzden burada yalnızca o
   * adım eklendi — yeni bir token/mail altyapısı KURULMADI.
   */
  const [step, setStep] = useState<"request" | "reset">(initialToken ? "reset" : "request");
  const [requestEmail, setRequestEmail] = useState("");
  const [requestPending, setRequestPending] = useState(false);
  const [requestNotice, setRequestNotice] = useState<string | null>(null);
  const [code, setCode] = useState(initialToken);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  /**
   * P0 (2026-09-05) — uygulama kurulu değilse gösterilecek mağaza bağlantısı.
   * Uygulama tanımlı DEĞİLSE sunucu bunu hiç göndermez — sahte/kırık bir
   * "uygulamayı indir" bağlantısı ASLA gösterilmez.
   */
  const [appDownloadUrl, setAppDownloadUrl] = useState<string | null>(null);

  async function onRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRequestPending(true);
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: requestEmail.trim() }),
      });
      const json = (await res.json()) as { ok: boolean; data?: { message?: string }; error?: { message: string } };
      /**
       * Hesap var/yok AYRIMI YAPILMAZ — sunucu bilinçli olarak her durumda
       * aynı nötr metni döner. UI de bunu aynen gösterir; `devResetToken`
       * (yalnız production dışında dönebilir) EKRANA BASILMAZ.
       */
      setRequestNotice(
        json.ok
          ? json.data?.message ??
              "Bu e-posta adresine kayıtlı bir hesap varsa, şifre sıfırlama talimatları gönderildi."
          : json.error?.message ?? "İstek gönderilemedi. Lütfen tekrar deneyin."
      );
      if (json.ok) setStep("reset");
    } catch {
      setError("Bağlantı hatası. Tekrar deneyin.");
    } finally {
      setRequestPending(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!code.trim()) {
      setError("Lütfen e-postanızdaki kodu girin.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Şifre en az 8 karakter olmalı.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Şifreler eşleşmiyor.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code.trim(), newPassword, surface: currentClientSurface() }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { destination?: PostPasswordDestinationPayload };
        error?: { message: string };
      };
      if (!json.ok) {
        setError(json.error?.message || "Kod geçersiz veya süresi dolmuş.");
        return;
      }
      setDone(true);
      // Rol sunucudan gelir; burada yalnız hedefe gidilir (derin bağlantı
      // varsa bir kez denenir, açılmazsa web portalına düşülür).
      const destination = json.data?.destination ?? { webPath: "/login" };
      setAppDownloadUrl(destination.appDownloadUrl ?? null);
      goToPostPasswordDestination(destination, (path) => router.push(path));
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          Şifreniz güncellendi. Portalınıza yönlendiriliyorsunuz…
        </p>
        {appDownloadUrl ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            Mobil uygulama açılmadıysa{" "}
            <a href={appDownloadUrl} className="font-medium text-[var(--color-primary)] underline">
              uygulamayı buradan indirebilirsiniz
            </a>
            .
          </p>
        ) : null}
      </div>
    );
  }

  if (step === "request") {
    return (
      <form onSubmit={onRequestSubmit} className="space-y-4">
        <div>
          <Label>E-posta adresiniz</Label>
          <Input
            type="email"
            value={requestEmail}
            onChange={(e) => setRequestEmail(e.target.value)}
            placeholder="ornek@kurum.com"
            autoComplete="email"
            required
          />
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Hesabınız varsa sıfırlama kodunu e-posta ile göndeririz.
          </p>
        </div>
        {requestNotice ? (
          <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text)]" role="status">
            {requestNotice}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm font-medium text-rose-600" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={requestPending} className="w-full">
          {requestPending ? "Gönderiliyor…" : "Sıfırlama kodu gönder"}
        </Button>
        <button
          type="button"
          onClick={() => setStep("reset")}
          className="w-full text-center text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          Kodum var, devam et
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {requestNotice ? (
        <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text)]" role="status">
          {requestNotice}
        </p>
      ) : null}
      <div>
        <Label>E-postanızdaki kod</Label>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Örn. AB3XQ9K2"
          autoCapitalize="characters"
          required
        />
      </div>
      <div>
        <Label>Yeni şifre</Label>
        <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required />
      </div>
      <div>
        <Label>Yeni şifre (tekrar)</Label>
        <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required />
      </div>
      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "İşleniyor…" : "Şifremi Güncelle"}
      </Button>
    </form>
  );
}
