import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { apiPost } from "../../src/api/client";
import { useAuth } from "../../src/auth/auth-context";
import { AppHeader, Button, Screen, ScoreSelector, TextField } from "../../src/components/ui";
import { useApiGet } from "../../src/hooks/use-api";
import { useTheme } from "../../src/theme/theme-context";
import type { TeachersResponse } from "../../src/types/api";

const CRITERIA: Array<{ key: string; label: string }> = [
  { key: "teknikBecerisi", label: "Teknik beceri" },
  { key: "notaOkuma", label: "Nota okuma" },
  { key: "muzikalite", label: "Müzikalite" },
  { key: "ritimDuyusu", label: "Ritim duyusu" },
  { key: "calismaDuzeni", label: "Çalışma düzeni" },
  { key: "evOdeviTamamlama", label: "Ev ödevi tamamlama" },
  { key: "dersKatilimi", label: "Ders katılımı" },
  { key: "motivasyon", label: "Motivasyon" },
  { key: "genelIlerleme", label: "Genel ilerleme" },
  { key: "hedefeUlasma", label: "Hedefe ulaşma" },
];

/** Ders sonrası gelişim değerlendirmesi — TEACHER, herhangi bir sekmeden (kök seviyede) erişilebilir. */
export default function AssessmentScreen() {
  const t = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ lessonId: string; studentId?: string; studentName?: string }>();
  const teachers = useApiGet<TeachersResponse>("/api/v1/teachers");

  const [scores, setScores] = useState<Record<string, number | null>>(
    Object.fromEntries(CRITERIA.map((c) => [c.key, null]))
  );
  const [strengthNote, setStrengthNote] = useState("");
  const [improvementNote, setImprovementNote] = useState("");
  const [nextStepsNote, setNextStepsNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const teacherName =
    teachers.status === "success" ? teachers.data.teachers.find((tt) => tt.id === user?.teacherId)?.name ?? "" : "";

  const allScored = CRITERIA.every((c) => scores[c.key] !== null);
  const canSubmit = allScored && strengthNote.trim() && improvementNote.trim() && nextStepsNote.trim() && !busy;

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const res = await apiPost("/api/v1/assessments", {
      lessonId: params.lessonId,
      studentId: params.studentId,
      ...scores,
      strengthNote,
      improvementNote,
      nextStepsNote,
      teacherSignedName: teacherName || user?.email || "Öğretmen",
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message || "Değerlendirme kaydedilemedi.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Screen>
        <AppHeader title="Değerlendirme" showBack showNotifications={false} />
        <View style={styles.doneBox}>
          <Text style={[t.typography.sectionTitle, { color: t.colors.success }]}>Kaydedildi</Text>
          <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 6, textAlign: "center" }]}>
            Gelişim değerlendirmesi öğrenci kaydına eklendi.
          </Text>
          <Button label="Kapat" onPress={() => router.back()} variant="secondary" style={{ marginTop: 16 }} fullWidth={false} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title="Gelişim değerlendirmesi" subtitle={params.studentName} showBack showNotifications={false} />

      <View style={{ gap: 20 }}>
        {CRITERIA.map((c) => (
          <ScoreSelector key={c.key} label={c.label} value={scores[c.key] ?? null} onChange={(v) => setScores((s) => ({ ...s, [c.key]: v }))} />
        ))}

        <TextField label="Güçlü yönler" value={strengthNote} onChangeText={setStrengthNote} multiline numberOfLines={3} />
        <TextField label="Geliştirilmesi gerekenler" value={improvementNote} onChangeText={setImprovementNote} multiline numberOfLines={3} />
        <TextField label="Sonraki adımlar" value={nextStepsNote} onChangeText={setNextStepsNote} multiline numberOfLines={3} />

        {error ? <Text style={[t.typography.caption, { color: t.colors.danger }]}>{error}</Text> : null}

        <Button label="Değerlendirmeyi kaydet" onPress={onSubmit} disabled={!canSubmit} loading={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  doneBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
});
