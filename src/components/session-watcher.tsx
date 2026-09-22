"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ModalShell, modalButton } from "@/components/modal-shell";

const PROTECTED_PREFIXES = ["/panel", "/ogretmen", "/veli", "/ogrenci", "/sube", "/platform"];
const POLL_MS = 30_000;

/**
 * N — tek aktif oturum: bu cihazın oturumu başka cihazdan devralınırsa kullanıcıyı
 * net bir diyalogla bilgilendirir ve giriş ekranına yönlendirir. Yalnız korumalı
 * ekranlarda, sekme görünürken 30 sn'de bir ve sekmeye dönüldüğünde yoklar.
 */
export function SessionWatcher() {
  const pathname = usePathname() ?? "";
  const active = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const [takenOverAt, setTakenOverAt] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!active || takenOverAt !== undefined) return;
    let stopped = false;
    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/v1/auth/session-status", { credentials: "include", cache: "no-store" });
        const json = (await res.json()) as { ok: boolean; data?: { state: string; at?: string | null } };
        if (!stopped && json.data?.state === "taken_over") setTakenOverAt(json.data.at ?? null);
      } catch {
        // ağ hatası: sessiz — bir sonraki yoklamada tekrar denenir
      }
    }
    void check();
    const id = window.setInterval(check, POLL_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [active, takenOverAt]);

  async function goToLogin() {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // çerezler yine de sunucuda geçersiz; giriş ekranı yeni oturum ister
    }
    window.location.href = "/login?oturum=devralindi";
  }

  if (takenOverAt === undefined) return null;
  const when = takenOverAt
    ? new Date(takenOverAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })
    : null;

  return (
    <ModalShell
      open
      tone="warning"
      title="Oturumunuz başka bir cihazda açıldı"
      onClose={() => void goToLogin()}
      footer={
        <button type="button" className={modalButton.primary} onClick={() => void goToLogin()}>
          Giriş ekranına git
        </button>
      }
    >
      <p>
        Bu hesapla {when ? `${when} tarihinde ` : ""}başka bir cihazdan giriş yapıldı ve bu cihazdaki oturum güvenlik için
        kapatıldı. Kaydedilmemiş değişiklikleriniz varsa yeniden giriş yaptıktan sonra kontrol edin.
      </p>
      <p className="mt-2 text-xs text-[var(--color-text-muted)]">
        Bu girişi siz yapmadıysanız hemen yeniden giriş yapıp şifrenizi değiştirin ve kurum yöneticinize bildirin.
      </p>
    </ModalShell>
  );
}
