import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiGet } from "../api/client";
import { useAuth } from "../auth/auth-context";
import { availableChildren, validatePersistedSelection, type ServerChild } from "./selection";

export type { ServerChild } from "./selection";

function selectedKey(userId: string): string {
  return `neviichub_selected_student:${userId}`;
}

type MyChildrenResponse = {
  children: Array<{
    id: string;
    displayName: string;
    accessType: string;
    photoPath: string | null;
    instruments: string[];
    teacherName?: string;
  }>;
};

function toServerChild(
  c: MyChildrenResponse["children"][number]
): ServerChild | null {
  if (!c || typeof c.id !== "string" || c.id.length === 0) return null;
  const instruments = Array.isArray(c.instruments) ? c.instruments.filter(Boolean).join(", ") : "";
  const detail = [instruments, typeof c.teacherName === "string" ? c.teacherName.trim() : ""]
    .filter(Boolean)
    .join(" · ");
  return {
    studentId: c.id,
    displayName: typeof c.displayName === "string" && c.displayName.trim() ? c.displayName : null,
    photoPath: typeof c.photoPath === "string" ? c.photoPath : null,
    detail: detail || null,
  };
}

type StudentContextValue = {
  /** Sunucu-otriteli aktif çocuklar (sıralı, tekrarsız, metadata'lı). */
  children: ServerChild[];
  /** Aktif öğrenci bağlamı; seçim bekleniyorsa null (ekranlar skeleton gösterir). */
  selectedId: string | null;
  /** Liste + persist tercihi yüklendi ve doğrulandı. */
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
  // Sunucu listesi + persist tercih userId'ye bağlı tutulur — oturum değişince
  // (logout/expired-token/revoke) eski değerler görmezden gelinir, eski
  // öğrencinin verisi ASLA görünmez.
  const [fetched, setFetched] = useState<{ userId: string; items: ServerChild[]; failed: boolean } | null>(null);
  const [stored, setStored] = useState<{ fp: string; value: string | null } | null>(null);
  const [override, setOverride] = useState<{ fp: string; value: string } | null>(null);

  const isGuardian = !!user && user.portalAccessType === "GUARDIAN";

  // Effect'ler yalnız asenkron iş yapar (abonelik deseni); seçim render
  // sırasında TÜRETİLİR — effect gövdelerinde senkron setState yok.
  useEffect(() => {
    if (!isGuardian || !user) return undefined;
    const userId = user.userId;
    let cancelled = false;
    void apiGet<MyChildrenResponse>("/api/v1/mobile/my-children").then((res) => {
      if (cancelled) return;
      setFetched({
        userId,
        items: res.ok ? res.data.children.map(toServerChild).filter((c): c is ServerChild => c !== null) : [],
        failed: !res.ok,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [isGuardian, user]);

  const items = useMemo(
    () => (fetched && user && fetched.userId === user.userId ? fetched.items : []),
    [fetched, user]
  );
  const listReady = !isGuardian || (fetched !== null && !!user && fetched.userId === user.userId);
  const childList = useMemo(() => availableChildren(user, items), [user, items]);
  const childIds = useMemo(() => childList.map((c) => c.studentId), [childList]);
  const fingerprint = useMemo(
    () => (user ? `${user.userId}:${user.portalAccessType ?? ""}:${childIds.join(",")}` : ""),
    [user, childIds]
  );
  const needsPicker = isGuardian && childIds.length > 1;

  useEffect(() => {
    if (!needsPicker || !user) return undefined;
    let cancelled = false;
    void SecureStore.getItemAsync(selectedKey(user.userId)).then((value) => {
      if (cancelled) return;
      setStored({ fp: `${user.userId}:${user.portalAccessType ?? ""}:${childIds.join(",")}`, value });
    });
    return () => {
      cancelled = true;
    };
  }, [needsPicker, user, childIds]);

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
    if (!user || !listReady) {
      return {
        children: user ? childList : [],
        selectedId: null,
        ready: !user,
        isMulti: false,
        select,
      };
    }
    if (childIds.length === 0) {
      return { children: [], selectedId: null, ready: true, isMulti: false, select };
    }
    if (!needsPicker) {
      // SELF öğrenci ve tek çocuklu veli: doğrudan tek kayıt, seçim beklenmez.
      return { children: childList, selectedId: childIds[0] ?? null, ready: true, isMulti: false, select };
    }
    if (override?.fp === fingerprint) {
      return { children: childList, selectedId: override.value, ready: true, isMulti: true, select };
    }
    if (stored?.fp === fingerprint) {
      // Persist tercih listeye karşı doğrulanır — erişimden çıkarılan çocuk
      // geçersiz sayılır, picker'a dönülür.
      return {
        children: childList,
        selectedId: validatePersistedSelection(childIds, stored.value),
        ready: true,
        isMulti: true,
        select,
      };
    }
    return { children: childList, selectedId: null, ready: false, isMulti: true, select };
  }, [user, listReady, childList, childIds, needsPicker, fingerprint, stored, override, select]);

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
