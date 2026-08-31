import { useContext, type ReactNode } from "react";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useTheme } from "../../theme/theme-context";

type Props = {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  onRefresh?: () => void;
  refreshing?: boolean;
  floatingAction?: ReactNode;
};

/** Her ekranın ortak dış çerçevesi — güvenli alan, tema arka planı, opsiyonel scroll + pull-to-refresh + FAB. */
export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ["top", "left", "right"],
  onRefresh,
  refreshing = false,
  floatingAction,
}: Props) {
  const t = useTheme();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;

  if (!scroll) {
    return (
      <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: t.colors.bg }]}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[styles.flex, padded ? styles.padded : undefined]}>{children}</View>
        </KeyboardAvoidingView>
        {floatingAction}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: t.colors.bg }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(tabBarHeight + 16, 32) },
            padded ? styles.padded : undefined,
          ]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} /> : undefined
          }
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
      {floatingAction}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  padded: { paddingHorizontal: 16 },
});
