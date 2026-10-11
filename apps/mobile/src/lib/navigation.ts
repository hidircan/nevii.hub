import { personaOf, useAuth } from "../auth/auth-context";
import type { PersonaBasePath } from "./navigation-rules";

export { goBack, listFallback, type BackRouter, type PersonaBasePath } from "./navigation-rules";

/**
 * Oturumun persona kökü — detay ekranlarının deep-link fallback'i için.
 * Persona çözülemezse "/(student)" varsayılmaz, "/" döner (rol evi).
 */
export function usePersonaBasePath(): PersonaBasePath | "/" {
  const { user } = useAuth();
  const persona = personaOf(user);
  if (persona === "parent") return "/(parent)";
  if (persona === "teacher") return "/(teacher)";
  if (persona === "admin") return "/(admin)";
  if (persona === "student") return "/(student)";
  return "/";
}
