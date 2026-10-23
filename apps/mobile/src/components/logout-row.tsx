import { AppText } from "./ui/app-text";
import { Pressable, StyleSheet } from "react-native";
import { useAuth } from "../auth/auth-context";
import { useLocale } from "../i18n/locale-context";
import { useTheme } from "../theme/theme-context";
import { fonts } from "../theme/tokens";

export function LogoutRow() {
  const { logout, user } = useAuth();
  const t = useTheme();
  const { t: tr } = useLocale();
  return (
    <Pressable
      onPress={() => void logout()}
      style={[styles.row, { borderColor: t.colors.border, backgroundColor: t.colors.bgMuted }]}
    >
      <AppText style={[t.typography.bodyStrong, { color: t.colors.text }]}>{user?.email ?? tr("account.accountSection")}</AppText>
      <AppText style={{ color: t.colors.danger, fontFamily: fonts.regular, fontSize: 15, marginTop: 2 }}>{tr("ui.logout")}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { margin: 16, padding: 14, borderRadius: 12, borderWidth: 1 },
});
