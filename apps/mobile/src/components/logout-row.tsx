import { Pressable, StyleSheet, Text } from "react-native";
import { useAuth } from "../auth/auth-context";
import { useTheme } from "../theme/theme-context";
import { fonts } from "../theme/tokens";

export function LogoutRow() {
  const { logout, user } = useAuth();
  const t = useTheme();
  return (
    <Pressable
      onPress={() => void logout()}
      style={[styles.row, { borderColor: t.colors.border, backgroundColor: t.colors.bgMuted }]}
    >
      <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{user?.email ?? "Hesap"}</Text>
      <Text style={{ color: t.colors.danger, fontFamily: fonts.serif, fontSize: 15, marginTop: 2 }}>Çıkış yap</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { margin: 16, padding: 14, borderRadius: 12, borderWidth: 1 },
});
