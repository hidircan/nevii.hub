"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    // Double-click/retry guard, same as user-menu.tsx's logout().
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const res = await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        // Previously this navigated to /login unconditionally even when the server
        // call failed (e.g. CSRF/origin rejection, network error) — cookies stayed
        // valid, so the user only *looked* logged out until the next protected-route
        // visit silently let them back in (see user-menu.tsx's logout() for the same
        // fix already applied there).
        setLoggingOut(false);
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loggingOut}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)] disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}
    >
      <LogOut className="h-4 w-4" />
      {loggingOut ? "Çıkış yapılıyor…" : "Çıkış"}
    </button>
  );
}
