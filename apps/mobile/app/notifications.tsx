import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, SectionList, StyleSheet, Text, View } from "react-native";
import { apiGet, apiPost } from "../src/api/client";
import { useAuth, personaOf } from "../src/auth/auth-context";
import { CacheStatus } from "../src/cache/cache-status";
import { getProductionBackend, readCacheEntry, writeCacheEntry } from "../src/cache/cache-store";
import { subscribeToScopes } from "../src/cache/refresh-bus";
import { AppHeader, EmptyState, ErrorState, LoadingSkeleton, NotificationCard, Screen } from "../src/components/ui";
import { groupByDay } from "../src/lib/group-by-day";
import { useTheme } from "../src/theme/theme-context";
import type { Notification, NotificationsResponse } from "../src/types/api";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; notifications: Notification[]; nextCursor: string | null };

const FIRST_PAGE_PATH = "/api/v1/notifications";

/** Üç rol için de ortak, kök seviyede modal olarak açılan bildirim merkezi. */
export default function NotificationsScreen() {
  const t = useTheme();
  const { user } = useAuth();
  const [state, setState] = useState<State>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [cacheInfo, setCacheInfo] = useState<{ cachedAt: string; isStale: boolean } | null>(null);
  const fetchingRef = useRef(false);
  const persona = user ? personaOf(user) : null;

  // Mount effect'i, senkron setState yapan loadFirstPage'i DEĞİL, yalnız
  // asenkron işi içeren fetchFirstPage'i çağırıyor (react-hooks/set-state-in-effect
  // effect gövdesinden [transitif olarak da] senkron setState'i yasaklıyor).
  // loadFirstPage hâlâ var ve `setState({status:"loading"})` içeriyor —
  // ama yalnız onRetry/onRefresh'ten (event handler, effect değil)
  // çağrıldığı için kural onu sorun etmiyor.
  // Faz 7: ilk sayfa cache'lenir (stale-while-revalidate); sonraki sayfalar
  // her zaman ağdan. Okundu-işaretleme yazmadır — cache'e DEĞİL ağa gider.
  const fetchFirstPage = useCallback(() => {
    const input =
      user && persona
        ? { tenantId: user.tenantId, userId: user.userId, persona, studentId: null, path: FIRST_PAGE_PATH }
        : null;
    if (input) {
      void readCacheEntry<NotificationsResponse>(getProductionBackend(), input).then(({ entry, fresh }) => {
        if (!entry) return;
        setCacheInfo({ cachedAt: entry.savedAt, isStale: !fresh });
        setState({ status: "success", notifications: entry.data.notifications, nextCursor: entry.data.nextCursor ?? null });
      });
    }
    apiGet<NotificationsResponse>(FIRST_PAGE_PATH).then((res) => {
      if (res.ok) {
        setCacheInfo(null);
        setState({ status: "success", notifications: res.data.notifications, nextCursor: res.data.nextCursor ?? null });
        if (input) void writeCacheEntry(getProductionBackend(), input, res.data);
      } else {
        // Cache gösteriliyorsa hata ekranı YOK — stale liste + rozet kalır.
        setState((prev) => (prev.status === "success" ? prev : { status: "error", message: res.error.message }));
      }
    });
  }, [user, persona]);

  const loadFirstPage = useCallback(() => {
    setState({ status: "loading" });
    fetchFirstPage();
  }, [fetchFirstPage]);

  useEffect(() => fetchFirstPage(), [fetchFirstPage]);

  // Faz 8: foreground push'ta liste başa tazelenir (sayfalama kaydırdıkça yeniden yüklenir).
  const fetchRef = useRef(fetchFirstPage);
  useEffect(() => {
    fetchRef.current = fetchFirstPage;
  });
  useEffect(() => subscribeToScopes(["notifications"], () => fetchRef.current()), []);

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
        {cacheInfo ? <CacheStatus cachedAt={cacheInfo.cachedAt} isStale={cacheInfo.isStale} /> : null}
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
