"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { callApi } from "@/components/platform/api";
import type { MobileAppLinks } from "@/lib/platform/site-mobile-apps";

type Resolved = { appStoreUrl?: string; playStoreUrl?: string; appStoreSource: "site" | "env" | null; playSource: "site" | "env" | null };

function Status({ url, source, visible }: { url?: string; source: "site" | "env" | null; visible: boolean }) {
  if (!url) return <span className="text-xs text-[var(--color-text-muted)]">Bağlantı girilmedi — sitede “yakında” görünür, kırık düğme çıkmaz.</span>;
  if (!visible) return <span className="text-xs text-[var(--color-warning)]">Kayıtlı ama gizli — sitede gösterilmiyor (kaynak: {source === "site" ? "site ayarı" : "ortam"}).</span>;
  return <span className="text-xs text-[var(--color-success)]">Yayında (kaynak: {source === "site" ? "site ayarı" : "ortam"}).</span>;
}

/** Mobil uygulama mağaza bağlantıları — yalnız HYPER_ADMIN. */
export function SiteMobileAppsManager({ initial, resolved }: { initial: MobileAppLinks; resolved: Resolved }) {
  const [values, setValues] = useState<MobileAppLinks>(initial);
  const [saved, setSaved] = useState<MobileAppLinks>(initial);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);

  async function save() {
    setError(null);
    setNotice(null);
    setPending(true);
    const res = await callApi<{ links: MobileAppLinks }>("/api/v1/platform/site-mobile-apps", "PUT", {
      appStoreUrl: values.appStoreUrl || null,
      playStoreUrl: values.playStoreUrl || null,
      appStoreVisible: values.appStoreVisible,
      playVisible: values.playVisible,
    });
    setPending(false);
    if (!res.ok) return setError(res.error.message);
    const next = { ...res.data.links };
    setValues(next);
    setSaved(next);
    setNotice("Kaydedildi. Anasayfadaki mağaza düğmeleri güncellendi.");
  }

  const field = (
    id: "appStoreUrl" | "playStoreUrl",
    vis: "appStoreVisible" | "playVisible",
    labelText: string,
    placeholder: string,
    url: string | undefined,
    source: "site" | "env" | null
  ) => (
    <div>
      <label htmlFor={`mapp-${id}`} className="mb-1 block text-sm font-medium">
        {labelText}
      </label>
      <input
        id={`mapp-${id}`}
        type="url"
        inputMode="url"
        placeholder={placeholder}
        value={values[id] ?? ""}
        onChange={(e) => setValues((v) => ({ ...v, [id]: e.target.value || null }))}
        className="w-full rounded-lg border bg-[var(--color-surface)] px-3 py-2 text-sm"
        style={{ borderColor: "var(--color-border)" }}
        maxLength={300}
      />
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={values[vis]}
            onChange={(e) => setValues((v) => ({ ...v, [vis]: e.target.checked }))}
          />
          Sitede göster
        </label>
        <Status url={url} source={source} visible={values[vis]} />
      </div>
    </div>
  );

  return (
    <Card>
      <div className="space-y-4">
        <h2 className="text-sm font-semibold">Mobil Uygulama</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Anasayfadaki mağaza düğmeleri ve mobil “Uygulamada aç” bandı bu kayıtları kullanır. Boş bırakılan platform
          “yakında” durumuna düşer. Site ayarı doluysa ortam değişkenini ezer; ikisi de boşsa bağlantı üretilmez.
          Yalnız resmi mağaza adresleri (https) kabul edilir — form doğrulaması mağaza yayını doğrulaması değildir.
        </p>
        {field("appStoreUrl", "appStoreVisible", "App Store URL", "https://apps.apple.com/…/id… (boş = yakında)", resolved.appStoreUrl, resolved.appStoreSource)}
        {field("playStoreUrl", "playVisible", "Google Play URL", "https://play.google.com/store/apps/… (boş = yakında)", resolved.playStoreUrl, resolved.playSource)}
        {error ? <p className="text-sm font-medium text-[var(--color-danger)]">{error}</p> : null}
        {notice ? <p className="text-sm font-medium text-[var(--color-success)]">{notice}</p> : null}
        <div className="flex items-center gap-2">
          <Button disabled={!dirty || pending} onClick={save}>
            {pending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
          {!dirty ? <span className="text-xs text-[var(--color-text-muted)]">Değişiklik yok.</span> : null}
        </div>
      </div>
    </Card>
  );
}
