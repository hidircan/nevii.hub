import { Pressable, StyleSheet, Text } from "react-native";
import { useAuth } from "../auth/auth-context";
import { useTheme } from "../theme/theme-context";

export function LogoutRow() {
  const { logout, user } = useAuth();
  const t = useTheme();
  return (
    <Pressable
      onPress={() => void logout()}
      style={[styles.row, { borderColor: t.colors.border, backgroundColor: t.colors.bgMuted }]}
    >
      <Text style={{ color: t.colors.text, fontWeight: "600" }}>{user?.email ?? "Hesap"}</Text>
      <Text style={{ color: t.colors.danger, fontSize: 13, marginTop: 2 }}>Çıkış yap</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { margin: 16, padding: 14, borderRadius: 12, borderWidth: 1 },
});
