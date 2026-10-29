"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { callApi } from "@/components/platform/api";

type Links = Record<string, string | null>;

/** Herkese açık site sosyal medya bağlantıları — yalnız HYPER_ADMIN. Boş alan "yakında" rozetine düşer. */
export function SiteSocialManager({
  initial,
  networks,
  labels,
}: {
  initial: Links;
  networks: string[];
  labels: Record<string, string>;
}) {
  const [values, setValues] = useState<Links>(initial);
  const [saved, setSaved] = useState<Links>(initial);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = networks.some((n) => (values[n] ?? "") !== (saved[n] ?? ""));

  async function save() {
    setError(null);
    setNotice(null);
    setPending(true);
    const res = await callApi<{ links: Links }>("/api/v1/platform/site-social", "PUT", values);
    setPending(false);
    if (!res.ok) return setError(res.error.message);
    setValues(res.data.links);
    setSaved(res.data.links);
    setNotice("Kaydedildi. Anasayfadaki bağlantılar güncellendi.");
  }

  return (
    <Card>
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-text-muted)]">
          Anasayfa iletişim bölümünde ve altbilgide görünen sosyal medya bağlantıları. Boş bırakılan ağ “yakında”
          rozetiyle gösterilir; kırık bağlantı çıkmaz. Yalnız https adresleri kabul edilir.
        </p>
        {networks.map((n) => (
          <div key={n}>
            <label htmlFor={`social-${n}`} className="mb-1 block text-sm font-medium">
              {labels[n] ?? n}
            </label>
            <input
              id={`social-${n}`}
              type="url"
              inputMode="url"
              placeholder="https://… (boş = yakında)"
              value={values[n] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [n]: e.target.value }))}
              className="w-full rounded-lg border bg-[var(--color-surface)] px-3 py-2 text-sm"
              style={{ borderColor: "var(--color-border)" }}
              maxLength={300}
            />
          </div>
        ))}
        {error ? <p className="text-sm font-medium text-[var(--color-danger)]">{error}</p> : null}
        {notice ? <p className="text-sm font-medium text-[var(--color-success)]">{notice}</p> : null}
        <div>
          <Button onClick={save} disabled={pending || !dirty}>
            {pending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
