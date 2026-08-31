import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { getAccessToken } from "../../auth/token-storage";
import { API_BASE_URL } from "../../api/client";

const PALETTE_KEYS = ["primary", "success", "warning", "danger", "info"] as const;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function hashIndex(name: string, mod: number): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash % mod;
}

type Props = {
  name: string;
  size?: number;
  /** `/api/v1/students/:id/photo` gibi KİMLİK DOĞRULAMA GEREKTİREN göreli bir yol — herkese açık bir URL DEĞİL. Yoksa baş harf fallback'i gösterilir. */
  photoPath?: string | null;
  /** Fotoğraf başarıyla yüklendiğinde çağrılır — çağıran taraf "fotoğraf var mı" durumunu takip edebilsin diye (ör. hesabım ekranı buton metni). */
  onPhotoLoad?: () => void;
  /** Fotoğraf yüklenemediğinde (yok/ağ hatası) çağrılır — bkz. onPhotoLoad. */
  onPhotoError?: () => void;
};

/** İsimden üretilen baş harf avatarı — gerçek bir fotoğraf yolu verilmişse (ve yüklenebiliyorsa) onu gösterir, aksi halde deterministik renkli baş harf. */
export function Avatar({ name, size = 40, photoPath, onPhotoLoad, onPhotoError }: Props) {
  const t = useTheme();
  const [authHeader, setAuthHeader] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!photoPath) {
      onPhotoError?.();
      return;
    }
    let cancelled = false;
    getAccessToken().then((token) => {
      if (!cancelled) setAuthHeader(token ? `Bearer ${token}` : null);
    });
    return () => {
      cancelled = true;
    };
  }, [photoPath]);

  const key = PALETTE_KEYS[hashIndex(name || "?", PALETTE_KEYS.length)]!;
  const bg = t.colors[`${key}Soft` as const];
  const fg = t.colors[key];

  if (photoPath && authHeader && !failed) {
    return (
      <Image
        source={{ uri: `${API_BASE_URL}${photoPath}`, headers: { Authorization: authHeader } }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg }}
        onError={() => {
          setFailed(true);
          onPhotoError?.();
        }}
        onLoad={onPhotoLoad}
        accessibilityLabel={name}
      />
    );
  }

  return (
    <View style={[styles.base, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={{ color: fg, fontWeight: "700", fontSize: size * 0.38 }}>{initialsOf(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
});
