import { useRouter } from "expo-router";
import { FlatList, RefreshControl, Text, View } from "react-native";
import {
  AppHeader,
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Screen,
  SectionHeader,
  StatusBadge,
} from "../../components/ui";
import { useAppForegroundRefetch } from "../../hooks/use-app-foreground-refetch";
import { CacheStatus } from "../../cache/cache-status";
import { useCachedApiGet } from "../../cache/use-cached-api";
import { useFocusRefetch } from "../../hooks/use-focus-refetch";
import { ledgerStatusBadge } from "../../lib/attendance-display";
import { format, shortDayMonth } from "../../lib/date";
import { makeupStatusBadge } from "../../lib/makeup-view";
import { useLocale } from "../../i18n/locale-context";
import { useSelectedStudentId } from "../../student/student-context";
import { useTheme } from "../../theme/theme-context";
import type { MakeupLedgerItem, MakeupLedgerResponse, MakeupLedgerLessonRef } from "../../types/api";
import { isOpenMakeup, makeupLedgerA11yLabel, toMakeupLedgerItems } from "./makeup-view";

const when = (iso: string) => `${shortDayMonth(new Date(iso))} · ${format(new Date(iso), "HH:mm")}`;
const span = (startIso: string, endIso: string) => `${format(new Date(startIso), "HH:mm")}–${format(new Date(endIso), "HH:mm")}`;

/**
 * Öğrenci/veli "Telafiler" listesi — salt-okunur, seçili öğrenci kapsamlı.
 * Veri `makeup-ledger`'dan; kapsam sunucuda (`assertStudentAccess`), guardian
 * yalnız seçili çocuğun kayıtlarını görür. Satırlar detaya açılır.
 */
export function StudentScopeMakeupListScreen({ basePath }: { basePath: "/(parent)" | "/(student)" }) {
  const t = useTheme();
  const { t: tr } = useLocale();
  const router = useRouter();
  const studentId = useSelectedStudentId();
  const res = useCachedApiGet<MakeupLedgerResponse>(studentId ? `/api/v1/students/${studentId}/makeup-ledger?limit=100` : "");
  useFocusRefetch(res.refresh);
  useAppForegroundRefetch(res.refresh);

  if (!studentId) {
    return (
      <Screen>
        <AppHeader title={tr("makeup.listTitle")} showBack backFallback={`${basePath}/anasayfa`} showNotifications={false} />
        <EmptyState icon="alert-circle-outline" title={tr("home.noStudentTitle")} />
      </Screen>
    );
  }

  const items = res.status === "success" ? toMakeupLedgerItems(res.data.items) : [];

  return (
    <Screen scroll={false}>
      <AppHeader title={tr("makeup.listTitle")} showBack backFallback={`${basePath}/anasayfa`} showNotifications={false} />
      <CacheStatus cachedAt={res.cachedAt} isStale={res.isStale} />
      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} code={res.code} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <MakeupRow item={item} onPress={() => router.push(`${basePath}/telafiler/${item.id}`)} />
          )}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={
            <EmptyState
              icon="swap-horizontal-outline"
              title={tr("makeup.emptyTitle")}
              description={tr("makeup.emptyBody")}
            />
          }
          refreshControl={<RefreshControl refreshing={false} onRefresh={res.refresh} tintColor={t.colors.primary} />}
          contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

function Separator() {
  return <View style={{ height: 10 }} />;
}

function MakeupRow({ item, onPress }: { item: MakeupLedgerItem; onPress: () => void }) {
  const t = useTheme();
  const { t: tr } = useLocale();
  const badge = makeupStatusBadge(item.status);
  return (
    <View accessible accessibilityLabel={makeupLedgerA11yLabel(item, badge.label)}>
      <Card onPress={onPress}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[t.typography.bodyStrong, { color: t.colors.text }]} numberOfLines={1}>
              {[item.teacherName, item.instrument].filter(Boolean).join(" · ") || tr("makeup.fallbackRow")}
            </Text>
            {item.sourceLesson ? (
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
                {tr("makeup.missedLesson", { v: when(item.sourceLesson.startAt) })}
              </Text>
            ) : null}
            {item.confirmedLesson ? (
              <Text style={[t.typography.caption, { color: t.colors.text, marginTop: 2 }]} numberOfLines={1}>
                {tr("makeup.confirmedLesson", { v: when(item.confirmedLesson.startAt) })}
              </Text>
            ) : isOpenMakeup(item.status) ? (
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                {tr("makeup.notPlanned")}
              </Text>
            ) : null}
          </View>
          <StatusBadge label={badge.label} tone={badge.tone} />
        </View>
      </Card>
    </View>
  );
}

/**
 * Telafi detayı — kayıt YALNIZ seçili öğrencinin ledger'ında aranır; başka
 * çocuğun ID'siyle gelindiyse "bulunamadı" (URL tahminiyle veri sızmaz).
 * Gerekçe/not yalnız sunucu gönderdiyse gösterilir (uydurma yok).
 */
export function StudentScopeMakeupDetailScreen({
  basePath,
  makeupId,
}: {
  basePath: "/(parent)" | "/(student)";
  makeupId: string;
}) {
  const t = useTheme();
  const { t: tr } = useLocale();
  const router = useRouter();
  const studentId = useSelectedStudentId();
  const res = useCachedApiGet<MakeupLedgerResponse>(studentId ? `/api/v1/students/${studentId}/makeup-ledger?limit=200` : "");
  useFocusRefetch(res.refresh);
  useAppForegroundRefetch(res.refresh);

  if (res.status === "loading") {
    return (
      <Screen>
        <AppHeader title={tr("makeup.singleTitle")} showBack backFallback={`${basePath}/telafiler`} showNotifications={false} />
        <LoadingSkeleton rows={4} />
      </Screen>
    );
  }
  if (res.status === "error") {
    return (
      <Screen>
        <AppHeader title={tr("makeup.singleTitle")} showBack backFallback={`${basePath}/telafiler`} showNotifications={false} />
        <ErrorState message={res.message} onRetry={res.refresh} code={res.code} />
      </Screen>
    );
  }

  const item = res.data.items.find((m) => m.id === makeupId);
  if (!item) {
    return (
      <Screen>
        <AppHeader title={tr("makeup.singleTitle")} showBack backFallback={`${basePath}/telafiler`} showNotifications={false} />
        <EmptyState
          icon="alert-circle-outline"
          title={tr("makeup.notFound")}
          description={tr("makeup.notFoundBody")}
        />
      </Screen>
    );
  }

  const badge = makeupStatusBadge(item.status);

  return (
    <Screen onRefresh={res.refresh} refreshing={false}>
      <AppHeader title={tr("makeup.detailTitle")} showBack backFallback={`${basePath}/telafiler`} showNotifications={false} />

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={[t.typography.cardTitle, { color: t.colors.text }]} numberOfLines={2}>
              {[item.teacherName, item.instrument].filter(Boolean).join(" · ") || tr("makeup.fallbackRow")}
            </Text>
            {item.branchName ? (
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{item.branchName}</Text>
            ) : null}
          </View>
          <StatusBadge label={badge.label} tone={badge.tone} />
        </View>
        {item.decidedAt ? (
          <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 8 }]}>
            {tr("makeup.decided", { v: when(item.decidedAt) })}
          </Text>
        ) : null}
        <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 2 }]}>
          {tr("makeup.validUntil", { v: shortDayMonth(new Date(item.expiresAt)) })}
        </Text>
      </Card>

      <SectionHeader title={tr("makeup.missedSection")} />
      <LessonRefCard
        lesson={item.sourceLesson}
        emptyText={tr("makeup.noSource")}
        onOpen={(id) => router.push(`${basePath}/dersler/${id}`)}
      />

      {item.reason.trim() ? (
        <>
          <SectionHeader title={tr("makeup.reasonSection")} />
          <Card>
            <Text style={[t.typography.body, { color: t.colors.text }]}>{item.reason}</Text>
          </Card>
        </>
      ) : null}

      <SectionHeader title={tr("makeup.lessonSection")} />
      {item.confirmedLesson ? (
        <LessonRefCard
          lesson={item.confirmedLesson}
          onOpen={(id) => router.push(`${basePath}/dersler/${id}`)}
        />
      ) : (
        <Card>
          <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>
            {isOpenMakeup(item.status) ? tr("makeup.willAppear") : tr("makeup.noPlannedLesson")}
          </Text>
        </Card>
      )}

      {item.policyNote.trim() ? (
        <Card style={{ marginTop: 12 }}>
          <Text style={[t.typography.caption, { color: t.colors.textFaint }]}>{item.policyNote}</Text>
        </Card>
      ) : null}
      <View style={{ height: 24 }} />
    </Screen>
  );
}

function LessonRefCard({
  lesson,
  emptyText,
  onOpen,
}: {
  lesson: MakeupLedgerLessonRef;
  emptyText?: string;
  onOpen: (lessonId: string) => void;
}) {
  const t = useTheme();
  const { t: tr } = useLocale();
  if (!lesson) {
    return (
      <Card>
        <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{emptyText ?? tr("makeup.noLesson")}</Text>
      </Card>
    );
  }
  const badge = ledgerStatusBadge(lesson.displayKey);
  return (
    <Card onPress={() => onOpen(lesson.id)}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>
            {shortDayMonth(new Date(lesson.startAt))} · {span(lesson.startAt, lesson.endAt)}
          </Text>
          <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]} numberOfLines={2}>
            {[lesson.teacherName, lesson.instrument].filter(Boolean).join(" · ")}
            {lesson.branchName ? ` · ${lesson.branchName}` : ""}
            {lesson.roomName ? ` · ${lesson.roomName}` : ""}
          </Text>
        </View>
        <StatusBadge label={badge.label} tone={badge.tone} />
      </View>
    </Card>
  );
}
