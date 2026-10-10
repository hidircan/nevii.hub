"use client";

/**
 * Doğrulama bağlantısından gelen token'ı kesinleştirir (public).
 * Başarıda kullanıcı bilgilendirilir — YENİ adresle giriş yapması gerekir
 * (mevcut oturumun e-postası sunucuda değişti; bir sonraki girişte yeni
 * adres kullanılır).
 */
import { useState } from "react";
import Link from "@/components/link";
import { Button, Card, Input, Label } from "@/components/ui";

export function ConfirmEmailChangeCard({ token }: { token?: string }) {
  const [manualToken, setManualToken] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; newEmail?: string } | null>(null);

  const effectiveToken = token?.trim() || manualToken.trim();

  async function onConfirm() {
    if (!effectiveToken || pending) return;
    setPending(true);
    setResult(null);
    try {
      const res = await fetch("/api/v1/account/email-change/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: effectiveToken }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setResult({ ok: true, message: `E-posta adresiniz güncellendi: ${json.data.newEmail}`, newEmail: json.data.newEmail });
      } else {
        setResult({ ok: false, message: json.error?.message || "Doğrulama başarısız." });
      }
    } catch {
      setResult({ ok: false, message: "Bağlantı hatası — tekrar deneyin." });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <h1 className="font-semibold text-[var(--color-text)]">E-posta adresi doğrulama</h1>
      {!result?.ok ? (
        <>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Yeni adresinize gönderilen doğrulama bağlantısını onaylayarak değişikliği tamamlayın. Bağlantı 24 saat
            geçerlidir ve tek kullanımlıktır.
          </p>
          {!token ? (
            <div className="mt-3">
              <Label>Doğrulama bağlantısındaki kod</Label>
              <Input value={manualToken} onChange={(e) => setManualToken(e.target.value)} placeholder="Bağlantıdaki token" />
            </div>
          ) : null}
          {result && !result.ok ? <p className="mt-3 text-xs font-medium text-rose-600">{result.message}</p> : null}
          <div className="mt-4">
            <Button onClick={onConfirm} disabled={pending || !effectiveToken}>
              {pending ? "Doğrulanıyor…" : "Adresimi doğrula"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm font-medium text-emerald-700">{result.message}</p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Bir sonraki girişinizde yeni adresinizi kullanın.
          </p>
          <div className="mt-4">
            <Link href="/login" className="text-sm font-medium text-[var(--color-primary)] hover:underline">
              Giriş ekranına dön →
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}
