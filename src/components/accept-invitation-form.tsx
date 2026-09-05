"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui";
import {
  currentClientSurface,
  goToPostPasswordDestination,
  type PostPasswordDestinationPayload,
} from "@/lib/auth/post-password-redirect-client";

/** Faz 4 — davet kabul formu. `/api/v1/auth/accept-invitation`'ı çağırır; başarıda `/login`'e yönlendirir. */
export function AcceptInvitationForm({ token }: { token: string }) {
  const router = useRouter();
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
      const res = await fetch("/api/v1/auth/accept-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword, surface: currentClientSurface() }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { destination?: PostPasswordDestinationPayload };
        error?: { message: string };
      };
      if (!json.ok) {
        setError(json.error?.message || "Bağlantı geçersiz veya süresi dolmuş.");
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
          Hesabınız aktifleştirildi. Portalınıza yönlendiriliyorsunuz…
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

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
        {pending ? "İşleniyor…" : "Şifremi Oluştur ve Hesabımı Aktifleştir"}
      </Button>
    </form>
  );
}
