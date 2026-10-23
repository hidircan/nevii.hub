import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { apiPost } from "../../api/client";
import { AppHeader, Button, Card, EmptyState, ErrorState, Icon, LoadingSkeleton, Screen, ScoreSelector, TextField, AppText } from "../../components/ui";
import { useApiGet } from "../../hooks/use-api";
import { useSelectedStudentId } from "../../student/student-context";
import { useLocale } from "../../i18n/locale-context";
import { useTheme } from "../../theme/theme-context";
import { listFallback, usePersonaBasePath } from "../../lib/navigation";

const CRITERIA: Array<{ key: string; labelKey: string }> = [
  { key: "clarity", labelKey: "eval.critClarity" },
  { key: "communication", labelKey: "eval.critCommunication" },
  { key: "effectiveness", labelKey: "eval.critEffectiveness" },
  { key: "motivation", labelKey: "eval.critMotivation" },
  { key: "punctuality", labelKey: "eval.critPunctuality" },
];

type ThisMonthResponse = { feedback: { id: string } | null };

/** Veli/öğrenci → öğretmen değerlendirme formu — anonim, ayda bir kez. Her iki persona da paylaşır. */
export function DegerlendirmeFormScreen() {
  const t = useTheme();
  const { t: tr } = useLocale();
  const base = usePersonaBasePath();
  const router = useRouter();
  const params = useLocalSearchParams<{ teacherId: string; teacherName?: string }>();
  const studentId = useSelectedStudentId();

  const alreadySubmitted = useApiGet<ThisMonthResponse>(
    studentId && params.teacherId ? `/api/v1/teacher-feedback/this-month?studentId=${studentId}&teacherId=${params.teacherId}` : ""
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
      studentId,
      scores,
      comment: comment.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message || tr("eval.sendFailed"));
      return;
    }
    setDone(true);
  }

  if (alreadySubmitted.status === "loading") {
    return (
      <Screen>
        <AppHeader title={tr("eval.title")} showBack backFallback={listFallback(base, "gelisim")} showNotifications={false} />
        <LoadingSkeleton rows={3} />
      </Screen>
    );
  }

  if (alreadySubmitted.status === "success" && alreadySubmitted.data.feedback) {
    return (
      <Screen>
        <AppHeader title={tr("eval.title")} showBack backFallback={listFallback(base, "gelisim")} showNotifications={false} />
        <EmptyState icon="checkmark-circle-outline" title={tr("eval.alreadyTitle")} description={tr("eval.alreadyBody")} />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen>
        <AppHeader title={tr("eval.title")} showBack backFallback={listFallback(base, "gelisim")} showNotifications={false} />
        <View style={{ alignItems: "center", paddingTop: 60 }}>
          <AppText style={[t.typography.sectionTitle, { color: t.colors.success }]}>{tr("eval.thanks")}</AppText>
          <AppText style={[t.typography.body, { color: t.colors.textMuted, marginTop: 6, textAlign: "center" }]}>
            {tr("eval.thanksBody")}
          </AppText>
          <Button label={tr("eval.close")} onPress={() => router.back()} variant="secondary" fullWidth={false} style={{ marginTop: 16 }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title={tr("eval.teacherTitle")} subtitle={params.teacherName} showBack backFallback={listFallback(base, "gelisim")} showNotifications={false} />

      <Card style={{ marginBottom: 16, backgroundColor: t.colors.infoSoft }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Icon name="shield-checkmark-outline" size={16} color={t.colors.info} />
          <AppText style={[t.typography.caption, { color: t.colors.info, flex: 1 }]}>
            {tr("eval.anonHint")}
          </AppText>
        </View>
      </Card>

      <View style={{ gap: 20 }}>
        {CRITERIA.map((c) => (
          <ScoreSelector key={c.key} label={tr(c.labelKey)} value={scores[c.key] ?? null} onChange={(v) => setScores((s) => ({ ...s, [c.key]: v }))} />
        ))}

        <TextField label={tr("eval.commentLabel")} value={comment} onChangeText={setComment} multiline numberOfLines={3} />

        {error ? <AppText style={[t.typography.caption, { color: t.colors.danger }]}>{error}</AppText> : null}
        {alreadySubmitted.status === "error" ? <ErrorState message={alreadySubmitted.message} onRetry={alreadySubmitted.refresh} /> : null}

        <Button label={tr("common.send")} onPress={onSubmit} disabled={!allScored || busy} loading={busy} />
      </View>
    </Screen>
  );
}
