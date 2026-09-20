import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../auth/auth-context";
import { availableChildIds, validatePersistedSelection } from "./selection";

export type { ServerChild } from "./selection";

function selectedKey(userId: string): string {
  return `neviichub_selected_student:${userId}`;
}

type StudentContextValue = {
  /** Sunucu-otriteli aktif çocuk ID'leri (sıralı, tekrarsız). */
  children: string[];
  /** Aktif öğrenci bağlamı; seçim bekleniyorsa null (ekranlar skeleton gösterir). */
  selectedId: string | null;
  /** Persist tercihi yüklendi + oturumla doğrulandı. */
  ready: boolean;
  /** Çoklu çocuk velisi. */
  isMulti: boolean;
  /** Yalnız listedeki ID seçilebilir; dönüt başarıyı bildirir. */
  select: (studentId: string) => Promise<boolean>;
};

const StudentContext = createContext<StudentContextValue>({
  children: [],
  selectedId: null,
  ready: false,
  isMulti: false,
  select: async () => false,
});

export function StudentProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [userKey, setUserKey] = useState<string | null>(null);

  const childIds = useMemo(() => availableChildIds(user), [user]);
  const fingerprint = useMemo(
    () => (user ? `${user.userId}:${user.portalAccessType ?? ""}:${childIds.join(",")}` : ""),
    [user, childIds]
  );

  // Oturum değişti → state sıfırlanır (logout/expired-token/revoke sonrası
  // eski öğrencinin verisi ASLA görünmez), persist tercih listeye karşı doğrulanır.
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setSelected(null);
    setUserKey(user?.userId ?? null);
    if (!user || childIds.length === 0) {
      setReady(true);
      return undefined;
    }
    if (user.portalAccessType !== "GUARDIAN") {
      // SELF öğrenci (+ öğretmen dışı tüm tekil bağlamlar): doğrudan kendi kaydı.
      if (!cancelled) {
        setSelected(childIds[0] ?? null);
        setReady(true);
      }
      return undefined;
    }
    if (childIds.length === 1) {
      if (!cancelled) {
        setSelected(childIds[0] ?? null);
        setReady(true);
      }
      return undefined;
    }
    void SecureStore.getItemAsync(selectedKey(user.userId)).then((stored) => {
      if (cancelled) return;
      setSelected(validatePersistedSelection(childIds, stored));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [fingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = useCallback(
    async (studentId: string): Promise<boolean> => {
      if (!user || !childIds.includes(studentId)) return false;
      setSelected(studentId);
      try {
        await SecureStore.setItemAsync(selectedKey(user.userId), studentId);
      } catch {
        // Persist başarısızsa bellek içi seçim korunur; kritik yol etkilenmez.
      }
      return true;
    },
    [user, childIds]
  );

  const value = useMemo<StudentContextValue>(
    () => ({
      children: childIds,
      selectedId: selected,
      ready,
      isMulti: childIds.length > 1,
      select,
    }),
    [childIds, selected, ready, select]
  );

  return (
    <StudentContext.Provider value={value} key={userKey ?? "signed-out"}>
      {children}
    </StudentContext.Provider>
  );
}

function useStudentContext(): StudentContextValue {
  return useContext(StudentContext);
}

/**
 * Ekranların kullanacağı aktif öğrenci ID'si. Seçim beklenirken null döner —
 * çağıran skeleton gösterir, eski öğrencinin verisini ASLA göstermez.
 */
export function useSelectedStudentId(): string | null {
  return useStudentContext().selectedId;
}

export function useChildSelection(): StudentContextValue {
  return useStudentContext();
}
