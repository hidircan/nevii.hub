import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { apiDelete, apiPost } from "../../api/client";
import { useAuth, type AppRole, type AuthUser } from "../../auth/auth-context";
import { useChildSelection } from "../../student/student-context";
import { AppHeader, Avatar, BottomSheet, Card, ConfirmDialog, FilterChip, Icon, Screen, SectionHeader, type IconName, AppText } from "../../components/ui";
import { useApiGet } from "../../hooks/use-api";
import { PHOTO_RESIZE_MAX_DIMENSION, PHOTO_JPEG_COMPRESS_QUALITY, buildPhotoUploadRequestBody } from "../../lib/photo-upload";
import { getLegalLinks } from "../../legal/legal-links";
import { lookup } from "../../i18n/locales";
import { getActiveLocale } from "../../i18n/locale-store";
import { useLocale } from "../../i18n/locale-context";
import { LanguageSelector } from "../../components/language-selector";
import { useTheme, useThemePreference, type ThemePreference } from "../../theme/theme-context";
import type { FontScalePreference } from "../../theme/tokens";
import type { ScheduleResponse, StudentProfile } from "../../types/api";
import { resolveDisplayName } from "./display-name";

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
  if (!saved.base64) throw new Error(lookup(getActiveLocale(), "account.photoProcessFail"));
  return saved.base64;
}

export type AccountQuickLink = { key: string; icon: IconName; label: string; onPress: () => void };

const ROLE_LABEL_KEY: Record<AppRole, string> = {
  HYPER_ADMIN: "account.rolePlatformAdmin",
  SUPER_ADMIN: "account.roleOwner",
  SCHOOL_ADMIN: "account.roleAdmin",
  BRANCH_MANAGER: "account.roleBranchManager",
  TEACHER: "account.roleTeacher",
  STUDENT: "account.roleStudent",
  AI_AGENT: "account.roleSystem",
};

/** Veli de STUDENT rolüyle girer — etiket sunucunun portal erişim türünden gelir. */
function roleLabel(user: AuthUser, tr: (path: string) => string): string {
  if (user.portalAccessType === "GUARDIAN") return tr("account.roleGuardian");
  return tr(ROLE_LABEL_KEY[user.loginRole] ?? ROLE_LABEL_KEY[user.role]);
}

const THEME_OPTIONS: Array<{ value: ThemePreference; labelKey: string; icon: IconName }> = [
  { value: "system", labelKey: "account.themeSystem", icon: "phone-portrait-outline" },
  { value: "light", labelKey: "account.themeLight", icon: "sunny-outline" },
  { value: "dark", labelKey: "account.themeDark", icon: "moon-outline" },
];

const FONT_SIZE_OPTIONS: Array<{ value: FontScalePreference; labelKey: string }> = [
  { value: "normal", labelKey: "account.fontSizeNormal" },
  { value: "large", labelKey: "account.fontSizeLarge" },
  { value: "xlarge", labelKey: "account.fontSizeXLarge" },
];

/**
 * Gizlilik/yasal bölüm — hukuki sayfalar uygulama dışında açılır
 * (`legal-links.ts` tek kaynak). Hesap silme: uygulama-içi talep ekranı
 * (`/hesap-silme-talebi`) + sunucu talebi + durum takibi; sahte "silindi"
 * davranışı YOK.
 */
function LegalSection() {
  const t = useTheme();
  const { t: tr } = useLocale();
  const router = useRouter();
  const links = getLegalLinks();

  const rows: Array<{ icon: IconName; label: string; hint: string; onPress: () => void }> = [
    {
      icon: "shield-checkmark-outline",
      label: tr("account.privacy"),
      hint: tr("account.openOutside"),
      onPress: () => void Linking.openURL(links.privacyPolicyUrl),
    },
    {
      icon: "document-text-outline",
      label: tr("account.terms"),
      hint: tr("account.openOutside"),
      onPress: () => void Linking.openURL(links.termsUrl),
    },
    {
      icon: "trash-outline",
      label: tr("account.deleteRow"),
      hint: tr("account.deleteHint"),
      onPress: () => router.push("/hesap-silme-talebi"),
    },
  ];

  return (
    <Card>
      {rows.map((row, i) => (
        <View key={row.label}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: t.colors.divider }]} /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={row.label}
            accessibilityHint={row.hint}
            onPress={row.onPress}
            style={styles.deletionRow}
          >
            <View style={styles.optionLeft}>
              <Icon name={row.icon} size={18} color={t.colors.textMuted} />
              <View style={{ flex: 1 }}>
                <AppText style={[t.typography.body, { color: t.colors.text }]}>{row.label}</AppText>
                <AppText style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 1 }]}>{row.hint}</AppText>
              </View>
            </View>
            <Icon name="chevron-forward" size={16} color={t.colors.textFaint} />
          </Pressable>
        </View>
      ))}
    </Card>
  );
}

/**
 * Yönetici/Öğretmen/Veli/Öğrenci hesabım ekranlarının ortak içeriği. `links`
 * ile role özel kısayollar eklenebilir. `ownAccountPhotoOnly` veli (parent)
 * hesabım ekranından geçilir — bkz. resolvePhotoOwner yorumu.
 */
export function AccountScreen(
  { links, ownAccountPhotoOnly, showChildContext }: { links?: AccountQuickLink[]; ownAccountPhotoOnly?: boolean; showChildContext?: boolean } = {}
) {
  const t = useTheme();
  const { t: tr } = useLocale();
  const { user, logout } = useAuth();
  const router = useRouter();
  // Seçili öğrenci bağlam bandı — veli/öğrenci Hesabım hangi çocuğun
  // müfredat/materyal/sözleşmesine bakıldığını açıkça gösterir. Hook'lar
  // koşulsuz çağrılır; gösterim `showChildContext` ile sınırlıdır.
  const selection = useChildSelection();
  const contextProfile = useApiGet<StudentProfile>(
    showChildContext && selection.selectedId ? `/api/v1/students/${selection.selectedId}` : ""
  );
  const { preference, setPreference, fontSize, setFontSize } = useThemePreference();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [hasPhoto, setHasPhoto] = useState(false);

  // Personel gerçek adı: öğretmenin KENDİ programındaki `teacherName`
  // (sunucu teacherId sahipliğini doğrular — başka kaynaktan tahmin yok).
  // Session/user yanıtında isim alanı YOK; e-posta restore'da korunur
  // (token-storage). Kimlik çözülene kadar iskelet — rol etiketi ada konmaz.
  const isTeacher = user?.role === "TEACHER" && !!user?.teacherId;
  // Yalnız öğretmen-adı çözümlemesi için: tek ders yeter (isim tüm kayıtlarda denormalize).
  const teacherSchedule = useApiGet<ScheduleResponse>(
    isTeacher && user?.teacherId ? `/api/v1/teachers/${user.teacherId}/schedule?limit=1` : ""
  );
  const teacherName =
    teacherSchedule.status === "success"
      ? (teacherSchedule.data.lessons.find((l) => l.teacherName?.trim())?.teacherName?.trim() ?? null)
      : null;
  const resolvedName = user ? resolveDisplayName({ teacherName, email: user.email }) : null;
  const teacherNamePending = isTeacher && teacherSchedule.status === "loading";
  // Ad yerine rol etiketi ("Öğretmen") ASLA konmaz — çözülmediyse iskelet
  // (pending) ya da nötr fallback; rol zaten alt satırda gösterilir.
  const displayName = resolvedName;
  const showSkeleton = !displayName && (!user || teacherNamePending);
  const photoOwner = resolvePhotoOwner(user, { forceUserPhoto: ownAccountPhotoOnly });
  const photoPath = photoOwner ? `/api/v1/${photoOwner.ownerType}s/${photoOwner.ownerId}/photo?v=${photoVersion}` : null;

  async function pickAndUploadPhoto() {
    if (!photoOwner) return;
    setPhotoError(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError(permission.canAskAgain ? tr("account.galleryAsk") : tr("account.gallerySettings"));
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
      setPhotoError(tr("account.photoUnreadable"));
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
        setPhotoError(res.error.message || tr("account.photoUploadFail"));
        return;
      }
      setHasPhoto(true);
      setPhotoVersion((v) => v + 1);
      setPhotoSheetOpen(false);
    } catch {
      setPhotoError(tr("account.photoUploadFail"));
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
      setPhotoError(res.error.message || tr("account.photoRemoveFail"));
      return;
    }
    setHasPhoto(false);
    setPhotoVersion((v) => v + 1);
    setPhotoSheetOpen(false);
  }

  return (
    <Screen>
      <AppHeader title={tr("account.title")} />

      <Card>
        <View style={styles.profileRow}>
          <Pressable
            onPress={() => (photoOwner ? setPhotoSheetOpen(true) : undefined)}
            accessibilityLabel={photoOwner ? tr("account.photoChange") : undefined}
            style={{ position: "relative" }}
          >
            <Avatar
              name={displayName ?? tr("account.userFallback")}
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
            {showSkeleton ? (
              // Kimlik çözülürken yanlış metin gösterilmez — iskelet.
              <View accessibilityLabel={tr("account.profileLoading")}>
                <View style={[styles.nameSkeleton, { backgroundColor: t.colors.bgMuted }]} />
                <View style={[styles.roleSkeleton, { backgroundColor: t.colors.bgMuted }]} />
              </View>
            ) : (
              <>
                <AppText
                  style={[t.typography.cardTitle, { color: t.colors.text }]}
                  numberOfLines={1}
                  accessibilityLabel={displayName ? undefined : tr("account.nameLoadFail")}
                >
                  {displayName ?? tr("account.userFallback")}
                </AppText>
                <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
                  {user ? roleLabel(user, tr) : ""}
                </AppText>
              </>
            )}
          </View>
        </View>
      </Card>

      {photoOwner ? (
        <BottomSheet visible={photoSheetOpen} title={tr("account.photoTitle")} onClose={() => setPhotoSheetOpen(false)}>
          <View style={{ gap: 10, paddingBottom: 8 }}>
            {photoError ? <AppText style={[t.typography.caption, { color: t.colors.danger }]}>{photoError}</AppText> : null}
            <Pressable onPress={pickAndUploadPhoto} disabled={photoBusy} style={styles.sheetOptionRow}>
              <View style={styles.optionLeft}>
                <Icon name="image-outline" size={18} color={t.colors.primary} />
                <AppText style={[t.typography.body, { color: t.colors.primary }]}>
                  {photoBusy ? tr("account.photoProcessing") : hasPhoto ? tr("account.photoReplace") : tr("account.photoPick")}
                </AppText>
              </View>
            </Pressable>
            {hasPhoto ? (
              <Pressable onPress={removePhoto} disabled={photoBusy} style={styles.sheetOptionRow}>
                <View style={styles.optionLeft}>
                  <Icon name="trash-outline" size={18} color={t.colors.danger} />
                  <AppText style={[t.typography.body, { color: t.colors.danger }]}>{tr("account.photoRemove")}</AppText>
                </View>
              </Pressable>
            ) : null}
            <Pressable onPress={() => setPhotoSheetOpen(false)} disabled={photoBusy} style={styles.sheetOptionRow}>
              <View style={styles.optionLeft}>
                <AppText style={[t.typography.body, { color: t.colors.textMuted }]}>{tr("common.cancel")}</AppText>
              </View>
            </Pressable>
          </View>
        </BottomSheet>
      ) : null}

      {showChildContext ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            contextProfile.status === "success"
              ? tr("account.trackedA11y", { name: contextProfile.data.name })
              : tr("account.trackedA11yLoading")
          }
          accessibilityHint={selection.isMulti ? tr("account.openStudentPicker") : undefined}
          disabled={!selection.isMulti || !selection.ready}
          onPress={() => router.push("/select-child")}
          style={({ pressed }) => [
            styles.deletionRow,
            { backgroundColor: t.colors.bgRaised, borderColor: t.colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 12, marginBottom: 4, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <View style={styles.optionLeft}>
            <Icon name="people-outline" size={18} color={t.colors.primary} />
            <View style={{ flex: 1 }}>
              <AppText style={[t.typography.label, { color: t.colors.textFaint }]}>{tr("account.trackedStudent")}</AppText>
              <AppText style={[t.typography.bodyStrong, { color: t.colors.text, marginTop: 1 }]} numberOfLines={1}>
                {contextProfile.status === "success" ? contextProfile.data.name : tr("account.trackedLoading")}
              </AppText>
            </View>
          </View>
          {selection.isMulti ? <Icon name="swap-horizontal-outline" size={18} color={t.colors.textFaint} /> : null}
        </Pressable>
      ) : null}

      {links && links.length > 0 ? (
        <>
          <SectionHeader title={tr("account.tools")} />
          <Card>
            {links.map((link, i) => (
              <View key={link.key}>
                {i > 0 ? <View style={[styles.divider, { backgroundColor: t.colors.divider }]} /> : null}
                <Pressable onPress={link.onPress} style={styles.optionRow}>
                  <View style={styles.optionLeft}>
                    <Icon name={link.icon} size={18} color={t.colors.textMuted} />
                    <AppText style={[t.typography.body, { color: t.colors.text }]}>{link.label}</AppText>
                  </View>
                  <Icon name="chevron-forward" size={16} color={t.colors.textFaint} />
                </Pressable>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title={tr("account.appearance")} />
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
                <AppText style={[t.typography.body, { color: t.colors.text }]}>{tr(opt.labelKey)}</AppText>
              </View>
              <Icon
                name={preference === opt.value ? "radio-button-on" : "radio-button-off"}
                size={20}
                color={preference === opt.value ? t.colors.primary : t.colors.textFaint}
              />
            </Pressable>
          </View>
        ))}
        <View style={[styles.divider, { backgroundColor: t.colors.divider }]} />
        <View style={styles.optionRow}>
          <View style={[styles.optionLeft, { flex: 1 }]}>
            <Icon name="text-outline" size={18} color={t.colors.textMuted} />
            <View style={{ flex: 1 }}>
              <AppText style={[t.typography.body, { color: t.colors.text }]}>{tr("account.fontSize")}</AppText>
              <AppText style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 2 }]}>
                {tr("account.fontSizeHint")}
              </AppText>
            </View>
          </View>
        </View>
        <View style={styles.fontSizeRow}>
          {FONT_SIZE_OPTIONS.map((opt) => (
            <FilterChip
              key={opt.value}
              label={tr(opt.labelKey)}
              selected={fontSize === opt.value}
              onPress={() => setFontSize(opt.value)}
            />
          ))}
        </View>
        <View style={[styles.divider, { backgroundColor: t.colors.divider }]} />
        <View style={styles.optionRow}>
          <View style={[styles.optionLeft, { flex: 1 }]}>
            <Icon name="language-outline" size={18} color={t.colors.textMuted} />
            <AppText style={[t.typography.body, { color: t.colors.text }]}>{tr("common.language")}</AppText>
          </View>
        </View>
        <LanguageSelector compact />
      </Card>

      <SectionHeader title={tr("account.privacyData")} />
      <LegalSection />
      <SectionHeader title={tr("account.accountSection")} />
      <Card onPress={() => setConfirmingLogout(true)}>
        <View style={styles.optionRow}>
          <View style={styles.optionLeft}>
            <Icon name="log-out-outline" size={18} color={t.colors.danger} />
            <AppText style={[t.typography.body, { color: t.colors.danger }]}>{tr("auth.logout")}</AppText>
          </View>
        </View>
      </Card>

      <ConfirmDialog
        visible={confirmingLogout}
        title={tr("account.logoutTitle")}
        message={tr("account.logoutMessage")}
        confirmLabel={tr("auth.logout")}
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
  nameSkeleton: { height: 18, width: "60%", borderRadius: 6 },
  roleSkeleton: { height: 13, width: "35%", borderRadius: 6, marginTop: 6 },
  optionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  optionLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  /** Yazı boyutu çipleri — dar ekranda sarmaz, eşit aralıkla yayılır. */
  fontSizeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 10, paddingBottom: 4 },
  /** 48pt dokunma hedefi — bkz. iPhone SE dahil erişilebilirlik gereksinimi. */
  sheetOptionRow: { flexDirection: "row", alignItems: "center", minHeight: 48 },
  deletionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48 },
});
