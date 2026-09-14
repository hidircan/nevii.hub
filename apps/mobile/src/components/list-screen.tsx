import { useContext } from "react";
// SDK 57: expo-router React Navigation'ı kendi içinde taşır; context, Tabs layout'unun sağladığı örnekle aynı olmalı.
import { BottomTabBarHeightContext } from "expo-router/tabs";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/theme-context";
import { LoadingState, ErrorState, EmptyState } from "./screen-states";

type Props<T> = {
  title: string;
  status: "loading" | "error" | "success";
  data?: T[];
  errorMessage?: string;
  onRetry?: () => void;
  emptyLabel: string;
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
};

/** Ortak liste ekranı iskeleti — bildirimler, duyurular, dersler vb. için tekrar kullanılır. */
export function ListScreen<T>({
  title,
  status,
  data,
  errorMessage,
  onRetry,
  emptyLabel,
  keyExtractor,
  renderItem,
}: Props<T>) {
  const t = useTheme();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;

  if (status === "loading") return <LoadingState />;
  if (status === "error") return <ErrorState message={errorMessage ?? "Bilinmeyen hata"} onRetry={onRetry} />;

  const items = data ?? [];

  return (
    <View style={[styles.container, { backgroundColor: t.colors.bg }]}>
      <Text style={[styles.header, { color: t.colors.text }]}>{title}</Text>
      {items.length === 0 ? (
        <EmptyState title={emptyLabel} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => <View style={[styles.row, { borderColor: t.colors.border }]}>{renderItem(item)}</View>}
          refreshControl={onRetry ? <RefreshControl refreshing={false} onRefresh={onRetry} tintColor={t.colors.primary} /> : undefined}
          contentContainerStyle={{ paddingBottom: Math.max(tabBarHeight + 16, 24) }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 12 },
  header: { fontSize: 20, fontWeight: "700", paddingHorizontal: 16, marginBottom: 8 },
  row: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
