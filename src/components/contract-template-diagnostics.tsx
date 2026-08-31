"use client";

/**
 * Faz 6 (ENROLLMENT_PAYMENT_RENEWAL_VALIDATION_FIX) — "Aktif kayıt sözleşmesi
 * şablonu eksik alanlar içeriyor" hatasını admin için ANLAŞILIR ve
 * ÇÖZÜLEBİLİR kılan tanılama paneli. Bu, personelin öğrenci verisini eksik
 * girdiği bir hata DEĞİLDİR — kurumun aktif şablonu güncel değildir. Panel:
 * (1) hangi şablonun kullanılacağını, (2) hangi alanların eksik olduğunu
 * Türkçe açıklamalarla, (3) kurumsal kaynaktan YIKICI OLMAYAN bir taslak
 * oluşturma yolunu gösterir — hiçbir hukuki metin burada YENİDEN YAZILMAZ.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { friendlyApiErrorMessage } from "@/lib/api/friendly-error";

type Diagnostics = {
  selectedTemplate: { id: string; name: string; version: number; active: boolean; updatedAt: string } | null;
  missingRequired: { key: string; label: string }[];
  unsupportedTokens: string[];
  activeTemplateCountForKind: number;
  isReadyForFormalGeneration: boolean;
};

export function ContractTemplateDiagnosticsPanel() {
  const router = useRouter();
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/documents/templates/diagnostics");
      const json = (await res.json()) as { ok: boolean; data?: Diagnostics; error?: { code?: string; message: string } };
      if (!json.ok) {
        setError(friendlyApiErrorMessage(json.error, "Şablon verisi yüklenemedi. Lütfen tekrar deneyin."));
        return;
      }
      setData(json.data ?? null);
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, []);

  async function onCreateCanonicalDraft() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/documents/templates/canonical-draft", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; data?: { templateId: string }; error?: { code?: string; message: string } };
      if (!json.ok) {
        setError(friendlyApiErrorMessage(json.error, "Şablon verisi yüklenemedi. Lütfen tekrar deneyin."));
        return;
      }
      await activate(json.data!.templateId);
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  async function activate(templateId: string) {
    const res = await fetch(`/api/v1/documents/templates/${templateId}/activate`, { method: "POST" });
    const json = (await res.json()) as { ok: boolean; error?: { code?: string; message: string } };
    if (!json.ok) {
      setError(friendlyApiErrorMessage(json.error, "Şablon verisi yüklenemedi. Lütfen tekrar deneyin."));
      return;
    }
    router.refresh();
    await load();
  }

  if (loading) {
    return <p className="text-xs text-[var(--color-text-muted)]">Şablon durumu kontrol ediliyor…</p>;
  }
  if (error && !data) {
    return <p className="text-xs font-medium text-rose-600">{error}</p>;
  }
  if (!data) return null;

  return (
    <div className="mb-4 space-y-2">
      {data.isReadyForFormalGeneration ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          <p className="font-semibold">
            Aktif şablon: {data.selectedTemplate!.name} (v{data.selectedTemplate!.version})
          </p>
          <p className="mt-1">Formal sözleşme üretimi için gerekli tüm alanları içeriyor.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          <p className="font-semibold">Şablon Hatası — formal sözleşme üretimi engelli</p>
          {data.selectedTemplate ? (
            <p className="mt-1">
              Aktif şablon <strong>{data.selectedTemplate.name}</strong> (v{data.selectedTemplate.version}) şu alanları
              içermiyor:
            </p>
          ) : (
            <p className="mt-1">Bu kurum için hiç şablon bulunamadı.</p>
          )}
          {data.missingRequired.length > 0 ? (
            <ul className="mt-1 list-inside list-disc">
              {data.missingRequired.map((m) => (
                <li key={m.key}>
                  {m.label} (<code>{`{{${m.key}}}`}</code>)
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2">
            Bu, öğrenci/veli bilgilerinin eksik girilmesiyle ilgili değildir — kurumun aktif sözleşme şablonu
            güncellenmelidir. Hiçbir hukuki metin otomatik değiştirilmez; aşağıdaki buton yalnızca YENİ, henüz aktif
            olmayan bir taslak oluşturur, siz onaylayıp etkinleştirene kadar mevcut şablon kullanılmaya devam eder.
          </p>
          <Button type="button" className="mt-2" disabled={busy} onClick={() => void onCreateCanonicalDraft()}>
            {busy ? "Oluşturuluyor…" : "Kurumsal kaynaktan uyumlu taslak oluştur ve etkinleştir"}
          </Button>
        </div>
      )}
      {data.activeTemplateCountForKind > 1 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Uyarı: bu tür için {data.activeTemplateCountForKind} aktif şablon var. Sistem en son güncelleneni kullanır,
          ancak netlik için tek bir aktif şablon bırakmanız önerilir (aşağıdaki listeden diğerlerini arşivleyin).
        </p>
      ) : null}
      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}
