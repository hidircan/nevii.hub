"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { callApi } from "@/components/platform/api";

/** Mevcut /api/v1/account/change-password akışı; şifreler istek sonrası state'ten silinir. */
export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setMsg(null);
    if (next !== repeat) return setMsg({ kind: "err", text: "Yeni şifreler eşleşmiyor." });
    setPending(true);
    const res = await callApi("/api/v1/account/change-password", "POST", { currentPassword: current, newPassword: next });
    setPending(false);
    setCurrent("");
    setNext("");
    setRepeat("");
    setMsg(res.ok ? { kind: "ok", text: "Şifre değişti; diğer oturumlar kapatıldı." } : { kind: "err", text: res.error.message });
  }

  return (
    <form
      className="mt-3 grid max-w-sm gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="text-sm">Mevcut şifre<Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
      <label className="text-sm">Yeni şifre<Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
      <label className="text-sm">Yeni şifre (tekrar)<Input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} /></label>
      {msg ? <p role={msg.kind === "err" ? "alert" : "status"} className={`text-sm ${msg.kind === "err" ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>{msg.text}</p> : null}
      <Button type="submit" disabled={pending || !current || !next}>{pending ? "Kaydediliyor…" : "Şifreyi değiştir"}</Button>
    </form>
  );
}
