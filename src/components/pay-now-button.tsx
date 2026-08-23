"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/**
 * Karma Öğrenci Portalı — güvenli online ödeme başlatma. Yalnızca
 * `paymentId` gönderir; tutar/öğrenci/tenant sahipliği SUNUCUDA
 * (`initiateStudentPaymentCheckoutTool`) doğrulanır, hiçbir zaman
 * client'tan güvenilmez. Sağlayıcı yapılandırılmadıysa (CONFLICT) teknik
 * hata yerine açık, destek yönlendirmeli bir mesaj gösterir — asla sessiz/boş
 * bir CTA veya sahte başarı göstermez.
 */
export function PayNowButton({
  paymentId,
  contactWaLink,
  className,
  label = "Şimdi Öde",
}: {
  paymentId: string;
  contactWaLink: string | null;
  className?: string;
  label?: string;
}) {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "not_configured" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function onPay() {
    setPending(true);
    setStatus({ kind: "idle" });
    try {
      const res = await fetch(`/api/v1/payments/${paymentId}/checkout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { checkoutUrl: string };
        error?: { code: string; message: string };
      };
      if (json.ok && json.data?.checkoutUrl) {
        window.location.href = json.data.checkoutUrl;
        return;
      }
      if (json.error?.code === "CONFLICT") {
        setStatus({ kind: "not_configured" });
      } else {
        setStatus({ kind: "error", message: json.error?.message || "Ödeme başlatılamadı." });
      }
    } catch {
      setStatus({ kind: "error", message: "Bağlantı hatası — lütfen tekrar deneyin." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={onPay} disabled={pending} className={className}>
        {pending ? "Yönlendiriliyor..." : label}
      </Button>
      {status.kind === "not_configured" ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800"
        >
          <p className="font-medium">Online ödeme şu anda kullanılamıyor</p>
          <p className="mt-0.5">
            Kurumumuz online ödeme sistemini henüz etkinleştirmedi. Ödemenizi okulla doğrudan iletişime geçerek
            yapabilirsiniz.
          </p>
          {contactWaLink ? (
            <a
              href={contactWaLink}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              Okulla iletişime geç
            </a>
          ) : null}
        </div>
      ) : null}
      {status.kind === "error" ? (
        <p role="alert" className="text-xs text-rose-600">
          {status.message} Sorun sürerse okulla iletişime geçin.
        </p>
      ) : null}
    </div>
  );
}
