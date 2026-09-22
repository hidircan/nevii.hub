"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { actionSetCriticalActionPassword } from "@/lib/actions";

const MIN = 8;
const FIELD = "mt-1 w-full max-w-sm rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm";

export function CriticalActionPasswordForm({ configured, setAtLabel }: { configured: boolean; setAtLabel?: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    if (next.length < MIN) return setMessage({ ok: false, text: `Yeni şifre en az ${MIN} karakter olmalı.` });
    if (next !== repeat) return setMessage({ ok: false, text: "Yeni şifre ile tekrarı aynı değil." });
    if (configured && !current) return setMessage({ ok: false, text: "Mevcut kritik işlem şifresini girin." });
    startTransition(async () => {
      const res = await actionSetCriticalActionPassword({ newPassword: next, currentPassword: configured ? current : undefined });
      setCurrent("");
      setNext("");
      setRepeat("");
      if (!res.ok) return setMessage({ ok: false, text: res.message });
      setMessage({ ok: true, text: "Kritik işlem şifresi kaydedildi." });
      router.refresh();
    });
  }

  return (
    <Card>
      <p className="text-sm text-[var(--color-text)]">
        Durum:{" "}
        <strong>{configured ? `Belirlendi${setAtLabel ? ` (${setAtLabel})` : ""}` : "Belirlenmedi — öğrenci silme kapalı"}</strong>
      </p>
      <div className="mt-3 space-y-2">
        {configured ? (
          <label className="block text-xs text-[var(--color-text-muted)]">
            Mevcut kritik işlem şifresi
            <input type="password" autoComplete="off" value={current} onChange={(e) => setCurrent(e.target.value)} className={FIELD} />
          </label>
        ) : null}
        <label className="block text-xs text-[var(--color-text-muted)]">
          Yeni şifre (en az {MIN} karakter; giriş şifrenizden farklı olmalı)
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={FIELD} />
        </label>
        <label className="block text-xs text-[var(--color-text-muted)]">
          Yeni şifre (tekrar)
          <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={FIELD} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Kaydediliyor…" : configured ? "Şifreyi değiştir" : "Şifreyi belirle"}
        </Button>
        {message ? <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-rose-600"}`}>{message.text}</p> : null}
      </div>
      <p className="mt-3 text-xs text-[var(--color-text-muted)]">
        Şifreyi unutursanız mevcut şifre olmadan değiştirilemez; bu, yetkisiz kişinin şifreyi sıfırlayıp silme yapmasını engeller.
        Destek için platform yöneticisine başvurun.
      </p>
    </Card>
  );
}
