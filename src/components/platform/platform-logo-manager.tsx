"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { ConfirmBar } from "@/components/platform/confirm-dialog";
import { callApi } from "@/components/platform/api";

type Meta = { mime: string; size: number; sha256: string; updatedAt: string; updatedBy: string } | null;
const ACCEPT = ["image/png", "image/jpeg", "image/webp"];

/** Global platform logosu — yalnız HYPER_ADMIN; kurum logolarından bağımsız. Sunucu MIME + imza + boyut doğrular. */
export function PlatformLogoManager({ initial, fallbackPath }: { initial: Meta; fallbackPath: string }) {
  const [meta, setMeta] = useState<Meta>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [version, setVersion] = useState(0);

  async function upload(file: File) {
    setError(null);
    if (!ACCEPT.includes(file.type)) return setError("Yalnız PNG, JPEG veya WebP (SVG kabul edilmez).");
    if (file.size > 200 * 1024) return setError("Logo en fazla 200 KB olabilir.");
    setPending(true);
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (const b of buf) bin += String.fromCharCode(b);
    const res = await callApi<{ logo: Meta }>("/api/v1/platform/branding/logo", "PUT", { mime: file.type, dataBase64: btoa(bin) });
    setPending(false);
    if (!res.ok) return setError(res.error.message);
    setMeta(res.data.logo);
    setVersion((v) => v + 1);
  }

  async function reset() {
    setPending(true);
    const res = await callApi("/api/v1/platform/branding/logo", "DELETE");
    setPending(false);
    setConfirmReset(false);
    if (!res.ok) return setError(res.error.message);
    setMeta(null);
    setVersion((v) => v + 1);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- runtime ayarı; next/image optimizer'dan geçmez */}
        <img
          src={`/api/v1/branding/platform-logo?v=${version}`}
          alt="Güncel platform logosu"
          className="h-16 w-auto rounded border p-2"
          style={{ borderColor: "var(--color-border)" }}
        />
        <div className="text-sm">
          {meta ? (
            <p>
              Özel logo · {meta.mime} · {(meta.size / 1024).toFixed(1)} KB · {new Date(meta.updatedAt).toLocaleString("tr-TR")}
            </p>
          ) : (
            <p className="text-[var(--color-text-muted)]">Varsayılan (build-time) logo kullanılıyor: {fallbackPath}</p>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white">
          {pending ? "Yükleniyor…" : "Logo yükle"}
          <input
            type="file"
            accept={ACCEPT.join(",")}
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
        <Button variant="secondary" disabled={pending || !meta} onClick={() => setConfirmReset(true)}>
          Varsayılana dön
        </Button>
      </div>
      {error ? <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">{error}</p> : null}
      <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-[var(--color-text-muted)]">
        <li>Global platform logosu kurum logolarını değiştirmez; kurum logosu Kurum → Marka &amp; Görünüm sekmesindedir.</li>
        <li>Favicon build-time varlıktır (src/app/icon.png) ve bu ayardan etkilenmez.</li>
        <li>Dosya public/ klasörüne yazılmaz; doğrulanmış bayt içeriği platform ayar deposunda tutulur.</li>
      </ul>
      <ConfirmBar
        open={confirmReset}
        title="Platform logosunu sıfırla"
        description="Özel logo silinir ve varsayılan logo kullanılır. Denetim kaydı yazılır."
        pending={pending}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => void reset()}
      />
    </Card>
  );
}
