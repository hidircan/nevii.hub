import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { portalErrorMessage } from "../../components/mobile-ui/api-error-message";
import { useSelectedStudentId } from "../../student/student-context";
import {
  AppHeader,
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  LoadingSkeleton,
  Screen,
  SectionHeader,
} from "../../components/ui";
import { useAppForegroundRefetch } from "../../hooks/use-app-foreground-refetch";
import { useApiGet } from "../../hooks/use-api";
import { useFocusRefetch } from "../../hooks/use-focus-refetch";
import { useLocale } from "../../i18n/locale-context";
import { useTheme } from "../../theme/theme-context";
import type { StudentProfile } from "../../types/api";
import { PARENT_QUICK_LINKS, toChildContextView } from "./child-context";

/**
 * Veli "Çocuğum" ekranı — salt-okunur bağlam + hızlı erişim.
 *
 * Gösterilen öğrenci her zaman seçili bağlamdır (`useSelectedStudentId` —
 * sunucu oturumundan türetilir, istemcide ID tahmin edilmez, URL'de
 * uydurulmaz). Çoklu çocukta seçim `/select-child` üzerinden yapılır;
 * her profil isteği sunucuda `assertStudentAccess` ile doğrulanır.
 *
 * Gizlilik: telefon numaraları (öğrenci/veli) bu ekranda gösterilmez.
 */
export function ParentChildScreen({ basePath }: { basePath: "/(parent)" }) {
  const { t: tr } = useLocale();
  const studentId = useSelectedStudentId();

  const res = useApiGet<StudentProfile>(studentId ? `/api/v1/students/${studentId}` : "");
  useFocusRefetch(res.autoRefresh);
  useAppForegroundRefetch(res.autoRefresh);

  if (!studentId) {
    return (
      <Screen>
        <AppHeader title={tr("parent.myChild")} />
        <EmptyState
          icon="alert-circle-outline"
          title={tr("home.noStudentTitle")}
          description={tr("parent.noViewableChild")}
        />
      </Screen>
    );
  }

  return (
    <Screen onRefresh={res.refresh} refreshing={res.status === "loading"}>
      <AppHeader title={tr("parent.myChild")} subtitle={tr("parent.activeContext")} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={3} />
      ) : res.status === "error" ? (
        <ErrorState message={portalErrorMessage(res.code, res.message)} onRetry={res.refresh} code={res.code} />
      ) : (
        <ChildContextBody profile={res.data} basePath={basePath} onRefresh={res.refresh} />
      )}
    </Screen>
  );
}

/**
 * Profil ad içermiyorsa yanlış isim gösterilmez — empty state'e düşer.
 * Hızlı erişimler `PARENT_QUICK_LINKS` canonical listesinden gelir.
 */
function ChildContextBody({
  profile,
  basePath,
  onRefresh,
}: {
  profile: StudentProfile;
  basePath: "/(parent)";
  onRefresh: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useLocale();
  const router = useRouter();
  const view = toChildContextView(profile);

  if (!view) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title={tr("parent.loadFailed")}
        description={tr("parent.loadFailedBody")}
      />
    );
  }

  return (
    <>
      <Card>
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={tr("parent.activeStudentA11y", { name: view.name, line: view.line1 ? `. ${view.line1}` : "" })}
          style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
        >
          <Avatar name={view.name} size={52} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[t.typography.cardTitle, { color: t.colors.text }]} numberOfLines={1}>
              {view.name}
            </Text>
            {view.line1 ? (
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
                {view.line1}
              </Text>
            ) : null}
            {view.line2 ? (
              <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 2 }]} numberOfLines={1}>
                {view.line2}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>

      <SectionHeader title={tr("parent.quickAccess")} />
      <ListGroup>
        {PARENT_QUICK_LINKS.map((link) => (
          <ListRow
            key={link.key}
            icon={link.icon}
            title={tr(link.labelKey)}
            subtitle={tr(link.hintKey)}
            onPress={() => router.push(`${basePath}/${link.href}`)}
          />
        ))}
      </ListGroup>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr("parent.refreshInfo")}
        onPress={onRefresh}
        hitSlop={8}
        style={{ marginTop: 16, alignItems: "center", justifyContent: "center", paddingVertical: 12, minHeight: 48 }}
      >
        <Text style={[t.typography.caption, { color: t.colors.primary, fontFamily: t.fonts.serifBold, fontWeight: "700" }]}>{tr("parent.refreshInfo")}</Text>
      </Pressable>
    </>
  );
}
