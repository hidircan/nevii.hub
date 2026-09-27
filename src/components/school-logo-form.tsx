"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui";
import { actionImportSchoolLogoFromUrl, actionUpdateSchoolLogo } from "@/lib/actions";
import { logoUrlStamp, withLogoVersion } from "@/lib/institution-logo";

/**
 * P0 (2026-09-05) — bu üç sabit, sunucudaki gerçek doğrulamayla (tools.ts
 * SCHOOL_LOGO_ALLOWED_MIME / SCHOOL_LOGO_MAX_BYTES) BİREBİR aynı olmalıdır;
 * yönergede DESTEKLENMEYEN bir format ASLA yazılmaz (ör. SVG desteklenmiyor).
 * Boyut/oran kuralları yalnız İSTEMCİ tarafında uygulanır — sunucu bir
 * görseli çözümlemez, bu yüzden bunlar "kullanılamaz görsel" uyarısıdır.
 */
const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 500_000;
const MIN_EDGE_PX = 64;
const MAX_ASPECT_RATIO = 6;

export function SchoolLogoForm({ currentLogoUrl }: { currentLogoUrl?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(
    currentLogoUrl ? withLogoVersion(currentLogoUrl, logoUrlStamp(currentLogoUrl)) ?? currentLogoUrl : null
  );
  /** Kayıtlı logo yüklenemezse (bozuk/erişilemez veri) KIRIK GÖRSEL gösterilmez — güvenli metin geri dönüşü. */
  const [previewBroken, setPreviewBroken] = useState(false);
  /**
   * P0 (2026-09-05) — KÖK NEDEN: harici (`https://…`) bir logo adresi
   * uygulamanın Content-Security-Policy'si (`img-src 'self' data: blob:`)
   * tarafından ENGELLENİR; sözleşme/yazdırma/PDF ve e-postalarda logo hiç
   * görünmez, hiçbir görünür hata da vermez. Çözüm: görseli bir kez içeri
   * almak (sunucu indirir, yükleme akışıyla AYNI `data:` URI olarak saklar).
   */
  const isExternalLogo = /^https?:\/\//i.test(preview ?? "");

  function onFile(file: File | undefined) {
    setError(null);
    setWarning(null);
    if (!file) return;
    // P0 (2026-09-05) — istemci doğrulaması sunucununkinin AYNISINI söyler
    // (ALLOWED_MIME/MAX_BYTES aşağıdaki sabitlerle tek yerde tutulur). `accept`
    // attribute'u bir doğrulama DEĞİLDİR (dosya seçicide "tüm dosyalar"
    // seçilebilir) — bu yüzden tür burada da AÇIKÇA reddedilir.
    if (!ALLOWED_MIME.includes(file.type)) {
      setError("Desteklenmeyen dosya türü — yalnız PNG, JPG/JPEG veya WEBP yükleyebilirsiniz (SVG desteklenmez).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(
        `Logo dosyası çok büyük (${Math.round(file.size / 1024)}KB) — en fazla ${Math.round(MAX_BYTES / 1024)}KB olmalı.`
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const fileData = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
      // Boyut/en-boy oranı kontrolü — çözülemeyen (bozuk) görsel HİÇ
      // yüklenmez, böylece sözleşme/e-postada KIRIK GÖRSEL oluşamaz.
      const probe = new Image();
      probe.onload = () => {
        const { naturalWidth: w, naturalHeight: h } = probe;
        if (w < MIN_EDGE_PX || h < MIN_EDGE_PX) {
          setError(
            `Logo çok küçük (${w}×${h} piksel) — kısa kenarı en az ${MIN_EDGE_PX} piksel olan bir görsel yükleyin, aksi halde sözleşme çıktısında bulanık görünür.`
          );
          return;
        }
        const ratio = w / h;
        if (ratio > MAX_ASPECT_RATIO || ratio < 1 / MAX_ASPECT_RATIO) {
          setWarning(
            `Logonun en-boy oranı çok uçta (${w}×${h}). Görsel kırpılmaz ama başlıkta küçük görünebilir; yaklaşık 3:1 ile 1:1 arası bir görsel önerilir.`
          );
        }
        upload(file.type, fileData);
      };
      probe.onerror = () => setError("Görsel çözümlenemedi — dosya bozuk olabilir. Başka bir logo deneyin.");
      probe.src = dataUrl;
    };
    reader.onerror = () => setError("Dosya okunamadı.");
    reader.readAsDataURL(file);
  }

  function importFromUrl() {
    setError(null);
    setWarning(null);
    startTransition(async () => {
      const result = await actionImportSchoolLogoFromUrl();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPreview(withLogoVersion(result.logoUrl, String(Date.now())) ?? result.logoUrl);
      setPreviewBroken(false);
      router.refresh();
    });
  }

  function upload(fileMimeType: string, fileData: string) {
    startTransition(async () => {
      const result = await actionUpdateSchoolLogo({ fileMimeType, fileData });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPreview(withLogoVersion(result.logoUrl, String(Date.now())) ?? result.logoUrl);
      setPreviewBroken(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {preview && !previewBroken ? (
        // Beyaz güvenli alan — koyu temada koyu bir logo kaybolmaz (sözleşme/
        // e-posta çıktısındaki `institutionLogoHtml` ile AYNI yaklaşım).
        <span className="inline-block rounded-lg bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Kurum logosu"
            className="max-h-24 w-auto max-w-full object-contain"
            onError={() => setPreviewBroken(true)}
          />
        </span>
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">
          {previewBroken
            ? "Kayıtlı logo görüntülenemedi — lütfen yeniden yükleyin. Sözleşme ve e-postalarda kurum adı metin olarak gösterilir."
            : "Henüz logo yüklenmedi. Sözleşme ve e-postalarda kurum adı metin olarak gösterilir."}
        </p>
      )}
      {isExternalLogo ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">
            Logonuz dış bir adreste tutuluyor — sözleşme, yazdırma/PDF ve e-postalarda görünmez.
          </p>
          <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-300/80">
            Güvenlik politikası gereği uygulama yalnızca kendi içinde sakladığı görselleri gösterir. Aşağıdaki
            düğme logoyu bir kez indirip uygulamanın içine kaydeder; görsel değişmez, yalnız güvenli biçimde
            saklanır.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={importFromUrl}
            className="mt-2 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {pending ? "İçeri alınıyor…" : "Logoyu uygulamaya aktar"}
          </button>
        </div>
      ) : null}
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
        {/* P0 (2026-09-05) — kullanıcı raporu: logo yönergesi eksikti. Yalnız
            GERÇEKTEN desteklenen formatlar/boyut yazılır — burada yazılan,
            SCHOOL_LOGO_ALLOWED_MIME/SCHOOL_LOGO_MAX_BYTES (tools.ts) ile
            BİREBİR aynı olmalı, aksi halde kullanıcı yönergeye güvenip
            reddedilen bir dosya yükler. */}
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-[var(--color-text-muted)]">
          <li>Desteklenen formatlar: PNG, JPG/JPEG ve WEBP — SVG desteklenmez.</li>
          <li>Önerilen: şeffaf arka planlı PNG.</li>
          <li>Önerilen boyut: yaklaşık 600×200 piksel (3:1) veya 400×400 (1:1); kısa kenar en az 64 piksel olmalı.</li>
          <li>Dosya boyutu en fazla 500KB olmalı; çok koyu veya çok açık logolar açık bir kart zemininde gösterilir, kaybolmaz.</li>
          <li>Logo; sözleşme ekranında/yazdırmada üst bölümde ve hoş geldiniz/şifre sıfırlama e-postalarında görüntülenir.</li>
        </ul>
      </div>
      {error ? (
        <p className="text-xs font-medium text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
      {warning ? <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{warning}</p> : null}
      {pending ? <p className="text-xs text-[var(--color-text-muted)]">Yükleniyor…</p> : null}
    </div>
  );
}
