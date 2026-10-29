"use client";

import { useState } from "react";
import Link from "@/components/link";
import { Button, Card, Input } from "@/components/ui";
import { callApi } from "@/components/platform/api";

/** Public davet kabulü — token URL'den gelir; sunucu hash, süre, tek kullanım ve parola politikasını doğrular. */
export function InviteAcceptForm({
  inviteId,
  token,
  continueHref,
}: {
  inviteId: string;
  token: string;
  /** Kabul sonrası giriş hedefi (örn. satın alma seçimi); yoksa düz giriş. */
  continueHref?: string | null;
}) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    if (password !== repeat) return setError("Parolalar eşleşmiyor.");
    setPending(true);
    const res = await callApi<{ email: string }>(`/api/v1/invitations/${encodeURIComponent(inviteId)}/accept`, "POST", { token, password });
    setPending(false);
    if (!res.ok) return setError(res.error.message);
    setDone(res.data.email);
  }

  if (done) {
    const loginHref = continueHref ? `/login?next=${encodeURIComponent(continueHref)}` : "/login";
    return (
      <Card>
        <p className="text-sm">Hesabınız oluşturuldu: <strong>{done}</strong></p>
        {continueHref ? (
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Giriş yaptıktan sonra satın alma seçiminizle devam edeceksiniz.
          </p>
        ) : null}
        <Link href={loginHref} className="mt-3 inline-block text-sm text-[var(--color-primary)] hover:underline">Giriş yap</Link>
      </Card>
    );
  }
  return (
    <Card>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-3"
      >
        <label className="block text-sm">
          Parola
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="block text-sm">
          Parola (tekrar)
          <Input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </label>
        {error ? <p role="alert" className="text-sm text-[var(--color-danger)]">{error}</p> : null}
        <Button type="submit" disabled={pending || !password}>{pending ? "Kaydediliyor…" : "Daveti kabul et"}</Button>
      </form>
    </Card>
  );
}
