"use client";

/**
 * Hesabım — e-posta değiştirme formu (tüm roller; userId session'dan).
 * Akış: mevcut şifre + yeni adres → YENİ adrese doğrulama bağlantısı, ESKİ
 * adrese güvenlik bildirimi. Onay `/hesap-eposta-dogrula` sayfasında.
 */
import { useState } from "react";
import { Button, Input, Label } from "@/components/ui";

export function AccountEmailChangeForm({ currentEmail }: { currentEmail?: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "success" | "error"; message?: string }>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "idle" });
    setPending(true);
    try {
      const res = await fetch("/api/v1/account/email-change/request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newEmail }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setStatus({
          kind: "success",
          message: json.data.sentToNew
            ? `Doğrulama bağlantısı ${newEmail.trim()} adresine gönderildi. 24 saat içinde onaylayın.`
            : "İstek alındı ancak e-posta sağlayıcısı yapılandırılmamış — bağlantı gönderilemedi. Kurum yöneticinizle görüşün.",
        });
        setCurrentPassword("");
        setNewEmail("");
      } else {
        setStatus({ kind: "error", message: json.error?.message || "İstek oluşturulamadı." });
      }
    } catch {
      setStatus({ kind: "error", message: "Bağlantı hatası — tekrar deneyin." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-xs text-[var(--color-text-muted)]">
        Mevcut adresiniz: <span className="font-medium text-[var(--color-text)]">{currentEmail ?? "—"}</span>
      </p>
      <div>
        <Label>Yeni e-posta adresi</Label>
        <Input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="yeni@ornek.com" autoComplete="email" />
      </div>
      <div>
        <Label>Mevcut şifreniz (güvenlik onayı)</Label>
        <Input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
      </div>
      {status.kind !== "idle" ? (
        <p className={`text-xs font-medium ${status.kind === "success" ? "text-emerald-700" : "text-rose-600"}`}>
          {status.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Gönderiliyor…" : "Doğrulama bağlantısı gönder"}
      </Button>
      <p className="text-[11px] text-[var(--color-text-muted)]">
        Bağlantı yeni adresinize gider; mevcut adresinize güvenlik bildirimi gönderilir. Adresiniz, bağlantıyı
        onaylayana kadar değişmez.
      </p>
    </form>
  );
}
