"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * Panel mobil navigasyon durumu — SADECE <lg drawer'ı yönetir.
 *
 * Masaüstü dar/geniş tercihi (`Sidebar` içindeki `collapsed`, localStorage +
 * hesap kaydında kalıcı) ile AYNI state DEĞİLDİR: masaüstündeki collapsed
 * tercihi telefona taşınıp menüyü açık bırakmaz; drawer her zaman kapalı
 * başlar ve route değişiminde kendiliğinden kapanır. SSR/hydration uyumu
 * için ilk değer her iki tarafta da `false`.
 */
type PanelNavContextValue = {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  closeMobileNav: () => void;
  /** Drawer kapanınca odağın döneceği açma düğmesi. */
  menuButtonRef: RefObject<HTMLButtonElement | null>;
};

const PanelNavContext = createContext<PanelNavContextValue | null>(null);

export function PanelNavProvider({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpenState] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  const setMobileOpen = useCallback((open: boolean | ((prev: boolean) => boolean)) => {
    setMobileOpenState(open);
  }, []);
  const closeMobileNav = useCallback(() => {
    setMobileOpenState(false);
  }, []);

  const value = useMemo(
    () => ({ mobileOpen, setMobileOpen, closeMobileNav, menuButtonRef }),
    [mobileOpen, setMobileOpen, closeMobileNav]
  );
  return <PanelNavContext.Provider value={value}>{children}</PanelNavContext.Provider>;
}

export function usePanelNav(): PanelNavContextValue {
  const ctx = useContext(PanelNavContext);
  if (!ctx) throw new Error("usePanelNav yalnızca PanelNavProvider içinde kullanılır");
  return ctx;
}
