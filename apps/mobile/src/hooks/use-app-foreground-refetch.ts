import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

/**
 * Re-runs `refresh` whenever the app returns to the foreground (backgrounded
 * → active) — e.g. a teacher starts a lesson, backgrounds the app for a bit,
 * comes back and the server-side status (or another device's action) may
 * have changed since. Same ref-based pattern as `useFocusRefetch` (keeps the
 * listener stable, avoids the "refresh -> new identity -> re-subscribe"
 * loop) — the two compose independently for a screen that needs both.
 */
export function useAppForegroundRefetch(refresh: () => void): void {
  const refreshRef = useRef(refresh);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        refreshRef.current();
      }
      appState.current = next;
    });
    return () => subscription.remove();
  }, []);
}
