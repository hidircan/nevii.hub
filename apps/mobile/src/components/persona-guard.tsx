import { Redirect } from "expo-router";
import type { ReactNode } from "react";
import { LoadingState } from "./ui/states";
import { roleToPersona, useAuth, type AppRole } from "../auth/auth-context";

/** Sekme grubunun (admin/teacher/parent) yalnız kendi rolüyle giriş yapmış kullanıcıya açık olmasını sağlar. */
export function PersonaGuard({ persona, children }: { persona: ReturnType<typeof roleToPersona>; children: ReactNode }) {
  const { status, user } = useAuth();

  if (status === "loading") return <LoadingState />;
  if (status === "signedOut" || !user) return <Redirect href="/login" />;

  const actual = roleToPersona(user.role as AppRole);
  if (actual !== persona) return <Redirect href="/" />;

  return <>{children}</>;
}
