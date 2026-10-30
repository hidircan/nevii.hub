"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { ConfirmBar } from "@/components/platform/confirm-dialog";
import { callApi } from "@/components/platform/api";

type Meta = { mime: string; size: number; sha256: string; updatedAt: string; updatedBy: string } | null;
const ACCEPT = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 3 * 1024 * 1024;

/** Global platform logosu — yalnız HYPER_ADMIN; kurum logolarından bağımsız. Sunucu MIME + imza + boyut doğrular. */
export function PlatformLogoManager({ initial, fallbackPath }: { initial: Meta; fallbackPath: string }) {
  const [meta, setMeta] = useState<Meta>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const router = useRouter();
  const src = (variant: "logo" | "icon") =>
    meta ? `/api/v1/branding/platform-logo?variant=${variant}&v=${meta.sha256.slice(0, 16)}` : variant === "logo" ? fallbackPath : "/icon.png";

  async function upload(file: File) {
    setError(null);
    if (!ACCEPT.includes(file.type)) return setError("Yalnız PNG, JPEG veya WebP (SVG kabul edilmez).");
    if (file.size > MAX_BYTES) return setError("Logo en fazla 3 MB olabilir. Dosyayı küçültüp tekrar yükleyin.");
    setPending(true);
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (const b of buf) bin += String.fromCharCode(b);
    const res = await callApi<{ logo: Meta }>("/api/v1/platform/branding/logo", "PUT", { mime: file.type, dataBase64: btoa(bin) });
    setPending(false);
    if (!res.ok) return setError(res.error.message);
    setMeta(res.data.logo);
    router.refresh(); // sekme simgesi ve kabuk logosu aynı anda güncellenir
  }

  async function reset() {
    setPending(true);
    const res = await callApi("/api/v1/platform/branding/logo", "DELETE");
    setPending(false);
    setConfirmReset(false);
    if (!res.ok) return setError(res.error.message);
    setMeta(null);
    router.refresh();
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-6">
        {/* eslint-disable @next/next/no-img-element -- runtime ayarı; next/image optimizer'dan geçmez */}
        <div className="flex flex-wrap items-end gap-3">
          <figure className="text-center">
            <img src={src("logo")} alt="Güncel platform logosu" className="h-16 w-auto rounded border bg-white p-2" style={{ borderColor: "var(--color-border)" }} />
            <figcaption className="mt-1 text-[11px] text-[var(--color-text-muted)]">Logo</figcaption>
          </figure>
          <figure className="text-center">
            <span className="flex items-center gap-1.5 rounded-t-lg bg-slate-800 px-2.5 py-1.5 text-xs text-white">
              <img src={src("icon")} alt="Güncel sekme simgesi" width={16} height={16} className="rounded-sm" />
              NeviiHub
            </span>
            <figcaption className="mt-1 text-[11px] text-[var(--color-text-muted)]">Tarayıcı sekmesi</figcaption>
          </figure>
        </div>
        {/* eslint-enable @next/next/no-img-element */}
        <div className="text-sm">
          {meta ? (
            <p>
              Özel logo · {meta.mime} · {(meta.size / 1024).toFixed(1)} KB · {new Date(meta.updatedAt).toLocaleString("tr-TR")}
            </p>
          ) : (
            <p className="text-[var(--color-text-muted)]">Varsayılan logo kullanılıyor: {fallbackPath}</p>
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
        <li>Yüklediğiniz logo ana sayfa, giriş ekranları, NeviiOS ve tarayıcı sekmesi simgesine hemen yansır.</li>
        <li>En fazla 3 MB PNG, JPEG veya WebP. Şeffaf arka planlı dosya önerilir; kenar boşlukları otomatik kırpılır.</li>
        <li>Logo beyaz zemin üzerinde gösterilir; bu yüzden beyaz logo yerine koyu veya renkli sürümü yükleyin.</li>
        <li>Kurum logoları değişmez (Kurum → Marka &amp; Görünüm). Mobil uygulama ikonu mağaza güncellemesiyle değişir.</li>
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
