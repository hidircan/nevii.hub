"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui";
import { actionUpdateSchoolLogo } from "@/lib/actions";

export function SchoolLogoForm({ currentLogoUrl }: { currentLogoUrl?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(currentLogoUrl || null);

  function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.size > 500_000) {
      setError("Logo dosyası çok büyük (maks. 500KB) — daha küçük bir görsel yükleyin.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const fileData = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
      startTransition(async () => {
        const result = await actionUpdateSchoolLogo({ fileMimeType: file.type, fileData });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setPreview(result.logoUrl);
        router.refresh();
      });
    };
    reader.onerror = () => setError("Dosya okunamadı.");
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-3">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Kurum logosu" className="h-16 max-w-[220px] object-contain" />
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">Henüz logo yüklenmedi.</p>
      )}
      <div>
        <Label>Kurum logosu (JPG, PNG veya WEBP, en fazla 500KB)</Label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={pending}
          className="mt-1 block text-sm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            onFile(file);
            e.target.value = "";
          }}
        />
      </div>
      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
      {pending ? <p className="text-xs text-[var(--color-text-muted)]">Yükleniyor…</p> : null}
    </div>
  );
}
