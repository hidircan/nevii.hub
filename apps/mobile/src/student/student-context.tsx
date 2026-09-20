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
  // Persist tercihler oturum parmak izine bağlı tutulur — oturum değişince
  // (logout/expired-token/revoke) eski parmak izli değerler görmezden gelinir,
  // eski öğrencinin verisi ASLA görünmez.
  const [stored, setStored] = useState<{ fp: string; value: string | null } | null>(null);
  const [override, setOverride] = useState<{ fp: string; value: string } | null>(null);

  const childIds = useMemo(() => availableChildIds(user), [user]);
  const fingerprint = useMemo(
    () => (user ? `${user.userId}:${user.portalAccessType ?? ""}:${childIds.join(",")}` : ""),
    [user, childIds]
  );
  const needsPersist = !!user && user.portalAccessType === "GUARDIAN" && childIds.length > 1;

  // Effect yalnız asenkron persist okuması yapar (abonelik deseni); seçim
  // render sırasında TÜRETİLİR — effect gövdesinde senkron setState yok.
  useEffect(() => {
    if (!needsPersist || !user) return undefined;
    let cancelled = false;
    void SecureStore.getItemAsync(selectedKey(user.userId)).then((value) => {
      if (cancelled) return;
      setStored({ fp: `${user.userId}:${user.portalAccessType ?? ""}:${childIds.join(",")}`, value });
    });
    return () => {
      cancelled = true;
    };
  }, [needsPersist, user, childIds]);

  const select = useCallback(
    async (studentId: string): Promise<boolean> => {
      if (!user || !childIds.includes(studentId)) return false;
      setOverride({ fp: fingerprint, value: studentId });
      try {
        await SecureStore.setItemAsync(selectedKey(user.userId), studentId);
      } catch {
        // Persist başarısızsa bellek içi seçim korunur; kritik yol etkilenmez.
      }
      return true;
    },
    [user, childIds, fingerprint]
  );

  const value = useMemo<StudentContextValue>(() => {
    if (!user || childIds.length === 0) return { children: childIds, selectedId: null, ready: true, isMulti: false, select };
    if (!needsPersist) {
      // SELF öğrenci ve tek çocuklu veli: doğrudan tek kayıt, seçim beklenmez.
      return { children: childIds, selectedId: childIds[0] ?? null, ready: true, isMulti: false, select };
    }
    if (override?.fp === fingerprint) {
      return { children: childIds, selectedId: override.value, ready: true, isMulti: true, select };
    }
    if (stored?.fp === fingerprint) {
      // Persist tercih listeye karşı doğrulanır — erişimden çıkarılan çocuk
      // geçersiz sayılır, picker'a dönülür.
      return {
        children: childIds,
        selectedId: validatePersistedSelection(childIds, stored.value),
        ready: true,
        isMulti: true,
        select,
      };
    }
    return { children: childIds, selectedId: null, ready: false, isMulti: true, select };
  }, [user, childIds, needsPersist, fingerprint, stored, override, select]);

  return <StudentContext.Provider value={value}>{children}</StudentContext.Provider>;
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
