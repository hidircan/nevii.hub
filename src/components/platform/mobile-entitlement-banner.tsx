"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { ConfirmBar } from "@/components/platform/confirm-dialog";
import { apiFetchJson } from "@/lib/api/client-fetch";
import { friendlyApiErrorMessage } from "@/lib/api/friendly-error";

/**
 * Mobil hakkı YOKSA NeviiOS › Kurum › Mobil sayfasının üstündeki uyarı.
 * "Hakkı ver" ayar editörüyle AYNI denetimli yolu kullanır (PATCH
 * /api/v1/platform/tenants/:id/settings → applySettingWrite: kritik onay +
 * audit + sürüm); mevcut entitlement override'ları korunur, yalnız
 * mobileApp: true eklenir.
 */
export function MobileEntitlementBanner({
  tenantId,
  targetLabel,
  currentOverrides,
}: {
  tenantId: string;
  targetLabel: string;
  currentOverrides: Record<string, boolean>;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function grant() {
    setPending(true);
    setError(null);
    const res = await apiFetchJson(`/api/v1/platform/tenants/${tenantId}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "subscription.entitlementOverrides",
        value: { ...currentOverrides, mobileApp: true },
        confirm: true,
        reason: "NeviiOS › Mobil: mobil uygulama hakkı verildi",
      }),
    });
    setPending(false);
    setConfirmOpen(false);
    if (!res.ok) {
      setError(
        friendlyApiErrorMessage(
          res.error,
          "Mobil uygulama hakkı kaydedilemedi. Sayfayı yenileyip tekrar deneyin; sorun sürerse Paket & Limit sekmesinde subscription.entitlementOverrides ayarına \"mobileApp\": true ekleyin."
        )
      );
      return;
    }
    router.refresh();
  }

  return (
    <div
      role="alert"
      className="rounded-[var(--radius-lg)] border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900"
    >
      <p className="font-semibold">Bu kurumun paketinde mobil uygulama hakkı yok.</p>
      <p className="mt-1">
        Öğretmen, öğrenci ve veliler mobil uygulamaya giriş yapınca &ldquo;Mobil erişim kapalı&rdquo; ekranını görür. Bu sayfadaki
        mobil anahtarlar (Genel mobil erişim, iOS/Android, portallar) hak verilene kadar hiçbir etki yapmaz — sunucu reddeder.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="danger" disabled={pending} onClick={() => setConfirmOpen(true)}>
          Mobil uygulama hakkını ver
        </Button>
        <a className="text-xs underline" href={`/platform/kurumlar/${tenantId}/paket`}>
          Paket & Limit sekmesine git
        </a>
      </div>
      {error ? <p className="mt-2 text-xs font-medium text-rose-700">{error}</p> : null}
      <ConfirmBar
        open={confirmOpen}
        title="Mobil uygulama hakkı ver"
        description={`${targetLabel} için subscription.entitlementOverrides ayarına mobileApp: true eklenir (diğer override'lar korunur). Değişiklik denetim kaydına yazılır. Ardından "Genel mobil erişim" ayarının da açık olduğundan emin olun.`}
        pending={pending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void grant()}
      />
    </div>
  );
}
