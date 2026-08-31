import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";

/**
 * Re-runs `refresh` every time this screen regains focus — e.g. the user
 * pushed a create/edit/submit screen on top, mutated something there, and
 * came back (via a success action, the header back button, or a swipe-back
 * gesture; all of these fire the same focus event, which is why this hooks
 * into focus rather than any specific "success" callback).
 *
 * Skips the very first focus (the initial mount) since `useApiGet` already
 * fetches once on mount — without that, every screen using this would
 * double-fetch on first render.
 *
 * This is the shared fix for "list/detail didn't update until I left and
 * came back in" bugs: call it once per screen with the `refresh()`
 * function(s) of the `useApiGet` results that screen needs kept fresh,
 * instead of adding one-off refresh-on-return logic per screen.
 *
 * `refresh` is kept in a ref instead of the `useFocusEffect` dependency
 * array. `useApiGet` returns a new `refresh` identity on every render, so
 * depending on it directly re-registers the focus effect while the screen
 * is still focused — refresh() -> setState -> render -> new identity ->
 * effect fires again -> "Maximum update depth exceeded". The ref keeps the
 * effect itself stable ([] deps) while still always calling the latest
 * refresh function.
 */
export function useFocusRefetch(refresh: () => void): void {
  const isFirstFocus = useRef(true);
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      refreshRef.current();
    }, [])
  );
}
