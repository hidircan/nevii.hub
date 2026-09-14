import { useEffect, useRef, useState } from "react";
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
  // `failed`i effect gövdesinde senkron `setFailed(false)` ile sıfırlamak
  // yerine (react-hooks/set-state-in-effect), hangi photoPath için
  // başarısız olduğunu tutup render sırasında karşılaştırıyoruz — photoPath
  // değiştiğinde otomatik olarak "başarısız değil" olarak türetiliyor.
  // (Bilinen küçük sınır durumu: aynı photoPath değerine ikinci kez, arada
  // FARKLI bir photoPath'ten geçmeden dönülürse — pratikte bu bileşenin
  // kullanım biçiminde olmuyor, her Avatar sabit bir kişiye bağlı — eski
  // başarısızlık damgası hâlâ eşleşir ve fallback'te kalır; fotoğraf
  // gerçekten değiştiğinde her zaman doğru sıfırlanır.)
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const failed = !!photoPath && failedFor === photoPath;

  // Çağıran taraf onPhotoError'ı çoğu zaman inline verir (her render'da yeni
  // kimlik). Aşağıdaki effect yalnız photoPath değişince çalışmalı; güncel
  // callback'e ref üzerinden erişilir. Bu effect ondan ÖNCE tanımlı olduğu
  // için aynı commit'te ref zaten günceldir.
  const onPhotoErrorRef = useRef(onPhotoError);
  useEffect(() => {
    onPhotoErrorRef.current = onPhotoError;
  });

  useEffect(() => {
    if (!photoPath) {
      onPhotoErrorRef.current?.();
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
          setFailedFor(photoPath ?? null);
          onPhotoError?.();
        }}
        onLoad={onPhotoLoad}
        // Kişinin fotoğrafı kimlik bilgisi taşır (dekoratif değil): ekran okuyucu adı okur.
        alt={name.trim() || "Profil fotoğrafı"}
        accessibilityLabel={name.trim() || "Profil fotoğrafı"}
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
