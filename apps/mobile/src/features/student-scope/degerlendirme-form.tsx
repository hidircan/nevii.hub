import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { apiPost } from "../../api/client";
import { useAuth } from "../../auth/auth-context";
import { AppHeader, Button, Card, EmptyState, ErrorState, Icon, LoadingSkeleton, Screen, ScoreSelector, TextField } from "../../components/ui";
import { useApiGet } from "../../hooks/use-api";
import { useTheme } from "../../theme/theme-context";

const CRITERIA: Array<{ key: string; label: string }> = [
  { key: "clarity", label: "Açıklık" },
  { key: "communication", label: "İletişim" },
  { key: "effectiveness", label: "Etkililik" },
  { key: "motivation", label: "Motivasyon" },
  { key: "punctuality", label: "Dakiklik" },
];

type ThisMonthResponse = { feedback: { id: string } | null };

/** Veli/öğrenci → öğretmen değerlendirme formu — anonim, ayda bir kez. Her iki persona da paylaşır. */
export function DegerlendirmeFormScreen() {
  const t = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ teacherId: string; teacherName?: string }>();

  const alreadySubmitted = useApiGet<ThisMonthResponse>(
    user?.studentId && params.teacherId ? `/api/v1/teacher-feedback/this-month?studentId=${user.studentId}&teacherId=${params.teacherId}` : ""
  );

  const [scores, setScores] = useState<Record<string, number | null>>(Object.fromEntries(CRITERIA.map((c) => [c.key, null])));
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const allScored = CRITERIA.every((c) => scores[c.key] !== null);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const res = await apiPost("/api/v1/teacher-feedback", {
      studentId: user?.studentId,
      scores,
      comment: comment.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message || "Değerlendirme gönderilemedi.");
      return;
    }
    setDone(true);
  }

  if (alreadySubmitted.status === "loading") {
    return (
      <Screen>
        <AppHeader title="Değerlendirme" showBack showNotifications={false} />
        <LoadingSkeleton rows={3} />
      </Screen>
    );
  }

  if (alreadySubmitted.status === "success" && alreadySubmitted.data.feedback) {
    return (
      <Screen>
        <AppHeader title="Değerlendirme" showBack showNotifications={false} />
        <EmptyState icon="checkmark-circle-outline" title="Bu ay zaten değerlendirdiniz" description="Her öğretmen için ayda bir değerlendirme yapılabilir." />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen>
        <AppHeader title="Değerlendirme" showBack showNotifications={false} />
        <View style={{ alignItems: "center", paddingTop: 60 }}>
          <Text style={[t.typography.sectionTitle, { color: t.colors.success }]}>Teşekkürler</Text>
          <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 6, textAlign: "center" }]}>
            Değerlendirmeniz anonim olarak kaydedildi.
          </Text>
          <Button label="Kapat" onPress={() => router.back()} variant="secondary" fullWidth={false} style={{ marginTop: 16 }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title="Öğretmen değerlendirmesi" subtitle={params.teacherName} showBack showNotifications={false} />

      <Card style={{ marginBottom: 16, backgroundColor: t.colors.infoSoft }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Icon name="shield-checkmark-outline" size={16} color={t.colors.info} />
          <Text style={[t.typography.caption, { color: t.colors.info, flex: 1 }]}>
            Bu değerlendirme anonimdir — kimliğiniz öğretmenle paylaşılmaz.
          </Text>
        </View>
      </Card>

      <View style={{ gap: 20 }}>
        {CRITERIA.map((c) => (
          <ScoreSelector key={c.key} label={c.label} value={scores[c.key] ?? null} onChange={(v) => setScores((s) => ({ ...s, [c.key]: v }))} />
        ))}

        <TextField label="Yorum (opsiyonel)" value={comment} onChangeText={setComment} multiline numberOfLines={3} />

        {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
        {alreadySubmitted.status === "error" ? <ErrorState message={alreadySubmitted.message} onRetry={alreadySubmitted.refresh} /> : null}

        <Button label="Gönder" onPress={onSubmit} disabled={!allScored || busy} loading={busy} />
      </View>
    </Screen>
  );
}
