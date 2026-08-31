import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, SectionList, StyleSheet, Text, View } from "react-native";
import { apiGet, apiPost } from "../src/api/client";
import { AppHeader, EmptyState, ErrorState, LoadingSkeleton, NotificationCard, Screen } from "../src/components/ui";
import { groupByDay } from "../src/lib/group-by-day";
import { useTheme } from "../src/theme/theme-context";
import type { Notification, NotificationsResponse } from "../src/types/api";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; notifications: Notification[]; nextCursor: string | null };

/** Üç rol için de ortak, kök seviyede modal olarak açılan bildirim merkezi. */
export default function NotificationsScreen() {
  const t = useTheme();
  const [state, setState] = useState<State>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const fetchingRef = useRef(false);

  const loadFirstPage = useCallback(() => {
    setState({ status: "loading" });
    apiGet<NotificationsResponse>("/api/v1/notifications").then((res) => {
      if (res.ok) setState({ status: "success", notifications: res.data.notifications, nextCursor: res.data.nextCursor ?? null });
      else setState({ status: "error", message: res.error.message });
    });
  }, []);

  useEffect(() => loadFirstPage(), [loadFirstPage]);

  async function loadMore() {
    if (state.status !== "success" || !state.nextCursor || fetchingRef.current) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(false);
    const res = await apiGet<NotificationsResponse>(
      `/api/v1/notifications?cursor=${encodeURIComponent(state.nextCursor)}`
    );
    fetchingRef.current = false;
    setLoadingMore(false);
    if (!res.ok) {
      setLoadMoreError(true);
      return;
    }
    setState((prev) => {
      if (prev.status !== "success") return prev;
      const seen = new Set(prev.notifications.map((n) => n.id));
      const merged = [...prev.notifications, ...res.data.notifications.filter((n) => !seen.has(n.id))];
      return { status: "success", notifications: merged, nextCursor: res.data.nextCursor ?? null };
    });
  }

  async function markRead(notification: Notification) {
    if (notification.readAt || readIds.has(notification.id)) return;
    setReadIds((prev) => new Set(prev).add(notification.id));
    await apiPost("/api/v1/notifications", { notificationId: notification.id });
  }

  return (
    <Screen scroll={false} padded={false} edges={["top", "bottom", "left", "right"]}>
      <View style={styles.headerPad}>
        <AppHeader title="Bildirimler" showBack showNotifications={false} />
      </View>

      {state.status === "loading" ? (
        <View style={styles.padded}>
          <LoadingSkeleton rows={6} />
        </View>
      ) : state.status === "error" ? (
        <ErrorState message={state.message} onRetry={loadFirstPage} />
      ) : state.notifications.length === 0 ? (
        <EmptyState icon="notifications-outline" title="Bildirim yok" description="Yeni bildirimler burada görünecek." />
      ) : (
        <SectionList
          contentContainerStyle={styles.padded}
          sections={groupByDay(
            state.notifications.map((n) => (readIds.has(n.id) ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)),
            (n) => n.createdAt
          ).map((g) => ({ title: g.label, data: g.items }))}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => (
            <Text style={[t.typography.label, { color: t.colors.textMuted, backgroundColor: t.colors.bg, paddingVertical: 8 }]}>
              {section.title.toUpperCase()}
            </Text>
          )}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <NotificationCard notification={item} onPress={() => markRead(item)} />
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          onRefresh={loadFirstPage}
          refreshing={false}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footer} color={t.colors.textMuted} />
            ) : loadMoreError ? (
              <Text style={[t.typography.label, styles.footer, { color: t.colors.danger }]} onPress={loadMore}>
                Daha fazla yüklenemedi — tekrar dene
              </Text>
            ) : null
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerPad: { paddingHorizontal: 16 },
  padded: { paddingHorizontal: 16, paddingBottom: 32 },
  row: {},
  footer: { paddingVertical: 16, textAlign: "center" },
});
