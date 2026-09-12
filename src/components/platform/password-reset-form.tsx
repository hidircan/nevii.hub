"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, Input } from "@/components/ui";
import { callApi } from "@/components/platform/api";

export function PasswordResetForm({ resetId, token }: { resetId: string; token: string }) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    if (password !== repeat) return setError("Parolalar eşleşmiyor.");
    setPending(true);
    const res = await callApi("/api/v1/password-reset", "POST", { resetId, token, password });
    setPending(false);
    setPassword("");
    setRepeat("");
    if (!res.ok) return setError(res.error.message);
    setDone(true);
  }

  if (done) {
    return (
      <Card>
        <p className="text-sm">Parolanız güncellendi. Diğer tüm oturumlar kapatıldı.</p>
        <Link href="/login" className="mt-3 inline-block text-sm text-[var(--color-primary)] hover:underline">Giriş yap</Link>
      </Card>
    );
  }
  return (
    <Card>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block text-sm">
          Yeni parola
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="block text-sm">
          Yeni parola (tekrar)
          <Input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </label>
        {error ? <p role="alert" className="text-sm text-[var(--color-danger)]">{error}</p> : null}
        <Button type="submit" disabled={pending || !password}>{pending ? "Kaydediliyor…" : "Parolayı güncelle"}</Button>
      </form>
    </Card>
  );
}
