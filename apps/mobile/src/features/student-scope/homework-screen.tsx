import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { apiPost } from "../../api/client";
import { personaOf, useAuth } from "../../auth/auth-context";
import { AppHeader, Button, Card, EmptyState, ErrorState, FilterChip, HomeworkCard, LoadingSkeleton, Screen, SectionHeader, TextField } from "../../components/ui";
import { useAppForegroundRefetch } from "../../hooks/use-app-foreground-refetch";
import { CacheStatus } from "../../cache/cache-status";
import { useCachedApiGet } from "../../cache/use-cached-api";
import { useFocusRefetch } from "../../hooks/use-focus-refetch";
import { useNow } from "../../hooks/use-now";
import { useSelectedStudentId } from "../../student/student-context";
import { format, isPast } from "../../lib/date";
import { useLocale } from "../../i18n/locale-context";
import { useTheme } from "../../theme/theme-context";
import { listFallback, usePersonaBasePath } from "../../lib/navigation";
import type { HomeworkResponse } from "../../types/api";

type Filter = "pending" | "reviewed" | "past";

export function StudentScopeHomeworkListScreen({ basePath }: { basePath: "/(parent)" | "/(student)" }) {
  const router = useRouter();
  const { t: tr } = useLocale();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>("pending");
  const studentId = useSelectedStudentId();
  const res = useCachedApiGet<HomeworkResponse>(studentId ? `/api/v1/students/${studentId}/homework` : "");
  useFocusRefetch(res.refresh);
  useAppForegroundRefetch(res.refresh);

  const filtered = useMemo(() => {
    if (res.status !== "success") return [];
    return res.data.homework.filter((h) => {
      const overdue = h.dueDate ? isPast(h.dueDate, now) : false;
      if (filter === "reviewed") return h.status === "REVIEWED";
      if (filter === "past") return overdue && h.status !== "PENDING";
      return h.status === "PENDING" || !overdue;
    });
  }, [res, filter, now]);

  return (
    <Screen onRefresh={res.refresh} refreshing={res.status === "loading"}>
      <AppHeader title={tr("hwList.title")} showAccount={`${basePath}/hesabim`} />
      <CacheStatus cachedAt={res.cachedAt} isStale={res.isStale} />

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <FilterChip label={tr("hwList.fPending")} selected={filter === "pending"} onPress={() => setFilter("pending")} />
        <FilterChip label={tr("hwList.fReviewed")} selected={filter === "reviewed"} onPress={() => setFilter("reviewed")} />
        <FilterChip label={tr("hwList.fPast")} selected={filter === "past"} onPress={() => setFilter("past")} />
      </View>

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="book-outline" title={tr("hwList.emptyFilter")} />
      ) : (
        <View style={{ gap: 10 }}>
          {filtered.map((h) => (
            <HomeworkCard key={h.id} homework={h} showStudentName={false} onPress={() => router.push(`${basePath}/odevler/${h.id}`)} />
          ))}
        </View>
      )}
    </Screen>
  );
}

export function StudentScopeHomeworkDetailScreen({ homeworkId }: { homeworkId: string }) {
  const t = useTheme();
  const { t: tr } = useLocale();
  const base = usePersonaBasePath();
  const { user } = useAuth();
  const studentId = useSelectedStudentId();
  const res = useCachedApiGet<HomeworkResponse>(studentId ? `/api/v1/students/${studentId}/homework` : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (res.status === "loading") {
    return (
      <Screen>
        <AppHeader title={tr("hwList.single")} showBack backFallback={listFallback(base, "odevler")} showNotifications={false} />
        <LoadingSkeleton rows={3} />
      </Screen>
    );
  }
  if (res.status === "error") {
    return (
      <Screen>
        <AppHeader title={tr("hwList.single")} showBack backFallback={listFallback(base, "odevler")} showNotifications={false} />
        <ErrorState message={res.message} onRetry={res.refresh} />
      </Screen>
    );
  }

  const homework = res.data.homework.find((h) => h.id === homeworkId);
  if (!homework) {
    return (
      <Screen>
        <AppHeader title={tr("hwList.single")} showBack backFallback={listFallback(base, "odevler")} showNotifications={false} />
        <EmptyState icon="alert-circle-outline" title={tr("hwList.missing")} />
      </Screen>
    );
  }

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const submitRes = await apiPost("/api/v1/homework/" + homeworkId + "/submit", { homeworkId, note: note.trim() || undefined });
    setBusy(false);
    if (!submitRes.ok) {
      setError(submitRes.error.message || tr("hwList.submitFailed"));
      return;
    }
    setSubmitted(true);
    res.refresh();
  }

  // Teslim YALNIZ öğrencinin kendi hesabından (SELF); veli (GUARDIAN) de STUDENT rolüyle girer.
  const isGuardian = personaOf(user) === "parent";
  const canStudentSubmit = personaOf(user) === "student" && homework.status !== "REVIEWED";

  return (
    <Screen>
      <AppHeader title={tr("hwList.single")} showBack backFallback={listFallback(base, "odevler")} showNotifications={false} />
      <HomeworkCard homework={homework} showStudentName={false} />

      <Card style={{ marginTop: 12 }}>
        <Text style={[t.typography.bodyStrong, { color: t.colors.text, marginBottom: 6 }]}>{tr("hwList.description")}</Text>
        <Text style={[t.typography.body, { color: t.colors.textMuted }]}>{homework.description}</Text>
        {homework.dueDate ? (
          <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 10 }]}>
            {tr("hwList.dueDate", { v: format(new Date(homework.dueDate), "yyyy-MM-dd") })}
          </Text>
        ) : null}
      </Card>

      <SectionHeader title={tr("hwList.submitSection")} />
      {!canStudentSubmit ? (
        <Card>
          <Text style={[t.typography.body, { color: t.colors.textMuted }]}>
            {isGuardian ? tr("hwList.guardianBlock") : tr("hwList.submittedClosed")}
          </Text>
        </Card>
      ) : submitted ? (
        <Card>
          <Text style={[t.typography.body, { color: t.colors.success }]}>{tr("hwList.submittedOk")}</Text>
        </Card>
      ) : (
        <View style={{ gap: 12 }}>
          <TextField label={tr("hwList.noteLabel")} value={note} onChangeText={setNote} placeholder={tr("hwList.notePlaceholder")} multiline numberOfLines={3} />
          {error ? <Text style={[t.typography.caption, { color: t.colors.danger }]}>{error}</Text> : null}
          <Button label={tr("hwList.submitButton")} onPress={onSubmit} loading={busy} />
        </View>
      )}
    </Screen>
  );
}
