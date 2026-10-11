import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import {
  AppHeader,
  Card,
  EmptyState,
  ErrorState,
  FilterChip,
  LoadingSkeleton,
  Screen,
  StatusBadge,
} from "../../components/ui";
import { useAppForegroundRefetch } from "../../hooks/use-app-foreground-refetch";
import { CacheStatus } from "../../cache/cache-status";
import { useCachedApiGet } from "../../cache/use-cached-api";
import { useFocusRefetch } from "../../hooks/use-focus-refetch";
import { ledgerStatusBadge, ledgerStatusLabel } from "../../lib/attendance-display";
import { format, shortDayMonth } from "../../lib/date";
import { useLocale } from "../../i18n/locale-context";
import { useSelectedStudentId } from "../../student/student-context";
import { useTheme } from "../../theme/theme-context";
import type { AttendanceLedgerItem, AttendanceLedgerResponse, LedgerDisplayKey } from "../../types/api";

export type ReportDirection = "past" | "upcoming";

const PAGE_STEP = 100;

const CHIP_KEYS: LedgerDisplayKey[] = [
  "attended",
  "processed",
  "makeup",
  "absent",
  "excused",
  "cancelled",
  "pending",
  "upcoming",
  "in_progress",
];

function ledgerUrl(studentId: string, direction: ReportDirection, status: LedgerDisplayKey[] | null, limit: number): string {
  const params = new URLSearchParams({
    direction,
    sort: direction === "upcoming" ? "asc" : "desc",
    limit: String(limit),
  });
  if (status?.length) params.set("status", status.join(","));
  return `/api/v1/students/${studentId}/attendance-ledger?${params.toString()}`;
}

/**
 * Detaylı yoklama raporu — kayıt başından bugüne geçmiş + planlanan dersler
 * (ayrı sekmeler). Satırlar sanallaştırılmış listedir; filtreler sunucuda
 * uygulanır (tek istek, N+1 yok). Çocuk değişince URL değişir → liste
 * skeleton'a döner, eski öğrencinin satırı ASLA görünmez.
 */
export function AttendanceReportScreen({
  basePath,
  initialStatus,
}: {
  basePath: "/(parent)" | "/(student)";
  initialStatus?: LedgerDisplayKey[] | null;
}) {
  const t = useTheme();
  const { t: tr } = useLocale();
  const studentId = useSelectedStudentId();
  const [direction, setDirection] = useState<ReportDirection>("past");
  const [status, setStatus] = useState<LedgerDisplayKey[] | null>(initialStatus ?? null);
  const [limit, setLimit] = useState(PAGE_STEP);

  const res = useCachedApiGet<AttendanceLedgerResponse>(
    studentId ? ledgerUrl(studentId, direction, status, limit) : ""
  );
  useFocusRefetch(res.autoRefresh);
  useAppForegroundRefetch(res.autoRefresh);

  const counts = res.status === "success" ? res.data.counts : null;
  const total = res.status === "success" ? res.data.total : 0;
  const items = res.status === "success" ? res.data.items : [];
  const canGrow = res.status === "success" && items.length < total;

  const chips = useMemo(
    () =>
      CHIP_KEYS.filter((k) => (direction === "past" ? k !== "upcoming" : k === "upcoming" || k === "cancelled")).map(
        (k) => ({ key: k, label: ledgerStatusLabel(k), count: counts?.[k] ?? 0 })
      ),
    [direction, counts]
  );

  function pickDirection(next: ReportDirection) {
    if (next === direction) return;
    setDirection(next);
    setStatus(null);
    setLimit(PAGE_STEP);
  }

  function toggleStatus(key: LedgerDisplayKey) {
    setStatus((prev) => {
      const next = prev?.includes(key) ? prev.filter((k) => k !== key) : [key];
      return next.length ? next : null;
    });
    setLimit(PAGE_STEP);
  }

  if (!studentId) {
    return (
      <Screen>
        <AppHeader title={tr("att.reportTitle")} showBack showNotifications={false} />
        <EmptyState icon="alert-circle-outline" title={tr("home.noStudentTitle")} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <AppHeader title={tr("att.reportTitle")} showBack showNotifications={false} />
      <CacheStatus cachedAt={res.cachedAt} isStale={res.isStale} />

      <View style={styles.segment} accessibilityRole="tablist">
        {(["past", "upcoming"] as const).map((d) => {
          const active = direction === d;
          return (
            <Pressable
              key={d}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => pickDirection(d)}
              style={[styles.segmentBtn, { backgroundColor: active ? t.colors.primary : "transparent" }]}
            >
              <Text style={[t.typography.bodyStrong, { color: active ? t.colors.primaryOn : t.colors.textMuted }]}>
                {d === "past" ? tr("att.past") : tr("att.upcoming")}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} code={res.code} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.lessonId}
          renderItem={({ item }) => <LedgerRow item={item} basePath={basePath} />}
          ItemSeparatorComponent={Separator}
          ListHeaderComponent={
            <View style={styles.chips}>
              <FilterChip label={tr("att.all")} selected={status === null} onPress={() => { setStatus(null); setLimit(PAGE_STEP); }} />
              {chips.map((c) =>
                c.count > 0 || status?.includes(c.key) ? (
                  <FilterChip
                    key={c.key}
                    label={`${c.label} · ${c.count}`}
                    selected={!!status?.includes(c.key)}
                    onPress={() => toggleStatus(c.key)}
                  />
                ) : null
              )}
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="calendar-outline"
              title={direction === "past" ? tr("att.noPastTitle") : tr("att.noUpcomingTitle")}
              description={
                status
                  ? tr("att.noFilterMatch")
                  : direction === "past"
                    ? tr("att.pastHint")
                    : undefined
              }
            />
          }
          ListFooterComponent={
            canGrow ? (
              <Card onPress={() => setLimit((n) => n + PAGE_STEP)} style={styles.more}>
                <Text style={[t.typography.bodyStrong, { color: t.colors.primary, textAlign: "center" }]}>
                  {tr("att.showMore", { a: items.length, t: total })}
                </Text>
              </Card>
            ) : items.length > 0 ? (
              <Text style={[t.typography.caption, { color: t.colors.textFaint, textAlign: "center", marginVertical: 12 }]}>
                {tr("att.records", { n: total })}
              </Text>
            ) : null
          }
          refreshControl={<RefreshControl refreshing={false} onRefresh={res.refresh} tintColor={t.colors.primary} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

function Separator() {
  return <View style={{ height: 8 }} />;
}

function LedgerRow({ item, basePath }: { item: AttendanceLedgerItem; basePath: "/(parent)" | "/(student)" }) {
  const t = useTheme();
  const { t: tr } = useLocale();
  const router = useRouter();
  const badge = ledgerStatusBadge(item.displayKey);
  const start = new Date(item.startAt);
  const end = new Date(item.endAt);

  return (
    <Card onPress={() => router.push(`${basePath}/dersler/${item.lessonId}`)}>
      <View style={styles.row}>
        <View style={[styles.dateBlock, { backgroundColor: t.colors.bgMuted }]}>
          <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{start.getDate()}</Text>
          <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{shortDayMonth(start).split(" ")[1] ?? ""}</Text>
        </View>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={[t.typography.bodyStrong, { color: t.colors.text, flex: 1 }]} numberOfLines={1}>
              {item.teacherName ?? tr("home.teacherFallback")}
              {item.instrument ? ` · ${item.instrument}` : ""}
            </Text>
            <StatusBadge label={badge.label} tone={badge.tone} />
          </View>
          <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
            {format(start, "HH:mm")}–{format(end, "HH:mm")}
            {item.durationMinutes ? ` · ${tr("att.minutesShort", { n: item.durationMinutes })}` : ""}
            {item.branchName ? ` · ${item.branchName}` : ""}
            {item.roomName ? ` · ${item.roomName}` : ""}
          </Text>
          {item.statusChangedAt ? (
            <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 2 }]} numberOfLines={1}>
              {shortDayMonth(new Date(item.statusChangedAt))} {format(new Date(item.statusChangedAt), "HH:mm")} {tr("att.updatedAt")}
            </Text>
          ) : null}
          {item.makeup ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr("att.openMakeup")}
              hitSlop={6}
              onPress={() => router.push(`${basePath}/telafiler/${item.makeup!.requestId}`)}
              style={{ marginTop: 2, alignSelf: "flex-start" }}
            >
              <Text style={[t.typography.caption, { color: t.colors.primary }]} numberOfLines={1}>
                {item.makeup.role === "source" ? tr("att.makeupFrom") : tr("att.makeupLesson")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: "row", gap: 8, marginBottom: 12 },
  segmentBtn: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  list: { paddingBottom: 32, flexGrow: 1 },
  more: { marginTop: 8 },
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  dateBlock: { width: 52, borderRadius: 10, alignItems: "center", paddingVertical: 8 },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});
