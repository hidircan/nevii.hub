import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { apiPost } from "../../api/client";
import { useAuth } from "../../auth/auth-context";
import { AppHeader, Button, Card, EmptyState, ErrorState, FilterChip, HomeworkCard, LoadingSkeleton, Screen, SectionHeader, TextField } from "../../components/ui";
import { useApiGet } from "../../hooks/use-api";
import { useFocusRefetch } from "../../hooks/use-focus-refetch";
import { format } from "../../lib/date";
import { useTheme } from "../../theme/theme-context";
import type { HomeworkResponse } from "../../types/api";

type Filter = "pending" | "reviewed" | "past";

export function StudentScopeHomeworkListScreen({ basePath }: { basePath: "/(parent)" | "/(student)" }) {
  const { user } = useAuth();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("pending");
  const res = useApiGet<HomeworkResponse>(user?.studentId ? `/api/v1/students/${user.studentId}/homework` : "");
  useFocusRefetch(res.refresh);

  const filtered = useMemo(() => {
    if (res.status !== "success") return [];
    const now = Date.now();
    return res.data.homework.filter((h) => {
      const overdue = h.dueDate ? new Date(h.dueDate).getTime() < now : false;
      if (filter === "reviewed") return h.status === "REVIEWED";
      if (filter === "past") return overdue && h.status !== "PENDING";
      return h.status === "PENDING" || !overdue;
    });
  }, [res, filter]);

  return (
    <Screen onRefresh={res.refresh} refreshing={res.status === "loading"}>
      <AppHeader title="Ödevler" />

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <FilterChip label="Bekleyen" selected={filter === "pending"} onPress={() => setFilter("pending")} />
        <FilterChip label="Tamamlanan" selected={filter === "reviewed"} onPress={() => setFilter("reviewed")} />
        <FilterChip label="Geçmiş" selected={filter === "past"} onPress={() => setFilter("past")} />
      </View>

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="book-outline" title="Bu filtrede ödev yok" />
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
  const { user } = useAuth();
  const res = useApiGet<HomeworkResponse>(user?.studentId ? `/api/v1/students/${user.studentId}/homework` : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (res.status === "loading") {
    return (
      <Screen>
        <AppHeader title="Ödev" showBack showNotifications={false} />
        <LoadingSkeleton rows={3} />
      </Screen>
    );
  }
  if (res.status === "error") {
    return (
      <Screen>
        <AppHeader title="Ödev" showBack showNotifications={false} />
        <ErrorState message={res.message} onRetry={res.refresh} />
      </Screen>
    );
  }

  const homework = res.data.homework.find((h) => h.id === homeworkId);
  if (!homework) {
    return (
      <Screen>
        <AppHeader title="Ödev" showBack showNotifications={false} />
        <EmptyState icon="alert-circle-outline" title="Ödev bulunamadı" />
      </Screen>
    );
  }

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const submitRes = await apiPost("/api/v1/homework/" + homeworkId + "/submit", { homeworkId, note: note.trim() || undefined });
    setBusy(false);
    if (!submitRes.ok) {
      setError(submitRes.error.message || "Teslim gönderilemedi.");
      return;
    }
    setSubmitted(true);
    res.refresh();
  }

  const canStudentSubmit = user?.role === "STUDENT" && homework.status !== "REVIEWED";

  return (
    <Screen>
      <AppHeader title="Ödev" showBack showNotifications={false} />
      <HomeworkCard homework={homework} showStudentName={false} />

      <Card style={{ marginTop: 12 }}>
        <Text style={[t.typography.bodyStrong, { color: t.colors.text, marginBottom: 6 }]}>Açıklama</Text>
        <Text style={[t.typography.body, { color: t.colors.textMuted }]}>{homework.description}</Text>
        {homework.dueDate ? (
          <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 10 }]}>
            Son tarih: {format(new Date(homework.dueDate), "yyyy-MM-dd")}
          </Text>
        ) : null}
      </Card>

      <SectionHeader title="Teslim" />
      {!canStudentSubmit ? (
        <Card>
          <Text style={[t.typography.body, { color: t.colors.textMuted }]}>
            {user?.role === "PARENT"
              ? "Teslim işlemi yalnızca öğrencinin kendi hesabından yapılabilir. Bu ekranda yalnızca durum görüntülenir."
              : "Bu ödev için teslim işlemi tamamlandı."}
          </Text>
        </Card>
      ) : submitted ? (
        <Card>
          <Text style={[t.typography.body, { color: t.colors.success }]}>Teslim gönderildi.</Text>
        </Card>
      ) : (
        <View style={{ gap: 12 }}>
          <TextField label="Not (opsiyonel)" value={note} onChangeText={setNote} placeholder="Öğretmene not ekleyin" multiline numberOfLines={3} />
          {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
          <Button label="Teslim et" onPress={onSubmit} loading={busy} />
        </View>
      )}
    </Screen>
  );
}
