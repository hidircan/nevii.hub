import { Redirect } from "expo-router";
import type { ReactNode } from "react";
import { LoadingState } from "./ui/states";
import { personaOf, useAuth, type MobilePersona } from "../auth/auth-context";

/**
 * Sekme grubunun yalnız sunucunun çözdüğü persona ile eşleşen kullanıcıya açık
 * olmasını sağlar. Eşleşmeyen / desteklenmeyen / doğrulanamayan oturum her
 * zaman "/"'e döner (orada login, hata veya "desteklenmiyor" ekranı gösterilir).
 */
export function PersonaGuard({ persona, children }: { persona: MobilePersona; children: ReactNode }) {
  const { status, user } = useAuth();

  if (status === "loading") return <LoadingState />;
  if (status === "signedOut") return <Redirect href="/login" />;
  if (status !== "signedIn" || personaOf(user) !== persona) return <Redirect href="/" />;

  return <>{children}</>;
}
