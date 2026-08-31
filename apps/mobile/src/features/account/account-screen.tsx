import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { apiDelete, apiPost } from "../../api/client";
import { useAuth, type AppRole, type AuthUser } from "../../auth/auth-context";
import { AppHeader, Avatar, BottomSheet, Card, ConfirmDialog, Icon, Screen, SectionHeader, type IconName } from "../../components/ui";
import { PHOTO_RESIZE_MAX_DIMENSION, PHOTO_JPEG_COMPRESS_QUALITY, buildPhotoUploadRequestBody } from "../../lib/photo-upload";
import { useTheme, useThemePreference, type ThemePreference } from "../../theme/theme-context";

type PhotoOwner = { ownerType: "student" | "teacher" | "user"; ownerId: string };

/**
 * Rolden profil fotoğrafı "sahibini" çözer (bkz. src/lib/profile-photos.ts
 * ownerType "student" | "teacher" | "user"). Kendi Student/Teacher domain
 * kaydı olan roller o kaydın fotoğrafını yönetir (başka ekranlarda da
 * görünür); ayrı bir domain kaydı olmayan roller (veli, admin) kendi
 * User.id'sine bağlı hesap fotoğrafını yönetir.
 *
 * `forceUserPhoto` — veli (parent) hesabım ekranından çağrılır: rol her
 * zaman "STUDENT" olsa bile (Karma Öğrenci Portalı, bkz. AGENTS.md/backend
 * StudentPortalAccess GUARDIAN/SELF ayrımı) veli KENDİ hesap fotoğrafını
 * yönetir, ASLA çocuğunun Student kaydına bağlı fotoğrafı DEĞİL — bir veli
 * kendi hesap menüsünden çocuğunun fotoğrafını sessizce değiştiremez.
 * Backend bunu ayrıca `getActiveAccessType`/SELF şartıyla zorunlu kılar
 * (bkz. src/lib/services/tools.ts canManagePhoto) — bu istemci tarafı yalnız
 * doğru varsayılan davranışı sağlar, güvenlik sınırı sunucudadır.
 */
function resolvePhotoOwner(user: AuthUser | null | undefined, opts?: { forceUserPhoto?: boolean }): PhotoOwner | null {
  if (!user) return null;
  if (!opts?.forceUserPhoto) {
    if (user.role === "TEACHER" && user.teacherId) return { ownerType: "teacher", ownerId: user.teacherId };
    if (user.role === "STUDENT" && user.studentId) return { ownerType: "student", ownerId: user.studentId };
  }
  return { ownerType: "user", ownerId: user.userId };
}

/** Seçilen fotoğrafı yüklemeden ÖNCE küçültür — orijinal iPhone fotoğrafları gereksiz büyük; yalnızca büyütmeden en uzun kenarı sınırlar. */
async function resizeForUpload(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const width = asset.width || 0;
  const height = asset.height || 0;
  const longest = Math.max(width, height);
  let context = ImageManipulator.manipulate(asset.uri);
  if (longest > PHOTO_RESIZE_MAX_DIMENSION) {
    context = context.resize(width >= height ? { width: PHOTO_RESIZE_MAX_DIMENSION } : { height: PHOTO_RESIZE_MAX_DIMENSION });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: PHOTO_JPEG_COMPRESS_QUALITY, format: SaveFormat.JPEG, base64: true });
  if (!saved.base64) throw new Error("Fotoğraf işlenemedi");
  return saved.base64;
}

export type AccountQuickLink = { key: string; icon: IconName; label: string; onPress: () => void };

const ROLE_LABEL: Record<AppRole, string> = {
  SUPER_ADMIN: "Süper Yönetici",
  SCHOOL_ADMIN: "Yönetici",
  TEACHER: "Öğretmen",
  PARENT: "Veli",
  STUDENT: "Öğrenci",
  AI_AGENT: "Sistem",
};

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: IconName }> = [
  { value: "system", label: "Sistem", icon: "phone-portrait-outline" },
  { value: "light", label: "Açık", icon: "sunny-outline" },
  { value: "dark", label: "Koyu", icon: "moon-outline" },
];

/**
 * Yönetici/Öğretmen/Veli/Öğrenci hesabım ekranlarının ortak içeriği. `links`
 * ile role özel kısayollar eklenebilir. `ownAccountPhotoOnly` veli (parent)
 * hesabım ekranından geçilir — bkz. resolvePhotoOwner yorumu.
 */
export function AccountScreen({ links, ownAccountPhotoOnly }: { links?: AccountQuickLink[]; ownAccountPhotoOnly?: boolean } = {}) {
  const t = useTheme();
  const { user, logout } = useAuth();
  const { preference, setPreference } = useThemePreference();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [hasPhoto, setHasPhoto] = useState(false);

  const displayName = user?.email || (user ? ROLE_LABEL[user.role] : "Hesap");
  const photoOwner = resolvePhotoOwner(user, { forceUserPhoto: ownAccountPhotoOnly });
  const photoPath = photoOwner ? `/api/v1/${photoOwner.ownerType}s/${photoOwner.ownerId}/photo?v=${photoVersion}` : null;

  async function pickAndUploadPhoto() {
    if (!photoOwner) return;
    setPhotoError(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError(
        permission.canAskAgain
          ? "Fotoğraf seçmek için galeri erişimine izin verin."
          : "Fotoğraf seçebilmek için Ayarlar > Nevii Hub > Fotoğraflar bölümünden erişim izni vermelisiniz."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      allowsEditing: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) {
      setPhotoError("Fotoğraf okunamadı. Lütfen tekrar deneyin.");
      return;
    }

    setPhotoBusy(true);
    try {
      // Her seçimde TAZE base64 üretilir (yeniden boyutlandırılmış) — önceki seçimden kalan hiçbir referans kullanılmaz.
      const base64 = await resizeForUpload(asset);
      const res = await apiPost<{ updatedAt: string }>(
        `/api/v1/${photoOwner.ownerType}s/${photoOwner.ownerId}/photo`,
        buildPhotoUploadRequestBody(base64)
      );
      if (!res.ok) {
        setPhotoError(res.error.message || "Fotoğraf yüklenemedi. Lütfen tekrar deneyin.");
        return;
      }
      setHasPhoto(true);
      setPhotoVersion((v) => v + 1);
      setPhotoSheetOpen(false);
    } catch {
      setPhotoError("Fotoğraf yüklenemedi. Lütfen tekrar deneyin.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    if (!photoOwner) return;
    setPhotoBusy(true);
    setPhotoError(null);
    const res = await apiDelete(`/api/v1/${photoOwner.ownerType}s/${photoOwner.ownerId}/photo`);
    setPhotoBusy(false);
    if (!res.ok) {
      setPhotoError(res.error.message || "Fotoğraf kaldırılamadı. Lütfen tekrar deneyin.");
      return;
    }
    setHasPhoto(false);
    setPhotoVersion((v) => v + 1);
    setPhotoSheetOpen(false);
  }

  return (
    <Screen>
      <AppHeader title="Hesabım" />

      <Card>
        <View style={styles.profileRow}>
          <Pressable
            onPress={() => (photoOwner ? setPhotoSheetOpen(true) : undefined)}
            accessibilityLabel={photoOwner ? "Profil fotoğrafını değiştir" : undefined}
            style={{ position: "relative" }}
          >
            <Avatar
              name={displayName}
              size={52}
              photoPath={photoPath}
              onPhotoLoad={() => setHasPhoto(true)}
              onPhotoError={() => setHasPhoto(false)}
            />
            {photoOwner ? (
              <View style={[styles.photoEditBadge, { backgroundColor: t.colors.primary, borderColor: t.colors.bgRaised }]}>
                <Icon name="camera" size={11} color={t.colors.primaryOn} />
              </View>
            ) : null}
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[t.typography.cardTitle, { color: t.colors.text }]} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
              {user ? ROLE_LABEL[user.role] : ""}
            </Text>
          </View>
        </View>
        <View style={[styles.divider, { backgroundColor: t.colors.divider }]} />
        <View style={styles.metaRow}>
          <Icon name="business-outline" size={15} color={t.colors.textMuted} />
          <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Kurum: {user?.tenantId ?? "—"}</Text>
        </View>
      </Card>

      {photoOwner ? (
        <BottomSheet visible={photoSheetOpen} title="Profil fotoğrafı" onClose={() => setPhotoSheetOpen(false)}>
          <View style={{ gap: 10, paddingBottom: 8 }}>
            {photoError ? <Text style={{ color: t.colors.danger }}>{photoError}</Text> : null}
            <Pressable onPress={pickAndUploadPhoto} disabled={photoBusy} style={styles.sheetOptionRow}>
              <View style={styles.optionLeft}>
                <Icon name="image-outline" size={18} color={t.colors.primary} />
                <Text style={[t.typography.body, { color: t.colors.primary }]}>
                  {photoBusy ? "İşleniyor..." : hasPhoto ? "Fotoğrafı değiştir" : "Fotoğraf seç"}
                </Text>
              </View>
            </Pressable>
            {hasPhoto ? (
              <Pressable onPress={removePhoto} disabled={photoBusy} style={styles.sheetOptionRow}>
                <View style={styles.optionLeft}>
                  <Icon name="trash-outline" size={18} color={t.colors.danger} />
                  <Text style={[t.typography.body, { color: t.colors.danger }]}>Fotoğrafı kaldır</Text>
                </View>
              </Pressable>
            ) : null}
            <Pressable onPress={() => setPhotoSheetOpen(false)} disabled={photoBusy} style={styles.sheetOptionRow}>
              <View style={styles.optionLeft}>
                <Text style={[t.typography.body, { color: t.colors.textMuted }]}>Vazgeç</Text>
              </View>
            </Pressable>
          </View>
        </BottomSheet>
      ) : null}

      {links && links.length > 0 ? (
        <>
          <SectionHeader title="Araçlar" />
          <Card>
            {links.map((link, i) => (
              <View key={link.key}>
                {i > 0 ? <View style={[styles.divider, { backgroundColor: t.colors.divider }]} /> : null}
                <Pressable onPress={link.onPress} style={styles.optionRow}>
                  <View style={styles.optionLeft}>
                    <Icon name={link.icon} size={18} color={t.colors.textMuted} />
                    <Text style={[t.typography.body, { color: t.colors.text }]}>{link.label}</Text>
                  </View>
                  <Icon name="chevron-forward" size={16} color={t.colors.textFaint} />
                </Pressable>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title="Görünüm" />
      <Card>
        {THEME_OPTIONS.map((opt, i) => (
          <View key={opt.value}>
            {i > 0 ? <View style={[styles.divider, { backgroundColor: t.colors.divider }]} /> : null}
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: preference === opt.value }}
              onPress={() => setPreference(opt.value)}
              style={styles.optionRow}
            >
              <View style={styles.optionLeft}>
                <Icon name={opt.icon} size={18} color={t.colors.textMuted} />
                <Text style={[t.typography.body, { color: t.colors.text }]}>{opt.label}</Text>
              </View>
              <Icon
                name={preference === opt.value ? "radio-button-on" : "radio-button-off"}
                size={20}
                color={preference === opt.value ? t.colors.primary : t.colors.textFaint}
              />
            </Pressable>
          </View>
        ))}
      </Card>

      <SectionHeader title="Hesap" />
      <Card onPress={() => setConfirmingLogout(true)}>
        <View style={styles.optionRow}>
          <View style={styles.optionLeft}>
            <Icon name="log-out-outline" size={18} color={t.colors.danger} />
            <Text style={[t.typography.body, { color: t.colors.danger }]}>Çıkış yap</Text>
          </View>
        </View>
      </Card>

      <ConfirmDialog
        visible={confirmingLogout}
        title="Çıkış yapılsın mı?"
        message="Bu cihazda oturumunuz kapatılacak."
        confirmLabel="Çıkış yap"
        danger
        onConfirm={() => {
          setConfirmingLogout(false);
          void logout();
        }}
        onCancel={() => setConfirmingLogout(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  photoEditBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  optionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  optionLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  /** 48pt dokunma hedefi — bkz. iPhone SE dahil erişilebilirlik gereksinimi. */
  sheetOptionRow: { flexDirection: "row", alignItems: "center", minHeight: 48 },
});
