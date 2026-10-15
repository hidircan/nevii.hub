"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ModalShell, modalButton } from "@/components/modal-shell";
import { ACTIVITY_PING_MS, IDLE_LOGOUT_MS, IDLE_WARNING_MS } from "@/lib/session-policy";
import { lastUserActivityAt, markUserActivity } from "@/lib/user-activity";

const PROTECTED_PREFIXES = ["/panel", "/ogretmen", "/veli", "/ogrenci", "/sube", "/platform", "/gelisim"];
const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove", "scroll"] as const;
const PING_KEY = "nh:lastActivityPing";
const LOGOUT_KEY = "nh:idleLogout";

function readNum(key: string): number {
  try {
    return Number(window.localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}
function writeNum(key: string, v: number) {
  try {
    window.localStorage.setItem(key, String(v));
  } catch {
    // yok say
  }
}

/**
 * 2026-10-16 (owner) — web hareketsizlik: 30 dk gerçek etkileşim yoksa çıkış, son 2 dk uyarı + "Oturumu sürdür".
 * Sekmeler ortak saati paylaşır (localStorage); bir sekme çıkış yapınca diğerleri de giriş ekranına gider.
 * Sunucu aynı süreyi JWT `act` ile ayrıca uygular — bu zamanlayıcı yalnız kullanıcı deneyimi içindir.
 * Etkinlik sunucuya en fazla 5 dk'da bir ve yalnız gerçek etkileşimden sonra bildirilir (her harekette DB yazımı yok).
 * Uyku/uyanma: kontrol duvar saatiyle yapılır; uyanınca süre aşıldıysa hemen çıkış (sunucu da reddeder).
 * Kaydedilmemiş form: yazmak etkinliktir (uzun formda çıkış olmaz); terk edilmiş taslak başka kullanıcıya taşınmasın
 * diye tarayıcıda SAKLANMAZ — uyarı penceresi kaydetme fırsatı verir.
 */
export function IdleSessionManager() {
  const pathname = usePathname() ?? "";
  const active = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && pathname !== "/platform/giris";
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const loggingOut = useRef(false);

  useEffect(() => {
    if (!active) return;

    async function ping() {
      writeNum(PING_KEY, Date.now());
      try {
        await fetch("/api/v1/auth/refresh", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ activity: true }),
        });
      } catch {
        // ağ yok: bir sonraki etkileşimde yeniden denenir
      }
    }

    async function logout() {
      if (loggingOut.current) return;
      loggingOut.current = true;
      writeNum(LOGOUT_KEY, Date.now());
      try {
        await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
      } catch {
        // çerez sunucuda zaten geçersiz (act süresi aşıldı)
      }
      try {
        window.sessionStorage.clear();
      } catch {
        // yok say
      }
      window.location.href = "/login?oturum=zaman-asimi";
    }

    function onActivity() {
      markUserActivity();
      if (Date.now() - readNum(PING_KEY) >= ACTIVITY_PING_MS) void ping();
    }

    function tick() {
      const idle = Date.now() - lastUserActivityAt();
      if (idle >= IDLE_LOGOUT_MS) return void logout();
      setRemainingSec(idle >= IDLE_LOGOUT_MS - IDLE_WARNING_MS ? Math.ceil((IDLE_LOGOUT_MS - idle) / 1000) : null);
    }

    function onStorage(e: StorageEvent) {
      if (e.key === LOGOUT_KEY && e.newValue) void logout();
    }

    markUserActivity(); // sayfaya gelmek bir kullanıcı eylemidir
    for (const ev of EVENTS) window.addEventListener(ev, onActivity, { passive: true });
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", tick);
    const id = window.setInterval(tick, 15_000);
    tick();
    return () => {
      for (const ev of EVENTS) window.removeEventListener(ev, onActivity);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", tick);
      window.clearInterval(id);
    };
  }, [active]);

  // Uyarı açıkken geri sayım saniyede bir.
  useEffect(() => {
    if (remainingSec === null) return;
    const id = window.setTimeout(() => setRemainingSec((s) => (s === null ? null : Math.max(0, s - 1))), 1000);
    return () => window.clearTimeout(id);
  }, [remainingSec]);

  if (!active || remainingSec === null) return null;
  const mm = Math.floor(remainingSec / 60);
  const ss = String(remainingSec % 60).padStart(2, "0");
  function keepAlive() {
    writeNum(PING_KEY, 0); // etkinlik hemen sunucuya bildirilsin
    window.dispatchEvent(new Event("pointerdown")); // → onActivity: kayıt + bildirim
    setRemainingSec(null);
  }
  return (
    <ModalShell
      open
      tone="warning"
      title="Oturumunuz kapanmak üzere"
      onClose={keepAlive}
      footer={
        <button type="button" className={modalButton.primary} onClick={keepAlive}>
          Oturumu sürdür
        </button>
      }
    >
      <p>
        Bir süredir işlem yapılmadı. Güvenlik için oturumunuz <strong>{mm}:{ss}</strong> içinde kapanacak. Kaydedilmemiş
        değişiklikleriniz varsa &quot;Oturumu sürdür&quot;e basıp kaydedin.
      </p>
    </ModalShell>
  );
}
